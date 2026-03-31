// 🚀 Dynamic Backend Detection
const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.hostname.includes('trycloudflare.com');
var BACKEND_URL = isLocal ? window.location.origin : "https://octorent.duckdns.org";

let isTcModalMandatory = false;
// Consts
let tg = null;
let IS_SHARING_REF = false; // Prevent double clicks on referral share

const APP_VERSION = "1.2.5-meta-debug";
console.log("OctoRent Version:", APP_VERSION);
console.log("Using backend:", BACKEND_URL);

const MY_MARKUP = 0.20;
const FIAT_FEE_MULTIPLIER = 1.05; // +5% commission for bank transfer
const LAVATOP_MAX_RUB = 50000; // Lava.top practical limit per transaction
const MANIFEST_URL = BACKEND_URL + "/tonconnect-manifest.json";
let SELECTED_PAY_METHOD = 'TON';
let OPERATOR_CONTACTS = { admin: "@nerksqq", coder: "@Paulie_Gualtiery", support: "@Octorent_Support_bot" };

async function getOperatorContacts() {
    try {
        const r = await apiFetch(`${BACKEND_URL}/api/operator_contacts`);
        const d = await r.json();
        if (d.admin) OPERATOR_CONTACTS = d;
        updateDynamicTexts();
    } catch (e) {
        console.warn("Failed to fetch operator contacts:", e);
    }
}

function updateDynamicTexts() {
    const adminNode = document.querySelector('[data-i18n="insufficient_bot_balance_desc"]');
    if (adminNode) {
        // Just re-trigger translation logic or update manually if needed
        // For now, it's easier to just update the innerText if it's already rendered
        const currentLang = tg?.initDataUnsafe?.user?.language_code === 'ru' ? 'ru' : 'en';
        const template = TRANSLATIONS[currentLang]?.insufficient_bot_balance_desc || "";
        if (template.includes('@')) {
             adminNode.innerText = template.replace(/@\w+/, OPERATOR_CONTACTS.admin);
        }
    }
}

function handleSupportClick() {
    const url = OPERATOR_CONTACTS.support;
    if (!url) return;
    
    if (url.startsWith('https://')) {
        window.Telegram.WebApp.openTelegramLink(url);
    } else {
        // Если вдруг вернулся юзернейм
        window.Telegram.WebApp.openTelegramLink('https://t.me/' + url.replace('@', ''));
    }
}

/**
 * 🔒 Secure API fetch wrapper
 * Automatically injects Telegram initData for authentication
 */
async function apiFetch(url, options = {}) {
    if (url.startsWith(BACKEND_URL) || url.startsWith('/api') || !url.startsWith('http')) {
        options.headers = options.headers || {};
        if (window.Telegram?.WebApp?.initData) {
            options.headers['X-TG-Data'] = window.Telegram.WebApp.initData;
        }
    }
    return fetch(url, options);
}

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
let SEEN_ITEM_IDS = new Set(); // DUPLICATE PROTECTION
let GLOBAL_LOAD_ID = 0; // Tracking for stale request protection

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
        fee_notice_text: "Вы отправляете небольшую сумму TON для покрытия комиссии сети и работы сервиса. Остаток будет возвращен вам автоматически.",
        wallet_mgmt: "Управление кошельком",
        copy_address: "Копировать адрес",
        disconnect_wallet: "Отключить кошелек",
        all: "Все",
        select_all: "Выбрать все",
        select_collection_first: "Выберите NFT коллекцию, чтобы увидеть список моделей.",
        search_filter_hint: "Поиск {label}...",
        search_filter_global: " (Все NFT)",
        sort_newest: "Сначала новые",
        sort_price_asc: "Цена (По возрастанию)",
        sort_price_desc: "Цена (По убыванию)",
        sort_num_asc: "Номер (По возрастанию)",
        sort_num_desc: "Номер (По убыванию)",
        sort_model_rare: "Редкость модели",
        sort_bg_rare: "Редкость фона",
        sort_symbol_rare: "Редкость символа",
        invalid_price: "Некорректная цена",
        price_from_gt_to: "Цена 'от' не может быть больше 'до'",
        error_insufficient_funds: "Недостаточно средств на кошельке для совершения транзакции.",
        available_from: "Освободится",
        preorder_warning_no_relist: "Внимание: у этого NFT выключен авто-перевыставление. Предзаказ может не сработать, если владелец не выставит его вручную.",
        error_user_rejected: "Транзакция отменена в кошельке.",
        error_insufficient_funds: "Недостаточно средств на кошельке (нужно +~0.25 TON на комиссию).",
        error_sdk_init_failed: "Ошибка связи с кошельком. Попробуйте обновить страницу.",
        error_transaction_failed: "Транзакция не удалась. Проверьте баланс и попробуйте снова.",
        error_unknown: "Ошибка: {msg}",
        mode_rent_btn: "Каталог арендованных товаров",
        mode_shop_btn: "Каталог доступных для аренды товаров",
        cover_fee_warning: "Перед оплатой убедитесь, что данный ползунок отключен. Комиссия 5% уже включена в цену.",
        limit_3000_warning: "Лимит оплаты картой — 3000 ₽. Пожалуйста, уменьшите срок аренды.",
        ct_amount_no_change_title: "Не изменяйте сумму!",
        ct_amount_no_change_desc: "Если вы оплатите меньше, чем указано в чеке, ваш заказ не будет зачислен автоматически.",
        ct_instruction_desc_new: "Вы можете отключить этот ползунок, так как комиссия 5% уже включена в цену.",
        loading_to_rent: "Загрузка каталога арендованных товаров...",
        loading_to_shop: "Загрузка каталога доступных для аренды товаров...",
        rent_title_suffix: " (Аренда)",
        auto_relist_label: "Авто-перевыставление",
        insufficient_bot_balance_title: "Недостаточно средств",
        insufficient_bot_balance_desc: "На кошельке бота недостаточно средств. Пожалуйста, обратитесь к @nerksqq с просьбой о пополнении кошелька бота.",
        contact_admin_btn: "Написать",
        yes: "Да",
        no: "Нет",
        rented_by_you: "Арендовано вами",
        rented_by_others: "Арендовано",
        status_awaiting_fragment: "Ожидает подключения к Fragment",
        connect_to_fragment: "Подключить к Fragment",
        ends_in: "Освободится через",
        days_label: "Дни",
        day_label: "День",
        days_2_4: "Дня",

        // --- TC Tutorial ---
        tut_step_1: "Перейдите на сайт <a href='#' onclick='copyText(\"fragment.com\", event)' class='copy-link'>fragment.com</a>",
        tut_step_2: "Нажмите на кнопку <b>Connect Ton</b>",
        tut_step_3: "Нажмите на значок <b>копирования</b>, чтобы скопировать ссылку на подключение кошелька, где хранится актив.",
        tut_input_desc: "<b>Введите ссылку</b>, чтобы мы могли подключить кошелек с активом.",
        tut_step_4: "После подключения кошелька нажмите на <b>адрес кошелька</b>, далее кликните на кнопку <b>My Assets</b> и перейдите в тот раздел, в котором вы покупали актив (NFT, Номер, Юзернейм).",
        tut_step_5: "Выберите, куда именно вы хотите, чтобы показывался арендованный актив, и нажмите кнопку <b>Save</b>.",
        tut_step_6: "Поздравляем! Ваш актив теперь привязан к OctoRent. Приятного использования! ✨",
        tut_next: "Далее",
        tut_skip: "Пропустить",
        tut_finish: "Удачного пользования!",
        tut_connect: "Подключить актив",
        expired: "СРОК ИСТЕК",
        storage: "Хранилище",
        loading_item: "Загрузка товара...",
        ready: "Готово!",
        item_not_found: "Товар не найден",
        server_timeout: "Таймаут сервера",
        server_error: "Ошибка: {msg}",
        share_referral_text: "🎁 Твой подарок уже ждёт тебя в OctoRent!\n\nЗабирай его прямо сейчас — и получай призы на свой аккаунт ✨",
        referral_copy_success: "Реферальная ссылка скопирована!",
        withdraw_success: "Вывод успешно запрошен!",
        withdraw_min: "Минимальный баланс на вывод 0.1 TON",
        network_error: "Ошибка соединения",
        demo_data_notice: "Ошибка соединения с сервером. Показываем демо-данные.",
        friends_new_referral: "Новый реферал",
        friends_profit: "прибыль",
        friends_zero_rentals: "0 аренд",
        invoice_creating: "Создаем счет...",
        redirecting_to_pay: "Переходим к оплате...",
        invoice_error: "Ошибка при создании счета: {msg}",
        network_error_server: "Ошибка соединения с сервером",
        invoice_created_xrocket: "Инвойс создан! Оплатите в xRocket",
        error: "Ошибка",
        connect_wallet_ton: "Подключите TON кошелёк для оплаты",
        preparing_transaction: "Готовим транзакцию...",
        transaction_sent: "Транзакция отправлена!",
        payment_processing_ton: "Оплата обрабатывается сетью TON. Вы можете <b>сразу</b> ускорить процесс:",
        payment_processing_usdt: "Оплата USDT отправлена. Вы можете <b>сразу</b> ускорить процесс:",
        fragment_tc_link_label: "Ссылка для подключения к Fragment:",
        fragment_tc_link_placeholder: "Коснитесь здесь, чтобы вставить ссылку",
        fragment_tc_link_hint: "Вставьте ссылку из Telegram (Fragment), и бот подключит подарок <b>автоматически</b>, как только увидит оплату.",
        save_auto_connect: "Сохранить и Авто-подключить",
        skip_and_close: "Пропустить и закрыть",
        payment_prepare_error: "Ошибка подготовки платежа",
        transaction_send_error: "Ошибка при отправке транзакции",
        insert_link_first: "Сначала вставьте ссылку!",
        invalid_link_format: "Некорректный формат ссылки!",
        saving_link: "Сохраняем ссылку...",
        link_saved_success: "✅ Ссылка сохранена! Бот всё сделает сам.",
        save_error: "Ошибка сохранения",
        save_network_error: "Ошибка сети при сохранении",
        fee_details_rub_title: "Как рассчитывается цена в рублях:",
        fee_details_rub_desc: "Поскольку аренда происходит в сети TON, все расчеты привязаны к курсу криптовалюты.",
        fee_details_formula_label: "Формула:",
        fee_details_formula_val: "(TON + 0.2) × Курс × 1.05",
        fee_details_ton_gas: "TON + 0.2:",
        fee_details_ton_gas_desc: "Стоимость аренды + фиксированная комиссия сети за смарт-контракт.",
        fee_details_rate: "Курс:",
        fee_details_rate_desc: "Текущий курс TON к RUB (по данным TonAPI).",
        fee_details_markup: "1.05:",
        fee_details_markup_desc: "Наценка 5% за банковский эквайринг и вывод средств для оплаты аренды.",
        fee_details_rub_warning: "Минимальная сумма платежа картой — 49 ₽. Если итоговая сумма меньше, вы увидите предупреждение.",
        fee_details_ton_desc: "Для обработки транзакции необходимо отправить <b>0.2 TON</b>, остаток которых (<b>~0.14 TON</b>) будет возвращен вам автоматически после завершения срока аренды.",
        fee_details_xrocket_title: "Если оплата через xRocket:",
        fee_details_xrocket_desc: "Необходимо добавить <b>0.1 TON</b> — это комиссия платежного бота за вывод средств на внешний кошелек.",
        fee_details_why_external_title: "Зачем сервису выводить деньги на внешний кошелек?",
        fee_details_why_external_desc: "Это необходимо для прямого взаимодействия со смарт-контрактом Fragment, так как внутренние кошельки ботов не поддерживают выполнение сложных транзакций с контрактами.",
        fee_details_total_calc_title: "Как рассчитывается итоговая цена:",
        fee_details_ton_wallet: "TON Wallet:",
        fee_details_ton_wallet_desc: "Цена товара + комиссия сети (0.2 TON).",
        fee_details_xrocket_label: "xRocket:",
        fee_details_xrocket_desc_total: "Цена + 0.2 сеть + 0.1 вывод.",
        status_active: "Активен",
        status_processing: "Обработка...",
        error_loading_history: "Ошибка загрузки",
        address_copied: "Адрес скопирован!",
        wallet_not_connected: "Кошелек не подключен",
        rental_active_success: "Аренда активна!",
        listing_warning_title: "Этот подарок был выставлен на аренду менее 24 часов назад.",
        listed_at: "Выставлен:",
        connect_fragment_title: "Подключить Fragment",
        help_fee_body: `
            <div style="font-size: 14px; line-height: 1.6; color: #fff;">
                Для активации <b>смарт-контрактов для оплаты комисии блокчейна</b> необходимо отправить <b>0.2 TON</b>, остаток которых (<b>~0.14 TON</b>) будет возвращен вам автоматически после завершения срока аренды.
                <br><br>
                <div style="display: flex; gap: 8px; align-items: flex-start; background: rgba(52, 199, 89, 0.1); padding: 12px; border-radius: 12px; border: 1px solid rgba(52, 199, 89, 0.2);">
                    <span style="font-size: 18px;">✅</span>
                    <span style="color: #fff; font-size: 13px;"><b>Возврат работает автоматически:</b><br>
                    Смарт-контракт заберет только фактическую комиссию сети. Весь неиспользованный остаток моментально и автоматически возвращается на ваш кошелек!</span>
                </div>
            </div>
        `,
        help_listing_body: `
            <div style="font-size: 14px; line-height: 1.6; color: #fff;">
                Этот подарок был выставлен на аренду совсем недавно. Чтобы избежать проблем с транзакциями, мы рекомендуем подождать 24 часа перед арендой.
            </div>
        `,
        notification_enabled: "Уведомление включено",
        notification_disabled: "Уведомление выключено",
        awaiting_confirmation: "Ждем подтверждения...",
        confirmation_desc: "Обычно это занимает 15-40 секунд.<br>Пожалуйста, не закрывайте это окно.",
        tc_link_placeholder_short: "tc://...",
        history_empty_desc: "У вас пока нет активных или прошлых аренд",
        select_payment_method: "Выберите способ оплаты",
        pay_crypto: "Криптой",
        pay_card: "Картой",
        ton_native: "Нативная валюта сети TON",
        xrocket_fee: "комиссия за вывод 0.1 ТОН",
        xrocket_desc: "Оплата тоном через xRocket",
        amount_too_small: "Сумма слишком мала",
        min_card_payment: "Минимальный платеж картой — <b>{min} ₽</b>. Пожалуйста, выберите товар подороже или увеличьте срок аренды.",
        card_rf_sbp: "Карта РФ / СБП",
        no_network_fee: "Без комиссии сети",
        cloudtips_desc: "Мгновенная оплата через CloudTips",
        card_fee_notice: "* Цена включает комиссию сервиса 5% за банковский перевод.",
        total: "Итого:",
        pay_button: "Оплатить",
        about_network_fee: "О комиссии сети",
        network_fee_desc_default: "Сеть TON взимает небольшую оплату за каждую транзакцию."
    },
    en: {

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
        mode_rent_btn: "Rented items catalog",
        mode_shop_btn: "Available items catalog",
        loading_to_rent: "Loading rented items catalog...",
        loading_to_shop: "Loading available items catalog...",
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
        sort_newest: "Newest first",
        sort_price_asc: "Price (Low to High)",
        sort_price_desc: "Price (High to Low)",
        sort_num_asc: "Number (Low to High)",
        sort_num_desc: "Number (High to Low)",
        sort_model_rare: "Model Rarity",
        sort_bg_rare: "Backdrop Rarity",
        sort_symbol_rare: "Symbol Rarity",
        invalid_price: "Invalid price",
        price_from_gt_to: "Price 'from' cannot be greater than 'to'",
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
        days_2_4: "Days",

        // --- TC Tutorial ---
        tut_step_1: "Go to <a href='#' onclick='copyText(\"fragment.com\", event)' class='copy-link'>fragment.com</a>",
        tut_step_2: "Click <b>Connect Ton</b>",
        tut_step_3: "Click the <b>copy icon</b> to copy the connection link for the wallet where the asset is stored.",
        tut_input_desc: "<b>Enter the link</b> so we can connect the wallet with the asset.",
        tut_step_4: "After connecting, click your <b>wallet address</b>, then <b>My Assets</b> and go to the category of your asset (NFT, Number, or Username).",
        tut_step_5: "Choose where you want the asset to be displayed and click <b>Save</b>.",
        tut_step_6: "Congratulations! Your asset is now linked to OctoRent. Enjoy! ✨",
        rent_for: "Rent for",
        preorder_for: "Pre-order for",
        auto_relist_label: "Auto-relist",
        error_user_rejected: "Transaction rejected in wallet.",
        error_insufficient_funds: "Insufficient funds (need +~0.25 TON for fees).",
        error_sdk_init_failed: "Wallet connection error. Please refresh the page.",
        error_transaction_failed: "Transaction failed. Please check your balance.",
        error_unknown: "Error: {msg}",
        tut_finish: "Happy using!",
        tut_connect: "Connect Asset",
        expired: "EXPIRED",
        fee_notice_text: "You are sending a small amount of TON to cover network fees and service operation. The remainder will be returned to you automatically.",
        storage: "Storage",
        loading_item: "Loading item...",
        ready: "Ready!",
        item_not_found: "Item not found",
        server_timeout: "Server timeout",
        server_error: "Error: {msg}",
        share_referral_text: "🎁 Your gift is waiting for you at OctoRent!\n\nGet it now and receive prizes for your account ✨",
        referral_copy_success: "Referral link copied!",
        withdraw_success: "Withdrawal successfully requested!",
        withdraw_min: "Minimum withdrawal balance is 0.1 TON",
        network_error: "Network error",
        demo_data_notice: "Server connection error. Showing demo data.",
        friends_new_referral: "New referral",
        friends_profit: "profit",
        friends_zero_rentals: "0 rentals",
        invoice_creating: "Creating invoice...",
        redirecting_to_pay: "Redirecting to payment...",
        insufficient_bot_balance_title: "Insufficient Funds",
        insufficient_bot_balance_desc: "The bot's wallet has insufficient funds. Please contact @nerksqq to request a refill.",
        contact_admin_btn: "Contact",
        invoice_error: "Error creating invoice: {msg}",
        network_error_server: "Server connection error",
        invoice_created_xrocket: "Invoice created! Pay in xRocket",
        error: "Error",
        connect_wallet_ton: "Connect TON wallet for payment",
        preparing_transaction: "Preparing transaction...",
        transaction_sent: "Transaction sent!",
        payment_processing_ton: "Payment is being processed by the TON network. You can speed up the process <b>immediately</b>:",
        payment_processing_usdt: "USDT payment sent. You can speed up the process <b>immediately</b>:",
        fragment_tc_link_label: "Link to connect to Fragment:",
        fragment_tc_link_placeholder: "Tap here to paste link",
        fragment_tc_link_hint: "Paste the link from Telegram (Fragment), and the bot will connect the gift <b>automatically</b> once it sees the payment.",
        save_auto_connect: "Save and Auto-Connect",
        skip_and_close: "Skip and close",
        payment_prepare_error: "Payment preparation error",
        transaction_send_error: "Error sending transaction",
        insert_link_first: "Paste the link first!",
        invalid_link_format: "Invalid link format!",
        saving_link: "Saving link...",
        link_saved_success: "✅ Link saved! The bot will do everything automatically.",
        save_error: "Save error",
        save_network_error: "Network error while saving",
        fee_details_rub_title: "How the price in RUB is calculated:",
        fee_details_rub_desc: "As the rental happens on the TON network, all calculations are tied to the cryptocurrency rate.",
        fee_details_formula_label: "Formula:",
        fee_details_formula_val: "(TON + 0.2) × Rate × 1.05",
        fee_details_ton_gas: "TON + 0.2:",
        fee_details_ton_gas_desc: "Rental cost + fixed network fee for the smart contract.",
        fee_details_rate: "Rate:",
        fee_details_rate_desc: "Current TON to RUB rate (according to TonAPI).",
        fee_details_markup: "1.05:",
        fee_details_markup_desc: "5% markup for bank acquiring and funds withdrawal for rental payment.",
        fee_details_rub_warning: "The minimum bank card payment is 49 ₽. If the total is less, you will see a warning.",
        fee_details_ton_desc: "To process the transaction, you must send <b>0.2 TON</b>, of which the remaining (<b>~0.14 TON</b>) will be returned to you automatically after the rental ends.",
        fee_details_xrocket_title: "If paying via xRocket:",
        fee_details_xrocket_desc: "You need to add <b>0.1 TON</b> — this is the payment bot's fee for withdrawing funds to an external wallet.",
        fee_details_why_external_title: "Why does the service withdraw money to an external wallet?",
        fee_details_why_external_desc: "This is necessary for direct interaction with the Fragment smart contract, as internal bot wallets do not support executing complex transactions with contracts.",
        fee_details_total_calc_title: "How the total price is calculated:",
        fee_details_ton_wallet: "TON Wallet:",
        fee_details_ton_wallet_desc: "Item price + network fee (0.2 TON).",
        fee_details_xrocket_label: "xRocket:",
        fee_details_xrocket_desc_total: "Price + 0.2 network + 0.1 withdrawal.",
        status_active: "Active",
        status_processing: "Processing...",
        error_loading_history: "Loading error",
        address_copied: "Address copied!",
        wallet_not_connected: "Wallet not connected",
        rental_active_success: "Rental is active!",
        listing_warning_title: "This gift was listed for rent less than 24 hours ago.",
        listed_at: "Listed at:",
        connect_fragment_title: "Connect Fragment",
        help_fee_body: `
            <div style="font-size: 14px; line-height: 1.6; color: #fff;">
                To activate <b>smart contracts for blockchain fees</b>, you must send <b>0.2 TON</b>, of which the remaining (<b>~0.14 TON</b>) will be returned to you automatically after the rental ends.
                <br><br>
                <div style="display: flex; gap: 8px; align-items: flex-start; background: rgba(52, 199, 89, 0.1); padding: 12px; border-radius: 12px; border: 1px solid rgba(52, 199, 89, 0.2);">
                    <span style="font-size: 18px;">✅</span>
                    <span style="color: #fff; font-size: 13px;"><b>Refund works automatically:</b><br>
                    The smart contract will only take the actual network fee. All unused balance is instantly and automatically returned to your wallet!</span>
                </div>
            </div>
        `,
        help_listing_body: `
            <div style="font-size: 14px; line-height: 1.6; color: #fff;">
                This gift was listed for rent recently. To avoid transaction issues, we recommend waiting 24 hours before renting.
            </div>
        `,
        notification_enabled: "Notification enabled",
        notification_disabled: "Notification disabled",
        awaiting_confirmation: "Awaiting confirmation...",
        confirmation_desc: "Usually takes 15-40 seconds.<br>Please do not close this window.",
        tc_link_placeholder_short: "tc://...",
        history_empty_desc: "You don't have any active or past rentals yet",
        select_payment_method: "Select Payment Method",
        pay_crypto: "Crypto",
        pay_card: "Bank Card",
        ton_native: "Native TON network currency",
        xrocket_fee: "withdrawal fee 0.1 TON",
        xrocket_desc: "Pay with TON via xRocket",
        amount_too_small: "Amount too small",
        min_card_payment: "Minimum card payment is <b>{min} ₽</b>. Please select a more expensive item or increase the rental period.",
        card_rf_sbp: "RF Card / SBP",
        no_network_fee: "No network fee",
        cloudtips_desc: "Instant payment via CloudTips",
        card_fee_notice: "* Price includes a 5% service fee for bank transfer.",
        total: "Total:",
        pay_button: "Pay",
        about_network_fee: "About network fee",
        network_fee_desc_default: "The TON network charges a small fee for each transaction."
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
    } else {
        const el = document.createElement('textarea');
        el.value = text;
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
    }
};

