import asyncio
import time
import os
import logging
import json
import aiohttp
from dotenv import load_dotenv

from aiogram import Bot, Dispatcher, F, types
from aiogram.filters import Command, CommandObject
from aiogram.types import (
    CallbackQuery, Message, InlineQuery, 
    InlineQueryResultArticle, InlineQueryResultPhoto, InlineQueryResultMpeg4Gif,
    InputTextMessageContent, InlineKeyboardMarkup, InlineKeyboardButton, WebAppInfo,
    MenuButtonWebApp, ReplyKeyboardRemove
)

import database as db
import keyboards as kb

import sys
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except:
        pass

# Конфигурация
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler("bot_debug.log", encoding='utf-8'),
        logging.StreamHandler(sys.stdout)
    ]
)
logging.info("Bot starting...")

load_dotenv(override=True)
BOT_TOKEN = os.getenv("BOT_TOKEN")
ADMIN_ID = int(os.getenv("ADMIN_ID", 0))
WEB_APP_URL = os.getenv("WEB_APP_URL") or os.getenv("BACKEND_URL")
OWNER_WALLET = os.getenv("OWNER_WALLET")
MARKETAPP_TOKEN = os.getenv("MARKETAPP_TOKEN")
MARKUP_PERCENT = 20
SUPPORT_GROUP_URL = os.getenv("SUPPORT_GROUP_URL", "https://t.me/your_support_group")

bot = Bot(token=BOT_TOKEN)
dp = Dispatcher()

# Операторы (Telegram IDs)
OPERATOR_IDS = {
    "admin": 7868560541,
    "coder": 5644074141,
    "support": None # Будет добавлено позже
}

async def get_dynamic_username(op_key, default_fallback):
    """Получает актуальный юзернейм по ID из кэша или напрямую из Telegram"""
    user_id = OPERATOR_IDS.get(op_key)
    if not user_id:
        return default_fallback
    
    cache_key = f"username_{user_id}"
    cached = await db.get_cache(cache_key)
    if cached:
        return cached
    
    try:
        chat = await bot.get_chat(user_id)
        uname = f"@{chat.username}" if chat.username else chat.full_name
        await db.set_cache(cache_key, uname)
        return uname
    except Exception as e:
        logging.error(f"Error resolving username for {user_id}: {e}")
        return default_fallback

async def refresh_operator_usernames():
    """Фоновое обновление юзернеймов раз в час"""
    while True:
        for key in OPERATOR_IDS:
            if OPERATOR_IDS[key]:
                try:
                    chat = await bot.get_chat(OPERATOR_IDS[key])
                    uname = f"@{chat.username}" if chat.username else chat.full_name
                    await db.set_cache(f"username_{OPERATOR_IDS[key]}", uname)
                except:
                    pass
        await asyncio.sleep(3600)

# --- LIVE API HELPERS ---

# Глобальная сессия для скорости
_session = None

async def get_session():
    global _session
    if _session is None or _session.closed:
        _session = aiohttp.ClientSession(connector=aiohttp.TCPConnector(ssl=False))
    return _session

