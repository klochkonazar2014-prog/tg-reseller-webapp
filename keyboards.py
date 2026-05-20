from aiogram.types import ReplyKeyboardMarkup, KeyboardButton, InlineKeyboardMarkup, InlineKeyboardButton, WebAppInfo
import json

def lang_selection_keyboard():
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="Русский", callback_data="set_lang_ru", icon_custom_emoji_id="5449408995691341691")],
        [InlineKeyboardButton(text="English", callback_data="set_lang_en", icon_custom_emoji_id="5422520224085720580")]
    ])

def main_menu(web_app_url, is_admin=False, lang='ru'):
    texts = {
        'ru': {
            'market': "🛍 Маркет аренды",
            'profile': "👤 Профиль",
            'history': "📜 История аренды",
            'info': "ℹ️ Информация",
            'support': "👨‍💻 Поддержка",
            'reviews': "⭐ Отзывы",
            'admin': "⚙️ Админ-панель"
        },
        'en': {
            'market': "🛍 Rental Market",
            'profile': "👤 Profile",
            'history': "📜 Rental History",
            'info': "ℹ️ Information",
            'support': "👨‍💻 Support",
            'reviews': "⭐ Reviews",
            'admin': "⚙️ Admin Panel"
        }
    }
    t = texts.get(lang, texts['ru'])
    
    keyboard = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text=t['market'], web_app=WebAppInfo(url=web_app_url), style="primary")],
        [InlineKeyboardButton(text="⭐ Купить Звезды / TG Premium" if lang == 'ru' else "⭐ Buy Stars / TG Premium", callback_data="buy_services")],
        [InlineKeyboardButton(text=t['profile'], callback_data="profile"), 
         InlineKeyboardButton(text=t['history'], callback_data="history")],
        [InlineKeyboardButton(text=t['info'], callback_data="info"),
         InlineKeyboardButton(text=t['support'], callback_data="support")],
        [InlineKeyboardButton(text=t['reviews'], callback_data="reviews_menu")],
    ])
    if is_admin:
        keyboard.inline_keyboard.append([InlineKeyboardButton(text=t['admin'], callback_data="admin_panel")])
    return keyboard

def info_keyboard(lang='ru'):
    text = "Назад" if lang == 'ru' else "Back"
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(
            text=text, 
            callback_data="main_menu",
            icon_custom_emoji_id="5359511310096672647"
        )]
    ])

def support_keyboard(lang='ru', web_app_url=None, **kwargs):
    back_text = "Назад" if lang == 'ru' else "Back"
    support_text = "👨‍💻 Поддержка" if lang == 'ru' else "👨‍💻 Support"
    collab_text = "🤝 Сотрудничество" if lang == 'ru' else "🤝 Cooperation"
    faq_text = "📜 Пользовательское соглашение" if lang == 'ru' else "📜 User Agreement"
    
    keyboard = []
    if web_app_url:
        rules_url = f"{web_app_url.rstrip('/')}/legal.html"
        keyboard.append([InlineKeyboardButton(text=faq_text, web_app=WebAppInfo(url=rules_url))])
        
    keyboard.append([InlineKeyboardButton(text=support_text, url="https://t.me/Paulie_Gualtiery")])
    keyboard.append([InlineKeyboardButton(text=collab_text, url="tg://user?id=7868560541")])
    keyboard.append([InlineKeyboardButton(
        text=back_text, 
        callback_data="main_menu",
        icon_custom_emoji_id="5359511310096672647"
    )])
    return InlineKeyboardMarkup(inline_keyboard=keyboard)

def profile_keyboard(lang='ru'):
    back_text = "Назад" if lang == 'ru' else "Back"
    ref_text = "🎁 Рефералы" if lang == 'ru' else "🎁 Referrals"
    
    rows = [
        [InlineKeyboardButton(text=ref_text, callback_data="referrals")],
        [InlineKeyboardButton(
            text=back_text, 
            callback_data="main_menu",
            icon_custom_emoji_id="5359511310096672647"
        )]
    ]
    
    return InlineKeyboardMarkup(inline_keyboard=rows)


