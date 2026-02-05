import asyncio
import os
import logging
import json
import aiohttp
from dotenv import load_dotenv

from aiogram import Bot, Dispatcher, F, types
from aiogram.filters import Command, CommandObject
from aiogram.types import CallbackQuery, Message, InlineQuery, InlineQueryResultArticle, InputTextMessageContent, InlineKeyboardMarkup, InlineKeyboardButton, WebAppInfo

import database as db
import keyboards as kb

# Конфигурация
load_dotenv()
BOT_TOKEN = os.getenv("BOT_TOKEN")
ADMIN_ID = int(os.getenv("ADMIN_ID", 0))
WEB_APP_URL = os.getenv("WEB_APP_URL")
OWNER_WALLET = os.getenv("OWNER_WALLET")
MARKETAPP_TOKEN = os.getenv("MARKETAPP_TOKEN")
MARKUP_PERCENT = 20

bot = Bot(token=BOT_TOKEN)
dp = Dispatcher()
logging.basicConfig(level=logging.INFO)

# --- LIVE API HELPERS ---

# Глобальная сессия для скорости
_session = None

async def get_session():
    global _session
    if _session is None or _session.closed:
        _session = aiohttp.ClientSession(connector=aiohttp.TCPConnector(ssl=False))
    return _session

async def fetch_live_data(endpoint, params=None):
    """Свежий запрос с защитой от банов"""
    headers = {"Authorization": MARKETAPP_TOKEN}
    session = await get_session()
    try:
        async with session.get(f"https://api.marketapp.ws/v1{endpoint}", headers=headers, params=params, timeout=12) as response:
            if response.status == 200:
                return await response.json()
            elif response.status == 429:
                logging.warning("⚠️ MarketApp Rate Limit! Нужно подождать.")
                return "rate_limit"
            return None
    except Exception as e:
        logging.error(f"Live API Connection Error: {e}")
        return None

async def get_nft_full_details(nft_address, col_name):
    """Докачка метаданных (картинка, атрибуты), если их еще нет в кэше"""
    details = await fetch_live_data(f"/nfts/{nft_address}/")
    if not details: return None
    
    # Редкость коллекции (берем один раз для всей модели)
    rarities = {}
    col_addr = details.get("collection_address")
    if col_addr:
        rarity_data = await fetch_live_data(f"/collections/{col_addr}/attributes/")
        if rarity_data:
            for trait in rarity_data:
                t_type = trait.get("trait_type")
                for v in trait.get("values", []):
                    rarities[f"{t_type}:{v.get('value')}"] = f"{v.get('perc')}%"

    attrs = {a['trait_type']: a['value'] for a in details.get("attributes", [])}
    attr_lines = []
    for t, v in attrs.items():
        perc = rarities.get(f"{t}:{v}", "")
        attr_lines.append(f"├ <b>{t}:</b> <code>{v}</code> {perc}")
    if attr_lines: attr_lines[-1] = attr_lines[-1].replace("├", "└")

    metadata = {
        "image": details.get("image_url") or details.get("preview_url"),
        "video": details.get("video_url") or details.get("animation_url"),
        "model": attrs.get("Model", col_name),
        "backdrop": attrs.get("Backdrop", "Unknown"),
        "symbol": attrs.get("Symbol", "Unknown"),
        "collection": col_name,
        "attributes_lines": "\n".join(attr_lines)
    }
    return details.get("name"), metadata

# --- Обработчики ---

