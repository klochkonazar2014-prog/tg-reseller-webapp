import sqlite3
conn = sqlite3.connect('database.db')
cursor = conn.cursor()
cursor.execute("SELECT id, nft_address, status FROM items WHERE status = 'rented'")
rows = cursor.fetchall()
print(f"Items with status 'rented': {rows}")

cursor.execute("SELECT DISTINCT status FROM items")
statuses = cursor.fetchall()
print(f"Distinct statuses in items: {statuses}")
conn.close()
