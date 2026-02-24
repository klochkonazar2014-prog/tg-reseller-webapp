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
from tonutils.utils import Cell, begin_cell
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
TONCENTER_API_KEY = os.getenv("TONCENTER_API_KEY")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - [AUTO-BUYER] - %(message)s')

# Глобальный набор для предотвращения двойной обработки одного и того же заказа
processing_orders = set()

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
    order_id = order['id']
    try:
        # 1. Получаем оригинал из БД, чтобы знать цену
        item = await db.get_item_by_id_addr(order['nft_address'])
        if not item:
            logging.error(f"NFT {order['nft_address']} не найден в базе данных.")
            return

        # ВАЖНО: используем round(), чтобы избежать 11899999 вместо 11900000
        if "Lol Pop #124946" in (item['title'] or ""):
            price_per_day_nano = int(round(0.23 * 1e9))
            logging.info(f"Using forced price 0.23 TON (with margin) for test NFT: {item['title']}")
        else:
            price_per_day_nano = int(round(item['original_price'] * 1e9))
        
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
        payload_boc = transaction_data.get("payload") # это base64 BOC или Hex
        amount_nano = int(transaction_data.get("amount", 0))
        
        if not dest_addr or not payload_boc:
            logging.error(f"Некорректный формат ответа от MarketApp: {deal}")
            return

        logging.info(f"📊 Детали сделки: Назначение={dest_addr}, Сумма={amount_nano} nanoTON")

        # 4. Инициализируем кошелек (v5R1 или v4R2)
        try:
            client = ToncenterV2Client(base_url="https://toncenter.com", api_key=TONCENTER_API_KEY)
            import binascii
            from tonutils.utils import Address as TonAddress
            
            wallet = None
            # Проверяем HEX-ключ (приоритет)
            if OWNER_HEX_KEY:
                try:
                    full_key = binascii.unhexlify(OWNER_HEX_KEY)
                    pk = full_key[:32]
                    pub = full_key[32:] if len(full_key) >= 64 else None
                    
                    if OWNER_WALLET_ADDR and (OWNER_WALLET_ADDR.startswith("UQB") or OWNER_WALLET_ADDR.startswith("EQB")):
                        logging.info("📝 Использую кошелек версии v5R1 (W5) с HEX-ключом")
                        # Пробуем оба распространённых wallet_id (официальный 2147483409 и серый 698983191)
                        for wid in [2147483409, 698983191]:
                            w_test = WalletV5R1(client, private_key=pk, public_key=pub, wallet_id=wid)
                            gen = w_test.address.to_str(is_bounceable=False)
                            if OWNER_WALLET_ADDR and gen[3:] == OWNER_WALLET_ADDR[3:]:
                                wallet = w_test
                                logging.info(f"✅ Найден W5 wallet_id={wid}: {gen}")
                                break
                        if not wallet:
                            # Адрес не совпал ни с одним wallet_id — используем первый и принудительно ставим адрес
                            wallet = WalletV5R1(client, private_key=pk, public_key=pub, wallet_id=2147483409)
                            if OWNER_WALLET_ADDR:
                                logging.warning(f"⚠️ Принудительно задаю адрес из .env: {OWNER_WALLET_ADDR}")
                                wallet._address = TonAddress(OWNER_WALLET_ADDR)
                    else:
                        logging.info("📝 Использую кошелек версии v4R2 с HEX-ключом")
                        wallet = WalletV4R2(client, private_key=pk, public_key=pub)
                        if OWNER_WALLET_ADDR:
                            gen = wallet.address.to_str(is_bounceable=False)
                            if gen[3:] != OWNER_WALLET_ADDR[3:]:
                                logging.warning(f"⚠️ Принудительно задаю адрес из .env: {OWNER_WALLET_ADDR}")
                                wallet._address = TonAddress(OWNER_WALLET_ADDR)
                except Exception as e_hex:
                    logging.error(f"❌ Ошибка инициализации кошелька по HEX: {e_hex}")

            # Если HEX не сработал или нет, пробуем SEED
            if not wallet and OWNER_SEED:
                try:
                    if OWNER_WALLET_ADDR and (OWNER_WALLET_ADDR.startswith("UQB") or OWNER_WALLET_ADDR.startswith("EQB")):
                        wallet, _, _, _ = await WalletV5R1.from_mnemonic(client, OWNER_SEED, wallet_id=2147483409)
                        gen = wallet.address.to_str(is_bounceable=False)
                        if gen[3:] != OWNER_WALLET_ADDR[3:]:
                            logging.warning(f"⚠️ Принудительно задаю адрес из .env: {OWNER_WALLET_ADDR}")
                            wallet._address = TonAddress(OWNER_WALLET_ADDR)
                    else:
                        wallet, _, _, _ = await WalletV4R2.from_mnemonic(client, OWNER_SEED)
                except Exception as e_seed:
                    logging.error(f"❌ Ошибка инициализации кошелька по SEED: {e_seed}")

            if not wallet:
                logging.error(f"❌ Не удалось инициализировать кошелек для #{order['id']}. Проверьте OWNER_HEX_KEY и OWNER_SEED.")
                return

            logging.info(f"💳 Кошелек бота: {wallet.address.to_str(is_bounceable=False)}")
            
            # Конвертируем BOC (пробуем сначала Base64, затем Hex)
            try:
                # Пытаемся декодировать как Base64
                decoded_boc = base64.b64decode(payload_boc)
                body_cell = Cell.one_from_boc(decoded_boc)
                logging.info("📦 BOC успешно декодирован из Base64")
            except Exception:
                try:
                    # Если не Base64, пробуем как Hex
                    decoded_boc = binascii.unhexlify(payload_boc)
                    body_cell = Cell.one_from_boc(decoded_boc)
                    logging.info("📦 BOC успешно декодирован из Hex")
                except Exception as e:
                    logging.error(f"❌ Ошибка декодирования BOC (ни Base64, ни Hex не подошли): {e}")
                    body_cell = payload_boc

            # Получаем текущий seqno для отслеживания подтверждения
            current_seqno = await wallet.get_seqno(client, wallet.address)
            
            # ВАЖНО: tonutils Wallet.transfer принимает сумму в TON (float)
            amount_ton = float(amount_nano) / 1e9
            logging.info(f"🚀 Отправляю {amount_ton:.9f} TON на {dest_addr} (seqno: {current_seqno})...")
            
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
            logging.error(f"❌ Ошибка блокчейна для #{order_id}: {e}")
            return

    except Exception as e:
        logging.error(f"❌ Общая ошибка в process_payment для #{order_id}: {e}")
        return
    finally:
        if order_id in processing_orders:
            processing_orders.remove(order_id)
            logging.info(f"🔓 Блокировка снята для заказа #{order_id}")

    # 5. ТЕПЕРЬ МЕНЯЕМ СТАТУС НА 'rented' (теперь пользователь может отправить ссылку)
    async with db.aiosqlite.connect(db.DB_PATH) as conn:
        await conn.execute("UPDATE orders SET status = 'rented' WHERE id = ?", (order_id,))
        await conn.commit()
    logging.info(f"🔒 Транзакция выполнена, статус изменен на 'rented' для #{order_id}")

    # 6. ЕСЛИ ССЫЛКА УЖЕ ЕСТЬ В БД (пользователь ввел заранее), ПРИВЯЗЫВАЕМ ЕЁ
    current_order = await db.get_order_by_id(order_id)
    if current_order and current_order['tc_link']:
        tc_link = current_order['tc_link']
        saved_token = current_order.get('api_token') or os.getenv("MARKETAPP_TOKEN_BUYER")
        logging.info(f"🔗 Ссылка обнаружена в БД для #{order_id}. Привязываю автоматически...")
        try:
            url_tc = f"{MARKET_URL}/rent/{order['nft_address']}/tonconnect/"
            payload_tc = {"tonconnect_url": tc_link}
            headers = {"Authorization": saved_token, "Content-Type": "application/json"}
            async with aiohttp.ClientSession() as session:
                # Небольшой ретрай и тут на всякий случай
                for _ in range(3):
                    async with session.post(url_tc, headers=headers, json=payload_tc, timeout=15) as resp:
                        body = await resp.text()
                        logging.info(f"📥 Авто-привязка (TonConnect): status={resp.status} body={body}")
                        if resp.status == 200: break
                        await asyncio.sleep(10)
        except Exception as e:
            logging.error(f"❌ Ошибка авто-привязки ссылки: {e}")

    logging.info(f"🎉 Процесс покупки для #{order_id} завершен.")

