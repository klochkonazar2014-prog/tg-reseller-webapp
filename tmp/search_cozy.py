import sqlite3
import json
import time
import os

DB_PATH = "c:\\arenda bot\\database.db"

def search_cozy_pepe():
    if not os.path.exists(DB_PATH):
        print("DB not found")
        return
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    now = int(time.time())
    
    cursor.execute("SELECT * FROM items WHERE title LIKE '%Plush Pepe%'")
    rows = cursor.fetchall()
    
    found = []
    for row in rows:
        try:
            meta = json.loads(row['metadata'])
            model = meta.get("model", "").lower()
            if "cozy" in model:
                found.append(row)
        except: continue

    print(f"--- COZY PEPE SEARCH ---")
    print(f"Current time: {now}")
    
    expired_count = 0
    for f in found:
        status = f['status']
        end_time = f['rent_ends_at']
        is_expired = end_time and int(end_time) < now
        if is_expired: expired_count += 1
        print(f"- {f['title']} | Status: {status} | EndTime: {end_time} | Expired: {is_expired}")

    print(f"\nTotal Cozy Pepes found: {len(found)}")
    print(f"Expired Cozy Pepes: {expired_count}")
    conn.close()

if __name__ == "__main__":
    search_cozy_pepe()
