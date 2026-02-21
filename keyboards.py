from aiogram.types import ReplyKeyboardMarkup, KeyboardButton, InlineKeyboardMarkup, InlineKeyboardButton, WebAppInfo
import json

def main_menu(web_app_url, is_admin=False):
    # МАРКЕТ АРЕНДЫ теперь открывает мини-аппу СРАЗУ
    keyboard = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="🛍 Маркет аренды", web_app=WebAppInfo(url=web_app_url), style="primary")],
        [InlineKeyboardButton(text="👤 Профиль", callback_data="profile"), 
         InlineKeyboardButton(text="📜 История аренды", callback_data="history")],
        [InlineKeyboardButton(text="ℹ️ Информация", callback_data="info"),
         InlineKeyboardButton(text="👨‍💻 Поддержка", callback_data="support")]
    ])
    if is_admin:
        keyboard.inline_keyboard.append([InlineKeyboardButton(text="⚙️ Админ-панель", callback_data="admin_panel")])
    return keyboard

def info_keyboard():
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(
            text="Назад", 
            callback_data="main_menu",
            icon_custom_emoji_id="5359511310096672647" # New Back Emoji
        )]
    ])

def support_keyboard():
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="👨‍💻 Тех. вопросы", url="https://t.me/Paulie_Gualtiery")],
        [InlineKeyboardButton(text="💎 Другие вопросы", url="https://t.me/OctoRent_Support")],
        [InlineKeyboardButton(
            text="Назад", 
            callback_data="main_menu",
            icon_custom_emoji_id="5359511310096672647"
        )]
    ])

def profile_keyboard():
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="🎁 Рефералы", callback_data="referrals")],
        [InlineKeyboardButton(
            text="Назад", 
            callback_data="main_menu",
            icon_custom_emoji_id="5359511310096672647"
        )]
    ])


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

def history_keyboard(orders, web_app_url):
    keyboard = InlineKeyboardMarkup(inline_keyboard=[], row_width=1)
    
    for order in orders:
        # Title row
        title = order['nft_name']
        keyboard.inline_keyboard.append([InlineKeyboardButton(text=f"🎁 {title}", callback_data=f"noop_{order['id']}")])
        
        # Status row (Row with 3 buttons as requested)
        status = order['status']
        
        s1 = "🔴 Закончена" if status == 'expired' else "Закончена"
        s2 = "🟢 Арендовано" if status == 'active' else "Арендовано"
        s3 = "⏳ Ожидает" if status == 'rented' or status == 'paid' else "Ожидает"
        
        # Add emojis to highlight active status
        if status == 'expired': s1 = "✅ " + s1
        if status == 'active': s2 = "✅ " + s2
        if status == 'rented' or status == 'paid': s3 = "✅ " + s3

        keyboard.inline_keyboard.append([
            InlineKeyboardButton(text=s1, callback_data=f"noop_s1_{order['id']}"),
            InlineKeyboardButton(text=s2, callback_data=f"noop_s2_{order['id']}"),
            InlineKeyboardButton(text=s3, callback_data=f"noop_s3_{order['id']}")
        ])
        
        # Action row: TG link & connect
        actions = []
        
        # Generate TG link for gifts
        import re
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
            actions.append(InlineKeyboardButton(text="🖼 Посмотреть", url=tg_link))
        
        if actions:
            keyboard.inline_keyboard.append(actions)
            
        # Nuke-button for connecting (Full width)
        if status == 'rented':
            # Support direct deep link in webapp
            sep = "&" if "?" in web_app_url else "?"
            connect_url = f"{web_app_url}{sep}order_id={order['id']}&action=connect"
            keyboard.inline_keyboard.append([
                InlineKeyboardButton(text="🔗 Подключить к Fragment", web_app=WebAppInfo(url=connect_url))
            ])
            
        keyboard.inline_keyboard.append([InlineKeyboardButton(text="──────────────", callback_data="noop_sep")])

    keyboard.inline_keyboard.append([InlineKeyboardButton(
        text="Назад", 
        callback_data="main_menu",
        icon_custom_emoji_id="5359511310096672647"
    )])
    return keyboard