function showToast(msg) {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.style.cssText = 'position:fixed; bottom:100px; left:50%; transform:translateX(-50%); z-index:10000; pointer-events:none; display:flex; flex-direction:column; align-items:center; gap:8px;';
        document.body.appendChild(container);
    }

    // Remove existing toasts to prevent stacking
    container.innerHTML = '';

    const toast = document.createElement('div');
    toast.className = 'toast-notification active'; // CSS handles transition
    toast.innerText = msg;
    container.appendChild(toast);
    setTimeout(() => {
        toast.classList.remove('active');
        setTimeout(() => { if (toast.parentNode === container) toast.remove(); }, 300);
    }, 3000);
}
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

    if (type === 'symbol') {
        const cleanName = name.replace(/[?#]/g, ''); // Basic sanitization
        return `file/gifts/symbol/${cleanName}.webp`;
    }

    if (type === 'model') {
        // Models use format: /file/gifts/collectionslug/model.webp
        // We need collection slug for this
        if (collection) {
            const colSlug = collection.toLowerCase().replace(/[^a-z0-9]/g, '');
            const modelSlug = name.toLowerCase().replace(/[^a-z0-9]/g, '');
            return `file/gifts/${colSlug}/model.${modelSlug}.webp`;
        }

        // Fallback or old logic if no collection context
        const slugBase = name.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/[\s]+/g, '');
        const numbers = [888, 1, 777, 555, 123, 100];
        if (slugIndex < numbers.length) {
            return `https://nft.fragment.com/gift/${slugBase}-${numbers[slugIndex]}.medium.jpg`;
        }
        return null;
    }

    if (type === 'nft') {
        // NFT collections use format: /file/gifts/collectionslug/thumb.webp
        const collectionSlug = name.toLowerCase().replace(/[^a-z0-9]/g, '');
        return `file/gifts/${collectionSlug}/thumb.webp`;
    }

    return null;
}

let ACTIVE_FILTERS = {
    nft: [],
    model: [],
    bg: [],
    symbol: [],
    tags: [],
    sort: 'id_desc',
    price_from: null,
    price_to: null,
    gift_number: null,
    search: ""
};



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
        'view-storage-label': t('storage'),
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
            tg.ready();
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
        loadProfileData();
        // ✅ Await filter data first so ACTIVE_FILTERS state is stable before catalog loads
        await loadFilterData();

        // 🚀 NON-BLOCKING: Start loading but don't AWAIT here
        const catalogPromise = loadLiveItems(true);

        const urlParams = new URLSearchParams(window.location.search);
        let deepNftAddr = urlParams.get('nft_address');

        if (!deepNftAddr && tg.initDataUnsafe && tg.initDataUnsafe.start_param) {
            const sp = tg.initDataUnsafe.start_param;
            if (sp.startsWith('nft_')) deepNftAddr = sp.replace('nft_', '');
        }

        if (deepNftAddr) {
            console.log("🚀 Deep link:", deepNftAddr);
            showToast(t('loading_item'));
            const tMap = { 'gift': 0, 'username': 1, 'number': 2 };

            const openDeepItem = (it) => {
                if (!it) return;
                const idx = tMap[it.type];
                if (idx !== undefined) switchTab(idx);
                setTimeout(() => {
                    openProductView(it);
                    showToast(t('ready'));
                }, 800);
            };

            (async () => {
                try {
                    // Quick check local cache (wait max 2s for catalog)
                    await Promise.race([catalogPromise, new Promise(r => setTimeout(r, 2000))]);
                    const cached = (ALL_MARKET_ITEMS || []).find(x => {
                        const a = String(x.nft_address || '').toLowerCase();
                        const t = deepNftAddr.toLowerCase();
                        return a === t || a.replace(/-/g, '+').replace(/_/g, '/') === t.replace(/-/g, '+').replace(/_/g, '/');
                    });

                    if (cached) {
                        openDeepItem(cached);
                        return;
                    }

                    // Fetch from server with timeout
                    const ctrl = new AbortController();
                    const tid = setTimeout(() => ctrl.abort(), 10000);
                    const r = await apiFetch(`${BACKEND_URL}/api/nft_details?nft_address=${encodeURIComponent(deepNftAddr)}`, { signal: ctrl.signal });
                    clearTimeout(tid);

                    if (!r.ok) throw new Error("HTTP " + r.status);
                    const d = await r.json();
                    if (d && (d.address || d.nft_address)) {
                        const m = d.metadata || {};
                        const iName = d.name || d.nft_name || d.title || '';
                        let type = d.type || 'gift';
                        if (iName.startsWith('@')) type = 'username';
                        else if (iName.startsWith('+')) type = 'number';

                        openDeepItem({
                            id: d.id || Date.now(),
                            nft_address: d.address || d.nft_address,
                            nft_name: iName,
                            nft_image: d.image || m.image,
                            _realImage: d.image || m.image,
                            price_per_day: d.price_per_day || 0,
                            status: d.status || 'available',
                            type: type,
                            metadata: typeof d.metadata === 'string' ? d.metadata : JSON.stringify(d.metadata || {})
                        });
                    } else {
                        showToast(t('item_not_found'));
                    }
                } catch (e) {
                    console.error("DL Error:", e);
                    showToast(e.name === 'AbortError' ? t('server_timeout') : t('server_error', { msg: e.message }));
                }
            })();
        }

        await catalogPromise; // Ensure catalog is fully loaded for normal browsing
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

        document.getElementById('search-input').addEventListener('input', debounce((e) => {
            const val = e.target.value.toLowerCase();
            if (ACTIVE_FILTERS.search === val) return; // Prevent redundant load if value didn't change
            ACTIVE_FILTERS.search = val;
            loadLiveItems(true);
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
                    // e.preventDefault();
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

    } catch (e) { console.error("Init Error: ", e); }
});

function switchTab(index) {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach((nav, i) => {
        nav.classList.toggle('active', i === index);
    });

    // Toggle classes on body for CSS-based visibility
    document.body.classList.toggle('tab-market', index < 3);
    document.body.classList.toggle('tab-other', index >= 3);
    document.body.classList.toggle('tab-gifts', index === 0);

    // Reset all major containers
    document.getElementById('market-container').style.display = 'none';
    document.getElementById('profile-container').style.display = 'none';
    document.getElementById('friends-container').style.display = 'none';
    document.getElementById('mode-toggle-container').style.display = 'none';
    closeMrktModal(); // Ensure filters are closed when switching tabs

    // Toggle Search & Filters visibility via JS as well for safety
    const searchWrapper = document.querySelector('.search-wrapper');
    const chipsRow = document.querySelector('.chips-row');
    if (searchWrapper) searchWrapper.style.display = (index >= 3) ? 'none' : 'block';
    if (chipsRow) chipsRow.style.display = (index >= 3) ? 'none' : 'flex';

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
        document.getElementById('mode-toggle-container').style.display = 'block';

        const headerTitle = document.querySelector('.header h1') || document.querySelector('.logo-text');
        if (headerTitle) {
            let baseTitle = t('gifts');
            if (index === 1) baseTitle = t('usernames');
            if (index === 2) baseTitle = t('numbers');
            headerTitle.innerText = baseTitle + (CURRENT_STATUS === 'rented' ? t('rent_title_suffix') : '');
        }
    } else if (index === 3) { // Friends tab (NEW RESTORATION)
        document.getElementById('friends-container').style.display = 'block';
        const headerTitle = document.querySelector('.header h1') || document.querySelector('.logo-text');
        if (headerTitle) headerTitle.innerText = t('friends') || 'Друзья';
        loadFriendsData();
    } else if (index === 4) { // Profile tab
        document.getElementById('profile-container').style.display = 'block';
        const headerTitle = document.querySelector('.header h1') || document.querySelector('.logo-text');
        if (headerTitle) headerTitle.innerText = t('profile');
        if (window.Telegram && window.Telegram.WebApp) {
            tg.HapticFeedback.impactOccurred('medium');
        }
    }

    // Nav mode (profile vs other)
    const bNav = document.querySelector('.bottom-nav');
    if (bNav) {
        if (index === 4) bNav.classList.add('profile-mode');
        else bNav.classList.remove('profile-mode');
    }

    // Filter visibility logic
    if (index === 1 || index === 2 || index === 3) { // Usernames, Numbers, or Friends
        document.body.classList.add('hide-filters');
    } else {
        document.body.classList.remove('hide-filters');
    }
}