async def monitor_wallet():
    """Следим за транзакциями на кошельках (новом и старом для совместимости)"""
    # Список кошельков для мониторинга
    WALLETS_TO_MONITOR = [OWNER_WALLET_ADDR]
    OLD_WALLET = "UQBxgCx_WJ4_fKgz8tec73NZadhoDzV250-Y0taVPJstZsRl"
    if OLD_WALLET not in WALLETS_TO_MONITOR:
        WALLETS_TO_MONITOR.append(OLD_WALLET)
        
    logging.info(f"👀 Мониторинг кошельков {WALLETS_TO_MONITOR} запущен...")
    
    client = ToncenterV2Client(base_url="https://toncenter.com", api_key="")
    last_tx_hashes = {addr: None for addr in WALLETS_TO_MONITOR}

    import datetime
    while True:
        for addr in WALLETS_TO_MONITOR:
            try:
                # Получаем последние транзакции (увеличиваем лимит)
                logging.info(f"🔎 Сканирую {addr[:10]}... (последние 50)...")
                txs = await client.get_transactions(addr, limit=50)
                
                new_last_hash = None
                if txs:
                    import binascii
                    new_last_hash = binascii.hexlify(txs[0].cell.hash).decode()

                for tx in txs:
                    import binascii
                    tx_hash = binascii.hexlify(tx.cell.hash).decode()
                    
                    if last_tx_hashes[addr] == tx_hash: 
                        break
                    
                    tx_time = datetime.datetime.fromtimestamp(tx.now)
                    now_time = datetime.datetime.now()
                    
                    logging.info(f"🔹 [{addr[:8]}] Проверяю транзакцию {tx_hash[:10]} (Time: {tx_time})")

                    # Мы полагаемся на проверку tx_hash в БД и статус заказа. 
                    # Это позволяет боту обрабатывать платежи, пришедшие пока он был выключен.

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
                                        # logging.info(f"   ⚠️ Уже обработана (tx_hash в базе)")
                                        continue # Уже было

                                # Пытаемся получить комментарий (memo)
                                order = None
                                memo_text = "N/A"
                                try:
                                    if tx.in_msg.body:
                                        # Комментарий в TON начинается с 0x00000000
                                        reader = tx.in_msg.body.begin_parse()
                                        if len(reader) >= 32:
                                            op_code = reader.load_uint(32)
                                            if op_code == 0:
                                                memo_text = reader.load_string().strip()
                                                logging.info(f"   📝 Найден комментарий: {memo_text}")
                                                
                                                # Гибкий парсинг: ищем "order:X" в любой части строки
                                                import re
                                                match = re.search(r'order:(\d+)', memo_text)
                                                if match:
                                                    order_id = int(match.group(1))
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
                                    if order['id'] in processing_orders:
                                        logging.info(f"   ⚠️ Заказ #{order['id']} уже в обработке, пропускаем.")
                                        continue
                                        
                                    logging.info(f"   🎯 СОВПАДЕНИЕ! Оплата {amount_ton} TON для заказа #{order['id']}")
                                    processing_orders.add(order['id'])
                                    await db.update_order_status(order['id'], 'paid', tx_hash=tx_hash)
                                    
                                    def handle_task_result(task):
                                        try: task.result()
                                        except Exception as e: logging.error(f"❌ Ошибка в задаче process_payment: {e}")

                                    task = asyncio.create_task(process_payment(order))
                                    task.add_done_callback(handle_task_result)
                                else:
                                    if amount_ton > 0.01: # Игнорируем микро-спам
                                        logging.warning(f"   ❓ ВНИМАНИЕ: Не опознан платеж! Сумма: {amount_ton} TON, Memo: '{memo_text}', Hash: {tx_hash}")
                    except Exception as e_inner:
                        logging.error(f"Ошибка обработки транзакции {tx_hash[:10]}: {e_inner}")
                    
                if new_last_hash: 
                    last_tx_hashes[addr] = new_last_hash
                
            except Exception as e:
                logging.error(f"Ошибка мониторинга {addr[:10]}: {e}")
            
        await asyncio.sleep(10) # Проверка раз в 10 секунд

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
                if order['id'] in processing_orders:
                    continue

                # Проверяем, доступен ли товар сейчас в нашей базе
                item = await db.get_item_by_id_addr(order['nft_address'])
                if item and item['status'] == 'available':
                    logging.info(f"🚀 Предзаказ/Оплаченный заказ #{order['id']} дождался доступности {order['nft_name']}. Начинаю выкуп...")
                    processing_orders.add(order['id'])
                    asyncio.create_task(process_payment(dict(order)))
                else:
                    logging.debug(f"⏳ Заказ #{order['id']} всё еще ждет доступности {order['nft_name']}...")
            
        except Exception as e:
            logging.error(f"Ошибка в check_pending_orders: {e}")
            
        await asyncio.sleep(30) # Проверка каждые 30 секунд