@dp.message(Command("start"))
async def start_cmd(message: Message, command: CommandObject):
    args = command.args
    if args and args.startswith("nft_"):
        nft_addr = args.replace("nft_", "")
        item = await db.get_item_by_id_addr(nft_addr)
        if item:
            meta = json.loads(item['metadata'] or '{}')
            text = (
                f"🖼 <b>{item['title']}</b>\n\n"
                f"📊 <b>Details:</b>\n{meta.get('attributes_lines', '├ <b>Status:</b> <code>Live</code>')}\n\n"
                f"💰 <b>Per day:</b> <code>{item['price_per_day']} TON</code>\n\n"
                f"Нажмите кнопку ниже, чтобы открыть этот товар в маркете!"
            )
            webapp_url = f"{WEB_APP_URL}?nft_address={nft_addr}"
            kb_single = InlineKeyboardMarkup(inline_keyboard=[
                [InlineKeyboardButton(text="💎 Открыть в маркете", web_app=WebAppInfo(url=webapp_url))]
            ])
            await message.answer_photo(photo=meta.get('image') or "https://ton.org/download/ton_symbol.png", caption=text, reply_markup=kb_single, parse_mode="HTML")
            return

    await db.add_user(message.from_user.id)
    await message.answer(
        "💎 <b>LIVE NFT Rental Market</b>\n\nДанные подгружаются в реальном времени напрямую с маркетплейса.",
        reply_markup=kb.main_menu(message.from_user.id == ADMIN_ID),
        parse_mode="HTML"
    )

@dp.message(F.text == "🎁 Аренда NFT подарков")
async def open_market_direct(message: Message):
    keyboard = types.InlineKeyboardMarkup(inline_keyboard=[
        [types.InlineKeyboardButton(text="💎 Открыть маркет аренды", web_app=types.WebAppInfo(url=WEB_APP_URL))],
        [types.InlineKeyboardButton(text="🛒 Моя корзина (0)", callback_data="view_cart")]
    ])
    await message.answer(
        "🏷 <b>Маркет аренды NFT подарков</b>\n\nВыбирайте любые доступные подарки, фильтруйте по номеру или цене и арендуйте в один клик!",
        reply_markup=keyboard,
        parse_mode="HTML"
    )

@dp.message(F.text == "👤 Профиль")
async def show_profile(message: Message):
    await message.answer(f"👤 <b>Профиль</b>\n\nID: <code>{message.from_user.id}</code>\nСтатус: <code>Пользователь</code>", parse_mode="HTML")

@dp.message(F.text == "ℹ️ Информация")
async def show_info(message: Message):
    await message.answer("ℹ️ <b>О сервисе</b>\n\nМы предоставляем услуги аренды NFT подарков и номеров +888 на базе TON.", parse_mode="HTML")

@dp.message(F.text == "👨‍💻 Поддержка")
async def show_support(message: Message):
    await message.answer("👨‍💻 <b>Поддержка</b>\n\nПо всем вопросам пишите: @admin_support", parse_mode="HTML")

@dp.message(F.text == "📱 Аренда +888")
async def show_plus888(message: Message):
    await message.answer("📱 <b>Аренда номеров +888</b>\n\nДанный раздел находится в разработке.", parse_mode="HTML")

@dp.callback_query(F.data.startswith("model_"))
async def show_items_live(callback: CallbackQuery):
    model_name = callback.data.split("_", 1)[1]
    await callback.answer(f"Загружаю {model_name}...")

    # 1. Находим адрес коллекции (сначала смотрим в API)
    cols = await fetch_live_data("/collections/gifts/")
    col_addr = next((c['address'] for c in cols if c['name'] == model_name), None)
    
    if not col_addr:
        await callback.message.answer("Ошибка: модель не найдена.")
        return

    # 2. Вместо списка кнопок — даем ОДНУ кнопку Web App на всю коллекцию
    from urllib.parse import quote
    
    encoded_addr = quote(col_addr)
    encoded_name = quote(model_name)
    web_app_url = f"{WEB_APP_URL}?collection={encoded_addr}&name={encoded_name}"
    
    keyboard = types.InlineKeyboardMarkup(inline_keyboard=[
        [types.InlineKeyboardButton(text=f"📂 Открыть каталог {model_name}", web_app=types.WebAppInfo(url=web_app_url))],
        [types.InlineKeyboardButton(text="⬅️ Назад", callback_data="back_to_models")]
    ])

    await callback.message.edit_text(
        f"🎁 <b>Коллекция: {model_name}</b>\n\n"
        "Жми кнопку ниже, чтобы открыть красивый каталог с картинками и фильтрами! 👇",
        reply_markup=keyboard,
        parse_mode="HTML"
    )