async def fetch_live_data(endpoint, params=None):
    """Свежий запрос с защитой от банов и повторами при 503"""
    headers = {"Authorization": MARKETAPP_TOKEN}
    session = await get_session()
    
    retries = 3
    delay = 1
    
    for attempt in range(retries):
        try:
            async with session.get(f"https://api.marketapp.ws/v1{endpoint}", headers=headers, params=params, timeout=12) as response:
                if response.status == 200:
                    return await response.json()
                elif response.status == 429:
                    logging.warning("⚠️ MarketApp Rate Limit! Нужно подождать.")
                    return "rate_limit"
                elif response.status == 503:
                    logging.warning(f"⚠️ MarketApp 503 (Attempt {attempt+1}/{retries}). Retrying in {delay}s...")
                    await asyncio.sleep(delay)
                    delay *= 2
                    continue
                return None
        except Exception as e:
            logging.error(f"Live API Connection Error: {e}")
            if attempt < retries - 1:
                await asyncio.sleep(delay)
                delay *= 2
                continue
            return None
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
    user_id = message.from_user.id
    username = message.from_user.username
    full_name = message.from_user.full_name
    
    # Save user info
    await db.add_user(user_id, username, full_name)
    
    args = command.args
    
    # 🔗 DEEP LINK LOGIC (ref_ or nft_)
    if args:
        # 🔗 CLEAN LOGIC: Determine if it's a referral or an NFT link
        referrer_id_str = None
        nft_addr = None
        
        if args == "history":
            await show_history_internal(message, user_id)
            return

        if args.startswith("ref_"):
            parts = args.split("_")
            if len(parts) >= 2:
                referrer_id_str = parts[1]
        elif args.startswith("nft_"):
            nft_addr = args.replace("nft_", "")
            # Check if it's a combined link (legacy support from my previous edit just in case)
            if "_ref_" in nft_addr:
                nft_addr, ref_part = nft_addr.split("_ref_")
                referrer_id_str = ref_part
            elif "_nft_" in args: # Support for ref_ID_nft_ADDR
                parts = args.split("_")
                referrer_id_str = parts[1]
                nft_addr = parts[3]

        # 1. Process Referral
        if referrer_id_str:
            try:
                referrer_id = int(referrer_id_str)
                if referrer_id != user_id:
                    success = await db.create_referral(referrer_id, user_id)
                    if success:
                        await message.answer("🎉 <b>Вы присоединились по приглашению!</b>", parse_mode="HTML")
                        try:
                            await bot.send_message(
                                referrer_id,
                                f"🎁 <b>Новый реферал!</b>\n{message.from_user.full_name} заглянул в OctoRent.",
                                parse_mode="HTML"
                            )
                        except: pass
            except Exception as e:
                logging.error(f"Referral processing error: {e}")

        # 2. Process NFT (if present)
        if nft_addr:
            found_row = await db.get_item_by_id_addr(nft_addr)
            if not found_row and nft_addr.isdigit():
                found_row = await db.get_item_by_id(int(nft_addr))
            
            if found_row:
                # 🚀 NUCLEAR SAFETY: Force conversion to dict
                item_data = dict(found_row)
                item_meta = {}
                
                try:
                    meta_raw = item_data.get('metadata')
                    if meta_raw:
                        if isinstance(meta_raw, str):
                            item_meta = json.loads(meta_raw)
                        elif isinstance(meta_raw, dict):
                            item_meta = meta_raw
                except Exception as e:
                    logging.warning(f"Metadata parsing failed: {e}")
                
                # Safe access for all fields
                img_url = item_meta.get('image')
                title_str = item_data.get('title') or item_data.get('nft_name') or "NFT"
                
                # Image fallback logic
                if not img_url or any(x in str(img_url) for x in ["ton_symbol.png", "gift.svg"]):
                    if str(title_str).startswith('@'):
                        img_url = f"https://nft.fragment.com/username/{str(title_str).lstrip('@')}.webp"
                    elif str(title_str).startswith('+'):
                        import re as _re
                        clean_n = _re.sub(r'[^0-9]', '', str(title_str))
                        img_url = f"https://nft.fragment.com/number/{clean_n}.webp"
                    elif " #" in str(title_str):
                        try:
                            import re as _re
                            n_part = str(title_str).split(" #")[0]
                            num_p = str(title_str).split(" #")[1]
                            c_slug = _re.sub(r'[^a-zA-Z0-9]', '-', n_part).strip('-').lower()
                            c_slug = _re.sub(r'-+', '-', c_slug)
                            img_url = f"https://nft.fragment.com/gift/{c_slug}-{num_p}.webp"
                        except: img_url = "https://ton.org/download/ton_symbol.png"
                    else: img_url = "https://ton.org/download/ton_symbol.png"

                attr_txt = item_meta.get('attributes_lines', '├ <b>Статус:</b> <code>Активен</code>')
                price_val = item_data.get('price_per_day', 0)
                
                caption_text = (
                    f"🖼 <b>{title_str}</b>\n\n"
                    f"📊 <b>Детали:</b>\n{attr_txt}\n\n"
                    f"💰 <b>Цена:</b> <code>{price_val} TON/день</code>\n\n"
                    f"Нажми кнопку ниже, чтобы арендовать этот предмет!"
                )
                
                status_str = item_data.get('status', 'available')
                button_label = "💎 Предзаказ" if status_str == 'rented' else "💎 Арендовать"
                
                import urllib.parse
                nft_addr_val = item_data.get('nft_address')
                encoded_addr = urllib.parse.quote(str(nft_addr_val))
                
                # Robust URL joining
                base_url = WEB_APP_URL
                sep = "&" if "?" in base_url else "?"
                wapp_url = f"{base_url}{sep}nft_address={encoded_addr}"
                
                kb_obj = InlineKeyboardMarkup(inline_keyboard=[[InlineKeyboardButton(text=button_label, web_app=WebAppInfo(url=wapp_url))]])
                
                try: 
                    await message.answer_photo(photo=img_url, caption=caption_text, reply_markup=kb_obj, parse_mode="HTML")
                except: 
                    await message.answer(text=caption_text, reply_markup=kb_obj, parse_mode="HTML")
                return
            else:
                await message.answer("❌ <b>Товар не найден.</b>", parse_mode="HTML")
                return

    is_new = not await db.user_exists(user_id)
    await db.add_user(user_id, username, full_name)
    
    if is_new:
        await message.answer(
            "<tg-emoji emoji-id='5447410659077661506'>❓</tg-emoji> Выберете язык / Pick up language",
            reply_markup=kb.lang_selection_keyboard(),
            parse_mode="HTML"
        )

    if not is_new:
        lang = await db.get_user_language(user_id)
        msg_text = "🐙 <b>Добро пожаловать в OctoRent</b>\n\nЛучший сервис для аренды NFT в Telegram. Нажмите синюю кнопку, чтобы открыть маркет аренды."
        if lang == 'en':
            msg_text = "🐙 <b>Welcome to OctoRent</b>\n\nThe best NFT rental service in Telegram. Press the blue button to open the rental market."
            
        await message.answer(
            msg_text,
            reply_markup=kb.main_menu(WEB_APP_URL, message.from_user.id == ADMIN_ID, lang=lang),
            parse_mode="HTML"
        )


