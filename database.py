import aiosqlite
import os
import json

DB_PATH = os.path.join(os.path.dirname(__file__), "database.db")

async def init_db():
    async with aiosqlite.connect(DB_PATH, timeout=30) as db:
        await db.execute("PRAGMA journal_mode=WAL")
        await db.execute("""
            CREATE TABLE IF NOT EXISTS users (
                user_id INTEGER PRIMARY KEY,
                balance REAL DEFAULT 0,
                total_spent REAL DEFAULT 0,
                is_admin INTEGER DEFAULT 0,
                join_date DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                type TEXT,
                nft_address TEXT,
                title TEXT,
                original_price REAL,
                price_per_day REAL,
                min_duration INTEGER DEFAULT 86400,
                max_duration INTEGER DEFAULT 2592000,
                status TEXT DEFAULT 'available',
                auto_relist INTEGER DEFAULT 1, -- 1 if seller enabled auto relisting
                description TEXT,
                metadata TEXT
            )
        """)
        
        # Simple migration: add columns if they don't exist
        async with db.execute("PRAGMA table_info(items)") as cursor:
            cols = [row[1] for row in await cursor.fetchall()]
            if 'min_duration' not in cols:
                await db.execute("ALTER TABLE items ADD COLUMN min_duration INTEGER DEFAULT 86400")
            if 'max_duration' not in cols:
                await db.execute("ALTER TABLE items ADD COLUMN max_duration INTEGER DEFAULT 2592000")
            if 'rent_ends_at' not in cols:
                await db.execute("ALTER TABLE items ADD COLUMN rent_ends_at INTEGER")
            if 'last_updated' not in cols:
                await db.execute("ALTER TABLE items ADD COLUMN last_updated DATETIME")
            if 'auto_relist' not in cols:
                await db.execute("ALTER TABLE items ADD COLUMN auto_relist INTEGER DEFAULT 1")

        await db.commit()
        await db.execute("""
            CREATE TABLE IF NOT EXISTS orders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                nft_address TEXT,
                nft_name TEXT,
                days INTEGER,
                total_price REAL,
                status TEXT DEFAULT 'pending_payment', -- pending_payment, paid, rented, active, expired
                tc_link TEXT, -- Ссылка tc:// с Фрагмента
                tx_hash TEXT, -- Хеш транзакции оплаты
                is_preorder INTEGER DEFAULT 0, -- 1 if item was rented when order was created
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)
        async with db.execute("PRAGMA table_info(orders)") as cursor:
            cols = [row[1] for row in await cursor.fetchall()]
            if 'tx_hash' not in cols:
                await db.execute("ALTER TABLE orders ADD COLUMN tx_hash TEXT")
            if 'is_preorder' not in cols:
                await db.execute("ALTER TABLE orders ADD COLUMN is_preorder INTEGER DEFAULT 0")

        await db.commit()

async def add_user(user_id):
    async with aiosqlite.connect(DB_PATH, timeout=30) as db:
        await db.execute("PRAGMA journal_mode=WAL")
        await db.execute("INSERT OR IGNORE INTO users (user_id) VALUES (?)", (user_id,))
        await db.commit()

async def get_items_by_type(item_type):
    async with aiosqlite.connect(DB_PATH, timeout=30) as db:
        await db.execute("PRAGMA journal_mode=WAL")
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM items WHERE type = ? AND status = 'available'", (item_type,)) as cursor:
            return await cursor.fetchall()

async def get_unique_models():
    async with aiosqlite.connect(DB_PATH, timeout=30) as db:
        await db.execute("PRAGMA journal_mode=WAL")
        async with db.execute("SELECT metadata FROM items WHERE type = 'gift' AND status = 'available'") as cursor:
            rows = await cursor.fetchall()
            models = set()
            for row in rows:
                try:
                    meta = json.loads(row[0])
                    models.add(meta.get("collection"))
                except: continue
            return sorted(list(models))

async def get_items_by_model(model_name):
    async with aiosqlite.connect(DB_PATH, timeout=30) as db:
        await db.execute("PRAGMA journal_mode=WAL")
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM items WHERE type = 'gift' AND status = 'available'") as cursor:
            rows = await cursor.fetchall()
            filtered = []
            for row in rows:
                try:
                    meta = json.loads(row['metadata'])
                    if meta.get("collection") == model_name:
                        filtered.append(row)
                except: continue
            return filtered

async def get_item_by_id(item_id):
    async with aiosqlite.connect(DB_PATH, timeout=30) as db:
        await db.execute("PRAGMA journal_mode=WAL")
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM items WHERE id = ?", (item_id,)) as cursor:
            return await cursor.fetchone()

async def get_item_by_id_addr(addr):
    """Поиск по адресу NFT (для LIVE режима)"""
    async with aiosqlite.connect(DB_PATH, timeout=30) as db:
        await db.execute("PRAGMA journal_mode=WAL")
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM items WHERE nft_address = ?", (addr,)) as cursor:
            return await cursor.fetchone()

async def sync_item(nft_address, item_type, title, original_price=None, price_per_day=None, min_duration=86400, max_duration=2592000, description="", metadata="", status='available', rent_ends_at=None, auto_relist=1):
    async with aiosqlite.connect(DB_PATH, timeout=30) as db:
        await db.execute("PRAGMA journal_mode=WAL")
        async with db.execute("SELECT id FROM items WHERE nft_address = ?", (nft_address,)) as cursor:
            row = await cursor.fetchone()
            if row:
                if metadata: 
                    await db.execute("UPDATE items SET metadata = ? WHERE nft_address = ?", (metadata, nft_address))
                
                # Update prices & durations
                if original_price is not None and price_per_day is not None:
                    await db.execute("UPDATE items SET original_price = ?, price_per_day = ?, min_duration = ?, max_duration = ?, status = ?, rent_ends_at = ?, auto_relist = ?, last_updated = CURRENT_TIMESTAMP WHERE nft_address = ?", 
                                   (original_price, price_per_day, min_duration, max_duration, status, rent_ends_at, auto_relist, nft_address))
                else:
                    await db.execute("UPDATE items SET status = ?, rent_ends_at = ?, auto_relist = ?, last_updated = CURRENT_TIMESTAMP WHERE nft_address = ?", (status, rent_ends_at, auto_relist, nft_address))
            else:
                # For new items
                op = original_price if original_price is not None else 0
                ppd = price_per_day if price_per_day is not None else 0
                await db.execute("INSERT INTO items (type, nft_address, title, original_price, price_per_day, min_duration, max_duration, description, metadata, status, rent_ends_at, auto_relist, last_updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)", 
                               (item_type, nft_address, title, op, ppd, min_duration, max_duration, description, metadata, status, rent_ends_at, auto_relist))
        await db.commit()

async def mark_all_unavailable():
    async with aiosqlite.connect(DB_PATH, timeout=30) as db:
        await db.execute("PRAGMA journal_mode=WAL")
        await db.execute("UPDATE items SET status = 'unavailable'")
        await db.commit()

async def create_order(user_id, nft_address, nft_name, days, total_price, is_preorder=0):
    async with aiosqlite.connect(DB_PATH, timeout=30) as db:
        await db.execute("PRAGMA journal_mode=WAL")
        cursor = await db.execute(
            "INSERT INTO orders (user_id, nft_address, nft_name, days, total_price, is_preorder) VALUES (?, ?, ?, ?, ?, ?)",
            (user_id, nft_address, nft_name, days, total_price, is_preorder)
        )
        order_id = cursor.lastrowid
        await db.commit()
        return order_id

async def update_order_status(order_id, status, tc_link=None, tx_hash=None):
    async with aiosqlite.connect(DB_PATH, timeout=30) as db:
        await db.execute("PRAGMA journal_mode=WAL")
        
        updates = []
        params = []
        
        if status is not None:
            updates.append("status = ?")
            params.append(status)
        
        if tc_link is not None:
            updates.append("tc_link = ?")
            params.append(tc_link)
            
        if tx_hash is not None:
            updates.append("tx_hash = ?")
            params.append(tx_hash)
            
        if not updates:
            return
            
        query = f"UPDATE orders SET {', '.join(updates)} WHERE id = ?"
        params.append(order_id)
        
        await db.execute(query, tuple(params))
        await db.commit()

async def get_user_orders(user_id):
    async with aiosqlite.connect(DB_PATH, timeout=30) as db:
        await db.execute("PRAGMA journal_mode=WAL")
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC", (user_id,)) as cursor:
            return await cursor.fetchall()

async def get_order_by_id(order_id):
    async with aiosqlite.connect(DB_PATH, timeout=30) as db:
        await db.execute("PRAGMA journal_mode=WAL")
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM orders WHERE id = ?", (order_id,)) as cursor:
            return await cursor.fetchone()

async def search_items_inline(query, limit=50):
    async with aiosqlite.connect(DB_PATH, timeout=30) as db:
        await db.execute("PRAGMA journal_mode=WAL")
        db.row_factory = aiosqlite.Row
        q = f"%{query}%"
        async with db.execute("SELECT * FROM items WHERE (title LIKE ? OR nft_address LIKE ?) AND (status = 'available' OR status = 'rented') LIMIT ?", (q, q, limit)) as cursor:
            return await cursor.fetchall()
