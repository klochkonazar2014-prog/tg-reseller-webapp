
import sqlite3
import json

def inspect_db():
    conn = sqlite3.connect('database.db')
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    print("--- Inspecting GIFTS with missing 'model' key in metadata ---")
    cursor.execute("SELECT id, title, metadata FROM items WHERE type='gift'")
    rows = cursor.fetchall()
    
    found = 0
    for row in rows:
        meta_str = row['metadata']
        if not meta_str: continue
        try:
            m = json.loads(meta_str)
            if 'model' not in m:
                print(f"ID: {row['id']} | Title: {row['title']}")
                print(f"Meta: {meta_str}")
                found += 1
                if found > 5: break
        except:
            pass
            
    if found == 0:
        print("No gifts found with missing 'model' key")

    conn.close()

if __name__ == "__main__":
    inspect_db()