// --- Friends Logic ---
async function loadFriendsData() {
    const userId = tg.initDataUnsafe?.user?.id || 0;
    try {
        // Параллельно запрашиваем баланс и список друзей
        const [statsRes, friendsRes] = await Promise.all([
            apiFetch(`${BACKEND_URL}/api/referral/stats?user_id=${userId}`),
            apiFetch(`${BACKEND_URL}/api/referral/friends?user_id=${userId}`)
        ]);
        const statsData = await statsRes.json();
        const friendsData = await friendsRes.json();

        const balEl = document.getElementById('friends-balance-val');
        if (balEl) balEl.innerText = (statsData.balance || 0).toFixed(4);

        const listCont = document.getElementById('friends-list-items');
        if (!listCont) return;

        const friends = friendsData.friends || [];

        if (friends.length === 0) {
            document.getElementById('empty-friends-hint').style.display = 'block';
            return;
        }

        document.getElementById('empty-friends-hint').style.display = 'none';
        listCont.innerHTML = friends.map(f => {
            const name = f.full_name || (f.username ? '@' + f.username : ('ID: ' + f.user_id));
            const displayLabel = f.username || f.full_name || String(f.user_id);
            const fallbackUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(displayLabel)}&background=0088cc&color=fff&size=44&bold=true&rounded=true`;
            // Try backend proxy (real Telegram photo for any user)
            const avatarUrl = `${BACKEND_URL}/api/user-avatar?user_id=${f.user_id}`;
            const profit = f.profit || 0;
            return `
                <div class="service-item" style="cursor: default;">
                    <img src="${avatarUrl}" style="width: 44px; height: 44px; border-radius: 50%; object-fit: cover; flex-shrink: 0;"
                         onerror="this.src='${fallbackUrl}'">
                    <div style="flex: 1; margin-left: 12px;">
                        <div style="font-weight: 700; font-size: 15px;">${name}</div>
                        ${profit === 0 ? `<div style="font-size: 11px; color: #8b9bb4;">${t('friends_new_referral')}</div>` : ''}
                    </div>
                    <div style="text-align: right;">
                        ${profit > 0 ? `<div style="font-weight: 800; font-size: 14px; color: #0088cc;">+${profit.toFixed(4)} TON</div><div style="font-size: 11px; color: #8b9bb4; opacity: 0.6;">${t('friends_profit')}</div>` : `<div style="font-size: 12px; color: #8b9bb4;">${t('friends_zero_rentals')}</div>`}
                    </div>
                </div>
            `;
        }).join('');

    } catch (e) {
        console.error("Load Friends Error:", e);
    }
}

function showEarningsHelp() {
    console.log("Earnings help clicked");
    const sheet = document.getElementById('earnings-help-sheet');
    if (sheet) sheet.classList.add('active');
}

function closeEarningsHelp() {
    const sheet = document.getElementById('earnings-help-sheet');
    if (sheet) sheet.classList.remove('active');
}

async function shareReferralLink() {
    if (IS_SHARING_REF) return;
    IS_SHARING_REF = true;

    console.log("shareReferralLink called!");
    // Diagnostic log
    console.log("SDK Support:", {
        sendPreparedInlineMessage: !!(window.Telegram?.WebApp?.sendPreparedInlineMessage),
        shareURL: !!(window.Telegram?.WebApp?.shareURL),
        switchInlineQuery: !!(window.Telegram?.WebApp?.switchInlineQuery)
    });

    const btn = document.querySelector('.btn-invite-white');
    const originalText = btn ? btn.innerText : null;
    if (btn) {
        btn.style.opacity = '0.7';
        btn.innerText = '...';
    }

    const userId = (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initDataUnsafe?.user?.id) || 0;
    const botUser = "OctoRent_bot";
    const refLink = `https://t.me/${botUser}/app?startapp=${userId}`;
    const shareText = t('share_referral_text');

    try {
        // Step 1: try shareURL (standard link sharing with preview)
        if (window.Telegram?.WebApp?.shareURL) {
            console.log("Using shareURL for refLink");
            window.Telegram.WebApp.shareURL(refLink, shareText);
            return;
        }

        // Step 2: fall back to switchInlineQuery
        if (window.Telegram?.WebApp?.switchInlineQuery) {
            console.log("Using switchInlineQuery fallback");
            window.Telegram.WebApp.switchInlineQuery('ref', ['users', 'groups', 'channels']);
            return;
        }

        // Step 3: Copy to clipboard as last resort
        console.log("Using clipboard fallback");
        copyToClipboard(refLink);
        showToast(t('referral_copy_success'));
    } catch (e) {
        console.error("Sharing failed:", e);
        showToast(t('network_error'));
    } finally {
        setTimeout(() => {
            IS_SHARING_REF = false;
            if (btn && originalText) {
                btn.style.opacity = '1';
                btn.innerText = originalText;
            }
        }, 1000);
    }
}

// Alias for filter modal
function openOctoModal() {
    console.log("Opening filter modal...");
    openAdvancedFilters();
}

let IS_WITHDRAWING = false;
async function handleReferralWithdraw() {
    if (IS_WITHDRAWING) return;
    IS_WITHDRAWING = true;

    const btn = document.querySelector('.withdraw-btn-white');
    const originalText = btn ? btn.innerText : null;
    if (btn) {
        btn.disabled = true;
        btn.style.opacity = '0.7';
        btn.innerText = t('processing');
    }

    console.log("Withdraw button clicked");
    const userId = tg.initDataUnsafe?.user?.id || 0;
    try {
        const res = await apiFetch(`${BACKEND_URL}/api/referral/withdraw`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: userId, amount: 0.1, wallet_address: "manual" })
        });
        const data = await res.json();
        if (data.status === 'ok') {
            showToast(t('withdraw_success'));
            loadFriendsData();
        } else {
            showToast(t('withdraw_min'));
        }
    } catch (e) {
        showToast(t('network_error'));
    } finally {
        setTimeout(() => {
            IS_WITHDRAWING = false;
            if (btn && originalText) {
                btn.disabled = false;
                btn.style.opacity = '1';
                btn.innerText = originalText;
            }
        }, 1500); // 1.5s debounce
    }
}

// --- Modal Logic ---


// --- Help Modal Logic ---
function showHelp(amount) {
    const title = document.getElementById('help-title');
    const body = document.getElementById('help-body');
    const modal = document.getElementById('help-modal');

    if (title) title.innerText = t('what_is_this');
    if (body) {
        if (amount === 'fee') {
            body.innerHTML = t('help_fee_body');
        } else if (amount === 'listing') {
            body.innerHTML = t('help_listing_body');
        }
    }

    if (modal) {
        modal.style.display = 'flex';
        setTimeout(() => modal.classList.add('active'), 10);
    }
}

function closeHelp() {
    const modal = document.getElementById('help-modal');
    if (modal) modal.classList.remove('active');
}

