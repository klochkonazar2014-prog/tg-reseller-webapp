import asyncio, json, collections
from multidict import MultiDict
import sys
import os

sys.path.append(os.getcwd())
import live_server

async def test():
    query_params = MultiDict([('nft', 'Bling Binkies'), ('model', 'Cupid Ruby'), ('status', 'available'), ('type', 'gift'), ('limit', '50')])
    class DummyRequest:
        query = query_params
    req = DummyRequest()
    try:
        resp = await live_server.handle_live_items(req)
        data = json.loads(resp.text)
        print("Found", len(data['items']), "items.")
        if data['items']:
            print("First item title:", data["items"][0]["title"])
    except Exception as e:
        print("Error:", e)

asyncio.run(test())
