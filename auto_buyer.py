import warnings
# Подавляем предупреждения Pydantic (должно быть ДО импортов tonutils/aiogram)
warnings.filterwarnings("ignore", message='.*protected namespace "model_".*')

import asyncio
import os
import json
import logging
from dotenv import load_dotenv
import sys
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except:
        pass

import database as db
import aiohttp
from tonutils.client import ToncenterV2Client
from tonutils.wallet import WalletV4R2, WalletV5R1
from tonutils.utils import Cell
import base64


# Настройки
load_dotenv()
OWNER_SEED = os.getenv("OWNER_SEED")
OWNER_HEX_KEY = os.getenv("OWNER_HEX_KEY")
OWNER_WALLET_ADDR = os.getenv("OWNER_WALLET")
MARKETAPP_API = "https://api.marketapp.ws/v1"
MARKET_TOKENS = [
    os.getenv("MARKETAPP_TOKEN_BUYER", "973841-96c70c60ff2965ef2aec54391351ebc8-1769456638")
]
PROXY_URL = os.getenv("PROXY_URL")
TONCENTER_API_KEY = None # Ключ не прошел авторизацию (401), убираем.

logging.basicConfig(level=logging.INFO, format='%(asctime)s - [AUTO-BUYER] - %(message)s')

def get_token():
    import random
    return random.choice(MARKET_TOKENS)

async def rent_on_marketapp(nft_address, days, price_per_day_nano):
    """Шлем запрос на MarketApp для получения BOC оплаты (с повторами) через aiohttp.
    Возвращает кортеж (данные_транзакции, использованный_токен) или (None, None) при ошибке.
    """
    
    # CORRECT API Endpoint from official docs: POST /v1/rent/{nft_address}/pay/
    url = f"{MARKETAPP_API}/rent/{nft_address}/pay/"
    
    # Payload structure from docs
    payload = {
        "duration": days * 86400, # seconds in int
        "price_per_day": str(int(price_per_day_nano)) # nano TON as string
    }
    
    async with aiohttp.ClientSession() as session:
        for attempt in range(5):
            try:
                session_token = get_token() # Выбираем токен для текущей попытки
                headers = {
                    "Authorization": session_token,
                    "Content-Type": "application/json"
                }
                async with session.post(url, headers=headers, json=payload, timeout=15, proxy=PROXY_URL) as resp:
                    if resp.status == 200:
                        return await resp.json(), session_token  # Возвращаем данные И токен
                    elif resp.status == 429:
                        logging.warning(f"⚠️ [Rent API] 429 Rate Limit (Attempt {attempt+1})...")
                        await asyncio.sleep(5)
                    else:
                        logging.error(f"⚠️ [Rent API] Error {resp.status} (Attempt {attempt+1})")
                        try: 
                            body = await resp.json()
                            logging.error(f"Body: {body}")
                            if body.get('detail', {}).get('reason') == 'Too late. State has been changed (ERR22)':
                                logging.error("❌ ERR22: The listing state changed (already rented or delisted).")
                        except: 
                            logging.error(f"Body: {await resp.text()}")
                        await asyncio.sleep(3)
            except Exception as e:
                logging.warning(f"⚠️ [Rent API] Connection Error (Attempt {attempt+1}): {e}")
                await asyncio.sleep(3)
                
    return None, None

