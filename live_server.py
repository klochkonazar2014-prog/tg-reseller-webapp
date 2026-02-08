import aiohttp
from aiohttp import web
import asyncio
import json
import logging
import os
import re
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

def calculate_markup(p):
    if p <= 0.01: return 0.05
    for limit, m in [(0.1, 0.05), (0.25, 0.1), (0.5, 0.15), (1.0, 0.25), (2.5, 0.45), (5.0, 0.75)]:
        if p <= limit: return m
    return 1.0

def get_token():
    import random
    return random.choice(TOKENS)

async def handle_index(request):
    path = './web/index.html'
    if os.path.exists(path):
        with open(path, 'r', encoding='utf-8') as f:
            content = f.read().replace('?v=1.1.84', f'?v={int(os.path.getmtime(path))}')
        return web.Response(text=content, content_type='text/html', headers={'Cache-Control':'no-cache'})
    return web.Response(status=404)

async def handle_static(request):
    path = os.path.join('./web', request.match_info.get('filename', ''))
    return web.FileResponse(path) if os.path.exists(path) else web.Response(status=404)

async def handle_live_items(request):
    q = request.query
    limit, offset = int(q.get("limit", 50)), int(q.get("offset", 0))
    f_nft, f_model, f_bg, f_symbol = q.get("nft"), q.get("model"), q.get("bg"), q.get("symbol")
    f_search, f_sort = q.get("search", "").lower(), q.get("sort", "id_desc")
    t_filter = q.get("type", "gift")
    s_filter = q.get("status", "available") # available, rented

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

            # Fetch all matching rows
            async with conn.execute(query, params) as cursor:
                all_rows = await cursor.fetchall()
            
            # NOW filter and prepare items for sorting
            filtered_items = []
            for r in all_rows:
                try:
                    m = json.loads(r['metadata'] or "{}")
                except Exception:
                    continue
                
                if f_nft and f_nft != 'all' and m.get("collection") != f_nft: continue
                if f_model and f_model != 'all' and m.get("model") != f_model: continue
                if f_bg and f_bg != 'all' and m.get("backdrop") != f_bg: continue
                if f_symbol and f_symbol != 'all' and m.get("symbol") != f_symbol: continue
                
                # Extract number for sorting
                title = r['title']
                num_match = re.search(r'#(\d+)', title)
                nft_num = int(num_match.group(1)) if num_match else 0
                
                filtered_items.append({
                    "id": r['id'],
                    "type": r['type'] or 'gift',
                    "nft_name": title,
                    "nft_address": r['nft_address'], 
                    "price_per_day": float(r['price_per_day']), 
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
    item = await db.get_item_by_id_addr(nft_address)
    if not item: return web.json_response({"error": "Not found"}, status=404)
    
    is_preorder = 1 if item.get('status') == 'rented' else 0
    total_base = round((item['original_price'] + calculate_markup(item['original_price'])) * days + 0.2, 2)
    order_id = await db.create_order(int(request.query.get("user_id", 0)), nft_address, item['title'], days, total_base, is_preorder=is_preorder)
    total_final = round(total_base + (order_id % 500) / 10000, 4)
    
    async with db.aiosqlite.connect(db.DB_PATH) as conn:
        await conn.execute("UPDATE orders SET total_price = ?, status = 'pending_payment' WHERE id = ?", (total_final, order_id))
        await conn.commit()

    import base64
    payload = base64.b64encode(begin_cell().store_uint(0, 32).store_string(f"order:{order_id}").end_cell().to_boc(False)).decode('utf-8')
    return web.json_response({"messages": [{"address": OWNER_WALLET, "amount": str(int(total_final * 1e9)), "payload": payload}], "order_id": order_id})

async def handle_submit_tc_link(request):
    try:
        data = await request.json()
        order_id = data.get('order_id')
        tc_link = data.get('tc_link')
        
        order = await db.get_order_by_id(order_id)
        if not order:
            return web.json_response({'error': 'Order not found'}, status=404)
        
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
    orders = await db.get_user_orders(int(request.query.get("user_id", "0")))
    return web.json_response([dict(o) for o in orders])

async def handle_nft_details(request):
    async with aiohttp.ClientSession() as s:
        async with s.get(f"{MARKET_URL}/nfts/{request.query.get('nft_address')}/", headers={"Authorization": get_token()}) as r:
            return web.json_response(await r.json()) if r.status == 200 else web.json_response({"error": "fail"}, status=r.status)

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
app.router.add_get('/', handle_index)
app.router.add_get('/api/items', handle_live_items)
app.router.add_get('/api/filters', handle_filter_data)
app.router.add_get('/api/prepare_rent', handle_prepare_rent)
app.router.add_post('/api/submit_tc_link', handle_submit_tc_link)
app.router.add_get('/api/my_orders', handle_get_orders)
app.router.add_get('/api/nft_details', handle_nft_details)
app.router.add_get('/{filename}', handle_static)

if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO)
    web.run_app(app, port=PORT)
