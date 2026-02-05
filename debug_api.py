import asyncio
import aiohttp
import os
from dotenv import load_dotenv

load_dotenv()
MARKET_URL = "https://api.marketapp.ws/v1"
TOKEN = os.getenv("MARKETAPP_TOKEN_GENERAL_1") or "193541-57afc271119790fc3a4a0e7eb00f7071-1768332974"

async def main():
    async with aiohttp.ClientSession() as session:
        print("Checking headers for /rent/gifts/...")
        async with session.get(f"{MARKET_URL}/rent/gifts/", headers={"Authorization": TOKEN}) as r:
            print("--- HEADERS ---")
            for k, v in r.headers.items():
                print(f"{k}: {v}")
            print("--- BODY keys ---")
            data = await r.json()
            print(data.keys())

if __name__ == "__main__":
    asyncio.run(main())
