
import sqlite3
import json

def inspect_db():
    conn = sqlite3.connect('database.db')
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    print("--- Inspecting ITEMS with price <= 0.01 ---")
    cursor.execute("SELECT id, type, nft_address, title, original_price, price_per_day, metadata FROM items WHERE price_per_day <= 0.01 LIMIT 5")
    rows = cursor.fetchall()
    
    if not rows:
        print("No items found with price <= 0.01")
    
    for row in rows:
        print(f"ID: {row['id']}")
        print(f"Type: {row['type']}")
        print(f"Title: {row['title']}")
        print(f"Original Price: {row['original_price']}")
        print(f"Price Per Day: {row['price_per_day']}")
        
        meta = row['metadata']
        print(f"Metadata (raw): {meta[:100]}..." if meta else "Metadata: None")
        print("-" * 30)

    conn.close()

if __name__ == "__main__":
    inspect_db()
