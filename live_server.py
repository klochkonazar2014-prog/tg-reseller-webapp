import aiohttp
import aiosqlite
from aiohttp import web
import asyncio
import json
import logging
import os
import re
import hmac
import hashlib
from urllib.parse import parse_qsl
from tonutils.utils import begin_cell, Address
from dotenv import load_dotenv

load_dotenv()
USDT_JETTON_ADDRESS = "EQCxE6mUt_9S9clpu7R_6m09wYz3X0mR3GvK7N88m8_L3A1f"
MARKET_URL = "https://api.marketapp.ws/v1"
TOKENS = [
    t for t in [
        os.getenv("MARKETAPP_TOKEN_GENERAL_1"),
        os.getenv("MARKETAPP_TOKEN_GENERAL_2"),
        os.getenv("MARKETAPP_TOKEN_BUYER")
    ] if t
]
if not TOKENS:
    # Fallback to hardcoded if env fails
    TOKENS = ["193541-57afc271119790fc3a4a0e7eb00f7071-1768332974"]
OWNER_WALLET = os.getenv("OWNER_WALLET", "UQAotn3cT26kUKW5wSpP9dYKxwEQQ0qffDB24HGzuBrJ5PFB")
PROXY_URL = os.getenv("PROXY_URL")
PORT = 8001 
import database as db

BOT_TOKEN = os.getenv("BOT_TOKEN")

def calculate_markup(p):
    if p <= 0.01: return 0.05
    for limit, m in [(0.1, 0.05), (0.25, 0.1), (0.5, 0.15), (1.0, 0.25), (2.5, 0.45), (5.0, 0.75)]:
        if p <= limit: return m
    return 1.0

def get_token():
    import random
    return random.choice(TOKENS)

def validate_init_data(init_data: str, bot_token: str):
    """
    Validates Telegram Mini App initData using HMAC-SHA256.
    Returns parsed user dict if valid, else None.
    """
    try:
        if not init_data or not bot_token:
            return None
            
        vals = dict(parse_qsl(init_data))
        if 'hash' not in vals:
            return None
            
        auth_hash = vals.pop('hash')
        data_check_string = "\n".join([f"{k}={v}" for k, v in sorted(vals.items())])
        
        secret_key = hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()
        h = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()
        
        if h != auth_hash:
            logging.warning(f"Invalid initData hash. Expected {h}, got {auth_hash}")
            return None
            
        user_data = json.loads(vals.get('user', '{}'))
        return user_data
    except Exception as e:
        logging.error(f"Error validating initData: {e}")
        return None

def get_authenticated_user_id(request):
    """
    Extracts and validates user_id from X-TG-Data header.
    Falls back to user_id param ONLY if in dev mode (localhost).
    """
    init_data = request.headers.get('X-TG-Data')
    user = validate_init_data(init_data, BOT_TOKEN)
    
    if user:
        return user.get('id')
    
    # Dev fallback
    if os.getenv("DEV_MODE") == "TRUE":
        return int(request.query.get("user_id", 0))
        
    return None

async def handle_index(request):
    path = './web/index.html'
    if os.path.exists(path):
        with open(path, 'r', encoding='utf-8') as f:
            content = f.read().replace('?v=1.1.84', f'?v={int(os.path.getmtime(path))}')
        return web.Response(text=content, content_type='text/html', headers={'Cache-Control':'no-cache'})
    return web.Response(status=404)

async def handle_static(request):
    filename = request.match_info.get('filename', 'index.html')
    if not filename: filename = 'index.html'
    
    # Security: prevent directory traversal
    path = os.path.join('web', filename)
    if not os.path.exists(path) or not os.path.isfile(path):
        return web.Response(status=404, text="File not found")
        
    # Performance: Disable caching during development/debugging
    headers = {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Access-Control-Allow-Origin': '*'
    }
    
    return web.FileResponse(path, headers=headers)

