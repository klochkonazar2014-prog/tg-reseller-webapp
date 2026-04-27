import sqlite3
import time
import sys
from datetime import datetime

# Set encoding for Windows console
if sys.platform == 'win32':
    import codecs
    sys.stdout = codecs.getwriter('utf-8')(sys.stdout.detach())

def check_lots():
    try:
        conn = sqlite3.connect('database.db')
        conn.row_factory = sqlite3.Row
        
        print("="*40)
        print(f"STATS (at {datetime.now().strftime('%H:%M:%S')})")
        print("="*40)
        
        # 1. Total
        total = conn.execute("SELECT COUNT(*) FROM items").fetchone()[0]
        print(f"Total items in DB: {total}")
        
        # 2. By types
        types = conn.execute("SELECT type, COUNT(*) as cnt FROM items GROUP BY type").fetchall()
        print("\nCategories:")
        for t in types:
            t_name = {
                'gift': 'Gifts',
                'username': 'Usernames',
                'number': 'Numbers'
            }.get(t['type'], t['type'])
            print(f"  - {t_name}: {t['cnt']}")
            
        # 3. By statuses
        statuses = conn.execute("SELECT status, COUNT(*) as cnt FROM items GROUP BY status").fetchall()
        print("\nStatuses:")
        for s in statuses:
            s_name = {
                'available': 'Available',
                'rented': 'Rented',
                'awaiting_relist': 'Awaiting Relist',
                'for_rent': 'In Rent (Fragment)',
                'for_sale_and_rent': 'Sale + Rent'
            }.get(s['status'], s['status'])
            print(f"  - {s_name}: {s['cnt']}")
            
        # 4. Rent details
        now = int(time.time())
        active_rented = conn.execute("SELECT COUNT(*) FROM items WHERE status = 'rented' AND rent_ends_at > ?", (now,)).fetchone()[0]
        expired_rented = conn.execute("SELECT COUNT(*) FROM items WHERE status = 'rented' AND (rent_ends_at <= ? OR rent_ends_at IS NULL)", (now,)).fetchone()[0]
        
        print("\nRent Details:")
        print(f"  - Active now: {active_rented}")
        print(f"  - Expired (waiting cleanup): {expired_rented}")
        
        # 5. Last update
        last_item = conn.execute("SELECT title, type, last_updated FROM items ORDER BY last_updated DESC LIMIT 1").fetchone()
        if last_item:
            print(f"\nLast updated item: {last_item['title']} ({last_item['type']})")
        
        print("="*40)
        
    except Exception as e:
        print(f"Error reading DB: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    check_lots()
