import aiosqlite
import os
import aiohttp
import logging
import hmac
import hashlib
from dotenv import load_dotenv

DB_PATH = os.path.join(os.path.dirname(__file__), "services.db")

load_dotenv()
BOT_TOKEN = os.getenv("BOT_TOKEN")
LOG_CHANNEL_ID = os.getenv("LOG_CHANNEL_ID") or os.getenv("PROFIT_CHANNEL_ID")
SUPPORT_BOT_TOKEN = os.getenv("SUPPORT_BOT_TOKEN")

SERVICE_NAMES = {
    "stars": {"ru": "Telegram Stars ⭐", "en": "Telegram Stars ⭐"},
    "premium": {"ru": "Telegram Premium 💎", "en": "Telegram Premium 💎"}
}

async def init_db():
    """Инициализация базы данных услуг (services.db)"""
    async with aiosqlite.connect(DB_PATH, timeout=30.0) as db:
        await db.execute("PRAGMA journal_mode=WAL;")
        await db.execute("PRAGMA synchronous=NORMAL;")
        
        # Создаем таблицу заказов услуг
        await db.execute("""
            CREATE TABLE IF NOT EXISTS services_orders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                service_type TEXT NOT NULL,           -- 'premium' или 'stars'
                target_user TEXT NOT NULL,            -- юзернейм получателя (например, @deloovoy) или 'self'
                amount INTEGER NOT NULL,              -- кол-во звезд или месяцев подписки (3, 6, 12)
                price_ton REAL NOT NULL,
                price_rub REAL NOT NULL,
                status TEXT DEFAULT 'pending_payment', -- pending_payment, paid, completed, failed
                payment_method TEXT,                  -- 'ton' или 'aurapay'
                tx_hash TEXT,                         -- хеш транзакции оплаты
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)
        await db.commit()
        
        # Устанавливаем стартовый ID автоинкремента на 1000000 (SQLite начнет с 1000000)
        async with db.execute("SELECT seq FROM sqlite_sequence WHERE name = 'services_orders'") as cursor:
            row = await cursor.fetchone()
            if not row:
                # Если счетчика нет, устанавливаем его в 999999, тогда первая запись будет 1000000
                await db.execute("INSERT INTO sqlite_sequence (name, seq) VALUES ('services_orders', 999999)")
                await db.commit()

async def create_service_order(user_id, service_type, target_user, amount, price_ton, price_rub, payment_method=None):
    """Создает новый заказ услуги в services.db и возвращает его ID"""
    async with aiosqlite.connect(DB_PATH, timeout=30) as db:
        await db.execute("PRAGMA journal_mode=WAL")
        cursor = await db.execute(
            """INSERT INTO services_orders 
               (user_id, service_type, target_user, amount, price_ton, price_rub, payment_method) 
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (user_id, service_type, target_user, amount, price_ton, price_rub, payment_method)
        )
        order_id = cursor.lastrowid
        await db.commit()
        return order_id

async def get_service_order(order_id):
    """Получает заказ услуги по его ID"""
    async with aiosqlite.connect(DB_PATH, timeout=30) as db:
        await db.execute("PRAGMA journal_mode=WAL")
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM services_orders WHERE id = ?", (order_id,)) as cursor:
            return await cursor.fetchone()

async def update_service_order_status(order_id, status, tx_hash=None, payment_method=None):
    """Обновляет статус и платежные данные заказа услуги"""
    async with aiosqlite.connect(DB_PATH, timeout=30) as db:
        await db.execute("PRAGMA journal_mode=WAL")
        
        updates = ["status = ?", "updated_at = CURRENT_TIMESTAMP"]
        params = [status]
        
        if tx_hash is not None:
            updates.append("tx_hash = ?")
            params.append(tx_hash)
            
        if payment_method is not None:
            updates.append("payment_method = ?")
            params.append(payment_method)
            
        params.append(order_id)
        query = f"UPDATE services_orders SET {', '.join(updates)} WHERE id = ?"
        
        await db.execute(query, tuple(params))
        await db.commit()

async def get_user_service_orders(user_id):
    """Получает все заказы услуг конкретного пользователя"""
    async with aiosqlite.connect(DB_PATH, timeout=30) as db:
        await db.execute("PRAGMA journal_mode=WAL")
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM services_orders WHERE user_id = ? ORDER BY created_at DESC", (user_id,)) as cursor:
            return await cursor.fetchall()

async def get_service_order_by_tx_hash(tx_hash):
    """Получает заказ услуги по хешу транзакции"""
    async with aiosqlite.connect(DB_PATH, timeout=30) as db:
        await db.execute("PRAGMA journal_mode=WAL")
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM services_orders WHERE tx_hash = ?", (tx_hash,)) as cursor:
            return await cursor.fetchone()