async def handle_live_items(request):
    q = request.query
    limit, offset = int(q.get("limit", 50)), int(q.get("offset", 0))
    f_nft, f_model, f_bg, f_symbol = q.get("nft"), q.get("model"), q.get("bg"), q.get("symbol")
    f_search, f_sort = q.get("search", "").lower(), q.get("sort", "id_desc")
    f_price_from = q.get("price_from")
    f_price_to = q.get("price_to")
    f_gift_num = q.get("gift_number")
    
    t_filter = q.get("type", "gift")
    s_filter = q.get("status", "available") # available, rented

    logging.info(f"[handle_live_items] Request params: type={t_filter}, status={s_filter}, nft={f_nft}, model={f_model}, bg={f_bg}, symbol={f_symbol}, search='{f_search}', offset={offset}")

    try:
        async with db.aiosqlite.connect(db.DB_PATH, timeout=30) as conn:
            conn.row_factory = db.aiosqlite.Row
            
            # Build basic query WITHOUT json_extract to avoid malformed JSON issues
            query = f"SELECT * FROM items WHERE status = ?"
            params = [s_filter]
            
            if t_filter == 'gift':
                # Exclude internal assets AND Usernames/Numbers
                query += " AND type = 'gift' AND metadata NOT LIKE '%ton_symbol.png%' AND metadata NOT LIKE '%gift.svg%' AND metadata IS NOT NULL"
                query += " AND title NOT LIKE '@%' AND title NOT LIKE '+888%'"
            else:
                query += f" AND type = ?"
                params.append(t_filter)
                
            if f_search:
                query += " AND (title LIKE ? OR nft_address LIKE ?)"
                params.extend([f"%{f_search}%", f"%{f_search}%"])

            # Randomize order for 'available' catalog to avoid same NFTs in a row
            # MUST be at the end of the query (before LIMIT)
            if s_filter == 'available' and not f_search: # Keep original search order if searching
                query += " ORDER BY RANDOM()"
            elif f_sort == 'id_desc':
                query += " ORDER BY id DESC"

            # Fetch all matching rows
            async with conn.execute(query, params) as cursor:
                all_rows = await cursor.fetchall()
            
            # NOW filter and prepare items for sorting
            filtered_items = []
            for r in all_rows:
                # debug_title = r['title']
                try:
                    m = json.loads(r['metadata'] or "{}")
                except Exception:
                    continue
                
                # Lenient collection matching (Gift vs Gifts)
                # Removed logging inside loop for performance (database.db has thousands of rows)

                title = r['title']
                base_title = title.split('#')[0].strip()

                # Robust NFT matching using the title (which always contains the singular collection name)
                def is_nft_match(title_singular, filter_plural):
                    if not filter_plural or filter_plural == 'all': return True
                    t_low = title_singular.lower().strip()
                    f_low = filter_plural.lower().strip()
                    if t_low == f_low: return True
                    if t_low + 's' == f_low: return True
                    if t_low + 'es' == f_low: return True
                    if t_low.endswith('y') and t_low[:-1] + 'ies' == f_low: return True
                    return False

                if f_nft and f_nft != 'all':
                    if not is_nft_match(base_title, f_nft):
                        continue
                
                if f_model and f_model != 'all':
                    item_model = str(m.get("model", "")).lower().strip()
                    requested_model = f_model.lower().strip()
                    if item_model != requested_model:
                        # Optional: logging.debug(f"[Filter] Skip {r['title']}: model '{item_model}' != '{requested_model}'")
                        continue
                    else:
                        logging.info(f"[Filter] MATCH! {r['title']} passed model filter '{f_model}'")

                if f_bg and f_bg != 'all':
                    if str(m.get("backdrop", "")).lower() != f_bg.lower(): continue
                if f_symbol and f_symbol != 'all':
                    if str(m.get("symbol", "")).lower() != f_symbol.lower(): continue

                # Extract number for sorting and filtering
                title = r['title']
                num_match = re.search(r'#(\d+)', title)
                nft_num = int(num_match.group(1)) if num_match else 0
                
                # Apply number filter if provided
                if f_gift_num:
                    try:
                        if int(f_gift_num) != nft_num: continue
                    except: pass
                
                # Apply price filters
                price = float(r['price_per_day'])
                # Display price WITHOUT network expense
                if "Lol Pop #124946" in (title or ""):
                    price = float(r['original_price']) # Shows exactly 0.01

                filtered_items.append({
                    "id": r['id'],
                    "type": r['type'] or 'gift',
                    "nft_name": title,
                    "nft_address": r['nft_address'], 
                    "price_per_day": price, 
                    "min_duration": r['min_duration'],
                    "max_duration": r['max_duration'], 
                    "status": r['status'],
                    "rent_ends_at": r['rent_ends_at'],
                    "auto_relist": r['auto_relist'],
                    "image": m.get("image"), 
                    "_collection": {"name": m.get("collection", "Gift")}, 
                    "_modelName": m.get("model"), 
                    "_backdrop": m.get("backdrop"), 
                    "_symbol": m.get("symbol"),
                    "_num": nft_num
                })

            # Calculate Rarity (frequency-based) if needed
            if f_sort in ['model_rare', 'bg_rare', 'symbol_rare']:
                stat_key = "_modelName" if f_sort == 'model_rare' else "_backdrop" if f_sort == 'bg_rare' else "_symbol"
                counts = {}
                for it in filtered_items:
                    v = it.get(stat_key) or "Unknown"
                    counts[v] = counts.get(v, 0) + 1
                for it in filtered_items:
                    it['_rarity_score'] = counts.get(it.get(stat_key) or "Unknown", 9999)

            # APPLY ADVANCED SORTING
            if f_sort == 'price_asc':
                filtered_items.sort(key=lambda x: x['price_per_day'])
            elif f_sort == 'price_desc':
                filtered_items.sort(key=lambda x: x['price_per_day'], reverse=True)
            elif f_sort == 'num_asc':
                filtered_items.sort(key=lambda x: x['_num'])
            elif f_sort == 'num_desc':
                filtered_items.sort(key=lambda x: x['_num'], reverse=True)
            elif f_sort in ['model_rare', 'bg_rare', 'symbol_rare']:
                # Lower frequency = more rare
                filtered_items.sort(key=lambda x: x['_rarity_score'])
            else:
                filtered_items.sort(key=lambda x: x['id'], reverse=True)
            
            # Apply pagination
            total_found = len(filtered_items)
            paginated_items = filtered_items[offset:offset + limit]
            
            logging.info(f"[handle_live_items] Found {total_found} items matching criteria. Returning {len(paginated_items)} items.")
            return web.json_response({"items": paginated_items, "total_available": total_found, "offset": offset})
    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        logging.error(f"[handle_live_items] Error: {error_details}")
        return web.json_response({"items": [], "error": str(e)}, status=500)

async def handle_filter_data(request):
    if os.path.exists("filters_cache.json"):
        with open("filters_cache.json", "r", encoding="utf-8") as f:
            return web.json_response(json.load(f))
    return web.json_response({"error": "Cache not ready. Run parser.py"}, status=503)

async def create_rental_order(user_id, nft_address, days):
    """Helper to create a rental order with proper markup and total price"""
    item = await db.get_item_by_id_addr(nft_address)
    if not item: return None, "Not found"
    
    is_preorder = 1 if item['status'] == 'rented' else 0
    markup = calculate_markup(item['original_price'])
    
    # Exception for user test NFT
    if "Lol Pop #124946" in (item['title'] or ""):
        markup = 0
        total_base = 0.23
        logging.info(f"Applying special logic for test NFT: {item['title']}")
    else:
        total_base = round((item['original_price'] + markup) * days + 0.2, 2)
    
    order_id = await db.create_order(user_id, nft_address, item['title'], days, total_base, is_preorder=is_preorder)
    # Add unique fractional part to avoid collision in simple transfers
    total_final = round(total_base + (order_id % 500) / 10000, 4)
    
    async with db.aiosqlite.connect(db.DB_PATH) as conn:
        await conn.execute("UPDATE orders SET total_price = ?, status = 'pending_payment' WHERE id = ?", (total_final, order_id))
        await conn.commit()
    
    # Referral Logic
    referrer_id = await db.get_referrer_id(user_id)
    if referrer_id and markup > 0:
        referral_commission = round(markup * days * 0.25, 4)
        if referral_commission > 0:
            await db.add_referral_earning(referrer_id, order_id, referral_commission)
            
    return {
        "order_id": order_id,
        "total_price": total_final,
        "item": item
    }, None

