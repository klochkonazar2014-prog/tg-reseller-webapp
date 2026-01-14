// Consts
let tg = null;
const MY_MARKUP = 0.20;
const OWNER_WALLET = "UQBxgCx_WJ4_fKgz8tec73NZadhoDzV250-Y0taVPJstZsRl";
const MANIFEST_URL = "https://klochkonazar2014-prog.github.io/tg-reseller-webapp/tonconnect-manifest.json";

// Tunnel URL
const BACKEND_URL = "https://b7a124fe55e34f3c-176-119-99-6.serveousercontent.com";

let tonConnectUI;
let ALL_MARKET_ITEMS = [];
let FILTERED_ITEMS = [];
let RENDERED_COUNT = 0;
const BATCH_SIZE = 20;
let CURRENT_MODAL_TYPE = null;

// ГЛОБАЛЬНЫЙ STATE ФИЛЬТРОВ
let ACTIVE_FILTERS = {
    nft: 'all',
    model: 'all',
    bg: 'all',
    symbol: 'all',
    tags: 'all',
    sort: 'price_asc',
    price_from: null,
    price_to: null,
    gift_number: null,
    search: ""
};

document.addEventListener("DOMContentLoaded", async () => {
    try {
        if (window.Telegram && window.Telegram.WebApp) {
            tg = window.Telegram.WebApp;
            tg.expand();
            tg.MainButton.hide();
        }
        initTonConnect();
        await loadLiveItems();

        document.getElementById('search-input').addEventListener('input', debounce((e) => {
            ACTIVE_FILTERS.search = e.target.value.toLowerCase();
            applyHeaderSearch();
        }, 500));

        // Block Zoom
        document.addEventListener('touchstart', (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
        let lastTouchEnd = 0;
        document.addEventListener('touchend', (e) => {
            const now = Date.now();
            if (now - lastTouchEnd <= 300) e.preventDefault();
            lastTouchEnd = now;
        }, false);
        window.addEventListener('wheel', (e) => { if (e.ctrlKey) e.preventDefault(); }, { passive: false });
        window.addEventListener('keydown', (e) => {
            if (e.ctrlKey && (e.key === '=' || e.key === '-' || e.key === '+' || e.key === '0')) e.preventDefault();
        });

    } catch (e) { alert("Init Error: " + e.message); }
});

async function loadLiveItems() {
    const loader = document.getElementById('top-loader');
    try {
        const response = await fetch(`${BACKEND_URL}/api/items?limit=80`);
        const data = await response.json();

        if (data.items) {
            ALL_MARKET_ITEMS = data.items.map(item => {
                // Извлекаем номер из названия (напр. "Ginger Cookie #1234")
                const match = item.nft_name.match(/#(\d+)/);
                item._nftNum = match ? parseInt(match[1]) : 0;
                return item;
            });

            // Кэшируем уникальные коллекции
            const uniqueCols = new Map();
            ALL_MARKET_ITEMS.forEach(i => {
                if (i._collection) uniqueCols.set(i._collection.address, i._collection);
            });
            window.STATIC_COLLECTIONS = Array.from(uniqueCols.values());

            applyHeaderSearch();
        }
    } catch (e) {
        if (loader) loader.innerText = "Ошибка подключения к рынку.";
    }
}

function initTonConnect() {
    tonConnectUI = new TON_CONNECT_UI.TonConnectUI({
        manifestUrl: MANIFEST_URL,
        buttonRootId: 'ton-connect-btn'
    });
}

function applyHeaderSearch() {
    // 1. Фильтрация
    FILTERED_ITEMS = ALL_MARKET_ITEMS.filter(item => {
        if (ACTIVE_FILTERS.nft !== 'all' && item._collection.address !== ACTIVE_FILTERS.nft) return false;
        if (ACTIVE_FILTERS.model !== 'all' && item._modelName !== ACTIVE_FILTERS.model) return false;
        if (ACTIVE_FILTERS.bg !== 'all' && item._backdrop !== ACTIVE_FILTERS.bg) return false;
        if (ACTIVE_FILTERS.symbol !== 'all' && item._symbol !== ACTIVE_FILTERS.symbol) return false;

        const price = parseFloat(item.price_per_day) / 1000000000 * (1 + MY_MARKUP);
        if (ACTIVE_FILTERS.price_from && price < ACTIVE_FILTERS.price_from) return false;
        if (ACTIVE_FILTERS.price_to && price > ACTIVE_FILTERS.price_to) return false;

        if (ACTIVE_FILTERS.gift_number && item._nftNum !== parseInt(ACTIVE_FILTERS.gift_number)) return false;

        if (ACTIVE_FILTERS.search && !item.nft_name.toLowerCase().includes(ACTIVE_FILTERS.search)) return false;

        return true;
    });

    // 2. Сортировка
    FILTERED_ITEMS.sort((a, b) => {
        const pA = parseFloat(a.price_per_day);
        const pB = parseFloat(b.price_per_day);

        switch (ACTIVE_FILTERS.sort) {
            case 'price_asc': return pA - pB;
            case 'price_desc': return pB - pA;
            case 'num_asc': return a._nftNum - b._nftNum;
            case 'num_desc': return b._nftNum - a._nftNum;
            case 'model_rare': return a._modelName.localeCompare(b._modelName); // Упрощенно
            case 'bg_rare': return a._backdrop.localeCompare(b._backdrop);
            case 'symbol_rare': return a._symbol.localeCompare(b._symbol);
            default: return 0;
        }
    });

    RENDERED_COUNT = 0;
    document.getElementById('items-view').innerHTML = "";
    const loader = document.getElementById('top-loader');
    if (loader) loader.style.display = 'none';

    if (FILTERED_ITEMS.length === 0) {
        document.getElementById('items-view').innerHTML = "<p style='text-align:center; color:#8b9bb4; grid-column:1/-1; padding:20px;'>Ничего не найдено :(</p>";
        return;
    }
    appendItems();
}

function appendItems() {
    const container = document.getElementById('items-view');
    const fragment = document.createDocumentFragment();
    const start = RENDERED_COUNT;
    const end = Math.min(RENDERED_COUNT + BATCH_SIZE, FILTERED_ITEMS.length);
    for (let i = start; i < end; i++) {
        fragment.appendChild(createItemCard(FILTERED_ITEMS[i]));
    }
    container.appendChild(fragment);
    RENDERED_COUNT = end;
    observeNewCards();
}

function createItemCard(item) {
    const card = document.createElement('div');
    card.className = "card";

    const price = parseFloat(item.price_per_day) / 1000000000;
    const myPrice = (price * (1 + MY_MARKUP)).toFixed(2);

    const match = item.nft_name.match(/^(.*?)\s*(#\d+)$/);
    const baseName = match ? match[1] : item.nft_name;
    const numStr = match ? match[2] : "";

    let fallbackImg = item._collection.image_url || "https://cdn-icons-png.flaticon.com/512/4213/4213958.png";
    const fragmentUrls = generateFragmentUrls(item.nft_name);
    const lottieId = `lottie-${item.nft_address}`;
    let imgSrc = item._realImage || fragmentUrls.image || fallbackImg;

    let mediaHTML = `<img src="${imgSrc}" class="card-img" id="img-${lottieId}" loading="lazy" onerror="this.src='${fallbackImg}'">`;
    if (fragmentUrls.lottie) mediaHTML += `<div id="${lottieId}" class="card-img lottie-container" style="z-index: 2;"></div>`;

    card.innerHTML = `
        <div class="card-image-wrapper">
             ${mediaHTML}
             <div class="sweep-btn">Live</div>
        </div>
        <div class="card-content">
            <h3 class="card-title">${baseName}</h3>
            <div class="card-number">${numStr}</div>
            <div class="card-subtitle">${item._modelName}</div> 
            <div class="card-bottom-row">
                <button class="card-price-btn">
                    <span>${myPrice} TON</span>
                </button>
                <button class="card-cart-btn">
                     <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path>
                        <line x1="16" y1="10" x2="16" y2="10.01"></line>
                        <path d="M12 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"></path>
                        <path d="M12 14v4"></path>
                        <path d="M10 16h4"></path>
                     </svg>
                </button>
            </div>
            <div class="card-duration">Аренда на 1 день</div>
        </div>
    `;

    card.onclick = (e) => {
        if (e.target.closest('.card-cart-btn')) {
            e.stopPropagation();
            alert("Товар добавлен в корзину!");
            return;
        }
        openPaymentModal(item, myPrice, imgSrc);
    };

    if (fragmentUrls.lottie) {
        card.dataset.lottieUrl = fragmentUrls.lottie;
        card.dataset.lottieId = lottieId;
        card.classList.add('has-lottie');
    }
    return card;
}

// --- MODALS ---

function openAdvancedFilters() {
    document.getElementById('mrkt-modal').classList.add('active');
    document.getElementById('mrkt-modal-overlay').classList.add('active');

    // Подгружаем текущие значения в инпуты
    document.getElementById('filter-gift-number').value = ACTIVE_FILTERS.gift_number || "";
    document.getElementById('filter-price-from').value = ACTIVE_FILTERS.price_from || "";
    document.getElementById('filter-price-to').value = ACTIVE_FILTERS.price_to || "";
}

function closeMrktModal() {
    document.getElementById('mrkt-modal').classList.remove('active');
    document.getElementById('mrkt-modal-overlay').classList.remove('active');
}

function toggleGenericModal(type) {
    CURRENT_MODAL_TYPE = type;
    const modal = document.getElementById('generic-list-modal');
    const container = document.getElementById('generic-list-container');
    const title = document.getElementById('generic-modal-title');

    container.innerHTML = '';
    modal.classList.add('active');

    if (type === 'sort') {
        title.innerText = 'Сортировка';
        const sorts = [
            { id: 'price_asc', n: 'Цена (По возрастанию)' },
            { id: 'price_desc', n: 'Цена (По убыванию)' },
            { id: 'num_asc', n: 'Номер подарка (По возрастанию)' },
            { id: 'num_desc', n: 'Номер подарка (По убыванию)' },
            { id: 'model_rare', n: 'Редкость модели' },
            { id: 'bg_rare', n: 'Редкость фона' },
            { id: 'symbol_rare', n: 'Редкость символа' }
        ];
        sorts.forEach(s => addGenericItem(container, s.n, s.id, ACTIVE_FILTERS.sort === s.id));
    } else if (type === 'nft') {
        title.innerText = 'Коллекция';
        addGenericItem(container, "Все", "all", ACTIVE_FILTERS.nft === 'all');
        (window.STATIC_COLLECTIONS || []).forEach(col => addGenericItem(container, col.name, col.address, col.address === ACTIVE_FILTERS.nft, col.image_url));
    } else {
        const titleMap = { 'model': 'Модель', 'bg': 'Фон', 'symbol': 'Символ', 'tags': 'Теги' };
        title.innerText = titleMap[type] || 'Выбор';
        const filterKey = type === 'bg' ? '_backdrop' : (type === 'symbol' ? '_symbol' : '_modelName');

        const uniqueVals = new Set();
        ALL_MARKET_ITEMS.forEach(i => { if (i[filterKey]) uniqueVals.add(i[filterKey]); });

        addGenericItem(container, "Все", "all", ACTIVE_FILTERS[type] === 'all');
        Array.from(uniqueVals).sort().forEach(v => addGenericItem(container, v, v, v === ACTIVE_FILTERS[type]));
    }
}

function addGenericItem(container, name, value, isSelected, imgUrl = null) {
    const div = document.createElement('div');
    div.className = `filter-list-item ${isSelected ? 'selected' : ''}`;
    div.innerHTML = `
        <div class="filter-item-left">
            ${imgUrl ? `<img src="${imgUrl}" class="filter-img">` : `<div style="width:22px;height:22px;border-radius:50%;border:2px solid ${isSelected ? '#0088cc' : '#555'}"></div>`}
            <span style="color:white; font-weight:600; margin-left:10px;">${name}</span>
        </div>
        ${isSelected ? '<span style="color:#0088cc">●</span>' : ''}
    `;
    div.onclick = () => {
        ACTIVE_FILTERS[CURRENT_MODAL_TYPE] = value;
        closeGenericModal();
        // Если это была сортировка, сразу применяем
        if (CURRENT_MODAL_TYPE === 'sort') applyHeaderSearch();
    };
    container.appendChild(div);
}

function closeGenericModal() {
    document.getElementById('generic-list-modal').classList.remove('active');
}

function resetMrktModal() {
    ACTIVE_FILTERS = { nft: 'all', model: 'all', bg: 'all', symbol: 'all', tags: 'all', sort: 'price_asc', price_from: null, price_to: null, gift_number: null, search: ACTIVE_FILTERS.search };
    document.getElementById('filter-gift-number').value = "";
    document.getElementById('filter-price-from').value = "";
    document.getElementById('filter-price-to').value = "";
    applyHeaderSearch();
    closeMrktModal();
}

function applyMrktModal() {
    ACTIVE_FILTERS.gift_number = document.getElementById('filter-gift-number').value || null;
    ACTIVE_FILTERS.price_from = parseFloat(document.getElementById('filter-price-from').value) || null;
    ACTIVE_FILTERS.price_to = parseFloat(document.getElementById('filter-price-to').value) || null;

    applyHeaderSearch();
    closeMrktModal();
}

// --- UTILS ---

function debounce(func, wait) {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), wait);
    };
}

function generateFragmentUrls(nftName) {
    if (!nftName) return { image: null, lottie: null };
    const match = nftName.match(/^(.+?)\s*#(\d+)$/);
    if (!match) return { image: null, lottie: null };
    let name = match[1].trim().toLowerCase().replace(/\s+/g, '');
    const number = match[2];
    return {
        image: `https://nft.fragment.com/gift/${name}-${number}.webp`,
        lottie: `https://nft.fragment.com/gift/${name}-${number}.lottie.json`
    };
}

function observeNewCards() {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (!entry.target.dataset.lottieUrl) return;
            const container = document.getElementById(entry.target.dataset.lottieId);
            if (entry.isIntersecting) {
                if (!container.anim) {
                    container.anim = lottie.loadAnimation({ container: container, renderer: 'svg', loop: true, autoplay: true, path: entry.target.dataset.lottieUrl });
                } else container.anim.play();
            } else if (container.anim) container.anim.pause();
        });
    }, { rootMargin: "100px" });
    document.querySelectorAll('.card.has-lottie').forEach(c => observer.observe(c));
}