async def process_payment(order):
    """Процесс выкупа NFT после получения оплаты от юзера"""
    
    # 1. Получаем оригинал из БД, чтобы знать цену
    item = await db.get_item_by_id_addr(order['nft_address'])
    if not item:
        logging.error(f"NFT {order['nft_address']} не найден в базе данных.")
        return

    price_per_day_nano = int(item['original_price'] * 1e9)
    
    # 2. ПОЛУЧАЕМ ТОКЕН СРАЗУ (до ожидания ссылки)
    logging.info(f"🔑 Запрашиваем сессию MarketApp для заказа #{order['id']}...")
    deal, api_token = await rent_on_marketapp(order['nft_address'], order['days'], price_per_day_nano)
    
    if not deal or not api_token:
        logging.error(f"❌ Не удалось получить токен сессии для #{order['id']}. Попробуем позже.")
        return

    # 3. Сохраняем токен в БД
    async with db.aiosqlite.connect(db.DB_PATH) as conn:
        await conn.execute("UPDATE orders SET api_token = ? WHERE id = ?", (api_token, order['id']))
        await conn.commit()
    
    # Ответ API v1 имеет структуру: {"transaction": {"validUntil": ..., "messages": [{"address": ..., "amount": ..., "payload": ...}]}}
    transaction_data = deal.get("transaction", {}).get("messages", [{}])[0]
    dest_addr = transaction_data.get("address")
    payload_boc = transaction_data.get("payload") # это base64 BOC
    amount_nano = int(transaction_data.get("amount", 0))
    
    if not dest_addr or not payload_boc:
        logging.error(f"Некорректный формат ответа от MarketApp: {deal}")
        return

    # 4. Отправляем транзакцию через наш кошелек
    try:
        client = ToncenterV2Client(base_url="https://toncenter.com", api_key=TONCENTER_API_KEY)
        
        # Определяем версию кошелька: v5R1 если адрес начинается на UQB/EQB, иначе v4R2
        import binascii
        if OWNER_WALLET_ADDR and (OWNER_WALLET_ADDR.startswith("UQB") or OWNER_WALLET_ADDR.startswith("EQB")):
            logging.info("📝 Использую кошелек версии v5R1 (W5) с фиксированным Wallet ID 2147483409")
            if OWNER_HEX_KEY:
                full_key = binascii.unhexlify(OWNER_HEX_KEY)
                wallet = WalletV5R1(client, private_key=full_key[:32], public_key=full_key[32:], wallet_id=2147483409)
            else:
                wallet, _, _, _ = WalletV5R1.from_mnemonic(client, OWNER_SEED, wallet_id=2147483409)
        else:
            logging.info("📝 Использую кошелек версии v4R2")
            wallet, _, _, _ = WalletV4R2.from_mnemonic(client, OWNER_SEED)
        
        # Конвертируем BOC из Base64 в объект Cell
        try:
            body_cell = Cell.one_from_boc(base64.b64decode(payload_boc))
        except Exception as e:
            logging.error(f"Ошибка декодирования BOC: {e}. Пробую отправить как текст.")
            body_cell = payload_boc

        # Получаем текущий seqno для отслеживания подтверждения
        current_seqno = await wallet.get_seqno(client, wallet.address)
        
        # ВАЖНО: tonutils Wallet.transfer принимает сумму в целых TON!
        amount_ton = amount_nano / 1e9
        logging.info(f"🚀 Отправляю {amount_ton} TON на {dest_addr} (seqno: {current_seqno})...")
        
        # Отправка транзакции с Payload
        await wallet.transfer(
            destination=dest_addr,
            amount=amount_ton,
            body=body_cell,
            seqno=current_seqno
        )
        
        logging.info(f"⏳ Транзакция отправлена в сеть. Ожидание подтверждения (seqno: {current_seqno} -> {current_seqno + 1})...")
        
        # Ждем подтверждения транзакции (инкремента seqno)
        success = False
        for _ in range(12): # Ждем до 2 минут (12 * 10сек)
            await asyncio.sleep(10)
            try:
                new_seqno = await wallet.get_seqno(client, wallet.address)
                if new_seqno > current_seqno:
                    logging.info(f"✅ Транзакция подтверждена! (seqno: {new_seqno})")
                    success = True
                    break
            except Exception as e:
                logging.error(f"Ошибка при проверке seqno: {e}")
        
        if not success:
            logging.warning(f"⚠️ Не дождались подтверждения транзакции для #{order['id']}, но продолжаем.")

    except Exception as e:
        logging.error(f"❌ Ошибка блокчейна для #{order['id']}: {e}")
        return

    # 5. ТЕПЕРЬ МЕНЯЕМ СТАТУС НА 'rented' (теперь пользователь может отправить ссылку)
    await db.update_order_status(order['id'], 'rented')
    logging.info(f"🔒 Транзакция выполнена, статус изменен на 'rented' для #{order['id']}")

    # 6. ЕСЛИ ССЫЛКА УЖЕ ЕСТЬ В БД (пользователь ввел заранее), ПРИВЯЗЫВАЕМ ЕЁ
    current_order = await db.get_order_by_id(order['id'])
    if current_order and current_order['tc_link']:
        tc_link = current_order['tc_link']
        logging.info(f"🔗 Ссылка обнаружена в БД для #{order['id']}. Привязываю автоматически...")
        try:
            url_tc = f"{MARKETAPP_API}/rent/{order['nft_address']}/tonconnect/"
            payload_tc = {"tonconnect_url": tc_link}
            headers = {"Authorization": api_token, "Content-Type": "application/json"}
            async with aiohttp.ClientSession() as session:
                async with session.post(url_tc, headers=headers, json=payload_tc, timeout=15) as resp:
                    logging.info(f"📥 Авто-привязка (TonConnect): status={resp.status} body={await resp.text()}")
        except Exception as e:
            logging.error(f"❌ Ошибка авто-привязки ссылки: {e}")

    logging.info(f"🎉 Процесс покупки для #{order['id']} завершен.")