def models_keyboard(models):
    keyboard = InlineKeyboardMarkup(inline_keyboard=[], row_width=2)
    current_row = []
    for model in models:
        # Example: can use custom_emoji_id if we had one. 
        # For now, we prepare the structure for future use or user can add IDs.
        btn = InlineKeyboardButton(text=f"📦 {model}", callback_data=f"model_{model}")
        current_row.append(btn)
        if len(current_row) == 2:
            keyboard.inline_keyboard.append(current_row)
            current_row = []
    if current_row:
        keyboard.inline_keyboard.append(current_row)
        
    keyboard.inline_keyboard.append([InlineKeyboardButton(
        text="Назад", 
        callback_data="main_menu",
        icon_custom_emoji_id="5359511310096672647"
    )])
    return keyboard

def items_by_model_keyboard(items, model_name):
    keyboard = InlineKeyboardMarkup(inline_keyboard=[], row_width=1)
    for item in items:
        meta = json.loads(item['metadata'])
        desc = f"{meta.get('backdrop')} | {meta.get('symbol')}"
        text = f"{item['title']} ({desc}) — {item['price_per_day']} TON"
        # Optional: set color style for specific items
        btn = [InlineKeyboardButton(text=text, callback_data=f"view_{item['id']}")]
        keyboard.inline_keyboard.append(btn)
    
    keyboard.inline_keyboard.append([InlineKeyboardButton(
        text="Назад", 
        callback_data="back_to_models",
        icon_custom_emoji_id="5359511310096672647"
    )])
    return keyboard

def item_action_keyboard(item, web_app_url, owner_wallet):
    markup = round(item['price_per_day'] - item['original_price'], 2)
    meta = json.loads(item['metadata'])
    
    encoded_title = item['title'].replace(" ", "%20")
    url = (
        f"{web_app_url}?nft_address={item['nft_address']}"
        f"&title={encoded_title}"
        f"&markup={markup}"
        f"&owner_wallet={owner_wallet}"
    )
    
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(
            text=f"💎 Арендовать за {item['price_per_day']} TON", 
            web_app=WebAppInfo(url=url),
            style="primary"
        )],
        [InlineKeyboardButton(
            text="Назад", 
            callback_data=f"model_{meta.get('collection')}",
            icon_custom_emoji_id="5359511310096672647"
        )]
    ])

def history_keyboard(orders, web_app_url, page=0):
    import re
    keyboard = InlineKeyboardMarkup(inline_keyboard=[])
    
    if not orders:
        keyboard.inline_keyboard.append([InlineKeyboardButton(text="Нет заказов", callback_data="noop_empty")])
        keyboard.inline_keyboard.append([InlineKeyboardButton(
            text="Назад", callback_data="main_menu",
            icon_custom_emoji_id="5359511310096672647"
        )])
        return keyboard

    total = len(orders)
    page = min(max(0, page), total - 1)
    order = orders[page]
    title = order['nft_name']
    status = order['status']

    # 1. Название подарка (некликабельно)
    keyboard.inline_keyboard.append([
        InlineKeyboardButton(text=f"🎁 {title}", callback_data=f"noop_{order['id']}")
    ])

    # 2. ОДИН статус
    status_map = {
        'expired': '🔴 Закончена',
        'active':  '🟢 Арендовано',
        'rented':  '⏳ Ожидает подключения к Fragment',
        'paid':    '⏳ Ожидает подключения к Fragment',
        'pending': '🕐 В обработке',
        'pending_payment': '🕐 Ожидает оплаты',
    }
    status_text = status_map.get(status, f'❓ {status}')
    keyboard.inline_keyboard.append([
        InlineKeyboardButton(text=status_text, callback_data=f"noop_st_{order['id']}")
    ])

    # 3. Ссылка «Посмотреть» на подарок
    tg_link = None
    if " #" in title:
        name_part, num_part = title.rsplit(" #", 1)
        slug = re.sub(r'[^a-zA-Z0-9]', '', name_part)
        tg_link = f"https://t.me/nft/{slug}-{num_part}"
    elif title.startswith('@'):
        tg_link = f"https://t.me/nft/{title.lstrip('@')}"
    elif title.startswith('+'):
        clean_n = re.sub(r'[^0-9]', '', title)
        tg_link = f"https://t.me/nft/{clean_n}"

    if tg_link:
        keyboard.inline_keyboard.append([
            InlineKeyboardButton(text="🖼 Посмотреть", url=tg_link)
        ])

    # 4. Кнопка подключения к Fragment (только если rented)
    if status == 'rented':
        sep = "&" if "?" in web_app_url else "?"
        connect_url = f"{web_app_url}{sep}order_id={order['id']}&action=connect"
        keyboard.inline_keyboard.append([
            InlineKeyboardButton(text="🔗 Подключить к Fragment", web_app=WebAppInfo(url=connect_url))
        ])

    # 5. Навигация: ‹ | N/Total | ›
    if total > 1:
        prev_btn = InlineKeyboardButton(
            text="◀️",
            callback_data=f"history_page_{page - 1}" if page > 0 else "noop_nav"
        )
        counter_btn = InlineKeyboardButton(
            text=f"{page + 1} / {total}",
            callback_data="noop_page"
        )
        next_btn = InlineKeyboardButton(
            text="▶️",
            callback_data=f"history_page_{page + 1}" if page < total - 1 else "noop_nav"
        )
        keyboard.inline_keyboard.append([prev_btn, counter_btn, next_btn])

    # 6. Кнопка «Назад»
    keyboard.inline_keyboard.append([InlineKeyboardButton(
        text="Назад",
        callback_data="main_menu",
        icon_custom_emoji_id="5359511310096672647"
    )])

    return keyboard

