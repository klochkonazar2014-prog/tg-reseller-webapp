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
from tonutils.utils import begin_cell
from dotenv import load_dotenv

load_dotenv()
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
                if f_price_from:
                    try:
                        if price < float(f_price_from): continue
                    except: pass
                if f_price_to:
                    try:
                        if price > float(f_price_to): continue
                    except: pass

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

async def handle_prepare_rent(request):
    nft_address, days = request.query.get("nft_address"), int(request.query.get("days", 1))
    user_id = get_authenticated_user_id(request)
    if not user_id:
        return web.json_response({"error": "Unauthorized"}, status=401)
    
    item = await db.get_item_by_id_addr(nft_address)
    if not item: return web.json_response({"error": "Not found"}, status=404)
    
    is_preorder = 1 if item['status'] == 'rented' else 0
    total_base = round((item['original_price'] + calculate_markup(item['original_price'])) * days + 0.2, 2)
    order_id = await db.create_order(user_id, nft_address, item['title'], days, total_base, is_preorder=is_preorder)
    total_final = round(total_base + (order_id % 500) / 10000, 4)
    
    async with db.aiosqlite.connect(db.DB_PATH) as conn:
        await conn.execute("UPDATE orders SET total_price = ?, status = 'pending_payment' WHERE id = ?", (total_final, order_id))
        await conn.commit()
    
    # REFERRAL LOGIC: Check if user has a referrer and add earning
    referrer_id = await db.get_referrer_id(user_id)
    if referrer_id:
        # Calculate 25% of markup
        markup_per_day = calculate_markup(item['original_price'])
        total_markup = markup_per_day * days
        referral_commission = round(total_markup * 0.25, 4)  # 25% от наценки
        
        # Add earning to referrer's balance
        await db.add_referral_earning(referrer_id, order_id, referral_commission)
        logging.info(f"Referral earning added: {referral_commission} TON to user {referrer_id} for order {order_id}")

    import base64
    payload = base64.b64encode(begin_cell().store_uint(0, 32).store_string(f"order:{order_id}").end_cell().to_boc(False)).decode('utf-8')
    return web.json_response({"messages": [{"address": OWNER_WALLET, "amount": str(int(total_final * 1e9)), "payload": payload}], "order_id": order_id})


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
        
        # Convert sqlite3.Row to dict to use .get() method
        order_dict = dict(order)
        
        # Use the BUYER token provided by the user which belongs to the UQBxgCx... wallet
        token = os.getenv("MARKETAPP_TOKEN_BUYER")
        
        await db.update_order_status(order['id'], None, tc_link=tc_link)
        
        logging.info(f"Submitting TC link to Fragment for order {order_id}, NFT: {order['nft_address']}")
        logging.info(f"TC Link: {tc_link}")
        
        async with aiohttp.ClientSession() as s:
            url = f"{MARKET_URL}/rent/{order['nft_address']}/tonconnect/"
            payload = {"tonconnect_url": tc_link}
            headers = {"Authorization": token, "Content-Type": "application/json"}
            
            logging.info(f"Sending POST to {url}")
            logging.info(f"Payload: {payload}")
            
            async with s.post(url, headers=headers, json=payload, timeout=10, proxy=PROXY_URL) as r:
                response_text = await r.text()
                logging.info(f"Fragment API Response Status: {r.status}")
                logging.info(f"Fragment API Response Body: {response_text}")
                
                if r.status != 200:
                    logging.error(f"Fragment API returned non-200 status: {r.status}")
                    return web.json_response({
                        "status": "error", 
                        "message": f"Fragment API error: {r.status}",
                        "details": response_text
                    }, status=500)
                
                return web.json_response({
                    "status": "ok", 
                    "bridge_status": r.status,
                    "fragment_response": response_text
                })
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
    web.get('/api/prepare_rent', handle_prepare_rent),
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
])


# Serve static files from 'web' directory at root
app.router.add_static('/', './web', name='static', follow_symlinks=True)

if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO)
    web.run_app(app, port=PORT)
