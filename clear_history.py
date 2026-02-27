import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "database.db")

def clear_orders():
    if not os.path.exists(DB_PATH):
        print(f"Error: Database {DB_PATH} not found.")
        return
    
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        print("Clearing 'orders' table...")
        cursor.execute("DELETE FROM orders")
        
        print("Resetting 'orders' autoincrement ID...")
        cursor.execute("DELETE FROM sqlite_sequence WHERE name='orders'")
        
        conn.commit()
        conn.close()
        print("Success: Order history cleared successfully.")
    except Exception as e:
        print(f"Error clearing history: {e}")

if __name__ == "__main__":
    clear_orders()
