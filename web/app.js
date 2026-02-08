// Consts
let tg = null;
const MY_MARKUP = 0.20;
const OWNER_WALLET = "UQBxgCx_WJ4_fKgz8tec73NZadhoDzV250-Y0taVPJstZsRl";
const MANIFEST_URL = "https://klochkonazar2014-prog.github.io/tg-reseller-webapp/web/tonconnect-manifest.json";

// 🚀 Dynamic Backend Detection
const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const BACKEND_URL = "https://beta-weights-specially-throw.trycloudflare.com"; // Cloudflare Tunnel URL
console.log("Using backend:", BACKEND_URL);

let tonConnectUI;
let ALL_MARKET_ITEMS = [];
let RENDERED_COUNT = 0;
let BATCH_SIZE = 30; // Better for mobile grid
let IS_LOADING = false;
let GLOBAL_OFFSET = 0;
let HAS_MORE = true;
let CURRENT_TYPE = 'gift'; // Default: gifts
let CURRENT_STATUS = 'available'; // available, rented
let GLOBAL_TON_PRICE = 0;
let FRIENDLY_ADDR_CACHE = {};
let COUNTDOWN_INTERVALS = {};

/**
 * Converts Raw address (0:hex) to User-Friendly Non-bounceable (UQ...)
 */
function convertToUQ(raw) {
    if (!raw || !raw.includes(':')) return raw;
    if (FRIENDLY_ADDR_CACHE[raw]) return FRIENDLY_ADDR_CACHE[raw];
    try {
        const parts = raw.split(':');
        const workchain = parseInt(parts[0]);
        const hex = parts[1];
        const bytes = new Uint8Array(hex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));

        const addrBytes = new Uint8Array(36);
        addrBytes[0] = 0x51; // Non-bounceable
        addrBytes[1] = (workchain & 0xFF);
        addrBytes.set(bytes, 2);

        let crc = 0;
        for (let i = 0; i < 34; i++) {
            crc ^= (addrBytes[i] << 8);
            for (let j = 0; j < 8; j++) {
                if (crc & 0x8000) crc = ((crc << 1) ^ 0x1021) & 0xFFFF;
                else crc = (crc << 1) & 0xFFFF;
            }
        }
        addrBytes[34] = (crc >> 8) & 0xFF;
        addrBytes[35] = crc & 0xFF;

        let binary = '';
        for (let i = 0; i < 36; i++) binary += String.fromCharCode(addrBytes[i]);
        const res = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_'); // Base64URL
        FRIENDLY_ADDR_CACHE[raw] = res;
        return res;
    } catch (e) {
        console.error("UQ conversion failed:", e);
        return raw;
    }
}

const isBadUrl = (url) => {
    if (!url) return true;
    const u = String(url).toLowerCase();
    return u.includes('ton_symbol.png') || u.includes('gift.svg');
};

const TRANSLATIONS = {
    ru: {
        gifts: "Подарки",
        usernames: "Ники",
        numbers: "Номера",
        rented_tab: "Арендовано",
        profile: "Профиль",
        search: "Поиск",
        no_items: "Ничего не найдено",
        reset_filters: "Попробуйте сбросить фильтры",
        price_per_day: "Цена в день",
        period: "Срок (дни)",
        discount: "Скидка",
        days: "Дни",
        rent: "Арендовать",
        rent_days: "Аренда на {min}–{max} дн.",
        per_day: "В день",
        min_price: "Мин. цена",
        you_will_send: "Вы дополнительно отправите {amount} TON для обработки транзакции. Остаток TON будет возвращен вам.",
        processing: "Подключение...",
        success_tc: "Успешно! Теперь вернитесь на Fragment и нажмите Display in Telegram.",
        tc_link_placeholder: "Вставьте tc:// ссылку с Fragment",
        rarity: "Редкость",
        model: "Модель",
        symbol: "Символ",
        backdrop: "Фон",
        copy_success: "Скопировано",
        lang_ru: "Русский",
        lang_en: "English",
        what_is_this: "Что это значит?",
        settings_support: "Настройки и поддержка",
        profile_settings: "Настройки и поддержка",
        rental_history: "История аренды",
        profile_history: "История аренды",
        support_faq: "Поддержка и FAQ",
        profile_support: "Поддержка и FAQ",
        wallet_mgmt: "Управление кошельком",
        profile_wallet: "Кошелек",
        connect_wallet: "Подключить",
        connect_wallet_full: "Подключить кошелек",
        connected: "Подключено",
        details: "Детали",
        owner: "Владелец",
        address: "Адрес",
        auto_relist: "Авто-перевыставление",
        auto_relist_desc: "Этот NFT будет автоматически доступен для аренды после окончания срока.",
        rent_button: "Арендовать за {amount}",
        rent_for: "Арендовать за",
        preorder_for: "Забронировать за",
        loading: "Загрузка...",
        filters: "Фильтры",
        gift_number: "Номер подарка",
        sort_by: "Сортировка",
        price: "Цена",
        from: "От",
        to: "До",
        clear_all: "Очистить все",
        show_results: "Показать результаты",
        search_hint: "Поиск...",
        history_empty: "История пуста",
        invalid_tc_link: "Пожалуйста, вставьте корректную ссылку tc:// с Fragment",
        status_pending: "Ожидает оплату",
        status_rented: "Ожидает ссылку",
        just_now: "Только что",
        hours_ago: "ч. назад",
        what_is_this_long: "Вы отправляете небольшую сумму TON для покрытия комиссии сети и работы сервиса. Остаток будет возвращен вам автоматически.",
        wallet_mgmt: "Управление кошельком",
        copy_address: "Копировать адрес",
        disconnect_wallet: "Отключить кошелек",
        all: "Все",
        select_all: "Выбрать все",
        select_collection_first: "Выберите NFT коллекцию, чтобы увидеть список моделей.",
        search_filter_hint: "Поиск {label}...",
        search_filter_global: " (Все NFT)",
        sort_price_asc: "Цена (По возрастанию)",
        sort_price_desc: "Цена (По убыванию)",
        sort_num_asc: "Номер (По возрастанию)",
        sort_num_desc: "Номер (По убыванию)",
        sort_model_rare: "Редкость модели",
        sort_bg_rare: "Редкость фона",
        sort_symbol_rare: "Редкость символа",
        error_insufficient_funds: "Недостаточно средств на кошельке для совершения транзакции.",
        available_from: "Освободится",
        preorder_warning_no_relist: "Внимание: у этого NFT выключен авто-перевыставление. Предзаказ может не сработать, если владелец не выставит его вручную.",
        mode_rent_btn: "Каталог арендованных товаров",
        mode_shop_btn: "Каталог доступных для аренды товаров",
        loading_to_rent: "Загрузка каталога арендованных товаров...",
        loading_to_shop: "Загрузка каталога доступных для аренды товаров...",
        rent_title_suffix: " (Аренда)",
        auto_relist_label: "Авто-перевыставление",
        yes: "Да",
        no: "Нет",
        rented_by_you: "Арендовано вами",
        rented_by_others: "Арендовано",
        status_awaiting_fragment: "Ожидает подключения к Fragment",
        connect_to_fragment: "Подключить к Fragment",
        ends_in: "Освободится через",
        days_label: "Дни",
        day_label: "День",
        days_2_4: "Дня"
    },
    en: {
        gifts: "Gifts",
        usernames: "Usernames",
        numbers: "Numbers",
        rented_tab: "Rented",
        profile: "Profile",
        search: "Search",
        no_items: "Nothing found",
        reset_filters: "Try resetting filters",
        price_per_day: "Price per day",
        period: "Period (Days)",
        discount: "Discount",
        days: "Days",
        rent: "Rent",
        rent_days: "Rent for {min}–{max} days",
        per_day: "Per day",
        min_price: "Min. price",
        you_will_send: "You will additionally send {amount} TON to process the transaction. Remain TON will be returned to you.",
        processing: "Connecting...",
        success_tc: "Success! Now go back to Fragment and click Display in Telegram.",
        tc_link_placeholder: "Paste tc:// link from Fragment",
        rarity: "Rarity",
        model: "Model",
        symbol: "Symbol",
        backdrop: "Backdrop",
        copy_success: "Copied",
        lang_ru: "Russian",
        lang_en: "English",
        what_is_this: "What does this mean?",
        settings_support: "Settings & Support",
        rental_history: "Rental History",
        support_faq: "Support & FAQ",
        wallet_mgmt: "Wallet Management",
        connect_wallet: "Connect",
        connect_wallet_full: "Connect Wallet",
        connected: "Connected",
        details: "Details",
        owner: "Owner",
        address: "Address",
        auto_relist: "Auto re-list",
        auto_relist_desc: "This NFT will be available for rent automatically after the period ends.",
        rent_button: "Rent for {amount}",
        loading: "Loading...",
        filters: "Filters",
        gift_number: "Gift Number",
        sort_by: "Sort by",
        price: "Price",
        from: "From",
        to: "To",
        clear_all: "Clear All",
        show_results: "Show Results",
        search_hint: "Search...",
        history_empty: "History is empty",
        invalid_tc_link: "Please paste a valid tc:// link from Fragment",
        status_pending: "Pending payment",
        status_rented: "Awaiting link",
        just_now: "Just now",
        hours_ago: "h ago",
        what_is_this_long: "You are sending a small amount of TON to cover network fees and service operations. The remainder will be returned to you automatically.",
        all: "All",
        select_all: "Select all",
        select_collection_first: "Select an NFT collection first to see models.",
        search_filter_hint: "Search {label}...",
        search_filter_global: " (All NFTs)",
        sort_price_asc: "Price (Low to High)",
        sort_price_desc: "Price (High to Low)",
        sort_num_asc: "Number (Low to High)",
        sort_num_desc: "Number (High to Low)",
        sort_model_rare: "Model Rarity",
        sort_bg_rare: "Backdrop Rarity",
        sort_symbol_rare: "Symbol Rarity",
        error_insufficient_funds: "Not enough funds in your wallet to complete the transaction.",
        available_from: "Available from",
        preorder: "Pre-order",
        preorder_for: "Pre-order",
        rented_tab: "Rented",
        auto_relist_label: "Auto-relist",
        yes: "Yes",
        no: "No",
        rented_by_you: "Rented by you",
        rented_by_others: "Rented",
        status_awaiting_fragment: "Awaiting Fragment connection",
        connect_to_fragment: "Connect to Fragment",
        ends_in: "Ends in",
        days_label: "Days",
        day_label: "Day",
        days_2_4: "Days"
    }
};

let CURRENT_LANG = localStorage.getItem('lang') || 'ru';
function t(key, data = {}) {
    let text = TRANSLATIONS[CURRENT_LANG][key] || key;
    for (const [k, v] of Object.entries(data)) {
        text = text.replace(`{${k}}`, v);
    }
    return text;
}
const copyToClipboard = (text) => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => {
            if (window.Telegram && window.Telegram.WebApp) {
                window.Telegram.WebApp.HapticFeedback.notificationOccurred('success');
            }
        }).catch(err => console.error('Copy failed', err));
    }
};
const renderTonAmount = (val) => `<span class="icon-before icon-ton tm-amount">${val}</span>`;
const renderTonAmountNoIcon = (val) => `<span class="tm-amount icon-ton" style="font-size:inherit;">${val}</span>`;

function truncateMiddle(str, maxLength = 9) {
    if (!str || str.length <= maxLength) return str;
    const isUser = str.startsWith('@');
    const source = isUser ? str.slice(1) : str;
    const limit = isUser ? maxLength - 1 : maxLength;
    if (source.length <= limit) return str;

    const charsToShow = limit - 3;
    const frontChars = Math.ceil(charsToShow / 2);
    const backChars = Math.floor(charsToShow / 2);
    const res = source.substr(0, frontChars) + '...' + source.substr(source.length - backChars);
    return isUser ? '@' + res : res;
}

let ATTR_STATS = { model: {}, bg: {}, symbol: {} };
let CURRENT_PAYMENT_ITEM = null;

