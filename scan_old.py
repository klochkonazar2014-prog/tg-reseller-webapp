import asyncio
import binascii
from tonutils.client import ToncenterV2Client
import os
import datetime

async def scan():
    client = ToncenterV2Client(base_url="https://toncenter.com", api_key="")
    old_wallet = "UQBxgCx_WJ4_fKgz8tec73NZadhoDzV250-Y0taVPJstZsRl"
    print(f"Scanning OLD wallet: {old_wallet}")
    
    txs = await client.get_transactions(old_wallet, limit=100)
    for tx in txs:
        t = datetime.datetime.fromtimestamp(tx.now)
        h = binascii.hexlify(tx.cell.hash).decode()
        if tx.in_msg and hasattr(tx.in_msg.info, "value_coins") and tx.in_msg.info.value_coins > 0:
            val = tx.in_msg.info.value_coins / 1e9
            memo = "N/A"
            if tx.in_msg.body:
                try:
                    reader = tx.in_msg.body.begin_parse()
                    if len(reader) >= 32:
                        op = reader.load_uint(32)
                        if op == 0: memo = reader.load_string()
                except: pass
            
            if 0.25 <= val <= 0.27 or "order" in str(memo).lower():
                print(f"[{t}] {val} TON | Memo: {memo} | Hash: {h}")

if __name__ == "__main__":
    asyncio.run(scan())