def reviews_keyboard(web_app_url, lang='ru'):
    """Меню раздела отзывов"""
    back_text = "Назад" if lang == 'ru' else "Back"
    import time
    # Point directly to the html file to ensure server serves it correctly and bypass cache
    review_url = f"{web_app_url.rstrip('/')}/review.html?v={int(time.time())}"
    
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="💬 Написать отзыв", callback_data="write_review")],
        [InlineKeyboardButton(text="💬 Посмотреть отзывы сервиса", web_app=WebAppInfo(url=review_url))],
        [InlineKeyboardButton(
            text=back_text,
            callback_data="main_menu",
            icon_custom_emoji_id="5359511310096672647"
        )]
    ])


def review_nft_select_keyboard(past_rentals: list, lang='ru'):
    """Клавиатура выбора NFT для отзыва"""
    back_text = "Назад" if lang == 'ru' else "Back"
    rows = []
    for i, nft_name in enumerate(past_rentals[:10]):  # макс 10 кнопок
        short = nft_name[:30] + '…' if len(nft_name) > 30 else nft_name
        rows.append([InlineKeyboardButton(text=f"🎁 {short}", callback_data=f"review_nft_{i}")])
    rows.append([InlineKeyboardButton(
        text=back_text,
        callback_data="reviews_menu",
        icon_custom_emoji_id="5359511310096672647"
    )])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def confirm_review_keyboard(lang='ru'):
    """Подтверждение публикации отзыва"""
    publish_text = "✅ Опубликовать" if lang == 'ru' else "✅ Publish"
    cancel_text = "✏️ Написать заново" if lang == 'ru' else "✏️ Rewrite"
    back_text = "🏠 Главное меню" if lang == 'ru' else "🏠 Main Menu"
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text=publish_text, callback_data="review_publish")],
        [InlineKeyboardButton(text=cancel_text, callback_data="write_review")],
        [InlineKeyboardButton(text=back_text, callback_data="main_menu")]
    ])


def review_satisfaction_keyboard(lang='ru'):
    """Выбор: доволен или нет"""
    texts = {
        'ru': {
            'good': "✅ Доволен",
            'bad': "❌ Не доволен",
            'back': "Назад"
        },
        'en': {
            'good': "✅ Satisfied",
            'bad': "❌ Not satisfied",
            'back': "Back"
        }
    }
    t = texts.get(lang, texts['ru'])
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text=t['good'], callback_data="review_rate_5"),
         InlineKeyboardButton(text=t['bad'], callback_data="review_rate_1")],
        [InlineKeyboardButton(text=t['back'], callback_data="write_review")]
    ])


