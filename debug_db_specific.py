
import sqlite3
import json

def inspect_specific_item():
    conn = sqlite3.connect('database.db')
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    print("--- Inspecting 'Input Key' items ---")
    cursor.execute("SELECT id, type, nft_address, title, original_price, price_per_day, metadata FROM items WHERE title LIKE '%Input Key%' LIMIT 5")
    rows = cursor.fetchall()
    
    if not rows:
        print("No 'Input Key' items found.")
    
    for row in rows:
        print(f"ID: {row['id']}")
        print(f"Title: {row['title']}")
        print(f"Price Per Day: {row['price_per_day']}")
        print(f"Metadata: {row['metadata']}")
        print("-" * 30)

    conn.close()

if __name__ == "__main__":
    inspect_specific_item()
