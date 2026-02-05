
import sqlite3
import json

def inspect_db():
    conn = sqlite3.connect('database.db')
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    print("--- Inspecting GIFTS with empty metadata ---")
    cursor.execute("SELECT id, type, nft_address, title, price_per_day, metadata FROM items WHERE type='gift' AND (metadata IS NULL OR metadata = '' OR metadata = '{}') LIMIT 10")
    rows = cursor.fetchall()
    
    if not rows:
        print("No gifts found with empty metadata")
    
    for row in rows:
        print(f"ID: {row['id']}")
        print(f"Title: {row['title']}")
        print(f"Meta: '{row['metadata']}'")
        print("-" * 30)

    conn.close()

if __name__ == "__main__":
    inspect_db()