// NEW: Visual mapping for premium look
const VISUAL_MAP = {
    bg: {
        'Amber': '#FFBF00', 'Red': '#FF3B30', 'Blue': '#007AFF', 'Green': '#34C759',
        'Gold': '#FFD700', 'Black': '#1a1a1a', 'White': '#FFFFFF', 'Purple': '#AF52DE',
        'Pink': '#FF2D55', 'Indigo': '#5856D6', 'Orange': '#FF9500', 'Cyan': '#32ADE6',
        'Aquamarine': '#7FFFD4', 'Azure Blue': '#007FFF', 'Battleship Grey': '#848482',
        'Berry': '#990f4b', 'Black Hole': '#0f0f0f', 'Blood Orange': '#CC1100',
        'Brown': '#964B00', 'Bubblegum': '#FFC1CC', 'Burgundy': '#800020',
        'Candy Apple': '#FF0800', 'Charcoal': '#36454F', 'Chartreuse': '#7FFF00',
        'Cherry': '#DE3163', 'Chestnut': '#954535', 'Chocolate': '#7B3F00',
        'Cobalt': '#0047AB', 'Coral': '#FF7F50', 'Cream': '#FFFDD0',
        'Crimson': '#DC143C', 'Dark Blue': '#00008B', 'Dark Green': '#013220',
        'Deep Blue': '#00008B', 'Emerald': '#50C878', 'Forest': '#228B22',
        'Fuchsia': '#FF00FF', 'Grey': '#808080', 'Hot Pink': '#FF69B4',
        'Khaki': '#C3B091', 'Lavender': '#E6E6FA', 'Lemon': '#FFF700',
        'Light Blue': '#ADD8E6', 'Light Green': '#90EE90', 'Lilac': '#C8A2C8',
        'Lime': '#BFFF00', 'Magenta': '#FF00FF', 'Maroon': '#800000',
        'Midnight': '#191970', 'Mint': '#3EB489', 'Navy': '#000080',
        'Neon Blue': '#4D4DFF', 'Neon Green': '#39FF14', 'Olive': '#808000',
        'Peach': '#FFE5B4', 'Pearl': '#EAE0C8', 'Periwinkle': '#CCCCFF',
        'Pine': '#01796F', 'Plum': '#8E4585', 'Rose': '#FF007F',
        'Ruby': '#E0115F', 'Rust': '#B7410E', 'Salmon': '#FA8072',
        'Sapphire': '#0F52BA', 'Scarlet': '#FF2400', 'Seafoam': '#9FE2BF',
        'Silver': '#C0C0C0', 'Sky Blue': '#87CEEB', 'Slate': '#708090',
        'Smoke': '#738276', 'Steel': '#4682B4', 'Tan': '#D2B48C',
        'Teal': '#008080', 'Turquoise': '#40E0D0', 'Violet': '#8F00FF',
        'Yellow': '#FFFF00', 'Burnt Sienna': '#E97451', 'Camo Green': '#78866B',
        'Cappuccino': '#856D4D', 'Caramel': '#FFD59A', 'Carmine': '#960018',
        'Carrot Juice': '#F8931F', 'Celtic Blue': '#246BCE', 'Cobalt Blue': '#0047AB',
        'Copper': '#B87333', 'Coral Red': '#FF4040', 'Cyberpunk': '#F400A1',
        'Dark Lilac': '#9955BB', 'Deep Cyan': '#008B8B', 'Desert Sand': '#EDC9AF',
        'Electric Indigo': '#6F00FF', 'Electric Purple': '#BF00FF',
        'English Violet': '#563C5C', 'Fandango': '#B53389', 'Feldgrau': '#4D5D53',
        'Fire Engine': '#CE2029', 'French Blue': '#0072BB', 'French Violet': '#8806CE',
        'Grape': '#6F2DA8', 'Gunmetal': '#2A3439', 'Gunship Green': '#3C4039',
        'Hunter Green': '#355E3B', 'Indigo Dye': '#091F92', 'Ivory White': '#FFFFF0',
        'Jade Green': '#00A86B', 'Khaki Green': '#8A865D', 'Lemongrass': '#E1EDC9',
        'Light Olive': '#B8B35A', 'Malachite': '#0BDA51', 'Marine Blue': '#042E4C',
        'Mexican Pink': '#E4007C', 'Midnight Blue': '#191970', 'Mint Green': '#98FF98',
        'Moonstone': '#3AA8C1', 'Mustard': '#FFDB58', 'Mystic Pearl': '#D6CFC7',
        'Navy Blue': '#000080', 'Old Gold': '#CFB53B', 'Onyx Black': '#353839',
        'Pacific Cyan': '#00BDBB', 'Pacific Green': '#009774', 'Persimmon': '#EC5800',
        'Pine Green': '#01796F', 'Pistachio': '#93C572', 'Platinum': '#E5E4E2',
        'Pure Gold': '#F6C700', 'Ranger Green': '#334D41', 'Raspberry': '#E30B5D',
        'Rifle Green': '#444C38', 'Roman Silver': '#838996', 'Rosewood': '#65000B',
        'Seal Brown': '#321414', 'Shamrock Green': '#009E60', 'Silver Blue': '#8C9BB0',
        'Steel Grey': '#71797E', 'Strawberry': '#FC5A8D', 'Tactical Pine': '#2E4C3D',
        'Tomato': '#FF6347'
    },
    symbol: {
        'Candle': 'https://raw.githubusercontent.com/ton-blockchain/token-logos/main/nft/gift/candle.svg',
        'Heart': 'https://raw.githubusercontent.com/ton-blockchain/token-logos/main/nft/gift/heart.svg',
        'Star': 'https://raw.githubusercontent.com/ton-blockchain/token-logos/main/nft/gift/star.svg'
    }
};

const TG_ASSETS_URL = "https://telegifter.ru/wp-content/themes/gifts/assets/img/gifts";

const TG_SLUGS = ["berrybox", "artisanbrick", "prettyposy", "alphadogs", "voodoodoll", "ducks", "frog", "moneypot", "sparkler", "watch", "flower", "heart", "egg", "pear", "cocktail", "cactus", "jellyfish", "turtle", "gem", "gift", "box", "pot", "shard", "b-daycandle", "happybrownie", "astralshard", "kissedfrog", "plushpepe"];

const SLUG_MAPPING = {
    'artisanbricks': 'artisanbrick',
    'berryboxes': 'berrybox',
    'happybday': 'b-daycandle',
    'bdaycandle': 'b-daycandle',
    'thebackyard': 'alphadogs',
    'prettyposies': 'prettyposy',
    'astralshards': 'astralshard',
    'poop': 'happybrownie',
    'happybrownie': 'happybrownie',
    'kissedfrog': 'kissedfrog',
    'plushpepe': 'plushpepe',
    'ducks': 'ducks',
    'eternalrose': 'eternalrose',
    'cloverpin': 'cloverpin',
    'whipcupcake': 'whipcupcake',
    'jellypuppy': 'jellypuppy',
    'magicmushroom': 'magicmushroom',
    'goldstar': 'goldstar',
    'khabibspapakha': 'khabibspapakha'
};

function getTelegifterUrl(type, name, collection, slugIndex = 0) {
    if (!name || name === 'Unknown' || name === 'Default' || name === 'Gift' || name === 'Gift #?') return null;
    const cleanName = encodeURIComponent(name);

    if (type === 'symbol') {
        return `${TG_ASSETS_URL}/symbol/${cleanName}.webp`;
    }

    if (type === 'nft') {
        return `${TG_ASSETS_URL}/noupdate/${cleanName}.webp`;
    }

    if (type === 'model') {
        // Use collection slug if available
        if (collection) {
            const raw = collection.toLowerCase().replace(/[^a-z0-9]/g, '');
            const slug = SLUG_MAPPING[raw] || raw;
            return `${TG_ASSETS_URL}/${slug}/${cleanName}.webp`;
        }
        // Fallback or generic path if no collection (but telegifter needs slug)
        // If we don't have collection, we can't guess folder. Return null to use local fallback.
        return null;
    }
    return null;
}

let ACTIVE_FILTERS = {
    nft: 'all',
    model: 'all',
    bg: 'all',
    symbol: 'all',
    tags: 'all',
    sort: 'id_desc',
    price_from: null,
    price_to: null,
    gift_number: null,
    search: ""
};

// --- Language logic ---
function switchLanguage(lang) {
    CURRENT_LANG = lang;
    localStorage.setItem('lang', lang);
    location.reload();
}

function updateUILanguage() {
    const map = {
        'search-input': t('search'),
        'nav-label-gifts': t('gifts'),
        'nav-label-usernames': t('usernames'),
        'nav-label-numbers': t('numbers'),
        'nav-label-profile': t('profile'),
        'view-label-wallet-mgmt': t('wallet_mgmt'),
        'view-label-settings-support': t('settings_support'),
        'view-label-history': t('rental_history'),
        'view-label-support': t('support_faq'),
        'view-label-lang': t('language_selector'),
        'blue-wallet-text': t('connect_wallet'),
        'header-wallet-connect-text': t('connect_wallet'),
        'mrkt-label-filters': t('filters'),
        'mrkt-label-gift-number': t('gift_number'),
        'mrkt-label-sort': t('sort_by'),
        'mrkt-label-price': t('price'),
        'mrkt-btn-reset': t('clear_all'),
        'mrkt-btn-apply': t('show_results'),
        'fee-notice-text': t('what_is_this_long'),
        'fee-what-mean': t('what_is_this'),
        'details-tab': t('details'),
        'listing-what-mean': t('what_is_this'),
        'view-owner-label': t('owner'),
        'view-address-label': t('address'),
        'view-storage-label': "Storage",
        'filter-gift-number': t('gift_number'),
        'filter-price-from': t('from'),
        'filter-price-to': t('to'),
        'filter-search-nft': t('search_hint'),
        'filter-search-model': t('search_hint'),
        'filter-search-bg': t('search_hint'),
        'filter-search-symbol': t('search_hint')
    };
    for (const [id, val] of Object.entries(map)) {
        const el = document.getElementById(id);
        if (el) {
            if (el.tagName === 'INPUT') el.placeholder = val;
            else el.innerText = val;
        }
    }
}

document.addEventListener("DOMContentLoaded", async () => {
    try {
        if (window.Telegram && window.Telegram.WebApp) {
            tg = window.Telegram.WebApp;
            tg.expand();
            tg.MainButton.hide();
        }
        updateUILanguage();

        // ⏳ Failsafe: Hide loader after 5s no matter what
        setTimeout(() => {
            const screen = document.getElementById('loading-screen');
            if (screen && screen.style.display !== 'none') {
                console.warn("Failsafe: Hiding loader after 5s timeout");
                screen.style.opacity = '0';
                setTimeout(() => screen.style.display = 'none', 500);
            }
        }, 5000);

        initTonConnect();
        loadProfileData(); // Call after initTonConnect
        loadFilterData();
        await loadLiveItems(true);

        // --- Deep Link handling ---
        const urlParams = new URLSearchParams(window.location.search);
        let deepNftAddr = urlParams.get('nft_address');

        // Support tgWebAppStartParam (from Direct Link)
        if (!deepNftAddr && tg.initDataUnsafe && tg.initDataUnsafe.start_param) {
            const startParam = tg.initDataUnsafe.start_param;
            if (startParam.startsWith('nft_')) {
                deepNftAddr = startParam.replace('nft_', '');
            }
        }
        if (deepNftAddr) {
            const match = ALL_MARKET_ITEMS.find(it => it.nft_address === deepNftAddr);
            if (match) {
                openProductView(match);
            } else {
                // If not in current catalog, try to fetch it specifically or alert
                fetch(`${BACKEND_URL}/api/nft_details?nft_address=${deepNftAddr}`)
                    .then(r => r.json())
                    .then(details => {
                        if (details && details.address) {
                            // Normalize details to match our item structure
                            const m = details.metadata || {};
                            const fakeItem = {
                                nft_address: details.address,
                                nft_name: details.name,
                                price_per_day: 0, // Will be updated by status check or remains 0
                                status: 'available',
                                type: 'gift',
                                metadata: JSON.stringify(m)
                            };
                            openProductView(fakeItem);
                        }
                    }).catch(e => console.error("Deep link fetch error:", e));
            }

            // FIX: Add click handler for product-view background
            const productView = document.getElementById('product-view');
            if (productView) {
                productView.addEventListener('click', function (e) {
                    // Close if clicking on product-view itself OR on elements with overflow-y-scroll
                    if (e.target.id === 'product-view' || e.target.classList.contains('product-view')) {
                        closeProductView();
                    }
                });
            }
        }

        document.getElementById('search-input').addEventListener('input', debounce((e) => {
            ACTIVE_FILTERS.search = e.target.value.toLowerCase();
            applyHeaderSearch();
        }, 500));

        // Block Zoom BUT allow scrolling
        document.addEventListener('touchstart', (e) => {
            if (e.touches.length > 1) e.preventDefault();
        }, { passive: false });

        // Prevent double tap zoom
        let lastTouchEnd = 0;
        document.addEventListener('touchend', (e) => {
            const now = Date.now();
            if (now - lastTouchEnd <= 300) {
                // Check if target is scrollable or input
                if (!e.target.closest('.chips-row') && !e.target.closest('input')) {
                    // e.preventDefault(); // Removed to avoid blocking clicks
                }
            }
            lastTouchEnd = now;
        }, false);

        window.addEventListener('wheel', (e) => { if (e.ctrlKey) e.preventDefault(); }, { passive: false });
        window.addEventListener('keydown', (e) => {
            if (e.ctrlKey && (e.key === '=' || e.key === '-' || e.key === '+' || e.key === '0')) e.preventDefault();
        });

        // Tab Navigation
        document.querySelectorAll('.nav-item').forEach((item, index) => {
            item.onclick = () => {
                document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
                item.classList.add('active');
                switchTab(index);
            };
        });

    } catch (e) { alert("Init Error: " + e.message); }
});