function closeTcModal() {
    document.getElementById('tc-modal-overlay').classList.remove('active');
    document.getElementById('tc-modal').classList.remove('active');
}
async function submitTcLink() {
    const orderId = document.getElementById('tc-current-order-id').value;
    const link = document.getElementById('tc-link-input').value.trim();
    const btn = document.querySelector('#tc-modal .tc-btn-premium') || document.querySelector('#tc-modal .btn-yellow');
    if (!btn) return;
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

    if (orderId === 'TEST_ID') {
        tg.showAlert("Это тестовый режим. В реальном приложении ссылка была бы отправлена на сервер.");
        btn.innerText = originalText;
        btn.disabled = false;
        return;
    }

    try {
        const url = `${BACKEND_URL}/api/submit_tc_link`;
        console.log("Fetching: " + url);
        const res = await apiFetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ order_id: parseInt(orderId), tc_link: link })
        });

        console.log("Response status: " + res.status);
        const data = await res.json();
        console.log("Response data:", data);

        if (data.status === 'ok') {
            console.log("SubmitTC Success. Switching to Phase 2 Tutorial.");
            // Phase 2: Success onboarding
            tutorialPhase = 2;
            currentTutorialStep = 4;
            const input = document.getElementById('tc-link-input');
            if (input) input.value = "";
            renderTutorialStep();
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

let currentLoadController = null;

async function loadLiveItems(reset = true) {
    const myId = ++GLOBAL_LOAD_ID;

    if (reset && currentLoadController) {
        currentLoadController.abort();
    }
    if (IS_LOADING && !reset) return;

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
        SEEN_ITEM_IDS.clear(); // Reset duplicates tracker
        ALL_MARKET_ITEMS = []; // 🚀 Clear global items list on reset
        
        // 🚀 IMMEDIATE CLEAR: Critical for preventing duplicate/stale catalogs on mobile/slow nets
        const container = document.getElementById('items-view');
        if (container) {
            container.innerHTML = '';
            // Also ensure no residual classes or attributes
            container.className = 'grid'; 
        }

        if (topLoader) topLoader.style.display = 'block';
        window.scrollTo({ top: 0, behavior: 'instant' });
    } else {
        if (scrollLoader) scrollLoader.style.display = 'block';
    }

    IS_LOADING = true;
    currentLoadController = new AbortController();
    const { signal } = currentLoadController;

    try {
        const params = new URLSearchParams({
            limit: BATCH_SIZE,
            offset: GLOBAL_OFFSET,
            type: CURRENT_TYPE,
            status: CURRENT_STATUS,
            nft: (CURRENT_TYPE === 'gift' ? ACTIVE_FILTERS.nft.join(',') : ""),
            model: (CURRENT_TYPE === 'gift' ? ACTIVE_FILTERS.model.join(',') : ""),
            bg: (CURRENT_TYPE === 'gift' ? ACTIVE_FILTERS.bg.join(',') : ""),
            symbol: (CURRENT_TYPE === 'gift' ? ACTIVE_FILTERS.symbol.join(',') : ""),
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
                response = await apiFetch(`${BACKEND_URL}/api/items?${params.toString()}`, { signal });
                if (response.ok) break;
            } catch (err) {
                if (err.name === 'AbortError') throw err;
                console.error(`Fetch attempt failed (${retries} retries left):`, err);
            }
            retries--;
            if (retries > 0) await new Promise(r => setTimeout(r, 1000));
        }

        if (signal.aborted || GLOBAL_LOAD_ID !== myId) return;

        if (!response || !response.ok) {
            throw new Error(`Server status: ${response ? response.status : 'Network Error'}`);
        }

        let data;
        try {
            data = await response.json();
        } catch (je) {
            console.error("JSON Parse Error:", je, "Response was:", response);
            throw new Error("Invalid server response (JSON parse failed)");
        }

        if (signal.aborted || GLOBAL_LOAD_ID !== myId) return;
        console.log(`Loaded ${data.items ? data.items.length : 0} items from server.`);

        if (data && data.items) {
            const items = data.items.filter(item => {
                const uid = item.nft_address || item.id;
                if (SEEN_ITEM_IDS.has(uid)) return false;
                SEEN_ITEM_IDS.add(uid);
                return true;
            });

            if (data.items.length < BATCH_SIZE) {
                console.log("No more items to load (reached end of collection).");
                HAS_MORE = false;
            }
            GLOBAL_OFFSET += data.items.length;

            // 🚀 POPULATE CACHE: Crucial for deep link matching!
            ALL_MARKET_ITEMS = ALL_MARKET_ITEMS.concat(items);

            const processed = items
                .filter(item => item.type === CURRENT_TYPE) // Strict client-side type check
                .map(item => {
                    const match = item.nft_name.match(/#(\d+)/);
                    item._nftNum = match ? parseInt(match[1]) : 0;
                    item._realImage = item.image || item.image_url;
                    return item;
                });

            if (reset && items.length === 0) {
                console.warn("No items found for current filters.");
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
                // Ensure any "Nothing found" or "Demo" message is removed before adding real items
                const view = document.getElementById('items-view');
                // CLEANUP: Use a more robust selector to find and remove error messages
                const staleElements = view.querySelectorAll('.error-msg, .demo-label');
                staleElements.forEach(el => el.remove());
                
                renderItemsBatch(processed);
            }

            if (reset) initFilterLists();
        } else {
            console.error("Server returned OK status but missing items field:", data);
        }

        if (document.getElementById('top-loader')) document.getElementById('top-loader').style.display = 'none';
        if (document.getElementById('scroll-loader')) document.getElementById('scroll-loader').style.display = 'none';
        hideLoading();
    } catch (e) {
        if (e.name === 'AbortError' || GLOBAL_LOAD_ID !== myId) {
            console.log("Load operation aborted or stale.");
            return;
        }
        console.error("CRITICAL Load Error:", e);
        if (reset && document.getElementById('top-loader')) {
            document.getElementById('top-loader').innerText = t('demo_data_notice');
            setTimeout(() => { if (document.getElementById('top-loader')) document.getElementById('top-loader').style.display = 'none'; }, 2000);
        }

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
        if (!signal.aborted) {
            IS_LOADING = false;
            if (typeof checkTriggerVisibility === 'function') {
                checkTriggerVisibility();
            }
            console.log(`loadLiveItems finished. Offset: ${GLOBAL_OFFSET}, HasMore: ${HAS_MORE}`);
        }
    }
}

/**
 * NEW: Checks if the loader trigger is still visible on screen after items were added.
 * If it is, and we have more items, it triggers the next load automatically.
 * This prevents the scroll from getting "stuck" if the loaded items didn't fill the screen.
 */
function checkTriggerVisibility() {
    if (!HAS_MORE || IS_LOADING) return;

    const trigger = document.getElementById('loader-trigger');
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const isVisible = rect.top < window.innerHeight && rect.bottom >= 0;

    if (isVisible) {
        console.log("Trigger is still visible after load. Auto-loading next batch...");
        loadLiveItems(false);
    }
}



function selectNftChip(addr, btn) {
    ACTIVE_FILTERS.nft = addr ? [addr] : [];
    document.querySelectorAll('.chip-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    loadLiveItems(true); // Trigger server-side refresh
}

async function loadFilterData() {
    try {
        console.log('[FILTERS] Loading from:', `${BACKEND_URL}/api/filters`);
        const res = await apiFetch(`${BACKEND_URL}/api/filters`);
        const data = await res.json();
        console.log('[FILTERS] Received keys:', Object.keys(data));

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
        { id: 'id_desc', n: t('sort_newest'), icon: 'pictures/filter icons/sort_num_desc.svg' },
        { id: 'price_asc', n: t('sort_price_asc'), icon: 'pictures/filter icons/sort_price_asc.svg' },
        { id: 'price_desc', n: t('sort_price_desc'), icon: 'pictures/filter icons/sort_price_desc.svg' },
        { id: 'num_asc', n: t('sort_num_asc'), icon: 'pictures/filter icons/sort_num_asc.svg' },
        { id: 'num_desc', n: t('sort_num_desc'), icon: 'pictures/filter icons/sort_num_desc.svg' },
        { id: 'model_rare', n: t('sort_model_rare'), icon: 'pictures/filter icons/sort_price_desc.svg' },
        { id: 'bg_rare', n: t('sort_bg_rare'), icon: 'pictures/filter icons/sort_price_desc.svg' },
        { id: 'symbol_rare', n: t('sort_symbol_rare'), icon: 'pictures/filter icons/sort_price_desc.svg' }
    ];
    if (sortCont) {
        sortCont.innerHTML = '';
        sorts.forEach(s => {
            const isSel = String(ACTIVE_FILTERS.sort).toLowerCase() === String(s.id).toLowerCase();
            addFilterItem(sortCont, s.n, s.id, 'sort', isSel, s.icon);
        });
    }

    const nftCont = document.getElementById('nft-list-container');
    const nftSearchInput = document.getElementById('filter-search-nft');
    if (!nftCont) return;

    const nftSearch = nftSearchInput ? nftSearchInput.value.toLowerCase() : "";
    nftCont.innerHTML = '';

    if (!nftSearch || t('all').toLowerCase().includes(nftSearch)) {
        addFilterItem(nftCont, t('all'), "all", 'nft', !ACTIVE_FILTERS.nft || ACTIVE_FILTERS.nft.length === 0);
    }

    (window.STATIC_COLLECTIONS || []).forEach(col => {
        const lowerName = col.name.toLowerCase();
        if (lowerName.includes(nftSearch) && !lowerName.includes('phantom') && !lowerName.includes('unknown')) {
            const isSel = (ACTIVE_FILTERS.nft || []).some(x => String(x).trim() === col.name.trim());
            addFilterItem(nftCont, col.name, col.name, 'nft', isSel, col.image);
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

        const isNFTSelected = (Array.isArray(selectedNFT) && selectedNFT.length > 0);

        // Define which items to show
        let itemsToShow = [];

        if (m.key === 'model') {
            if (!isNFTSelected) {
                cont.innerHTML = `<div style="padding:20px; color:#8b9bb4; text-align:center; font-size:13px; background:rgba(255,255,255,0.03); border-radius:12px; margin-top:10px;">${t('select_collection_first')}</div>`;
                sInput.disabled = true;
                return;
            }

            sInput.disabled = false;
            sInput.placeholder = t('search_filter_hint', { label: m.label });

            if (selectedNFT.length === 1) {
                // SINGLE: Flat list
                const col = selectedNFT[0];
                const list = (ATTR_STATS.model && ATTR_STATS.model[col]) || [];
                const filtered = list.filter(it => it.name.toLowerCase().includes(sVal) && !it.name.toLowerCase().includes('phantom'));

                if (!sVal || t('select_all').toLowerCase().includes(sVal)) {
                    addFilterItem(cont, t('select_all'), "all", 'model', !ACTIVE_FILTERS.model || ACTIVE_FILTERS.model.length === 0);
                }

                filtered.sort((a, b) => a.name.localeCompare(b.name)).forEach(item => {
                    let icon = getTelegifterUrl('model', item.name, col);
                    const isSel = (ACTIVE_FILTERS.model || []).some(x => String(x).trim() === item.name.trim());
                    addFilterItem(cont, item.name, item.name, 'model', isSel, icon, col, item.image);
                });
            } else {
                // MULTIPLE: Nested sub-accordions
                selectedNFT.forEach(col => {
                    const list = (ATTR_STATS.model && ATTR_STATS.model[col]) || [];
                    const filtered = list.filter(it => it.name.toLowerCase().includes(sVal) && !it.name.toLowerCase().includes('phantom'));

                    if (filtered.length > 0) {
                        const subId = `model-sub-${col.replace(/\s+/g, '-')}`;

                        // Auto-expand if ANY models are selected in this specific collection
                        const hasSelectedInCol = ACTIVE_FILTERS.model.some(selName => list.some(it => it.name === selName));

                        const subCont = addFilterSubAccordion(cont, col, subId, hasSelectedInCol);

                        filtered.sort((a, b) => a.name.localeCompare(b.name)).forEach(item => {
                            let icon = getTelegifterUrl('model', item.name, col);
                            const isSel = (ACTIVE_FILTERS.model || []).some(x => String(x).trim() === item.name.trim());
                            addFilterItem(subCont, item.name, item.name, 'model', isSel, icon, col, item.image);
                        });
                    }
                });
            }
            return; // Models handled specially
        } else {
            // BG & SYMBOLS: Global selection allowed (they are grouped under "ALL" in loadFilterData)
            const list = (ATTR_STATS[m.key] && (ATTR_STATS[m.key]["ALL"] || [])) || [];
            itemsToShow = list.map(it => ({ ...it, collection: "ALL" }));
        }

        itemsToShow.sort((a, b) => a.name.localeCompare(b.name));

        sInput.disabled = false;
        sInput.placeholder = isNFTSelected ? t('search_filter_hint', { label: m.label }) : t('search_filter_hint', { label: m.label }) + t('search_filter_global');

        if (!sVal || t('select_all').toLowerCase().includes(sVal)) {
            addFilterItem(cont, t('select_all'), "all", m.key, !ACTIVE_FILTERS[m.key] || ACTIVE_FILTERS[m.key].length === 0);
        }

        itemsToShow.forEach(item => {
            const lowerName = item.name.toLowerCase();
            if (lowerName.includes(sVal) && !lowerName.includes('phantom') && !lowerName.includes('unknown')) {
                let icon = null;
                if (m.key === 'symbol') icon = getTelegifterUrl('symbol', item.name);
                else if (m.key === 'model') icon = getTelegifterUrl('model', item.name, item.collection);

                if (!icon && (m.key === 'bg' || m.key === 'symbol')) icon = VISUAL_MAP[m.key][item.name] || null;
                const isSel = (ACTIVE_FILTERS[m.key] || []).some(x => String(x).trim() === item.name.trim());
                addFilterItem(cont, item.name, item.name, m.key, isSel, icon, item.collection, item.image);
            }
        });
    });

    // --- UPDATE CHIP LABELS ---
    const updateChip = (id, key, defaultLabel) => {
        const el = document.getElementById(id);
        if (el) return;
        const val = ACTIVE_FILTERS[key];
        if (val && val.length > 0) {
            el.innerText = val.length === 1 ? val[0] : `${defaultLabel} (${val.length})`;
            el.parentElement.classList.add('active'); // Highlight active chip
        } else {
            el.innerText = defaultLabel;
            el.parentElement.classList.remove('active');
        }
    };

    updateChip('chip-label-nft', 'nft', 'NFT');
    updateChip('chip-label-model', 'model', t('model'));
    updateChip('chip-label-bg', 'bg', t('backdrop'));
    updateChip('chip-label-symbol', 'symbol', t('symbol'));
}

function addFilterSubAccordion(container, title, subId, autoExpand = false) {
    const header = document.createElement('div');
    header.className = `filter-sub-accordion ${autoExpand ? 'active' : ''}`;
    header.innerHTML = `
        <span>${title}</span>
        <div class="sub-accordion-arrow">▼</div>
    `;

    const content = document.createElement('div');
    content.id = subId;
    content.className = `sub-accordion-content ${autoExpand ? 'active' : ''}`;

    // ADD SUB-SEARCH
    const searchWrapper = document.createElement('div');
    searchWrapper.className = 'filter-sub-search-wrapper';
    searchWrapper.onclick = (e) => e.stopPropagation(); // Don't trigger accordion toggle

    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.className = 'filter-sub-search-input';
    searchInput.placeholder = t('search_model');

    searchInput.oninput = (e) => {
        const val = e.target.value.toLowerCase();
        const rows = content.querySelectorAll('.filter-list-row');
        rows.forEach(row => {
            const label = row.querySelector('.filter-label');
            if (!label) return;
            const text = label.innerText.toLowerCase();
            row.style.display = text.includes(val) || text === t('select_all').toLowerCase() ? 'flex' : 'none';
        });
    };

    searchWrapper.appendChild(searchInput);
    content.appendChild(searchWrapper);

    header.onclick = () => {
        header.classList.toggle('active');
        content.classList.toggle('active');
    };

    container.appendChild(header);
    container.appendChild(content);
    return content;
}


function addFilterItem(container, name, value, key, isSelected, imgUrl, collectionContext, fallbackImgUrl) {
    const div = document.createElement('div');
    div.className = `filter-list-row ${isSelected ? 'selected' : ''}`;

    const isAll = value === 'all';

    let visualHTML = '';
    if (isAll) {
        visualHTML = `<div class="filter-icon-box" style="background: rgba(255,255,255,0.05); color: #fff; font-size: 10px; font-weight: 900; letter-spacing: 0.5px;">BCE</div>`;
    } else if (key === 'symbol') {
        const tgSymbol = getTelegifterUrl('symbol', name);
        const iconSrc = tgSymbol || (VISUAL_MAP.symbol && VISUAL_MAP.symbol[name]);
        visualHTML = `<div class="filter-icon-box" style="background: #000;"><img src="${iconSrc}" class="filter-img" style="filter: brightness(0) invert(1); width:28px; height:28px; object-fit:contain;" onerror="this.style.display='none'"></div>`;
    } else if (key === 'bg') {
        const bgStyle = (VISUAL_MAP.bg && VISUAL_MAP.bg[name]) || '#333';
        visualHTML = `<div class="filter-icon-box" style="background: ${bgStyle}; position:relative; overflow:hidden;">
            <div style="position:absolute; top:0; left:0; width:100%; height:100%; background: url('https://telegifter.ru/wp-content/themes/gifts/assets/img/bg-logo-mini.webp'); opacity:0.3; background-size: 20px;"></div>
        </div>`;
    } else {
        // Model or NFT or fallback
        let icon = imgUrl;
        if (key === 'model') {
            // Priority: Local model image
            icon = getTelegifterUrl('model', name, collectionContext);
            if (!icon) {
                const cleanColl = (collectionContext || '').toLowerCase().replace(/[^a-z0-9]/g, '');
                if (cleanColl) icon = `file/gifts/${cleanColl}/thumb.webp`;
                else icon = `models/${name}.webp`;
            }
        } else if (key === 'nft') {
            const cleanName = name.toLowerCase().replace(/[^a-z0-9]/g, '');
            icon = `/file/gifts/${cleanName}/thumb.webp`;
        }

        if (!icon || isBadUrl(icon)) {
            if (key === 'nft') {
                let n = name;
                if (n.endsWith('s') && n.length > 4) n = n.slice(0, -1);
                const f = generateFragmentUrls(n + " #1", 0);
                icon = f.image;
            }
        }

        if (key === 'nft' || key === 'model' || key === 'bg' || key === 'symbol') {
            visualHTML = `<div class="filter-icon-box" style="background: rgba(255,255,255,0.03);">
                <img src="${icon}" class="filter-img" style="width:100%; height:100%; object-fit:contain; z-index:2; opacity:0; transition:opacity 0.2s; padding:0;" 
                    onload="this.style.opacity='1';"
                    onerror="handleFilterImageError(this, '${name.replace(/'/g, "\\'")}', '${(collectionContext || '').replace(/'/g, "\\'")}', '${(fallbackImgUrl || '').replace(/'/g, "\\'")}', '${key}')">
            </div>`;
        } else if (key === 'sort') {
            visualHTML = `<div class="filter-icon-box sort-icon" style="background: transparent !important; border: none !important;"><img src="${imgUrl}" class="filter-img" style="width:20px; height:20px; object-fit:contain; filter: brightness(0) invert(1);"></div>`;
        } else {
            visualHTML = `<div class="filter-checkmark ${isSelected ? 'visible' : ''}">✓</div>`;
        }
    }

    div.innerHTML = `
        <div class="filter-left" style="flex: 1;">
            ${visualHTML}
            <span class="filter-label" style="flex: 1; margin-left:14px;">${name}</span>
        </div>
        <div class="filter-checkbox"></div>
    `;
    div.onclick = (e) => {
        e.stopPropagation();

        if (value === 'all' || !value) {
            ACTIVE_FILTERS[key] = (key === 'sort') ? ['id_desc'] : [];
        } else {
            const v = String(value).trim();
            if (key === 'sort') {
                ACTIVE_FILTERS.sort = v;
            } else {
                if (!Array.isArray(ACTIVE_FILTERS[key])) ACTIVE_FILTERS[key] = [];
                // Search for trimmed match to be safe
                const idx = ACTIVE_FILTERS[key].findIndex(existing => String(existing).trim() === v);
                if (idx > -1) {
                    ACTIVE_FILTERS[key].splice(idx, 1);
                } else {
                    ACTIVE_FILTERS[key].push(v);
                }
            }
        }

        // Sync inputs from modal if visible
        const gNum = document.getElementById('filter-gift-number');
        const pFrom = document.getElementById('filter-price-from');
        const pTo = document.getElementById('filter-price-to');
        if (gNum) ACTIVE_FILTERS.gift_number = gNum.value;
        if (pFrom) ACTIVE_FILTERS.price_from = pFrom.value;
        if (pTo) ACTIVE_FILTERS.price_to = pTo.value;

        if (key === 'nft') {
            ACTIVE_FILTERS.model = [];
            ACTIVE_FILTERS.bg = [];
            ACTIVE_FILTERS.symbol = [];
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



function openAdvancedFilters() {
    const modal = document.getElementById('mrkt-modal');
    const overlay = document.getElementById('mrkt-modal-overlay');
    if (modal) modal.classList.add('active');
    if (overlay) overlay.classList.add('active');
    initFilterLists(); // Re-render lists with current selected state
}

function closeMrktModal() {
    const modal = document.getElementById('mrkt-modal');
    const overlay = document.getElementById('mrkt-modal-overlay');
    if (modal) modal.classList.remove('active');
    if (overlay) overlay.classList.remove('active');
}

function resetMrktModal() {
    ACTIVE_FILTERS = {
        nft: [],
        model: [],
        bg: [],
        symbol: [],
        tags: [],
        sort: 'id_desc',
        price_from: null,
        price_to: null,
        gift_number: null,
        search: ""
    };

    const sInp = document.getElementById('search-input');
    if (sInp) sInp.value = "";

    const gNum = document.getElementById('filter-gift-number');
    const pFrom = document.getElementById('filter-price-from');
    const pTo = document.getElementById('filter-price-to');

    if (gNum) gNum.value = "";
    if (pFrom) pFrom.value = "";
    if (pTo) pTo.value = "";

    initFilterLists();
    applyHeaderSearch();
}

function applyMrktModal() {
    const gNum = document.getElementById('filter-gift-number');
    const pFrom = document.getElementById('filter-price-from');
    const pTo = document.getElementById('filter-price-to');

    const vf = pFrom ? pFrom.value.replace(',', '.') : "";
    const vt = pTo ? pTo.value.replace(',', '.') : "";

    // Validation
    if (vf && isNaN(parseFloat(vf))) {
        showToast(t('invalid_price'));
        return;
    }
    if (vt && isNaN(parseFloat(vt))) {
        showToast(t('invalid_price'));
        return;
    }
    if (vf && vt && parseFloat(vf) > parseFloat(vt)) {
        showToast(t('price_from_gt_to'));
        return;
    }

    ACTIVE_FILTERS.gift_number = gNum ? gNum.value : "";
    ACTIVE_FILTERS.price_from = vf;
    ACTIVE_FILTERS.price_to = vt;

    closeMrktModal();
    loadLiveItems(true);
}

function handleFilterImageError(img, name, collection, fallback, key) {
    img.dataset.slugIndex = img.dataset.slugIndex ? parseInt(img.dataset.slugIndex) + 1 : 1;
    const nextUrl = getTelegifterUrl(key, name, collection, parseInt(img.dataset.slugIndex));
    if (nextUrl) {
        img.src = nextUrl;
    } else if (fallback && !isBadUrl(fallback)) {
        img.src = fallback;
        img.onerror = null;
    } else {
        img.style.display = 'none';
        if (img.previousElementSibling && img.previousElementSibling.classList.contains('filter-item-letter')) {
            img.previousElementSibling.style.opacity = '1';
        }
        img.onerror = null;
    }
}


function createItemCard(item) {
    const card = document.createElement('div');
    // The design is now unified in CSS, so base 'card' is enough
    card.className = "card";

    const priceVal = parseFloat(item.price_per_day || 0);
    const myPrice = priceVal > 0 ? priceVal.toFixed(2) : "---";
    const match = item.nft_name.match(/^(.*?)\s*(#\d+)$/);
    const baseName = match ? match[1] : item.nft_name;
    const numStr = match ? match[2] : "";

    const minDays = Math.floor((item.min_duration || 86400) / 86400);
    const maxDaysFinal = Math.floor((item.max_duration || 2592000) / 86400);

    // Total min price for the grid
    const minTotalPrice = priceVal > 0 ? (priceVal * minDays).toFixed(2) : "---";

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

    // IMAGE OVERLAY (Rented/Pending)
    const overlay = document.createElement('div');
    overlay.className = 'card-overlay';
    if (item.status === 'rented') {
        overlay.classList.add('rented');
        overlay.innerHTML = `<span>${t('rented')}</span>`;

        // NEW: Mini Timer for Card
        if (item.rent_ends_at) {
            const miniTimer = document.createElement('div');
            miniTimer.className = 'card-mini-timer';
            miniTimer.id = `card-timer-${item.id}`;
            card.appendChild(miniTimer);
            startCountdown(parseInt(item.rent_ends_at), miniTimer, true);
        }
    } else if (item.status === 'pending') {
        overlay.classList.add('pending');
        overlay.innerHTML = `<span>${t('pending')}</span>`;
    }
    if (item.status === 'rented' || item.status === 'pending') {
        card.querySelector('.card-image-wrapper').appendChild(overlay);
    }

    // Click on entire card
    card.onclick = (e) => {
        e.stopPropagation();
        openProductView(item, myPrice);
    };

    return card;
}

// Duplicate modal functions removed

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

        // Priority check: Is the real image missing or just a placeholder?
        const isPlaceholder = !iSrc || iSrc.includes('gift.svg') || iSrc.includes('ton_symbol');

        if (isPlaceholder) {
            // Try local model image if available as first fallback
            if (it._modelName) {
                const collName = (it._collection && it._collection.name) ? it._collection.name : "Gifts";
                const modelUrl = getTelegifterUrl('model', it._modelName, collName);
                if (modelUrl) iSrc = modelUrl;
            }

            // If still no luck, try to generate Fragment URL
            if (!iSrc || iSrc.includes('gift.svg')) {
                const f = generateFragmentUrls(it.nft_name);
                iSrc = f.image;
            }
        }

        // ALWAYS try to fix fragment urls if they don't have hyphens but are gifts
        if (iSrc && iSrc.includes('nft.fragment.com/gift/') && !iSrc.includes('-') && !SLUG_MAPPING[iSrc.split('/').pop().split('-')[0]]) {
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
    console.log("Opening product view for item:", item.nft_name, "Metadata present:", !!item.metadata);
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
            releaseBadge.innerHTML = `<div id="${timerId}" style="display:block; font-size:16px; font-weight:700; color:#fff; margin-bottom:12px; width: 100%;"></div>`;
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

    const shareBtn = document.getElementById('view-share-icon');
    if (shareBtn) {
        shareBtn.onclick = handleShareClick;
    }

    const notifyBtn = document.getElementById('notify-btn');
    if (notifyBtn) {
        notifyBtn.style.display = (item.status === 'rented') ? 'block' : 'none';
    }
    const colEl = document.getElementById('view-collection');
    if (colEl) {
        colEl.innerText = `${colName} >`;
        colEl.style.display = (item.type === 'gift') ? 'block' : 'none';

        // Extract base name for exact collection matching
        const giftBaseName = item.nft_name.replace(/#\d+/, '').trim();

        colEl.onclick = () => {
            ACTIVE_FILTERS.nft = [giftBaseName]; // Точное название вместо абстрактного colName
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

    // Hide Address
    const addrDom = document.getElementById('view-address');
    if (addrDom) addrDom.style.display = 'none';

    // Pricing & Duration
    let rawP = parseFloat(item.price_per_day) || 0;
    const dailyPrice = rawP > 0 ? rawP.toFixed(2) : "---";
    const dailyPriceUsd = (rawP > 0 && GLOBAL_TON_PRICE) ? `~$${(rawP * GLOBAL_TON_PRICE).toFixed(2)}` : (rawP > 0 ? '---' : '');
    const minDays = Math.floor((item.min_duration || 86400) / 86400);
    const maxDays = Math.floor((item.max_duration || 2592000) / 86400);

    const pricingCard = document.querySelector('.pricing-card');
    if (pricingCard) {
        pricingCard.innerHTML = `
                <div class="pricing-grid" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; justify-content: center;">
                    <div>
                        <div id="view-label-price" class="pricing-label" style="font-size: 11px; color:#8794a1; font-weight:600; margin-bottom:4px;" data-i18n="price_per_day">${t('price_per_day')}</div>
                        <div class="pricing-value">
                            <div id="view-daily-price" style="font-size: 16px; font-weight:700; color:#fff;"><span class="icon-before icon-ton tm-amount">${dailyPrice}</span></div>
                            <div id="view-daily-price-usd" style="font-size: 11px; color:#8794a1; margin-top:2px;">${dailyPriceUsd}</div>
                        </div>
                    </div>
                    <div>
                        <div id="view-label-period" class="pricing-label" style="font-size: 11px; color:#8794a1; font-weight:600; margin-bottom:4px;" data-i18n="period">${t('period')}</div>
                        <div id="view-duration-range" class="pricing-value" style="font-size: 16px; font-weight:700; color:#fff;">${minDays} — ${maxDays}</div>
                    </div>
                    <div>
                        <div id="view-label-discount" class="pricing-label" style="font-size: 11px; color:#8794a1; font-weight:600; margin-bottom:4px;" data-i18n="discount">${t('discount')}</div>
                        <div id="view-discount" class="pricing-value" style="font-size: 16px; font-weight:700; color:#fff;">0.1%</div>
                    </div>
                </div>
                <div class="auto-relist-note" style="margin-top: 12px; display: flex; gap: 8px; font-size: 11px; color: #8794a1;">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="23 4 23 10 17 10"></polyline>
                        <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
                    </svg>
                    <span><b id="view-auto-relist-title" data-i18n="auto_relist">${t('auto_relist')}</b> <span id="view-auto-relist-desc" data-i18n="auto_relist_desc">${t('auto_relist_desc')}</span></span>
                </div>`;
    }

    let feeNotice = document.querySelector('.fee-notice-box');
    if (feeNotice) {
        feeNotice.style.display = 'block';
        feeNotice.style.width = '100%';
        feeNotice.style.boxSizing = 'border-box';
        feeNotice.innerHTML = `
                <span><span id="fee-notice-text">${t('fee_notice_text')}</span>
                    <a href="javascript:void(0)" onclick="showHelp('fee')" style="color: #0088cc; text-decoration: none;" id="fee-what-mean" data-i18n="what_is_this">${t('what_is_this')}</a></span>`;
    }

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

        const createPropRow = (label, value) => {
            if (!value || value === 'Gift' || value === 'None') return null;
            const row = document.createElement('div');
            row.className = 'property-item';
            // Force visibility with inline styles to bypass any CSS conflicts
            row.style.cssText = "display: flex !important; justify-content: space-between !important; align-items: center !important; padding: 18px 22px !important; background: rgba(255, 255, 255, 0.08) !important; border-bottom: 1px solid rgba(255, 255, 255, 0.04) !important; margin-bottom: 2px !important; visibility: visible !important; opacity: 1 !important; height: auto !important; min-height: 50px !important;";
            row.innerHTML = `
                <div class="prop-left"><div class="prop-name" style="color:#8b9bb4 !important; font-size:13px !important; font-weight:600 !important;">${label}</div></div>
                <div class="prop-right"><span style="color:var(--accent-blue) !important; font-weight:700 !important; font-size:15px !important;">${value}</span></div>`;
            return row;
        };

        const tgRow = document.createElement('div');
        tgRow.className = 'property-item';
        tgRow.style.cssText = "display: flex !important; justify-content: space-between !important; align-items: center !important; padding: 18px 22px !important; background: rgba(255, 255, 255, 0.08) !important; border-bottom: 1px solid rgba(255, 255, 255, 0.04) !important; margin-bottom: 2px !important; visibility: visible !important; opacity: 1 !important; height: auto !important; min-height: 50px !important;";
        tgRow.innerHTML = `<div class="prop-left"><div class="prop-name" style="color:#8b9bb4 !important; font-size:13px !important; font-weight:600 !important;">Telegram</div></div><div class="prop-right"><span style="color:var(--accent-blue) !important; font-weight:700 !important; font-size:15px !important;">${giftBaseName} #${nftNum}</span></div>`;
        tgRow.onclick = () => tg.openTelegramLink(tgNftLink);
        propCont.appendChild(tgRow);

        // Helper for clickable properties
        const appendClickableProp = (label, val, key) => {
            if (!val || val === 'Gift' || val === 'None') return;
            const r = createPropRow(label, val);
            if (!r) return;

            // Don't make "Unknown" clickable - it doesn't make sense to filter by it
            if (val !== 'Unknown') {
                r.classList.add('clickable-prop'); 
                r.querySelector('.prop-right').innerHTML += `<span class="arrow-v" style="font-size:12px; margin-left:8px;">›</span>`;

                r.onclick = () => {
                    // Only restrict by NFT collection if they click on the model specifically
                    if (key === 'model') {
                        ACTIVE_FILTERS.nft = [giftBaseName];
                    }
                    ACTIVE_FILTERS[key] = [val];
                    closeProductView();
                    loadLiveItems(true);
                };
            }

            console.log("Adding prop row to UI:", label, val);
            propCont.appendChild(r);
        };

        // NEW: Parse metadata if available
        let meta = {};
        if (item.metadata) {
            try {
                meta = typeof item.metadata === 'string' ? JSON.parse(item.metadata) : item.metadata;
            } catch (e) { }
        }

        const modelVal = (meta.model && meta.model !== 'Unknown') ? meta.model : (item._modelName || giftBaseName);
        const symVal = (meta.symbol && meta.symbol !== 'Unknown') ? meta.symbol : item._symbol;
        const bgVal = (meta.backdrop && meta.backdrop !== 'Unknown') ? meta.backdrop : item._backdrop;
        
        console.log(`[PRODUCT_VIEW] ${item.nft_name} Meta:`, { modelVal, symVal, bgVal });

        // Show all available metadata from the object
        if (modelVal) appendClickableProp(t('model'), modelVal, 'model');

        // Restore missing symbol logic
        let sym = symVal;
        if (!sym && item.attributes) {
            const sAttr = item.attributes.find(a => a.trait_type && (a.trait_type.toLowerCase() === 'symbol' || a.trait_type.toLowerCase() === 'символ'));
            if (sAttr) sym = sAttr.value;
        }
        if (sym) appendClickableProp(t('symbol'), sym, 'symbol');

        if (bgVal) appendClickableProp(t('backdrop'), bgVal, 'bg');

        // Auto-relist status - ONLY FOR GIFTS
        if (item.type === 'gift') {
            const isYes = item.auto_relist !== undefined ? Boolean(parseInt(item.auto_relist)) : true;
            const reRow = createPropRow(t('auto_relist_label'), isYes ? t('yes') : t('no'));
            if (reRow) {
                if (!isYes) reRow.querySelector('.prop-right span').style.color = '#ff3b30';
                else reRow.querySelector('.prop-right span').style.color = 'var(--accent-blue)';
                propCont.appendChild(reRow);
            }
        }
        console.log("Final properties in container:", propCont.children.length);
    }

    const rentBtn = document.getElementById('main-rent-action-btn');
    const stepper = document.querySelector('.rent-period-stepper');
    // feeNotice handled above

    if (rentBtn) {
        rentBtn.style.display = 'flex';
        if (stepper) stepper.style.display = 'flex';
        if (feeNotice) feeNotice.style.display = 'block';

        updateTotalPrice();
        const rentBtnTextEl = rentBtn.querySelector('#rent-btn-text');
        if (rentBtnTextEl) rentBtnTextEl.textContent = t('rent_button', { amount: '' }).replace('{amount}', '').trim();

        rentBtn.onclick = () => {
            openPaymentModal();
        };
    }

    const warningBox = document.getElementById('listing-warning-box');
    if (warningBox) warningBox.style.display = 'none';

    if (item && item.nft_address) {
        const userId = tg.initDataUnsafe?.user?.id || 0;

        // Parallel fetch for details and user order status
        Promise.all([
            apiFetch(`${BACKEND_URL}/api/nft_details?nft_address=${item.nft_address}`).then(r => r.json()),
            apiFetch(`${BACKEND_URL}/api/my_orders?user_id=${userId}`).then(r => r.json())
        ]).then(([details, myOrders]) => {
            if (!Array.isArray(myOrders)) myOrders = [];
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


            // 4. Check Notification Status
            checkNotificationStatus(item.nft_address);

            // 3. Countdown Logic - Ensure it updates in Product View
            const endTimePv = details.rent?.ends_at || details.rent_ends_at || item.rent_ends_at;
            const isRentedPv = item.status === 'rented' || (myOrder && (myOrder.status === 'active' || myOrder.status === 'rented'));
            const releaseBadgePv = document.getElementById('view-release-badge');

            if (endTimePv && isRentedPv && releaseBadgePv) {
                const timerId = 'release-timer-' + item.id;
                let timerEl = document.getElementById(timerId);
                if (!timerEl) {
                    releaseBadgePv.innerHTML = `<div id="${timerId}" style="display:block; font-size:16px; font-weight:700; color:#fff; margin-bottom:12px; width: 100%;"></div>`;
                    timerEl = document.getElementById(timerId);
                }
                if (timerEl) {
                    releaseBadgePv.style.display = 'block';
                    startCountdown(parseInt(endTimePv), timerEl);
                }
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
            if (details.attributes && propCont) {
                details.attributes.forEach(attr => {
                    const trait = attr.trait_type.toLowerCase();
                    const label = t(trait) || attr.trait_type;
                    let row = Array.from(propCont.querySelectorAll('.property-item')).find(r => r.querySelector('.prop-name')?.textContent === label);

                    if (!row) {
                        // Create row if missing (e.g. Symbol was not in initial item)
                        let key = trait;
                        if (key === 'backdrop' || key === 'background' || key === 'фон') key = 'bg';
                        if (key === 'symbol' || key === 'символ') key = 'symbol';
                        if (key === 'model' || key === 'модель') key = 'model';

                        appendClickableProp(label, attr.value, key);
                    } else {
                        const valSpan = row.querySelector('.prop-right span');
                        if (valSpan) valSpan.textContent = attr.value;
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
    let val = (parseInt(input.value) || minDays) + delta;
    if (val < minDays) val = minDays;
    if (val > maxDays) val = maxDays;
    input.value = val;
    updateTotalPrice();
}

function onDurationInput(el) {
    if (!CURRENT_PAYMENT_ITEM) return;
    const minDays = Math.floor((CURRENT_PAYMENT_ITEM.min_duration || 86400) / 86400);
    const maxDays = Math.floor((CURRENT_PAYMENT_ITEM.max_duration || 2592000) / 86400);

    let val = parseInt(el.value);
    if (isNaN(val)) return;

    if (val > maxDays) {
        showToast(t('max_days_warn', { days: maxDays }) || `Максимум ${maxDays} дней`);
        el.value = maxDays;
    }
    updateTotalPrice();
}

function onDurationChange(el) {
    if (!CURRENT_PAYMENT_ITEM) return;
    const minDays = Math.floor((CURRENT_PAYMENT_ITEM.min_duration || 86400) / 86400);
    let val = parseInt(el.value);
    if (isNaN(val) || val < minDays) {
        el.value = minDays;
    }
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

    // 1. Update prices in payment modal
    // total = backend rental fee WITH gas markup included
    const payPriceTon = document.getElementById('pay-price-ton');
    if (payPriceTon) payPriceTon.innerText = total;

    // Bots: rental fee + 0.1 TON (bot withdrawal commission)
    const botTotal = (parseFloat(total) + 0.1).toFixed(2);
    const payPriceCb = document.getElementById('pay-price-cb');
    const payPriceXr = document.getElementById('pay-price-xr');
    if (payPriceCb) payPriceCb.innerText = botTotal;
    if (payPriceXr) payPriceXr.innerText = botTotal;

    const payPriceRub = document.getElementById('pay-price-rub');
    const payPriceLava = document.getElementById('pay-price-lavatop');
    const cardWarning = document.getElementById('card-limit-warning');
    const cardMethodCT = document.getElementById('pay-method-cloudtips');

    if (payPriceRub || payPriceLava) {
        if (FIAT_RATES.RUB) {
            // Считаем как бэкенд: rental + 0.2 TON gas, потом курс * 1.05
            const tonForCard = parseFloat(total) + 0.2;
            let rubVal = Math.round(tonForCard * FIAT_RATES.RUB * FIAT_FEE_MULTIPLIER);

            if (payPriceRub) payPriceRub.innerText = rubVal;
            if (payPriceLava) payPriceLava.innerText = rubVal;

            const minVal = 49;
            if (rubVal < minVal) {
                if (cardWarning) cardWarning.style.display = 'flex';
                // Dynamic update of warning text
                const warningTextNode = document.querySelector('[data-i18n="min_card_payment"]');
                if (warningTextNode) warningTextNode.innerHTML = t('min_card_payment', { min: minVal });
            } else {
                if (cardWarning) cardWarning.style.display = 'none';
            }
        } else {
            if (payPriceRub) payPriceRub.innerText = '...';
            if (payPriceLava) payPriceLava.innerText = '...';
        }
    }


    // Update Итого based on selected method:
    // TON = just the rental price (gas already included by backend markup)
    // Bots = rental price + 0.1 bot commission
    updateMethodTotal(total);

    // Update summary labels in modal
    const summaryFee = document.getElementById('pay-summary-fee');
    const summaryMin = document.getElementById('pay-summary-min');
    if (summaryFee) {
        summaryFee.innerText = '~ 0.01 TON';
    }
    if (summaryMin) {
        summaryMin.innerText = '—';
    }

    // Обновить текст кнопки с учетом языка и статуса
    const rentBtn = document.getElementById('main-rent-action-btn');
    if (rentBtn) {
        const isRented = CURRENT_PAYMENT_ITEM && CURRENT_PAYMENT_ITEM.status === 'rented';
        const labelKey = isRented ? 'preorder_for' : 'rent_for';
        const labelText = t(labelKey);
        
        const labelSpan = rentBtn.querySelector('span[data-i18n]');
        if (labelSpan) {
            labelSpan.setAttribute('data-i18n', labelKey);
            labelSpan.innerText = labelText + ' ';
        } else {
            Array.from(rentBtn.childNodes)
                .filter(n => n.nodeType === Node.TEXT_NODE)
                .forEach(n => n.remove());
            rentBtn.insertBefore(document.createTextNode(' ' + labelText + ' '), rentBtn.firstChild);
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

let IS_SHARE_OPENING = false;
async function handleShareClick() {
    console.log("Share button clicked!");
    if (IS_SHARE_OPENING) {
        console.warn("Share already opening, skipping...");
        return;
    }
    IS_SHARE_OPENING = true;

    try {
        if (!CURRENT_PAYMENT_ITEM) {
            console.error("No current payment item for sharing!");
            showToast("Ошибка: товар не выбран");
            return;
        }

        const item = CURRENT_PAYMENT_ITEM;
        // Construct full item name with number if it's a gift
        let itemName = item.nft_name || item.title || "NFT";
        if (item.type === 'gift' && item.nft_id && !itemName.includes('#')) {
            itemName += ` #${item.nft_id}`;
        }
        const userId = (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initDataUnsafe?.user?.id) || 0;
        const botUser = "OctoRent_bot";
        const shareLink = `https://t.me/${botUser}/app?startapp=nft_${item.nft_address || item.id}`;

        console.log("Preparing share for item:", itemName, "type:", item.type, "User:", userId);

        // Stage 1: Premium Prepared Message (requires Telegram 7.8+)
        if (window.Telegram?.WebApp?.sendPreparedInlineMessage) {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 4000);

                const res = await apiFetch(`${BACKEND_URL}/api/referral/prepare_share`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        user_id: userId,
                        type: item.type || 'gift',
                        name: itemName,
                        nft_address: item.nft_address || '',
                        rent_ends_at: item.rent_ends_at || null // NEW: pass exploration
                    }),
                    signal: controller.signal
                });
                clearTimeout(timeoutId);
                const data = await res.json();
                console.log("Prepare share response:", data);
                if (data.status === 'ok' && data.id) {
                    console.log("Sending prepared inline message with id:", data.id);
                    window.Telegram.WebApp.sendPreparedInlineMessage(data.id);
                    return;
                } else {
                    console.warn("prepare_share returned error:", data);
                }
            } catch (e) {
                console.warn("Product share stage 1 failed:", e.message);
            }
        }

        // Stage 2: switchInlineQuery (works in older Telegram versions)
        if (window.Telegram?.WebApp?.switchInlineQuery) {
            console.log("Using switchInlineQuery fallback with:", itemName);
            // DO NOT strip numbers or @, we need exact match for bot search
            window.Telegram.WebApp.switchInlineQuery(itemName, ['users', 'groups', 'channels']);
            return;
        }

        // Stage 3: shareURL
        if (window.Telegram?.WebApp?.shareURL) {
            console.log("Using shareURL fallback");
            window.Telegram.WebApp.shareURL(shareLink, `💎 ${itemName} — аренда в OctoRent`);
            return;
        }

        // Stage 4: Clipboard
        console.log("Using clipboard fallback");
        copyToClipboard(shareLink);
        showToast(t('link_copied'));
    } catch (err) {
        console.error("Critical error in handleShareClick:", err);
    } finally {
        setTimeout(() => {
            console.log("Resetting IS_SHARE_OPENING");
            IS_SHARE_OPENING = false;
        }, 1000);
    }
}

async function handleNotifyClick() {
    if (!CURRENT_PAYMENT_ITEM || !CURRENT_PAYMENT_ITEM.nft_address) return;

    const userId = tg.initDataUnsafe?.user?.id || 0;
    const btn = document.getElementById('notify-btn');
    if (!btn) return;

    try {
        const resp = await apiFetch(`${BACKEND_URL}/api/toggle_notification`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: userId,
                nft_address: CURRENT_PAYMENT_ITEM.nft_address
            })
        });
        const d = await resp.json();

        if (d.status === 'ok') {
            const isActive = d.action === 'added';
            btn.classList.toggle('active', isActive);

            showToast(isActive ? t('notification_enabled') : t('notification_disabled'));

            if (tg && tg.HapticFeedback) {
                tg.HapticFeedback.notificationOccurred('success');
            }
        }
    } catch (e) {
        console.error("Notify toggle error:", e);
    }
}

async function checkNotificationStatus(nftAddress) {
    const btn = document.getElementById('notify-btn');
    if (!btn) return;

    const userId = tg.initDataUnsafe?.user?.id || 0;
    try {
        const r = await apiFetch(`${BACKEND_URL}/api/check_notification_status?user_id=${userId}&nft_address=${nftAddress}`);
        const d = await r.json();
        btn.classList.toggle('active', !!d.subscribed);
    } catch (e) {
        console.error("Notify status check error:", e);
    }
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

/* --- TC TUTORIAL LOGIC --- */
let currentTutorialStep = 1;
let tutorialPhase = 1; // 1: Education, 2: Finalization
let progressTimer = null;

const TUTORIAL_DATA = {
    1: { img: 'pictures/tutorial/step1.png', key: 'tut_step_1' },
    2: { img: 'pictures/tutorial/step2.png', key: 'tut_step_2' },
    3: { img: 'pictures/tutorial/step3.png', key: 'tut_step_3' },
    4: { img: 'pictures/tutorial/step4.png', key: 'tut_step_4' },
    5: { img: 'pictures/tutorial/step5.png', key: 'tut_step_5' },
    6: { img: 'pictures/tutorial/step6.png', key: 'tut_step_6' }
};

function copyText(text, event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    navigator.clipboard.writeText(text).then(() => {
        // Show indicator in button span if exists
        const btn = document.getElementById('tutorial-next-btn');
        if (btn) {
            const original = btn.querySelector('span').innerText;
            btn.querySelector('span').innerText = t('copy_success');
            setTimeout(() => {
                btn.querySelector('span').innerText = original;
            }, 1000);
        } else {
            tg.showAlert(t('copy_success'));
        }
    });
}

function openTcModal(orderId, isPolling = false, isMandatory = false) {
    isTcModalMandatory = isMandatory;
    const closeBtn = document.getElementById('tc-modal-close-btn');
    const modal = document.getElementById('tc-modal');
    const overlay = document.getElementById('tc-modal-overlay');

    if (closeBtn) closeBtn.style.display = isMandatory ? 'none' : 'block';

    // Apply mandatory class for CSS (to hide close button and disable overlay click)
    if (isMandatory) {
        modal.classList.add('mandatory');
        overlay.classList.add('mandatory');
    } else {
        modal.classList.remove('mandatory');
        overlay.classList.remove('mandatory');
    }

    document.getElementById('tc-current-order-id').value = orderId;
    overlay.classList.add('active');
    modal.classList.add('active');

    if (isPolling) {
        renderPolling();
    } else {
        tutorialPhase = 1;
        currentTutorialStep = 1;
        renderTutorialStep();
    }
}

function renderPolling() {
    const body = document.getElementById('tc-modal-body');
    body.className = "tc-redesign-container";
    body.innerHTML = `
        <div class="tc-polling-premium">
            <div class="premium-spinner" style="width: 60px; height: 60px; margin-bottom: 24px;"></div>
            <div class="tc-polling-title">${t('awaiting_confirmation')}</div>
            <div class="tc-polling-desc">
                ${t('confirmation_desc')}
            </div>
        </div>
    `;
}

function renderTutorialStep() {
    const body = document.getElementById('tc-modal-body');
    const data = TUTORIAL_DATA[currentTutorialStep];

    body.className = ""; // Remove container to avoid double padding if needed
    body.innerHTML = `
        <div class="tutorial-container">
            <div class="tutorial-image-wrapper" onclick="openLightbox('${data.img}')">
                <img src="${data.img}" class="tutorial-image" alt="Step ${currentTutorialStep}">
            </div>
            <div class="tutorial-desc">${t(data.key)}</div>
            <div class="tutorial-btns-row" style="display: flex; gap: 10px; margin-top: auto; width: 100%;">
                <button class="btn-gray" onclick="nextTutorialStep()" style="flex: 1; height: 50px; border-radius: 12px; font-weight: 700;">
                    ${t('tut_skip')}
                </button>
                <button id="tutorial-next-btn" class="btn-progress" disabled onclick="nextTutorialStep()" style="flex: 2;">
                    <div class="progress-fill"></div>
                    <span>${currentTutorialStep === 6 ? t('tut_finish') : t('tut_next')}</span>
                </button>
            </div>
        </div>
    `;

    startProgressTimer();
}

function startProgressTimer() {
    if (progressTimer) clearInterval(progressTimer);
    const btn = document.getElementById('tutorial-next-btn');
    const fill = btn.querySelector('.progress-fill');

    let width = 0;
    btn.disabled = true;
    btn.classList.remove('active');

    progressTimer = setInterval(() => {
        width += 1;
        fill.style.width = width + '%';
        if (width >= 100) {
            clearInterval(progressTimer);
            btn.disabled = false;
            btn.classList.add('active');
        }
    }, 30); // 3000ms / 100 = 30ms
}

function nextTutorialStep() {
    if (tutorialPhase === 1) {
        if (currentTutorialStep < 3) {
            currentTutorialStep++;
            renderTutorialStep();
        } else {
            renderInputStep();
        }
    } else if (tutorialPhase === 2) {
        if (currentTutorialStep < 6) {
            currentTutorialStep++;
            renderTutorialStep();
        } else {
            closeTcModal();
        }
    }
}

function renderInputStep() {
    const body = document.getElementById('tc-modal-body');
    body.className = "tc-redesign-container";
    body.innerHTML = `
        <div class="tc-step" style="animation: fadeInUp 0.4s ease-out; gap: 12px; align-items: center;">
            <div class="tc-step-number" style="background: rgba(0, 136, 204, 0.2); border: 1px solid var(--accent-blue);">🔗</div>
            <div class="tc-step-text" style="font-size: 15px;">${t('tut_input_desc')}</div>
        </div>
        
        <div class="tc-input-wrapper" style="animation: fadeInUp 0.4s ease-out 0.1s; opacity:0; animation-fill-mode: forwards;">
            <div class="tc-input-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
                </svg>
            </div>
            <input type="text" id="tc-link-input" class="tc-input-premium" placeholder="${t('tc_link_placeholder_short')}">
        </div>

        <button onclick="submitTcLink()" class="tc-btn-premium" style="animation: fadeInUp 0.4s ease-out 0.2s; opacity:0; animation-fill-mode: forwards;">
            ${t('tut_connect')}
        </button>
    `;
}

let lightboxZoomState = { scale: 1, x: 0, y: 0, lastX: 0, lastY: 0, lastScale: 1, initialDist: 0 };

function openLightbox(src) {
    const lb = document.getElementById('tc-lightbox');
    const img = document.getElementById('lightbox-img');
    img.src = src;

    // Reset state
    lightboxZoomState = { scale: 1, x: 0, y: 0, lastX: 0, lastY: 0, lastScale: 1, initialDist: 0 };
    updateLightboxTransform();

    lb.classList.add('active');
    document.body.style.overflow = 'hidden';

    setupLightboxEvents(img);
}

function setupLightboxEvents(img) {
    if (img.dataset.eventsSet) return;
    img.dataset.eventsSet = "true";

    img.addEventListener('touchstart', (e) => {
        if (e.touches.length === 2) {
            lightboxZoomState.initialDist = Math.hypot(
                e.touches[0].pageX - e.touches[1].pageX,
                e.touches[0].pageY - e.touches[1].pageY
            );
        } else if (e.touches.length === 1) {
            lightboxZoomState.lastX = e.touches[0].pageX - lightboxZoomState.x;
            lightboxZoomState.lastY = e.touches[0].pageY - lightboxZoomState.y;
        }
    });

    img.addEventListener('touchmove', (e) => {
        if (e.touches.length === 2) {
            const dist = Math.hypot(
                e.touches[0].pageX - e.touches[1].pageX,
                e.touches[0].pageY - e.touches[1].pageY
            );
            const delta = dist / lightboxZoomState.initialDist;
            lightboxZoomState.scale = Math.min(Math.max(lightboxZoomState.lastScale * delta, 1), 5);
        } else if (e.touches.length === 1 && lightboxZoomState.scale > 1) {
            lightboxZoomState.x = e.touches[0].pageX - lightboxZoomState.lastX;
            lightboxZoomState.y = e.touches[0].pageY - lightboxZoomState.lastY;
        }
        updateLightboxTransform();
    });

    img.addEventListener('touchend', (e) => {
        lightboxZoomState.lastScale = lightboxZoomState.scale;
        if (lightboxZoomState.scale <= 1) {
            lightboxZoomState.x = 0;
            lightboxZoomState.y = 0;
            updateLightboxTransform();
        }
    });

    // Double tap reset
    let lastTap = 0;
    img.addEventListener('touchend', (e) => {
        const now = Date.now();
        if (now - lastTap < 300) {
            lightboxZoomState.scale = lightboxZoomState.scale > 1 ? 1 : 2;
            lightboxZoomState.lastScale = lightboxZoomState.scale;
            lightboxZoomState.x = 0;
            lightboxZoomState.y = 0;
            updateLightboxTransform();
        }
        lastTap = now;
    });

    // Wheel zoom for Desktop
    img.addEventListener('wheel', (e) => {
        e.preventDefault();
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        lightboxZoomState.scale = Math.min(Math.max(lightboxZoomState.scale * delta, 1), 5);
        lightboxZoomState.lastScale = lightboxZoomState.scale;
        if (lightboxZoomState.scale <= 1) {
            lightboxZoomState.x = 0;
            lightboxZoomState.y = 0;
        }
        updateLightboxTransform();
    }, { passive: false });
}

function updateLightboxTransform() {
    const img = document.getElementById('lightbox-img');
    if (!img) return;
    img.style.transform = `translate(${lightboxZoomState.x}px, ${lightboxZoomState.y}px) scale(${lightboxZoomState.scale})`;
}

function closeLightbox() {
    const lb = document.getElementById('tc-lightbox');
    lb.classList.remove('active');
    document.body.style.overflow = '';
}

function closeTcModal() {
    if (isTcModalMandatory) return; // Prevent closing if mandatory
    if (progressTimer) clearInterval(progressTimer);
    document.getElementById('tc-modal-overlay').classList.remove('active');
    document.getElementById('tc-modal').classList.remove('active');
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
        const resp = await apiFetch(`${BACKEND_URL}/api/my_orders?user_id=${userId}`);
        const orders = await resp.json();

        if (!orders || orders.length === 0) {
            list.innerHTML = `
                <div style="color:#8b9bb4; text-align:center; padding:40px 20px;">
                    <div style="font-size:32px; margin-bottom:10px; opacity:0.5;">📭</div>
                    <div style="font-weight:700; color:#fff;">${t('history_empty')}</div>
                    <div style="font-size:12px; margin-top:5px;">${t('history_empty_desc')}</div>
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
                displayStatus = t('status_active');
            } else if (o.status === 'paid') {
                statusColor = '#007AFF';
                displayStatus = t('status_processing');
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
        list.innerHTML = `<div style="color:#ff3b30; text-align:center; padding:10px;">${t('error_loading_history')}</div>`;
    }
}

// Countdown function moved to timer_helper.js with simple text format

function copyWallet() {
    if (tonConnectUI && tonConnectUI.account && tonConnectUI.account.address) {
        copyToClipboard(tonConnectUI.account.address);
        if (tg) tg.showAlert(t('address_copied'));
        else alert(t('address_copied'));
    } else {
        if (tg) tg.showAlert(t('wallet_not_connected'));
        else alert(t('wallet_not_connected'));
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


let pendingLang = null;

// --- Language Switcher (Premium Modal Style) ---
function switchLanguage() {
    const el = document.getElementById('language-modal');
    if (!el) return;

    pendingLang = CURRENT_LANG;

    // Sync checkmarks with current state
    const checkRu = document.getElementById('check-ru');
    const checkEn = document.getElementById('check-en');
    if (checkRu && checkEn) {
        checkRu.style.display = (CURRENT_LANG === 'ru') ? 'block' : 'none';
        checkEn.style.display = (CURRENT_LANG === 'en') ? 'block' : 'none';
    }

    el.style.display = 'flex';
    setTimeout(() => el.classList.add('active'), 10);
    if (tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred('medium');
}

function closeLanguageDrawer() {
    const el = document.getElementById('language-modal');
    if (!el) return;
    el.classList.remove('active');
    setTimeout(() => el.style.display = 'none', 300);
}

function selectLanguage(lang) {
    pendingLang = lang;
    const checkRu = document.getElementById('check-ru');
    const checkEn = document.getElementById('check-en');

    if (checkRu) checkRu.style.display = (lang === 'ru') ? 'block' : 'none';
    if (checkEn) checkEn.style.display = (lang === 'en') ? 'block' : 'none';

    if (tg && tg.HapticFeedback) {
        tg.HapticFeedback.impactOccurred('light');
    }
}

function confirmLanguageChange() {
    if (!pendingLang) {
        closeLanguageDrawer();
        return;
    }

    if (pendingLang === CURRENT_LANG) {
        closeLanguageDrawer();
        return;
    }

    CURRENT_LANG = pendingLang;
    localStorage.setItem('lang', pendingLang);

    if (tg && tg.HapticFeedback) {
        tg.HapticFeedback.notificationOccurred('success');
    }

    closeLanguageDrawer();
    setTimeout(() => {
        location.reload();
    }, 150);
}

// --- Order Polling Logic ---
let ORDER_POLL_INTERVAL = null;
function startPollingOrder(orderId) {
    if (ORDER_POLL_INTERVAL) clearInterval(ORDER_POLL_INTERVAL);

    ORDER_POLL_INTERVAL = setInterval(async () => {
        try {
            const userId = (tg && tg.initDataUnsafe && tg.initDataUnsafe.user) ? tg.initDataUnsafe.user.id : 0;
            const resp = await apiFetch(`${BACKEND_URL}/api/my_orders?user_id=${userId}`);
            const orders = await resp.json();

            const myOrder = orders.find(o => o.id === orderId);
            if (myOrder) {
                console.log("Order status:", myOrder.status);
                if (myOrder.status === 'rented') {
                    // Бот выкупил NFT, пора вводить ссылку
                    clearInterval(ORDER_POLL_INTERVAL);
                    ORDER_POLL_INTERVAL = null;
                    tg.HapticFeedback.notificationOccurred('success');
                    closePaymentModal(); // Close modal if open
                    openTcModal(orderId, false, true); // Switch to input mode
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

    // 🔥 DEEP LINK CHECK: For Rent History "Connect" buttons
    const urlParams = new URLSearchParams(window.location.search);
    const orderId = urlParams.get('order_id');
    const action = urlParams.get('action');
    if (orderId && action === 'connect') {
        console.log("🔥 DEEP LINK: Connect for Order", orderId);
        setTimeout(() => {
            if (typeof openTcModal === 'function') {
                openTcModal(parseInt(orderId));
            }
        }, 1200); // Give it a bit more time to settle
    }
});

// Global exposed functions for inline HTML events
window.shareReferralLink = shareReferralLink;
window.handleReferralWithdraw = handleReferralWithdraw;
window.showEarningsHelp = showEarningsHelp;
window.closeEarningsHelp = closeEarningsHelp;
window.openOctoModal = openAdvancedFilters;
window.openAdvancedFilters = openAdvancedFilters;
window.toggleGenericModal = toggleGenericModal;
window.applyMrktModal = applyMrktModal;
window.applyOctoModal = applyMrktModal;
window.resetMrktModal = resetMrktModal;
window.resetOctoModal = resetMrktModal;
window.closeMrktModal = closeMrktModal;
window.closeOctoModal = closeMrktModal;
window.showToast = showToast;
window.copyToClipboard = copyToClipboard;
window.handleShareClick = handleShareClick;
window.onDurationInput = onDurationInput;
window.onDurationChange = onDurationChange;
window.adjustDuration = adjustDuration;

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


// --- Auto Apply Translations ---
function applyTranslations() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        const translation = t(key);
        if (translation && translation !== key) {
            if (el.tagName === 'INPUT' && el.hasAttribute('placeholder')) {
                el.placeholder = translation;
            } else {
                el.innerHTML = translation;
            }
        }
    });

    // Special logic: mode toggle
    const modeBtn = document.getElementById('mode-toggle-btn');
    if (modeBtn) {
        const isRentalMode = modeBtn.classList.contains('rental');
        const modeText = document.getElementById('mode-toggle-text');
        if (modeText) {
            modeText.innerText = isRentalMode ? t('mode_shop_btn') : t('mode_rent_btn');
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

// --- Payment Modal Core Functions ---

const FIAT_RATES = { USD: 0, RUB: 0 };

async function fetchFiatRates() {
    try {
        const response = await fetch('https://tonapi.io/v2/rates?tokens=ton&currencies=usd,rub');
        const data = await response.json();
        if (data && data.rates && data.rates.TON) {
            FIAT_RATES.USD = parseFloat(data.rates.TON.prices.USD);
            FIAT_RATES.RUB = parseFloat(data.rates.TON.prices.RUB);
        }
    } catch (e) {
        console.error("Fiat rates error:", e);
    }
}

function openPaymentModal() {
    const modal = document.getElementById('payment-modal');
    if (!modal) return;

    // Reset view (we only have selection view now since confirmation was removed)
    const selectionView = document.getElementById('payment-selection-view');
    if (selectionView) {
        selectionView.style.display = 'block';
        selectionView.style.transform = 'translateY(0)'; // Reset drag if any
    }

    // Refresh fiat rates every time modal opens
    fetchFiatRates().then(() => updateTotalPrice());
    updateTotalPrice(); // Sync immediately (cached values)

    modal.style.display = 'flex';
    setTimeout(() => modal.classList.add('active'), 10);
    tg.HapticFeedback.impactOccurred('light');

    // Add Swipe down to close logic
    initModalSwipeClose(modal);
}

function closePaymentModal() {
    const modal = document.getElementById('payment-modal');
    if (!modal) return;
    modal.classList.remove('active');
    setTimeout(() => {
        modal.style.display = 'none';
        const content = modal.querySelector('.bottom-sheet-content');
        if (content) content.style.transform = ''; // Clear drag transform
    }, 300);
}

function initModalSwipeClose(modal) {
    const content = modal.querySelector('.bottom-sheet-content');
    const header = modal.querySelector('.bottom-sheet-header');
    if (!content || !header) return;

    // Prevent multiple attachments
    if (header.dataset.swipeInitialized) return;
    header.dataset.swipeInitialized = "true";

    let startY = 0;
    let currentY = 0;
    let isDragging = false;

    const onTouchStart = (e) => {
        startY = e.touches[0].clientY;
        isDragging = true;
        content.style.transition = 'none';
    };

    const onTouchMove = (e) => {
        if (!isDragging) return;
        currentY = e.touches[0].clientY;
        const diff = currentY - startY;
        if (diff > 0) {
            // Add a bit of resistance/limit if needed, but diff is fine
            content.style.transform = `translateY(${diff}px)`;
        }
    };

    const onTouchEnd = () => {
        if (!isDragging) return;
        isDragging = false;
        content.style.transition = 'transform 0.3s cubic-bezier(0.19, 1, 0.22, 1)';
        const diff = currentY - startY;

        if (diff > 80) { // Even lower threshold for "easy" closing
            tg.HapticFeedback.impactOccurred('light');
            closePaymentModal();
        } else {
            content.style.transform = 'translateY(0)';
        }
    };

    header.addEventListener('touchstart', onTouchStart, { passive: true });
    header.addEventListener('touchmove', onTouchMove, { passive: true });
    header.addEventListener('touchend', onTouchEnd);
}

function switchPayTab(tab) {
    document.querySelectorAll('.pay-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.pay-tab-pane').forEach(p => p.classList.remove('active'));

    if (tab === 'crypto') {
        document.querySelector('.pay-tab:nth-child(1)').classList.add('active');
        document.getElementById('pane-crypto').classList.add('active');
        document.getElementById('pay-total-currency').innerText = 'TON';
        selectPayMethod('TON');
    } else {
        document.querySelector('.pay-tab:nth-child(2)').classList.add('active');
        document.getElementById('pane-card').classList.add('active');
        document.getElementById('pay-total-currency').innerText = '₽';
        selectPayMethod('CLOUDTIPS');
    }
}

function selectPayMethod(method) {
    SELECTED_PAY_METHOD = method;
    document.querySelectorAll('.pay-method-card').forEach(card => {
        card.classList.remove('active');
        if (card.getAttribute('onclick')?.includes(`'${method}'`)) {
            card.classList.add('active');
        }
    });
    // Update total price when method changes
    if (CURRENT_PAYMENT_ITEM) {
        updateTotalPrice();
    }
}

/**
 * Итого для выбранного метода оплаты.
 * total_price с бэкенда уже включает 0.2 TON газ (см. create_rental_order: +0.2).
 * TON:        total_price  (0.2 уже внутри)
 * CryptoBot:  (total_price + 0.1) * 1.03  (бот фи + 3% комиссия CryptoBot)
 */
function updateMethodTotal(baseTotal) {
    const totalAmountEl = document.getElementById('pay-total-amount');
    const totalCurrencyEl = document.getElementById('pay-total-currency');
    const continueBtn = document.querySelector('#payment-selection-view .main-rent-btn');
    if (!totalAmountEl) return;
    const base = parseFloat(baseTotal) || 0;
    let total;
    const limitWarning = document.getElementById('cloudtips-limit-warning');
    const amountWarning = document.getElementById('cloudtips-amount-warning');
    const feeWarning = document.getElementById('cover-fee-warning');
    const isCoverFeeChecked = document.getElementById('cover-fee-checkbox')?.checked;

    if (limitWarning) limitWarning.style.display = 'none';
    if (amountWarning) amountWarning.style.display = 'none';
    if (feeWarning) feeWarning.style.display = isCoverFeeChecked ? 'flex' : 'none';

        if (SELECTED_PAY_METHOD === 'CLOUDTIPS') {
            const tonForCard = base + 0.2 + (isCoverFeeChecked ? 0.14 : 0);
            let rubVal = Math.round(tonForCard * FIAT_RATES.RUB * FIAT_FEE_MULTIPLIER);
            total = rubVal > 0 ? rubVal : '...';
            if (totalCurrencyEl) totalCurrencyEl.innerText = '₽';
            
            const overLimit = typeof rubVal === 'number' && rubVal > 3000;
            const belowMin = typeof rubVal === 'number' && rubVal < 49; // CloudTips min 49 RUB

            if (overLimit && limitWarning) {
                limitWarning.style.display = 'flex';
            }

            if (continueBtn) {
                const isDisabled = belowMin || overLimit;
                continueBtn.disabled = isDisabled;
                continueBtn.style.opacity = isDisabled ? '0.4' : '1';
                continueBtn.style.cursor = isDisabled ? 'not-allowed' : 'pointer';
            }
        } else if (SELECTED_PAY_METHOD === 'LAVATOP') {
            const tonForCard = base + 0.2 + (isCoverFeeChecked ? 0.14 : 0);
            let rubVal = Math.round(tonForCard * FIAT_RATES.RUB * FIAT_FEE_MULTIPLIER);
            total = rubVal > 0 ? rubVal : '...';
            if (totalCurrencyEl) totalCurrencyEl.innerText = '₽';

            const overLimit = typeof rubVal === 'number' && rubVal > LAVATOP_MAX_RUB;
            const belowMin = typeof rubVal === 'number' && rubVal < 50; // Lava.top min 50 RUB

            if (overLimit && limitWarning) {
                limitWarning.style.display = 'flex';
            }

            if (continueBtn) {
                const isDisabled = belowMin || overLimit;
                continueBtn.disabled = isDisabled;
                continueBtn.style.opacity = isDisabled ? '0.4' : '1';
                continueBtn.style.cursor = isDisabled ? 'not-allowed' : 'pointer';
            }
        } else {
        if (totalCurrencyEl) totalCurrencyEl.innerText = 'TON';
        const tonTotal = base + 0.2 + (isCoverFeeChecked ? 0.14 : 0);
        
        if (continueBtn) { 
            continueBtn.disabled = false; 
            continueBtn.style.opacity = '1'; 
            continueBtn.style.cursor = 'pointer'; 
        }

        if (SELECTED_PAY_METHOD === 'XROCKET') {
            total = ((tonTotal + 0.1) * 1.03).toFixed(2);
        } else {
            total = tonTotal.toFixed(2);
        }
    }
    totalAmountEl.innerText = total;
}

async function handleContinuePayment() {
    const method = SELECTED_PAY_METHOD;
    console.log("handleContinuePayment for method:", method);

    tg.HapticFeedback.impactOccurred('medium');

    if (method === 'RUB') {
        await handleRubRent();
    } else {
        // --- BOT BALANCE CHECK ---
        // For methods that require the bot to pay (CloudTips, XRocket, CryptoBot, etc.)
        // TON is a direct transfer from user, but we still prefer bot to have gas for refunds/processing
        if (['CLOUDTIPS', 'USDT'].includes(method)) {
            try {
                const bResp = await apiFetch(`${BACKEND_URL}/api/bot_balance`);
                const bData = await bResp.json();
                
                const dur = parseInt(document.getElementById('rent-duration-input').value) || 1;
                // Используем оригинальную цену (без наценки сервиса), так как это то, что бот платит МаркетАппу
                const origPrice = parseFloat(CURRENT_PAYMENT_ITEM.original_price) || 0;
                const requiredTon = origPrice * dur + 0.20; // Чистая цена + 0.2 TON (оригинальная комиссия)
                
                // Проверка на 49 рублей: так как баланс в TON, переводим 49 RUB в TON
                const minRubTon = (FIAT_RATES.RUB > 0) ? (49 / FIAT_RATES.RUB) : 0.1;
                
                if (bData && typeof bData.balance === 'number') {
                    if (bData.balance < requiredTon || bData.balance < minRubTon) {
                        showInsufficientBalanceModal();
                        return;
                    }
                }
            } catch (e) {
                console.warn("Failed to check bot balance:", e);
            }
        }

        if (method === 'TON') {
            if (!tonConnectUI.connected) {
                tonConnectUI.connectWallet().catch(e => console.error(e));
                return;
            }
            await handleTonRent();
        } else if (method === 'USDT') {
            await handleUsdtRent();
        } else if (method === 'XROCKET') {
            await handleBotRent(method);
        } else if (method === 'CLOUDTIPS') {
            // --- NEW STEP: Show Instructions first ---
            showCTInstructions();
        } else if (method === 'LAVATOP') {
            await handleLavaTopRent();
        } else {
            showToast(t('select_payment_method'));
        }
    }
}

// --- CloudTips Two-Step Logic (New Fragment Style) ---
function showCTInstructions() {
    const modal = document.getElementById('ct-instructions-modal');
    if (!modal) return;
    
    // Reset to Step 1
    document.getElementById('ct-step-1').style.display = 'block';
    document.getElementById('ct-step-2').style.display = 'none';
    
    const nextBtn = document.getElementById('ct-next-btn');
    if (nextBtn) {
        nextBtn.classList.remove('locked');
        nextBtn.disabled = false;
    }

    modal.style.display = 'flex';
}

function nextCTStep() {
    tg.HapticFeedback.impactOccurred('light');
    document.getElementById('ct-step-1').style.display = 'none';
    document.getElementById('ct-step-2').style.display = 'block';
    
    // Start 1.5s timer for Pay button on Step 2
    const payBtn = document.getElementById('ct-pay-btn');
    if (!payBtn) return;
    
    const timerSpan = payBtn.querySelector('.btn-timer');
    payBtn.classList.add('locked');
    payBtn.disabled = true;
    
    let timeLeft = 1.5;
    if (timerSpan) timerSpan.innerText = `(${timeLeft}s)`;
    
    const timerInterval = setInterval(() => {
        timeLeft -= 0.5;
        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            payBtn.classList.remove('locked');
            payBtn.disabled = false;
            if (timerSpan) timerSpan.innerText = '';
        } else {
            if (timerSpan) timerSpan.innerText = `(${timeLeft}s)`;
        }
    }, 500);
}

function finalCTOrder() {
    tg.HapticFeedback.impactOccurred('medium');
    const modal = document.getElementById('ct-instructions-modal');
    if (modal) modal.style.display = 'none';
    handleCloudTipsRent();
}

function zoomCTImage() {
    const overlay = document.getElementById('image-zoom-overlay');
    if (overlay) {
        const img = overlay.querySelector('img');
        if (img) img.src = 'pictures/cover_fee_warning.png';
        overlay.style.display = 'flex';
    }
}

function closeCTZoom() {
    const overlay = document.getElementById('image-zoom-overlay');
    if (overlay) overlay.style.display = 'none';
}

function showInsufficientBalanceModal() {
    const modal = document.getElementById('insufficient-balance-modal');
    if (modal) {
        modal.style.display = 'flex';
        tg.HapticFeedback.notificationOccurred('warning');
    }
}

function closeInsufficientBalanceModal() {
    const modal = document.getElementById('insufficient-balance-modal');
    if (modal) modal.style.display = 'none';
}

function contactAdmin() {
    const message = "Здраствуйте пожалуйста пополните баланс кошелька бота";
    // Используем актуальный юзернейм из кэша (без @)
    const adminUname = (OPERATOR_CONTACTS.admin || "@nerksqq").replace('@', '');
    const link = `https://t.me/${adminUname}?text=${encodeURIComponent(message)}`;
    if (window.Telegram && window.Telegram.WebApp) {
        window.Telegram.WebApp.openTelegramLink(link);
    } else {
        window.open(link, '_blank');
    }
}

async function handleCloudTipsRent() {
    if (!CURRENT_PAYMENT_ITEM) return;

    const nft_address = CURRENT_PAYMENT_ITEM.nft_address;
    const days = parseInt(document.getElementById('rent-duration-input').value) || 1;

    showPaymentLoader();
    try {
        showToast(t('invoice_creating'));
        const res = await apiFetch(`${BACKEND_URL}/api/create_cloudtips_invoice`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nft_address, days })
        });
        const data = await res.json();

        if (data.payment_url) {
            tg.openLink(data.payment_url);
            showToast(t('redirecting_to_pay'));
        } else {
            tg.showAlert(t('invoice_error', { msg: (data.error || t('error')) }));
        }
    } catch (e) {
        console.error("CloudTips error:", e);
        tg.showAlert(t('network_error_server'));
    } finally {
        hidePaymentLoader();
    }
}
async function handleLavaTopRent() {
    if (!CURRENT_PAYMENT_ITEM) return;

    const nft_address = CURRENT_PAYMENT_ITEM.nft_address;
    const days = parseInt(document.getElementById('rent-duration-input').value) || 1;

    showPaymentLoader();
    try {
        showToast(t('invoice_creating'));
        const res = await apiFetch(`${BACKEND_URL}/api/create_lavatop_invoice`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nft_address, days })
        });
        const data = await res.json();

        if (data.payment_url) {
            tg.openLink(data.payment_url);
            showToast(t('redirecting_to_pay'));
        } else {
            tg.showAlert(t('invoice_error', { msg: (data.error || t('error')) }));
        }
    } catch (e) {
        console.error("LavaTop error:", e);
        tg.showAlert(t('network_error_server'));
    } finally {
        hidePaymentLoader();
    }
}


function handleChangeWallet() {
    tonConnectUI.disconnect().then(() => {
        tonConnectUI.connectWallet();
    });
}

function showBlockchainFeeDetails(e) {
    if (e) e.stopPropagation();
    const modal = document.getElementById('fee-details-modal');
    if (!modal) return;

    const title = modal.querySelector('h3');
    if (title) title.innerText = t('about_network_fee');

    const body = document.getElementById('fee-details-body');
    
    if (SELECTED_PAY_METHOD === 'CLOUDTIPS') {
        body.innerHTML = `
            <div style="font-size: 14px; line-height: 1.6; color: #fff;">
                <p style="color: #fff; font-weight: 700; margin-bottom: 12px; font-size: 15px;">${t('fee_details_rub_title')}</p>
                <p style="color: #8b9bb4; margin-bottom: 16px;">${t('fee_details_rub_desc')}</p>
                
                <div style="background: rgba(255,255,255,0.05); border-radius: 12px; padding: 12px; margin-bottom: 16px;">
                    <div style="font-family: monospace; font-size: 13px; color: #00d488; margin-bottom: 4px;">${t('fee_details_formula_label')}</div>
                    <div style="font-size: 15px; font-weight: 700;">${t('fee_details_formula_val')}</div>
                </div>

                <ul style="color: #8b9bb4; padding-left: 20px; list-style-type: decimal;">
                    <li style="margin-bottom: 8px;"><b>${t('fee_details_ton_gas')}</b> ${t('fee_details_ton_gas_desc')}</li>
                    <li style="margin-bottom: 8px;"><b>${t('fee_details_rate')}</b> ${t('fee_details_rate_desc')}</li>
                    <li style="margin-bottom: 8px;"><b>${t('fee_details_markup')}</b> ${t('fee_details_markup_desc')}</li>
                </ul>

                <p style="color: #FF9500; font-size: 12px; margin-top: 16px; display: flex; gap: 8px; align-items: flex-start;">
                    <span>⚠️</span>
                    <span>${t('fee_details_rub_warning')}</span>
                </p>
            </div>`;
    } else {
        body.innerHTML = `
            <div style="font-size: 14px; line-height: 1.6; color: #fff;">
                <p style="color: #8b9bb4;">${t('fee_details_ton_desc')}</p>
                
                <p style="margin-top: 14px;"><b>${t('fee_details_xrocket_title')}</b></p>
                <p style="color: #8b9bb4;">${t('fee_details_xrocket_desc')}</p>
                
                <p style="margin-top: 14px;"><b>${t('fee_details_why_external_title')}</b></p>
                <p style="color: #8b9bb4;">${t('fee_details_why_external_desc')}</p>
                
                <p style="margin-top: 14px;"><b>${t('fee_details_total_calc_title')}</b></p>
                <ul style="color: #8b9bb4; padding-left: 20px; margin-top: 6px;">
                    <li><b>${t('fee_details_ton_wallet')}</b> ${t('fee_details_ton_wallet_desc')}</li>
                    <li><b>${t('fee_details_xrocket_label')}</b> ${t('fee_details_xrocket_desc_total')}</li>
                </ul>
            </div>`;
    }

    modal.style.display = 'flex';
    setTimeout(() => {
        const overlay = modal.querySelector('.modal-overlay');
        const content = modal.querySelector('.modal-content');
        if (overlay) overlay.style.opacity = '1';
        if (content) {
            content.style.transform = 'translateY(0)';
            content.style.opacity = '1';
        }
    }, 10);
}

function closeBlockchainFeeDetails() {
    const modal = document.getElementById('fee-details-modal');
    if (modal) modal.style.display = 'none';
}

async function handleBotRent(gateway) {
    const loadingToast = showToast(t('invoice_creating'));
    try {
        const dur = parseInt(document.getElementById('rent-duration-input').value);
        const resp = await fetch(`${BACKEND_URL}/api/create_bot_invoice`, {
            method: 'POST',
            body: JSON.stringify({
                nft_address: CURRENT_PAYMENT_ITEM.nft_address,
                days: dur,
                gateway: gateway
            }),
            headers: {
                'Content-Type': 'application/json',
                'X-TG-Data': Telegram.WebApp.initData
            }
        });
        const res = await resp.json();
        console.log('[handleBotRent] response:', JSON.stringify(res));
        if (res.payment_url) {
            // Use openTelegramLink to open bot invoice as in-app mini-app overlay
            tg.openTelegramLink(res.payment_url);
            showToast(t('invoice_created_xrocket'));
        } else {
            showToast((res.error || t('error')) + " (код: " + (resp.status || '?') + ")");
        }
    } catch (e) {
        console.error("Bot rent error:", e);
        showToast(t('server_error', { msg: e.message }));
    }
}

async function handleTonRent() {
    try {
        // Check wallet connection - correct property is .account not .connected
        if (!tonConnectUI || !tonConnectUI.account) {
            tonConnectUI.openModal();
            showToast(t('connect_wallet_ton'));
            return;
        }
        const dur = parseInt(document.getElementById('rent-duration-input').value);
        showToast(t('preparing_transaction'));
        const resp = await fetch(`${BACKEND_URL}/api/prepare_rent`, {
            method: 'POST',
            body: JSON.stringify({ nft_address: CURRENT_PAYMENT_ITEM.nft_address, days: dur }),
            headers: {
                'Content-Type': 'application/json',
                'X-TG-Data': window.Telegram.WebApp.initData
            }
        });
        const res = await resp.json();
        if (res.messages && res.messages.length > 0) {
            const transaction = {
                validUntil: Math.floor(Date.now() / 1000) + 600,
                messages: res.messages
            };
            console.log("Preparing TON transaction:", transaction);
            await tonConnectUI.sendTransaction(transaction);
            
            // Вместо быстрого закрытия показываем экран успеха внутри модалки
            const selView = document.getElementById('payment-selection-view');
            if (selView) {
                selView.innerHTML = `
                    <div style="text-align:center; padding: 20px 15px;">
                        <div style="font-size: 40px; margin-bottom: 15px;">✅</div>
                        <h2 style="color: #fff; margin-bottom: 10px; font-size: 1.2rem;">${t('transaction_sent')}</h2>
                        <p style="color: #8b9bb4; line-height: 1.4; margin-bottom: 20px; font-size: 0.9rem;">
                            ${t('payment_processing_ton')}
                        </p>
                        
                        <div style="background: rgba(255,255,255,0.05); padding: 15px; border-radius: 12px; margin-bottom: 20px; text-align: left;">
                            <label style="display: block; color: #fff; font-size: 0.85rem; margin-bottom: 8px;">${t('fragment_tc_link_label')}</label>
                            <input type="text" id="modal-tc-link-input" placeholder="${t('fragment_tc_link_placeholder')}" 
                                   style="width: 100%; background: #1a1f26; border: 1px solid #3d4652; color: #fff; padding: 10px; border-radius: 8px; font-size: 0.85rem; outline: none;">
                            <p style="color: #6a7a8f; font-size: 0.75rem; margin-top: 8px;">
                                ${t('fragment_tc_link_hint')}
                            </p>
                            <button onclick="submitTCLinkFromModal(${res.order_id})" class="main-rent-btn" style="width: 100%; margin-top: 10px; padding: 10px; height: auto; min-height: 40px;">${t('save_auto_connect')}</button>
                        </div>

                        <button onclick="closePaymentModal(); loadLiveItems(true);" class="main-rent-btn" style="width:100%; background: none; border: 1px solid #3d4652; color: #8b9bb4;">${t('skip_and_close')}</button>
                    </div>
                `;
            } else {
                closePaymentModal();
                showToast(t('transaction_sent'));
            }
        } else {
            showToast(res.error || t('payment_prepare_error'));
        }
    } catch (e) {
        console.error(e);
        if (e && e.message !== 'Reject request') {
            showToast(t('transaction_send_error'));
        }
    }
}

async function handleUsdtRent() {
    try {
        const dur = parseInt(document.getElementById('rent-duration-input').value);
        const amountUsdtRaw = (parseFloat(document.getElementById('pay-price-usdt').innerText) * 1e6).toFixed(0);

        const resp = await fetch(`${BACKEND_URL}/api/prepare_rent`, {
            method: 'POST',
            body: JSON.stringify({ nft_address: CURRENT_PAYMENT_ITEM.nft_address, days: dur }),
            headers: { 'Content-Type': 'application/json' }
        });
        const orderRes = await resp.json();

        const payloadResp = await fetch(`${BACKEND_URL}/api/get_usdt_payload?order_id=${orderRes.order_id}&amount=${amountUsdtRaw}`);
        const payloadData = await payloadResp.json();

        const transaction = {
            validUntil: Math.floor(Date.now() / 1000) + 600,
            messages: [{
                address: USDT_JETTON_ADDRESS,
                amount: "50000000", // 0.05 TON for gas
                payload: payloadData.payload
            }]
        };
        await tonConnectUI.sendTransaction(transaction);
        
        const selView = document.getElementById('payment-selection-view');
        if (selView) {
            selView.innerHTML = `
                <div style="text-align:center; padding: 20px 15px;">
                    <div style="font-size: 40px; margin-bottom: 15px;">✅</div>
                    <h2 style="color: #fff; margin-bottom: 10px; font-size: 1.2rem;">${t('transaction_sent')}</h2>
                    <p style="color: #8b9bb4; line-height: 1.4; margin-bottom: 20px; font-size: 0.9rem;">
                        ${t('payment_processing_usdt')}
                    </p>
                    
                    <div style="background: rgba(255,255,255,0.05); padding: 15px; border-radius: 12px; margin-bottom: 20px; text-align: left;">
                        <label style="display: block; color: #fff; font-size: 0.85rem; margin-bottom: 8px;">${t('fragment_tc_link_label')}</label>
                        <input type="text" id="modal-tc-link-input" placeholder="${t('fragment_tc_link_placeholder')}" 
                               style="width: 100%; background: #1a1f26; border: 1px solid #3d4652; color: #fff; padding: 10px; border-radius: 8px; font-size: 0.85rem; outline: none;">
                        <button onclick="submitTCLinkFromModal(${orderRes.order_id})" class="main-rent-btn" style="width: 100%; margin-top: 10px; padding: 10px; height: auto; min-height: 40px;">${t('save_auto_connect')}</button>
                    </div>

                    <button onclick="closePaymentModal(); loadLiveItems(true);" class="main-rent-btn" style="width:100%; background: none; border: 1px solid #3d4652; color: #8b9bb4;">${t('skip_and_close')}</button>
                </div>
            `;
        } else {
            closePaymentModal();
            showToast(t('transaction_sent'));
        }
    } catch (e) { 
        console.error(e);
        if (e && e.message !== 'Reject request') {
            showToast(t('transaction_send_error'));
        }
    }
}

async function submitTCLinkFromModal(orderId) {
    const input = document.getElementById('modal-tc-link-input');
    const link = input ? input.value.trim() : "";
    
    if (!link) {
        showToast(t('insert_link_first'));
        return;
    }
    
    if (!link.startsWith("ton-connect://") && !link.startsWith("https://ton-connect.org")) {
        showToast(t('invalid_link_format'));
        return;
    }
    
    try {
        showToast(t('saving_link'));
        const resp = await fetch(`${BACKEND_URL}/api/submit_tc_link`, {
            method: 'POST',
            body: JSON.stringify({ order_id: orderId, tc_link: link }),
            headers: {
                'Content-Type': 'application/json',
                'X-TG-Data': window.Telegram.WebApp.initData
            }
        });
        const res = await resp.json();
        if (res.status === 'ok') {
            showToast(t('link_saved_success'));
            closePaymentModal();
            loadLiveItems(true);
        } else {
            showToast(res.error || t('save_error'));
        }
    } catch (e) {
        console.error(e);
        showToast(t('save_network_error'));
    }
}

async function handleRubRent() {
    try {
        const dur = parseInt(document.getElementById('rent-duration-input').value);
        const resp = await fetch(`${BACKEND_URL}/api/create_fiat_invoice`, {
            method: 'POST',
            body: JSON.stringify({
                nft_address: CURRENT_PAYMENT_ITEM.nft_address,
                days: dur,
                gateway: 'freekassa',
                currency: 'RUB'
            }),
            headers: { 'Content-Type': 'application/json' }
        });
        const res = await resp.json();
        if (res.payment_url) {
            tg.openTelegramLink(res.payment_url);
            closePaymentModal();
        }
    } catch (e) { console.error(e); }
}


function toggleHistory() {
    const botUsername = "OctoRent_bot";
    const link = `https://t.me/${botUsername}?start=history`;
    if (window.Telegram && window.Telegram.WebApp) {
        window.Telegram.WebApp.openTelegramLink(link);
        window.Telegram.WebApp.close();
    } else {
        window.open(link, '_blank');
    }
}

// Map globals
window.openPaymentModal = openPaymentModal;
window.closePaymentModal = closePaymentModal;
window.switchPayTab = switchPayTab;
window.selectPayMethod = selectPayMethod;
window.handleContinuePayment = handleContinuePayment;
window.handleChangeWallet = handleChangeWallet;
window.showBlockchainFeeDetails = showBlockchainFeeDetails;
window.closeBlockchainFeeDetails = closeBlockchainFeeDetails;
window.nextCTStep = nextCTStep;
window.finalCTOrder = finalCTOrder;
window.zoomCTImage = zoomCTImage;
window.closeCTZoom = closeCTZoom;
window.showInsufficientBalanceModal = showInsufficientBalanceModal;
window.closeInsufficientBalanceModal = closeInsufficientBalanceModal;
window.contactAdmin = contactAdmin;
window.toggleHistory = toggleHistory;
window.getOperatorContacts = getOperatorContacts;

function showPaymentLoader() {
    const overlay = document.getElementById('payment-loading-overlay');
    if (overlay) overlay.style.display = 'flex';
}

function hidePaymentLoader() {
    const overlay = document.getElementById('payment-loading-overlay');
    if (overlay) overlay.style.display = 'none';
}

// Инициализация: получить актуальные контакты
getOperatorContacts();
