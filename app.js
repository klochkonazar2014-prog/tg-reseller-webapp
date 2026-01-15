// Consts
let tg = null;
const MY_MARKUP = 0.20;
const OWNER_WALLET = "UQBxgCx_WJ4_fKgz8tec73NZadhoDzV250-Y0taVPJstZsRl";
const MANIFEST_URL = "https://klochkonazar2014-prog.github.io/tg-reseller-webapp/tonconnect-manifest.json";

// Tunnel URL
const BACKEND_URL = "https://81f90ce20d449dea-176-119-99-6.serveousercontent.com";

let tonConnectUI;
let ALL_MARKET_ITEMS = [];
let FILTERED_ITEMS = [];
let RENDERED_COUNT = 0;
const BATCH_SIZE = 40; // Increased batch size

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

    } catch (e) { alert("Init Error: " + e.message); }
});

async function loadLiveItems() {
    const loader = document.getElementById('top-loader');
    try {
        // Fetching more items to ensure "all" are there
        const response = await fetch(`${BACKEND_URL}/api/items?limit=1000`);
        const data = await response.json();

        if (data.items) {
            ALL_MARKET_ITEMS = data.items.map(item => {
                const match = item.nft_name.match(/#(\d+)/);
                item._nftNum = match ? parseInt(match[1]) : 0;
                return item;
            });

            // Collections
            const uniqueCols = new Map();
            ALL_MARKET_ITEMS.forEach(i => {
                if (i._collection) uniqueCols.set(i._collection.address, i._collection);
            });
            window.STATIC_COLLECTIONS = Array.from(uniqueCols.values());

            initFilterLists();
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

function initFilterLists() {
    const sortCont = document.getElementById('sort-list-container');
    const sorts = [
        { id: 'price_asc', n: 'Цена (По возрастанию)' },
        { id: 'price_desc', n: 'Цена (По убыванию)' },
        { id: 'num_asc', n: 'Номер подарка (По возрастанию)' },
        { id: 'num_desc', n: 'Номер подарка (По убыванию)' },
        { id: 'model_rare', n: 'Редкость модели' },
        { id: 'bg_rare', n: 'Редкость фона' },
        { id: 'symbol_rare', n: 'Редкость символа' }
    ];
    sortCont.innerHTML = '';
    sorts.forEach(s => addFilterItem(sortCont, s.n, s.id, 'sort', ACTIVE_FILTERS.sort === s.id));

    const nftCont = document.getElementById('nft-list-container');
    nftCont.innerHTML = '';
    addFilterItem(nftCont, "Все", "all", 'nft', ACTIVE_FILTERS.nft === 'all');
    (window.STATIC_COLLECTIONS || []).forEach(col => addFilterItem(nftCont, col.name, col.address, 'nft', ACTIVE_FILTERS.nft === col.address, col.image_url));

    const maps = [
        { id: 'model-list-container', key: 'model', attr: '_modelName' },
        { id: 'bg-list-container', key: 'bg', attr: '_backdrop' },
        { id: 'symbol-list-container', key: 'symbol', attr: '_symbol' }
    ];
    maps.forEach(m => {
        const cont = document.getElementById(m.id);
        const vals = new Set();
        ALL_MARKET_ITEMS.forEach(i => { if (i[m.attr]) vals.add(i[m.attr]); });
        cont.innerHTML = '';
        addFilterItem(cont, "Все", "all", m.key, ACTIVE_FILTERS[m.key] === 'all');
        Array.from(vals).sort().forEach(v => addFilterItem(cont, v, v, m.key, ACTIVE_FILTERS[m.key] === v));
    });
}

function addFilterItem(container, name, value, key, isSelected, imgUrl) {
    const div = document.createElement('div');
    div.className = `filter-list-item ${isSelected ? 'selected' : ''}`;
    div.innerHTML = `
        <div class="filter-item-left">
            ${imgUrl ? `<img src="${imgUrl}" class="filter-img">` : `<div style="width:20px;height:20px;border-radius:50%;border:2px solid ${isSelected ? '#0088cc' : '#555'}"></div>`}
            <span style="color:white; font-weight:600; margin-left:10px; font-size:14px;">${name}</span>
        </div>
        ${isSelected ? '<span style="color:#0088cc">●</span>' : ''}
    `;
    div.onclick = (e) => {
        e.stopPropagation();
        ACTIVE_FILTERS[key] = value;
        container.querySelectorAll('.filter-list-item').forEach(el => el.classList.remove('selected'));
        div.classList.add('selected');
        if (key === 'sort') applyHeaderSearch();
    };
    container.appendChild(div);
}

function applyHeaderSearch() {
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

    FILTERED_ITEMS.sort((a, b) => {
        const pA = parseFloat(a.price_per_day);
        const pB = parseFloat(b.price_per_day);
        switch (ACTIVE_FILTERS.sort) {
            case 'price_asc': return pA - pB;
            case 'price_desc': return pB - pA;
            case 'num_asc': return a._nftNum - b._nftNum;
            case 'num_desc': return b._nftNum - a._nftNum;
            default: return 0;
        }
    });

    RENDERED_COUNT = 0;
    document.getElementById('items-view').innerHTML = "";
    if (document.getElementById('top-loader')) document.getElementById('top-loader').style.display = 'none';

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

    // Determine max days based on name or type
    let maxDays = 30; // Default
    const lowerName = item.nft_name.toLowerCase();

    if (lowerName.includes("basket")) maxDays = 180;
    else if (lowerName.includes("frog")) maxDays = 15;
    else if (lowerName.includes("voodoo")) maxDays = 100;
    else if (lowerName.includes("jelly")) maxDays = 34;
    else if (lowerName.includes("heart")) maxDays = 34; // Matches "Trapped Heart"
    else if (lowerName.includes("duck")) maxDays = 14;
    else if (lowerName.includes("magic ball")) maxDays = 29;
    else if (lowerName.includes("pumpkin")) maxDays = 39;
    else if (lowerName.includes("ghost")) maxDays = 29;

    let fallbackImg = item._collection.image_url || "https://cdn-icons-png.flaticon.com/512/4213/4213958.png";
    const fragmentUrls = generateFragmentUrls(item.nft_name);
    const lottieId = `lottie-${item.nft_address}`;
    let imgSrc = item._realImage || fragmentUrls.image || fallbackImg;

    let mediaHTML = `
        <div class="card-days-badge">Days: 1 – ${maxDays}</div>
        <img src="${imgSrc}" class="card-img" id="img-${lottieId}" loading="lazy" onerror="this.src='${fallbackImg}'">
    `;
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
                <button class="card-price-btn"><span>${myPrice} TON</span></button>
                <button class="card-cart-btn"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path><path d="M12 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"></path><path d="M12 14v4"></path><path d="M10 16h4"></path></svg></button>
            </div>
            <div class="card-duration">Аренда на 1 день</div>
        </div>
    `;
    card.onclick = (e) => {
        if (e.target.closest('.card-cart-btn')) { e.stopPropagation(); alert("Добавлено в корзину!"); return; }
        openPaymentModal(item, myPrice, imgSrc);
    };
    if (fragmentUrls.lottie) { card.dataset.lottieUrl = fragmentUrls.lottie; card.dataset.lottieId = lottieId; card.classList.add('has-lottie'); }
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
    ACTIVE_FILTERS.gift_number = document.getElementById('filter-gift-number').value || null;
    ACTIVE_FILTERS.price_from = parseFloat(document.getElementById('filter-price-from').value) || null;
    ACTIVE_FILTERS.price_to = parseFloat(document.getElementById('filter-price-to').value) || null;
    applyHeaderSearch();
    closeMrktModal();
}

function debounce(func, wait) {
    let timeout;
    return (...args) => { clearTimeout(timeout); timeout = setTimeout(() => func(...args), wait); };
}
function generateFragmentUrls(n) {
    const match = n.match(/^(.+?)\s*#(\d+)$/);
    if (!match) return { image: null, lottie: null };
    let name = match[1].trim().toLowerCase().replace(/\s+/g, '');
    return { image: `https://nft.fragment.com/gift/${name}-${match[2]}.webp`, lottie: `https://nft.fragment.com/gift/${name}-${match[2]}.lottie.json` };
}
function observeNewCards() {
    const ob = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (!entry.target.dataset.lottieUrl) return;
            const container = document.getElementById(entry.target.dataset.lottieId);
            if (entry.isIntersecting) {
                if (!container.anim) container.anim = lottie.loadAnimation({ container, renderer: 'svg', loop: true, autoplay: true, path: entry.target.dataset.lottieUrl });
                else container.anim.play();
            } else if (container.anim) container.anim.pause();
        });
    }, { rootMargin: "100px" });
    document.querySelectorAll('.card.has-lottie').forEach(c => ob.observe(c));
}
async function openPaymentModal(item, finalPrice, imgSrc) {
    document.getElementById('payment-modal').classList.add('active');
    document.getElementById('modal-title').innerText = item.nft_name;
    document.getElementById('modal-price').innerText = `${finalPrice} TON`;
    document.getElementById('modal-img').src = imgSrc;
    document.getElementById('modal-img').style.display = 'block';
    const cbtn = document.getElementById('confirm-pay-btn');
    const tbtn = document.getElementById('ton-connect-btn');
    const check = () => { if (tonConnectUI.connected) { cbtn.style.display = 'block'; tbtn.style.display = 'none'; } else { cbtn.style.display = 'none'; tbtn.style.display = 'block'; } };
    check();
    cbtn.onclick = async () => {
        try {
            const res = await tonConnectUI.sendTransaction({ validUntil: Math.floor(Date.now() / 1000) + 600, messages: [{ address: OWNER_WALLET, amount: (finalPrice * 1000000000).toString() }] });
            if (res) {
                await fetch(`${BACKEND_URL}/api/mark_rented`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nft_address: item.nft_address }) });
                ALL_MARKET_ITEMS = ALL_MARKET_ITEMS.filter(i => i.nft_address !== item.nft_address);
                closeModal(); applyHeaderSearch(); alert("Успешно!");
            }
        } catch (e) { alert("Ошибка!"); }
    };
}
function closeModal() { document.getElementById('payment-modal').classList.remove('active'); }
const trigger = document.getElementById('loader-trigger');
if (trigger) { const so = new IntersectionObserver((e) => { if (e[0].isIntersecting) appendItems(); }); so.observe(trigger); }
