import os
import logging
import asyncio
import base64
import io
import time
from collections import defaultdict
from dotenv import load_dotenv
from pyrogram import Client, filters
from pyrogram.types import Message
from groq import Groq

# Настройка логов
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler("userbot_debug.log", encoding='utf-8'),
        logging.StreamHandler()
    ]
)

# Переменные окружения
load_dotenv(override=True)
API_ID = os.getenv("TELEGRAM_API_ID")
API_HASH = os.getenv("TELEGRAM_API_HASH")
GROQ_API_KEY = os.getenv("GROQ_API_KEY")

if not all([API_ID, API_HASH, GROQ_API_KEY]):
    logging.error("❌ Отсутствуют необходимые ключи в .env")
    exit(1)

# Инициализация Groq
groq_client = Groq(api_key=GROQ_API_KEY)

# --- ГЛУБОКИЕ ЗНАНИЯ И ИНСТРУКЦИИ ---
SYSTEM_INSTRUCTION = """
Ты — EXPERT SUPPORT AI проекта OctoRent. Технический гений, который знает проект на уровне кода.
Твой стиль: на «ты», дружелюбный, но строгий. Используй эмодзи.

### 🧠 ГЛУБОКИЕ ТЕХНИЧЕСКИЕ ЗНАНИЯ (OctoRent Wiki)
- **Архитектура**: Мы работаем через Mini App (acd_app.js), Backend (live_server.py) и Auto-Buyer (auto_buyer.py).
- **Оплата (Три кита)**:
  1. TON (Прямой перевод на кошелек): Самый надежный.
  2. xRocket: Удобно, но доп. комиссия 0.1 TON за вывод из их бота.
  3. USDT (TonConnect): Прямая оплата Jettons.
  4. CloudTips: Поддержка карт РФ и СБП (в процессе финальной калибровки).
- **Смарт-контракты**: При аренде вызывается контракт. Депозит 0.2 TON обязателен. Кэшбэк/возврат газа (~0.14 TON) приходит СРАЗУ (в ту же секунду) ПОСЛЕ ОКОНЧАНИЯ АРЕНДЫ (при возврате актива).
- **Fragment**: Блокчейн TON иногда лагает. Транзакция может появиться в Fragment через 1-2 минуты. Нужно просто ждать.
- **Длительность**: От 1 до 180 дней. После срока NFT отвязывается сама.
- **Партнерка**: 25% от нашей прибыли (комиссии сервиса). Вывод от 0.1 TON.

### 🔴 СТРОГИЕ ЗАПРЕТЫ
1. НИКОГДА не используй слово «НАЦЕНКА». Используй только «Комиссия сервиса».
2. Если спрашивают «почему дороже, чем на Fragment» — отвечай: «Комиссия сервиса OctoRent уже включена, она покрывает работу системы, техподдержку и выплаты рефералам».
3. Комиссия сервиса ФИКСИРОВАННАЯ: 0.2 TON (сеть) + 0.1 TON (если xRocket).

### 👁️ VISION ПРАВИЛА
Ты видишь скриншоты. Если на них ошибка (красный текст, 400 Forbidden, Failed) — анализируй текст и говори: «Я вижу ошибку [название]. Передал разработчику @Paulie_Gualtiery».

ПРАВИЛА ОТВЕТА:
- Отвечать на языке пользователя.
- Направлять в @OctoRent_bot.
"""

# --- МЕНЕДЖЕР ПОЛЬЗОВАТЕЛЕЙ (Анти-DDoS и Лимиты) ---
class UserManager:
    def __init__(self):
        self.users = defaultdict(lambda: {
            "msg_count": 0,           # Всего за день
            "photo_count": 0,         # Фото за день
            "trash_streak": 0,        # Подряд "мусора"
            "last_reset": time.time(),
            "jail_until": 0           # Бан до...
        })

    def get_user(self, user_id):
        user = self.users[user_id]
        # Сброс лимитов раз в сутки
        if time.time() - user["last_reset"] > 86400:
            user["msg_count"] = 0
            user["photo_count"] = 0
            user["trash_streak"] = 0
            user["last_reset"] = time.time()
        return user

    def is_trash(self, text):
        # Эвристика на "мусор" (короткие сообщения, мат, спам)
        trash_words = ["а", "рвраовар", "иди нахуй", "даун", "лол", "фыв", "...", "ы"]
        t = text.lower().strip()
        if len(t) < 2 or t in trash_words:
            return True
        return False

user_manager = UserManager()