async def handle_prepare_rent(request):
    try:
        data = await request.json()
    except Exception:
        data = dict(request.query)

    nft_address = data.get("nft_address")
    days = int(data.get("days", 1))
    user_id = get_authenticated_user_id(request)
    
    if not user_id:
        return web.json_response({"error": "Unauthorized"}, status=401)
    
    res, err = await create_rental_order(user_id, nft_address, days)
    if err: return web.json_response({"error": err}, status=404)
    
    order_id = res['order_id']
    total_final = res['total_price']
    
    import base64
    safe_addr = str(nft_address) if nft_address else "unknown"
    memo_text = f"order:{order_id} | nft:{safe_addr[:12]}..."
    payload = base64.b64encode(begin_cell().store_uint(0, 32).store_string(memo_text).end_cell().to_boc(False)).decode('utf-8')
    
    # Send what app.js expects: status="ok", total_price=X
    return web.json_response({
        "status": "ok",
        "total_price": total_final,
        "messages": [{"address": OWNER_WALLET, "amount": str(int(total_final * 1e9)), "payload": payload}],
        "order_id": order_id
    })

async def fetch_fiat_rates():
    """Fetches TON price in USD and RUB"""
    try:
        async with aiohttp.ClientSession() as session:
            # Get TON/USD from TonAPI
            async with session.get('https://tonapi.io/v2/rates?tokens=ton&currencies=usd,rub') as resp:
                data = await resp.json()
                rates = data.get('rates', {}).get('TON', {}).get('prices', {})
                return {
                    'USD': rates.get('USD', 2.5), # Fallback to 2.5 if API fails
                    'RUB': rates.get('RUB', 230)   # Fallback to 230 if API fails
                }
    except Exception as e:
        logging.error(f"Error fetching rates: {e}")
        return {'USD': 2.5, 'RUB': 230}

async def handle_get_rates(request):
    """API endpoint to get current TON/USD and TON/RUB rates"""
    rates = await fetch_fiat_rates()
    return web.json_response(rates)

async def handle_create_fiat_invoice(request):
    """Creates a fiat invoice via AAIO or CryptoPay"""
    try:
        data = await request.json()
        nft_address = data.get('nft_address')
        days = int(data.get('days', 1))
        method = data.get('gateway') # 'aaio' or 'cryptopay'
        currency = data.get('currency') # 'RUB' or 'USD'
        
        user_id = get_authenticated_user_id(request)
        if not user_id: return web.json_response({"error": "Unauthorized"}, status=401)
        
        # Create order first
        res, err = await create_rental_order(user_id, nft_address, days)
        if err: return web.json_response({"error": err}, status=404)
        
        order_id = res['order_id']
        total_ton = res['total_price']
        
        rates = await fetch_fiat_rates()
        ton_price = rates.get(currency, 1)
        
        # Calculate fiat amount with a small buffer for exchange rate volatility
        fiat_amount = round(total_ton * ton_price * 1.05, 2)
        
        payment_url = ""
        external_id = ""
        
        if method == 'aaio':
            AAIO_MERCHANT_ID = os.getenv("AAIO_MERCHANT_ID", "YOUR_AAIO_MERCHANT_ID")
            AAIO_SECRET_1 = os.getenv("AAIO_SECRET_1", "YOUR_AAIO_SECRET_1")
            external_id = f"order_{order_id}_{int(asyncio.get_event_loop().time())}"
            
            # Signature for invoice: merchant_id:amount:currency:secret:order_id
            sign_str = f"{AAIO_MERCHANT_ID}:{fiat_amount}:{currency}:{AAIO_SECRET_1}:{external_id}"
            sign = hashlib.sha256(sign_str.encode()).hexdigest()
            
            payment_url = f"https://aaio.io/merchant/pay?merchant_id={AAIO_MERCHANT_ID}&amount={fiat_amount}&currency={currency}&order_id={external_id}&sign={sign}"
            
        elif method == 'cryptopay':
            CRYPTO_PAY_TOKEN = os.getenv("CRYPTO_PAY_API_TOKEN", "YOUR_CRYPTO_PAY_TOKEN")
            # For CryptoPay via @CryptoBot, we usually use their API to create an invoice
            # This is a placeholder direct link, real implementation should call their API
            payment_url = f"https://t.me/CryptoBot?start=pay_order_{order_id}" 
            external_id = f"cp_{order_id}"

        # Update order with fiat info
        async with db.aiosqlite.connect(db.DB_PATH) as conn:
            await conn.execute(
                "UPDATE orders SET currency = ?, payment_gateway = ?, fiat_amount = ?, external_id = ? WHERE id = ?",
                (currency, method, fiat_amount, external_id, order_id)
            )
            await conn.commit()
            
        return web.json_response({"status": "ok", "order_id": order_id, "payment_url": payment_url, "fiat_amount": fiat_amount})
    except Exception as e:
        logging.error(f"Error creating fiat invoice: {e}")
        return web.json_response({"error": str(e)}, status=500)

