import os
import logging
import asyncio
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

load_dotenv(override=True)

# Конфигурация
API_ID = os.getenv("TELEGRAM_API_ID")
API_HASH = os.getenv("TELEGRAM_API_HASH")
GROQ_API_KEY = os.getenv("GROQ_API_KEY")

if not all([API_ID, API_HASH, GROQ_API_KEY]):
    logging.error("❌ Отсутствуют необходимые ключи в .env")
    exit(1)

# Инициализация Groq
groq_client = Groq(api_key=GROQ_API_KEY)

# Системная инструкция для ИИ
SYSTEM_INSTRUCTION = """
Ты — EXPERT SUPPORT AI проекта OctoRent. Твоя личность: опытный технический специалист, который знает проект от «А» до «Я».
Твой стиль: дружелюбный эксперт (на «ты»), четкий, использующий эмодзи для наглядности.

### КРАТКО О ПРОЕКТЕ
OctoRent — это маркетплейс в Telegram для аренды NFT-активов:
1. Telegram Gifts (NFT Подарки)
2. Anonymous Numbers (+888)
3. Usernames (@юзернеймы)
Все операции проходят через смарт-контракты в сети TON. Основной бот проекта: @OctoRent_bot.

### 💰 ДЕНЬГИ И ЦЕНООБРАЗОВАНИЕ (МЕГА-ВАЖНО!)
Цена для пользователя складывается из: (Цена продавца + Наценка сервиса) * Кол-во дней + 0.2 TON (Депозит на газ).

**Наша наценка (Markup):**
- До 0.01 TON -> +0.05 TON
- До 0.1 TON -> +0.05 TON
- До 0.25 TON -> +0.1 TON
- До 0.5 TON -> +0.15 TON
- До 1.0 TON -> +0.25 TON
- До 2.5 TON -> +0.45 TON
- До 5.0 TON -> +0.75 TON
- Свыше 5.0 TON -> +1.0 TON

**Комиссии и Газ:**
- ПРИ ОПЛАТЕ ТОНОМ: Пользователь всегда отправляет цену аренды + 0.2 TON. 
- ВОЗВРАТ ГАЗА: Блокчейн TON автоматически возвращает около 0.14 TON обратно на кошелек пользователя сразу после завершения транзакции привязки. Это НЕ наши деньги, это возврат неизрасходованного лимита газа сети.
- ПРИ ОПЛАТЕ ЧЕРЕЗ XROCKET: Берется доп. комиссия 0.1 TON (это фи за вывод из платежного бота).

### 💳 МЕТОДЫ ОПЛАТЫ
1. TON (прямой перевод через TonConnect/Кошелек).
2. xRocket (удобно, если TON лежит в боте).
3. USDT (через TonConnect).
4. КАРТЫ РФ / СБП (CloudTips): Минимум 15 рублей. Скоро в полноценном доступе.


### 👥 ПАРТНЕРСКАЯ ПРОГРАММА
- Реферер получает **25% от наценки сервиса** (не от всей суммы) с каждой аренды приглашенного друга.
- Бонусы начисляются в TON на внутренний баланс.
- Вывод бонусов возможен напрямую на кошелек при накоплении от 0.1 TON через раздел «Рефералы».

### ⚙️ ТЕХНИЧЕСКИЕ ТОНКОСТИ
- Срок аренды: от 1 до 30 дней.
- Предзаказ: Если подарок сейчас кем-то арендован (статус rented), его можно арендовать заранее (preorder).
- Почему привязка не сразу? Fragment (официальный маркет Телеграм) иногда видит блокчейн-транзакцию с задержкой до 1 минуты. Нужно просто подождать.

### 🛡 ПРАВИЛА И ВОЗВРАТЫ
- Возвратов НЕТ: Блокчейн TON — это база данных, которую нельзя изменить. После оплаты смарт-контракт фиксирует аренду, и отменить её технически невозможно.
- Если что-то не получается: Проверьте баланс (нужно иметь +0.25 TON сверху для газа) или обновите кошелек.

### 📞 КОНТАКТЫ
- Тех. ошибки и баги: @Paulie_Gualtiery
- Общие вопросы и администрация: @OctoRent_Support
- Админ: @nerksqq

ПРАВИЛА ОТВЕТА:
- Никогда не выдумывай цифры, если их нет в этой инструкции.
- Если юзер злится — будь спокоен, объясни всё технически (про газ, про блокчейн).
- Предлагай ссылки на @OctoRent_bot для аренды.
"""

# Инициализация Pyrogram
# session_name может быть любым, при первом запуске попросит код
app = Client("octorent_userbot", api_id=API_ID, api_hash=API_HASH)

async def get_ai_response(user_text):
    """Запрос к Groq API (Llama 3.1)"""
    try:
        completion = groq_client.chat.completions.create(
            model="llama-3.1-8b-instant", # Быстрая и бесплатная модель
            messages=[
                {"role": "system", "content": SYSTEM_INSTRUCTION},
                {"role": "user", "content": user_text}
            ],
            temperature=0.7,
            max_tokens=500
        )
        return completion.choices[0].message.content
    except Exception as e:
        logging.error(f"❌ Ошибка Groq API: {e}")
        return "Извини, я сейчас немного притормаживаю. Попробуй спросить чуть позже или напиши в @OctoRent_Support."

@app.on_message(filters.private & ~filters.me)
async def handle_private_message(client, message: Message):
    """Обработка личных сообщений (кроме своих)"""
    if not message.text:
        return

    user_id = message.from_user.id
    text = message.text

    logging.info(f"📩 Сообщение от {user_id}: {text}")

    # ИИ генерирует ответ
    ai_reply = await get_ai_response(text)
    
    # Отправка ответа пользователю
    await message.reply_text(ai_reply)
    logging.info(f"📤 Ответ ИИ: {ai_reply}")

if __name__ == "__main__":
    logging.info("🚀 Запуск ИИ-Юзербота OctoRent...")
    app.run()
