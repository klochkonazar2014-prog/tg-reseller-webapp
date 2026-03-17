"""
OctoRent Support v6 — Supergroup Topics Edition
Работает в супергруппе с форум-топиками.
Каждый пользователь получает свой топик.
Groq AI отвечает в топике. При баге — тегает живую поддержку.
"""

import os
import json
import logging
import asyncio
import base64
import time
import random
import sqlite3
from collections import defaultdict
from pathlib import Path
from datetime import datetime
from dotenv import load_dotenv
from pyrogram import Client, filters, raw, types, enums
from pyrogram.types import Message, CallbackQuery, InlineKeyboardMarkup, InlineKeyboardButton, ChatJoinRequest
from pyrogram.errors import FloodWait
from pyrogram.enums import ChatType, ParseMode
from groq import Groq

# --- НАСТРОЙКА ЛОГОВ ---
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler("userbot_support.log", encoding='utf-8'),
        logging.StreamHandler()
    ]
)

# --- ПЕРЕМЕННЫЕ ОКРУЖЕНИЯ ---
load_dotenv(override=True)
API_ID = os.getenv("TELEGRAM_API_ID")
API_HASH = os.getenv("TELEGRAM_API_HASH")
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
SUPPORT_GROUP_ID = int(os.getenv("SUPPORT_GROUP_ID", "0"))  # ID супергруппы с топиками
SUPPORT_BOT_TOKEN = os.getenv("SUPPORT_BOT_TOKEN")  # Токен от @BotFather
LIVE_SUPPORT_ID = int(os.getenv("LIVE_SUPPORT_ID", "8037690809"))  # ID живой поддержки

if not all([API_ID, API_HASH, GROQ_API_KEY, SUPPORT_GROUP_ID, SUPPORT_BOT_TOKEN]):
    logging.error("❌ Отсутствуют необходимые ключи: TELEGRAM_API_ID, TELEGRAM_API_HASH, GROQ_API_KEY, SUPPORT_GROUP_ID, SUPPORT_BOT_TOKEN")
    exit(1)

# --- DATABASE (History TTL 24h) ---
DB_PATH = "support_history.db"

def init_db():
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                role TEXT,
                content TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.commit()

def add_history(user_id, role, content):
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("INSERT INTO history (user_id, role, content) VALUES (?, ?, ?)", (user_id, role, content))

def get_history(user_id):
    with sqlite3.connect(DB_PATH) as conn:
        cursor = conn.execute(
            "SELECT role, content FROM history WHERE user_id = ? ORDER BY timestamp ASC", (user_id,)
        )
        return [{"role": row[0], "content": row[1]} for row in cursor.fetchall()]

def clean_old_history():
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("DELETE FROM history WHERE timestamp < datetime('now', '-1 day')")
        conn.commit()

init_db()

# --- GROQ CLIENT ---
groq_client = Groq(api_key=GROQ_API_KEY)

# --- ФАЙЛ ДЛЯ ТРЕККИНГА ПОЛЬЗОВАТЕЛЬ -> ТОПИК ---
TOPICS_FILE = Path("support_topics.json")

def load_topics() -> dict:
    if TOPICS_FILE.exists():
        with open(TOPICS_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}