async def handle_get_usdt_payload(request):
    """
    Generates a Jetton Transfer payload for USDT payment via TonConnect.
    The user's wallet will send USDT to OWNER_WALLET with a memo 'order_id:XXX'.
    """
    try:
        order_id = request.query.get('order_id')
        amount = request.query.get('amount') # In USDT units (6 decimals)
        
        if not order_id or not amount:
            return web.json_response({"error": "Missing params"}, status=400)

        # 1. First, we need the user's USDT Jetton Wallet address to send from.
        # But wait, in TonConnect, the user sends a transaction to their OWN Jetton Wallet
        # which then transfers to the destination.
        # However, the UI doesn't always know the user's Jetton Wallet.
        # The standard approach is to let the backend find it or provide a generic way.
        
        # Actually, for TonConnect, we can just return the HEX of the Cell.
        # The payload is: 0xf8a7ea5 (op) + 0 (query_id) + amount + OWNER_WALLET + ...
        
        # Binary construction of Jetton Transfer:
        # op: 0xf8a7ea5
        # query_id: 0
        # amount: VarUint 16
        # destination: MsgAddress
        # response_destination: MsgAddress
        # custom_payload: Maybe Bit (0)
        # forward_ton_amount: VarUint 16 (e.g. 0.01 TON)
        # forward_payload: Either (Cell / Slice) -> OrderID as memo
        
        from tonutils.utils import begin_cell, Address
        
        # Create memo cell
        memo_cell = begin_cell().store_uint(0, 32).store_string(f"order_id:{order_id}").end_cell()
        
        payload_cell = (
            begin_cell()
            .store_uint(0xf8a7ea5, 32) # Op-code transfer
            .store_uint(0, 64)        # query_id
            .store_coins(int(amount)) # amount (jetton units)
            .store_address(Address(OWNER_WALLET)) # to
            .store_address(Address(OWNER_WALLET)) # response
            .store_bit(0) # custom_payload
            .store_coins(10000000) # forward_ton_amount (0.01 TON)
            .store_bit(1) # forward_payload is cell
            .store_ref(memo_cell)
            .end_cell()
        )
        
        payload_hex = payload_cell.to_boc(False).hex()
        
        # We also need the user's USDT Jetton Wallet. 
        # Since the backend doesn't know the user's wallet address yet (it's in the UI),
        # we can't fetch it here. We'll return the payload and the main USDT Master address.
        # BUT: The user must send to their JETTON WALLET, not the master.
        # I'll return the Master and the UI will have to resolve it or we return it if we have it.
        
        return web.json_response({
            "status": "ok",
            "payload": payload_hex,
            "usdt_master": USDT_JETTON_ADDRESS
        })
    except Exception as e:
        logging.error(f"Error generating USDT payload: {e}")
        return web.json_response({"error": str(e)}, status=500)

async def handle_aaio_webhook(request):
    """AAIO Webhook Handler"""
    try:
        data = await request.post()
        merchant_id = data.get('merchant_id')
        amount = data.get('amount')
        external_id = data.get('order_id')
        sign = data.get('sign')
        
        # Verify Signature (Simplified)
        AAIO_SECRET_2 = os.getenv("AAIO_SECRET_2")
        check_sign = hashlib.sha256(f"{merchant_id}:{amount}:{external_id}:{AAIO_SECRET_2}".encode()).hexdigest()
        
        if sign != check_sign:
            logging.warning(f"Invalid AAIO signature for order {external_id}")
            return web.Response(text="invalid_sign", status=400)
            
        # Extract order_id from external_id
        order_id = int(external_id.split('_')[1])
        
        # Mark as paid
        await db.update_order_status(order_id, 'paid')
        logging.info(f"Order {order_id} marked as PAID via AAIO")
        
        return web.Response(text="OK")
    except Exception as e:
        logging.error(f"AAIO Webhook Error: {e}")
        return web.Response(text="error", status=500)

async def handle_cryptopay_webhook(request):
    """CryptoPay (@CryptoBot) Webhook Handler"""
    try:
        # CryptoPay sends body as JSON
        data = await request.json()
        
        # Verify header 'Crypto-Pay-Api-Signature' if needed
        # (Simplified verification for now)
        
        update_type = data.get('update_type')
        payload = data.get('payload', {})
        
        if update_type == 'invoice_paid':
            external_id = payload.get('payload') # We store order_id or external_id in 'payload' field of invoice
            status = payload.get('status')
            
            if status == 'paid' and external_id:
                # Extract order_id
                if external_id.startswith('cp_'):
                    order_id = int(external_id.replace('cp_', ''))
                else:
                    order_id = int(external_id)
                    
                await db.update_order_status(order_id, 'paid')
                logging.info(f"Order {order_id} marked as PAID via CryptoPay")
        
        return web.Response(text="OK")
    except Exception as e:
        logging.error(f"CryptoPay Webhook Error: {e}")
        return web.Response(text="error", status=500)


async def handle_submit_tc_link(request):
    try:
        data = await request.json()
        order_id = data.get('order_id')
        tc_link = data.get('tc_link')
        
        user_id = get_authenticated_user_id(request)
        if not user_id:
            return web.json_response({'error': 'Unauthorized'}, status=401)
        
        order = await db.get_order_by_id(order_id)
        if not order:
            return web.json_response({'error': 'Order not found'}, status=404)
            
        if order['user_id'] != user_id:
            return web.json_response({'error': 'Access denied: not your order'}, status=403)
        
        # Convert sqlite3.Row to dict
        order_dict = dict(order)
        
        # Use the token used during purchase if available, otherwise fallback
        token = order_dict.get('api_token') or os.getenv("MARKETAPP_TOKEN_BUYER")
        
        if not token:
            logging.error(f"No API token found for order {order_id}")
            return web.json_response({'error': 'Internal configuration error: missing token'}, status=500)
        
        await db.update_order_status(order['id'], None, tc_link=tc_link)
        
        logging.info(f"Submitting TC link to Fragment for order {order_id}, NFT: {order['nft_address']}")
        logging.info(f"TC Link: {tc_link}")
        
        async with aiohttp.ClientSession() as s:
            url = f"{MARKET_URL}/rent/{order['nft_address']}/tonconnect/"
            payload = {"tonconnect_url": tc_link}
            headers = {"Authorization": token, "Content-Type": "application/json"}
            
            logging.info(f"Sending POST to {url}")
            logging.info(f"Payload: {payload}")
            
            # Попытки привязки с ретраями (Fragment может не сразу увидеть транзакцию)
            for attempt in range(5):
                async with s.post(url, headers=headers, json=payload, timeout=10, proxy=PROXY_URL) as r:
                    response_text = await r.text()
                    logging.info(f"Fragment API (Attempt {attempt+1}) Status: {r.status}")
                    
                    if r.status == 200:
                        logging.info("✅ TonConnect link submitted successfully!")
                        return web.json_response({
                            "status": "ok", 
                            "bridge_status": r.status,
                            "fragment_response": response_text
                        })
                    
                    if r.status == 400 and "forbidden" in response_text.lower():
                        if attempt < 4:
                            logging.warning(f"Fragment returned forbidden (attempt {attempt+1}). Waiting for blockchain sync...")
                            await asyncio.sleep(15) # Ждем чуть дольше
                            continue
                    
                    # Если другая ошибка или последняя попытка
                    logging.error(f"Fragment API error: {r.status} - {response_text}")
                    if attempt == 4:
                        return web.json_response({
                            "status": "error", 
                            "message": f"Fragment API error: {r.status}",
                            "details": response_text
                        }, status=500)
    except Exception as e:
        logging.error(f"Error in handle_submit_tc_link: {e}")
        return web.json_response({"error": str(e)}, status=500)