# --- БУФЕР СООБЩЕНИЙ (Режим Ждуна) ---
class MessageBuffer:
    def __init__(self):
        self.buffer = defaultdict(lambda: {"texts": [], "images": [], "timer": None})

    async def add(self, user_id, text, image_b64, callback):
        data = self.buffer[user_id]
        if text: data["texts"].append(text)
        if image_b64: data["images"].append(image_b64)

        if data["timer"]:
            data["timer"].cancel()
        
        data["timer"] = asyncio.create_task(self._wait_and_send(user_id, callback))

    async def _wait_and_send(self, user_id, callback):
        await asyncio.sleep(4.5)  # Ждем 4.5 секунды
        data = self.buffer.pop(user_id)
        combined_text = "\n".join(data["texts"])
        combined_image = data["images"][-1] if data["images"] else None
        await callback(user_id, combined_text, combined_image)

msg_buffer = MessageBuffer()
app = Client("octorent_userbot", api_id=API_ID, api_hash=API_HASH)

async def get_ai_response(user_text, image_b64=None):
    """Запрос к Groq (Fallback на Llama 3.1)"""
    vision_model = "meta-llama/llama-4-scout-17b-16e-instruct"
    text_model = "llama-3.1-8b-instant"
    try:
        model = vision_model if image_b64 else text_model
        content = [{"type": "text", "text": user_text}]
        if image_b64:
            content.append({"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{image_b64}"}})

        completion = groq_client.chat.completions.create(
            model=model, messages=[{"role": "system", "content": SYSTEM_INSTRUCTION}, {"role": "user", "content": content}],
            temperature=0.6, max_tokens=800
        )
        return completion.choices[0].message.content
    except Exception as e:
        logging.warning(f"⚠️ Ошибка {model}: {e}")
        if image_b64: # Fallback на текст
            try:
                completion = groq_client.chat.completions.create(
                    model=text_model, messages=[{"role": "system", "content": SYSTEM_INSTRUCTION}, {"role": "user", "content": user_text}],
                    temperature=0.6, max_tokens=800
                )
                return completion.choices[0].message.content + "\n\n(Не смог разобрать скриншот, ответил на текст)."
            except: pass
        return "Извини, я притормаживаю. Напиши в @OctoRent_Support."

async def final_callback(user_id, text, image_b64):
    """Финальная отправка ответа после группировки"""
    user = user_manager.get_user(user_id)
    
    # 1. Проверка мата/мусора
    if user_manager.is_trash(text):
        user["trash_streak"] += 1
        if user["trash_streak"] >= 5:
            user["jail_until"] = time.time() + 900 # 15 мин
            await app.send_message(user_id, "🚫 **Система защиты**: Ты отправляешь слишком много бессмысленных сообщений. Отдохни 15 минут, затем попробуй снова.")
            return
        await app.send_message(user_id, "⚠️ Пожалуйста, сформулируй свой вопрос понятнее.")
        return
    else:
        user["trash_streak"] = 0

    # 2. Проверка лимитов
    if user["msg_count"] >= 200:
        await app.send_message(user_id, "🛑 Дневной лимит (200 сообщ.) исчерпан. Обратись к @Paulie_Gualtiery.")
        return
    if image_b64 and user["photo_count"] >= 5:
        await app.send_message(user_id, "📸 Лимит на фото (5 шт.) исчерпан. Напиши текстом или обратись к @Paulie_Gualtiery.")
        return

    # 3. Пересылка багов
    bug_keywords = ["баг", "ошибка", "не работает", "problem", "error", "скрин", "глюк"]
    if any(w in text.lower() for w in bug_keywords) or (image_b64 and not text):
        try:
            await app.send_message("Paulie_Gualtiery", f"⚠️ **Репорт!** От ID:{user_id}\nТекст: {text}")
        except: pass

    # 4. Ответ ИИ
    user["msg_count"] += 1
    if image_b64: user["photo_count"] += 1
    
    prompt = text if text else "[Скриншот]"
    ai_reply = await get_ai_response(prompt, image_b64)
    await app.send_message(user_id, ai_reply)

@app.on_message(filters.private & ~filters.me)
async def handle_private_message(client: Client, message: Message):
    user_id = message.from_user.id
    user = user_manager.get_user(user_id)

    # Проверка карцера
    if time.time() < user["jail_until"]:
        return

    user_text = message.text or message.caption or ""
    image_b64 = None

    if message.photo:
        try:
            pb = await client.download_media(message, in_memory=True)
            if pb: image_b64 = base64.b64encode(pb.getbuffer()).decode('utf-8')
        except: pass

    # Добавляем в буфер (режим Ждуна)
    await msg_buffer.add(user_id, user_text, image_b64, final_callback)

if __name__ == "__main__":
    logging.info("🚀 Запуск OctoRent Support v5 (Анти-спам + Ждун + Глубокие знания)...")
    app.run()