def save_topics(data: dict):
    with open(TOPICS_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

# user_id (str) -> {topic_id: int, username: str, created_at: int}
user_topics: dict = load_topics()

# --- SYSTEM PROMPT (OctoRent Wiki) ---
def get_system_instruction():
    k_file = Path("support_knowledge.txt")
    knowledge = k_file.read_text(encoding="utf-8") if k_file.exists() else "Техническая база знаний временно недоступна."
    
    return f"""
Ты — EXPERT SUPPORT AI проекта OctoRent. Технический гений, который знает проект на уровне кода.
Твой стиль: на «ты», дружелюбный, но конкретный. Используй эмодзи.

### 🧠 ГЛУБОКИЕ ТЕХНИЧЕСКИЕ ЗНАНИЯ (ОБЯЗАТЕЛЬНО К ПРОЧТЕНИЮ)
{knowledge}

### 🔴 СТРОГИЕ ПРАВИЛА И ОГРАНИЧЕНИЯ (НАРУШЕНИЕ ЗАПРЕЩЕНО)
1. КОМИССИИ И РАСЧЕТЫ: ЗАПРЕЩЕНО показывать ход решения или формулы. ЗАПРЕЩЕНО упоминать любые проценты или «20%».
   - Если пользователь дает цену, считай в уме по ПРАВИЛЬНОЙ ТАБЛИЦЕ (ниже) и выдавай только итог: «При цене X за 5 дней тебе достанется Y TON».
   - ТАБЛИЦА МАРЖИ (Комиссия вычитается из цены за день):
     * До 0.10 TON: комиссия 0.05
     * 0.11 - 0.25 TON: комиссия 0.10
     * 0.26 - 0.50 TON: комиссия 0.15  <-- (Для цены 0.29 это тут)
     * 0.51 - 1.00 TON: комиссия 0.25
     * 1.01 - 2.50 TON: комиссия 0.45
     * Свыше 5.00 TON: комиссия 1.00
   - ПРИМЕР: Цена 0.29. Комиссия 0.15. Чистая прибыль (0.29 - 0.15) = 0.14 TON в день. За 5 дней = 0.70 TON.
   - ОТВЕТЬ ПРОСТО: «За 5 дней аренды этого подарка ты получишь 0.70 TON. 💸» (Никаких объяснений!).

2. СТИЛЬ: Будь максимально лаконичен. Если можешь ответить одной фразой — отвечай одной фразой. Используй дружелюбный тон «на ты».

3. КОНФИДЕНЦИАЛЬНОСТЬ: Никогда не выдавай технические ключи, названия таблиц БД или внутренние переменные (MARKETAPP_TOKEN и т.д.).

4. БАГИ: Если видишь реальную ошибку — ставь [BUG] в конце. Если это просто вопрос — [BUG] не ставить.

### 🔍 КРИТЕРИИ БАГА (КОГДА СТАВИТЬ [BUG])
Ставь [BUG] в конец ответа ТОЛЬКО если:
1. Юзер прислал скриншот с красным текстом ошибки (500, 403, 400, "Request Failed").
2. Юзер жалуется на техническую неисправность: «не работает кнопка», «баланс не пополнился после оплаты», «бот завис», «белый экран».
3. Ты видишь в коде/базе знаний, что конкретный процесс (например, аренда) вернул ошибку, которую юзер не может исправить сам.
4. **НЕ СТАВЬ [BUG]**, если юзер просто тупит, не знает куда нажать, спрашивает «как это работает» или у него просто нет денег на балансе. Это — консультация, а не баг.

### 📸 ЗАПРОС СКРИНШОТОВ
Если пользователь описывает проблему словами, но **не прислал скриншот**, и ты подозреваешь баг:
- Вежливо попроси: «Пожалуйста, пришли скриншот ошибки или того места, где возникла проблема. Это поможет мне быстрее разобраться».
- Пока скриншота нет — старайся помочь советом из базы знаний, но [BUG] не ставь.

### 👁️ VISION (АНАЛИЗ СКРИНШОТОВ)
- Если на скрине «Success», «Paid», «Active» — это НЕ баг. Поздравь юзера.
- Если на скрине «Error», «Forbidden», «Timeout» — это баг. Объясни причину из базы знаний и добавь [BUG].

### 🔁 КАК ОТВЕЧАТЬ
- Будь кратким. Если это баг — успокой юзера: «Я вижу проблему, уже позвал живую поддержку, они скоро всё поправят».
- Если это не баг — дай пошаговую инструкцию.
"""

# --- МЕНЕДЖЕР ПОЛЬЗОВАТЕЛЕЙ (Антиспам + Карцер) ---
class UserManager:
    def __init__(self):
        self.users = defaultdict(lambda: {
            "msg_count": 0,
            "photo_count": 0,
            "trash_streak": 0,
            "last_reset": time.time(),
            "jail_until": 0
        })

    def get_user(self, user_id):
        user = self.users[user_id]
        if time.time() - user["last_reset"] > 86400:
            user["msg_count"] = 0
            user["photo_count"] = 0
            user["trash_streak"] = 0
            user["last_reset"] = time.time()
        return user

    def is_trash(self, text):
        trash_words = ["а", "рвраовар", "иди нахуй", "даун", "лол", "фыв", "...", "ы", "?"]
        t = text.lower().strip()
        return len(t) < 2 or t in trash_words

user_manager = UserManager()

# --- БУФЕР СООБЩЕНИЙ (Ждун 4.5с — объединяет быстрые сообщения) ---
class MessageBuffer:
    def __init__(self):
        self.buffer = defaultdict(lambda: {"texts": [], "images": [], "timer": None, "topic_id": None})

    async def add(self, user_id, topic_id, text, image_b64, callback):
        data = self.buffer[user_id]
        if text: data["texts"].append(text)
        if image_b64: data["images"].append(image_b64)
        data["topic_id"] = topic_id  # Обновляем topic_id

        if data["timer"]:
            data["timer"].cancel()

        data["timer"] = asyncio.create_task(self._wait_and_send(user_id, callback))

    async def _wait_and_send(self, user_id, callback):
        await asyncio.sleep(4.5)
        data = self.buffer.pop(user_id, {"texts": [], "images": [], "topic_id": None})
        combined_text = "\n".join(data["texts"])
        combined_image = data["images"][-1] if data["images"] else None
        topic_id = data["topic_id"]
        await callback(user_id, topic_id, combined_text, combined_image)

msg_buffer = MessageBuffer()

# --- PYROGRAM CLIENT (Bot Mode) ---
app = Client(
    "support_bot_session", 
    api_id=API_ID, 
    api_hash=API_HASH, 
    bot_token=SUPPORT_BOT_TOKEN
)

# --- AI ---
async def get_ai_response(user_id, user_text, image_b64=None):
    """Запрос к Groq с учетом истории сообщений пользователя."""
    vision_model = "llama-3.2-11b-vision-preview" # Более легкая вижн-модель
    text_model = "llama-3.1-8b-instant"          # Супер-быстрая и экономная модель
    
    # Загружаем историю (берем только последние 5 сообщений для экономии токенов)
    history = get_history(user_id)[-5:]
    
    try:
        model = vision_model if image_b64 else text_model
        
        # Формируем контекст
        messages = [{"role": "system", "content": get_system_instruction()}]
        messages.extend(history)
        
        content = [{"type": "text", "text": user_text or "[Скриншот без текста]"}]
        if image_b64:
            content.append({"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{image_b64}"}})
        
        messages.append({"role": "user", "content": content})

        completion = groq_client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=0.6,
            max_tokens=900
        )
        reply = completion.choices[0].message.content
        
        # Сохраняем в историю
        add_history(user_id, "user", user_text or "[Скриншот]")
        add_history(user_id, "assistant", reply)
        
        return reply
    except Exception as e:
        logging.warning(f"⚠️ Ошибка Groq ({model}): {e}")
        if image_b64:
            try:
                completion = groq_client.chat.completions.create(
                    model=text_model,
                    messages=[{"role": "system", "content": get_system_instruction()}, {"role": "user", "content": user_text or "Пользователь прислал скриншот"}],
                    temperature=0.6, max_tokens=900
                )
                return completion.choices[0].message.content + "\n\n_(Скриншот не удалось обработать, ответил на текст)_"
            except: pass
        return "⚠️ Временные проблемы с AI. Живая поддержка скоро ответит."

