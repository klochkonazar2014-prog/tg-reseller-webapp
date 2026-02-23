import asyncio
import binascii
from tonutils.client import ToncenterV2Client
import os
import datetime
from dotenv import load_dotenv

load_dotenv()
OWNER_WALLET_ADDR = os.getenv("OWNER_WALLET")

async def scan_wallet():
    client = ToncenterV2Client(base_url="https://toncenter.com", api_key="")
    print(f"Scanning wallet: {OWNER_WALLET_ADDR}")
    
    txs = await client.get_transactions(OWNER_WALLET_ADDR, limit=100)
    print(f"Found {len(txs)} transactions.")
    
    for tx in txs:
        t = datetime.datetime.fromtimestamp(tx.now)
        h = binascii.hexlify(tx.cell.hash).decode()
        
        # Only interested in incoming with value
        if tx.in_msg and hasattr(tx.in_msg.info, "value_coins") and tx.in_msg.info.value_coins > 0:
            val = tx.in_msg.info.value_coins / 1e9
            memo = "N/A"
            if tx.in_msg.body:
                try:
                    reader = tx.in_msg.body.begin_parse()
                    if len(reader) >= 32:
                        op = reader.load_uint(32)
                        if op == 0:
                            memo = reader.load_string()
                        else:
                            memo = f"Op:{op}"
                except: pass
            
            # Print if it's around 0.26 or has "order" in memo
            if 0.25 <= val <= 0.27 or "order" in str(memo).lower():
                print(f"[{t}] {val} TON | Memo: {memo} | Hash: {h[:15]}...")
        else:
            # Still print tx info to see where we are in time
            # print(f"[{t}] Outgoing/Empty | Hash: {h[:10]}...")
            pass

if __name__ == "__main__":
    asyncio.run(scan_wallet())