@dp.callback_query(F.data.startswith("set_lang_"))
async def set_lang_callback(callback: CallbackQuery):
    lang = callback.data.split("_")[-1]
    await db.set_user_language(callback.from_user.id, lang)
    
    msg_text = "💎 <b>LIVE NFT Rental Market</b>\n\nДанные подгружаются в реальном времени напрямую с маркетплейса."
    if lang == 'en':
        msg_text = "💎 <b>LIVE NFT Rental Market</b>\n\nData is loaded in real-time directly from the marketplace."
    
    await callback.message.edit_text(
        msg_text,
        reply_markup=kb.main_menu(WEB_APP_URL, callback.from_user.id == ADMIN_ID, lang=lang),
        parse_mode="HTML"
    )
    await callback.answer("Русский язык выбран" if lang == 'ru' else "English language selected")

@dp.callback_query(F.data == "main_menu")
async def back_to_main_menu(callback: CallbackQuery):
    lang = await db.get_user_language(callback.from_user.id)
    msg_text = "💎 <b>LIVE NFT Rental Market</b>\n\nДанные подгружаются в реальном времени напрямую с маркетплейса."
    if lang == 'en':
        msg_text = "💎 <b>LIVE NFT Rental Market</b>\n\nData is loaded in real-time directly from the marketplace."

    await callback.message.edit_text(
        msg_text,
        reply_markup=kb.main_menu(WEB_APP_URL, callback.from_user.id == ADMIN_ID, lang=lang),
        parse_mode="HTML"
    )

@dp.callback_query(F.data == "rent_gifts")
async def info_rent_gifts(callback: CallbackQuery):
    # Раздел Маркета с синей кнопкой входа
    keyboard = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="🛍 Открыть каталог", web_app=WebAppInfo(url=WEB_APP_URL), style="primary")],
        [InlineKeyboardButton(text="🛒 Моя корзина", callback_data="view_cart")],
        [InlineKeyboardButton(text="Назад", callback_data="main_menu", icon_custom_emoji_id="5359511310096672647")]
    ])
    await callback.message.edit_text(
        "🏷 <b>Маркет аренды NFT</b>\n\nЗдесь вы можете арендовать подарки, анонимные номера и другие NFT в один клик. Все лоты подгружаются в реальном времени.",
        reply_markup=keyboard,
        parse_mode="HTML"
    )

@dp.callback_query(F.data == "rent_numbers")
async def info_rent_numbers(callback: CallbackQuery):
    await callback.message.edit_text(
        "📱 <b>Аренда номеров +888</b>\n\nДанный раздел находится в разработке.",
        reply_markup=kb.info_keyboard(),
        parse_mode="HTML"
    )

@dp.callback_query(F.data == "profile")
async def profile_details(callback: CallbackQuery):
    user_id = callback.from_user.id
    username = callback.from_user.username or callback.from_user.full_name
    
    # Компактный профиль без баланса с новыми ID
    lang = await db.get_user_language(user_id)
    
    if lang == 'ru':
        text = (
            f"<tg-emoji emoji-id='5116582462276764538'>👤</tg-emoji> <b>Ваш профиль:</b>\n\n"
            f"<tg-emoji emoji-id='5460795800101594035'>📝</tg-emoji> <b>Имя:</b> {username}\n"
            f"<tg-emoji emoji-id='5447644880824181073'>🆔</tg-emoji> <b>ID:</b> <code>{user_id}</code>\n\n"
            "✨ <i>Используйте маркет для аренды NFT и номеров.</i>"
        )
    else:
        text = (
            f"<tg-emoji emoji-id='5116582462276764538'>👤</tg-emoji> <b>Your Profile:</b>\n\n"
            f"<tg-emoji emoji-id='5460795800101594035'>📝</tg-emoji> <b>Name:</b> {username}\n"
            f"<tg-emoji emoji-id='5447644880824181073'>🆔</tg-emoji> <b>ID:</b> <code>{user_id}</code>\n\n"
            "✨ <i>Use the market to rent NFTs and numbers.</i>"
        )
    
    await callback.message.edit_text(
        text,
        reply_markup=kb.profile_keyboard(lang=lang),
        parse_mode="HTML"
    )

@dp.callback_query(F.data == "history")
async def show_history(callback: CallbackQuery):
    await show_history_internal(callback.message, callback.from_user.id, is_callback=True)
    await callback.answer()

async def show_history_internal(message, user_id, is_callback=False):
    orders = await db.get_user_orders(user_id)
    
    if not orders:
        if is_callback:
            await bot.send_message(user_id, "📜 У вас пока нет истории аренды.")
        else:
            await message.answer("📜 У вас пока нет истории аренды.")
        return
        
    text = "📜 <b>Ваша история аренды</b>"
    
    if is_callback:
        await message.edit_text(
            text,
            reply_markup=kb.history_keyboard(orders, WEB_APP_URL, page=0),
            parse_mode="HTML"
        )
    else:
        await message.answer(
            text,
            reply_markup=kb.history_keyboard(orders, WEB_APP_URL, page=0),
            parse_mode="HTML"
        )