function switchTab(index) {
    // Indices: 0 = Gifts, 1 = Usernames, 2 = Numbers, 3 = Profile
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach((nav, i) => {
        nav.classList.toggle('active', i === index);
    });

    if (index < 3) { // Market tabs
        let newType = CURRENT_TYPE;
        if (index === 0) newType = 'gift';
        if (index === 1) newType = 'username';
        if (index === 2) newType = 'number';

        if (CURRENT_TYPE !== newType) {
            CURRENT_TYPE = newType;
            loadLiveItems(true);
            window.scrollTo({ top: 0, behavior: 'instant' });
        }

        document.getElementById('market-container').style.display = 'block';
        document.getElementById('profile-container').style.display = 'none';
        document.getElementById('mode-toggle-container').style.display = 'block';

        const headerTitle = document.querySelector('.header h1') || document.querySelector('.logo-text');
        if (headerTitle) {
            let baseTitle = t('gifts');
            if (index === 1) baseTitle = t('usernames');
            if (index === 2) baseTitle = t('numbers');
            headerTitle.innerText = baseTitle + (CURRENT_STATUS === 'rented' ? t('rent_title_suffix') : '');
        }

        // FIX: Removed - was hiding nav
        // document.body.classList.remove('profile-active');
    } else { // Profile tab
        document.getElementById('market-container').style.display = 'none';
        document.getElementById('profile-container').style.display = 'block';
        document.getElementById('mode-toggle-container').style.display = 'none';

        const headerTitle = document.querySelector('.header h1') || document.querySelector('.logo-text');
        if (headerTitle) headerTitle.innerText = t('profile');
        if (window.Telegram && window.Telegram.WebApp) {
            tg.HapticFeedback.impactOccurred('medium');
        }

        // FIX: Nav should always be visible
        // document.body.classList.add('profile-active');
        const bNav = document.querySelector('.bottom-nav');
        if (bNav) bNav.classList.add('profile-mode');
    }

    // NEW: Filter visibility logic
    if (index === 1 || index === 2) { // Usernames or Numbers
        document.body.classList.add('hide-filters');
    } else {
        document.body.classList.remove('hide-filters');
    }

    if (index !== 3) {
        const bNav = document.querySelector('.bottom-nav');
        if (bNav) bNav.classList.remove('profile-mode');
    }
}

// Obsolete loadUserOrders removed as tab is gone.
function loadUserOrders() {
    // No-op 
}

// --- Modal Logic ---


// --- Help Modal Logic ---
function showHelp(amount) {
    const title = document.getElementById('help-title');
    const body = document.getElementById('help-body');

    title.innerText = t('what_is_this');
    body.innerHTML = `
        <div style="font-weight:700; color:#fff; margin-bottom:10px;">${t('you_will_send', { amount: amount })}</div>
    `;

    document.getElementById('help-modal-overlay').classList.add('active');
    document.getElementById('help-modal').classList.add('active');
}

function closeHelpModal() {
    document.getElementById('help-modal-overlay').classList.remove('active');
    document.getElementById('help-modal').classList.remove('active');
}

function closeTcModal() {
    document.getElementById('tc-modal-overlay').classList.remove('active');
    document.getElementById('tc-modal').classList.remove('active');
}
async function submitTcLink() {
    const orderId = document.getElementById('tc-current-order-id').value;
    const link = document.getElementById('tc-link-input').value.trim();
    const btn = document.querySelector('#tc-modal .btn-yellow');
    const originalText = btn.innerText;

    if (!link.startsWith('tc://')) {
        tg.showAlert(t('invalid_tc_link'));
        return;
    }

    btn.innerText = t('processing');
    btn.disabled = true;

    console.log("SubmitTC: OrderID=" + orderId + ", Link=" + link);
    if (!orderId) {
        alert("Ошибка: ID заказа не найден. Перезагрузите страницу.");
        btn.innerText = originalText;
        btn.disabled = false;
        return;
    }

    try {
        const url = `${BACKEND_URL}/api/submit_tc_link`;
        console.log("Fetching: " + url);
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ order_id: parseInt(orderId), tc_link: link })
        });

        console.log("Response status: " + res.status);
        const data = await res.json();
        console.log("Response data:", data);

        if (data.status === 'ok') {
            if (window.Telegram && window.Telegram.WebApp) {
                tg.showAlert("Успешно! Теперь вернитесь на Fragment и нажмите Display in Telegram.");
            } else {
                alert("Успешно! Теперь вернитесь на Fragment и нажмите Display in Telegram.");
            }
            document.getElementById('tc-link-input').value = "";
            closeTcModal();
            loadHistoryContent();
        } else {
            throw new Error(data.error || "Ошибка сервера");
        }
    } catch (e) {
        console.error("SubmitTC Error:", e);
        if (window.Telegram && window.Telegram.WebApp) {
            tg.showAlert("Ошибка: " + e.message);
        } else {
            alert("Ошибка: " + e.message);
        }
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
    }
}

async function toggleCatalogMode() {
    const loader = document.getElementById('global-mode-loader');
    const loaderText = document.getElementById('global-loader-text');
    const toggleBtnText = document.getElementById('mode-toggle-text');
    const toggleBtn = document.getElementById('mode-toggle-btn');

    if (CURRENT_STATUS === 'available') {
        CURRENT_STATUS = 'rented';
        loaderText.innerText = t('loading_to_rent');
        toggleBtnText.innerText = t('mode_shop_btn');
        toggleBtn.classList.add('rental');
    } else {
        CURRENT_STATUS = 'available';
        loaderText.innerText = t('loading_to_shop');
        toggleBtnText.innerText = t('mode_rent_btn');
        toggleBtn.classList.remove('rental');
    }

    loader.style.display = 'flex';
    if (window.Telegram && window.Telegram.WebApp) {
        tg.HapticFeedback.notificationOccurred('success');
    }

    // Refresh items
    await loadLiveItems(true);

    // Update header title based on current category
    const activeNav = document.querySelector('.nav-item.active');
    const navItems = Array.from(document.querySelectorAll('.nav-item'));
    const index = navItems.indexOf(activeNav);

    const headerTitle = document.querySelector('.header h1') || document.querySelector('.logo-text');
    if (headerTitle && index < 3) {
        let baseTitle = t('gifts');
        if (index === 1) baseTitle = t('usernames');
        if (index === 2) baseTitle = t('numbers');
        headerTitle.innerText = baseTitle + (CURRENT_STATUS === 'rented' ? t('rent_title_suffix') : '');
    }

    setTimeout(() => {
        loader.style.opacity = '0';
        setTimeout(() => {
            loader.style.display = 'none';
            loader.style.opacity = '1';
        }, 300);
    }, 500);
}

