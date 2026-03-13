import asyncio
import aiohttp
import json
import logging
import os
import time
import sys
from dotenv import load_dotenv
import traceback
import sys
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except:
        pass

import database as db

# Configuration
load_dotenv()
MARKET_URL = "https://api.marketapp.ws/v1"
TOKENS = [
    t for t in [
        os.getenv("MARKETAPP_TOKEN_GENERAL_1"),
        os.getenv("MARKETAPP_TOKEN_GENERAL_2")
    ] if t
]
if not TOKENS:
    TOKENS = ["193541-57afc271119790fc3a4a0e7eb00f7071-1768332974"]

SYNC_INTERVAL = 30  # Seconds
LOG_FORMAT = "%(asctime)s [%(levelname)s] %(message)s"
logging.basicConfig(level=logging.INFO, format=LOG_FORMAT)

def get_token():
    import random
    return random.choice(TOKENS)

async def fetch_api(session, endpoint, params=None):
    headers = {"Authorization": get_token()}
    try:
        async with session.get(f"{MARKET_URL}{endpoint}", headers=headers, params=params, timeout=15) as r:
            if r.status == 200:
                return await r.json()
            elif r.status == 429:
                logging.warning(f"Rate limited! Waiting 5s... ({endpoint})")
                await asyncio.sleep(5)
                return await fetch_api(session, endpoint, params)
            else:
                logging.error(f"API Error {r.status} on {endpoint}")
                return None
    except Exception as e:
        logging.error(f"Request Exception: {e}")
        return None

async def fetch_nft_details(session, addr, item_type):
    if item_type != 'gifts':
        return ""
    
    details = await fetch_api(session, f"/nfts/{addr}/")
    if details:
        # Create a lowercase mapping for robust attribute lookup
        raw_attrs = details.get("attributes", [])
        attrs = {str(a.get('trait_type', '')).lower(): a.get('value') for a in raw_attrs}
        
        # Helper to find attribute by multiple possible keys (synonyms)
        def get_attr(keys, default="Unknown"):
            for k in keys:
                if k.lower() in attrs:
                    return attrs[k.lower()]
            return default

        col_name = details.get("collection_name") or get_attr(["Model", "Модель"]) or "Gifts"
        
        # Try to generate Fragment URL if API didn't return one
        image_url = details.get("image_url") or details.get("preview_url")
        if not image_url and " #" in details.get("name", ""):
            import re
            try:
                full_name = details.get("name", "")
                name_part, num_part = full_name.rsplit(" #", 1)
                slug = re.sub(r'[^a-z0-9]', '', name_part.lower())
                image_url = f"https://nft.fragment.com/gift/{slug}-{num_part}.webp"
            except Exception as e:
                logging.error(f"Failed to generate Fragment URL for {details.get('name')}: {e}")
                image_url = "https://nft.fragment.com/guide/gift.svg"

        meta_obj = {
            "image": image_url,
            "video": details.get("video_url") or details.get("animation_url"),
            "model": get_attr(["Model", "Модель"], col_name),
            "backdrop": get_attr(["Backdrop", "Background", "Фон"]),
            "symbol": get_attr(["Symbol", "Символ"]),
            "collection": col_name
        }
        return json.dumps(meta_obj, ensure_ascii=False)
    return ""

def get_basic_metadata(name, item_type):
    """Generates basic metadata (image, collection) from NFT name without API calls."""
    if item_type not in ['gift', 'gifts']:
        return ""
    
    import re
    # Fallback to defaults
    meta_obj = {
        "image": "https://nft.fragment.com/guide/gift.svg",
        "video": None,
        "model": "Unknown",
        "backdrop": "Unknown",
        "symbol": "Unknown",
        "collection": "Gifts"
    }
    
    if " #" in name:
        try:
            name_part, num_part = name.rsplit(" #", 1)
            # Fragment slug logic: remove special chars and lowercase
            slug = re.sub(r'[^a-z0-9]', '', name_part.lower())
            
            meta_obj["image"] = f"https://nft.fragment.com/gift/{slug}-{num_part}.webp"
            meta_obj["collection"] = name_part
            meta_obj["model"] = name_part
            # Backdrop and symbol remain Unknown as they need API, 
            # but at least we have the correct image and model name.
        except:
            pass
            
    return json.dumps(meta_obj, ensure_ascii=False)