@dp.callback_query(F.data.startswith("history_page_"))
async def history_page(callback: CallbackQuery):
    try:
        page = int(callback.data.split("_")[-1])
    except (ValueError, IndexError):
        await callback.answer()
        return
    
    user_id = callback.from_user.id
    orders = await db.get_user_orders(user_id)
    
    if not orders:
        await callback.answer("Нет заказов", show_alert=True)
        return
    
    page = min(max(0, page), len(orders) - 1)
    text = "📜 <b>Ваша история аренды</b>"
    
    await callback.message.edit_reply_markup(
        reply_markup=kb.history_keyboard(orders, WEB_APP_URL, page=page)
    )
    await callback.answer()


@dp.callback_query(F.data.startswith("noop_"))
async def noop_handler(callback: CallbackQuery):
    # Просто гасим уведомление для информационных кнопок
    await callback.answer()

@dp.callback_query(F.data == "support")
async def support_details(callback: CallbackQuery):
    # Динамически получаем юзернеймы
    coder_uname = await get_dynamic_username("coder", "@Paulie_Gualtiery")
    support_uname = await get_dynamic_username("support", "@OctoRent_Support")
    
    text = (
        "<tg-emoji emoji-id='5362079447136610876'>👨‍💻</tg-emoji> <b>Поддержка OctoRent:</b>\n\n"
        f"<tg-emoji emoji-id='5390928897082663005'>⚙️</tg-emoji> Ошибки: {coder_uname} | <tg-emoji emoji-id='5472239203590888751'>💎</tg-emoji> Другое: {support_uname}\n\n"
        "<i>Мы постараемся ответить вам как можно скорее!</i>"
    )
    await callback.message.edit_text(
        text,
        reply_markup=kb.support_keyboard(
            coder_uname=coder_uname, 
            support_uname=support_uname,
            group_url=SUPPORT_GROUP_URL
        ),
        parse_mode="HTML"
    )

@dp.callback_query(F.data == "referrals")
async def referrals_menu(callback: CallbackQuery):
    """Реферальное меню с статистикой и ссылкой"""
    user_id = callback.from_user.id
    
    # Получаем статистику
    stats = await db.get_referral_stats(user_id)
    
    # Генерируем реферальную ссылку
    bot_info = await bot.get_me()
    ref_link = f"https://t.me/{bot_info.username}?start=ref_{user_id}"
    
    # Форматируем последние начисления
    earnings_text = ""
    if stats['recent_earnings']:
        earnings_text = "\n\n<b>📊 Последние начисления:</b>\n"
        for earning in stats['recent_earnings'][:5]:  # Показываем только 5 последних
            earnings_text += f"├ <code>{earning['amount']} TON</code> (заказ #{earning['order_id']})\n"
        if earnings_text:
            earnings_text = earnings_text.replace("├", "└", earnings_text.count("├") - 1)
    
    text = (
        "<tg-emoji emoji-id='5472239203590888751'>🎁</tg-emoji> <b>Реферальная программа</b>\n\n"
        f"<b>👥 Ваши рефералы:</b> <code>{stats['referrals_count']}</code>\n"
        f"<b>💰 Доступно:</b> <code>{stats['balance']:.4f} TON</code>\n"
        f"<b>📈 Всего заработано:</b> <code>{stats['total_earned']:.4f} TON</code>\n"
        f"<b>💸 Выведено:</b> <code>{stats['total_withdrawn']:.4f} TON</code>\n"
        f"{earnings_text}\n\n"
        f"<b>🔗 Ваша реферальная ссылка:</b>\n"
        f"<code>{ref_link}</code>\n\n"
        f"<i>Приглашайте друзей и получайте 25% от наценки с каждой их покупки!</i>"
    )
    
    keyboard = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="📋 Скопировать ссылку", url=ref_link)],
        [InlineKeyboardButton(text="📤 Поделиться", url=f"https://t.me/share/url?url={ref_link}&text=Присоединяйся к OctoRent!")],
        [InlineKeyboardButton(text="💰 Вывести средства", callback_data="withdraw_referral")] if stats['balance'] >= 0.1 else [],
        [InlineKeyboardButton(
            text="Назад", 
            callback_data="profile",
            icon_custom_emoji_id="5359511310096672647"
        )]
    ])
    
    await callback.message.edit_text(
        text,
        reply_markup=keyboard,
        parse_mode="HTML"
    )

