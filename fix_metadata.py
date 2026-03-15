"""
fix_metadata.py — массовый дофетч backdrop/symbol для NFT без детальных метаданных.
Запуск: python3 fix_metadata.py
"""
import asyncio
import aiohttp
import aiosqlite
import json
import logging
import os
import random
import time
from dotenv import load_dotenv

load_dotenv()

DB_PATH = os.path.join(os.path.dirname(__file__), "database.db")
MARKET_URL = "https://api.marketapp.ws/v1"

TOKENS = [t for t in [
    os.getenv("MARKETAPP_TOKEN_GENERAL_1"),
    os.getenv("MARKETAPP_TOKEN_GENERAL_2"),
] if t]
if not TOKENS:
    TOKENS = ["968871-39540cc5e069c1e4a0c482e9faec2de8-1769539898"]

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s"
)

def get_token():
    return random.choice(TOKENS)

async def fetch_nft_details(session, addr, retries=3):
    """Fetch full NFT metadata including backdrop and symbol."""
    for attempt in range(retries):
        try:
            headers = {"Authorization": get_token()}
            async with session.get(
                f"{MARKET_URL}/nfts/{addr}/",
                headers=headers,
                timeout=aiohttp.ClientTimeout(total=15)
            ) as r:
                if r.status == 200:
                    return await r.json()
                elif r.status == 429:
                    wait = 5 * (attempt + 1)
                    logging.warning(f"Rate limited, waiting {wait}s...")
                    await asyncio.sleep(wait)
                elif r.status == 404:
                    return None  # NFT not found, skip
                else:
                    logging.warning(f"HTTP {r.status} for {addr}")
        except asyncio.TimeoutError:
            logging.warning(f"Timeout for {addr} (attempt {attempt+1})")
        except Exception as e:
            logging.warning(f"Error for {addr}: {e}")
        if attempt < retries - 1:
            await asyncio.sleep(1)
    return None

def parse_metadata(details, existing_meta_str):
    """Build full metadata dict from NFT details API response."""
    raw_attrs = details.get("attributes", [])
    attrs = {str(a.get("trait_type", "")).lower(): a.get("value") for a in raw_attrs}

    def get_attr(keys, default="Unknown"):
        for k in keys:
            if k.lower() in attrs:
                return attrs[k.lower()]
        return default

    # Try to preserve existing good image if API returns nothing
    existing_image = None
    if existing_meta_str:
        try:
            old = json.loads(existing_meta_str)
            existing_image = old.get("image")
        except:
            pass

    col_name = details.get("collection_name") or get_attr(["Model", "Модель"]) or "Gifts"
    image_url = details.get("image_url") or details.get("preview_url") or existing_image

    # Build Fragment URL if still missing
    if not image_url and " #" in details.get("name", ""):
        import re
        try:
            full_name = details.get("name", "")
            name_part, num_part = full_name.rsplit(" #", 1)
            slug = re.sub(r'[^a-z0-9]', '', name_part.lower())
            image_url = f"https://nft.fragment.com/gift/{slug}-{num_part}.webp"
        except:
            pass

    return {
        "image": image_url,
        "video": details.get("video_url") or details.get("animation_url"),
        "model": get_attr(["Model", "Модель"], col_name),
        "backdrop": get_attr(["Backdrop", "Background", "Фон"]),
        "symbol": get_attr(["Symbol", "Символ"]),
        "collection": col_name
    }

async def main():
    start_time = time.time()

    # Get all items missing backdrop or symbol
    async with aiosqlite.connect(DB_PATH, timeout=30) as db:
        db.row_factory = aiosqlite.Row
        await db.execute("PRAGMA journal_mode=WAL")
        async with db.execute("""
            SELECT id, nft_address, title, metadata FROM items
            WHERE type = 'gift'
            AND status = 'available'
            AND (
                metadata NOT LIKE '%"backdrop":%'
                OR metadata NOT LIKE '%"symbol":%'
            )
        """) as cursor:
            rows = await cursor.fetchall()

    total = len(rows)
    logging.info(f"Found {total} items to fix. Starting...")

    if total == 0:
        logging.info("Nothing to fix!")
        return

    fixed = 0
    failed = 0
    skipped = 0

    # Process in batches of 5 concurrent requests
    BATCH_SIZE = 5
    DELAY_BETWEEN_BATCHES = 0.5  # seconds

    connector = aiohttp.TCPConnector(limit=10)
    async with aiohttp.ClientSession(connector=connector) as session:
        for batch_start in range(0, total, BATCH_SIZE):
            batch = rows[batch_start:batch_start + BATCH_SIZE]

            # Fetch details for batch concurrently
            tasks = [fetch_nft_details(session, row["nft_address"]) for row in batch]
            results = await asyncio.gather(*tasks)

            # Update DB with results
            async with aiosqlite.connect(DB_PATH, timeout=60) as db:
                await db.execute("PRAGMA journal_mode=WAL")
                await db.execute("PRAGMA synchronous=NORMAL")

                for row, details in zip(batch, results):
                    if details is None:
                        failed += 1
                        continue

                    attrs = {str(a.get("trait_type", "")).lower(): a.get("value")
                             for a in details.get("attributes", [])}

                    # Check if we actually got backdrop/symbol
                    backdrop = attrs.get("backdrop") or attrs.get("background") or attrs.get("фон")
                    symbol = attrs.get("symbol") or attrs.get("символ")

                    if not backdrop and not symbol:
                        # API returned details but no attributes — skip to avoid overwriting
                        skipped += 1
                        continue

                    meta_obj = parse_metadata(details, row["metadata"])
                    meta_str = json.dumps(meta_obj, ensure_ascii=False)

                    await db.execute(
                        "UPDATE items SET metadata = ? WHERE id = ?",
                        (meta_str, row["id"])
                    )
                    fixed += 1

                await db.commit()

            elapsed = time.time() - start_time
            done = batch_start + len(batch)
            pct = (done / total) * 100
            rate = done / elapsed if elapsed > 0 else 0
            eta = (total - done) / rate if rate > 0 else 0

            logging.info(
                f"Progress: {done}/{total} ({pct:.1f}%) | "
                f"Fixed: {fixed} | Failed: {failed} | Skipped: {skipped} | "
                f"ETA: {eta/60:.1f} min"
            )

            await asyncio.sleep(DELAY_BETWEEN_BATCHES)

    elapsed = time.time() - start_time
    logging.info(
        f"\n=== DONE in {elapsed/60:.1f} min ===\n"
        f"  Fixed:   {fixed}\n"
        f"  Failed:  {failed}\n"
        f"  Skipped: {skipped}\n"
        f"  Total:   {total}"
    )

    # Final count check
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute("""
            SELECT COUNT(*) FROM items
            WHERE type='gift' AND status='available'
            AND metadata LIKE '%"backdrop":%'
            AND metadata LIKE '%"symbol":%'
            AND metadata NOT LIKE '%"model": "Unknown"%'
        """) as cursor:
            row = await cursor.fetchone()
            logging.info(f"Now visible in catalog: {row[0]}")

if __name__ == "__main__":
    asyncio.run(main())
