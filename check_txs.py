import asyncio
import binascii
import datetime
from tonutils.client import ToncenterV2Client

async def s():
    c = ToncenterV2Client(base_url='https://toncenter.com', api_key='')
    addr = 'UQBxgCx_WJ4_fKgz8tec73NZadhoDzV250-Y0taVPJstZsRl'
    print(f"Checking wallet: {addr}")
    txs = await c.get_transactions(addr, limit=50)
    for tx in txs:
        t = datetime.datetime.fromtimestamp(tx.now)
        amount = 0
        if tx.in_msg and hasattr(tx.in_msg.info, "value_coins"):
            amount = tx.in_msg.info.value_coins / 1e9
        
        tx_hash = binascii.hexlify(tx.cell.hash).decode()
        print(f"[{t}] {amount} TON | Hash: {tx_hash}")

if __name__ == "__main__":
    asyncio.run(s())