async function loadLiveItems(reset = true) {
    if (IS_LOADING) return;
    if (!HAS_MORE && !reset) return;

    const hideLoading = () => {
        const screen = document.getElementById('loading-screen');
        if (screen) {
            screen.style.opacity = '0';
            setTimeout(() => screen.style.display = 'none', 500);
        }
    };

    const topLoader = document.getElementById('top-loader');
    const scrollLoader = document.getElementById('scroll-loader');

    if (reset) {
        GLOBAL_OFFSET = 0;
        HAS_MORE = true;
        document.getElementById('items-view').innerHTML = '';
        if (topLoader) topLoader.style.display = 'block';
        window.scrollTo({ top: 0, behavior: 'instant' });
    } else {
        if (scrollLoader) scrollLoader.style.display = 'block';
    }

    IS_LOADING = true;

    try {
        const params = new URLSearchParams({
            limit: BATCH_SIZE,
            offset: GLOBAL_OFFSET,
            type: CURRENT_TYPE,
            status: CURRENT_STATUS,
            nft: ACTIVE_FILTERS.nft,
            model: ACTIVE_FILTERS.model,
            bg: ACTIVE_FILTERS.bg,
            symbol: ACTIVE_FILTERS.symbol,
            sort: ACTIVE_FILTERS.sort,
            search: ACTIVE_FILTERS.search,
            price_from: ACTIVE_FILTERS.price_from || "",
            price_to: ACTIVE_FILTERS.price_to || "",
            gift_number: ACTIVE_FILTERS.gift_number || "",
            t: Date.now()
        });

        let response;
        let retries = 3;
        while (retries > 0) {
            try {
                response = await fetch(`${BACKEND_URL}/api/items?${params.toString()}`);
                if (response.ok) break;
            } catch (err) {
                console.error(`Fetch attempt failed (${retries} retries left):`, err);
            }
            retries--;
            if (retries > 0) await new Promise(r => setTimeout(r, 1000));
        }

        if (!response || !response.ok) {
            throw new Error(`Server status: ${response ? response.status : 'Network Error'}`);
        }

        const data = await response.json();

        if (data && data.items) {
            const items = data.items;
            if (items.length < BATCH_SIZE) HAS_MORE = false;
            GLOBAL_OFFSET += items.length;

            const processed = items
                .filter(item => item.type === CURRENT_TYPE) // Strict client-side type check
                .map(item => {
                    const match = item.nft_name.match(/#(\d+)/);
                    item._nftNum = match ? parseInt(match[1]) : 0;
                    item._realImage = item.image || item.image_url;
                    return item;
                });

            if (reset && items.length === 0) {
                document.getElementById('items-view').innerHTML = `
                    <div class="error-msg" style="padding-top: 100px; text-align:center;">
                        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color: #333; margin-bottom: 20px;">
                            <circle cx="12" cy="12" r="10"></circle>
                            <line x1="8" y1="12" x2="16" y2="12"></line>
                        </svg>
                        <div style="font-size: 18px; font-weight: 700; color: #fff;">${t('no_items')}</div>
                        <div style="color: #8b9bb4; margin-top: 8px;">${t('reset_filters')}</div>
                    </div>`;
            } else {
                renderItemsBatch(processed);
            }

            if (reset) initFilterLists();
        }

        if (document.getElementById('top-loader')) document.getElementById('top-loader').style.display = 'none';
        if (document.getElementById('scroll-loader')) document.getElementById('scroll-loader').style.display = 'none';
        hideLoading();
    } catch (e) {
        console.error("Load Error details:", e);
        if (reset && document.getElementById('top-loader')) document.getElementById('top-loader').innerText = "Ошибка соединения с сервером. Показываем демо-данные.";

        // --- 🧪 DEV/DEMO FALLBACK: Inject mock data if backend is dead ---
        if (reset) {
            console.log("Backend unreachable. Injecting demo cards for UI testing.");
            const demoItems = [
                {
                    id: 9993, type: 'gift', nft_name: 'Premium Gift #001',
                    price_per_day: '5.00', min_duration: 86400, max_duration: 86400,
                    image: 'https://nft.fragment.com/gift/voodoodoll-1.webp',
                    _realImage: 'https://nft.fragment.com/gift/voodoodoll-1.webp',
                    _collection: { name: 'Gifts' }
                },
                {
                    id: 9991, type: 'gift', nft_name: 'Mighty Arm #2006',
                    price_per_day: '1.25', min_duration: 86400, max_duration: 86400,
                    image: 'https://nft.fragment.com/gift/mightyarm-2006.webp',
                    _realImage: 'https://nft.fragment.com/gift/mightyarm-2006.webp',
                    _collection: { name: 'Gifts' }
                },
                {
                    id: 9992, type: 'gift', nft_name: 'Plush Pepe #302',
                    price_per_day: '0.50', min_duration: 86400, max_duration: 604800,
                    image: 'https://nft.fragment.com/gift/plushpepe-302.webp',
                    _realImage: 'https://nft.fragment.com/gift/plushpepe-302.webp',
                    _collection: { name: 'Gifts' }
                }
            ];
            renderItemsBatch(demoItems);
        }

        if (document.getElementById('top-loader')) document.getElementById('top-loader').style.display = 'none';
        if (document.getElementById('scroll-loader')) document.getElementById('scroll-loader').style.display = 'none';

        hideLoading();
    } finally {
        IS_LOADING = false;
    }
}



function selectNftChip(addr, btn) {
    ACTIVE_FILTERS.nft = addr;
    document.querySelectorAll('.chip-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    loadLiveItems(true); // Trigger server-side refresh
}

async function loadFilterData() {
    try {
        console.log('[FILTERS] Loading from:', `${BACKEND_URL}/api/filters`);
        const res = await fetch(`${BACKEND_URL}/api/filters`);
        const data = await res.json();
        console.log('[FILTERS] Received keys:', Object.keys(data));
        window.FILTERS_CACHE = data;

        if (data) {
            // NFTs = collections
            if (data.nfts && Array.isArray(data.nfts)) {
                window.STATIC_COLLECTIONS = data.nfts.map(name => {
                    // Try to get official collection image from TonAPI if address is available
                    let img = null;
                    if (data.nft_addresses && data.nft_addresses[name]) {
                        img = `https://cache.tonapi.io/img/collection/${data.nft_addresses[name]}/image.png?size=256`;
                    }

                    // Fallback to fragment if TonAPI addr is missing
                    if (!img) {
                        let singular = name;
                        if (name.endsWith('s') && name.length > 4) singular = name.slice(0, -1);
                        const f = generateFragmentUrls(singular + " #1", 0);
                        img = f.image;
                    }
                    return { name, image: img };
                });
            }

            // Convert array backdrops/symbols to nested format {collectionName: [{name, image}]}
            const convertArrayToMap = (arr) => {
                if (!Array.isArray(arr)) return {};
                const items = arr.map(name => ({ name, image: null }));
                return { "ALL": items }; // Group all under "ALL" pseudo-collection
            };

            // Models_map: already in correct format {collection: [model1, model2]}
            // But need to convert model strings to objects {name, image}
            const convertModelsMap = (map) => {
                if (!map || typeof map !== 'object') return {};
                const result = {};
                for (const [collection, models] of Object.entries(map)) {
                    if (Array.isArray(models)) {
                        result[collection] = models.map(name => ({ name, image: null }));
                    }
                }
                return result;
            };

            ATTR_STATS = {
                model: data.models_map ? convertModelsMap(data.models_map) : {},
                bg: data.backdrops ? convertArrayToMap(data.backdrops) : {},
                symbol: data.symbols ? convertArrayToMap(data.symbols) : {}
            };

            console.log('[FILTERS] Loaded successfully:', {
                collections: window.STATIC_COLLECTIONS?.length || 0,
                model_collections: Object.keys(ATTR_STATS.model).length,
                total_models: Object.values(ATTR_STATS.model).reduce((sum, arr) => sum + arr.length, 0),
                backdrops: data.backdrops?.length || 0,
                symbols: data.symbols?.length || 0
            });
            initFilterLists();
        }
    } catch (e) {
        console.error("Filter Load Error:", e);
    }
}

function initTonConnect() {
    tonConnectUI = new TON_CONNECT_UI.TonConnectUI({
        manifestUrl: MANIFEST_URL,
        uiOptions: {
            twaReturnUrl: 'https://t.me/ArendaLend_bot/app',
            modalZIndex: 10000,
            uiPreferences: {
                theme: 'dark'
            }
        }
    });

    // Register listener immediately after initialization
    tonConnectUI.onStatusChange(wallet => {
        console.log('Wallet status changed:', wallet);
        updateWalletBtnState();
    });

    // Initial check to update button text if already connected
    updateWalletBtnState();
}

// --- Accordions logic ---
function toggleAccordion(id, btn) {
    const content = document.getElementById(id);
    const isActive = content.classList.contains('active');

    // Close others
    document.querySelectorAll('.accordion-content').forEach(c => c.classList.remove('active'));
    document.querySelectorAll('.filter-accordion').forEach(b => b.classList.remove('active'));

    if (!isActive) {
        content.classList.add('active');
        btn.classList.add('active');
    }
}

function filterList(key) {
    initFilterLists();
}

function toggleGenericModal(key) {
    openAdvancedFilters();
    const accMap = {
        'nft': 'nft-acc',
        'model': 'model-acc',
        'bg': 'bg-acc',
        'symbol': 'symbol-acc'
    };

    // Ensure data is loaded
    if (!window.STATIC_COLLECTIONS || window.STATIC_COLLECTIONS.length === 0) {
        loadFilterData();
    }

    const targetId = accMap[key];
    if (targetId) {
        const btn = document.querySelector(`.filter-accordion[onclick*="${targetId}"]`);
        toggleAccordion(targetId, btn);
    }
}

function initFilterLists() {
    const sortCont = document.getElementById('sort-list-container');
    const sorts = [
        { id: 'price_asc', n: t('sort_price_asc') },
        { id: 'price_desc', n: t('sort_price_desc') },
        { id: 'num_asc', n: t('sort_num_asc') },
        { id: 'num_desc', n: t('sort_num_desc') },
        { id: 'model_rare', n: t('sort_model_rare') },
        { id: 'bg_rare', n: t('sort_bg_rare') },
        { id: 'symbol_rare', n: t('sort_symbol_rare') }
    ];
    sortCont.innerHTML = '';
    sorts.forEach(s => addFilterItem(sortCont, s.n, s.id, 'sort', ACTIVE_FILTERS.sort === s.id));

    const nftCont = document.getElementById('nft-list-container');
    const nftSearch = document.getElementById('filter-search-nft').value.toLowerCase();
    nftCont.innerHTML = '';

    if (!nftSearch || t('all').toLowerCase().includes(nftSearch)) {
        addFilterItem(nftCont, t('all'), "all", 'nft', ACTIVE_FILTERS.nft === 'all');
    }

    (window.STATIC_COLLECTIONS || []).forEach(col => {
        if (col.name.toLowerCase().includes(nftSearch)) {
            addFilterItem(nftCont, col.name, col.name, 'nft', ACTIVE_FILTERS.nft === col.name, col.image);
        }
    });

    const maps = [
        { id: 'model-list-container', key: 'model', search: 'filter-search-model', label: t('model').toLowerCase() },
        { id: 'bg-list-container', key: 'bg', search: 'filter-search-bg', label: t('backdrop').toLowerCase() },
        { id: 'symbol-list-container', key: 'symbol', search: 'filter-search-symbol', label: t('symbol').toLowerCase() }
    ];

    const selectedNFT = ACTIVE_FILTERS.nft;

    maps.forEach(m => {
        const cont = document.getElementById(m.id);
        const sInput = document.getElementById(m.search);
        if (!cont || !sInput) return;
        const sVal = sInput.value.toLowerCase();
        cont.innerHTML = '';

        if (selectedNFT === 'all') {
            // MODELS: Require NFT selection first
            if (m.key === 'model') {
                cont.innerHTML = `<div style="padding:20px; color:#8b9bb4; text-align:center; font-size:13px; background:rgba(255,255,255,0.03); border-radius:12px; margin-top:10px;">${t('select_collection_first')}</div>`;
                sInput.disabled = true;
                return;
            }

            // BG & SYMBOLS: Global selection allowed
            const allItemsMap = {};
            // Iterate OVER COLLECTIONS to preserve context
            Object.entries(ATTR_STATS[m.key] || {}).forEach(([colName, list]) => {
                if (!Array.isArray(list)) return; // Safety check
                list.forEach(item => {
                    // Store image AND collection for URL generation
                    if (!allItemsMap[item.name]) {
                        allItemsMap[item.name] = { image: item.image, collection: colName };
                    }
                    else if (isBadUrl(allItemsMap[item.name].image) && !isBadUrl(item.image)) {
                        allItemsMap[item.name].image = item.image;
                        allItemsMap[item.name].collection = colName;
                    }
                });
            });
            const allItems = Object.entries(allItemsMap)
                .map(([n, data]) => ({ name: n, image: data.image, collection: data.collection }))
                .sort((a, b) => a.name.localeCompare(b.name));

            sInput.disabled = false;
            sInput.placeholder = t('search_filter_hint', { label: m.label }) + t('search_filter_global');

            if (!sVal || t('select_all').toLowerCase().includes(sVal)) {
                addFilterItem(cont, t('select_all'), "all", m.key, ACTIVE_FILTERS[m.key] === 'all');
            }

            allItems.forEach(item => {
                if (item.name.toLowerCase().includes(sVal)) {
                    // Try to get clean visual first
                    let visual = null;
                    if (m.key === 'symbol') visual = getTelegifterUrl('symbol', item.name);
                    else if (m.key === 'model') visual = getTelegifterUrl('model', item.name, item.collection);

                    let icon = visual || item.image;
                    if (!icon && (m.key === 'bg' || m.key === 'symbol')) icon = VISUAL_MAP[m.key][item.name] || null;
                    // FIX: Pass item.collection as collectionContext
                    addFilterItem(cont, item.name, item.name, m.key, ACTIVE_FILTERS[m.key] === item.name, icon, item.collection, item.image);
                }
            });
            return;
        }

        sInput.disabled = false;
        sInput.placeholder = t('search_filter_hint', { label: m.label });

        if (!sVal || t('select_all').toLowerCase().includes(sVal)) {
            addFilterItem(cont, t('select_all'), "all", m.key, ACTIVE_FILTERS[m.key] === 'all');
        }

        const items = (ATTR_STATS[m.key] && ATTR_STATS[m.key][selectedNFT]) || [];
        items.forEach(item => {
            if (item.name.toLowerCase().includes(sVal)) {
                // Try clean visual
                let visual = null;
                if (m.key === 'symbol') visual = getTelegifterUrl('symbol', item.name);
                else if (m.key === 'model') visual = getTelegifterUrl('model', item.name, selectedNFT);

                let icon = visual || item.image;
                if (!icon && (m.key === 'bg' || m.key === 'symbol')) icon = VISUAL_MAP[m.key][item.name] || null;
                addFilterItem(cont, item.name, item.name, m.key, ACTIVE_FILTERS[m.key] === item.name, icon, selectedNFT, item.image);
            }
        });
    });
}

function addFilterItem(container, name, value, key, isSelected, imgUrl, collectionContext, fallbackImgUrl) {
    const div = document.createElement('div');
    div.className = `filter-list-item ${isSelected ? 'selected' : ''}`;

    const isAll = value === 'all';

    let visualHTML = '';
    if (isAll) {
        visualHTML = `<div style="width:52px; height:52px; border-radius:12px; background: linear-gradient(135deg, #2a2a2a, #1a1a1a); border: 1px solid rgba(255,255,255,0.1); display:flex; flex-direction:column; align-items:center; justify-content:center; position:relative; overflow:hidden;">
            <div style="font-size:10px; font-weight:900; color:#fff; letter-spacing:1px; z-index:2; font-family: 'Outfit', sans-serif;">ВСЕ</div>
            <div style="width:16px; height:2px; background: #0088cc; margin-top:4px; border-radius:1px; z-index:2;"></div>
            <div style="position:absolute; top:0; left:0; width:100%; height:100%; background: url('https://telegifter.ru/wp-content/themes/gifts/assets/img/bg-logo-mini.webp'); opacity:0.1; background-size: 20px;"></div>
        </div>`;
    } else if (key === 'symbol') {
        const tgSymbol = getTelegifterUrl('symbol', name);
        const iconSrc = tgSymbol || VISUAL_MAP.symbol[name];
        visualHTML = `<img src="${iconSrc}" class="filter-img" style="filter: brightness(0) invert(1); width:28px; height:28px; object-fit:contain;" onerror="this.style.display='none'">`;
    } else if (key === 'bg') {
        const bgStyle = VISUAL_MAP.bg[name] || '#333';
        visualHTML = `<div class="filter-color-circle" style="background: ${bgStyle}; position:relative; overflow:hidden; width:52px; height:52px; border-radius:12px;">
            <div style="position:absolute; top:0; left:0; width:100%; height:100%; background: url('https://telegifter.ru/wp-content/themes/gifts/assets/img/bg-logo-mini.webp'); opacity:0.3; background-size: 20px;"></div>
        </div>`;
    } else if (key === 'model' || key === 'nft' || (imgUrl && !isBadUrl(imgUrl))) {
        // CLEAN STRATEGY Phase 2:
        // 1. Models: Prefer local /models/ asset
        // 2. NFTs: Prefer TonAPI collection logo (extremely clean)
        let icon = imgUrl;
        if (key === 'model') {
            icon = getTelegifterUrl('model', name, collectionContext) || `/models/${name}.webp`;
        } else if (key === 'nft') {
            // CLEAN STRATEGY Phase 3: Prefer Telegifter for Collections too
            icon = getTelegifterUrl('nft', name);
            if (!icon && window.FILTERS_CACHE && window.FILTERS_CACHE.nft_addresses && window.FILTERS_CACHE.nft_addresses[name]) {
                const addr = window.FILTERS_CACHE.nft_addresses[name];
                icon = `https://cache.tonapi.io/img/collection/${addr}/image.png`;
            }
            else if (!icon || isBadUrl(icon)) {
                if (key === 'nft') {
                    let n = name;
                    if (n.endsWith('s') && n.length > 4) n = n.slice(0, -1);
                    const f = generateFragmentUrls(n + " #1", 0);
                    icon = f.image;
                }
            }

            visualHTML = `<div style="width:52px; height:52px; border-radius:12px; background: rgba(255, 255, 255, 0.05); border:1px solid rgba(255, 255, 255, 0.1); display:flex; align-items:center; justify-content:center; position:relative; overflow:hidden;">
            <img src="${icon}" class="filter-img" style="width:100%; height:100%; object-fit:contain; z-index:2; opacity:0; transition:opacity 0.2s; padding:7px;" 
                onload="this.style.opacity='1';"
                onerror="handleFilterImageError(this, '${name.replace(/'/g, "\\'")}', '${(collectionContext || '').replace(/'/g, "\\'")}', '${(fallbackImgUrl || '').replace(/'/g, "\\'")}', '${key}')">
        </div>`;
        } else {
            visualHTML = `<div style="width:52px; height:52px; border-radius:12px; background: rgba(255, 255, 255, 0.05); border:1px solid rgba(255, 255, 255, 0.1); display:flex; align-items:center; justify-content:center; position:relative; overflow:hidden;">
        </div>`;
        }
    }

    div.innerHTML = `
        <div class="filter-item-left" style="overflow: hidden;">
            ${visualHTML}
            <div style="display:flex; flex-direction:column; margin-left:14px; overflow: hidden;">
                <span class="filter-item-name">${name}</span>
            </div>
        </div>
        <div class="checkbox-box" style="flex-shrink:0; width:22px; height:22px; border-radius:6px; border:2px solid ${isSelected ? '#0088cc' : '#333'}; display:flex; align-items:center; justify-content:center; margin-left:10px;">
            ${isSelected ? '<div style="width:10px; height:10px; background:#0088cc; border-radius:2px;"></div>' : ''}
        </div>
    `;
    div.onclick = (e) => {
        e.stopPropagation();
        ACTIVE_FILTERS[key] = value ? value.trim() : value;

        // Reset sub-filters if collection changed
        if (key === 'nft') {
            ACTIVE_FILTERS.model = 'all';
            ACTIVE_FILTERS.bg = 'all';
            ACTIVE_FILTERS.symbol = 'all';
            // Also clear search inputs for sub-filters
            ['model', 'bg', 'symbol'].forEach(k => {
                const inp = document.getElementById(`filter-search-${k}`);
                if (inp) inp.value = '';
            });
        }

        initFilterLists();
        applyHeaderSearch();
    };
    container.appendChild(div);
}

function applyHeaderSearch() {
    loadLiveItems(true);
}


function createItemCard(item) {
    const card = document.createElement('div');
    // The design is now unified in CSS, so base 'card' is enough
    card.className = "card";

    const myPrice = parseFloat(item.price_per_day).toFixed(2);
    const match = item.nft_name.match(/^(.*?)\s*(#\d+)$/);
    const baseName = match ? match[1] : item.nft_name;
    const numStr = match ? match[2] : "";

    const minDays = Math.floor((item.min_duration || 86400) / 86400);
    const maxDaysFinal = Math.floor((item.max_duration || 2592000) / 86400);

    // Total min price for the grid
    const minTotalPrice = (parseFloat(myPrice) * minDays).toFixed(2);

    // NEW: Rented status class
    if (item.status === 'rented') {
        card.classList.add('rented');
    }

    const telegramIcon = "telegram_logo.svg";

    const mediaHTML = renderMediaHTML(item);
    // REMOVED badgeText logic for Numbers/Usernames as it is now inside media
    // Only keep for generic Gifts or if image failed? No, Gifts have separate title.

    // For Gifts: Keep title below.
    // For Numbers/Usernames: Title is now inside media, so empty here? 
    // User requested: "карточка с нимером | цена" -> Title IN card, Price below.
    // So for Num/User, we hide the card-title div or leave empty.

    const isUsername = (item.type === 'username') || item.nft_name.startsWith('@');
    const isNumber = (item.type === 'number') || item.nft_name.includes('+888');

    // If Gift -> Show Title. If Num/User -> Hide Title (since it's in image).
    const showTitleBelow = (!isUsername && !isNumber);
    const badgeText = showTitleBelow ? (baseName + (numStr ? " " + numStr : "")) : "";

    card.innerHTML = `
        <div class="card-glow"></div>
        <div class="card-image-wrapper">
             ${mediaHTML}
        </div>
        <div class="card-content">
            ${showTitleBelow ? `<div class="card-title">${badgeText}</div>` : ''}
            <div class="card-pricing-row pricing-glass" ${!showTitleBelow ? 'style="margin-top:8px;"' : ''}>
                <div class="pricing-col">
                    <span class="pricing-label">${t('per_day')}</span>
                    <span class="pricing-value">${renderTonAmount(myPrice)}</span>
                </div>
                <div class="pricing-col">
                    <span class="pricing-label">${t('min_price')}</span>
                    <span class="pricing-value">${renderTonAmount(minTotalPrice)}</span>
                </div>
            </div>
        </div>
    `;

    // Click on entire card
    card.onclick = (e) => {
        e.stopPropagation();
        openProductView(item, myPrice);
    };

    return card;
}

function openAdvancedFilters() {
    document.getElementById('mrkt-modal').classList.add('active');
    document.getElementById('mrkt-modal-overlay').classList.add('active');
}
function closeMrktModal() {
    document.getElementById('mrkt-modal').classList.remove('active');
    document.getElementById('mrkt-modal-overlay').classList.remove('active');
}
function resetMrktModal() {
    ACTIVE_FILTERS = { nft: 'all', model: 'all', bg: 'all', symbol: 'all', tags: 'all', sort: 'price_asc', price_from: null, price_to: null, gift_number: null, search: ACTIVE_FILTERS.search };
    document.getElementById('filter-gift-number').value = "";
    document.getElementById('filter-price-from').value = "";
    document.getElementById('filter-price-to').value = "";
    initFilterLists();
    applyHeaderSearch();
}
function applyMrktModal() {
    // Collect from inputs
    ACTIVE_FILTERS.gift_number = document.getElementById('filter-gift-number').value;
    ACTIVE_FILTERS.price_from = document.getElementById('filter-price-from').value;
    ACTIVE_FILTERS.price_to = document.getElementById('filter-price-to').value;

    closeMrktModal();
    loadLiveItems(true); // Trigger server-side refresh
}

function debounce(func, wait) {
    let timeout;
    return (...args) => { clearTimeout(timeout); timeout = setTimeout(() => func(...args), wait); };
}

function generateFragmentUrls(n, attempt = 0) {
    const match = n.match(/^(.*?)\s*#(\d+)$/);
    if (!match) return { image: null, lottie: null };

    const rawName = match[1].trim();
    const num = match[2];

    // Normalize for lookup: remove everything except a-z, 0-9
    const lookupKey = rawName.toLowerCase().replace(/[^a-z0-9]/g, '');
    let slug = SLUG_MAPPING[lookupKey] || lookupKey; // Default to concatenated if not in mapping

    // Specific attempt logic: 
    // attempt 0: slug as is (usually concatenated)
    // attempt 1: hyphenated (just in case)
    if (attempt === 1) {
        if (rawName.includes(' ') || rawName.includes('-')) {
            slug = rawName.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/[\s-]+/g, '-').replace(/^-|-$/g, '');
        }
    }

    return {
        image: `https://nft.fragment.com/gift/${slug}-${num}.webp`,
        lottie: `https://nft.fragment.com/gift/${slug}-${num}.lottie.json`
    };
}

function handleGiftImageError(img, name) {
    img.dataset.attempt = img.dataset.attempt ? parseInt(img.dataset.attempt) + 1 : 1;
    const attempt = parseInt(img.dataset.attempt);

    if (attempt === 1) {
        // Retry SAME URL but with cache buster in case browser cached a 404
        if (img.src && !img.src.includes('?refresh=')) {
            img.src = img.src + (img.src.includes('?') ? '&' : '?') + 'refresh=' + Date.now();
            return;
        }
    }

    if (attempt === 2) {
        // Try hyphenated version
        const f = generateFragmentUrls(name, 1);
        if (f.image && f.image !== img.src.split('?')[0]) {
            img.src = f.image;
            return;
        }
    }

    // Final fallback
    img.src = 'https://nft.fragment.com/guide/gift.svg';
    img.onerror = null; // Prevent loops

    // NEW: If in catalog and failed all attempts, hide the whole card
    if (img.classList.contains('card-img')) {
        const card = img.closest('.card');
        if (card) {
            card.style.display = 'none';
            console.warn("Hiding broken gift card:", name);
        }
    }
}

function handleFilterImageError(img, name, collection, fallback, key) {
    img.dataset.attempt = img.dataset.attempt ? parseInt(img.dataset.attempt) + 1 : 1;
    const attempt = parseInt(img.dataset.attempt);

    if (attempt === 1) {
        // 1. If it's a model and telegifter/local load failed, try hyphenated local name
        if (key === 'model' && (img.src.includes('telegifter.ru') || img.src.includes('/models/')) && !img.src.includes('-refresh=') && !img.src.includes('tonapi.io') && !img.src.includes('hyphen')) {
            const hyphenated = name.replace(/\s+/g, '-');
            // Try local fallback first if telegifter fails
            img.src = `/models/${hyphenated}.webp?attempt=hyphen`;
            return;
        }

        // 1.5 Try Fragment for models if local and anton fail
        if (key === 'model' && img.src.includes('attempt=hyphen')) {
            const f = generateFragmentUrls(name + " #1", 0);
            img.src = f.image;
            return;
        }

        // 2. Try the Collection image (clean/base gift) from TonAPI
        if (key === 'model' && collection && window.FILTERS_CACHE && window.FILTERS_CACHE.nft_addresses && window.FILTERS_CACHE.nft_addresses[collection]) {
            const addr = window.FILTERS_CACHE.nft_addresses[collection];
            img.src = `https://cache.tonapi.io/img/collection/${addr}/image.png`;
            return;
        }

        // 2.2 Try TonAPI for NFT collection if Telegifter failed
        if (key === 'nft' && img.src.includes('telegifter.ru') && window.FILTERS_CACHE && window.FILTERS_CACHE.nft_addresses && window.FILTERS_CACHE.nft_addresses[name]) {
            const addr = window.FILTERS_CACHE.nft_addresses[name];
            img.src = `https://cache.tonapi.io/img/collection/${addr}/image.png`;
            return;
        }

        // 2.5 Try Fragment for NFTs if TonAPI (or Telegifter) fails
        if (key === 'nft' && (img.src.includes('tonapi.io') || img.src.includes('telegifter.ru') || img.src.includes('undefined'))) {
            let n = name;
            if (n.endsWith('s') && n.length > 4) n = n.slice(0, -1);
            const f = generateFragmentUrls(n + " #1", 0);
            img.src = f.image;
            return;
        }

        // 3. If it's an NFT (collection) and TonAPI failed, try Fragment or base model
        if (key === 'nft' && img.src.includes('tonapi.io')) {
            let n = name;
            if (n.endsWith('s') && n.length > 4) n = n.slice(0, -1);
            const f = generateFragmentUrls(n + " #1", 0);
            if (f.image) {
                img.src = f.image;
                return;
            }
        }

        // 4. Last resort Fragment fallback for models if TonAPI also failed
        if (key === 'model' && !img.src.includes('fragment.com') && !img.src.includes('tonapi.io')) {
            const f = generateFragmentUrls(name + " #1", 0);
            if (f.image) {
                img.src = f.image;
                return;
            }
        }

        // Try cache-busting the current URL
        if (img.src && !img.src.includes('?refresh=')) {
            img.src = img.src + (img.src.includes('?') ? '&' : '?') + 'refresh=' + Date.now();
            return;
        }
    }

    if (attempt === 2) {
        // 2. Try generic Fragment URL for models/nfts (gift type)
        // If it's a model (e.g. "Red"), its name alone isn't enough on Fragment, 
        // so we use the collection name (e.g. "Clover Pins") as the source
        let n = (key === 'model' && collection) ? collection : name;
        if (n && !n.includes('#')) {
            // Basic singularization for "Clover Pins" -> "Clover Pin"
            if (n.endsWith('s') && n.length > 4) n = n.slice(0, -1);

            const f = generateFragmentUrls(n + " #1", 0);
            if (f.image && f.image !== img.src.split('?')[0]) {
                img.src = f.image;
                return;
            }
        }
    }

    if (attempt === 3) {
        // 3. Try hyphenated fallback
        let n = (key === 'model' && collection) ? collection : name;
        if (n && !n.includes('#')) {
            if (n.endsWith('s') && n.length > 4) n = n.slice(0, -1);

            const f = generateFragmentUrls(n + " #1", 1);
            if (f.image && f.image !== img.src.split('?')[0]) {
                img.src = f.image;
                return;
            }
        }
    }

    // Final fallback
    img.src = fallback || 'https://nft.fragment.com/guide/gift.svg';
    img.onerror = null;
    img.style.opacity = '1';
}

function renderMediaHTML(it, isModal = false) {
    const isNum = (it.type === 'number') || it.nft_name.includes('+888');
    const isUser = (it.type === 'username') || it.nft_name.startsWith('@');
    const minD = Math.floor((it.min_duration || 86400) / 86400);
    const maxD = Math.floor((it.max_duration || 2592000) / 86400);
    const daysLabel = `${t('days')}: ${minD} – ${maxD}`;

    if (isNum || isUser) {
        let inner = "";
        const tIcon = "telegram_logo.svg";

        const rawName = it.nft_name.replace('Anonymous Number ', '').replace('@', '');
        const isLong = rawName.length > (isModal ? 20 : 15);
        const fontSize = rawName.length > 20 ? (isModal ? '20px' : '14px') : (isModal ? '24px' : '17px');

        if (isNum) {
            inner = `
                <div class="card-placeholder" style="background:${isModal ? 'transparent' : '#1c1c1e'}; height:100%; width:100%; display:flex; flex-direction:column; justify-content:center; align-items:center; gap:${isModal ? '20px' : '8px'};">
                    <img src="${tIcon}" class="${isModal ? '' : 'telegram-center-icon'}" style="${isModal ? 'width:80px; height:80px; opacity:0.9; filter: drop-shadow(0 0 20px rgba(0,136,204,0.4));' : 'flex-shrink:0;'}">
                    <div style="${isModal ? 'background:#0088cc; font-size:24px; color:#fff; padding:10px 24px; border-radius:14px; font-weight:800; box-shadow:0 8px 24px rgba(0,136,204,0.5); font-family:monospace; letter-spacing:1px;' : 'font-size:' + fontSize + '; font-weight:700; color:#fff; width:100%; text-align:center; padding:0 4px; box-sizing:border-box; flex-shrink:0;'}">${rawName}</div>
                </div>`;
        } else {
            const displayName = truncateMiddle(rawName, isModal ? 20 : 15);
            inner = `
                <div class="card-placeholder" style="background:${isModal ? 'transparent' : '#1c1c1e'}; height:100%; width:100%; display:flex; flex-direction:column; justify-content:center; align-items:center; gap:${isModal ? '10px' : '4px'};">
                     <div style="font-size:${isModal ? '120px' : '50px'}; color:#0088cc; font-weight:${isModal ? '900' : '800'}; opacity:${isModal ? '0.9' : '0.8'}; line-height:1; flex-shrink:0; ${isModal ? 'filter: drop-shadow(0 0 30px rgba(0,136,204,0.3));' : ''}">@</div>
                     <div style="${isModal ? 'background:#0088cc; font-size:24px; color:#fff; padding:10px 24px; border-radius:14px; font-weight:800; box-shadow:0 8px 24px rgba(0,136,204,0.5);' : 'font-size:' + fontSize + '; font-weight:700; color:#fff; width:100%; text-align:center; padding:0 4px; box-sizing:border-box; flex-shrink:0;'}">${displayName}</div>
                </div>`;
        }
        if (!isModal) {
            inner = inner.replace('</div>', `<div class="card-days-badge-bottom">${daysLabel}</div></div>`);
        }
        return inner;
    } else {
        let iSrc = it._realImage;
        // ALWAYS try to fix fragment urls if they don't have hyphens but are gifts
        if (iSrc && iSrc.includes('nft.fragment.com/gift/') && !iSrc.includes('-') && !SLUG_MAPPING[iSrc.split('/').pop().split('-')[0]]) {
            const f = generateFragmentUrls(it.nft_name);
            iSrc = f.image;
        }
        if (!iSrc || iSrc.includes('gift.svg') || iSrc.includes('ton_symbol')) {
            const f = generateFragmentUrls(it.nft_name);
            iSrc = f.image;
        }
        return `
            <img src="${iSrc}" class="${isModal ? 'view-img-actual' : 'card-img'}" style="${isModal ? 'width:100%; height:100%; object-fit:contain;' : ''}" loading="lazy" onerror="handleGiftImageError(this, '${it.nft_name.replace(/'/g, "\\'")}')">
            <div class="card-days-badge-bottom">${daysLabel}</div>
        `;
    }
}

function observeNewCards() {
    // Lottie disabled in feed to prevent lag on mobile
}
async function openProductView(item) {
    if (!item) return;
    CURRENT_PAYMENT_ITEM = item;
    const pv = document.getElementById('product-view');
    if (pv) {
        pv.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    const mediaCont = document.getElementById('view-media-container');
    if (mediaCont) {
        mediaCont.style.display = 'block';
        mediaCont.innerHTML = renderMediaHTML(item, true);
    }

    // NEW: Release Date Badge in Product View - NOW WITH LIVE COUNTDOWN
    const releaseBadge = document.getElementById('view-release-badge');
    if (releaseBadge) {
        if (item.status === 'rented' && item.rent_ends_at) {
            // Create a unique timer element ID
            const timerId = 'release-timer-' + item.id;
            releaseBadge.innerHTML = `<div id="${timerId}" style="margin-bottom:12px;"></div>`;
            releaseBadge.style.display = 'block';

            // Start the countdown timer
            const timerEl = document.getElementById(timerId);
            if (timerEl) {
                startCountdown(parseInt(item.rent_ends_at), timerEl);
            }
        } else {
            releaseBadge.style.display = 'none';
        }
    }

    const lottieCont = document.getElementById('view-lottie');
    if (lottieCont) {
        lottieCont.innerHTML = '';
        const fUrls = generateFragmentUrls(item.nft_name);
        if (fUrls.lottie && item.type === 'gift') {
            const anim = lottie.loadAnimation({
                container: lottieCont,
                renderer: 'svg',
                loop: true,
                autoplay: true,
                path: fUrls.lottie
            });
            lottieCont.anim = anim;
            anim.addEventListener('DOMLoaded', () => {
                if (mediaCont) mediaCont.style.display = 'none';
            });
        }
    }

    const colName = (item._collection && item._collection.name) ? item._collection.name : "Gifts";
    const viewTitle = document.getElementById('view-title');
    if (viewTitle) {
        viewTitle.innerText = item.nft_name;
    }

    // NEW: Status Pills
    // NEW: Status Overlay (replaces badge row)
    const statusOverlay = document.getElementById('view-media-status-overlay');
    if (statusOverlay) {
        statusOverlay.style.display = 'none';
        statusOverlay.innerHTML = '';

        let statusText = '';
        let statusClass = '';

        if (item.status === 'rented') {
            statusText = t('rented');
            statusClass = 'rented';
        } else if (item.status === 'pending') {
            statusText = t('pending');
            statusClass = 'pending';
        }

        if (statusText) {
            statusOverlay.innerHTML = `<div class="status-overlay-badge ${statusClass}">${statusText}</div>`;
            statusOverlay.style.display = 'block';
        }
    }
    const viewCopyBtn = document.getElementById('view-copy-btn-main');
    if (viewCopyBtn) {
        viewCopyBtn.onclick = () => copyNftTitle(item.nft_name);
    }

    const notifyBtn = document.getElementById('notify-btn');
    if (notifyBtn) {
        notifyBtn.style.display = (item.status === 'rented') ? 'block' : 'none';
    }
    const colEl = document.getElementById('view-collection');
    if (colEl) {
        colEl.innerText = `${colName} >`;
        colEl.style.display = (item.type === 'gift') ? 'block' : 'none';
        colEl.onclick = () => {
            ACTIVE_FILTERS.nft = colName;
            closeProductView();
            loadLiveItems(true);
        };
    }

    const ownerEl = document.getElementById('view-owner');
    if (ownerEl) {
        ownerEl.parentElement.style.display = 'none';
    }

    // Hide Details/Properties for Numbers & Usernames
    const detailsTab = document.getElementById('details-tab');
    const propertiesCont = document.getElementById('view-properties');
    const isGift = (item.type && item.type.toLowerCase() === 'gift');
    if (detailsTab) detailsTab.style.display = isGift ? 'block' : 'none';
    if (propertiesCont) propertiesCont.style.display = isGift ? 'block' : 'none';

    // Translation setup
    const setChip = (id, key) => {
        const el = document.getElementById(id);
        if (el) el.innerText = t(key);
    };
    setChip('view-label-price', 'price_per_day');
    setChip('view-label-period', 'period');
    setChip('view-label-discount', 'discount');
    setChip('view-auto-relist-title', 'auto_relist');
    setChip('view-auto-relist-desc', 'auto_relist_desc');
    setChip('fee-what-mean', 'what_is_this');
    setChip('view-countdown-label', 'ends_in');

    // Reset banners & countdown
    const banner = document.getElementById('view-status-banner');
    if (banner) { banner.style.display = 'none'; banner.className = 'status-banner'; }
    const countdownCont = document.getElementById('view-countdown-container');
    if (countdownCont) countdownCont.style.display = 'none';

    // Hide Address
    const addrDom = document.getElementById('view-address');
    if (addrDom) addrDom.style.display = 'none';

    // Pricing & Duration
    let rawP = parseFloat(item.price_per_day) || 0;
    const dailyPrice = rawP.toFixed(2);
    document.getElementById('view-daily-price').innerHTML = renderTonAmount(dailyPrice);
    if (GLOBAL_TON_PRICE) {
        document.getElementById('view-daily-price-usd').innerText = `~$${(rawP * GLOBAL_TON_PRICE).toFixed(2)}`;
    }

    const minDays = Math.floor((item.min_duration || 86400) / 86400);
    const maxDays = Math.floor((item.max_duration || 2592000) / 86400);
    const rangeEl = document.getElementById('view-duration-range');
    if (rangeEl) rangeEl.textContent = `${minDays} — ${maxDays}`;
    document.getElementById('view-discount').innerText = "0.1%";
    document.getElementById('rent-duration-input').value = minDays;

    // Attributes
    const propCont = document.getElementById('view-properties');
    if (propCont && item.type === 'gift') {
        propCont.innerHTML = '';
        // Attributes like Model/Backdrop/Symbol will be added via fetch later, or we can add static ones if available
        const nftNumMatch = item.nft_name.match(/#(\d+)/);
        const nftNum = nftNumMatch ? nftNumMatch[1] : '1';
        const giftBaseName = item.nft_name.replace(/#\d+/, '').trim();
        const giftSlug = giftBaseName.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join('');
        const tgNftLink = `https://t.me/nft/${giftSlug}-${nftNum}`;

        const createPropRow = (label, value, statKey) => {
            const displayValue = (!value || value === 'Unknown' || value === 'Gift') ? '—' : value;
            const row = document.createElement('div');
            row.className = 'property-item';
            row.innerHTML = `
                <div class="prop-left"><div class="prop-name">${label}</div></div>
                <div class="prop-right"><span style="color:var(--accent-blue); font-weight:600;">${displayValue}</span></div>`;
            return row;
        };

        const tgRow = document.createElement('div');
        tgRow.className = 'property-item';
        // Added .clickable-prop class from previous tasks
        tgRow.innerHTML = `<div class="prop-left"><div class="prop-name">Telegram</div></div><div class="prop-right"><span style="color:var(--accent-blue); font-weight:600;">${giftBaseName} #${nftNum}</span></div>`;
        tgRow.onclick = () => tg.openTelegramLink(tgNftLink);
        propCont.appendChild(tgRow);

        // Helper for clickable properties
        const appendClickableProp = (label, val, key) => {
            if (!val) return;
            const r = createPropRow(label, val, key);
            r.classList.add('clickable-prop'); // Ensure visual feedback
            // Add arrow
            r.querySelector('.prop-right').innerHTML += `<span class="arrow-v" style="font-size:12px; margin-left:8px;">›</span>`;

            r.onclick = () => {
                // FAILSAFE: Ensure we set the Collection filter too, otherwise Model list is disabled
                if (key === 'model' || key === 'bg' || key === 'symbol') {
                    ACTIVE_FILTERS.nft = colName;
                }
                ACTIVE_FILTERS[key] = val;
                closeProductView();
                loadLiveItems(true);
            };
            propCont.appendChild(r);
        };

        if (item._modelName) appendClickableProp(t('model'), item._modelName, 'model');
        if (item._symbol) appendClickableProp(t('symbol'), item._symbol, 'symbol');
        if (item._backdrop) appendClickableProp(t('backdrop'), item._backdrop, 'bg');

        // Auto-relist status
        const reRow = createPropRow(t('auto_relist_label'), item.auto_relist ? t('yes') : t('no'));
        if (!item.auto_relist) reRow.querySelector('.prop-right span').style.color = '#ff3b30';
        propCont.appendChild(reRow);
    }

    // Rent Button
    const rentBtn = document.getElementById('main-rent-action-btn');
    const stepper = document.querySelector('.rent-period-stepper');
    const feeNotice = document.querySelector('.fee-notice-box');

    if (rentBtn) {
        rentBtn.style.display = 'flex';
        if (stepper) stepper.style.display = 'flex';
        if (feeNotice) feeNotice.style.display = 'block';

        updateTotalPrice();
        const rentBtnTextEl = rentBtn.querySelector('#rent-btn-text');
        if (rentBtnTextEl) rentBtnTextEl.textContent = t('rent_button', { amount: '' }).replace('{amount}', '').trim();

        rentBtn.onclick = async () => {
            if (!tonConnectUI.connected) { await tonConnectUI.openModal(); return; }

            // ALERT: Check auto-relist for pre-orders
            if (item.status === 'rented' && !item.auto_relist) {
                const confirmed = confirm(t('preorder_warning_no_relist'));
                if (!confirmed) return;
            }

            const days = parseInt(document.getElementById('rent-duration-input').value) || 1;
            const originalHTML = rentBtn.innerHTML;
            rentBtn.innerHTML = t('loading');
            rentBtn.disabled = true;
            try {
                const userId = tg.initDataUnsafe?.user?.id || 0;
                const r = await fetch(`${BACKEND_URL}/api/prepare_rent?nft_address=${item.nft_address}&days=${days}&user_id=${userId}`);
                const d = await r.json();
                if (d.error) throw new Error(d.error);
                const res = await tonConnectUI.sendTransaction({ validUntil: Math.floor(Date.now() / 1000) + 600, messages: d.messages });
                if (res) {
                    await fetch(`${BACKEND_URL}/api/mark_rented`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nft_address: item.nft_address, order_id: d.order_id }) });
                    closeProductView();
                    loadLiveItems(true);
                    openTcModal(d.order_id, true);
                    startPollingOrder(d.order_id);
                }
            } catch (e) {
                console.error("Rent Error:", e);
                tg.showAlert(e.message || "Error");
            } finally {
                rentBtn.innerHTML = originalHTML;
                rentBtn.disabled = false;
            }
        };
    }

    const warningBox = document.getElementById('listing-warning-box');
    if (warningBox) warningBox.style.display = 'none';

    if (item && item.nft_address) {
        const userId = tg.initDataUnsafe?.user?.id || 0;

        // Parallel fetch for details and user order status
        Promise.all([
            fetch(`${BACKEND_URL}/api/nft_details?nft_address=${item.nft_address}`).then(r => r.json()),
            fetch(`${BACKEND_URL}/api/my_orders?user_id=${userId}`).then(r => r.json())
        ]).then(([details, myOrders]) => {
            const myOrder = myOrders.find(o => o.nft_address === item.nft_address && (o.status === 'rented' || o.status === 'active' || o.status === 'paid'));

            // 1. Status Banner Logic
            // 1. Status Banner Logic - REMOVED PER USER REQUEST
            // The banner is now handled by the image overlay only.
            const banner = document.getElementById('view-status-banner');
            if (banner) banner.style.display = 'none';

            // 2. Button Logic for Own Order
            if (myOrder && myOrder.status === 'rented' && !myOrder.tc_link) {
                if (rentBtn) {
                    rentBtn.innerHTML = t('connect_to_fragment');
                    if (stepper) stepper.style.display = 'none';
                    if (feeNotice) feeNotice.style.display = 'none';
                    rentBtn.onclick = () => openTcModal(myOrder.id);
                }
            }

            // 3. Countdown Logic (Blocky V2)
            const endTime = details.rent?.ends_at || details.rent_ends_at;
            if (endTime && (item.status === 'rented' || (myOrder && myOrder.status === 'active'))) {
                const countdownCont = document.getElementById('view-countdown-container');
                const timerEl = document.getElementById('view-countdown-timer');
                if (countdownCont && timerEl) {
                    countdownCont.style.display = 'block';
                    startCountdown(parseInt(endTime), timerEl);
                }
            } else {
                const countdownCont = document.getElementById('view-countdown-container');
                if (countdownCont) countdownCont.style.display = 'none';
            }

            // 4. Existing warning logic and attributes
            if (details.rent && details.rent.listed_at) {
                const diffHrs = (Date.now() - (details.rent.listed_at * 1000)) / (1000 * 60 * 60);
                if (diffHrs < 24) {
                    if (warningBox) warningBox.style.display = 'block';
                    const wt = document.getElementById('view-listed-time');
                    if (wt) wt.innerText = diffHrs < 1 ? t('just_now') : `${Math.round(diffHrs)} ${t('hours_ago')}`;
                }
            }
            if (details.attributes) {
                details.attributes.forEach(attr => {
                    const trait = attr.trait_type.toLowerCase();
                    const row = Array.from(document.querySelectorAll('.property-item')).find(r => r.querySelector('.prop-name')?.textContent === t(trait));
                    if (row) {
                        const valSpan = row.querySelector('.prop-right span');
                        if (valSpan) valSpan.textContent = attr.value;

                        // NEW: Make attribute clickable to filter
                        row.classList.add('clickable-prop');
                        row.onclick = () => {
                            let filterKey = trait;
                            if (filterKey === 'backdrop' || filterKey === 'background' || filterKey === 'фон') {
                                filterKey = 'bg';
                            }
                            if (ACTIVE_FILTERS.hasOwnProperty(filterKey)) {
                                ACTIVE_FILTERS[filterKey] = attr.value;
                                closeProductView();
                                switchTab(0); // Go to Gifts
                                initFilterLists();
                                applyHeaderSearch();
                                tg?.HapticFeedback?.impactOccurred('light');
                            }
                        };
                    }
                });
            }
        }).catch(e => console.error(e));
    }

    // Reset scroll at the very end
    if (pv) {
        requestAnimationFrame(() => {
            pv.scrollTop = 0;
            pv.scrollTo({ top: 0, behavior: 'instant' });
        });
    }
}

function adjustDuration(delta) {
    if (!CURRENT_PAYMENT_ITEM) return;

    const input = document.getElementById('rent-duration-input');
    const minDays = Math.floor((CURRENT_PAYMENT_ITEM.min_duration || 86400) / 86400);
    const maxDays = Math.floor((CURRENT_PAYMENT_ITEM.max_duration || 2592000) / 86400);
    let val = parseInt(input.value) + delta;
    if (val < minDays) val = minDays;
    if (val > maxDays) val = maxDays;
    input.value = val;
    updateTotalPrice();
}

function calculateMarkup(price) {
    if (price <= 0.01) return 0; // matching backend 0.01 TON rule
    if (price <= 0.10) return 0.05;
    if (price <= 0.25) return 0.10;
    if (price <= 0.50) return 0.15;
    if (price <= 1.00) return 0.25;
    if (price <= 2.50) return 0.45;
    if (price <= 5.00) return 0.75;
    return 1.00;
}

function updateTotalPrice() {
    if (!CURRENT_PAYMENT_ITEM) return;
    const input = document.getElementById('rent-duration-input');
    const minDays = Math.floor((CURRENT_PAYMENT_ITEM.min_duration || 86400) / 86400);
    let dur = parseInt(input.value) || minDays;
    if (dur < minDays) {
        dur = minDays;
        input.value = minDays;
    }
    // Backend price already includes markup, so just multiply by duration
    let dp = parseFloat(CURRENT_PAYMENT_ITEM.price_per_day);
    // If invalid, try to calc from total, otherwise trust the value (even if 0, though DB has >0)
    if (!dp || isNaN(dp)) {
        const totalP = parseFloat(CURRENT_PAYMENT_ITEM.price) || 0;
        const totalD = (parseInt(CURRENT_PAYMENT_ITEM.max_duration) || 2592000) / 86400;
        dp = totalP / totalD || 0;
    }
    const total = (dp * dur).toFixed(2);

    const priceSpan = document.getElementById('rent-btn-price');
    if (priceSpan) {
        priceSpan.innerText = total !== "0.00" ? total : dp.toFixed(2);
    }

    // Update USD price
    const usdEl = document.getElementById('view-daily-price-usd');
    if (usdEl && GLOBAL_TON_PRICE) {
        const totalUsd = (total * GLOBAL_TON_PRICE).toFixed(2);
        usdEl.innerText = `~$${totalUsd}`;
    }

    // Обновить текст кнопки с учетом языка и статуса (Аренда vs Предзаказ)
    const rentBtn = document.getElementById('main-rent-action-btn');
    if (rentBtn) {
        // Попробуем найти текстовый узел или элемент с текстом
        const textNode = Array.from(rentBtn.childNodes).find(n => n.nodeType === Node.TEXT_NODE && n.textContent.trim().length > 0);
        if (textNode) {
            const isRented = CURRENT_PAYMENT_ITEM && CURRENT_PAYMENT_ITEM.status === 'rented';
            textNode.textContent = ' ' + (isRented ? t('preorder_for') : t('rent_for')) + ' ';
        }
    }
}

function closeProductView() {
    const pv = document.getElementById('product-view');
    if (pv) pv.classList.remove('active');
    document.body.style.overflow = '';
    CURRENT_PAYMENT_ITEM = null;
    const lottieCont = document.getElementById('view-lottie');
    if (lottieCont && lottieCont.anim) {
        lottieCont.anim.destroy();
        lottieCont.anim = null;
    }
}

function handleShareClick() {
    if (!CURRENT_PAYMENT_ITEM) return;
    const cleanName = CURRENT_PAYMENT_ITEM.nft_name.replace('@', '');
    if (tg && tg.switchInlineQuery) {
        tg.switchInlineQuery(cleanName, ['users', 'groups', 'channels']);
    } else {
        const botUser = "OctoRent_bot";
        const shareLink = `https://t.me/${botUser}?start=nft_${CURRENT_PAYMENT_ITEM.nft_address}`;
        copyToClipboard(shareLink);
        showToast(CURRENT_LANG === 'ru' ? "Ссылка скопирована" : "Link copied");
    }
}

function handleNotifyClick() {
    showToast(CURRENT_LANG === 'ru' ? "Вы получите уведомление, когда NFT освободится" : "You will be notified when this NFT is available");
}

function copyNftTitle(name) {
    copyToClipboard(name);
    showToast(t('copy_success'));
}

function renderItemsBatch(items) {
    const container = document.getElementById('items-view');
    items.forEach(item => {
        const card = createItemCard(item);
        if (card) container.appendChild(card);
    });
    observeNewCards();
}

function openTcModal(orderId, isPolling = false) {
    document.getElementById('tc-current-order-id').value = orderId;
    document.getElementById('tc-modal-overlay').classList.add('active');
    document.getElementById('tc-modal').classList.add('active');

    const body = document.getElementById('tc-modal-body');
    if (isPolling) {
        body.innerHTML = `
    <div id="tc-polling-state" style="text-align:center; padding: 20px 0;">
        <div class="premium-spinner" style="margin: 0 auto 20px;"></div>
        <p style="color:#fff; font-weight:700; margin-bottom:10px;">Ждем подтверждения оплаты...</p>
        <p>Обычно это занимает 15-40 секунд. Не закрывайте это окно.</p>
    </div>
`;
    } else {
        // Reset to default
        body.innerHTML = `
    <p>1. Зайдите на Fragment.com (с компьютера или другого браузера).</p>
    <p>2. Нажмите <b>Connect TON</b>.</p>
    <p>3. Скопируйте ссылку <b>TON Connect Link</b> (кнопка рядом с QR-кодом).</p>
    <p>4. Вставьте её сюда:</p>
    <input type="text" id="tc-link-input" placeholder="tc://..."
        style="width: 100%; height: 50px; background: rgba(255,255,255,0.05); border: 1px solid #333; border-radius: 12px; margin-top: 15px; color: #fff; padding: 0 15px;">
    <button onclick="submitTcLink()" class="btn-yellow" style="width: 100%; margin-top: 20px;">Подключить кошелек</button>
`;
    }
}
const trigger = document.getElementById('loader-trigger');
if (trigger) {
    const so = new IntersectionObserver((e) => {
        if (e[0].isIntersecting && HAS_MORE && !IS_LOADING) loadLiveItems(false);
    });
    so.observe(trigger);
}

// --- Profile & History Logic ---
function toggleHistory() {
    const content = document.getElementById('history-content');
    const arrow = document.getElementById('history-arrow');
    const isHidden = content.style.display === 'none';

    content.style.display = isHidden ? 'block' : 'none';
    arrow.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';

    if (isHidden) {
        loadHistoryContent(); // Load data when opening
    }
}

async function loadHistoryContent() {
    const list = document.getElementById('history-list');
    list.innerHTML = `<div style="color:#8b9bb4; text-align:center; padding:10px;"><div class="premium-spinner" style="width:20px;height:20px;margin:10px auto;"></div>${t('loading')}</div>`;

    try {
        const userId = (tg && tg.initDataUnsafe && tg.initDataUnsafe.user) ? tg.initDataUnsafe.user.id : 0;
        const resp = await fetch(`${BACKEND_URL}/api/my_orders?user_id=${userId}`);
        const orders = await resp.json();

        if (!orders || orders.length === 0) {
            list.innerHTML = `
                <div style="color:#8b9bb4; text-align:center; padding:40px 20px;">
                    <div style="font-size:32px; margin-bottom:10px; opacity:0.5;">📭</div>
                    <div style="font-weight:700; color:#fff;">${t('history_empty')}</div>
                    <div style="font-size:12px; margin-top:5px;">У вас пока нет активных или прошлых аренд</div>
                </div>`;
            return;
        }

        list.innerHTML = '';
        orders.forEach(o => {
            const item = document.createElement('div');
            item.className = 'history-item';
            item.style = 'background:rgba(255,255,255,0.05); border-radius:12px; padding:12px; margin-bottom:10px; display:flex; flex-direction:column; gap:8px;';

            let statusColor = '#8b9bb4';
            let statusText = o.status;
            let showTcBtn = false;
            let displayStatus = o.status;

            if (o.status === 'pending_payment') {
                statusColor = '#FF3B30';
                displayStatus = t('status_pending');
            } else if (o.status === 'rented' && !o.tc_link) {
                statusColor = '#FF9500';
                displayStatus = t('status_awaiting_fragment');
                showTcBtn = true;
            } else if (o.status === 'rented') {
                statusColor = '#FF9500';
                displayStatus = t('status_rented');
            } else if (o.status === 'active') {
                statusColor = '#34C759';
                displayStatus = 'Активен';
            } else if (o.status === 'paid') {
                statusColor = '#007AFF';
                displayStatus = 'Обработка...';
            }

            item.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span style="color:#fff; font-weight:700; font-size:14px;">${o.nft_name}</span>
                    <span class="status-tag" style="color:${statusColor}; border: 1px solid ${statusColor}44; background: ${statusColor}11;">${displayStatus}</span>
                </div>
                <div style="display:flex; justify-content:space-between; font-size:12px; color:#8b9bb4; font-weight:600;">
                    <span>${o.days} дн.</span>
                    <span class="tm-amount icon-ton" style="font-size:inherit; font-weight:800; color:#fff;">${o.total_price}</span>
                </div>
                ${showTcBtn ? `
                    <button onclick="openTcModal(${o.id})" class="btn-yellow" style="height:38px; font-size:13px; margin-top:5px; font-weight:700; border-radius:10px;">${t('connect_to_fragment')}</button>
                ` : ''}
            `;

            // If active and end_time exists, we could show timer here too, but user asked specifically for modal/card
            list.appendChild(item);
        });
    } catch (e) {
        list.innerHTML = '<div style="color:#ff3b30; text-align:center; padding:10px;">Ошибка загрузки</div>';
    }
}

function startCountdown(endTime, targetEl) {
    if (typeof endTime !== 'number') return;
    const intervalKey = targetEl.id || 'global-timer';
    if (COUNTDOWN_INTERVALS[intervalKey]) clearInterval(COUNTDOWN_INTERVALS[intervalKey]);

    const endDate = new Date(endTime * 1000);
    const dateStr = endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

    // Market App Style: Ends in [0 days] : [14] : [37] : [02] Feb 8, 2026
    const update = () => {
        const now = Math.floor(Date.now() / 1000);
        const diff = endTime - now;

        if (diff <= 0) {
            targetEl.innerHTML = `<span style="color:#FF3B30; font-weight:800;">EXPIRED</span>`;
            clearInterval(COUNTDOWN_INTERVALS[intervalKey]);
            return;
        }

        const d = Math.floor(diff / 86400);
        const h = Math.floor((diff % 86400) / 3600);
        const m = Math.floor((diff % 3600) / 60);
        const s = diff % 60;
        const pad = (n) => n.toString().padStart(2, '0');

        targetEl.innerHTML = `
            <div class="market-timer-row">
                <span class="mt-label">${t('ends_in')}</span>
                
                <div class="mt-pill mt-wide">${d} ${t('days')}</div>
                <span class="mt-sep">:</span>
                
                <div class="mt-pill">${pad(h)}</div>
                <span class="mt-sep">:</span>
                
                <div class="mt-pill">${pad(m)}</div>
                <span class="mt-sep">:</span>
                
                <div class="mt-pill">${pad(s)}</div>
                
                <span class="mt-date">${dateStr}</span>
            </div>
        `;
    };

    update();
    COUNTDOWN_INTERVALS[intervalKey] = setInterval(update, 1000);

}

function copyWallet() {
    if (tonConnectUI && tonConnectUI.account && tonConnectUI.account.address) {
        copyToClipboard(tonConnectUI.account.address);
        if (tg) tg.showAlert("Адрес скопирован!");
        else alert("Адрес скопирован!");
    } else {
        if (tg) tg.showAlert("Кошелек не подключен");
        else alert("Кошелек не подключен");
    }
}

function loadProfileData() {
    console.log("Loading Profile Data...");
    // 1. User Info from Telegram
    if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user) {
        const u = tg.initDataUnsafe.user;
        const avaEl = document.getElementById('profile-avatar');
        const headerAva = document.getElementById('header-mini-avatar');
        const nameEl = document.getElementById('profile-name');
        const idEl = document.getElementById('profile-id');

        if (nameEl) nameEl.textContent = u.first_name + (u.last_name ? ' ' + u.last_name : '');
        if (idEl) idEl.textContent = 'ID: ' + u.id;

        if (u.photo_url) {
            if (avaEl) avaEl.src = u.photo_url;
            if (headerAva) headerAva.src = u.photo_url;
        }
    }

    // 2. Sync Wallet State
    updateWalletBtnState();
}

function handleHeaderBadgeClick() {
    if (tonConnectUI && tonConnectUI.account) {
        switchTab(3); // Go to Profile
    } else {
        tonConnectUI.openModal(); // Open connection modal
    }
}

function handleProfileWalletClick() {
    if (tonConnectUI && tonConnectUI.account) {
        openWalletDrawer();
    } else {
        tonConnectUI.openModal();
    }
}

function openWalletDrawer() {
    const el = document.getElementById('wallet-drawer');
    if (!el) return;
    el.style.display = 'flex';
    setTimeout(() => el.classList.add('active'), 10);

    // Update labels via t()
    const title = document.getElementById('wallet-drawer-title');
    const labelCopy = document.getElementById('label-copy-address');
    const labelDisconnect = document.getElementById('label-disconnect-wallet');
    if (title) title.innerText = t('wallet_mgmt');
    if (labelCopy) labelCopy.innerText = t('copy_address');
    if (labelDisconnect) labelDisconnect.innerText = t('disconnect_wallet');

    tg.HapticFeedback.impactOccurred('medium');
}

function closeWalletDrawer() {
    const el = document.getElementById('wallet-drawer');
    if (!el) return;
    el.classList.remove('active');
    setTimeout(() => el.style.display = 'none', 300);
}

async function copyWalletAddress() {
    if (tonConnectUI && tonConnectUI.account) {
        const addr = convertToUQ(tonConnectUI.account.address);
        copyToClipboard(addr);
        tg.showAlert(t('copy_success'));
        closeWalletDrawer();
    }
}

async function disconnectWallet() {
    if (tonConnectUI) {
        await tonConnectUI.disconnect();
        closeWalletDrawer();
    }
}

async function updateWalletBtnState() {
    console.log('Updating wallet button state...');
    const btnText = document.getElementById('blue-wallet-text');
    const headerAddr = document.getElementById('header-wallet-address');
    const headerPill = document.getElementById('header-wallet-pill');
    const headerConnectPill = document.getElementById('header-connect-pill');

    if (tonConnectUI && tonConnectUI.account) {
        const raw = tonConnectUI.account.address;
        const address = convertToUQ(raw);

        const shortAddr = address.slice(0, 4) + '...' + address.slice(-4);
        if (btnText) btnText.innerText = shortAddr;
        if (headerAddr) headerAddr.innerText = shortAddr;

        if (headerPill) headerPill.style.display = 'flex';
        if (headerConnectPill) headerConnectPill.style.display = 'none';

        console.log('Wallet connected:', shortAddr);
    } else {
        if (btnText) btnText.textContent = t('connect_wallet_full');

        const hwct = document.getElementById('header-wallet-connect-text');
        if (hwct) hwct.textContent = t('connect_wallet');

        if (headerPill) headerPill.style.display = 'none';
        if (headerConnectPill) headerConnectPill.style.display = 'flex';

        console.log('Wallet disconnected');
    }
}

// Redundant listener removed (moved to initTonConnect)

// Fallback in case overlay fails
function openWalletConnect() {
    if (tonConnectUI) {
        tonConnectUI.openModal();
    }
}


// --- Language Switcher (Drawer Style) ---
function switchLanguage() {
    const el = document.getElementById('language-drawer');
    if (!el) return;

    // Sync checkmarks with current state
    const label = document.getElementById('lang-label');
    const checkRu = document.getElementById('check-ru');
    const checkEn = document.getElementById('check-en');
    if (label && checkRu && checkEn) {
        const isRu = label.innerText.includes('Русский');
        checkRu.style.display = isRu ? 'block' : 'none';
        checkEn.style.display = isRu ? 'none' : 'block';
    }

    el.style.display = 'flex';
    setTimeout(() => el.classList.add('active'), 10);
    tg.HapticFeedback.impactOccurred('medium');
}

function closeLanguageDrawer() {
    const el = document.getElementById('language-drawer');
    if (!el) return;
    el.classList.remove('active');
    setTimeout(() => el.style.display = 'none', 300);
}

function selectLanguage(lang) {
    // Сохраняем выбранный язык
    CURRENT_LANG = lang;
    localStorage.setItem('lang', lang);

    const label = document.getElementById('lang-label');
    const checkRu = document.getElementById('check-ru');
    const checkEn = document.getElementById('check-en');

    if (lang === 'ru') {
        if (label) label.innerText = 'Русский ›';
        if (checkRu) checkRu.style.display = 'block';
        if (checkEn) checkEn.style.display = 'none';
    } else {
        if (label) label.innerText = 'English ›';
        if (checkRu) checkRu.style.display = 'none';
        if (checkEn) checkEn.style.display = 'block';
    }

    if (tg && tg.HapticFeedback) {
        tg.HapticFeedback.notificationOccurred('success');
    }

    // Закрыть drawer и перезагрузить страницу для применения языка
    setTimeout(() => {
        closeLanguageDrawer();
        setTimeout(() => {
            location.reload();
        }, 100);
    }, 200);
}

// --- Order Polling Logic ---
let ORDER_POLL_INTERVAL = null;
function startPollingOrder(orderId) {
    if (ORDER_POLL_INTERVAL) clearInterval(ORDER_POLL_INTERVAL);

    ORDER_POLL_INTERVAL = setInterval(async () => {
        try {
            const userId = (tg && tg.initDataUnsafe && tg.initDataUnsafe.user) ? tg.initDataUnsafe.user.id : 0;
            const resp = await fetch(`${BACKEND_URL}/api/my_orders?user_id=${userId}`);
            const orders = await resp.json();

            const myOrder = orders.find(o => o.id === orderId);
            if (myOrder) {
                console.log("Order status:", myOrder.status);
                if (myOrder.status === 'rented') {
                    // Бот выкупил NFT, пора вводить ссылку
                    clearInterval(ORDER_POLL_INTERVAL);
                    ORDER_POLL_INTERVAL = null;
                    tg.HapticFeedback.notificationOccurred('success');
                    openTcModal(orderId, false); // Switch to input mode
                } else if (myOrder.status === 'active') {
                    // Уже все готово
                    clearInterval(ORDER_POLL_INTERVAL);
                    ORDER_POLL_INTERVAL = null;
                    tg.showAlert("Аренда активна!");
                }
            }
        } catch (e) {
            console.error("Polling error:", e);
        }
    }, 5000); // Опрос каждые 5 сек
}

// Ensure correct initial load
// Ensure correct initial load
document.addEventListener('DOMContentLoaded', () => {
    // Initial checks if needed
    const searchInput = document.getElementById('search-input');
    if (searchInput) searchInput.placeholder = t('search');

    // Update other static labels that might not be covered
    const filterSearchNft = document.getElementById('filter-search-nft');
    if (filterSearchNft) filterSearchNft.placeholder = t('search_filter_hint', { label: 'NFT' });

    // Check initial language UI
    const langLabel = document.getElementById('lang-label');
    if (langLabel) langLabel.innerText = CURRENT_LANG === 'ru' ? 'Русский ›' : 'English ›';

    // Chips translation
    const setChip = (id, key) => {
        const el = document.getElementById(id);
        if (el) el.innerText = t(key);
    };
    // setChip('chip-label-nft', 'nft'); // Skipping NFT as it has no key/unchanged
    setChip('chip-label-model', 'model');
    setChip('chip-label-bg', 'backdrop');
    setChip('chip-label-symbol', 'symbol');

    // Profile Translations
    setChip('profile-label-wallet', 'profile_wallet');
    setChip('profile-label-settings', 'profile_settings');
    setChip('profile-label-history', 'profile_history');
    setChip('profile-label-support', 'profile_support');

    // Initialize TON Price
    fetchTonPrice();
    setInterval(fetchTonPrice, 60000); // Update every minute
});

async function fetchTonPrice() {
    try {
        const response = await fetch('https://tonapi.io/v2/rates?tokens=ton&currencies=usd');
        const data = await response.json();
        if (data && data.rates && data.rates.TON) {
            GLOBAL_TON_PRICE = parseFloat(data.rates.TON.prices.USD);
            console.log("Updated TON price:", GLOBAL_TON_PRICE);
        }
    } catch (e) {
        console.error("Failed to fetch TON price:", e);
    }
}
