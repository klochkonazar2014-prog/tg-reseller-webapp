import asyncio
import aiohttp
import parser

async def main():
    async with aiohttp.ClientSession() as session:
        await parser.update_filters_cache(session)

if __name__ == "__main__":
    asyncio.run(main())
