import aiohttp
import asyncio
import os
from dotenv import load_dotenv

load_dotenv()
MARKET_URL = "https://api.marketapp.ws/v1"
TOKEN = os.getenv("MARKETAPP_TOKEN_GENERAL_1")

async def test_api():
    if not TOKEN:
        print("Error: MARKETAPP_TOKEN_GENERAL_1 not found in .env")
        return

    addr = "EQB_4uh2znvuqO7c8cGbhvHQ8hHQRSXnvKJCN020Zj8r8LRj" # Plush Pepe #2451
    headers = {"Authorization": TOKEN}
    
    print(f"Checking address: {addr}")
    async with aiohttp.ClientSession() as session:
        async with session.get(f"{MARKET_URL}/nfts/{addr}/", headers=headers) as r:
            print(f"Status Code: {r.status}")
            data = await r.json()
            print("Response Data:")
            print(data)
            
            status = data.get("status")
            status_details = data.get("status_details", {})
            print(f"\nExtracted Status: {status}")
            print(f"End Time: {status_details.get('end_time')}")

if __name__ == "__main__":
    asyncio.run(test_api())
