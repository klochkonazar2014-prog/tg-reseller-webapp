import asyncio
import aiohttp
import json
import sqlite3
import os
import logging
import re
from dotenv import load_dotenv

load_dotenv()

# --- CONFIGURATION (Change if different on server) ---
DB_PATH = "database.db" # Relative to your project root
TOKEN = os.getenv("MARKETAPP_TOKEN_GENERAL_1") or "968871-39540cc5e069c1e4a0c482e9faec2de8-1769539898"
# ----------------------------------------------------

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
MARKET_URL = "https://api.marketapp.ws/v1"

async def fetch_api(session, endpoint):
    headers = {"Authorization": TOKEN}
    try:
        async with session.get(f"{MARKET_URL}{endpoint}", headers=headers, timeout=15) as r:
            if r.status == 200: return await r.json()
            return None
    except: return None

async def repair_database():
    if not os.path.exists(DB_PATH):
        logging.error(f"Database {DB_PATH} not found! Run from project root.")
        return

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    # Targeting items with "Unknown" or missing keys in JSON string
    cursor.execute("""
        SELECT nft_address, title, metadata FROM items 
        WHERE type = 'gift' 
        AND (
            metadata LIKE '%"Unknown"%' 
            OR metadata NOT LIKE '%"symbol"%' 
            OR metadata NOT LIKE '%"backdrop"%'
            OR metadata IS NULL 
            OR metadata = ''
        )
    """)
    rows = cursor.fetchall()
    logging.info(f"Targeting {len(rows)} items for repair on server.")
    
    if not rows:
        logging.info("Nothing to repair. Database looks clean!")
        conn.close()
        return

    async with aiohttp.ClientSession() as session:
        for i, row in enumerate(rows):
            addr = row['nft_address']
            title = row['title']
            
            logging.info(f"[{i+1}/{len(rows)}] Reparing {title}...")
            
            details = await fetch_api(session, f"/nfts/{addr}/")
            if not details:
                logging.warning(f"  API failed for {title}")
                continue
                
            raw_attrs = details.get("attributes", [])
            attrs = {str(a.get('trait_type', '')).lower(): a.get('value') for a in raw_attrs}
            
            def get_attr(keys, default="Unknown"):
                for k in keys:
                    if k.lower() in attrs: return attrs[k.lower()]
                return default

            col_name = details.get("collection_name") or get_attr(["Model", "Модель"]) or "Gifts"
            image_url = details.get("image_url") or details.get("preview_url")
            
            if not image_url and " #" in title:
                try:
                    name_part, num_part = title.rsplit(" #", 1)
                    slug = re.sub(r'[^a-z0-9]', '', name_part.lower())
                    image_url = f"https://nft.fragment.com/gift/{slug}-{num_part}.webp"
                except: image_url = "https://nft.fragment.com/guide/gift.svg"

            meta_obj = {
                "image": image_url,
                "video": details.get("video_url") or details.get("animation_url"),
                "model": get_attr(["Model", "Модель"], col_name),
                "backdrop": get_attr(["Backdrop", "Background", "Фон"]),
                "symbol": get_attr(["Symbol", "Символ"]),
                "collection": col_name
            }
            
            meta_json = json.dumps(meta_obj, ensure_ascii=False)
            conn.execute("UPDATE items SET metadata = ?, last_updated = CURRENT_TIMESTAMP WHERE nft_address = ?", (meta_json, addr))
            
            # Commit every 10 items to prevent lock/data loss
            if i % 10 == 0: conn.commit()
            
            await asyncio.sleep(0.05) 

    conn.commit()
    conn.close()
    logging.info("SERVER REPAIR FINISHED.")

if __name__ == "__main__":
    asyncio.run(repair_database())