@dp.callback_query(F.data == "withdraw_referral")
async def withdraw_referral_handler(callback: CallbackQuery):
    """Обработчик вывода реферальных средств"""
    user_id = callback.from_user.id
    stats = await db.get_referral_stats(user_id)
    
    if stats['balance'] < 0.1:
        await callback.answer("❌ Минимальная сумма для вывода: 0.1 TON", show_alert=True)
        return
    
    text = (
        "<tg-emoji emoji-id='5296355151743838259'>💰</tg-emoji> <b>Вывод средств</b>\n\n"
        f"<b>Доступно для вывода:</b> <code>{stats['balance']:.4f} TON</code>\n\n"
        "Для вывода средств откройте Mini App и подключите кошелек TON Connect.\n"
        "Вывод будет доступен в разделе 'Рефералы' → 'Вывести средства'.\n\n"
        "<i>Минимальная сумма вывода: 0.1 TON</i>"
    )
    
    keyboard = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="🛍 Открыть Mini App", web_app=WebAppInfo(url=WEB_APP_URL))],
        [InlineKeyboardButton(
            text="Назад", 
            callback_data="referrals",
            icon_custom_emoji_id="5359511310096672647"
        )]
    ])
    
    await callback.message.edit_text(
        text,
        reply_markup=keyboard,
        parse_mode="HTML"
    )


@dp.callback_query(F.data == "deposit")
async def deposit_handler(callback: CallbackQuery):
    # Раздел пополнения баланса
    text = (
        "<tg-emoji emoji-id='5296355151743838259'>💰</tg-emoji> <b>Пополнение баланса (TON)</b>\n\n"
        "Для пополнения баланса отправьте желаемую сумму на адрес кошелька бота:\n\n"
        "<code>EQB_YOUR_BOT_WALLET_ADDRESS</code>\n\n"
        "⚠️ <b>ВАЖНО:</b> Обязательно укажите ваш ID в комментарии к транзакции, иначе средства не будут зачислены автоматически:\n"
        f"Комментарий: <code>{callback.from_user.id}</code>\n\n"
        "<i>Зачисление происходит в течение 5-10 минут после подтверждения сети.</i>"
    )
    await callback.message.edit_text(
        text,
        reply_markup=kb.profile_keyboard(),
        parse_mode="HTML"
    )

