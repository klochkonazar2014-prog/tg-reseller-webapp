import asyncio
import aiohttp
import os
from dotenv import load_dotenv

load_dotenv()

async def check_shop():
    api_key = os.getenv("TRIBUTE_API_KEY")
    if not api_key:
        print("Error: TRIBUTE_API_KEY not found in .env")
        return

    api_key = api_key.strip()
    url = "https://tribute.tg/api/v1/shop"
    headers = {"Api-Key": api_key}
    
    print(f"Checking shop for key: {api_key[:4]}...{api_key[-4:]}")
    
    async with aiohttp.ClientSession() as session:
        async with session.get(url, headers=headers) as resp:
            status = resp.status
            try:
                result = await resp.json()
            except:
                result = await resp.text()
            
            print(f"Status: {status}")
            print(f"Response: {result}")

if __name__ == "__main__":
    asyncio.run(check_shop())
