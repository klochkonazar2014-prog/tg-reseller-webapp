from aiogram.types import ReplyKeyboardMarkup, KeyboardButton, InlineKeyboardMarkup, InlineKeyboardButton, WebAppInfo
import json

def main_menu(is_admin=False):
    buttons = [
        [KeyboardButton(text="🎁 Аренда NFT подарков"), KeyboardButton(text="📱 Аренда +888")],
        [KeyboardButton(text="👤 Профиль"), KeyboardButton(text="ℹ️ Информация")],
        [KeyboardButton(text="👨‍💻 Поддержка")]
    ]
    if is_admin:
        buttons.append([KeyboardButton(text="⚙️ Админ-панель")])
    return ReplyKeyboardMarkup(keyboard=buttons, resize_keyboard=True)

def models_keyboard(models):
    keyboard = InlineKeyboardMarkup(inline_keyboard=[], row_width=2)
    # Группируем по 2 кнопки в ряд
    current_row = []
    for model in models:
        btn = InlineKeyboardButton(text=f"📦 {model}", callback_data=f"model_{model}")
        current_row.append(btn)
        if len(current_row) == 2:
            keyboard.inline_keyboard.append(current_row)
            current_row = []
    if current_row:
        keyboard.inline_keyboard.append(current_row)
        
    keyboard.inline_keyboard.append([InlineKeyboardButton(text="⬅️ В главное меню", callback_data="main_menu")])
    return keyboard

def items_by_model_keyboard(items, model_name):
    keyboard = InlineKeyboardMarkup(inline_keyboard=[], row_width=1)
    for item in items:
        meta = json.loads(item['metadata'])
        # Короткий статус: фон и символ
        desc = f"{meta.get('backdrop')} | {meta.get('symbol')}"
        text = f"{item['title']} ({desc}) — {item['price_per_day']} TON"
        btn = [InlineKeyboardButton(text=text, callback_data=f"view_{item['id']}")]
        keyboard.inline_keyboard.append(btn)
    
    keyboard.inline_keyboard.append([InlineKeyboardButton(text="⬅️ К выбору модели", callback_data="back_to_models")])
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
            web_app=WebAppInfo(url=url)
        )],
        [InlineKeyboardButton(text="⬅️ Назад к списку", callback_data=f"model_{meta.get('collection')}")]
    ])