async def send_telegram_admin_log(message: str):
    """Отправляет лог администратору"""
    if not SUPPORT_BOT_TOKEN or not LOG_CHANNEL_ID:
        logging.warning("⚠️ SUPPORT_BOT_TOKEN или LOG_CHANNEL_ID не заданы в .env.")
        return
    try:
        async with aiohttp.ClientSession() as session:
            url = f"https://api.telegram.org/bot{SUPPORT_BOT_TOKEN}/sendMessage"
            payload = {
                "chat_id": LOG_CHANNEL_ID,
                "text": message,
                "parse_mode": "HTML",
                "disable_web_page_preview": True
            }
            async with session.post(url, json=payload, timeout=15) as resp:
                if resp.status != 200:
                    logging.error(f"❌ Ошибка отправки админ-лога: {resp.status}")
    except Exception as e:
        logging.error(f"❌ Исключение при отправке админ-лога: {e}")

async def send_user_notification(user_id: int, message: str):
    """Отправляет уведомление пользователю"""
    if not BOT_TOKEN:
        logging.warning("⚠️ BOT_TOKEN не задан в .env.")
        return
    try:
        async with aiohttp.ClientSession() as session:
            url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage"
            payload = {
                "chat_id": user_id,
                "text": message,
                "parse_mode": "HTML"
            }
            async with session.post(url, json=payload, timeout=15) as resp:
                if resp.status != 200:
                    logging.error(f"❌ Ошибка отправки пользователю {user_id}: {resp.status}")
    except Exception as e:
        logging.error(f"❌ Исключение при отправке пользователю: {e}")

async def get_telegram_username(user_id: int) -> str:
    """Получает юзернейм пользователя из основной базы данных database.db"""
    main_db_path = os.path.join(os.path.dirname(__file__), "database.db")
    if not os.path.exists(main_db_path):
        return None
    try:
        async with aiosqlite.connect(main_db_path, timeout=30.0) as db:
            async with db.execute("SELECT username FROM users WHERE user_id = ?", (user_id,)) as cursor:
                row = await cursor.fetchone()
                if row and row[0]:
                    return row[0]
    except Exception as e:
        logging.error(f"❌ Ошибка при получении юзернейма из database.db: {e}")
    return None

def clean_username(username: str) -> str:
    """Форматирует юзернейм для Fragment.com (добавляет @ при необходимости)"""
    if not username:
        return ""
    username = username.strip()
    if username.startswith("@"):
        return username
    # Если это номер телефона (для Premium)
    if username.startswith("+") or (username.isdigit() and len(username) > 9):
        return username
    return f"@{username}"