@dp.callback_query(F.data.startswith("view_"))
async def view_item_live(callback: CallbackQuery):
    data = callback.data.split("_")
    item_id = data[1]
    
    # Если это живой лот, которого нет в базе - докачиваем детали ПРЯМО СЕЙЧАС
    if item_id == "live":
        nft_addr = data[2]
        await callback.answer("Генерирую карточку лота...")
        result = await get_nft_full_details(nft_addr, "Gift") 
        if not result:
            await callback.message.answer("⚠️ Не удалось загрузить детали. Попробуйте еще раз.")
            return
        title, meta = result
        # Сохраняем в кэш чтобы в след. раз было мгновенно
        await db.sync_item(nft_addr, "gift", title, 0, 0, "", json.dumps(meta))
        item = await db.get_item_by_id_addr(nft_addr) # Добавим такой метод
    else:
        item = await db.get_item_by_id(int(item_id))

    if not item: return

    meta = json.loads(item['metadata'] or '{}')
    
    # Цену берем свежую (можно еще раз дернуть API для гарантии, но пока берем из кэша)
    text = (
        f"🖼 <b>{item['title']}</b>\n\n"
        f"📊 <b>Details:</b>\n{meta.get('attributes_lines', '├ <b>Status:</b> <code>Live</code>')}\n\n"
        f"⏳ <b>Days:</b> <code>1 — 30</code>\n"
        f"💰 <b>Per day:</b> <code>{item['price_per_day']} TON</code>\n\n"
        f"✅ <b>БЕЗ ЗАЛОГА</b>"
    )

    image_url = meta.get('image')
    video_url = meta.get('video')

    await callback.message.delete()
    if video_url:
        try:
            await callback.message.answer_video(video=video_url, caption=text, reply_markup=kb.item_action_keyboard(item, WEB_APP_URL, OWNER_WALLET), parse_mode="HTML")
            return
        except: pass
    
    await callback.message.answer_photo(photo=image_url or "https://ton.org/download/ton_symbol.png", caption=text, reply_markup=kb.item_action_keyboard(item, WEB_APP_URL, OWNER_WALLET), parse_mode="HTML")

@dp.inline_query()
async def inline_handler(query: InlineQuery):
    try:
        text = query.query.strip()
        print(f"DEBUG: Inline query received: '{text}'")
        
        items = await db.search_items_inline(text, limit=30)
        print(f"DEBUG: Found {len(items)} items for query '{text}'")
        
        results = []
        for item in items:
            meta = json.loads(item['metadata'] or '{}')
            img = meta.get('image') or "https://ton.org/download/ton_symbol.png"
            
            status_text = "Доступно" if item['status'] == 'available' else "Арендовано"
            desc = f"Цена: {item['price_per_day']} TON/день | {status_text}"
            
            # WebApp deep link
            webapp_url = f"{WEB_APP_URL}?nft_address={item['nft_address']}"
            
            msg_text = (
                f"🖼 <b>{item['title']}</b>\n"
                f"💰 Цена: <code>{item['price_per_day']} TON/день</code>\n"
                f"📦 Статус: <b>{status_text}</b>"
            )
            
            results.append(InlineQueryResultArticle(
                id=f"nft_{item['nft_address']}",
                title=item['title'],
                description=desc,
                thumbnail_url=img,
                input_message_content=InputTextMessageContent(message_text=msg_text, parse_mode="HTML"),
                reply_markup=InlineKeyboardMarkup(inline_keyboard=[
                    [InlineKeyboardButton(text="💎 Перейти к аренде", url=f"https://t.me/OctoRent_bot/rent?startapp=nft_{item['nft_address']}")]
                ])
            ))
        
        print(f"DEBUG: Sending {len(results)} results")
        await query.answer(results, cache_time=1, is_personal=False)
    except Exception as e:
        print(f"ERROR in inline_handler: {e}")
        import traceback
        traceback.print_exc()

async def main():
    await db.init_db()
    print("LIVE-BOT ЗАПУЩЕН! Реальное время активно.")
    await dp.start_polling(bot)

if __name__ == "__main__":
    asyncio.run(main())