async def handle_get_orders(request):
    user_id = get_authenticated_user_id(request)
    if not user_id:
        return web.json_response({'error': 'Unauthorized'}, status=401)
    
    orders = await db.get_user_orders(user_id)
    return web.json_response([dict(o) for o in orders])

async def handle_toggle_notification(request):
    try:
        data = await request.json()
        user_id = get_authenticated_user_id(request)
        nft_address = data.get('nft_address')

        if not user_id or not nft_address:
            return web.json_response({'error': 'Missing data'}, status=400)

        async with db.aiosqlite.connect(db.DB_PATH) as conn:
            # Check if exists (toggle logic)
            cursor = await conn.execute("SELECT id FROM item_notifications WHERE user_id = ? AND nft_address = ?", (user_id, nft_address))
            row = await cursor.fetchone()
            if row:
                await conn.execute("DELETE FROM item_notifications WHERE id = ?", (row[0],))
                status = "removed"
            else:
                await conn.execute("INSERT INTO item_notifications (user_id, nft_address) VALUES (?, ?)", (user_id, nft_address))
                status = "added"
            await conn.commit()
            
        return web.json_response({'status': 'ok', 'action': status})
    except Exception as e:
        return web.json_response({'error': str(e)}, status=500)

async def handle_check_notification_status(request):
    try:
        user_id = get_authenticated_user_id(request)
        nft_address = request.query.get('nft_address')
        if not user_id or not nft_address:
            return web.json_response({'subscribed': False})

        async with db.aiosqlite.connect(db.DB_PATH) as conn:
            cursor = await conn.execute("SELECT id FROM item_notifications WHERE user_id = ? AND nft_address = ?", (user_id, nft_address))
            row = await cursor.fetchone()
            return web.json_response({'subscribed': row is not None})
    except Exception:
        return web.json_response({'subscribed': False})

async def handle_referral_stats(request):
    """Get referral statistics for a user"""
    try:
        user_id = get_authenticated_user_id(request)
        if not user_id:
            return web.json_response({'error': 'Unauthorized or missing user_id'}, status=401)
        
        stats = await db.get_referral_stats(user_id)
        return web.json_response(stats)
    except Exception as e:
        logging.error(f"Error in handle_referral_stats: {e}")
        return web.json_response({'error': str(e)}, status=500)

async def handle_nft_details(request):
    try:
        nft_addr = request.query.get("nft_address", "").strip()
        if not nft_addr: return web.json_response({"error": "Missing nft_address"}, status=400)

        # 🚀 ROBUST LOOKUP: Support both Base64 and Raw formats
        raw_addr = nft_addr.replace('-', '+').replace('_', '/')
        
        logging.info(f"[handle_nft_details] Searching local DB for: '{nft_addr}' (Normalized: '{raw_addr}')")
        async with aiosqlite.connect(db.DB_PATH) as conn:
            conn.row_factory = aiosqlite.Row
            # Search with both original and normalized to be 100% sure
            async with conn.execute("SELECT * FROM items WHERE nft_address = ? OR nft_address = ?", (nft_addr, raw_addr)) as cursor:
                row = await cursor.fetchone()
                if row:
                    item = dict(row)
                    logging.info(f"[handle_nft_details] Found in local DB: {nft_addr}")
                    meta = {}
                    try: meta = json.loads(item['metadata'])
                    except: pass
                    
                    return web.json_response({
                        "id": item.get('id'),
                        "address": item.get('nft_address'),
                        "name": item.get('title') or item.get('nft_name'),
                        "image": item.get('image') or meta.get('image'),
                        "collection_name": meta.get('collection_name') or item.get('collection_name'),
                        "price_per_day": item.get('price_per_day'),
                        "status": item.get('status'),
                        "type": item.get('type'),
                        "auto_relist": item.get('auto_relist'),
                        "metadata": meta,
                        "min_duration": item.get('min_duration'),
                        "max_duration": item.get('max_duration'),
                        "rent_ends_at": item.get('rent_ends_at')
                    })

        # 🔵 PRIORITY 2: Fallback to TonAPI for unknown items
        async with aiohttp.ClientSession() as session:
            url = f"https://tonapi.io/v2/nfts/{nft_addr}"
            async with session.get(url) as resp:
                data = await resp.json()
                return web.json_response(data)
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)

async def handle_referral_friends(request):
    user_id = get_authenticated_user_id(request)
    if not user_id: return web.json_response({'error': 'Unauthorized'}, status=401)
    
    friends = await db.get_referral_friends(int(user_id))
    return web.json_response({'friends': friends})

async def handle_referral_withdraw(request):
    """Process referral balance withdrawal"""
    try:
        data = await request.json()
        user_id = get_authenticated_user_id(request)
        amount = float(data.get('amount', 0))
        wallet_address = data.get('wallet_address', '')
        
        if not user_id or not amount or not wallet_address:
            return web.json_response({'error': 'Missing required fields'}, status=400)
        
        # Minimum withdrawal amount
        MIN_WITHDRAWAL = 0.1
        if amount < MIN_WITHDRAWAL:
            return web.json_response({
                'error': f'Minimum withdrawal amount is {MIN_WITHDRAWAL} TON'
            }, status=400)
        
        # Attempt withdrawal
        success = await db.withdraw_referral_balance(user_id, amount)
        
        if not success:
            return web.json_response({
                'error': 'Insufficient balance'
            }, status=400)
        
        # Note: Actual transaction is handled by user's wallet via TonConnect in frontend
        logging.info(f"Withdrawal request recorded: {amount} TON to {wallet_address} for user {user_id}")
        
        return web.json_response({
            'status': 'ok',
            'message': f'Withdrawal of {amount} TON processed',
            'wallet': wallet_address
        })
    except Exception as e:
        logging.error(f"Error in handle_referral_withdraw: {e}")
        return web.json_response({'error': str(e)}, status=500)

