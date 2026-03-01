import asyncio
import aiohttp
import json
import logging
import os
import sys
import time
from dotenv import load_dotenv
import sys
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except:
        pass

import database as db
import aiosqlite
import binascii
from tonutils.client import ToncenterV2Client
from tonutils.wallet import WalletV4R2, WalletV5R1
from tonutils.utils import begin_cell

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

LOG_FORMAT = "%(asctime)s [%(levelname)s] %(message)s"
logging.basicConfig(level=logging.INFO, format=LOG_FORMAT)
STATE_FILE = "background_state.json"
SYNC_INTERVAL = 3600  # 1 hour sleep after full sync

OWNER_SEED = os.getenv("OWNER_SEED")
OWNER_HEX_KEY = os.getenv("OWNER_HEX_KEY")
OWNER_WALLET_ADDR = os.getenv("OWNER_WALLET")
TONCENTER_API_KEY = os.getenv("TONCENTER_API_KEY")

def get_token():
    import random
    return random.choice(TOKENS)

def save_state(cursors, total_synced):
    with open(STATE_FILE, 'w') as f:
        json.dump({'cursors': cursors, 'total_synced': total_synced}, f)

def load_state():
    if os.path.exists(STATE_FILE):
        try:
            with open(STATE_FILE, 'r') as f:
                return json.load(f)
        except: pass
    return {'cursors': {'gifts': 'START', 'usernames': 'START', 'numbers': 'START'}, 'total_synced': 0}

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

def calculate_markup(price_ton):
    if price_ton <= 0.10: markup = 0.05
    elif price_ton <= 0.25: markup = 0.10
    elif price_ton <= 0.50: markup = 0.15
    elif price_ton <= 1.00: markup = 0.25
    elif price_ton <= 2.50: markup = 0.45
    elif price_ton <= 5.00: markup = 0.75
    else: markup = 1.00
    return price_ton + markup

async def fetch_nft_details(session, addr, item_type):
    if item_type != 'gifts': return ""
    details = await fetch_api(session, f"/nfts/{addr}/")
    if details:
        attrs = {a['trait_type']: a['value'] for a in details.get("attributes", [])}
        col_name = details.get("collection_name") or attrs.get("Model") or "Gifts"
        image_url = details.get("image_url") or details.get("preview_url")
        if not image_url and " #" in details.get("name", ""):
            import re
            try:
                full_name = details.get("name", "")
                name_part, num_part = full_name.rsplit(" #", 1)
                slug = re.sub(r'[^a-z0-9]', '', name_part.lower())
                image_url = f"https://nft.fragment.com/gift/{slug}-{num_part}.webp"
            except: pass
            if not image_url: image_url = "https://nft.fragment.com/guide/gift.svg"

        meta_obj = {
            "image": image_url,
            "video": details.get("video_url") or details.get("animation_url"),
            "model": attrs.get("Model", col_name),
            "backdrop": attrs.get("Backdrop", "Unknown"),
            "collection": col_name
        }
        return json.dumps(meta_obj)
    return ""

async def sync_token_page_aggressive(session, item_type, cursor=None):
    endpoint = f"/rent/{item_type}/"
    params = {"cursor": cursor} if cursor else {}
    
    data = await fetch_api(session, endpoint, params)
    if not data or 'items' not in data:
        return None, 0

    items = data['items']
    count = len(items)
    if count == 0: return None, 0

    batch_size = 20
    # Duplicate check to save speed
    addresses = [it['nft_address'] for it in items]
    
    async with aiosqlite.connect(db.DB_PATH, timeout=60.0) as conn:
        placeholders = ','.join('?' for _ in addresses)
        async with conn.execute(f"SELECT nft_address FROM items WHERE nft_address IN ({placeholders})", addresses) as cursor:
            existing_rows = await cursor.fetchall()
            existing_addrs = {row[0] for row in existing_rows}
            
    tasks = []
    for it in items:
        if it['nft_address'] not in existing_addrs:
             tasks.append(fetch_nft_details(session, it['nft_address'], item_type))
        else:
             tasks.append(asyncio.create_task(asyncio.sleep(0))) # Dummy

    results = await asyncio.gather(*tasks)
    
    for i, it in enumerate(items):
        addr = it['nft_address']
        meta = results[i] 
        
        raw_ppd = float(it['price_per_day']) / 1e9
        marked_ppd = calculate_markup(raw_ppd)
        db_type = 'gift' if item_type == 'gifts' else 'number' if item_type == 'numbers' else 'username'
        
        await db.sync_item(
            nft_address=addr,
            item_type=db_type,
            title=it['nft_name'],
            original_price=raw_ppd,
            price_per_day=marked_ppd,
            min_duration=it['min_duration'],
            max_duration=it['max_duration'],
            metadata=meta if meta and meta is not None else "", 
            auto_relist=it.get('auto_relist', 1)
        )

    await asyncio.sleep(0.1) # Be gentle in background
    return data.get('cursor'), count

