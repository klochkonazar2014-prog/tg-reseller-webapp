import os
from dotenv import load_dotenv
load_dotenv()

vars = ["OWNER_WALLET", "OWNER_SEED", "OWNER_HEX_KEY"]
for v in vars:
    val = os.getenv(v)
    if val:
        print(f"{v}: {val[:10]}...{val[-10:] if len(val)>10 else ''} (Length: {len(val)})")
    else:
        print(f"{v}: NOT SET")
