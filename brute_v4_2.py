import binascii
from tonutils.wallet import WalletV4R2, WalletV5R1
from tonutils.client import ToncenterV2Client

def check():
    hex_k = 'd6946a9cd84317cbde1b8152897d20ef1c258e6293a8d0ba905a53ff03c4515fe004d98b148758b341e8f59da75d9a6a10b8189f6a2f369602209b837ca089f2'
    target = 'UQDCk4vJw56meJysC5O7OARFIUfshYNe-2d38hS6ZBCYy_Rs'
    
    fk = binascii.unhexlify(hex_k)
    pk = fk[:32]
    pub = fk[32:]
    
    c = ToncenterV2Client(base_url='', api_key='')
    
    base_id_v4 = 698983191
    print(f"Brute forcing V4R2 wallet_id around {base_id_v4}")
    for i in range(-5000, 5000):
        w = WalletV4R2(c, pk, pub, wallet_id=base_id_v4 + i)
        if target[3:] in w.address.to_str(is_bounceable=False):
            print(f"FOUND V4R2! wallet_id: {base_id_v4 + i}")
            return
            
    print("Brute forcing V5R1 wallet_id")
    for i in range(2147483409 - 5000, 2147483409 + 5000):
        w = WalletV5R1(c, pk, pub, wallet_id=i)
        if target[3:] in w.address.to_str(is_bounceable=False):
            print(f"FOUND V5R1! wallet_id: {i}")
            return
            
    print("Not found in normal range. Trying 0-10000 for V4...")
    for i in range(10000):
        w = WalletV4R2(c, pk, pub, wallet_id=i)
        if target[3:] in w.address.to_str(is_bounceable=False):
            print(f"FOUND V4R2! wallet_id: {i}")
            return
            
    print("Not found")
            
if __name__ == "__main__":
    check()
