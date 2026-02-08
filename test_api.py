
import aiohttp
import asyncio
import sys

URL = "https://api.marketapp.ws/v1/nfts/EQCodKAgXIb39c0NI7vZdtijqIRbq0hdMJTO5PD1tExQlqNm"
headers = {"Authorization": "968871-39540cc5e069c1e4a0c482e9faec2de8-1769539898"}

async def main():
    sys.stdout.reconfigure(encoding='utf-8')
    async with aiohttp.ClientSession() as session:
        async with session.get(URL, headers=headers) as resp:
            print(f"Status: {resp.status}")
            if resp.status == 200:
                data = await resp.json()
                print(f"Name: {data.get('name')}")
                print(f"Collection: {data.get('collection_name')}")
                print(f"Attributes: {data.get('attributes')}")
            else:
                print(await resp.text())

if __name__ == "__main__":
    asyncio.run(main())