def calculate_markup(price_ton):
    """
    Applies markup based on the table:
    0.01 - 0.10  => +0.05
    0.11 - 0.25  => +0.10
    0.26 - 0.50  => +0.15
    0.51 - 1.00  => +0.25
    1.01 - 2.50  => +0.45
    2.51 - 5.00  => +0.75
    5.01+        => +1.00
    """
    if price_ton <= 0.10:
        markup = 0.05
    elif price_ton <= 0.25:
        markup = 0.10
    elif price_ton <= 0.50:
        markup = 0.15
    elif price_ton <= 1.00:
        markup = 0.25
    elif price_ton <= 2.50:
        markup = 0.45
    elif price_ton <= 5.00:
        markup = 0.75
    else:
        markup = 1.00
        
    return price_ton + markup

async def sync_token_page(session, item_type, cursor=None):
    """
    Fetches ONE page (approx 100 items) for item_type using metadata batching.
    Returns: (next_cursor, fetched_count)
    """
    # logging.info(f"--- [ {item_type.upper()} ] Syncing page (cursor={cursor}) ---")
    
    endpoint = f"/rent/{item_type}/"
    params = {"cursor": cursor} if cursor else {}
    
    data = await fetch_api(session, endpoint, params)
    if not data or 'items' not in data:
        logging.error(f"Failed to fetch {item_type}")
        return None, 0

    items = data['items']
    count = len(items)
    if count == 0:
        return None, 0
        
    # logging.info(f"Fetched {count} items for {item_type}. Processing...")

    # Process items in batches to avoid overwhelming the API/DB
    batch_size = 10
    total_processed = 0
    
    for i in range(0, count, batch_size):
        batch = items[i:i + batch_size]
        
        # Sync to DB in batches
        try:
            async with db.aiosqlite.connect(db.DB_PATH, timeout=60.0) as conn:
                await conn.execute("PRAGMA journal_mode=WAL")
                await conn.execute("PRAGMA synchronous=NORMAL")
                tasks = []
                for it in batch:
                    addr = it['nft_address']
                    db_type = 'gift' if item_type == 'gifts' else 'number' if item_type == 'numbers' else 'username'
                    tasks.append(fetch_nft_details(session, addr, db_type))
                
                # Execute metadata fetches in parallel
                metadata_results = await asyncio.gather(*tasks)
                
                for idx, it in enumerate(batch):
                    addr = it['nft_address']
                    name = it['nft_name']
                    status_raw = it.get('status', 'available')
                    status_db = 'rented' if status_raw == 'rented' else 'available'
                    status_details = it.get('status_details', {})
                    min_d = it.get('min_duration', 86400)
                    max_d = it.get('max_duration', 2592000)
                    db_type = 'gift' if item_type == 'gifts' else 'number' if item_type == 'numbers' else 'username'
                    raw_price_ton = float(it.get('price_per_day', 0)) / 1e9
                    if raw_price_ton <= 0:
                        raw_price_ton = float(status_details.get('price_per_day', 0)) / 1e9
                    marked_ppd = calculate_markup(raw_price_ton) if raw_price_ton > 0 else None
                    original_price_to_save = raw_price_ton if raw_price_ton > 0 else None
                    rent_ends_at = status_details.get('end_time') or it.get('end_time')
                    
                    # Use fetched metadata if available, otherwise fallback to basic
                    meta = metadata_results[idx]
                    if not meta:
                        meta = get_basic_metadata(name, db_type)
                    
                    await db.sync_item(
                        nft_address=addr,
                        item_type=db_type,
                        title=name,
                        original_price=original_price_to_save,
                        price_per_day=marked_ppd,
                        min_duration=min_d,
                        max_duration=max_d,
                        metadata=meta,
                        status=status_db,
                        rent_ends_at=rent_ends_at,
                        auto_relist=it.get('auto_relist', 1),
                        conn=conn
                    )
                await conn.commit()
        except Exception as e:
            logging.error(f"Batch sync error: {e}")
        
        total_processed += len(batch)
        if i + batch_size < count:
            await asyncio.sleep(0.1)
            
    next_cursor = data.get('cursor') or data.get('next_cursor')
    return next_cursor, total_processed

