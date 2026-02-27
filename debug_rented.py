import sqlite3
conn = sqlite3.connect('database.db')
cursor = conn.cursor()
cursor.execute("SELECT COUNT(*) FROM items WHERE status = 'rented'")
count = cursor.fetchone()[0]
print(f"Rented items in items table: {count}")

cursor.execute("SELECT nft_address, status FROM items WHERE status = 'rented'")
items = cursor.fetchall()
print(f"Rented items: {items}")

cursor.execute("SELECT nft_address, status FROM orders WHERE status = 'rented'")
orders = cursor.fetchall()
print(f"Rented orders: {orders}")
conn.close()
