import asyncio
import binascii
from tonutils.wallet import WalletV5R1
from tonutils.client import ToncenterV2Client
from tonutils.utils import Address

async def main():
    fk = binascii.unhexlify('fca26002c12f3916cbc6a4d916e7c7fef8ccad53180ffb3b20eb4111a99913826f13efdfb781e9e9c9ddfa2f80f73f5297a30fee4d25da23f62f41260400c500')
    c = ToncenterV2Client(base_url='https://toncenter.com/api/v2/', api_key='')
    w = WalletV5R1(c, fk[:32], fk[32:], wallet_id=2147483409)
    w.address = Address('UQBxgCx_WJ4_fKgz8tec73NZadhoDzV250-Y0taVPJstZsRl')
    
    seqno = await w.get_seqno()
    print(f"Success! Seqno is: {seqno}")

if __name__ == "__main__":
    asyncio.run(main())
