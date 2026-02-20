import aiosqlite
import os
import json

DB_PATH = os.path.join(os.path.dirname(__file__), "database.db")

async def init_db():
    async with aiosqlite.connect(DB_PATH, timeout=30.0) as db:
        await db.execute("PRAGMA journal_mode=WAL;")
        await db.execute("PRAGMA synchronous=NORMAL;") # Faster writes, slightly less safe but okay for cache
        await db.execute("""
            CREATE TABLE IF NOT EXISTS users (
                user_id INTEGER PRIMARY KEY,
                username TEXT,
                full_name TEXT,
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
            
        async with db.execute("PRAGMA table_info(users)") as cursor:
            cols = [row[1] for row in await cursor.fetchall()]
            if 'username' not in cols:
                await db.execute("ALTER TABLE users ADD COLUMN username TEXT")
            if 'full_name' not in cols:
                await db.execute("ALTER TABLE users ADD COLUMN full_name TEXT")

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

        await db.execute("CREATE INDEX IF NOT EXISTS idx_items_status_type ON items(status, type);")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_items_address ON items(nft_address);")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_orders_user_status ON orders(user_id, status);")
        await db.commit()

        # Referral System Tables
        await db.execute("""
            CREATE TABLE IF NOT EXISTS referrals (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                referrer_id INTEGER NOT NULL,
                referred_id INTEGER NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(referred_id)
            )
        """)
        
        await db.execute("""
            CREATE TABLE IF NOT EXISTS referral_earnings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                referrer_id INTEGER NOT NULL,
                order_id INTEGER NOT NULL,
                amount REAL NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        await db.execute("""
            CREATE TABLE IF NOT EXISTS referral_balance (
                user_id INTEGER PRIMARY KEY,
                balance REAL DEFAULT 0,
                total_earned REAL DEFAULT 0,
                total_withdrawn REAL DEFAULT 0,
                last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        await db.commit()

async def add_user(user_id, username=None, full_name=None):
    async with aiosqlite.connect(DB_PATH, timeout=30) as db:
        await db.execute("PRAGMA journal_mode=WAL")
        await db.execute(
            "INSERT INTO users (user_id, username, full_name) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET username = excluded.username, full_name = excluded.full_name",
            (user_id, username, full_name)
        )
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

async def sync_item(nft_address, item_type, title, original_price=None, price_per_day=None, min_duration=86400, max_duration=2592000, description="", metadata="", status='available', rent_ends_at=None, auto_relist=1, conn=None):
    import asyncio
    
    async def _perform_sync(db):
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
    
    if conn:
        await _perform_sync(conn)
        return

    retries = 5
    for attempt in range(retries):
        try:
            async with aiosqlite.connect(DB_PATH, timeout=60.0) as db:
                await db.execute("PRAGMA journal_mode=WAL")
                await db.execute("PRAGMA synchronous=NORMAL")
                await _perform_sync(db)
                await db.commit()
            break # Success
        except Exception as e:
            if "locked" in str(e) and attempt < retries - 1:
                await asyncio.sleep(0.5 * (attempt + 1))
            else:
                raise e

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
        # Prioritize available items (for_rent), then rented ones
        async with db.execute("""
            SELECT * FROM items 
            WHERE (title LIKE ? OR nft_address LIKE ?) 
            AND (status = 'for_rent' OR status = 'for_sale_and_rent' OR status = 'rented' OR status = 'available') 
            ORDER BY (status = 'for_rent' OR status = 'for_sale_and_rent') DESC, title ASC 
            LIMIT ?
        """, (q, q, limit)) as cursor:
            return await cursor.fetchall()

# ==================== REFERRAL SYSTEM ====================

async def create_referral(referrer_id, referred_id):
    """
    Создает реферальную связь между пользователями.
    Возвращает True если успешно, False если пользователь уже чей-то реферал.
    """
    async with aiosqlite.connect(DB_PATH, timeout=30) as db:
        await db.execute("PRAGMA journal_mode=WAL")
        
        # Проверяем, не является ли пользователь уже чьим-то рефералом
        async with db.execute("SELECT id FROM referrals WHERE referred_id = ?", (referred_id,)) as cursor:
            existing = await cursor.fetchone()
            if existing:
                return False
        
        # Нельзя быть рефералом самого себя
        if referrer_id == referred_id:
            return False
        
        # Создаем связь
        try:
            await db.execute(
                "INSERT INTO referrals (referrer_id, referred_id) VALUES (?, ?)",
                (referrer_id, referred_id)
            )
            
            # Инициализируем баланс реферера, если его еще нет
            await db.execute(
                "INSERT OR IGNORE INTO referral_balance (user_id) VALUES (?)",
                (referrer_id,)
            )
            
            await db.commit()
            return True
        except:
            return False

async def get_referrer_id(referred_id):
    """Получает ID реферера для данного пользователя"""
    async with aiosqlite.connect(DB_PATH, timeout=30) as db:
        await db.execute("PRAGMA journal_mode=WAL")
        async with db.execute("SELECT referrer_id FROM referrals WHERE referred_id = ?", (referred_id,)) as cursor:
            row = await cursor.fetchone()
            return row[0] if row else None

async def add_referral_earning(referrer_id, order_id, amount):
    """
    Начисляет реферальное вознаграждение.
    amount - сумма в TON (25% от наценки)
    """
    async with aiosqlite.connect(DB_PATH, timeout=30) as db:
        await db.execute("PRAGMA journal_mode=WAL")
        
        # Добавляем запись о начислении
        await db.execute(
            "INSERT INTO referral_earnings (referrer_id, order_id, amount) VALUES (?, ?, ?)",
            (referrer_id, order_id, amount)
        )
        
        # Обновляем баланс
        await db.execute(
            "INSERT OR IGNORE INTO referral_balance (user_id) VALUES (?)",
            (referrer_id,)
        )
        
        await db.execute(
            """UPDATE referral_balance 
               SET balance = balance + ?, 
                   total_earned = total_earned + ?,
                   last_updated = CURRENT_TIMESTAMP
               WHERE user_id = ?""",
            (amount, amount, referrer_id)
        )
        
        await db.commit()

async def get_referral_stats(user_id):
    """
    Получает статистику по рефералам для пользователя.
    Возвращает: {
        'referrals_count': int,
        'balance': float,
        'total_earned': float,
        'total_withdrawn': float,
        'recent_earnings': [...]
    }
    """
    async with aiosqlite.connect(DB_PATH, timeout=30) as db:
        await db.execute("PRAGMA journal_mode=WAL")
        db.row_factory = aiosqlite.Row
        
        # Количество рефералов
        async with db.execute("SELECT COUNT(*) as cnt FROM referrals WHERE referrer_id = ?", (user_id,)) as cursor:
            row = await cursor.fetchone()
            referrals_count = row['cnt'] if row else 0
        
        # Баланс
        async with db.execute("SELECT * FROM referral_balance WHERE user_id = ?", (user_id,)) as cursor:
            balance_row = await cursor.fetchone()
            if balance_row:
                balance = balance_row['balance']
                total_earned = balance_row['total_earned']
                total_withdrawn = balance_row['total_withdrawn']
            else:
                balance = 0
                total_earned = 0
                total_withdrawn = 0
        
        # Последние начисления (10 штук)
        async with db.execute(
            """SELECT * FROM referral_earnings 
               WHERE referrer_id = ? 
               ORDER BY created_at DESC 
               LIMIT 10""",
            (user_id,)
        ) as cursor:
            recent_earnings = await cursor.fetchall()
        
        return {
            'referrals_count': referrals_count,
            'balance': balance,
            'total_earned': total_earned,
            'total_withdrawn': total_withdrawn,
            'recent_earnings': [dict(e) for e in recent_earnings]
        }

async def withdraw_referral_balance(user_id, amount):
    """
    Выводит средства с реферального баланса.
    Возвращает True если успешно, False если недостаточно средств.
    """
    async with aiosqlite.connect(DB_PATH, timeout=30) as db:
        await db.execute("PRAGMA journal_mode=WAL")
        
        # Проверяем баланс
        async with db.execute("SELECT balance FROM referral_balance WHERE user_id = ?", (user_id,)) as cursor:
            row = await cursor.fetchone()
            if not row or row[0] < amount:
                return False
        
        # Списываем средства
        await db.execute(
            """UPDATE referral_balance 
               SET balance = balance - ?, 
                   total_withdrawn = total_withdrawn + ?,
                   last_updated = CURRENT_TIMESTAMP
               WHERE user_id = ?""",
            (amount, amount, user_id)
        )
        
        await db.commit()
        return True

async def get_referral_link(user_id, bot_username):
    """Генерирует реферальную ссылку для пользователя"""
    return f"https://t.me/{bot_username}?start=ref_{user_id}"

async def get_referral_friends(user_id):
    """
    Возвращает список рефералов с информацией о них и доходом.
    """
    async with aiosqlite.connect(DB_PATH, timeout=30) as db:
        await db.execute("PRAGMA journal_mode=WAL")
        db.row_factory = aiosqlite.Row
        
        query = """
            SELECT u.user_id, u.username, u.full_name, 
                   IFNULL(SUM(e.amount), 0) as profit
            FROM referrals r
            JOIN users u ON r.referred_id = u.user_id
            LEFT JOIN referral_earnings e ON r.referred_id = (
                SELECT order_user_id FROM (
                    SELECT o.user_id as order_user_id, o.id as order_id 
                    FROM orders o
                ) WHERE order_id = e.order_id
            ) AND e.referrer_id = ?
            WHERE r.referrer_id = ?
            GROUP BY u.user_id
            ORDER BY profit DESC, u.join_date DESC
        """
        # Note: referral_earnings only links to order_id and referrer_id.
        # We need to know which referred user generated the order.
        # Let's refine the query by joining referral_earnings with orders.
        
        refined_query = """
            SELECT u.user_id, u.username, u.full_name, 
                   IFNULL(total_profit.amount, 0) as profit
            FROM referrals r
            JOIN users u ON r.referred_id = u.user_id
            LEFT JOIN (
                SELECT e.referrer_id, o.user_id as referred_user_id, SUM(e.amount) as amount
                FROM referral_earnings e
                JOIN orders o ON e.order_id = o.id
                GROUP BY e.referrer_id, o.user_id
            ) total_profit ON r.referrer_id = total_profit.referrer_id AND r.referred_id = total_profit.referred_user_id
            WHERE r.referrer_id = ?
            ORDER BY profit DESC, u.join_date DESC
        """
        
        async with db.execute(refined_query, (user_id,)) as cursor:
            rows = await cursor.fetchall()
            return [dict(row) for row in rows]