async def sync_my_rented(session):
    """Fetches items rented by the bot to track end_time and status"""
    # logging.info("--- [ MY RENTED ] Syncing items ---")
    
    endpoint = "/rent/my-rented/"
    data = await fetch_api(session, endpoint)
    
    if not data or 'items' not in data:
        logging.error("Failed to fetch my-rented items")
        return
        
    items = data['items']
    logging.info(f"Found {len(items)} items rented by us.")
    
    for it in items:
        addr = it['nft_address']
        name = it['nft_name']
        end_time = it.get('end_time') # unix timestamp
        
        # We don't have item_type here, so we try to find it in DB first
        existing = await db.get_item_by_id_addr(addr)
        db_type = existing['type'] if existing else 'gift' # Fallback
        
        raw_ppd = float(it['price_per_day']) / 1e9
        marked_ppd = calculate_markup(raw_ppd)
        
        await db.sync_item(
            nft_address=addr,
            item_type=db_type,
            title=name,
            original_price=raw_ppd,
            price_per_day=marked_ppd,
            status='rented',
            rent_ends_at=end_time,
            auto_relist=it.get('auto_relist', 1)
        )

async def discover_rented_items(session, cycle_start_str):
    """Checks items that were 'available' but not updated in this cycle"""
    # logging.info(f"--- [ DISCOVERY ] Checking missing items (since {cycle_start_str}) ---")
    
    async with db.aiosqlite.connect(db.DB_PATH) as conn:
        conn.row_factory = db.aiosqlite.Row
        # Items that are marked available but weren't touched this cycle
        async with conn.execute(
            "SELECT * FROM items WHERE status = 'available' AND last_updated < ?", 
            (cycle_start_str,)
        ) as cursor:
            missing = await cursor.fetchall()
            
    if not missing:
        logging.info("No missing items to check.")
        return

    # logging.info(f"Found {len(missing)} items missing from available list. Checking status...")
    
    for it in missing:
        addr = it['nft_address']
        details = await fetch_api(session, f"/nfts/{addr}/")
        
        if not details:
            continue
            
        status = details.get("status")
        # logging.info(f"Item {it['title']} ({addr[:8]}) status: {status}")
        
        if status == 'rented':
            end_time = details.get("status_details", {}).get("end_time")
            await db.sync_item(
                nft_address=addr,
                item_type=it['type'],
                title=it['title'],
                status='rented',
                rent_ends_at=end_time,
                auto_relist=details.get('auto_relist', 1)
            )
        elif status in ['not_for_sale', 'expired']:
            await db.sync_item(
                nft_address=addr,
                item_type=it['type'],
                title=it['title'],
                status='awaiting_relist'
            )
        # If it's somehow 'for_rent' but we missed it in sync, it will be found in next cycle
        await asyncio.sleep(0.5) # throttle

