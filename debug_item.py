import sqlite3
conn = sqlite3.connect('database.db')
cursor = conn.cursor()
addr = 'EQCF78apJXdImx0B3n_nAS9lI7wlldpVAuBnSYU5fZUdVLHA'
cursor.execute("SELECT * FROM items WHERE nft_address = ?", (addr,))
item = cursor.fetchone()
if item:
    print(f"Item in items table: {dict(zip([d[0] for d in cursor.description], item))}")
else:
    print(f"Item {addr} NOT FOUND in items table")
conn.close()
