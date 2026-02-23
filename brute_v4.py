import binascii
from tonutils.wallet import WalletV4R2, WalletV5R1
from tonutils.client import ToncenterV2Client

def check():
    hex_k = 'fca26002c12f3916cbc6a4d916e7c7fef8ccad53180ffb3b20eb4111a99913826f13efdfb781e9e9c9ddfa2f80f73f5297a30fee4d25da23f62f41260400c500'
    target = 'UQBxgCx_WJ4_fKgz8tec73NZadhoDzV250-Y0taVPJstZsRl'
    
    fk = binascii.unhexlify(hex_k)
    pk = fk[:32]
    pub = fk[32:]
    
    c = ToncenterV2Client(base_url='', api_key='')
    
    base_id_v4 = 698983191
    print(f"Brute forcing V4R2 wallet_id around {base_id_v4}")
    for i in range(-500, 500):
        w = WalletV4R2(c, pk, pub, wallet_id=base_id_v4 + i)
        if target[3:] in str(w.address):
            print(f"FOUND V4R2! wallet_id: {base_id_v4 + i}")
            return
            
    print("Brute forcing V5R1 wallet_id")
    for i in range(2147483409 - 100, 2147483409 + 100):
        w = WalletV5R1(c, pk, pub, wallet_id=i)
        if target[3:] in w.address.to_str(is_bounceable=False):
            print(f"FOUND V5R1! wallet_id: {i}")
            return
            
if __name__ == "__main__":
    check()
