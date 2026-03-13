
import sqlite3
import json

def check_db():
    try:
        conn = sqlite3.connect('c:/arenda bot/database.db')
        conn.row_factory = sqlite3.Row
        cur = conn.execute("SELECT * FROM orders ORDER BY id DESC LIMIT 5")
        rows = [dict(row) for row in cur.fetchall()]
        print(json.dumps(rows, indent=2, ensure_ascii=False))
        conn.close()
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    check_db()