async function openPaymentModal(item, finalPrice, imgSrc) {
    const modal = document.getElementById('payment-modal');
    modal.classList.add('active');
    document.getElementById('modal-title').innerText = item.nft_name;
    document.getElementById('modal-price').innerText = `${finalPrice} TON`;
    document.getElementById('modal-img').src = imgSrc;
    document.getElementById('modal-img').style.display = 'block';

    const confirmBtn = document.getElementById('confirm-pay-btn');
    const tonBtn = document.getElementById('ton-connect-btn');

    const check = () => {
        if (tonConnectUI.connected) { confirmBtn.style.display = 'block'; tonBtn.style.display = 'none'; }
        else { confirmBtn.style.display = 'none'; tonBtn.style.display = 'block'; }
    };
    check();

    confirmBtn.onclick = async () => {
        const tx = { validUntil: Math.floor(Date.now() / 1000) + 600, messages: [{ address: OWNER_WALLET, amount: (finalPrice * 1000000000).toString() }] };
        try {
            confirmBtn.disabled = true;
            const result = await tonConnectUI.sendTransaction(tx);
            if (result) {
                await fetch(`${BACKEND_URL}/api/mark_rented`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nft_address: item.nft_address }) });
                ALL_MARKET_ITEMS = ALL_MARKET_ITEMS.filter(i => i.nft_address !== item.nft_address);
                closeModal(); applyHeaderSearch(); alert("Успешно! Аренда активна.");
            }
        } catch (e) { alert("Ошибка оплаты."); }
        finally { confirmBtn.disabled = false; }
    };
}

function closeModal() { document.getElementById('payment-modal').classList.remove('active'); }

const trigger = document.getElementById('loader-trigger');
if (trigger) {
    const scrollObserver = new IntersectionObserver((entries) => { if (entries[0].isIntersecting) appendItems(); });
    scrollObserver.observe(trigger);
}
