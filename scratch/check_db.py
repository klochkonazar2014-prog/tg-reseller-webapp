import sqlite3
import json

def check():
    conn = sqlite3.connect('database.db')
    cursor = conn.cursor()
    
    # Таблицы
    print("--- TABLES ---")
    tables = cursor.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
    for t in tables:
        print(f"Table: {t[0]}")
        cols = cursor.execute(f"PRAGMA table_info({t[0]})").fetchall()
        for c in cols:
            print(f"  Col: {c[1]} ({c[2]})")
            
    # Пример данных из items
    print("\n--- ITEM EXAMPLE ---")
    item = cursor.execute("SELECT * FROM items LIMIT 1").fetchone()
    if item:
        print(item)
    
    conn.close()

if __name__ == "__main__":
    check()