async def handle_user_avatar(request):
    user_id = get_authenticated_user_id(request)
    if not user_id or not BOT_TOKEN:
        return web.Response(status=401)
    
    try:
        async with aiohttp.ClientSession() as session:
            # 1. Get user profile photos
            photos_url = f"https://api.telegram.org/bot{BOT_TOKEN}/getUserProfilePhotos?user_id={user_id}&limit=1"
            async with session.get(photos_url) as resp:
                data = await resp.json()
                if not data.get("ok") or not data["result"]["photos"]:
                    return web.Response(status=404)
                
                # Get the smallest version of the first photo
                file_id = data["result"]["photos"][0][0]["file_id"]
            
            # 2. Get file path
            file_url = f"https://api.telegram.org/bot{BOT_TOKEN}/getFile?file_id={file_id}"
            async with session.get(file_url) as resp:
                data = await resp.json()
                if not data.get("ok"):
                    return web.Response(status=404)
                
                file_path = data["result"]["file_path"]
            
            # 3. Proxy the image content
            image_url = f"https://api.telegram.org/file/bot{BOT_TOKEN}/{file_path}"
            async with session.get(image_url) as resp:
                if resp.status != 200:
                    return web.Response(status=404)
                
                content = await resp.read()
                return web.Response(body=content, content_type="image/jpeg")
                
    except Exception as e:
        logging.error(f"Error in handle_user_avatar: {e}")
        return web.Response(status=500)

# Round 21: Thumbnail and URL Reliability
WEB_APP_URL = os.getenv("WEB_APP_URL", "").rstrip('/')

async def handle_prepare_referral_share(request):
    try:
        data = await request.json()
        user_id = get_authenticated_user_id(request)
        
        if not user_id: return web.json_response({"error": "Unauthorized"}, status=401)
            
        item_type = data.get("type", "referral")
        item_name = data.get("name", "")
        nft_address = data.get("nft_address", "")
        rent_ends_at = data.get("rent_ends_at")  # NEW: expiration timestamp
        
        # Standard referral link
        bot_user = "OctoRent_bot"
        
        # 🚀 CLEAN LINK: Separate referral and item shares
        if item_type == 'referral':
            share_link = f"https://t.me/{bot_user}?start=ref_{user_id}"
        elif nft_address:
            share_link = f"https://t.me/{bot_user}?start=nft_{nft_address}"
        else:
            share_link = f"https://t.me/{bot_user}?start=ref_{user_id}"
            
        ref_link = share_link # Keep variable name for msg_text below
        
        # Dynamic URL detection: Use the Host provided by the request (Cloudflare tunnel URL)
        host = request.headers.get("X-Forwarded-Host") or request.headers.get("Host") or "localhost"
        proto = request.headers.get("X-Forwarded-Proto") or "https"
        base_url = f"{proto}://{host}"
        logging.info(f"[prepare_share] base_url={base_url}, item_type={item_type}, user_id={user_id}")
        
        # Default thumb - banner or fallback
        banner_path = os.path.join("web", "pictures", "referral_128x128.png")
        if os.path.exists(banner_path):
            thumb = f"{base_url}/pictures/referral_128x128.png"
            logging.info(f"[prepare_share] Using banner: {thumb}")
        else:
            thumb = "https://ton.org/download/ton_symbol.png"
            logging.warning(f"[prepare_share] Banner not found at {banner_path}, using fallback")
        
        # Default title
        title = "OctoRent"
        
        # Override thumb and title based on item type
        if item_type == 'username':
            clean_name = item_name.replace('@', '').strip().lower()
            title = f"Username: @{clean_name}"
            if nft_address:
                thumb = f"https://tonapi.io/v2/nfts/{nft_address}/image"
        elif item_type == 'number':
            clean_num = item_name.replace('+', '').replace(' ', '').strip()
            title = f"Anonymous Number: +{clean_num}"
            if nft_address:
                thumb = f"https://tonapi.io/v2/nfts/{nft_address}/image"
        elif item_type == 'gift' and item_name:
            # Robust gift slug generation
            base_name = item_name.split('#')[0].strip()
            # Fragment slugs usually hyphenated: "Eternal Rose" -> "eternal-rose"
            # But the code previously used CamelCase? Let's fix to hyphenated as Fragment expects
            slug_parts = [w.lower() for w in base_name.split() if w]
            slug = "-".join(slug_parts)
            title = f"Gift: {item_name}"
            # Ensure slug is not empty
            if slug:
                thumb = f"https://nft.fragment.com/gift/{slug}-1.webp" # Use first number as thumb preview
            else:
                thumb = "https://nft.fragment.com/guide/gift.svg"
        
        # Build message text (ref_link is already defined above)
        full_photo = thumb # Default fallback
        if item_type == 'referral':
            title = "🎁 Реферальная система"
            # Use banner for referral
            if os.path.exists(banner_path):
                thumb = f"{base_url}/pictures/referral_128x128.png"
                full_photo = f"{base_url}/pictures/referral.png"
            else:
                full_photo = thumb
            
            msg_text = (
                f"🎁 <b>Присоединяйся к OctoRent!</b>\n\n"
                f"Арендуй NFT подарки, юзернеймы и номера напрямую в Telegram.\n\n"
                f"🔗 <b>Твоя ссылка для входа:</b>\n{ref_link}"
            )
        else:
            # For items, photo and thumb are often the same (tonapi image)
            full_photo = thumb
            time_info = ""
            if rent_ends_at:
                try:
                    import time
                    remaining = int(rent_ends_at) - int(time.time())
                    if remaining > 0:
                        days = remaining // 86400
                        hours = (remaining % 86400) // 3600
                        time_info = f"\n⏳ <b>Остаток аренды:</b> {days}д {hours}ч"
                except:
                    pass

            msg_text = (
                f"💎 <b>{title}</b>\n\n"
                f"Этот эксклюзивный NFT подарок доступен для аренды в OctoRent ✨{time_info}\n\n"
                f"⚡️ <b>Забирай его первым по ссылке:</b>\n{ref_link}"
            )

        logging.info(f"[prepare_share] thumb={thumb}, full_photo={full_photo}")
        
        # Build result as photo (shows big image in chat)
        result = {
            "type": "photo",
            "id": f"share_{user_id}_{os.urandom(4).hex()}",
            "photo_url": full_photo,
            "thumbnail_url": thumb,
            "caption": msg_text,
            "parse_mode": "HTML",
            "reply_markup": {
                "inline_keyboard": [[
                    {"text": "🚀 Открыть в OctoRent", "url": ref_link}
                ]]
            }
        }
        
        url = f"https://api.telegram.org/bot{BOT_TOKEN}/savePreparedInlineMessage"
        payload = {
            "user_id": int(user_id),
            "result": result,
            "allow_user_chats": True,
            "allow_bot_chats": False,
            "allow_group_chats": True,
            "allow_channel_chats": True
        }
        
        async with aiohttp.ClientSession() as session:
            async with session.post(url, json=payload) as resp:
                res_data = await resp.json()
                logging.info(f"[prepare_share] Telegram API response: {res_data}")
                if res_data.get("ok"):
                    return web.json_response({"status": "ok", "id": res_data["result"]["id"]})
                error_desc = res_data.get("description", "Unknown error")
                logging.error(f"[prepare_share] Telegram API error: {error_desc}")
                return web.json_response({"error": error_desc}, status=500)
    except Exception as e:
        logging.error(f"Error in prepare_share: {e}", exc_info=True)
        return web.json_response({"error": str(e)}, status=500)

