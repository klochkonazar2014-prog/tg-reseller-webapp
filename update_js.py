import re
import codecs

keys_ru = """
        profile_fragment: "Подключить актив к Fragment",
        price_per_day: "Цена за день",
        period: "Период (Дни)",
        discount: "Скидка",
        auto_relist: "Авто-перевыставление",
        auto_relist_desc: "Этот NFT будет доступен для аренды автоматически после завершения периода.",
        filters_nft: "NFT",
        filters_model: "Модель",
        filters_bg: "Фон",
        filters_symbol: "Символ",
        filters_title: "Фильтры",
        filter_gift_number: "Номер подарка",
        filter_gift_placeholder: "Например: 123",
        filter_sort_by: "Сортировать по",
        filter_price: "Цена",
        filter_price_from: "От",
        filter_price_to: "До",
        search_nft: "Поиск NFT...",
        search_model: "Поиск модели...",
        search_bg: "Поиск фона...",
        search_symbol: "Поиск символа...",
        filter_reset: "Очистить все",
        filter_apply: "Показать результаты",
        loader_market: "Загрузка данных рынка...",
        loader_moving: "Перемещаемся в арендный каталог...",
        profile_wallet_title: "Кошелек",
        profile_connect_wallet: "Подключить кошелек",
        profile_settings_title: "Настройки и поддержка",
        profile_history: "История аренды",
        profile_support: "Поддержка и FAQ",
        profile_lang: "Language / Язык",
        mode_toggle_rent: "Каталог арендованных товаров",
        nav_gifts: "Подарки",
        nav_usernames: "Ники",
        nav_numbers: "Номера",
        nav_friends: "Друзья",
        nav_profile: "Профиль",
        friends_balance: "Доступный баланс",
        friends_withdraw: "Вывести средства",
        friends_invite: "Пригласить друзей",
        friends_bonus_text: "За каждую аренду твоего друга мы выплачиваем тебе бонус <b>25%</b>! 💸",
        friends_how_much: "Сколько это?",
        friends_list_title: "Мои друзья",
        friends_empty_1: "У вас пока нет друзей в системе.",
        friends_empty_2: "Поделитесь ссылкой, чтобы начать зарабатывать!",
        earnings_title: "Бонусная программа",
        earnings_desc: 'За каждую аренду твоего друга мы выплачиваем тебе бонус — <b style="color: #fff;">25%</b> от суммы нашей комиссии! 💸',
        earnings_th_price: "Цена аренды",
        earnings_th_income: "Ваш доход",
        earnings_footer: "Рекомендуй OctoRent друзьям и получай пассивный доход <b>25%</b> с каждой их аренды!",
        earnings_ok: "Понятно",
        lang_title: "Выберите язык / Select Language",
        wallet_drawer_title: "Управление кошельком",
        copy_address: "Копировать адрес",
        disconnect_wallet: "Отключить кошелек",
"""

keys_en = """
        profile_fragment: "Connect Asset to Fragment",
        price_per_day: "Price per day",
        period: "Period (Days)",
        discount: "Discount",
        auto_relist: "Auto re-list",
        auto_relist_desc: "This NFT will be available for rent automatically after the period ends.",
        filters_nft: "NFT",
        filters_model: "Model",
        filters_bg: "Backdrop",
        filters_symbol: "Symbol",
        filters_title: "Filters",
        filter_gift_number: "Gift Number",
        filter_gift_placeholder: "e.g., 123",
        filter_sort_by: "Sort by",
        filter_price: "Price",
        filter_price_from: "From",
        filter_price_to: "To",
        search_nft: "Search NFT...",
        search_model: "Search model...",
        search_bg: "Search backdrop...",
        search_symbol: "Search symbol...",
        filter_reset: "Clear All",
        filter_apply: "Show Results",
        loader_market: "Loading market data...",
        loader_moving: "Moving to rented catalog...",
        profile_wallet_title: "Wallet",
        profile_connect_wallet: "Connect Wallet",
        profile_settings_title: "Settings & Support",
        profile_history: "Rental History",
        profile_support: "Support & FAQ",
        profile_lang: "Language / Язык",
        mode_toggle_rent: "Rented Items Catalog",
        nav_gifts: "Gifts",
        nav_usernames: "Usernames",
        nav_numbers: "Numbers",
        nav_friends: "Friends",
        nav_profile: "Profile",
        friends_balance: "Available Balance",
        friends_withdraw: "Withdraw",
        friends_invite: "Invite Friends",
        friends_bonus_text: "We pay you a <b>25%</b> bonus for every friend's rental! 💸",
        friends_how_much: "How much is that?",
        friends_list_title: "My Friends",
        friends_empty_1: "You don't have any friends in the system yet.",
        friends_empty_2: "Share the link to start earning!",
        earnings_title: "Bonus Program",
        earnings_desc: 'We pay you a bonus for every rental by your friend — <b style="color: #fff;">25%</b> of our commission! 💸',
        earnings_th_price: "Rental Price",
        earnings_th_income: "Your Income",
        earnings_footer: "Recommend OctoRent and get a passive income of <b>25%</b> from every rental!",
        earnings_ok: "Got it",
        lang_title: "Select Language / Выберите язык",
        wallet_drawer_title: "Wallet Management",
        copy_address: "Copy Address",
        disconnect_wallet: "Disconnect Wallet",
"""

apply_func = """

// --- Auto Apply Translations ---
function applyTranslations() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        const translation = t(key);
        if(translation && translation !== key) {
            if(el.tagName === 'INPUT' && el.hasAttribute('placeholder')) {
                el.placeholder = translation;
            } else {
                el.innerHTML = translation;
            }
        }
    });

    // Special logic
    const modeBtn = document.getElementById('mode-toggle-btn');
    if(modeBtn) {
        const isShopMode = !modeBtn.classList.contains('shop-mode');
        const modeText = document.getElementById('mode-toggle-text');
        if (modeText) {
            modeText.innerText = isShopMode ? t('mode_rent_btn') : t('mode_shop_btn');
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    applyTranslations();
});
// Execute it immediately if DOMContentLoaded already fired
if (document.readyState === "complete" || document.readyState === "interactive") {
    setTimeout(applyTranslations, 1);
}
"""

files = [r'c:\arenda bot\web\app.js', r'c:\arenda bot\acd_app_utf8.js']

for fp in files:
    with codecs.open(fp, 'r', 'utf-8') as f:
        content = f.read()

    # Inject RU keys
    content = re.sub(r'(ru:\s*\{)', r'\1' + '\n' + keys_ru, content)
    # Inject EN keys
    content = re.sub(r'(en:\s*\{)', r'\1' + '\n' + keys_en, content)

    # Append applyTranslations at the very end
    if 'function applyTranslations()' not in content:
        content += apply_func

    with codecs.open(fp, 'w', 'utf-8') as f:
        f.write(content)

print('Updated JS files.')
