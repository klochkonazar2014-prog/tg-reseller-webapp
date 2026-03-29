import sqlite3
import time
import os

DB_PATH = "c:\\arenda bot\\database.db"

def check_rented_stats():
    if not os.path.exists(DB_PATH):
        print(f"Error: Database not found at {DB_PATH}")
        return

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    now = int(time.time())
    
    # 1. Total rented
    cursor.execute("SELECT COUNT(*) FROM items WHERE status = 'rented'")
    total_rented = cursor.fetchone()[0]
    
    # 2. Expired but still marked as rented
    cursor.execute("SELECT COUNT(*) FROM items WHERE status = 'rented' AND rent_ends_at < ?", (now,))
    expired_rented = cursor.fetchone()[0]
    
    # 3. Sample of expired items
    cursor.execute("SELECT title, rent_ends_at FROM items WHERE status = 'rented' AND rent_ends_at < ? LIMIT 5", (now,))
    samples = cursor.fetchall()
    
    print(f"--- DATABASE STATS ---")
    print(f"Current Time (Unix): {now}")
    print(f"Total items with status='rented': {total_rented}")
    print(f"Items with 'СРОК ИСТЕК' (expired): {expired_rented}")
    
    if samples:
        print("\nFirst 5 expired items:")
        for s in samples:
            diff = now - int(s['rent_ends_at'])
            print(f"- {s['title']} (Expired {diff} seconds ago)")
    
    conn.close()

if __name__ == "__main__":
    check_rented_stats()