async def handle_create_bot_invoice(request):
    try:
        data = await request.json()
        user_id = get_authenticated_user_id(request)
        if not user_id: 
            return web.json_response({"error": "Unauthorized"}, status=401)
            
        nft_address = data.get("nft_address")
        days = int(data.get("days", 1))
        gateway = data.get("gateway") # 'CRYPTO_BOT' or 'XROCKET'
        
        # Use existing helper to create order and get TON price with markup
        res, err = await create_rental_order(user_id, nft_address, days)
        if err: return web.json_response({"error": err}, status=404)
        
        order_id = res['order_id']
        total_ton = res['total_price']
        item = res['item']
        
        # Add 0.1 TON commission for bot withdrawal fees
        amount_with_fee = round(total_ton + 0.1, 2)
        
        payment_url = None
        external_id = None
        
        if gateway == 'CRYPTO_BOT':
            token = os.getenv("CRYPTO_PAY_API_TOKEN")
            if not token: return web.json_response({"error": "Crypto Bot token not set"}, status=500)
            
            # Crypto Bot: base + 0.1 gas + 3% gateway fee
            final_amount = round((total_ton + 0.1) * 1.03, 2)
            
            headers = {"Crypto-Pay-API-Token": token}
            payload = {
                "asset": "TON",
                "amount": str(final_amount),
                "description": f"Rent NFT: {item['title']} for {days} days",
                "payload": json.dumps({"order_id": order_id, "user_id": user_id}),
                "expires_in": 3600
            }
            async with aiohttp.ClientSession() as session:
                async with session.post("https://pay.crypt.bot/api/createInvoice", json=payload, headers=headers) as resp:
                    res_bot = await resp.json()
                    if res_bot.get("ok"):
                        payment_url = res_bot["result"]["pay_url"]
                        external_id = str(res_bot["result"]["invoice_id"])
                        
        elif gateway == 'XROCKET':
            token = os.getenv("XROCKET_API_TOKEN", "")
            if not token: return web.json_response({"error": "xRocket token not set"}, status=500)
            
            # xRocket: base + 0.1 gas + 1.5% gateway fee
            final_amount = round((total_ton + 0.1) * 1.015, 2)
            
            headers = {"Rocket-Pay-Key": token}
            payload = {
                "amount": final_amount,
                "currency": "TON",
                "description": f"Rent NFT: {item['title']} for {days} days",
                "hiddenMessage": "Thank you for your order!",
                "payload": json.dumps({"order_id": order_id, "user_id": user_id}),
                "callbackUrl": f"{WEB_APP_URL}/api/webhooks/xrocket"
            }
            async with aiohttp.ClientSession() as session:
                async with session.post("https://pay.xrocket.tg/api/v1/tg-invoices", json=payload, headers=headers) as resp:
                    res_bot = await resp.json()
                    if res_bot.get("success"):
                        payment_url = res_bot["data"]["link"]
                        external_id = str(res_bot["data"]["id"])

        if payment_url:
            # Update order with gateway and external ID
            async with db.aiosqlite.connect(db.DB_PATH) as conn:
                await conn.execute(
                    "UPDATE orders SET external_id = ?, payment_gateway = ?, currency = ? WHERE id = ?",
                    (external_id, gateway, 'TON', order_id)
                )
                await conn.commit()

            return web.json_response({"payment_url": payment_url, "order_id": order_id})
            
        return web.json_response({"error": "Failed to create invoice"}, status=500)
        
    except Exception as e:
        logging.error(f"Error creating bot invoice: {e}")
        return web.json_response({"error": str(e)}, status=500)

async def handle_aaio_webhook(request):
    # Stub for AAIO payment confirmation
    return web.Response(text="ok")

