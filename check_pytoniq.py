import asyncio
from pytoniq import WalletV4R2, WalletV5R1

async def main():
    seed = 'fee smart race expose spray differ couple strike jewel solution display wedding lady sorry fit neck armed unusual entire target walk foot that hurry'.split()
    
    w4, _, _, _ = await WalletV4R2.from_mnemonic(None, seed)
    print('V4R2:', w4.address.to_str(is_bounceable=False))
    
    w5, _, _, _ = await WalletV5R1.from_mnemonic(None, seed)
    print('V5R1:', w5.address.to_str(is_bounceable=False))

if __name__ == '__main__':
    asyncio.run(main())
