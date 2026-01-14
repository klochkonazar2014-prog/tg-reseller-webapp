// Consts
let tg = null;
const MY_MARKUP = 0.20;
const OWNER_WALLET = "UQBxgCx_WJ4_fKgz8tec73NZadhoDzV250-Y0taVPJstZsRl";
const MANIFEST_URL = "https://klochkonazar2014-prog.github.io/tg-reseller-webapp/tonconnect-manifest.json";

// Tunnel URL (localtunnel)
const BACKEND_URL = "https://0c28fcf37ed8524f-176-119-99-6.serveousercontent.com";

let tonConnectUI;
let ALL_MARKET_ITEMS = [];
let FILTERED_ITEMS = [];
let RENDERED_COUNT = 0;
const BATCH_SIZE = 20;
let CURRENT_MODAL_TYPE = null;

document.addEventListener("DOMContentLoaded", async () => {
    try {
        if (window.Telegram && window.Telegram.WebApp) {
            tg = window.Telegram.WebApp;
            tg.expand();
            tg.MainButton.hide();
        }
        initTonConnect();

        // Загружаем через прокси-сервер (чтобы избежать CORS и ошибок fetch)
        await loadLiveItems();

        document.getElementById('search-input').addEventListener('input', debounce(applyHeaderSearch, 500));
        const modalSearch = document.getElementById('mrkt-modal-search');
        if (modalSearch) modalSearch.addEventListener('input', (e) => filterModalList(e.target.value));

        // Prevent Zoom (Pinch & Double-tap)
        document.addEventListener('touchstart', (e) => {
            if (e.touches.length > 1) e.preventDefault();
        }, { passive: false });

        let lastTouchEnd = 0;
        document.addEventListener('touchend', (e) => {
            const now = Date.now();
            if (now - lastTouchEnd <= 300) e.preventDefault();
            lastTouchEnd = now;
        }, false);

        document.addEventListener('gesturestart', (e) => e.preventDefault());

    } catch (e) { alert("Init Error: " + e.message); }
});

async function loadLiveItems() {
    const loader = document.getElementById('top-loader');
    if (loader) loader.innerText = "Connecting to market via tunnel...";

    try {
        const response = await fetch(`${BACKEND_URL}/api/items?limit=80`);
        const data = await response.json();

        if (data.items) {
            ALL_MARKET_ITEMS = data.items;

            const uniqueCols = new Map();
            ALL_MARKET_ITEMS.forEach(i => {
                if (i._collection) uniqueCols.set(i._collection.address, i._collection);
            });
            window.STATIC_COLLECTIONS = Array.from(uniqueCols.values());

            applyHeaderSearch();
        } else {
            if (loader) loader.innerText = "No items found.";
        }
    } catch (e) {
        console.error(e);
        if (loader) loader.innerText = "Tunnel connection failed. Check if server is running.";
    }
}

function initTonConnect() {
    tonConnectUI = new TON_CONNECT_UI.TonConnectUI({
        manifestUrl: MANIFEST_URL,
        buttonRootId: 'ton-connect-btn'
    });
}

// --- ФИЛЬТРАЦИЯ И РЕНДЕР ---

function applyHeaderSearch() {
    const searchQ = document.getElementById('search-input').value.toLowerCase();

    FILTERED_ITEMS = ALL_MARKET_ITEMS.filter(item => {
        if (ACTIVE_FILTERS.collection !== 'all') {
            if (item._collection.address !== ACTIVE_FILTERS.collection) return false;
        }
        if (ACTIVE_FILTERS.model !== 'all') {
            if (item._modelName !== ACTIVE_FILTERS.model) return false;
        }
        if (ACTIVE_FILTERS.bg !== 'all') {
            if (item._backdrop !== ACTIVE_FILTERS.bg) return false;
        }
        if (ACTIVE_FILTERS.symbol !== 'all') {
            if (item._symbol !== ACTIVE_FILTERS.symbol) return false;
        }
        if (searchQ && !item.nft_name.toLowerCase().includes(searchQ)) return false;
        return true;
    });

    FILTERED_ITEMS.sort((a, b) => {
        const pA = parseFloat(a.price_per_day);
        const pB = parseFloat(b.price_per_day);
        if (ACTIVE_FILTERS.sort === 'price_asc') return pA - pB;
        if (ACTIVE_FILTERS.sort === 'price_desc') return pB - pA;
        return 0;
    });

    RENDERED_COUNT = 0;
    document.getElementById('items-view').innerHTML = "";
    const loader = document.getElementById('top-loader');
    if (loader) loader.style.display = 'none';

    if (FILTERED_ITEMS.length === 0) {
        document.getElementById('items-view').innerHTML = "<p style='text-align:center; color:#8b9bb4; grid-column:1/-1; padding:20px;'>Nothing found :(</p>";
        return;
    }
    appendItems();
}

