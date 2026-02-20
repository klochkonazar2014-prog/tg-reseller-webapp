import sqlite3, json

# 1. Models from DB
conn = sqlite3.connect('database.db')
conn.row_factory = sqlite3.Row
rows = conn.execute("SELECT metadata FROM items WHERE title LIKE 'Bling Binky %'").fetchall()
db_models = set()
for r in rows:
    m = json.loads(r['metadata'] or '{}')
    if 'model' in m:
        db_models.add(m['model'])

# 2. Models from Cache
with open('filters_cache.json', 'r', encoding='utf-8') as f:
    cache = json.load(f)

cache_models = set(cache['models_map'].get('Bling Binkies', []))

print('DB Models:', sorted(list(db_models)))
print('---')
print('Cache Models:', sorted(list(cache_models)))
print('---')
print('In DB but not in Cache:', db_models - cache_models)
print('In Cache but not in DB:', cache_models - db_models)
