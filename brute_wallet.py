import binascii
from tonutils.wallet import WalletV5R1, WalletV4R2
from tonutils.client import ToncenterV2Client

def check():
    hex_k = 'fca26002c12f3916cbc6a4d916e7c7fef8ccad53180ffb3b20eb4111a99913826f13efdfb781e9e9c9ddfa2f80f73f5297a30fee4d25da23f62f41260400c500'
    target = 'UQBxgCx_WJ4_fKgz8tec73NZadhoDzV250-Y0taVPJstZsRl'.replace('UQB', 'EQB')
    
    fk = binascii.unhexlify(hex_k)
    pk = fk[:32]
    pub = fk[32:]
    
    c = ToncenterV2Client(base_url='', api_key='')
    
    print(f"Target (Bounceable): {target}")
    
    # Check V5R1 with common Wallet IDs
    ids = [2147483409, 2147483647, 693, 0, 1]
    for i in ids:
        w = WalletV5R1(c, pk, pub, wallet_id=i)
        addr = str(w.address)
        print(f"V5R1 ID {i}: {addr}")
        if addr == target:
            print("!!! MATCH FOUND !!!")

if __name__ == "__main__":
    check()