async def ensure_user_topic(user_id: int, user_name: str) -> int:
    """
    Возвращает topic_id для пользователя. Создаёт новый топик, если его ещё нет.
    """
    key = str(user_id)
    if key in user_topics:
        return user_topics[key]["topic_id"]

    # Создаём форум-топик через RAW API (надежнее для ботов)
    display_name = f"👤 {user_name} [{user_id}]"
    try:
        # Пытаемся создать через сырой вызов API
        peer = await app.resolve_peer(SUPPORT_GROUP_ID)
        result = await app.invoke(
            raw.functions.channels.CreateForumTopic(
                channel=peer,
                title=display_name,
                random_id=random.getrandbits(63)
            )
        )
        # Извлекаем ID топика из сервисного сообщения
        topic_id = result.updates[0].id if hasattr(result, "updates") else 0
        
        if not topic_id:
            # Запасной вариант если raw не вернул ID
            logging.warning(f"⚠️ Raw API не вернул ID, пробуем стандартный метод...")
            topic = await app.create_forum_topic(SUPPORT_GROUP_ID, display_name)
            topic_id = topic.id

        user_topics[key] = {
            "topic_id": topic_id,
            "username": user_name,
            "created_at": int(time.time())
        }
        save_topics(user_topics)

        # Приветственное сообщение в топик
        await app.send_message(
            SUPPORT_GROUP_ID,
            f"🆕 Новое обращение от **{user_name}** (`{user_id}`)\n\n"
            f"@OctoRent_Support готов отвечать в этой теме!",
            reply_to_message_id=topic_id
        )
        logging.info(f"✅ Создан топик #{topic_id} для {user_name} ({user_id})")
        return topic_id
    except Exception as e:
        logging.error(f"❌ Ошибка создания топика для {user_id}: {e}")
        raise

