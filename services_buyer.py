import warnings
# Подавляем предупреждения Pydantic (должно быть ДО импортов tonutils/aiogram)
warnings.filterwarnings("ignore", message='.*protected namespace "model_".*')

import asyncio
import os
import json
import logging
import sys
import re
from dotenv import load_dotenv

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except:
        pass

import services_db

# Принудительно отключаем буферизацию для stdout
sys.stdout.reconfigure(line_buffering=True)

logging.basicConfig(
    level=logging.INFO, 
    format='%(asctime)s - [SERVICES-BUYER] - %(message)s',
    handlers=[logging.StreamHandler(sys.stdout)]
)

# Настройки
load_dotenv()
OWNER_WALLET_ADDR = os.getenv("OWNER_WALLET")
TONCENTER_API_KEY = os.getenv("TONCENTER_API_KEY")

# Настройки Fragment автовыкупа
FRAGMENT_AUTO_BUY = os.getenv("FRAGMENT_AUTO_BUY", "False").lower() in ("true", "1", "yes")
FRAGMENT_SEED = os.getenv("FRAGMENT_SEED")
TONAPI_KEY = os.getenv("TONAPI_KEY")
FRAGMENT_COOKIES = os.getenv("FRAGMENT_COOKIES")

try:
    from fragment_api.async_client import AsyncFragmentClient
    FRAGMENT_CLIENT_AVAILABLE = True
    logging.info("🎯 Библиотека fragment-api-py успешно импортирована.")
except ImportError:
    FRAGMENT_CLIENT_AVAILABLE = False
    logging.warning("⚠️ Библиотека fragment-api-py не установлена. Автовыкуп будет недоступен, заказы перейдут на ручную выдачу.")