async def refresh_all_rented_items(session):
    logging.info("[BG] Refreshing RENTED items statuses & timers...")
    async with db.aiosqlite.connect(db.DB_PATH, timeout=60.0) as conn:
        conn.row_factory = db.aiosqlite.Row
        async with conn.execute("SELECT * FROM items WHERE status = 'rented'") as cursor:
            rented = await cursor.fetchall()
    
    total = len(rented)
    if total == 0:
        return

    chunk_size = 10
    processed = 0
    
    for i in range(0, total, chunk_size):
        batch = rented[i:i+chunk_size]
        tasks = []
        for item in batch:
            tasks.append(fetch_api(session, f"/nfts/{item['nft_address']}/"))
        
        results = await asyncio.gather(*tasks)
        
        for item, details in zip(batch, results):
            if not details: continue
            status = details.get("status")
            end_time = details.get("status_details", {}).get("end_time")
            
            if status == 'rented' and end_time:
                await db.sync_item(
                     nft_address=item['nft_address'], 
                     item_type=item['type'], 
                     title=item['title'], 
                     status='rented', 
                     rent_ends_at=end_time
                )
            elif status == 'for_rent':
                await db.sync_item(
                     nft_address=item['nft_address'], 
                     item_type=item['type'], 
                     title=item['title'], 
                     status='available'
                )
            elif status == 'not_for_sale' or status == 'expired' or status == 'available': 
                # If API says available/not_for_sale/expired but not 'for_rent', it means it's not currently listed for rent
                await db.sync_item(
                     nft_address=item['nft_address'], 
                     item_type=item['type'], 
                     title=item['title'], 
                     status='awaiting_relist'
                )
        
        processed += len(batch)
        if processed % 100 == 0:
             logging.info(f"[BG] Verified {processed}/{total} rented items...")
        await asyncio.sleep(0.5)


async def run_history_sync(session):
    logging.info("[BG-History] Starting History Sync Loop")
    while True:
        state = load_state()
        cursors = state['cursors']
        total_synced = state['total_synced']
        
        for t in ['gifts', 'usernames', 'numbers']:
            if t not in cursors: cursors[t] = 'START'

        try:
            active_work = False
            for item_type in ['gifts', 'usernames', 'numbers']:
                if cursors[item_type] is None:
                    continue 

                active_work = True
                
                # Process one batch per type then yield to other types/tasks
                # We don't want to block the event loop for too long
                c_val = None if cursors[item_type] == "START" else cursors[item_type]
                
                try:
                    next_cursor, count = await sync_token_page_aggressive(session, item_type, c_val)
                    
                    cursors[item_type] = next_cursor
                    total_synced += count
                    save_state(cursors, total_synced)
                    
                    if count == 0 or next_cursor is None:
                        logging.info(f"[BG-History] Completed {item_type}!")
                        cursors[item_type] = None
                        save_state(cursors, total_synced)
                    else:
                        if total_synced % 500 == 0:
                            logging.info(f"[BG-History] Processed total {total_synced} items...")

                except Exception as e:
                    logging.error(f"[BG-History] Error fetching {item_type}: {e}")
                    await asyncio.sleep(5)
            
            if not active_work:
                logging.info(f"[BG-History] All history synced. Sleeping {SYNC_INTERVAL}s...")
                cursors = {'gifts': 'START', 'usernames': 'START', 'numbers': 'START'}
                save_state(cursors, total_synced)
                await asyncio.sleep(SYNC_INTERVAL)
            else:
                await asyncio.sleep(1) # Yield

        except Exception as e:
             logging.error(f"[BG-History] Critical Loop Error: {e}")
             await asyncio.sleep(60)

             await asyncio.sleep(60)