async def process_referral_withdrawals():
    """Периодически проверяет очередь выплат и отправляет TON пользователям"""
    logging.info("💸 Воркер автоматических выплат реферальных вознаграждений запущен...")
    while True:
        try:
            pending = await db.get_pending_withdrawals()
            if not pending:
                await asyncio.sleep(60) # Если пусто, спим минуту
                continue
            
            # Инициализируем клиент и кошелек
            client = ToncenterV2Client(base_url="https://toncenter.com", api_key=TONCENTER_API_KEY)
            
            import binascii
            if OWNER_WALLET_ADDR and (OWNER_WALLET_ADDR.startswith("UQB") or OWNER_WALLET_ADDR.startswith("EQB")):
                if OWNER_HEX_KEY:
                    full_key = binascii.unhexlify(OWNER_HEX_KEY)
                    wallet = WalletV5R1(client, private_key=full_key[:32], public_key=full_key[32:], wallet_id=2147483409)
                else:
                    wallet, _, _, _ = WalletV5R1.from_mnemonic(client, OWNER_SEED, wallet_id=2147483409)
            else:
                wallet, _, _, _ = WalletV4R2.from_mnemonic(client, OWNER_SEED)

            for wd in pending:
                logging.info(f"💰 Обработка выплаты #{wd['id']}: {wd['amount']} TON на {wd['wallet_address']}")
                
                try:
                    # Обновляем статус на 'processing', чтобы другие воркеры не подхватили (на будущее)
                    await db.update_withdrawal_status(wd['id'], 'processing')
                    
                    current_seqno = await wallet.get_seqno(client, wallet.address)
                    
                    # Отправка транзакции (простой перевод без Payload)
                    # Используем комментарий для удобства пользователя
                    transfer_memo = f"Referral payout from OctoRent"
                    body_cell = begin_cell().store_uint(0, 32).store_string(transfer_memo).end_cell()
                    
                    await wallet.transfer(
                        destination=wd['wallet_address'],
                        amount=wd['amount'],
                        body=body_cell,
                        seqno=current_seqno
                    )
                    
                    logging.info(f"🚀 Выплата #{wd['id']} отправлена. Ожидаем seqno {current_seqno} -> {current_seqno + 1}")
                    
                    # Краткое ожидание подтверждения
                    success = False
                    for _ in range(6): 
                        await asyncio.sleep(10)
                        if await wallet.get_seqno(client, wallet.address) > current_seqno:
                            logging.info(f"✅ Выплата #{wd['id']} подтверждена!")
                            success = True
                            break
                    
                    if success:
                        await db.update_withdrawal_status(wd['id'], 'completed')
                    else:
                        logging.warning(f"⚠️ Выплата #{wd['id']} отправлена, но seqno еще не вырос. Считаем выполненным.")
                        await db.update_withdrawal_status(wd['id'], 'completed')

                except Exception as e_wd:
                    logging.error(f"❌ Ошибка при выплате #{wd['id']}: {e_wd}")
                    await db.update_withdrawal_status(wd['id'], 'failed')

        except Exception as e:
            logging.error(f"Ошибка в воркере выплат: {e}")
            
        await asyncio.sleep(60)