@dp.callback_query(F.data == "info")
async def info_details(callback: CallbackQuery):
    coder_uname = await get_dynamic_username("coder", "@Paulie_Gualtiery")
    admin_uname = await get_dynamic_username("admin", "@nerksqq")
    
    text = (
        "<tg-emoji emoji-id='5197269100878907942'>ℹ️</tg-emoji> <b>Информация о сервисе:</b>\n\n"
        "<tg-emoji emoji-id='5319302290127991242'>📱</tg-emoji> Сервис OctoRent предоставляет услугу аренды NFT подарков, NFT и анонимных номеров +888\n\n"
        "<tg-emoji emoji-id='5188481279963715781'>⏳</tg-emoji> В скором времени появится покупка товаров и больше новых возможностей, связанных с NFT\n\n"
        f"<tg-emoji emoji-id='5337017423906226569'>👨‍💻</tg-emoji> Кодер — {coder_uname}\n"
        f"<tg-emoji emoji-id='5215416746453776052'>👥</tg-emoji> Админ — {admin_uname}"
    )
    await callback.message.edit_text(
        text,
        reply_markup=kb.info_keyboard(),
        parse_mode="HTML"
    )

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
        text = query.query.strip().lower()
        user_id = query.from_user.id
        
        # 🔄 RE-READ ENV: Force override to catch tunnel URL updates
        load_dotenv(override=True)
        current_web_url = (os.getenv("WEB_APP_URL") or WEB_APP_URL).rstrip('/')
        
        bot_info = await bot.get_me()
        bot_username = bot_info.username
        ref_link = f"https://t.me/{bot_username}?start=ref_{user_id}"

        # 🎁 Referral link sharing result
        if not text or text == "ref" or text.startswith("ref_"):
            # TOTAL RANDOM ID: Bypass any Telegram caching of old failures
            res_id = f"ref_{user_id}_{os.urandom(4).hex()}"
            
            thumb_url = f"{current_web_url}/pictures/referral_128x128.png"
            # Fallback thumbnail if tunnel is slow to load
            stable_thumb = "https://ton.org/download/ton_symbol.png"
            

            # 🛠 ARTICLE IS MORE ROBUST: Less likely to be ignored if image fails to load
            share_result = InlineQueryResultArticle(
                id=res_id,
                title="🎁 Реферальная система",
                description="Приглашай друзей и получай бонусы! 💰",
                thumbnail_url=thumb_url,
                input_message_content=InputTextMessageContent(
                    message_text=(
                        f"🎁 <b>Присоединяйся к OctoRent!</b>\n\n"
                        f"Арендуй NFT подарки, юзернеймы и номера напрямую в Telegram.\n\n"
                        f"🔗 <b>Твоя ссылка для входа:</b>\n{ref_link}"
                        f"<a href='{current_web_url}/pictures/referral.png'>&#8205;</a>" # Invisible link for big image preview
                    ),
                    parse_mode="HTML",
                    disable_web_page_preview=False
                ),
                reply_markup=InlineKeyboardMarkup(inline_keyboard=[[
                    InlineKeyboardButton(text="🚀 Открыть в OctoRent", url=ref_link)
                ]])
            )
            
            if text == "ref":
                logging.info(f"Returning Article result for {user_id}")
                try:
                    await query.answer([share_result], cache_time=1, is_personal=True)
                except Exception as ex:
                    logging.error(f"!!! FAILED TO ANSWER INLINE !!! Error: {ex}")
                return
            
            results = [share_result]
        elif text in ["history", "история", "orders"]:
            orders = await db.get_user_orders(user_id)
            results = []
            if orders:
                for order in orders[:30]:
                    status_map = {
                        'expired': '🔴 Закончена', 'active':  '🟢 Арендовано',
                        'rented':  '⏳ Ожидает подключения', 'paid': '⏳ Ожидает подключения',
                        'pending': '🕐 В обработке', 'pending_payment': '🕐 Ожидает оплаты',
                    }
                    st_text = status_map.get(order['status'], f"❓ {order['status']}")
                    
                    price = round(float(order['price_per_day']), 2) if order['price_per_day'] else 0
                    desc = f"{st_text} | {order['days']} дней | {price} TON"
                    
                    results.append(InlineQueryResultArticle(
                        id=f"hist_{order['id']}",
                        title=f"🎁 {order['nft_name']}",
                        description=desc,
                        thumbnail_url="https://ton.org/download/ton_symbol.png",
                        input_message_content=InputTextMessageContent(
                            message_text=(
                                f"📜 <b>Заказ #{order['id']}</b>\n"
                                f"🎁 <b>Предмет:</b> {order['nft_name']}\n"
                                f"📊 <b>Статус:</b> {st_text}\n"
                            ),
                            parse_mode="HTML"
                        )
                    ))
            try:
                await query.answer(results, cache_time=1, is_personal=True)
            except Exception as e:
                logging.error(f"Error answering history inline: {e}")
            return
        else:
            results = []

        items = await db.search_items_inline(text, limit=30)
        
        for item in items:
            try:
                # Load metadata to get image/video
                meta = {}
                try:
                    if item['metadata']:
                        meta = json.loads(item['metadata'])
                except: pass

                image_url = meta.get("image")

                try:
                    item_title = item['title'] or item['nft_name'] or 'NFT'
                except:
                    item_title = 'NFT'

                # Determine type
                is_gift = (item['type'] == 'gift') or (not item_title.startswith('@') and not item_title.startswith('+'))
                logging.info(f"DEBUG ITEM: '{item_title}' (Type: {item['type']}, is_gift: {is_gift})")

                tg_nft_link = None
                # Fallback for gifts: generate image URL from name+number
                if is_gift and " #" in item_title:
                    try:
                        import re as _re
                        name_part, num_part = item_title.rsplit(" #", 1)
                        clean_slug = _re.sub(r'[^a-zA-Z0-9]', '', name_part)
                        tg_nft_link = f"https://t.me/nft/{clean_slug}-{num_part}"
                        if not image_url or "gift.svg" in image_url:
                            low_slug = clean_slug.lower()
                            image_url = f"https://nft.fragment.com/gift/{low_slug}-{num_part}.webp"
                    except: pass

                # Handle fragments (usernames/numbers) images
                if not is_gift:
                    # TonAPI image proxy is unreliable (returns 404 for some items)
                    # Use Fragment's native image service
                    if item_title.startswith('@'):
                        clean_username = item_title.lstrip('@')
                        image_url = f"https://nft.fragment.com/username/{clean_username}.webp"
                        logging.info(f"DEBUG FRAGMENT: Username image: {image_url}")
                    elif item_title.startswith('+'):
                        # Number format: +888 0932 8147 -> 88809328147
                        import re as _re
                        clean_num = _re.sub(r'[^0-9]', '', item_title)
                        image_url = f"https://nft.fragment.com/number/{clean_num}.webp"
                        logging.info(f"DEBUG FRAGMENT: Number image: {image_url}")
                    else:
                        image_url = f"https://tonapi.io/v2/nfts/{item['nft_address']}/image"
                        logging.info(f"DEBUG FRAGMENT: Falling back to TonAPI image: {image_url}")

                if not image_url or "gift.svg" in image_url:
                    if os.path.exists(os.path.join("web", "pictures", "referral_128x128.png")):
                        image_url = f"{WEB_APP_URL.rstrip('/')}/pictures/referral_128x128.png"
                    else:
                        image_url = "https://ton.org/download/ton_symbol.png"

                # Format price
                try:
                    price_rounded = round(float(item['price_per_day']), 4)
                except:
                    price_rounded = 0.0

                bot_username_str = "OctoRent_bot"
                # 🚀 STABLE BOT LINK: Using ?start= instead of ?startapp= to prevent BOT_INVALID when domain changes
                share_link = f"https://t.me/{bot_username_str}?start=nft_{item['nft_address']}"
                
                title_prefix = "🎁" if is_gift else "💎"
                item_type_label = "Gift" if is_gift else item['type'].capitalize()
                
                # Caption shown under the photo in chat
                time_info = ""
                # Use ['column'] instead of .get() as sqlite3.Row doesn't support .get()
                rent_ends = None
                try: rent_ends = item['rent_ends_at']
                except: pass

                if item['status'] == 'rented' and rent_ends:
                    try:
                        rem = int(rent_ends) - int(time.time())
                        if rem > 0:
                            days = rem // 86400
                            hours = (rem % 86400) // 3600
                            mins = (rem % 3600) // 60
                            
                            t_str = f"{hours}ч {mins}м"
                            if days > 0: t_str = f"{days}д {t_str}"
                            
                            time_info = f"⏳ <b>Осталось:</b> <code>{t_str}</code>\n"
                        else:
                            time_info = f"⌛️ <b>Аренда завершена</b>\n"
                    except: pass

                caption_text = (
                    f"{title_prefix} <b>{item_title}</b>\n"
                    f"━━━━━━━━━━━━━━━━━━━━\n"
                    f"📁 <b>Тип:</b> <code>{item_type_label}</code>\n"
                    f"💰 <b>Цена:</b> <code>{price_rounded} TON/день</code>\n"
                    f"{time_info}"
                    f"━━━━━━━━━━━━━━━━━━━━\n"
                    f"✨ <i>OctoRent— Аренда NFT в один клик</i>"
                )

                res_id = f"item_{item['id']}"
                logging.info(f"DEBUG RESULT: Appending {res_id} for {item_title}")

                # Use InlineQueryResultPhoto so image shows BIG in chat
                results.append(InlineQueryResultPhoto(
                    id=res_id,
                    photo_url=image_url,
                    thumbnail_url=image_url,
                    title=f"{title_prefix} {item_title}",
                    description=f"⚡️ {price_rounded} TON/day | Rent Now",
                    caption=caption_text,
                    parse_mode="HTML",
                    reply_markup=InlineKeyboardMarkup(inline_keyboard=[[
                        InlineKeyboardButton(text="⚡️ Арендовать за " + str(price_rounded) + " TON", url=share_link)
                    ]])
                ))
            except Exception as e:
                logging.error(f"Error processing inline item: {e}")
                continue

        logging.info(f"DEBUG FINAL: {len(results)} results ready for '{text}'")
        await query.answer(results, cache_time=1, is_personal=True)

    except Exception as e:
        logging.error(f"Error in inline_handler: {e}", exc_info=True)
        # Return empty results on error to avoid infinite loading
        try:
            await query.answer([], cache_time=5)
        except: pass

