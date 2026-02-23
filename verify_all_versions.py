import binascii
from tonutils.wallet import WalletV3R1, WalletV3R2, WalletV4R1, WalletV4R2, WalletV5R1
from tonutils.client import ToncenterV2Client

def v():
    hex_k = 'fca26002c12f3916cbc6a4d916e7c7fef8ccad53180ffb3b20eb4111a99913826f13efdfb781e9e9c9ddfa2f80f73f5297a30fee4d25da23f62f41260400c500'
    fk = binascii.unhexlify(hex_k)
    p = fk[:32]
    pub = fk[32:]
    c = ToncenterV2Client(base_url='', api_key='')
    
    targets = [
        'UQBxgCx_WJ4_fKgz8tec73NZadhoDzV250-Y0taVPJstZsRl', # OLD
        'UQAotn3cT26kUKW5wSpP9dYKxwEQQ0qffDB24HGzuBrJ5PFB'  # NEW
    ]
    
    print(f"Checking HEX: {hex_k[:10]}...")
    
    versions = [WalletV3R1, WalletV3R2, WalletV4R1, WalletV4R2, WalletV5R1]
    for target in targets:
        print(f"\nTargeting: {target}")
        base = target[3:] # ignore prefix
        for ver in versions:
            try:
                if ver == WalletV5R1:
                    w = ver(c, p, pub, wallet_id=2147483409)
                else:
                    w = ver(c, p, pub)
                
                addr = str(w.address)
                # Check for substring match to handle bounceable/non-bounceable
                if base in addr:
                    print(f"!!! MATCH !!! {ver.__name__} matches {target}")
                else:
                    print(f"- {ver.__name__}: {addr}")
            except Exception as e:
                print(f"- {ver.__name__}: ERROR {e}")

if __name__ == "__main__":
    v()