def buy_location_keyboard(lang='ru', web_app_url=""):
    """Клавиатура выбора места покупки (Mini App или Бот)"""
    # Формируем URL для веб-приложения звезд/премиума
    sep = "&" if "?" in web_app_url else "?"
    stars_app_url = f"{web_app_url.rstrip('/')}/stars"
    
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="📱 В мини-приложении" if lang == 'ru' else "📱 In Mini App", web_app=WebAppInfo(url=stars_app_url))],
        [InlineKeyboardButton(text="🤖 В Telegram-боте" if lang == 'ru' else "🤖 In Telegram Bot", callback_data="buy_in_bot")],
        [InlineKeyboardButton(text="Назад" if lang == 'ru' else "Back", callback_data="main_menu", icon_custom_emoji_id="5359511310096672647")]
    ])

def buy_product_keyboard(lang='ru'):
    """Клавиатура выбора продукта (Premium или Stars)"""
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="⭐ Telegram Premium", callback_data="buy_premium")],
        [InlineKeyboardButton(text="🌟 Telegram Stars", callback_data="buy_stars")],
        [InlineKeyboardButton(text="Назад" if lang == 'ru' else "Back", callback_data="buy_services", icon_custom_emoji_id="5359511310096672647")]
    ])

def recipient_selection_keyboard(lang='ru'):
    """Клавиатура выбора получателя"""
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="👤 Себе" if lang == 'ru' else "👤 For Myself", callback_data="recipient_self")],
        [InlineKeyboardButton(text="Назад" if lang == 'ru' else "Back", callback_data="buy_in_bot", icon_custom_emoji_id="5359511310096672647")]
    ])

def premium_period_keyboard(lang='ru'):
    """Клавиатура выбора периода подписки Premium"""
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="📅 3 месяца" if lang == 'ru' else "📅 3 months", callback_data="premium_period_3")],
        [InlineKeyboardButton(text="📅 6 месяцев" if lang == 'ru' else "📅 6 months", callback_data="premium_period_6")],
        [InlineKeyboardButton(text="📅 12 месяцев" if lang == 'ru' else "📅 12 months", callback_data="premium_period_12")],
        [InlineKeyboardButton(text="Назад" if lang == 'ru' else "Back", callback_data="back_to_recipient", icon_custom_emoji_id="5359511310096672647")]
    ])

def payment_selection_keyboard(lang='ru', order_id=None, ton_price=None, rub_price=None, backend_url=None, owner_wallet=None):
    """Клавиатура выбора способа оплаты (СБП / TON)"""
    keyboard = []
    
    # 1. Кнопка AuraPay (СБП) в виде WebApp для оплаты внутри Telegram
    if backend_url and order_id:
        fiat_url = f"{backend_url.rstrip('/')}/api/services/pay_fiat?order_id={order_id}"
        sbp_text = f"💳 Оплатить {rub_price} RUB (СБП)" if lang == 'ru' else f"💳 Pay {rub_price} RUB (SBP)"
        keyboard.append([InlineKeyboardButton(text=sbp_text, web_app=WebAppInfo(url=fiat_url))])
        
    # 2. Кнопка Tonkeeper Deep Link для оплаты TON в 1 клик
    if owner_wallet and order_id and ton_price:
        amount_nano = int(ton_price * 1e9)
        comment_text = f"service:{order_id}"
        # URL схема Tonkeeper для мгновенной транзакции
        tonkeeper_url = f"https://app.tonkeeper.com/transfer/{owner_wallet}?amount={amount_nano}&text={comment_text}"
        ton_text = f"💎 Оплатить {ton_price} TON (Tonkeeper)" if lang == 'ru' else f"💎 Pay {ton_price} TON (Tonkeeper)"
        keyboard.append([InlineKeyboardButton(text=ton_text, url=tonkeeper_url)])
        
    # 3. Кнопка ручного перевода (показывает реквизиты)
    manual_text = "💎 TON (Реквизиты перевода)" if lang == 'ru' else "💎 TON (Transfer details)"
    keyboard.append([InlineKeyboardButton(text=manual_text, callback_data=f"pay_manual_ton_{order_id}")])
    
    # 4. Назад
    keyboard.append([InlineKeyboardButton(text="Назад" if lang == 'ru' else "Back", callback_data="buy_in_bot", icon_custom_emoji_id="5359511310096672647")])
    
    return InlineKeyboardMarkup(inline_keyboard=keyboard)