@dp.message(Command("help"))
async def cmd_help(message: Message):
    """Хендлер для команды /help"""
    user_id = message.from_user.id
    lang = await db.get_user_language(user_id)
    
    help_text = (
        "❓ <b>Помощь и FAQ</b>\n\n"
        "1. <b>Как арендовать?</b>\n"
        "Выберите понравившийся NFT в каталоге, укажите срок аренды и нажмите «Арендовать». После оплаты бот пришлет подтверждение.\n\n"
        "2. <b>Как подключить к Fragment?</b>\n"
        "После аренды в истории появится кнопка «Подключить к Fragment». Вам нужно будет ввести <code>tc://</code> ссылку из вашего кошелька.\n\n"
        "3. <b>Возвращаются ли средства?</b>\n"
        "Да, 0.14 TON возвращаются автоматически после завершения срока аренды.\n\n"
        "Если у вас остались вопросы, пишите в поддержку: @OctoRentSupport"
    )
    if lang == 'en':
        help_text = (
            "❓ <b>Help & FAQ</b>\n\n"
            "1. <b>How to rent?</b>\n"
            "Pick an NFT from the catalog, choose the duration, and click 'Rent'. You'll get a confirmation after payment.\n\n"
            "2. <b>How to connect to Fragment?</b>\n"
            "After renting, find your item in 'History' and click 'Connect to Fragment'. You'll need to provide a <code>tc://</code> link from your wallet.\n\n"
            "3. <b>Are funds returned?</b>\n"
            "Yes, ~0.14 TON is automatically refunded after the rental period ends.\n\n"
            "For more questions, contact support: @OctoRentSupport"
        )
        
    await message.answer(help_text, parse_mode="HTML")

@dp.message(F.text)
async def text_msg_handler(message: Message):
    """Обработчик любого текста — возвращаем главное меню или помощь"""
    user_id = message.from_user.id
    lang = await db.get_user_language(user_id)
    text = (message.text or "").lower()
    
    # Если пользователь пишет "help", "помощь" и т.д. — вызываем хендлер помощи
    if any(keyword in text for keyword in ["help", "помощь", "faq", "вопрос", "support"]):
        await cmd_help(message)
        return

    msg_text = "💎 <b>LIVE NFT Rental Market</b>\n\nДанные подгружаются в реальном времени напрямую с маркетплейса."
    if lang == 'en':
        msg_text = "💎 <b>LIVE NFT Rental Market</b>\n\nData is loaded in real-time directly from the marketplace."
        
    await message.answer(
        msg_text,
        reply_markup=kb.main_menu(WEB_APP_URL, message.from_user.id == ADMIN_ID, lang=lang),
        parse_mode="HTML"
    )

