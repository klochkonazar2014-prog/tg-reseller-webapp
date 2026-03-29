import sqlite3
import os

DB_PATH = "c:\\arenda bot\\database.db"

def find_pepe():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    cursor.execute("SELECT nft_address, status, rent_ends_at FROM items WHERE title LIKE ?", ("%Plush Pepe #2451%",))
    row = cursor.fetchone()
    if row:
        print(f"Address: {row['nft_address']}")
        print(f"Status in DB: {row['status']}")
        print(f"Rent ends at: {row['rent_ends_at']}")
    else:
        print("Not found")
    conn.close()

if __name__ == "__main__":
    find_pepe()