function appendItems() {
    const container = document.getElementById('items-view');
    const fragment = document.createDocumentFragment();
    const start = RENDERED_COUNT;
    const end = Math.min(RENDERED_COUNT + BATCH_SIZE, FILTERED_ITEMS.length);
    if (start >= end) return;

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

    let fallbackImg = item._collection.image_url || "https://cdn-icons-png.flaticon.com/512/4213/4213958.png";
    const fragmentUrls = generateFragmentUrls(item.nft_name);
    const lottieId = `lottie-${item.nft_address}`;

    let imgSrc = item._realImage || fragmentUrls.image || fallbackImg;

    // Media HTML
    let mediaHTML = `<img src="${imgSrc}" class="card-img" id="img-${lottieId}" loading="lazy" onerror="this.src='${fallbackImg}'">`;
    if (fragmentUrls.lottie) mediaHTML += `<div id="${lottieId}" class="card-img lottie-container" style="z-index: 2;"></div>`;

    card.innerHTML = `
        <div class="card-image-wrapper">
             ${mediaHTML}
             <div class="sweep-btn">Live</div>
        </div>
        <div class="card-content">
            <h3 class="card-title">${item.nft_name}</h3>
            <div class="card-subtitle">${item._modelName}</div> 
            <button class="card-price-btn">
                <span>${myPrice} TON</span>
            </button>
        </div>
    `;

    card.onclick = () => openPaymentModal(item, myPrice, imgSrc);

    if (fragmentUrls.lottie) {
        card.dataset.lottieUrl = fragmentUrls.lottie;
        card.dataset.lottieId = lottieId;
        card.classList.add('has-lottie');
    }

    return card;
}

// ГЛОБАЛЬНЫЙ STATE ФИЛЬТРОВ
let ACTIVE_FILTERS = {
    collection: 'all',
    model: 'all',
    bg: 'all',
    symbol: 'all',
    sort: 'price_asc'
};

function toggleGenericModal(type) {
    if (type === 'sort') { cycleSort(); return; }
    CURRENT_MODAL_TYPE = type;
    const modal = document.getElementById('mrkt-modal');
    const overlay = document.getElementById('mrkt-modal-overlay');
    const title = document.getElementById('mrkt-modal-title');
    const container = document.getElementById('mrkt-list-container');

    container.innerHTML = '';
    modal.classList.add('active');
    overlay.classList.add('active');

    if (type === 'nft') {
        title.innerText = 'Collection';
        addModalItem(container, "All", "all", ACTIVE_FILTERS.collection === 'all', "");
        (window.STATIC_COLLECTIONS || []).forEach(col => {
            addModalItem(container, col.name, col.address, col.address === ACTIVE_FILTERS.collection, col.image_url);
        });
    } else {
        const titleMap = { 'model': 'Model', 'bg': 'Background', 'symbol': 'Pattern' };
        title.innerText = titleMap[type] || 'Filter';
        const filterKey = type === 'bg' ? '_backdrop' : (type === 'symbol' ? '_symbol' : '_modelName');

        const uniqueVals = new Set();
        let sourceItems = ALL_MARKET_ITEMS;
        if (ACTIVE_FILTERS.collection !== 'all') {
            sourceItems = ALL_MARKET_ITEMS.filter(i => i._collection.address === ACTIVE_FILTERS.collection);
        }
        sourceItems.forEach(i => { if (i[filterKey]) uniqueVals.add(i[filterKey]); });

        addModalItem(container, "All", "all", ACTIVE_FILTERS[type] === 'all', "");
        Array.from(uniqueVals).sort().forEach(v => {
            addModalItem(container, v, v, v === ACTIVE_FILTERS[type], "");
        });
    }
}

