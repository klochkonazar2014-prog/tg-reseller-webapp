import sqlite3
import os

DB_PATH = "database.db"

def check_order():
    if not os.path.exists(DB_PATH):
        print(f"Error: {DB_PATH} not found")
        return
        
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    print("--- ORDER 6 INFO ---")
    cursor.execute("SELECT * FROM orders WHERE id = 6")
    row = cursor.fetchone()
    if row:
        for key in row.keys():
            print(f"{key}: {row[key]}")
    else:
        print("Order #6 not found in DB")
        
    print("\n--- PENDING ORDERS ---")
    cursor.execute("SELECT * FROM orders WHERE status = 'pending_payment'")
    rows = cursor.fetchall()
    for r in rows:
        print(f"ID: {r['id']}, Total: {r['total_price']}, NFT: {r['nft_address']}")

    conn.close()

if __name__ == "__main__":
    check_order()
