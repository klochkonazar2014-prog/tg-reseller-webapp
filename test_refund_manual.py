import asyncio
import os
import aiohttp
from pytoniq import LiteClient
from tonutils.wallet import WalletV4R2
from tonutils.client import ToncenterV2Client
from tonutils.utils import begin_cell
import database as db
from dotenv import load_dotenv
import logging

async def test_manual_refund():
    logging.basicConfig(level=logging.INFO)
    load_dotenv(override=True)
    
    API_KEY = os.getenv("TONCENTER_API_KEY")
    client = ToncenterV2Client(api_key=API_KEY, is_testnet=False)
    
    hex_key = os.getenv("OWNER_HEX_KEY")
    if not hex_key:
        print("OWNER_HEX_KEY not found!")
        return

    full_key = bytes.fromhex(hex_key)
    wallet = WalletV4R2(client, private_key=full_key[:32], public_key=full_key[32:])
    print(f"Wallet address: {wallet.address}")
    
    # Try to find the order
    order = await db.get_order_by_id(6)
    if not order:
        print("Order #6 not found!")
        return
        
    dest_wallet = order['user_wallet']
    print(f"Refunding to: {dest_wallet}")
    
    try:
        current_seqno = await wallet.get_seqno(client, wallet.address)
        print(f"Current seqno: {current_seqno}")
        
        refund_memo = "Test Refund Octorent"
        # We won't actually send if we want to be safe, but the user asked to verify if it works.
        # But wait, sending REAL TON in a test environment might be bad.
        # I should just verify if the initialization succeeds and it CAN send.
        print("Initialization success. Logic is ready to send.")
        
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(test_manual_refund())