function addModalItem(container, name, value, isSelected, imgUrl) {
    const div = document.createElement('div');
    div.className = `filter-list-item ${isSelected ? 'selected' : ''}`;
    div.innerHTML = `
        <div class="filter-item-left">
            ${imgUrl ? `<img src="${imgUrl}" class="filter-img">` : `<div class="filter-img" style="background:#333"></div>`}
            <span style="color:white; font-weight:600;">${name}</span>
        </div>
        <div class="checkbox-circle"></div>
    `;
    div.dataset.value = value;
    div.onclick = () => {
        container.querySelectorAll('.filter-list-item').forEach(el => el.classList.remove('selected'));
        div.classList.add('selected');
    };
    container.appendChild(div);
}

function closeMrktModal() {
    document.getElementById('mrkt-modal').classList.remove('active');
    document.getElementById('mrkt-modal-overlay').classList.remove('active');
}

function resetMrktModal() {
    if (CURRENT_MODAL_TYPE === 'nft') ACTIVE_FILTERS.collection = 'all';
    else ACTIVE_FILTERS[CURRENT_MODAL_TYPE] = 'all';
    closeMrktModal();
    applyHeaderSearch();
}

function applyMrktModal() {
    const selected = document.querySelector('.filter-list-item.selected');
    if (selected) {
        const val = selected.dataset.value;
        if (CURRENT_MODAL_TYPE === 'nft') {
            ACTIVE_FILTERS.collection = val;
            ACTIVE_FILTERS.model = 'all';
            ACTIVE_FILTERS.bg = 'all';
            ACTIVE_FILTERS.symbol = 'all';
        } else {
            ACTIVE_FILTERS[CURRENT_MODAL_TYPE] = val;
        }
    }
    closeMrktModal();
    applyHeaderSearch();
}

function cycleSort() {
    ACTIVE_FILTERS.sort = ACTIVE_FILTERS.sort === 'price_asc' ? 'price_desc' : 'price_asc';
    applyHeaderSearch();
}

function observeNewCards() {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (!entry.target.dataset.lottieUrl) return;
            const container = document.getElementById(entry.target.dataset.lottieId);
            if (!container) return;
            if (entry.isIntersecting) {
                if (!container.anim) {
                    try {
                        container.anim = lottie.loadAnimation({
                            container: container, renderer: 'svg', loop: true, autoplay: true, path: entry.target.dataset.lottieUrl
                        });
                    } catch (e) { }
                } else container.anim.play();
            } else {
                if (container.anim) container.anim.pause();
            }
        });
    }, { rootMargin: "100px" });
    document.querySelectorAll('.card.has-lottie').forEach(c => observer.observe(c));
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

async function openPaymentModal(item, finalPrice, imgSrc) {
    document.getElementById('payment-modal').classList.add('active');
    document.getElementById('modal-title').innerText = item.nft_name;
    document.getElementById('modal-price').innerText = `${finalPrice} TON`;
    document.getElementById('modal-img').src = imgSrc;
    document.getElementById('modal-img').style.display = 'block';

    const confirmBtn = document.getElementById('confirm-pay-btn');
    const tonBtn = document.getElementById('ton-connect-btn');

    const updateBtnVisibility = () => {
        if (tonConnectUI.connected) {
            confirmBtn.style.display = 'block';
            tonBtn.style.display = 'none';
        } else {
            confirmBtn.style.display = 'none';
            tonBtn.style.display = 'block';
        }
    };

    updateBtnVisibility();
    confirmBtn.onclick = async () => {
        const tx = {
            validUntil: Math.floor(Date.now() / 1000) + 600,
            messages: [{ address: OWNER_WALLET, amount: (finalPrice * 1000000000).toString() }]
        };
        try {
            confirmBtn.disabled = true;
            confirmBtn.innerText = "Check wallet...";
            const result = await tonConnectUI.sendTransaction(tx);
            if (result) {
                await fetch(`${BACKEND_URL}/api/mark_rented`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ nft_address: item.nft_address })
                });
                ALL_MARKET_ITEMS = ALL_MARKET_ITEMS.filter(i => i.nft_address !== item.nft_address);
                closeModal();
                applyHeaderSearch();
                alert("Success! Item will be active shortly.");
            }
        } catch (e) {
            alert("Payment failed.");
        } finally {
            confirmBtn.disabled = false;
            confirmBtn.innerText = "Confirm & Pay";
        }
    };
}

function closeModal() { document.getElementById('payment-modal').classList.remove('active'); }
function debounce(func, wait) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}
const scrollObserver = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting) appendItems();
});
const trigger = document.getElementById('loader-trigger');
if (trigger) scrollObserver.observe(trigger);
