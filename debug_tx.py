import asyncio
import binascii
from tonutils.client import ToncenterV2Client
import os
from dotenv import load_dotenv

load_dotenv()
OWNER_WALLET_ADDR = os.getenv("OWNER_WALLET")

async def check_tx():
    client = ToncenterV2Client(base_url="https://toncenter.com", api_key="")
    tx_hash = "25805ea40dfe61301871b8bb1134e0ad109a22356bf9f22eec5a8834d0487a08"
    
    print(f"Checking transaction: {tx_hash}")
    # get_transactions doesn't take hash directly in v2 easily without more calls
    # but we can search in recent transactions
    txs = await client.get_transactions(OWNER_WALLET_ADDR, limit=50)
    for tx in txs:
        h = binascii.hexlify(tx.cell.hash).decode()
        if h == tx_hash:
            print("MATCH FOUND!")
            print(f"Time: {tx.now}")
            if tx.in_msg:
                val = tx.in_msg.info.value_coins / 1e9
                print(f"Value: {val} TON")
                if tx.in_msg.body:
                    try:
                        reader = tx.in_msg.body.begin_parse()
                        if len(reader) >= 32:
                            op = reader.load_uint(32)
                            print(f"OpCode: {op}")
                            if op == 0:
                                memo = reader.load_string()
                                print(f"Memo: '{memo}'")
                            else:
                                print(f"Non-zero opcode. Bits left: {len(reader)}")
                        else:
                            print(f"Body too short for opcode: {len(reader)} bits")
                    except Exception as e:
                        print(f"Parse error: {e}")
            return
    print("Transaction not found in last 50")

if __name__ == "__main__":
    asyncio.run(check_tx())