@dp.message(Command("fix_url"))
async def cmd_fix_url(message: Message, command: CommandObject):
    """
    Manual fix for the Menu Button URL.
    Usage: /fix_url https://new-url.trycloudflare.com
    If no URL provided, tries to use the one from environment.
    """
    if message.from_user.id != ADMIN_ID:
        return
        
    url_to_set = None
    if command.args:
        url_to_set = command.args.strip()
    else:
        # Re-read from env just in case
        load_dotenv()
        url_to_set = os.getenv("WEB_APP_URL")
        
    if not url_to_set:
        await message.answer("❌ URL not found in args or .env")
        return

    try:
        await bot.set_chat_menu_button(
            menu_button=MenuButtonWebApp(text="💎 Open Shop", web_app=WebAppInfo(url=url_to_set))
        )
        await message.answer(f"✅ Menu Button updated to:\n{url_to_set}")
    except Exception as e:
        await message.answer(f"❌ Failed to update: {e}")

async def check_expirations():
    """Фоновая задача для уведомления об окончании аренды"""
    while True:
        try:
            now = int(asyncio.get_event_loop().time() + 1739284608) # Примерное текущее время, лучше брать из системы
            import time
            current_time = int(time.time())
            
            async with db.aiosqlite.connect(db.DB_PATH) as conn:
                conn.row_factory = db.aiosqlite.Row
                # Находим аренды, которые закончились в последние 5 минут и по которым еще не было уведомления
                # (Для простоты: находим всех кто подписан на уведомления для итемов, которые сейчас 'available' но были 'rented')
                # Но лучше: хранить время окончания в items и проверять его.
                
                async with conn.execute("""
                    SELECT n.user_id, n.nft_address, i.title, i.metadata 
                    FROM item_notifications n
                    JOIN items i ON n.nft_address = i.nft_address
                    WHERE i.status = 'available'
                """) as cursor:
                    rows = await cursor.fetchall()
                    for row in rows:
                        user_id, nft_addr, title, meta_json = row['user_id'], row['nft_address'], row['title'], row['metadata']
                        meta = json.loads(meta_json or '{}')
                        
                        text = (
                            f"🔔 <b>Предмет снова доступен!</b>\n\n"
                            f"Подарок <b>{title}</b> теперь свободен и его можно арендовать.\n"
                            f"Нажмите кнопку ниже, чтобы открыть маркетплейс."
                        )
                        
                        image_url = meta.get('image') or "https://ton.org/download/ton_symbol.png"
                        
                        try:
                            # Отправляем уведомление
                            await bot.send_photo(
                                chat_id=user_id,
                                photo=image_url,
                                caption=text,
                                parse_mode="HTML"
                            )
                            # Удаляем уведомление чтобы не спамить
                            await conn.execute("DELETE FROM item_notifications WHERE user_id = ? AND nft_address = ?", (user_id, nft_addr))
                        except Exception as e:
                            logging.error(f"Failed to notify user {user_id}: {e}")
                
                await conn.commit()
                
        except Exception as e:
            logging.error(f"Error in check_expirations: {e}")
        
        await asyncio.sleep(60) # Проверка каждую минуту

async def main():
    await db.init_db()
    print("LIVE-BOT ЗАПУЩЕН! Реальное время активно.")
    
    # Запускаем фоновые задачи
    asyncio.create_task(check_expirations())
    asyncio.create_task(refresh_operator_usernames())
    
    # 🚀 Update Menu Button with current URL
    if WEB_APP_URL:
        try:
            # Note: Bot API 9.4 allows custom emoji on menu buttons if bot owner has Premium
            # We use a dynamic label to bust client-side cache
            await bot.set_chat_menu_button(
                menu_button=MenuButtonWebApp(
                    text="🛍 Market", 
                    web_app=WebAppInfo(url=WEB_APP_URL)
                )
            )
            logging.info(f"✅ Menu Button updated: {WEB_APP_URL}")
        except Exception as e:
            logging.error(f"❌ Failed to set menu button: {e}")

    # 💎 NEW Bot API 9.4: Profile Photo management
    # Example: await bot.set_my_profile_photo(photo=...)

    print("LIVE-BOT ЗАПУЩЕН! Реальное время активно.")
    
    # Send startup message to Admin
    if ADMIN_ID:
        try:
            # API 9.4 allows richer text and custom emojis in messages
            kb_admin = InlineKeyboardMarkup(inline_keyboard=[
                [InlineKeyboardButton(text="🛍 Open Market", web_app=WebAppInfo(url=WEB_APP_URL))]
            ])
            await bot.send_message(ADMIN_ID, "🚀 **OctoRent Bot Online!**\n\nСистема запущена и отслеживает новые лоты.", reply_markup=kb_admin)
        except Exception as e:
            logging.warning(f"Could not notify admin: {e}")

    await dp.start_polling(bot)

if __name__ == "__main__":
    asyncio.run(main())