async def update_filters_cache(session):
    """Rebuild the static filters cache using MarketApp API for full attribute data"""
    logging.info("Updating filters cache from MarketApp API...")
    try:
        # 1. Get all gift collections
        collections_data = await fetch_api(session, "/collections/gifts/")
        if not collections_data:
            logging.error("Failed to fetch gift collections")
            return
        
        collections = []
        models_map = {}
        all_backdrops = set()
        all_symbols = set()
        
        logging.info(f"Found {len(collections_data)} gift collections, fetching attributes...")
        
        # 2. For each collection, fetch attributes
        for idx, col in enumerate(collections_data):
            col_name = col.get("name")
            col_address = col.get("address")
            
            if not col_name or not col_address:
                continue
            
            collections.append(col_name)
            
            # Fetch attributes for this collection
            attrs_data = await fetch_api(session, f"/collections/{col_address}/attributes/")
            if not attrs_data or "attributes" not in attrs_data:
                logging.warning(f"No attributes for {col_name}")
                continue
            
            collection_models = []
            
            # Parse attributes
            for attr in attrs_data["attributes"]:
                trait_type = attr.get("trait_type")
                values = attr.get("values", [])
                
                if trait_type == "Model":
                    # Add all model values for this collection
                    collection_models.extend([v["value"] for v in values if "value" in v])
                
                elif trait_type == "Backdrop":
                    # Collect all unique backdrops across collections
                    all_backdrops.update([v["value"] for v in values if "value" in v])
                
                elif trait_type == "Symbol":
                    # Collect all unique symbols across collections
                    all_symbols.update([v["value"] for v in values if "value" in v])
            
            if collection_models:
                models_map[col_name] = sorted(collection_models)
            
            # Progress log every 100 collections
            if (idx + 1) % 100 == 0:
                logging.info(f"Processed {idx + 1}/{len(collections_data)} collections...")
            
            # Small delay to avoid rate limiting
            await asyncio.sleep(0.1)
        
        # 3. Build final cache structure
        cache = {
            "nfts": sorted(collections),
            "models_map": models_map,
            "backdrops": sorted(list(all_backdrops)),
            "symbols": sorted(list(all_symbols))
        }
        
        # 4. Save to file
        with open("filters_cache.json", "w", encoding="utf-8") as f:
            json.dump(cache, f, ensure_ascii=False, indent=2)
        
        total_models = sum(len(m) for m in models_map.values())
        logging.info(f"✅ Filters cache updated: {len(collections)} collections, {total_models} models, {len(all_backdrops)} backdrops, {len(all_symbols)} symbols")
    
    except Exception as e:
        logging.error(f"Filters cache update failed: {e}")
        import traceback
        traceback.print_exc()



async def main_loop():
    await db.init_db()
    
    # 12 seconds interval for real-time checks
    REALTIME_INTERVAL = 12 
    
    logging.info(f"--- STARTING REAL-TIME MONITOR (Interval: {REALTIME_INTERVAL}s) ---")
    logging.info("Deep sync history is handled by force_sync.py manually.")
    
    async with aiohttp.ClientSession() as session:
        while True:
            cycle_start_time = time.time()
            cycle_start_str = time.strftime('%Y-%m-%d %H:%M:%S', time.gmtime(cycle_start_time))
            
            try:
                # 1. Full Sync for all categories (passing cursor to fetch ALL pages)
                for cat in ["gifts", "usernames", "numbers"]:
                    current_cursor = None
                    total_cat_synced = 0
                    while True:
                        next_cursor, count = await sync_token_page(session, cat, cursor=current_cursor)
                        total_cat_synced += count
                        if not next_cursor or count == 0:
                            break
                        current_cursor = next_cursor
                        await asyncio.sleep(0.2) # Throttle between pages
                    
                    if total_cat_synced > 0:
                        logging.info(f"Done syncing {cat}: {total_cat_synced} items total.")

                # 2. Sync OUR rented items (to update timers/status locally)
                await sync_my_rented(session)
                
                # 3. Discover globally rented items (to mark them as rented in DB if we missed the transition)
                # We only check recent history for this in the parser
                await discover_rented_items(session, cycle_start_str)
                
                await update_filters_cache(session)
                
                # elapsed = time.time() - cycle_start_time
                # logging.info(f"Real-time check complete ({elapsed:.2f}s). Sleeping...")
                pass
                
            except Exception as e:
                logging.error(f"Monitor error: {e}")
            
            # Smart sleep to maintain interval
            elapsed = time.time() - cycle_start_time
            sleep_time = max(1.0, REALTIME_INTERVAL - elapsed)
            await asyncio.sleep(sleep_time)

if __name__ == "__main__":
    try:
        asyncio.run(main_loop())
    except KeyboardInterrupt:
        logging.info("Parser stopped.")