async def run_refund_worker():
    """Фоновая задача для возврата сдачи (0.14 TON) после окончания аренды"""
    logging.info("[BG-Refund] Starting Refund Worker...")
    
    client = ToncenterV2Client(base_url="https://toncenter.com", api_key=TONCENTER_API_KEY)
    
    # Инициализация кошелька — HEX ключ имеет приоритет над seed-фразой
    try:
        if OWNER_HEX_KEY:
            full_key = binascii.unhexlify(OWNER_HEX_KEY)
            if OWNER_WALLET_ADDR and not OWNER_WALLET_ADDR.startswith("UQA"):
                wallet = WalletV5R1(client, private_key=full_key[:32], public_key=full_key[32:], wallet_id=2147483409)
            else:
                # WalletV4R2 from hex key
                from tonutils.wallet import WalletV4R2 as _W4
                wallet = _W4(client, private_key=full_key[:32], public_key=full_key[32:])
        elif OWNER_SEED:
            seed_list = OWNER_SEED.strip().split()
            if OWNER_WALLET_ADDR and (OWNER_WALLET_ADDR.startswith("UQB") or OWNER_WALLET_ADDR.startswith("EQB")):
                wallet, _, _, _ = WalletV5R1.from_mnemonic(client, seed_list, wallet_id=2147483409)
            else:
                wallet, _, _, _ = WalletV4R2.from_mnemonic(client, seed_list)
        else:
            logging.error("[BG-Refund] No wallet credentials (OWNER_HEX_KEY or OWNER_SEED) found. Refund worker disabled.")
            return
    except Exception as e:
        logging.error(f"[BG-Refund] Wallet init failed: {e}")
        return

    while True:
        try:
            # Ищем заказы, которые перешли в статус 'expired' (или арендованный товар стал 'available'), 
            # где есть кошелек пользователя и нет хеша возврата.
            # Мы также сами будем помечать заказы как expired если видим что товар освободился.
            
            async with aiosqlite.connect(db.DB_PATH, timeout=60.0) as conn:
                conn.row_factory = aiosqlite.Row
                # 1. Сначала "дожимаем" статус заказов: если товар снова available, а последний заказ по нему 'active' или 'rented' -> mark expired
                query_check = """
                    SELECT o.id, o.nft_address 
                    FROM orders o
                    JOIN items i ON o.nft_address = i.nft_address
                    WHERE o.status IN ('rented', 'active') AND i.status = 'available'
                """
                async with conn.execute(query_check) as cursor:
                    to_expire = await cursor.fetchall()
                
                for od in to_expire:
                    logging.info(f"[BG-Refund] Marking order #{od['id']} as expired because NFT {od['nft_address'][:8]} is available")
                    await conn.execute("UPDATE orders SET status = 'expired' WHERE id = ?", (od['id'],))
                await conn.commit()

                # 2. Теперь ищем тех, кому нужно вернуть сдачу по новому расписанию
                query_refund = "SELECT * FROM orders WHERE refund_status = 'pending' AND refund_scheduled_at <= strftime('%s', 'now') LIMIT 10"
                async with conn.execute(query_refund) as cursor:
                    pending_refunds = await cursor.fetchall()

            for order in pending_refunds:
                try:
                    user_id = order['user_id']
                    payment_gateway = order['payment_gateway'] if 'payment_gateway' in order.keys() else None
                    refund_amount = order['refund_amount'] if 'refund_amount' in order.keys() else 0.14
                    
                    if payment_gateway == 'xrocket':
                        # xRocket API transfer
                        XROCKET_KEY = os.getenv("XROCKET_API_KEY", "")
                        if not XROCKET_KEY:
                            logging.error("[BG-Refund] XROCKET_API_KEY is missing for refunding order #{order['id']}")
                            continue
                            
                        headers = {
                            "Rocket-Pay-Key": XROCKET_KEY,
                            "Content-Type": "application/json"
                        }
                        payload = {
                            "tgUserId": user_id,
                            "currency": "TONCOIN",
                            "amount": refund_amount,
                            "transferId": f"refund_o{order['id']}", 
                            "description": "Спасибо, что арендуете у нас! С любовью, OctoRent"
                        }
                        
                        url = "https://pay.ton-rocket.com/app/transfer"
                        async with aiohttp.ClientSession() as session:
                            async with session.post(url, headers=headers, json=payload, timeout=15) as r:
                                data = await r.json()
                                if data.get('success'):
                                    logging.info(f"[BG-Refund] xRocket refund {refund_amount} TON sent to {user_id} for #{order['id']}")
                                    async with aiosqlite.connect(db.DB_PATH) as c:
                                        await c.execute("UPDATE orders SET refund_status = 'processed' WHERE id = ?", (order['id'],))
                                        await c.commit()
                                else:
                                    logging.error(f"[BG-Refund] xRocket transfer failed for #{order['id']}: {data}")
                                    
                    elif payment_gateway == 'freekassa':
                        logging.info(f"[BG-Refund] Skipping Freekassa refund for order #{order['id']} (Pending decision)")
                        continue
                        
                    else:
                        # TonConnect (or generic crypto)
                        dest_wallet = order['user_wallet'] if 'user_wallet' in order.keys() else None
                        if not dest_wallet or dest_wallet == "Unknown":
                            logging.warning(f"[BG-Refund] No user_wallet found for order #{order['id']}, skipping TonConnect refund")
                            continue
                            
                        logging.info(f"[BG-Refund] Sending {refund_amount} TON refund to {dest_wallet} for order #{order['id']}")
                        
                        current_seqno = await wallet.get_seqno(client, wallet.address)
                        refund_memo = "Спасибо, что арендуете у нас! С любовью, OctoRent"
                        body_cell = begin_cell().store_uint(0, 32).store_string(refund_memo).end_cell()
                        
                        await wallet.transfer(
                            destination=dest_wallet,
                            amount=refund_amount,
                            body=body_cell,
                            seqno=current_seqno
                        )
                        
                        success = False
                        for _ in range(6):
                            await asyncio.sleep(10)
                            if await wallet.get_seqno(client, wallet.address) > current_seqno:
                                success = True
                                break
                        
                        if success:
                            async with aiosqlite.connect(db.DB_PATH) as c:
                                await c.execute("UPDATE orders SET refund_status = 'processed' WHERE id = ?", (order['id'],))
                                await c.commit()
                            logging.info(f"[BG-Refund] Crypto refund for #{order['id']} completed")
                        else:
                            logging.warning(f"[BG-Refund] Crypto refund for #{order['id']} sent but seqno didn't increase yet.")

                except Exception as ex:
                    logging.error(f"[BG-Refund] Error processing refund for order #{order['id']}: {ex}")
            
            # Polling interval is 15 minutes
            await asyncio.sleep(900)

            
        except Exception as e:
            logging.error(f"[BG-Refund] Global error: {e}")
            await asyncio.sleep(60)

async def main_loop():
    await db.init_db()
    logging.info("--- BACKGROUND WORKER STARTED (Parallel Mode) ---")
    
    async with aiohttp.ClientSession() as session:
        await asyncio.gather(
            run_history_sync(session),
            run_refund_worker() # Enabled to process delayed refunds automatically
        )


if __name__ == "__main__":
    asyncio.run(main_loop())