async def tag_live_support(topic_id: int, user_id: int, reason: str):
    """Тегает живую поддержку по ID в топике."""
    try:
        # Используем HTML-упоминание для гарантированного уведомления
        mention = f'<a href="tg://user?id={LIVE_SUPPORT_ID}">Поддержка</a>'
        
        # Ссылка на пользователя
        user_link = f'<a href="tg://user?id={user_id}">пользователя</a>'

        await app.send_message(
            SUPPORT_GROUP_ID,
            f"🔴 {mention}, тут обнаружен баг у {user_link}! 🔍\n"
            f"<b>Причина:</b> {reason}",
            reply_to_message_id=topic_id,
            parse_mode=ParseMode.HTML
        )
        logging.info(f"🔔 Тег поддержки отправлен в топик {topic_id}")
    except Exception as e:
        logging.error(f"❌ Ошибка тегания поддержки: {e}")

async def final_callback(user_id: int, topic_id: int, text: str, image_b64: str):
    """Финальная обработка после буфера."""
    user = user_manager.get_user(user_id)

    # 1. Карцер
    if time.time() < user["jail_until"]:
        return

    # 2. Мусор
    if text and user_manager.is_trash(text):
        user["trash_streak"] += 1
        if user["trash_streak"] >= 5:
            user["jail_until"] = time.time() + 900
            await app.send_message(
                SUPPORT_GROUP_ID,
                "🚫 Пользователь временно заблокирован за спам (15 мин).",
                reply_to_message_id=topic_id
            )
            return
        await app.send_message(
            SUPPORT_GROUP_ID,
            "⚠️ Пожалуйста, сформулируй вопрос понятнее.",
            reply_to_message_id=topic_id
        )
        return
    else:
        user["trash_streak"] = 0

    # 3. Лимиты
    if user["msg_count"] >= 200:
        await app.send_message(
            SUPPORT_GROUP_ID,
            "🛑 Дневной лимит (200 сообщений) исчерпан. Ожидай следующего дня.",
            reply_to_message_id=topic_id
        )
        return
    if image_b64 and user["photo_count"] >= 5:
        await app.send_message(
            SUPPORT_GROUP_ID,
            "📸 Лимит на скриншоты (5 шт./день) исчерпан. Опишите проблему текстом.",
            reply_to_message_id=topic_id
        )
        return

    # 4. AI ответ
    user["msg_count"] += 1
    if image_b64:
        user["photo_count"] += 1

    prompt = text if text else "[Пользователь прислал только скриншот, текста нет]"
    ai_reply = await get_ai_response(user_id, prompt, image_b64)

    # 5. Отправляем ответ в топик (убираем внутренний тег [BUG] из видимого ответа)
    is_bug = "[BUG]" in ai_reply
    clean_reply = ai_reply.replace("[BUG]", "").strip()

    await app.send_message(
        SUPPORT_GROUP_ID,
        clean_reply,
        reply_to_message_id=topic_id
    )

    # 6. Если баг — тегаем живую поддержку (но не тегаем самого админа, если он пишет)
    if is_bug and int(user_id) != LIVE_SUPPORT_ID:
        await tag_live_support(topic_id, user_id, f"{text[:100]}")

# --- ОБРАБОТЧИКИ ---

