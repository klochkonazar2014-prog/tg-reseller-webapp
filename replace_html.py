import re
import codecs

html_path = r'c:\arenda bot\web\index.html'
with codecs.open(html_path, 'r', 'utf-8') as f:
    text = f.read()

replacements = [
    # Remove dev button and replace with connect asset
    (r'<!-- 🛠 DEV TEST: TC Link Redesign -->\s*<div class=\"service-item\" id=\"dev-test-tc-btn\".*?</div>\s*</div>\s*</div>', 
     '''<div class="service-item" id="btn-fragment-connect" onclick="openTcModal('GENERAL')">
                <div class="service-icon" style="background: rgba(0, 136, 204, 0.1);">💎</div>
                <div id="profile-label-fragment" class="service-text" data-i18n="profile_fragment">Подключить актив к Fragment</div>
                <div class="service-arrow">›</div>
            </div>''', re.DOTALL),
            
    # Product View Labels
    (r'<div id=\"view-label-price\".*?>Price per\s+day\s*</div>', r'<div id="view-label-price" class="pricing-label" style="font-size: 11px; color:#8794a1; font-weight:600; margin-bottom:4px;" data-i18n="price_per_day">Price per day</div>'),
    (r'<div id=\"view-label-period\".*?>Period\s*\(Days\)\s*</div>', r'<div id="view-label-period" class="pricing-label" style="font-size: 11px; color:#8794a1; font-weight:600; margin-bottom:4px;" data-i18n="period">Period (Days)</div>'),
    (r'<div id=\"view-label-discount\".*?>Discount\s*</div>', r'<div id="view-label-discount" class="pricing-label" style="font-size: 11px; color:#8794a1; font-weight:600; margin-bottom:4px;" data-i18n="discount">Discount</div>'),
    (r'<b id=\"view-auto-relist-title\">Auto re-list.</b>', r'<b id="view-auto-relist-title" data-i18n="auto_relist">Auto re-list.</b>'),
    (r'<span id=\"view-auto-relist-desc\">This NFT.*?</span>', r'<span id="view-auto-relist-desc" data-i18n="auto_relist_desc">This NFT will be available for rent automatically after the period ends.</span>'),
    
    # Filter chip labels
    (r'<span id=\"chip-label-nft\">NFT</span>', r'<span id="chip-label-nft" data-i18n="filters_nft">NFT</span>'),
    (r'<span id=\"chip-label-model\">Модель</span>', r'<span id="chip-label-model" data-i18n="filters_model">Модель</span>'),
    (r'<span id=\"chip-label-bg\">Фон</span>', r'<span id="chip-label-bg" data-i18n="filters_bg">Фон</span>'),
    (r'<span id=\"chip-label-symbol\">Символ</span>', r'<span id="chip-label-symbol" data-i18n="filters_symbol">Символ</span>'),
    
    # Modal headers
    (r'<h3 id=\"mrkt-label-filters\">Фильтры</h3>', r'<h3 id="mrkt-label-filters" data-i18n="filters_title">Фильтры</h3>'),
    (r'<div id=\"mrkt-label-gift-number\" class=\"filter-section-title\">Номер подарка</div>', r'<div id="mrkt-label-gift-number" class="filter-section-title" data-i18n="filter_gift_number">Номер подарка</div>'),
    (r'placeholder=\"Например: 123\"', r'placeholder="Например: 123" data-i18n="filter_gift_placeholder"'),
    (r'<span id=\"mrkt-label-sort\">Сортировать по</span>', r'<span id="mrkt-label-sort" data-i18n="filter_sort_by">Сортировать по</span>'),
    (r'<span id=\"mrkt-label-price\">Цена</span>', r'<span id="mrkt-label-price" data-i18n="filter_price">Цена</span>'),
    (r'placeholder=\"От\"', r'placeholder="От" data-i18n="filter_price_from"'),
    (r'placeholder=\"До\"', r'placeholder="До" data-i18n="filter_price_to"'),
    
    (r'placeholder=\"Поиск NFT\.\.\.\"', r'placeholder="Поиск NFT..." data-i18n="search_nft"'),
    (r'placeholder=\"Поиск модели\.\.\.\"', r'placeholder="Поиск модели..." data-i18n="search_model"'),
    (r'placeholder=\"Поиск фона\.\.\.\"', r'placeholder="Поиск фона..." data-i18n="search_bg"'),
    (r'placeholder=\"Поиск символа\.\.\.\"', r'placeholder="Поиск символа..." data-i18n="search_symbol"'),
    
    (r'<button id=\"mrkt-btn-reset\" class=\"btn-gray\" onclick=\"resetMrktModal\(\)\">Очистить все</button>', r'<button id="mrkt-btn-reset" class="btn-gray" onclick="resetMrktModal()" data-i18n="filter_reset">Очистить все</button>'),
    (r'<button id=\"mrkt-btn-apply\" class=\"btn-yellow\" onclick=\"applyMrktModal\(\)\">Показать результаты</button>', r'<button id="mrkt-btn-apply" class="btn-yellow" onclick="applyMrktModal()" data-i18n="filter_apply">Показать результаты</button>'),
    
    # Loaders
    (r'<div id=\"top-loader\" class=\"loader\">Загрузка данных рынка\.\.\.</div>', r'<div id="top-loader" class="loader" data-i18n="loader_market">Загрузка данных рынка...</div>'),
    (r'<p id=\"global-loader-text\">Перемещаемся в арендный каталог\.\.\.</p>', r'<p id="global-loader-text" data-i18n="loader_moving">Перемещаемся в арендный каталог...</p>'),

    # Profile Tab
    (r'<div id=\"profile-label-wallet\" class=\"dash-section-title\">Wallet</div>', r'<div id="profile-label-wallet" class="dash-section-title" data-i18n="profile_wallet_title">Wallet</div>'),
    (r'<span id=\"blue-wallet-text\">Connect Wallet</span>', r'<span id="blue-wallet-text" data-i18n="profile_connect_wallet">Connect Wallet</span>'),
    (r'<div id=\"profile-label-settings\" class=\"dash-section-title\">Settings & Support</div>', r'<div id="profile-label-settings" class="dash-section-title" data-i18n="profile_settings_title">Settings & Support</div>'),
    (r'<div id=\"profile-label-history\" class=\"service-text\">Rental History</div>', r'<div id="profile-label-history" class="service-text" data-i18n="profile_history">Rental History</div>'),
    (r'<div id=\"profile-label-support\" class=\"service-text\">Support & FAQ</div>', r'<div id="profile-label-support" class="service-text" data-i18n="profile_support">Support & FAQ</div>'),
    (r'<div class=\"service-text\">Language / Язык</div>', r'<div class="service-text" data-i18n="profile_lang">Language / Язык</div>'),

    # Bottom Nav
    (r'<span id=\"mode-toggle-text\">Каталог арендованных товаров</span>', r'<span id="mode-toggle-text" data-i18n="mode_toggle_rent">Каталог арендованных товаров</span>'),
    (r'<span id=\"nav-label-gifts\">Подарки</span>', r'<span id="nav-label-gifts" data-i18n="nav_gifts">Подарки</span>'),
    (r'<span id=\"nav-label-usernames\">Ники</span>', r'<span id="nav-label-usernames" data-i18n="nav_usernames">Ники</span>'),
    (r'<span id=\"nav-label-numbers\">Номера</span>', r'<span id="nav-label-numbers" data-i18n="nav_numbers">Номера</span>'),
    (r'<span id=\"nav-label-friends\">Друзья</span>', r'<span id="nav-label-friends" data-i18n="nav_friends">Друзья</span>'),
    (r'<span id=\"nav-label-profile\">Профиль</span>', r'<span id="nav-label-profile" data-i18n="nav_profile">Профиль</span>'),
    
    # Friends Tab
    (r'Доступный баланс</div>', r'<span data-i18n="friends_balance">Доступный баланс</span></div>'),
    (r'>Вывести\s*средства</button>', r' data-i18n="friends_withdraw">Вывести средства</button>'),
    (r'>\s*Пригласить друзей\s*</button>', r' data-i18n="friends_invite">\n                Пригласить друзей\n            </button>'),
    (r'За каждую аренду твоего друга мы выплачиваем\s*тебе бонус <b>25%</b>! 💸</div>', r'<span data-i18n="friends_bonus_text">За каждую аренду твоего друга мы выплачиваем тебе бонус <b>25%</b>! 💸</span></div>'),
    (r'>Сколько\s*это\?</button>', r' data-i18n="friends_how_much">Сколько это?</button>'),
    (r'<span id=\"friends-list-title\">Мои друзья</span>', r'<span id="friends-list-title" data-i18n="friends_list_title">Мои друзья</span>'),
    (r'У вас пока нет друзей в системе\.<br>', r'<span data-i18n="friends_empty_1">У вас пока нет друзей в системе.</span><br>'),
    (r'Поделитесь ссылкой,\s*чтобы начать зарабатывать!</span>', r'<span data-i18n="friends_empty_2">Поделитесь ссылкой, чтобы начать зарабатывать!</span></span>'),
    
    # Earnings Help
    (r'<h3>Бонусная программа</h3>', r'<h3 data-i18n="earnings_title">Бонусная программа</h3>'),
    (r'За каждую аренду твоего друга мы выплачиваем тебе бонус — <b style=\"color: #fff;\">25%</b> от суммы\s*нашей комиссии! 💸', r'<span data-i18n="earnings_desc">За каждую аренду твоего друга мы выплачиваем тебе бонус — <b style="color: #fff;">25%</b> от суммы нашей комиссии! 💸</span>'),
    (r'<th style=\"text-align: left; padding: 14px; color: #8b9bb4;\">Цена аренды</th>', r'<th style="text-align: left; padding: 14px; color: #8b9bb4;" data-i18n="earnings_th_price">Цена аренды</th>'),
    (r'<th style=\"text-align: right; padding: 14px; color: #8b9bb4;\">Ваш доход</th>', r'<th style="text-align: right; padding: 14px; color: #8b9bb4;" data-i18n="earnings_th_income">Ваш доход</th>'),
    (r'<span>Рекомендуй OctoRent друзьям и получай пассивный доход <b>25%</b> с каждой их аренды!</span>', r'<span data-i18n="earnings_footer">Рекомендуй OctoRent друзьям и получай пассивный доход <b>25%</b> с каждой их аренды!</span>'),
    (r'onclick=\"closeEarningsHelp\(\)\">Понятно</button>', r'onclick="closeEarningsHelp()" data-i18n="earnings_ok">Понятно</button>'),
    
    # Language / Wallet Drawers
    (r'<h3>Выберите язык / Select Language</h3>', r'<h3 data-i18n="lang_title">Выберите язык / Select Language</h3>'),
    (r'<h3 id=\"wallet-drawer-title\">Управление кошельком</h3>', r'<h3 id="wallet-drawer-title" data-i18n="wallet_drawer_title">Управление кошельком</h3>'),
    (r'<span id=\"label-copy-address\" class=\"drawer-text\">Копировать адрес</span>', r'<span id="label-copy-address" class="drawer-text" data-i18n="copy_address">Копировать адрес</span>'),
    (r'<span id=\"label-disconnect-wallet\" class=\"drawer-text\" style=\"color:#FF3B30;\">Отключить\s*кошелек</span>', r'<span id="label-disconnect-wallet" class="drawer-text" style="color:#FF3B30;" data-i18n="disconnect_wallet">Отключить кошелек</span>'),
]

new_text = text
for pattern, repl, *opts in replacements:
    new_text = re.sub(pattern, repl, new_text, flags=opts[0] if opts else 0)

with codecs.open(r'c:\arenda bot\web\index.html', 'w', 'utf-8') as f:
    f.write(new_text)

print('Replaced HTML.')