async def monitor_services_wallet():
    """Отслеживает TON транзакции для оплаты услуг"""
    if not OWNER_WALLET_ADDR:
        logging.error("❌ OWNER_WALLET не задан в .env. Мониторинг кошелька невозможен.")
        return

    WALLETS_TO_MONITOR = [OWNER_WALLET_ADDR]
    OLD_WALLET = "UQBxgCx_WJ4_fKgz8tec73NZadhoDzV250-Y0taVPJstZsRl"
    if OLD_WALLET not in WALLETS_TO_MONITOR:
        WALLETS_TO_MONITOR.append(OLD_WALLET)

    logging.info(f"👀 Запущен мониторинг входящих платежей за услуги на кошельках: {WALLETS_TO_MONITOR}")

    from tonutils.client import ToncenterV2Client
    client = ToncenterV2Client(base_url="https://toncenter.com", api_key=TONCENTER_API_KEY)
    
    HASH_FILE = "last_services_tx_hashes.json"

    def load_last_hashes():
        if os.path.exists(HASH_FILE):
            try:
                with open(HASH_FILE, "r") as f:
                    return json.load(f)
            except: 
                pass
        return {addr: None for addr in WALLETS_TO_MONITOR}

    def save_last_hashes(hashes):
        try:
            with open(HASH_FILE, "w") as f:
                json.dump(hashes, f)
        except: 
            pass

    last_tx_hashes = load_last_hashes()
    for addr in WALLETS_TO_MONITOR:
        if addr not in last_tx_hashes:
            last_tx_hashes[addr] = None

    while True:
        for addr in WALLETS_TO_MONITOR:
            try:
                txs = await client.get_transactions(addr, limit=30)
                
                for tx in txs:
                    if not tx.in_msg or not tx.in_msg.info:
                        continue
                    
                    if not hasattr(tx.in_msg.info, 'value_coins'):
                        continue
                        
                    tx_hash = tx.cell.hash.hex()
                    
                    # Если дошли до уже обработанной в прошлом цикле транзакции — прерываемся
                    if last_tx_hashes[addr] and tx_hash == last_tx_hashes[addr]:
                        break
                    
                    # Проверяем, обрабатывали ли мы этот хеш в базе данных услуг
                    already_processed = await services_db.get_service_order_by_tx_hash(tx_hash)
                    if already_processed:
                        continue
                        
                    # Парсим комментарий
                    comment = ""
                    try:
                        if tx.in_msg.body:
                            slice_data = tx.in_msg.body.begin_parse()
                            if slice_data.remaining_bits >= 32:
                                op = slice_data.load_uint(32)
                                if op == 0:  # Текстовый комментарий
                                    comment = slice_data.load_string(slice_data.remaining_bits // 8)
                    except Exception as e:
                        logging.debug(f"Не удалось распарсить комментарий для {tx_hash}: {e}")

                    # Ищем ID заказа услуг (формат 'service:ID' или просто ID >= 1000000)
                    order_id = None
                    m_pref = re.search(r'service:(\d+)', comment, re.IGNORECASE)
                    if m_pref:
                        order_id = int(m_pref.group(1))
                    else:
                        m_num = re.search(r'(\d+)', comment)
                        if m_num:
                            val = int(m_num.group(1))
                            if val >= 1000000:
                                order_id = val

                    if order_id:
                        logging.info(f"🧩 Найдено упоминание заказа услуг #{order_id} в комментарии '{comment}'")
                        order = await services_db.get_service_order(order_id)
                        
                        if order and order['status'] == 'pending_payment':
                            user_wallet = None
                            try:
                                if tx.in_msg.info.src:
                                    user_wallet = str(tx.in_msg.info.src)
                            except: 
                                pass

                            received_amount = float(tx.in_msg.info.value_coins) / 1e9
                            expected_amount = float(order['price_ton'])
                            
                            # Проверяем сумму с учетом погрешности 1%
                            if received_amount >= expected_amount * 0.99:
                                logging.info(f"🎯 СОВПАДЕНИЕ ПЛАТЕЖА! Заказ #{order_id} оплачен. Получено: {received_amount} TON, Ожидалось: {expected_amount} TON")
                                # Запускаем единую обработку в фоне
                                asyncio.create_task(
                                    services_db.process_successful_service_payment(
                                        order_id=order_id,
                                        tx_hash=tx_hash,
                                        payment_method='ton',
                                        user_wallet=user_wallet
                                    )
                                )
                            else:
                                logging.warning(f"⚠️ Недостаточная сумма для заказа #{order_id}: получено {received_amount} TON, требовалось {expected_amount} TON")
                        elif order:
                            logging.info(f"ℹ️ Заказ #{order_id} найден, но его статус '{order['status']}'")

                if txs:
                    last_tx_hashes[addr] = txs[0].cell.hash.hex()
                    save_last_hashes(last_tx_hashes)

            except Exception as e:
                logging.error(f"❌ Ошибка при мониторинге адреса {addr}: {e}")
                
        await asyncio.sleep(10)

async def cleanup_expired_services_orders():
    """Периодически удаляет неоплаченные заказы услуг старше 2 часов"""
    logging.info("🧹 Запущен воркер очистки просроченных заказов услуг (2 часа)...")
    import datetime
    while True:
        try:
            threshold = datetime.datetime.utcnow() - datetime.timedelta(hours=2)
            async with services_db.aiosqlite.connect(services_db.DB_PATH) as conn:
                cursor = await conn.execute(
                    "DELETE FROM services_orders WHERE status = 'pending_payment' AND created_at < ?",
                    (threshold.strftime('%Y-%m-%d %H:%M:%S'),)
                )
                if cursor.rowcount > 0:
                    logging.info(f"🧹 [Cleanup] Удалено {cursor.rowcount} просроченных заказов услуг.")
                await conn.commit()
        except Exception as e:
            logging.error(f"❌ [Cleanup] Ошибка при очистке просроченных заказов услуг: {e}")
            
        await asyncio.sleep(300) # Проверка каждые 5 минут

def parse_cookies_string(cookie_str: str) -> dict:
    """Парсит строку куки в словарь"""
    if not cookie_str:
        return {}
    cookies = {}
    for part in cookie_str.split(';'):
        part = part.strip()
        if '=' in part:
            k, v = part.split('=', 1)
            cookies[k.strip()] = v.strip()
    return cookies

async def auto_fulfill_service_order(order_id: int, target_user: str):
    """Выполняет автовыкуп Stars или Premium на Fragment.com"""
    # 1. Переводим в статус обработки
    await services_db.update_service_order_status(order_id, 'processing_auto')
    logging.info(f"🔄 [Автовыкуп] Заказ #{order_id} переведен в статус 'processing_auto' для получателя {target_user}")

    order = await services_db.get_service_order(order_id)
    if not order:
        logging.error(f"❌ [Автовыкуп] Заказ #{order_id} не найден в БД.")
        return

    service_type = order['service_type']
    amount = order['amount']
    price_ton = order['price_ton']
    price_rub = order['price_rub']
    user_id = order['user_id']

    service_name_ru = services_db.SERVICE_NAMES.get(service_type, {}).get("ru", service_type)
    if service_type == 'stars':
        amount_text_ru = f"{amount} шт."
    else:
        amount_text_ru = f"{amount} мес."

    # 2. Проверка конфигурации автовыкупа
    auto_buy_enabled = os.getenv("FRAGMENT_AUTO_BUY", "False").lower() in ("true", "1", "yes")
    f_seed = os.getenv("FRAGMENT_SEED")
    f_api_key = os.getenv("TONAPI_KEY")
    f_cookies_raw = os.getenv("FRAGMENT_COOKIES")

    if not auto_buy_enabled or not FRAGMENT_CLIENT_AVAILABLE or not f_seed or not f_api_key or not f_cookies_raw:
        reason = "Автовыкуп отключен" if not auto_buy_enabled else (
                 "Библиотека fragment-api-py не установлена" if not FRAGMENT_CLIENT_AVAILABLE else (
                 "Не задан FRAGMENT_SEED" if not f_seed else (
                 "Не задан TONAPI_KEY" if not f_api_key else "Не заданы FRAGMENT_COOKIES"
                 )))
        
        logging.error(f"❌ [Автовыкуп] Ошибка конфигурации для заказа #{order_id}: {reason}")
        await services_db.update_service_order_status(order_id, 'manual_pending')
        
        admin_err_msg = (
            f"🚨 <b>[Автовыкуп] Сбой конфигурации заказа #{order_id}!</b>\n\n"
            f"📦 <b>Заказ:</b> #<code>{order_id}</code>\n"
            f"🏷️ <b>Услуга:</b> {service_name_ru} ({amount_text_ru})\n"
            f"🎁 <b>Получатель:</b> <code>{target_user}</code>\n"
            f"❌ <b>Причина:</b> {reason}\n\n"
            f"⚠️ <b>Заказ переведен на РУЧНУЮ ВЫДАЧУ!</b> Пожалуйста, выдайте товар вручную."
        )
        await services_db.send_telegram_admin_log(admin_err_msg)
        return

    # 3. Инициализация Fragment клиента
    try:
        cookies_dict = parse_cookies_string(f_cookies_raw)
        client = AsyncFragmentClient(
            seed=f_seed,
            api_key=f_api_key,
            cookies=cookies_dict
        )
        
        logging.info(f"🚀 [Автовыкуп] Отправка запроса на Fragment.com для заказа #{order_id}...")
        
        tx_hash = None
        if service_type == 'stars':
            # Покупка звезд
            res = await client.purchase_stars(username=target_user, amount=amount, show_sender=True)
            tx_hash = str(res) if res else "fragment_tx"
        elif service_type == 'premium':
            # Покупка премиума (3, 6, 12 месяцев)
            res = await client.purchase_premium(username=target_user, months=amount, show_sender=True)
            tx_hash = str(res) if res else "fragment_tx"
        else:
            raise ValueError(f"Неизвестный тип услуги: {service_type}")

        logging.info(f"✅ [Автовыкуп] Заказ #{order_id} успешно выкуплен! Результат: {res}")
        
        # 4. Обновляем статус на completed
        await services_db.update_service_order_status(order_id, 'completed', tx_hash=tx_hash)
        
        # 5. Отправляем уведомления об успехе
        admin_success_msg = (
            f"✅ <b>[Автовыкуп] Успешная авто-выдача!</b>\n\n"
            f"📦 <b>Заказ:</b> #<code>{order_id}</code>\n"
            f"👤 <b>Покупатель:</b> <a href=\"tg://user?id={user_id}\">{user_id}</a>\n"
            f"🏷️ <b>Услуга:</b> {service_name_ru} ({amount_text_ru})\n"
            f"🎁 <b>Получатель:</b> <code>{target_user}</code>\n"
            f"💰 <b>Сумма:</b> <code>{price_ton} TON</code> (~{price_rub} RUB)\n"
            f"⚡ <b>Статус:</b> Успешно выкуплено на Fragment.com!"
        )
        if tx_hash and tx_hash != "fragment_tx":
            admin_success_msg += f"\n🔗 <b>Транзакция:</b> <a href=\"https://tonviewer.com/tx/{tx_hash}\">{tx_hash[:10]}...</a>"
        await services_db.send_telegram_admin_log(admin_success_msg)

        user_success_msg = (
            f"🎉 <b>Ваш заказ успешно доставлен! / Your order has been successfully delivered!</b>\n\n"
            f"📦 <b>Заказ / Order:</b> #{order_id}\n"
            f"🏷️ <b>Услуга / Service:</b> {service_name_ru}\n"
            f"📊 <b>Количество / Period:</b> {amount_text_ru}\n"
            f"🎁 <b>Получатель / Recipient:</b> <code>{target_user}</code>\n\n"
            f"❤️ Спасибо за покупку! Будем рады видеть вас снова!\n"
            f"❤️ Thank you for your purchase! We look forward to serving you again!"
        )
        await services_db.send_user_notification(user_id, user_success_msg)

    except Exception as e:
        error_msg = str(e)
        logging.error(f"❌ [Автовыкуп] Исключение при автовыкупе заказа #{order_id}: {e}", exc_info=True)
        
        # Возвращаем статус в ручную выдачу
        await services_db.update_service_order_status(order_id, 'manual_pending')
        
        admin_fail_msg = (
            f"🚨 <b>[Автовыкуп] Сбой авто-покупки заказа #{order_id}!</b>\n\n"
            f"📦 <b>Заказ:</b> #<code>{order_id}</code>\n"
            f"🏷️ <b>Услуга:</b> {service_name_ru} ({amount_text_ru})\n"
            f"🎁 <b>Получатель:</b> <code>{target_user}</code>\n"
            f"❌ <b>Ошибка:</b> <code>{error_msg}</code>\n\n"
            f"⚠️ <b>Заказ переведен на РУЧНУЮ ВЫДАЧУ!</b> Пожалуйста, выдайте товар вручную как можно скорее."
        )
        await services_db.send_telegram_admin_log(admin_fail_msg)

        user_fail_msg = (
            f"⏳ <b>Обновление по заказу #{order_id} / Order update</b>\n\n"
            f"Автоматическая выдача задерживается из-за технических особенностей сети.\n"
            f"Заказ передан нашему администратору для ручного завершения. Не переживайте, ваш заказ будет выдан в течение 5-15 минут! Спасибо за терпение.\n\n"
            f"Automatic delivery is slightly delayed due to network conditions.\n"
            f"The order has been transferred to our administrator for manual fulfillment. Don't worry, your order will be delivered within 5-15 minutes! Thank you for your patience."
        )
        await services_db.send_user_notification(user_id, user_fail_msg)

async def auto_buyer_service_loop():
    """Фоновый цикл автовыкупа для обработки оплаченных заказов услуг"""
    logging.info("🚀 Запущен воркер мониторинга оплаченных заказов услуг (интервал 5 сек)...")
    while True:
        try:
            # Выбираем все заказы в статусе 'paid' из services.db
            async with services_db.aiosqlite.connect(services_db.DB_PATH) as conn:
                conn.row_factory = services_db.aiosqlite.Row
                async with conn.execute("SELECT * FROM services_orders WHERE status = 'paid'") as cursor:
                    paid_orders = await cursor.fetchall()
            
            for order in paid_orders:
                order_id = order['id']
                user_id = order['user_id']
                target_user = order['target_user']
                
                # Проверяем настройки автовыкупа
                auto_buy_enabled = os.getenv("FRAGMENT_AUTO_BUY", "False").lower() in ("true", "1", "yes")
                
                if not auto_buy_enabled:
                    # Если автовыкуп отключен, просто переводим в manual_pending
                    await services_db.update_service_order_status(order_id, 'manual_pending')
                    logging.info(f"ℹ️ [Автовыкуп] Заказ #{order_id} переведен в 'manual_pending', так как FRAGMENT_AUTO_BUY=False")
                    continue
                
                # Определяем юзернейм
                target_user_for_auto = None
                if target_user == 'self':
                    username = await services_db.get_telegram_username(user_id)
                    if username:
                        target_user_for_auto = services_db.clean_username(username)
                    else:
                        # Нет юзернейма -> ручная выдача
                        await services_db.update_service_order_status(order_id, 'manual_pending')
                        logging.warning(f"⚠️ [Автовыкуп] Заказ #{order_id} не может быть выкуплен автоматически: нет юзернейма.")
                        
                        admin_err_msg = (
                            f"🚨 <b>[Автовыкуп] Сбой авто-покупки заказа #{order_id}!</b>\n\n"
                            f"📦 <b>Заказ:</b> #<code>{order_id}</code>\n"
                            f"👤 <b>Пользователь:</b> <a href=\"tg://user?id={user_id}\">{user_id}</a>\n"
                            f"❌ <b>Причина:</b> У пользователя нет юзернейма в Telegram.\n\n"
                            f"⚠️ <b>Заказ переведен на РУЧНУЮ ВЫДАЧУ!</b> Пожалуйста, свяжитесь с клиентом."
                        )
                        await services_db.send_telegram_admin_log(admin_err_msg)
                        continue
                else:
                    target_user_for_auto = services_db.clean_username(target_user)
                
                if target_user_for_auto:
                    # Запускаем автовыкуп в фоне для каждого заказа параллельно, чтобы не блокировать цикл
                    asyncio.create_task(auto_fulfill_service_order(order_id, target_user_for_auto))
                    
        except Exception as e:
            logging.error(f"❌ [Автовыкуп] Ошибка в цикле автовыкупа услуг: {e}")
            
        await asyncio.sleep(5)

async def main():
    # Инициализируем БД
    await services_db.init_db()
    
    # Запускаем задачи параллельно
    await asyncio.gather(
        monitor_services_wallet(),
        cleanup_expired_services_orders(),
        auto_buyer_service_loop()
    )

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logging.info("👋 Работа воркера услуг завершена вручную.")