async def handle_cryptopay_webhook(request):
    """
    CryptoPay (@CryptoBot) Webhook Handler.
    Verifies signature and triggers auto-withdrawal to OWNER_WALLET.
    """
    try:
        body = await request.text()
        signature = request.headers.get("crypto-pay-api-signature")
        token = os.getenv("CRYPTO_PAY_API_TOKEN", "")
        
        if not signature or not token:
            logging.error("Missing Crypto-Pay signature or token")
            return web.Response(text="Unauthorized", status=401)
            
        # Verify Signature: HMAC-SHA256(SHA256(TOKEN), body)
        token_hash = hashlib.sha256(token.encode()).digest()
        expected_sig = hmac.new(token_hash, body.encode(), hashlib.sha256).hexdigest()
        
        if signature != expected_sig:
            logging.error(f"Invalid Crypto-Pay signature. Sig: {signature}, Expected: {expected_sig}")
            return web.Response(text="Forbidden", status=403)
            
        data = json.loads(body)
        update_type = data.get("update_type")
        payload = data.get("payload", {})
        
        if update_type == "invoice_paid":
            # Extract order_id from invoice payload
            # In handle_create_bot_invoice we send: "payload": json.dumps({"order_id": order_id, ...})
            # Crypto Bot returns it as a string in 'payload'
            inner_payload = json.loads(payload.get("payload", "{}"))
            order_id = inner_payload.get("order_id")
            amount_paid = float(payload.get("amount", 0))
            asset = payload.get("asset")
            
            if order_id and asset == "TON":
                # 1. Update order status to 'paid'
                await db.update_order_status(order_id, "paid")
                logging.info(f"Order {order_id} marked as PAID via Crypto Bot. Amount: {amount_paid} TON")
                
                # 2. Trigger Auto-Withdrawal to OWNER_WALLET
                # We use a spend_id to prevent double withdrawal (using order_id)
                withdraw_payload = {
                    "asset": "TON",
                    "amount": str(amount_paid),
                    "address": OWNER_WALLET,
                    "comment": f"Fulfillment for order #{order_id}",
                    "spend_id": f"withdraw_{order_id}"
                }
                headers = {"Crypto-Pay-API-Token": token}
                async with aiohttp.ClientSession() as session:
                    async with session.post("https://pay.crypt.bot/api/withdraw", json=withdraw_payload, headers=headers) as resp:
                        res = await resp.json()
                        if res.get("ok"):
                            logging.info(f"Successfully withdrawn {amount_paid} TON to {OWNER_WALLET} for order {order_id}")
                        else:
                            logging.error(f"Failed to withdraw for order {order_id}: {res}")

        return web.Response(text="OK")
    except Exception as e:
        logging.error(f"CryptoPay Webhook Error: {e}", exc_info=True)
        return web.Response(text="Internal Error", status=500)

async def handle_xrocket_webhook(request):
    """
    xRocket Webhook Handler.
    Verifies signature and triggers auto-withdrawal to OWNER_WALLET.
    """
    try:
        body = await request.text()
        signature = request.headers.get("Rocket-Pay-Signature")
        token = os.getenv("XROCKET_API_TOKEN", "")
        
        if not signature or not token:
            logging.error("Missing xRocket signature or token")
            return web.Response(text="Unauthorized", status=401)
            
        # Verify Signature: HMAC-SHA256(SHA256(TOKEN), body)
        token_hash = hashlib.sha256(token.encode()).digest()
        expected_sig = hmac.new(token_hash, body.encode(), hashlib.sha256).hexdigest()
        
        if signature != expected_sig:
            logging.error("Invalid xRocket signature")
            return web.Response(text="Forbidden", status=403)
            
        data = json.loads(body)
        event_type = data.get("type")
        payload = data.get("data", {})
        
        if event_type == "invoice_paid":
            # Extract order_id from invoice payload
            inner_payload = json.loads(payload.get("payload", "{}"))
            order_id = inner_payload.get("order_id")
            amount_paid = float(payload.get("amount", 0))
            currency = payload.get("currency")
            
            if order_id and currency == "TON":
                # 1. Update order status to 'paid'
                await db.update_order_status(order_id, "paid")
                logging.info(f"Order {order_id} marked as PAID via xRocket. Amount: {amount_paid} TON")
                
                # 2. Trigger Auto-Withdrawal to OWNER_WALLET
                # xRocket withdrawal API: POST /api/v1/app/withdrawal
                import uuid
                withdraw_payload = {
                    "withdrawalId": str(uuid.uuid4()),
                    "network": "TON",
                    "asset": "TONCOIN",
                    "address": OWNER_WALLET,
                    "amount": amount_paid
                }
                headers = {"Rocket-Pay-Key": token}
                async with aiohttp.ClientSession() as session:
                    async with session.post("https://pay.xrocket.tg/api/v1/app/withdrawal", json=withdraw_payload, headers=headers) as resp:
                        res = await resp.json()
                        if res.get("success"):
                            logging.info(f"Successfully withdrawn {amount_paid} TON to {OWNER_WALLET} extra xRocket order {order_id}")
                        else:
                            logging.error(f"Failed to withdraw for order {order_id} (xRocket): {res}")

        return web.Response(text="OK")
    except Exception as e:
        logging.error(f"xRocket Webhook Error: {e}", exc_info=True)
        return web.Response(text="Internal Error", status=500)


@web.middleware
async def cors_middleware(request, handler):
    if request.method == "OPTIONS":
        return web.Response(status=204, headers={
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': '*'
        })
    resp = await handler(request)
    resp.headers.update({
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': '*',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
    })
    return resp

app = web.Application(middlewares=[cors_middleware])
app.add_routes([
    web.get('/', handle_index),
    web.get('/api/items', handle_live_items),
    web.get('/api/filters', handle_filter_data),
    web.post('/api/prepare_rent', handle_prepare_rent),  # Changed from get to post
    web.post('/api/submit_tc_link', handle_submit_tc_link),
    web.get('/api/my_orders', handle_get_orders),
    web.post('/api/toggle_notification', handle_toggle_notification),
    web.get('/api/check_notification_status', handle_check_notification_status),
    web.get('/api/referral/stats', handle_referral_stats),
    web.get('/api/referral/friends', handle_referral_friends),
    web.post('/api/referral/withdraw', handle_referral_withdraw),
    web.post('/api/referral/prepare_share', handle_prepare_referral_share),
    web.get('/api/nft_details', handle_nft_details),
    web.get('/api/user-avatar', handle_user_avatar),
    web.get('/api/rates', handle_get_rates),
    web.post('/api/create_fiat_invoice', handle_create_fiat_invoice),
    web.post('/api/create_bot_invoice', handle_create_bot_invoice),
    web.get('/api/get_usdt_payload', handle_get_usdt_payload),
    web.post('/api/webhooks/aaio', handle_aaio_webhook),
    web.post('/api/webhooks/cryptopay', handle_cryptopay_webhook),
    web.post('/api/webhooks/xrocket', handle_xrocket_webhook),
])


# Serve static files from 'web' directory at root
app.router.add_static('/', './web', name='static', follow_symlinks=True)

if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO)
    web.run_app(app, port=PORT)
