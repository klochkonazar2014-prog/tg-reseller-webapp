import sqlite3

def get_stats():
    try:
        conn = sqlite3.connect('database.db')
        conn.row_factory = sqlite3.Row
        
        # Check orders count
        count = conn.execute("SELECT COUNT(*) FROM orders").fetchone()[0]
        
        # Current Active Balance in TON
        volume = conn.execute("SELECT SUM(total_price) FROM orders WHERE status IN ('rented', 'active', 'paid')").fetchone()[0]
        
        # Average price per order
        avg = conn.execute("SELECT AVG(total_price) FROM orders WHERE status IN ('rented', 'active', 'paid')").fetchone()[0]
        
        print(f"Total Orders: {count}")
        print(f"Total Active Volume (TON): {volume}")
        print(f"Average Price (TON): {avg}")
        
    except Exception as e:
        print(f"Error: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    get_stats()
