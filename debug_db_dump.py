
import sqlite3
import json

def inspect_db():
    conn = sqlite3.connect('database.db')
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    print("--- Inspecting ITEMS table ---")
    cursor.execute("SELECT id, type, nft_address, title, original_price, price_per_day, metadata FROM items ORDER BY id DESC LIMIT 5")
    rows = cursor.fetchall()
    
    for row in rows:
        print(f"ID: {row['id']}")
        print(f"Type: {row['type']}")
        print(f"Title: {row['title']}")
        print(f"Original Price: {row['original_price']}")
        print(f"Price Per Day: {row['price_per_day']}")
        print(f"My Calculation (Markup): {calculate_markup(row['original_price']) if row['original_price'] else 'N/A'}")
        
        meta = row['metadata']
        print(f"Metadata (raw): {meta[:100]}..." if meta else "Metadata: None")
        if meta:
            try:
                m = json.loads(meta)
                print(f"Parsed Meta keys: {list(m.keys())}")
                print(f"Model: {m.get('model')}")
                print(f"Backdrop: {m.get('backdrop')}")
            except:
                print("Failed to parse JSON metadata")
        print("-" * 30)

    conn.close()

def calculate_markup(price_ton):
    if price_ton is None: return 0
    price_ton = float(price_ton)
    if price_ton <= 0.10: markup = 0.05
    elif price_ton <= 0.25: markup = 0.10
    elif price_ton <= 0.50: markup = 0.15
    elif price_ton <= 1.00: markup = 0.25
    elif price_ton <= 2.50: markup = 0.45
    elif price_ton <= 5.00: markup = 0.75
    else: markup = 1.00
    return price_ton + markup

if __name__ == "__main__":
    inspect_db()
