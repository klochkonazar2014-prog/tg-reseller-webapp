import os
import logging
import asyncio
import base64
import io
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

# СИСТЕМНАЯ ИНСТРУКЦИЯ (Очищенная и объединенная)
SYSTEM_INSTRUCTION = """
Ты — EXPERT SUPPORT AI проекта OctoRent. Технический гений, который знает все тонкости.
Твой стиль: на «ты», дружелюбный, но строгий в вопросах конфиденциальности. Используй эмодзи.

### 🔴 СТРОГИЕ ЗАПРЕТЫ
1. НИКОГДА не используй слово «НАЦЕНКА». Используй только «Комиссия сервиса».
2. Если спрашивают про размер комиссии — отвечай: «Комиссия фиксированная: 0.2 TON за активацию смарт-контракта в сети TON и дополнительные 0.1 TON при оплате через @xrocket».
3. Не показывай внутреннюю таблицу наценок (Markup).

### 💰 ДЕНЬГИ И СМАРТ-КОНТРАКТЫ
- АКТИВАЦИЯ (0.2 TON): Это депозит для сети TON на активацию смарт-контракта.
- ЧТО ВЕРНЕТСЯ?: Около 0.14 TON вернется тебе на кошелек СРАЗУ после ОКОНЧАНИЯ АРЕНДЫ. Это возврат за неиспользованный TON.
- XROCKET: Доп. комиссия 0.1 TON (фи самого бота).


### 👥 ПАРТНЕРКА
- Реферал приносит тебе **25% от комиссии сервиса**. Вывод от 0.1 TON.

### ⚙️ ТЕХНИЧЕСКИЕ ТАЙНЫ
- Срок аренды: от 1 до 180 дней.
- Fragment: Может не видеть транзакцию до 1-2 минут. Нужно просто подождать.
- Безопасность: Мы не храним сид-фразы. Работа через официальные кошельки (Tonkeeper и др.).

### 👁️ КОМПЬЮТЕРНОЕ ЗРЕНИЕ (VISION)
Ты видишь скриншоты и фото, которые присылает пользователь. Анализируй их внимательно (ошибки, баланс, статусы) и помогай.
Если видишь баг или явную ошибку:
Отвечай: «Я вижу проблему на скриншоте. Передал описание нашему разработчику @Paulie_Gualtiery. Он всё проверит и свяжется с тобой».

ПРАВИЛА ОТВЕТА:
- Отвечать на том языке на котором задан вопрос .
- Направляй в @OctoRent_bot для аренды.
"""

# Инициализация Pyrogram
app = Client("octorent_userbot", api_id=API_ID, api_hash=API_HASH)

async def get_ai_response(user_text, image_b64=None):
    """Мультимодальный запрос к Groq (Llama 3.2 Vision)"""
    # Если есть фото — используем Vision модель, если нет — быструю текстовую
    # Используем 90b версию, так как 11b была выведена из эксплуатации (decommissioned)
    vision_model = "llama-3.2-90b-vision-preview" 
    text_model = "llama-3.1-8b-instant"
    
    try:
        model = vision_model if image_b64 else text_model
        
        content = [{"type": "text", "text": user_text}]
        if image_b64:
            content.append({
                "type": "image_url",
                "image_url": {"url": f"data:image/jpeg;base64,{image_b64}"}
            })

        completion = groq_client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": SYSTEM_INSTRUCTION},
                {"role": "user", "content": content}
            ],
            temperature=0.6,
            max_tokens=600
        )
        return completion.choices[0].message.content
    except Exception as e:
        logging.warning(f"⚠️ Ошибка с моделью {model}, пробую откат на текст: {e}")
        # Если Vision упал (например, из-за лимитов или модели), пробуем ответить текстом
        if image_b64:
             try:
                 completion = groq_client.chat.completions.create(
                    model=text_model,
                    messages=[
                        {"role": "system", "content": SYSTEM_INSTRUCTION},
                        {"role": "user", "content": user_text}
                    ],
                    temperature=0.6,
                    max_tokens=600
                )
                 return completion.choices[0].message.content + "\n\n(P.S. Я не смог проанализировать скриншот из-за тех. проблем, ответил только на текст)."
             except Exception as e_inner:
                 logging.error(f"❌ Ошибка даже при откате: {e_inner}")
        
        return "Извини, я тут немного притормаживаю. Напиши, пожалуйста, в @OctoRent_Support, там помогут быстрее."

@app.on_message(filters.private & ~filters.me)
async def handle_private_message(client: Client, message: Message):
    """Обработка ЛС с поддержкой фото"""
    user_text = message.text or message.caption or ""
    image_b64 = None

    if message.photo:
        try:
            logging.info("📸 Загрузка фото для анализа...")
            photo_buffer = await client.download_media(message, in_memory=True)
            if photo_buffer:
                image_b64 = base64.b64encode(photo_buffer.getbuffer()).decode('utf-8')
        except Exception as e:
            logging.error(f"❌ Ошибка загрузки фото: {e}")

    if not user_text and not image_b64:
        return

    user_name = message.from_user.username or message.from_user.full_name
    logging.info(f"📩 От @{user_name}: {user_text} [Vision: {bool(image_b64)}]")

    # Пересылка багов разработчику
    bug_keywords = ["баг", "ошибка", "не работает", "проблема", "выдаёт", "error", "bug", "скрин", "глюк"]
    is_bug = any(word in user_text.lower() for word in bug_keywords) or (image_b64 and not user_text)
    
    if is_bug:
        try:
            await message.forward("Paulie_Gualtiery")
            await client.send_message("Paulie_Gualtiery", f"⚠️ **Репорт!** От @{user_name}\nТекст: {user_text}")
        except Exception as e:
            logging.error(f"❌ Ошибка пересылки: {e}")

    # Ответ ИИ
    prompt = user_text if user_text else "[Пользователь прислал скриншот]"
    ai_reply = await get_ai_response(prompt, image_b64)
    
    await message.reply_text(ai_reply)
    logging.info(f"📤 Ответ ИИ: {ai_reply}")

if __name__ == "__main__":
    logging.info("🚀 Запуск ИИ-Юзербота OctoRent (Vision Mode)...")
    app.run()