async def process_successful_service_payment(order_id: int, tx_hash: str, payment_method: str, user_wallet: str = None):
    """Единый метод обработки успешной оплаты заказа услуг. 
    Используется как в services_buyer.py (TON), так и в live_server.py (AuraPay).
    """
    order = await get_service_order(order_id)
    if not order:
        logging.error(f"❌ Заказ услуг #{order_id} не найден.")
        return {"success": False, "should_auto_buy": False}
        
    if order['status'] != 'pending_payment':
        logging.info(f"ℹ️ Заказ #{order_id} уже имеет статус '{order['status']}'.")
        return {"success": False, "should_auto_buy": False}
        
    await update_service_order_status(order_id, 'paid', tx_hash=tx_hash, payment_method=payment_method)
    logging.info(f"✅ Статус заказа #{order_id} обновлен на 'paid'")
    
    service_type = order['service_type']
    amount = order['amount']
    target_user = order['target_user']
    price_ton = order['price_ton']
    price_rub = order['price_rub']
    user_id = order['user_id']

    # Проверяем флаг автовыкупа в .env
    auto_buy_enabled = os.getenv("FRAGMENT_AUTO_BUY", "False").lower() in ("true", "1", "yes")
    
    # Пытаемся определить юзернейм для автовыкупа
    target_user_for_auto = None
    auto_buy_possible = False
    
    if auto_buy_enabled:
        if target_user == 'self':
            username = await get_telegram_username(user_id)
            if username:
                target_user_for_auto = clean_username(username)
                auto_buy_possible = True
            else:
                logging.warning(f"⚠️ Автовыкуп заказа #{order_id} невозможен: у пользователя {user_id} нет юзернейма в БД.")
        else:
            target_user_for_auto = clean_username(target_user)
            auto_buy_possible = True

    service_name_ru = SERVICE_NAMES.get(service_type, {}).get("ru", service_type)
    service_name_en = SERVICE_NAMES.get(service_type, {}).get("en", service_type)

    if service_type == 'stars':
        amount_text_ru = f"{amount} шт."
        amount_text_en = f"{amount} pcs."
    else:
        amount_text_ru = f"{amount} мес."
        amount_text_en = f"{amount} months"

    recipient_ru = "Себе" if target_user == 'self' else f"Другому ({target_user})"
    recipient_en = "Self" if target_user == 'self' else f"Other ({target_user})"
    
    pay_method_title = "СБП (AuraPay)" if payment_method == 'aurapay' else "TON (Tonkeeper)"

    admin_msg = (
        f"🔔 <b>[Услуги] Получена оплата {pay_method_title}!</b>\n\n"
        f"📦 <b>Заказ:</b> #<code>{order_id}</code>\n"
        f"👤 <b>Покупатель:</b> <a href=\"tg://user?id={user_id}\">{user_id}</a>\n"
        f"🏷️ <b>Услуга:</b> {service_name_ru}\n"
        f"🎁 <b>Кому:</b> <code>{recipient_ru}</code>\n"
        f"📊 <b>Объем:</b> <code>{amount_text_ru}</code>\n"
        f"💰 <b>Сумма:</b> <code>{price_ton} TON</code> (~{price_rub} RUB)\n"
    )
    
    if tx_hash:
        if payment_method == 'ton':
            admin_msg += f"⚡ <b>Хеш:</b> <a href=\"https://tonviewer.com/tx/{tx_hash}\">{tx_hash[:10]}...</a>\n"
        else:
            admin_msg += f"⚡ <b>ID транзакции AuraPay:</b> <code>{tx_hash}</code>\n"
            
    if user_wallet:
        admin_msg += f"💳 <b>Кошелек отправителя:</b> <code>{user_wallet}</code>\n"

    if auto_buy_possible:
        admin_msg += (
            f"\n⚡ <b>ЗАПУЩЕН АВТОВЫКУП!</b>\n"
            f"Бот пытается автоматически приобрести {service_name_ru} ({amount_text_ru}) для {target_user_for_auto} на Fragment.com."
        )
        await send_telegram_admin_log(admin_msg)

        user_msg = (
            f"🎉 <b>Оплата успешно получена! / Payment successfully received!</b>\n\n"
            f"📦 <b>Заказ / Order:</b> #{order_id}\n"
            f"🏷️ <b>Услуга / Service:</b> {service_name_ru} / {service_name_en}\n"
            f"📊 <b>Количество / Period:</b> {amount_text_ru} / {amount_text_en}\n"
            f"🎁 <b>Получатель / Recipient:</b> {target_user_for_auto if target_user != 'self' else 'Вы / You'}\n\n"
            f"⚡ Ваш заказ обрабатывается автоматически! Обычно это занимает от 30 секунд до 2 минут. Мы пришлем вам уведомление сразу по завершении.\n"
            f"⚡ Your order is being processed automatically! Usually, it takes 30 seconds to 2 minutes. We will notify you once it's complete."
        )
        await send_user_notification(user_id, user_msg)
        return {"success": True, "should_auto_buy": True, "target_user": target_user_for_auto}
    else:
        reason = "автовыкуп отключен в настройках" if not auto_buy_enabled else "у получателя 'self' нет юзернейма в Telegram"
        admin_msg += (
            f"\n⚠️ <b>ТРЕБУЕТСЯ РУЧНАЯ ВЫДАЧА!</b>\n"
            f"Причина: {reason}.\n"
            f"Выдайте {service_name_ru} ({amount_text_ru}) получателю {target_user if target_user != 'self' else f'ID {user_id}'}."
        )
        await send_telegram_admin_log(admin_msg)

        user_msg = (
            f"🎉 <b>Оплата успешно получена! / Payment successfully received!</b>\n\n"
            f"📦 <b>Заказ / Order:</b> #{order_id}\n"
            f"🏷️ <b>Услуга / Service:</b> {service_name_ru} / {service_name_en}\n"
            f"📊 <b>Количество / Period:</b> {amount_text_ru} / {amount_text_en}\n"
            f"🎁 <b>Получатель / Recipient:</b> {target_user if target_user != 'self' else 'Вы / You'}\n\n"
            f"⚡ Наш администратор уже проверяет ваш заказ и выдаст его в ближайшее время. Обычно это занимает от 5 до 15 минут. Спасибо за покупку!\n"
            f"⚡ Our administrator is already verifying your order and will deliver it shortly. Usually, it takes 5-15 minutes. Thank you for your purchase!"
        )
        await send_user_notification(user_id, user_msg)
        return {"success": True, "should_auto_buy": False, "target_user": None}