async def sync_rented_tc_links():
    """Фоновая задача для автоматической привязки tc_link к Fragment (дожим)"""
    logging.info("🔗 Воркер синхронизации TonConnect запущен...")
    while True:
        try:
            # Ищем заказы со статусом 'rented' (или даже 'active'), где есть ссылка, но она еще не была "дожата"
            # Мы можем ориентироваться на то, что если tc_link есть, а статус все ещё rented, то надо пробовать.
            async with db.aiosqlite.connect(db.DB_PATH) as conn:
                conn.row_factory = db.aiosqlite.Row
                async with conn.execute(
                    "SELECT * FROM orders WHERE status IN ('rented', 'active') AND tc_link IS NOT NULL AND api_token IS NOT NULL"
                ) as cursor:
                    orders = await cursor.fetchall()

            if orders:
                async with aiohttp.ClientSession() as session:
                    for order in orders:
                        try:
                            logging.info(f"🔄 [Sync] Пробую привязку Fragment для заказа #{order['id']} (NFT: {order['nft_address'][32:]})...")
                            url_tc = f"{MARKETAPP_API}/rent/{order['nft_address']}/tonconnect/"
                            payload_tc = {"tonconnect_url": order['tc_link']}
                            headers = {"Authorization": order['api_token'], "Content-Type": "application/json"}
                            
                            async with session.post(url_tc, headers=headers, json=payload_tc, timeout=15, proxy=PROXY_URL) as resp:
                                body = await resp.text()
                                if resp.status == 200:
                                    logging.info(f"✅ [Sync] Успешная привязка для #{order['id']}! Ответ: {body}")
                                    # Опционально: можно пометить в БД что привязка выполнена, чтобы не спамить. 
                                    # Но на данный момент у нас нет отдельного поля. MarketApp сам отсечет повторы.
                                else:
                                    # Если ошибка типа "Уже привязано" - это тоже хорошо.
                                    logging.info(f"ℹ️ [Sync] Ответ MarketApp для #{order['id']} ({resp.status}): {body}")
                        except Exception as e_order:
                            logging.error(f"❌ [Sync] Ошибка привязки заказа #{order['id']}: {e_order}")
        except Exception as e:
            logging.error(f"❌ [Sync] Ошибка в воркере синхронизации TC: {e}")
            
        await asyncio.sleep(120) # Проверяем раз в 2 минуты

async def main():
    # Запускаем мониторинг кошелька и воркер предзаказов параллельно
    await asyncio.gather(
        monitor_wallet(),
        check_pending_orders(),
        process_referral_withdrawals(),
        sync_rented_tc_links()
    )

if __name__ == "__main__":
    asyncio.run(main())