@app.on_message(filters.private & ~filters.me)
async def handle_private_message(client: Client, message: Message):
    """
    Когда пользователь пишет юзерботу в личку —
    создаём топик в группе и перенаправляем туда.
    """
    user = message.from_user
    user_id = user.id
    user_name = user.username or user.first_name or str(user_id)

    try:
        topic_id = await ensure_user_topic(user_id, user_name)
    except Exception:
        await message.reply("⚠️ Не удалось создать тему. Попробуй позже.")
        return

    # Уведомляем пользователя (только при первом обращении)
    key = str(user_id)
    if user_topics.get(key, {}).get("notified") is not True:
        group_username = os.getenv("SUPPORT_GROUP_USERNAME", "")
        if group_username:
            topic_link = f"https://t.me/{group_username.lstrip('@')}/{topic_id}"
            await message.reply(
                f"✅ Твоё обращение принято!\n"
                f"Перейди в тему поддержки и пиши там:\n"
                f"{topic_link}\n\n"
                f"AI-поддержка ответит в течение нескольких секунд."
            )
        else:
            await message.reply(
                "✅ Обращение принято! Пиши в группу поддержки, я отвечу там."
            )
        user_topics[key]["notified"] = True
        save_topics(user_topics)

    # Пересылаем первое сообщение в топик
    user_text = message.text or message.caption or ""
    image_b64 = None
    if message.photo:
        try:
            pb = await client.download_media(message, in_memory=True)
            if pb: image_b64 = base64.b64encode(pb.getbuffer()).decode('utf-8')
        except: pass

    # Пересылаем текст сообщения в топик как цитату
    if user_text or image_b64:
        if user_text:
            await app.send_message(
                SUPPORT_GROUP_ID,
                f"**{user_name}**: {user_text}",
                reply_to_message_id=topic_id
            )
        await msg_buffer.add(user_id, topic_id, user_text, image_b64, final_callback)


@app.on_message(filters.chat(SUPPORT_GROUP_ID) & filters.new_chat_members)
async def handle_new_member(client: Client, message: Message):
    """Создаем топик сразу при вступлении в группу по обычной ссылке"""
    for user in message.new_chat_members:
        if user.is_bot: continue
        try:
            user_name = user.username or user.first_name or str(user.id)
            topic_id = await ensure_user_topic(user.id, user_name)
            logging.info(f"✅ Создан топик {topic_id} для нового участника {user_name}")
        except Exception as e:
            logging.error(f"❌ Ошибка создания топика при вступлении: {e}")

