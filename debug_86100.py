
import sqlite3

def inspect_86100():
    conn = sqlite3.connect('database.db')
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    print("--- Inspecting Input Key #86100 ---")
    cursor.execute("SELECT * FROM items WHERE title LIKE '%#86100%'")
    row = cursor.fetchone()
    
    if row:
        print(f"ID: {row['id']}")
        print(f"Title: {row['title']}")
        print(f"Price Per Day: {row['price_per_day']}")
        print(f"Metadata: {row['metadata']}")
    else:
        print("Item not found!")

    conn.close()

if __name__ == "__main__":
    inspect_86100()
