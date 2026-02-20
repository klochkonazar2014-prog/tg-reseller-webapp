import sqlite3
import json
import sys

db_path = "c:\\arenda bot\\database.db"

if len(sys.argv) < 2:
    print("Usage: python query_db.py \"SELECT ...\"")
    sys.exit(1)

query = sys.argv[1]

try:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute(query)
    rows = cursor.fetchall()
    
    results = []
    for row in rows:
        results.append(dict(row))
    
    print(json.dumps(results, indent=2, ensure_ascii=False))
    conn.close()
except Exception as e:
    print(f"Error: {e}")