@app.on_message(
    filters.chat(SUPPORT_GROUP_ID)
    & ~filters.me
)
async def handle_group_topic_message(client: Client, message: Message):
    """
    Двусторонний мост с расширенным логированием для отладки.
    """
    # Попытка получить ID топика всеми возможными способами
    topic_id = getattr(message, "message_thread_id", None)
    
    # 1. Пробуем через топ-сообщение (основа темы)
    if not topic_id and hasattr(message, "reply_to_top_message_id") and message.reply_to_top_message_id:
        topic_id = message.reply_to_top_message_id
    
    # 2. Пробуем через обычный ответ (на случай если это первый ответ в теме)
    if not topic_id and message.reply_to_message_id:
        topic_id = message.reply_to_message_id

    # Логируем для отладки
    sid = message.from_user.id if message.from_user else "System"
    is_media = " [PHOTO]" if message.photo else ""
    logging.info(f"DEBUG: Msg. TopicID: {topic_id}, SID: {sid}, Text: {message.text[:20] if message.text else '...'}")

    # Если это General (совсем нет признаков топика)
    if not topic_id or topic_id <= 1:
        if message.text and not message.text.startswith("/"):
            user = message.from_user
            if user and user.id != LIVE_SUPPORT_ID:
                user_id = user.id
                key = str(user_id)
                now = time.time()
                
                # Анти-флуд для предупреждения (раз в 5 минут)
                last_warn = user_topics.get(key, {}).get("last_general_warn", 0)
                if now - last_warn < 300:
                    return

                # Получаем ссылку на топик
                existing_topic = user_topics.get(key, {}).get("topic_id")
                
                warn_text = "👋 Привет! Мы общаемся в персональных темах.\n"
                if existing_topic:
                    # Универсальная ссылка для приватных и публичных групп
                    clean_id = str(SUPPORT_GROUP_ID).replace("-100", "")
                    topic_link = f"https://t.me/c/{clean_id}/{existing_topic}"
                    
                    group_username = os.getenv("SUPPORT_GROUP_USERNAME", "").replace("@", "")
                    if group_username and "your_group" not in group_username:
                        topic_link = f"https://t.me/{group_username}/{existing_topic}"
                        
                    warn_text += f"Я уже создал для тебя отдельную тему: {topic_link}\n\nПиши, пожалуйста, <b>ТУДА</b> — там ответит ИИ!"
                else:
                    warn_text += "Найди тему со своим именем в списке топиков группы и пиши туда — там ответит ИИ!"
                
                await message.reply(warn_text, parse_mode=ParseMode.HTML, disable_web_page_preview=True)
                
                # Запоминаем время последнего варна
                if key not in user_topics: 
                    user_topics[key] = {"topic_id": existing_topic, "username": user.username}
                user_topics[key]["last_general_warn"] = now
                save_topics(user_topics)
        return

    # Находим владельца темы
    owner_id = None
    for uid, data in user_topics.items():
        if int(data.get("topic_id")) == int(topic_id):
            owner_id = int(uid)
            break
    
    if owner_id is None:
        logging.debug(f"ℹ️ Сообщение в топике {topic_id}, но владелец не найден в базе.")
        return

    sender_id = message.from_user.id if message.from_user else None
    logging.info(f"📩 Сообщение в топике {topic_id} от {sender_id}. Владелец: {owner_id}")

    # А. Сообщение от пользователя (через группу) -> отвечает ИИ
    if sender_id and int(sender_id) == int(owner_id):
        logging.info(f"🤖 ИИ обрабатывает сообщение от владельца {owner_id}")
        user_text = message.text or message.caption or ""
        image_b64 = None
        if message.photo:
            try:
                logging.info(f"📸 Загрузка фото от {owner_id}...")
                pb = await client.download_media(message, in_memory=True)
                if pb:
                    image_b64 = base64.b64encode(pb.getbuffer()).decode('utf-8')
                    logging.info(f"✅ Фото успешно загружено и закодировано (размер: {len(image_b64)} байт)")
                else:
                    logging.warning("⚠️ Не удалось загрузить фото (пустой буфер)")
            except Exception as e:
                logging.error(f"❌ Ошибка загрузки фото: {e}")
        
        await msg_buffer.add(owner_id, topic_id, user_text, image_b64, final_callback)

    # Б. Сообщение от админов (поддержки) -> пересылаем пользователю в ЛС
    else:
        try:
            if message.text:
                await app.send_message(owner_id, f"👨‍💻 **Поддержка:**\n{message.text}")
            elif message.photo:
                await message.copy(owner_id, caption=f"👨‍💻 **Поддержка:**\n{message.caption or ''}")
            logging.info(f"➡️ Ответ поддержки ушел юзеру {owner_id}")
        except Exception as e:
            logging.error(f"❌ Ошибка пересылки ответа юзеру {owner_id}: {e}")


@app.on_chat_join_request()
async def handle_join_request(client: Client, request: ChatJoinRequest):
    """Автоматическое одобрение заявок + приветствие"""
    if request.chat.id == SUPPORT_GROUP_ID:
        try:
            await request.approve()
            user_id = request.from_user.id
            user_name = request.from_user.first_name or "User"
            logging.info(f"✅ Одобрена заявка от {user_name} ({user_id})")
            
            # Создаем тему для пользователя сразу
            await ensure_user_topic(user_id, user_name)
        except Exception as e:
            logging.error(f"❌ Ошибка одобрения заявки: {e}")

async def background_tasks():
    """Очистка старой истории раз в час"""
    while True:
        try:
            clean_old_history()
            logging.info("🧹 История сообщений (старше 24ч) очищена.")
        except Exception as e:
            logging.error(f"❌ Ошибка очистки истории: {e}")
        await asyncio.sleep(3600)

async def start_bot():
    """Запуск бота и фоновых задач"""
    await app.start()
    asyncio.create_task(background_tasks())
    logging.info("📢 Бот запущен и готов к работе!")
    from pyrogram.methods.utilities.idle import idle
    await idle()
    await app.stop()

if __name__ == "__main__":
    # Фиксируем твой ID для уведомлений
    LIVE_SUPPORT_ID = 8037690809
    logging.info("🚀 Запуск OctoRent Support v6 (Smart Bridge)...")
    logging.info(f"🆘 Живая поддержка ID: {LIVE_SUPPORT_ID}")
    
    try:
        app.run(start_bot())
    except:
        # Для старых версий или если run не принимает корутину
        loop = asyncio.get_event_loop()
        loop.run_until_complete(start_bot())