async def monitor_wallet():
    """Следим за транзакциями на кошельке"""
    logging.info(f"👀 Мониторинг кошелька {OWNER_WALLET_ADDR} запущен...")
    
    client = ToncenterV2Client(base_url="https://toncenter.com", api_key="")
    last_tx_hash = None

    import datetime
    while True:
        try:
            # Получаем последние транзакции
            logging.info(f"🔎 Сканирую последние 20 транзакций...")
            txs = await client.get_transactions(OWNER_WALLET_ADDR, limit=20)
            
            for tx in txs:
                import binascii
                tx_hash = binascii.hexlify(tx.cell.hash).decode()
                
                if last_tx_hash == tx_hash: 
                    break
                
                # ПРОВЕРКА ВРЕМЕНИ: Если транзакция старше 2 часов, игнорируем
                tx_time = datetime.datetime.fromtimestamp(tx.now)
                now_time = datetime.datetime.now()
                diff = (now_time - tx_time).total_seconds()
                
                logging.info(f"🔹 Проверяю транзакцию {tx_hash[:10]} (Time: {tx_time}, Diff: {int(diff)}s)")

                if diff > 7200: # 2 часа
                    logging.info(f"⏳ Пропущена (очень старая)")
                    continue

                try:
                    # Нас интересуют только ВХОДЯЩИЕ транзакции
                    if tx.in_msg and hasattr(tx.in_msg.info, "value_coins") and tx.in_msg.info.value_coins > 0:
                        amount_ton = tx.in_msg.info.value_coins / 1e9
                        logging.info(f"   💰 Найдена входящая: {amount_ton} TON")
                        
                        # ПРОВЕРКА: Не обрабатывали ли мы этот хеш уже?
                        async with db.aiosqlite.connect(db.DB_PATH) as conn:
                            conn.row_factory = db.aiosqlite.Row
                            async with conn.execute("SELECT id FROM orders WHERE tx_hash = ?", (tx_hash,)) as check_cur:
                                if await check_cur.fetchone():
                                    logging.info(f"   ⚠️ Уже обработана (tx_hash в базе)")
                                    continue # Уже было

                            # Пытаемся получить комментарий (memo)
                            order = None
                            try:
                                if tx.in_msg.body:
                                    # Комментарий в TON начинается с 0x00000000
                                    reader = tx.in_msg.body.begin_parse()
                                    if len(reader) >= 32:
                                        op_code = reader.load_uint(32)
                                        if op_code == 0:
                                            memo_text = reader.load_string().strip()
                                            logging.info(f"   📝 Найден комментарий: {memo_text}")
                                            if memo_text.startswith("order:"):
                                                order_id = int(memo_text.split(":")[1])
                                                async with conn.execute("SELECT * FROM orders WHERE id = ?", (order_id,)) as cursor:
                                                    order = await cursor.fetchone()
                                                    if order:
                                                        logging.info(f"   🎯 ПРЯМОЕ ПОПАДАНИЕ! Комментарий указывает на заказ #{order_id}")
                            except Exception as e_memo:
                                logging.debug(f"   Не удалось распарсить комментарий: {e_memo}")

                            if not order:
                                # Резервный поиск по сумме (если нет комментария или он не верный)
                                async with conn.execute(
                                    "SELECT * FROM orders WHERE status = 'pending_payment' AND ABS(total_price - ?) < 0.001 ORDER BY created_at DESC",
                                    (amount_ton,)
                                ) as cursor:
                                    order = await cursor.fetchone()
                            
                            if order:
                                logging.info(f"   🎯 СОВПАДЕНИЕ! Оплата {amount_ton} TON для заказа #{order['id']}")
                                await db.update_order_status(order['id'], 'paid', tx_hash=tx_hash)
                                
                                def handle_task_result(task):
                                    try: task.result()
                                    except Exception as e: logging.error(f"❌ Ошибка в задаче process_payment: {e}")

                                task = asyncio.create_task(process_payment(order))
                                task.add_done_callback(handle_task_result)
                            else:
                                logging.info(f"   ❓ Нет подходящего заказа на сумму {amount_ton} TON")
                except Exception as e_inner:
                    logging.error(f"Ошибка обработки транзакции {tx_hash[:10]}: {e_inner}")
                
            if txs: 
                import binascii
                last_tx_hash = binascii.hexlify(txs[0].cell.hash).decode()
            
        except Exception as e:
            logging.error(f"Ошибка мониторинга: {e}")
            
        await asyncio.sleep(5) # Проверка раз в 5 секунд

async def check_pending_orders():
    """Периодически проверяет оплаченные заказы (в т.ч. предзаказы) и пытается их выкупить, если товар доступен"""
    logging.info("📝 Воркер проверки отложенных заказов запущен...")
    while True:
        try:
            async with db.aiosqlite.connect(db.DB_PATH) as conn:
                conn.row_factory = db.aiosqlite.Row
                # Ищем все оплаченные заказы, которые еще не перешли в статус rented
                async with conn.execute("SELECT * FROM orders WHERE status = 'paid'") as cursor:
                    pending = await cursor.fetchall()
            
            for order in pending:
                # Проверяем, доступен ли товар сейчас в нашей базе
                item = await db.get_item_by_id_addr(order['nft_address'])
                if item and item['status'] == 'available':
                    logging.info(f"🚀 Предзаказ/Оплаченный заказ #{order['id']} дождался доступности {order['nft_name']}. Начинаю выкуп...")
                    asyncio.create_task(process_payment(dict(order)))
                else:
                    logging.debug(f"⏳ Заказ #{order['id']} всё еще ждет доступности {order['nft_name']}...")
            
        except Exception as e:
            logging.error(f"Ошибка в check_pending_orders: {e}")
            
        await asyncio.sleep(30) # Проверка каждые 30 секунд

async def main():
    # Запускаем мониторинг кошелька и воркер предзаказов параллельно
    await asyncio.gather(
        monitor_wallet(),
        check_pending_orders()
    )

if __name__ == "__main__":
    asyncio.run(main())
