// Consts
let tg = null;
const MY_MARKUP = 0.20;
const OWNER_WALLET = "UQBxgCx_WJ4_fKgz8tec73NZadhoDzV250-Y0taVPJstZsRl";
const MANIFEST_URL = "https://klochkonazar2014-prog.github.io/tg-reseller-webapp/tonconnect-manifest.json";

// Tunnel URL
const BACKEND_URL = "https://l8o345-ip-176-119-99-6.tunnelmole.net";

let tonConnectUI;
let ALL_MARKET_ITEMS = [];
let FILTERED_ITEMS = [];
let RENDERED_COUNT = 0;
const BATCH_SIZE = 40;
const renderTonAmount = (val) => `<span class="icon-before icon-ton tm-amount">${val}</span>`;
let ATTR_STATS = { model: {}, bg: {}, symbol: {} };
let CURRENT_PAYMENT_ITEM = null; // Store item during modal interaction

// NEW: Visual mapping for premium look
const VISUAL_MAP = {
    bg: {
        'Amber': '#FFBF00', 'Red': '#FF3B30', 'Blue': '#007AFF', 'Green': '#34C759',
        'Gold': '#FFD700', 'Black': '#000000', 'White': '#FFFFFF', 'Purple': '#AF52DE',
        'Pink': '#FF2D55', 'Indigo': '#5856D6', 'Orange': '#FF9500', 'Cyan': '#32ADE6'
    },
    symbol: {
        'Candle': 'https://raw.githubusercontent.com/ton-blockchain/token-logos/main/nft/gift/candle.svg',
        'Heart': 'https://raw.githubusercontent.com/ton-blockchain/token-logos/main/nft/gift/heart.svg',
        'Star': 'https://raw.githubusercontent.com/ton-blockchain/token-logos/main/nft/gift/star.svg'
    }
};

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
    const containers = ['market-container', 'orders-container', 'hub-container', 'raffle-container', 'storage-container'];
    containers.forEach((id, i) => {
        const el = document.getElementById(id);
        if (el) el.style.display = (i === index) ? 'block' : 'none';
    });
}

async function loadLiveItems() {
    const loader = document.getElementById('top-loader');
    try {
        // Fetching more items to ensure "all" are there
        const response = await fetch(`${BACKEND_URL}/api/items?limit=1000&t=${Date.now()}`);
        const data = await response.json();

        // Hide global loading screen
        const screen = document.getElementById('loading-screen');
        if (screen) {
            screen.style.opacity = '0';
            setTimeout(() => screen.style.display = 'none', 500);
        }

        if (data.items) {
            ALL_MARKET_ITEMS = data.items.map(item => {
                const match = item.nft_name.match(/#(\d+)/);
                item._nftNum = match ? parseInt(match[1]) : 0;

                // Parse attributes
                item._modelName = 'Gift';
                item._backdrop = 'Common';
                item._symbol = 'Common';

                if (item.attributes && Array.isArray(item.attributes)) {
                    item.attributes.forEach(attr => {
                        const t = attr.trait_type.toLowerCase();
                        const v = attr.value;
                        if (t.includes('model')) item._modelName = v;
                        else if (t.includes('backdrop')) item._backdrop = v;
                        else if (t.includes('symbol') || t.includes('pattern')) item._symbol = v;
                    });
                }

                // Super-duper fallback for name
                // Extract owner address safely
                let finalOwner = null;
                if (item.owner_address) finalOwner = item.owner_address;
                else if (item.owner && item.owner.address) finalOwner = item.owner.address;
                else if (typeof item.owner === 'string') finalOwner = item.owner;

                item._realOwner = finalOwner; // Store explicitly

                item._realImage = item.image || item.image_url || (item._collection ? item._collection.image_url : null);
                return item;
            });

            // Collections with images
            const uniqueCols = new Map();
            ALL_MARKET_ITEMS.forEach(i => {
                if (i._collection) {
                    const addr = i._collection.address;
                    if (!uniqueCols.has(addr)) {
                        uniqueCols.set(addr, {
                            ...i._collection,
                            image_url: i._collection.image_url || i._realImage
                        });
                    }
                }
            });
            window.STATIC_COLLECTIONS = Array.from(uniqueCols.values());

            initFilterLists();
            initVisualChips(); // NEW: Visual scroll for collections
            calculateStats();
            applyHeaderSearch();
        }
    } catch (e) {
        if (loader) loader.innerText = "Ошибка подключения к рынку.";
    }
}

function initVisualChips() {
    const chipsCont = document.getElementById('chips-row');
    if (!chipsCont) return;

    // Save the filter button
    const filterBtn = chipsCont.querySelector('.chip-btn.icon-only');
    chipsCont.innerHTML = '';
    if (filterBtn) chipsCont.appendChild(filterBtn);

    // Add "All" chip
    const allBtn = document.createElement('button');
    allBtn.className = `chip-btn ${ACTIVE_FILTERS.nft === 'all' ? 'active' : ''}`;
    allBtn.innerHTML = 'Все';
    allBtn.onclick = () => { selectNftChip('all', allBtn); };
    chipsCont.appendChild(allBtn);

    // Add visual chips for each collection
    (window.STATIC_COLLECTIONS || []).forEach(col => {
        const btn = document.createElement('button');
        btn.className = `chip-btn ${ACTIVE_FILTERS.nft === col.address ? 'active' : ''}`;
        btn.innerHTML = `${col.image_url ? `<img src="${col.image_url}" class="chip-img">` : ''} ${col.name}`;
        btn.onclick = () => { selectNftChip(col.address, btn); };
        chipsCont.appendChild(btn);
    });
}

function selectNftChip(addr, btn) {
    ACTIVE_FILTERS.nft = addr;
    document.querySelectorAll('.chip-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    applyHeaderSearch();
}

function calculateStats() {
    ATTR_STATS = { model: {}, bg: {}, symbol: {} };
    ALL_MARKET_ITEMS.forEach(item => {
        if (item._modelName) ATTR_STATS.model[item._modelName] = (ATTR_STATS.model[item._modelName] || 0) + 1;
        if (item._backdrop) ATTR_STATS.bg[item._backdrop] = (ATTR_STATS.bg[item._backdrop] || 0) + 1;
        if (item._symbol) ATTR_STATS.symbol[item._symbol] = (ATTR_STATS.symbol[item._symbol] || 0) + 1;

        // Also track all other attributes
        if (item.attributes && Array.isArray(item.attributes)) {
            item.attributes.forEach(attr => {
                const key = attr.trait_type.toLowerCase();
                if (!ATTR_STATS[key]) ATTR_STATS[key] = {};
                ATTR_STATS[key][attr.value] = (ATTR_STATS[key][attr.value] || 0) + 1;
            });
        }
    });
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

function toggleGenericModal(key) {
    openAdvancedFilters();
    const accMap = {
        'nft': 'nft-acc',
        'model': 'model-acc',
        'bg': 'bg-acc',
        'symbol': 'symbol-acc'
    };
    const targetId = accMap[key];
    if (targetId) {
        const btn = document.querySelector(`.filter-accordion[onclick*="${targetId}"]`);
        toggleAccordion(targetId, btn);
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
        { id: 'model-list-container', key: 'model', attr: '_modelName', accordion: 'model-acc' },
        { id: 'bg-list-container', key: 'bg', attr: '_backdrop', accordion: 'bg-acc' },
        { id: 'symbol-list-container', key: 'symbol', attr: '_symbol', accordion: 'symbol-acc' }
    ];

    maps.forEach(m => {
        const cont = document.getElementById(m.id);
        if (!cont) return;
        cont.innerHTML = '';

        // If NFT is "all", we show a placeholder for models/attributes to enforce order
        if (ACTIVE_FILTERS.nft === 'all' && m.key === 'model') {
            cont.innerHTML = `
                <div style="padding:30px 20px; text-align:center;">
                    <span style="color:#ff5500; font-size:18px; font-weight:700;">Сначала выберите NFT</span>
                    <div style="height:1px; background:rgba(255,255,255,0.05); margin-top:20px;"></div>
                </div>`;
            return;
        }

        const stats = new Map(); // Name -> { img, count, minPrice }

        // Use all items for accurate counts (rarity)
        const relevantItems = ALL_MARKET_ITEMS.filter(i => {
            if (ACTIVE_FILTERS.nft !== 'all' && i._collection.address !== ACTIVE_FILTERS.nft) return false;
            return true;
        });

        relevantItems.forEach(i => {
            const val = i[m.attr];
            if (!val) return;
            const p = parseFloat(i.price_per_day) / 1e9;
            if (!stats.has(val)) {
                stats.set(val, { img: i._realImage || i._collection.image_url, count: 0, minPrice: p });
            }
            const s = stats.get(val);
            s.count++;
            if (p < s.minPrice) s.minPrice = p;
        });

        // Add "Select All" item
        addFilterItem(cont, "Выбрать все", "all", m.key, ACTIVE_FILTERS[m.key] === 'all');

        Array.from(stats.entries()).sort((a, b) => a[0].localeCompare(b[0])).forEach(([name, data]) => {
            let icon = null;
            if (m.key === 'nft') icon = data.img;
            if (m.key === 'bg' || m.key === 'symbol') icon = VISUAL_MAP[m.key][name] || null;

            addFilterItem(cont, name, name, m.key, ACTIVE_FILTERS[m.key] === name, icon);
        });
    });
}

function addFilterItem(container, name, value, key, isSelected, imgUrl) {
    const div = document.createElement('div');
    div.className = `filter-list-item ${isSelected ? 'selected' : ''}`;

    let visualHTML = '';
    if (key === 'bg' && VISUAL_MAP.bg[name]) {
        visualHTML = `<div class="filter-color-circle" style="background: ${VISUAL_MAP.bg[name]}"></div>`;
    } else if (key === 'symbol' && VISUAL_MAP.symbol[name]) {
        visualHTML = `<img src="${VISUAL_MAP.symbol[name]}" class="filter-img" style="filter: invert(1); background: rgba(255,255,255,0.08); padding:4px;" onerror="this.style.display='none'">`;
    } else if (imgUrl) {
        visualHTML = `<img src="${imgUrl}" class="filter-img" onerror="this.src='https://nft.fragment.com/guide/gift.svg'">`;
    } else {
        visualHTML = `<div style="width:20px;height:20px;border-radius:50%;border:2px solid ${isSelected ? '#0088cc' : '#333'};"></div>`;
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
        ACTIVE_FILTERS[key] = value;
        initFilterLists();
        applyHeaderSearch();
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
            case 'model_rare':
                return (ATTR_STATS.model[a._modelName] || 9999) - (ATTR_STATS.model[b._modelName] || 9999);
            case 'bg_rare':
                return (ATTR_STATS.bg[a._backdrop] || 9999) - (ATTR_STATS.bg[b._backdrop] || 9999);
            case 'symbol_rare':
                return (ATTR_STATS.symbol[a._symbol] || 9999) - (ATTR_STATS.symbol[b._symbol] || 9999);
            default: return 0;
        }
    });

    RENDERED_COUNT = 0;
    document.getElementById('items-view').innerHTML = "";
    if (document.getElementById('top-loader')) document.getElementById('top-loader').style.display = 'none';

    if (FILTERED_ITEMS.length === 0) {
        const view = document.getElementById('items-view');
        view.innerHTML = `
            <div class="error-msg" style="padding-top: 100px;">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color: #333; margin-bottom: 20px;">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="8" y1="12" x2="16" y2="12"></line>
                </svg>
                <div style="font-size: 18px; font-weight: 700; color: #fff;">Ничего не найдено</div>
                <div style="color: #8b9bb4; margin-top: 8px;">Попробуйте сбросить фильтры</div>
            </div>`;
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

    // Determine max days based on API or name fallback
    let maxDays = Math.floor((item.max_duration || 2592000) / 86400);
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
                <button class="card-price-btn">${renderTonAmount(myPrice > 0 ? myPrice : "0.01")}</button>
                <button class="card-cart-btn"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path><path d="M12 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"></path><path d="M12 14v4"></path><path d="M10 16h4"></path></svg></button>
            </div>
            <div class="card-duration">Аренда на 1 – ${maxDays} дн.</div>
        </div>
    `;
    card.onclick = (e) => {
        if (e.target.closest('.card-cart-btn')) { e.stopPropagation(); alert("Добавлено в корзину!"); return; }
        openProductView(item, myPrice, imgSrc);
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
async function openProductView(item, finalPrice, imgSrc) {
    CURRENT_PAYMENT_ITEM = item;
    const view = document.getElementById('product-view');
    view.classList.add('active');

    // Header & Media
    document.getElementById('view-img').src = imgSrc;
    const lottieCont = document.getElementById('view-lottie');
    lottieCont.innerHTML = '';
    const fUrls = generateFragmentUrls(item.nft_name);
    if (fUrls.lottie) {
        lottie.loadAnimation({
            container: lottieCont,
            renderer: 'svg',
            loop: true,
            autoplay: true,
            path: fUrls.lottie
        });
    }

    const colName = (item._collection && item._collection.name) ? item._collection.name : "Gifts";
    document.getElementById('view-title').innerText = item.nft_name;
    document.getElementById('view-collection').innerText = `${colName} >`;
    document.getElementById('view-col-name').innerText = `${colName} >`;

    // Ownership: Use the pre-calculated _realOwner or explicit fields. NEVER fallback to nft_address or "fragment.ton" unless verified
    const ownerAddr = item._realOwner || item.owner_address || (typeof item.owner === 'string' ? item.owner : null);
    const ownerName = item.owner_name || (ownerAddr ? (ownerAddr.slice(0, 4) + "..." + ownerAddr.slice(-4)) : "Unknown");
    document.getElementById('view-owner').innerText = ownerName + " >";

    const shortAddr = item.nft_address.slice(0, 6) + "..." + item.nft_address.slice(-4);
    document.getElementById('view-address').innerHTML = `${shortAddr} <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-bottom:-2px; cursor:pointer;" onclick="copyToClipboard('${item.nft_address}')"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;

    // Pricing
    const dailyPrice = (parseFloat(item.price_per_day) / 1e9).toFixed(2);
    document.getElementById('view-daily-price').innerHTML = renderTonAmount(dailyPrice);

    // Approximate USD (1 TON = 7 USD)
    const usdPrice = (parseFloat(dailyPrice) * 7.0).toFixed(2);
    document.getElementById('view-daily-price-usd').innerText = `~$${usdPrice}`;

    const maxDays = Math.floor((item.max_duration || 2592000) / 86400);
    document.getElementById('view-duration-range').innerText = `1 — ${maxDays}`;
    document.getElementById('view-discount').innerText = "0.1%";

    document.getElementById('rent-duration-input').value = 1;
    updateTotalPrice();

    // Attributes (Properties)
    const propCont = document.getElementById('view-properties');
    propCont.innerHTML = '';

    // Extract NFT number from name (e.g., "Party Sparkler #129702" -> 129702)
    const nftNumMatch = item.nft_name.match(/#(\d+)/);
    const nftNum = nftNumMatch ? nftNumMatch[1] : '1';

    // Build Telegram NFT link - format: t.me/nft/GiftSlug-Number
    const giftBaseName = item.nft_name.replace(/#\d+/, '').trim();
    const giftSlug = giftBaseName.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join('');
    const tgNftLink = `https://t.me/nft/${giftSlug}-${nftNum}`;

    // Helper to calculate percentage
    const getPercent = (statKey, value) => {
        const total = ALL_MARKET_ITEMS.length || 1;
        const count = (ATTR_STATS[statKey] && ATTR_STATS[statKey][value]) || 1;
        return ((count / total) * 100).toFixed(1);
    };

    // Helper to create property row with percent
    const createPropRow = (label, value, statKey, showFloor = false) => {
        if (!value || value === 'Unknown' || value === 'Gift') return null;
        const percent = getPercent(statKey, value);
        const row = document.createElement('div');
        row.className = 'property-item';
        row.innerHTML = `
            <div class="prop-left"><div class="prop-name">${label}</div></div>
            <div class="prop-right">
                <span class="prop-value-text" style="color:var(--accent-blue); font-weight:600;">${value}</span>
                <span class="prop-percent-text" style="font-size:11px; color:rgba(77,178,255,0.7); margin-left:6px;">${percent}%</span>
                ${showFloor ? `<span class="prop-floor-text" style="margin-left:8px;">${renderTonAmount(dailyPrice)}</span>` : ''}
            </div>
        `;
        return row;
    };

    // Add Telegram Link row (using Telegram WebApp API to not close the app)
    const tgRow = document.createElement('div');
    tgRow.className = 'property-item';
    tgRow.style.cursor = 'pointer';
    tgRow.innerHTML = `
        <div class="prop-left"><div class="prop-name">Telegram</div></div>
        <div class="prop-right">
            <span style="color:var(--accent-blue); font-weight:600;">
                ${giftBaseName} #${nftNum} 
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-left:4px;vertical-align:middle;">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                    <polyline points="15 3 21 3 21 9"></polyline>
                    <line x1="10" y1="14" x2="21" y2="3"></line>
                </svg>
            </span>
        </div>
    `;
    tgRow.onclick = () => {
        if (tg && tg.openTelegramLink) {
            tg.openTelegramLink(tgNftLink);
        } else {
            window.open(tgNftLink, '_blank');
        }
    };
    propCont.appendChild(tgRow);

    // Add Rarity Row
    const totalSupply = item._collection?.total_supply || 76562;
    const rarityRow = document.createElement('div');
    rarityRow.className = 'property-item';
    rarityRow.innerHTML = `
        <div class="prop-left"><div class="prop-name">Rarity</div></div>
        <div class="prop-right">
            <span class="prop-value-text" style="color:#fff;">${nftNum}/${totalSupply}</span>
            <span style="color:var(--accent-blue); margin-left:6px; cursor:pointer;">(i)</span>
        </div>
    `;
    propCont.appendChild(rarityRow);

    // Get REAL model, backdrop, pattern from item attributes (not the NFT name!)
    // These are parsed during loadLiveItems() into item._modelName, item._backdrop, item._symbol
    // But we need to make sure they come from actual API attributes, not fallbacks

    let realModel = null;
    let realBackdrop = null;
    let realPattern = null;

    if (item.attributes && Array.isArray(item.attributes)) {
        item.attributes.forEach(attr => {
            const t = attr.trait_type.toLowerCase();
            if (t.includes('model') || t === 'модель') realModel = attr.value;
            else if (t.includes('backdrop') || t === 'фон') realBackdrop = attr.value;
            else if (t.includes('pattern') || t.includes('symbol') || t === 'узор') realPattern = attr.value;
        });
    }

    // 4. FALLBACK if attributes are missing (User requested this)
    // If we didn't find them in attributes loop, use the computed values from loadLiveItems
    // OR fallback to the gift name itself (e.g. "Whip Cupcake") which is better than "Gift" or "Unknown"

    if (!realModel) {
        if (item._modelName && item._modelName !== 'Gift' && item._modelName !== 'Unknown') {
            realModel = item._modelName;
        } else {
            realModel = giftBaseName; // Ultimate fallback: "Whip Cupcake"
        }
    }

    if (!realBackdrop) {
        if (item._backdrop && item._backdrop !== 'Default' && item._backdrop !== 'Unknown') {
            realBackdrop = item._backdrop;
        }
    }

    if (!realPattern) {
        if (item._symbol && item._symbol !== 'Default' && item._symbol !== 'Unknown') {
            realPattern = item._symbol;
        }
    }

    // Add Model row (e.g., "Ninja Turtle")
    if (realModel) {
        const modelRow = createPropRow('Model', realModel, 'model', true);
        if (modelRow) propCont.appendChild(modelRow);
    }

    // Add Pattern/Symbol row (e.g., "Champagne")
    if (realPattern) {
        const patternRow = createPropRow('Pattern', realPattern, 'symbol', true);
        if (patternRow) propCont.appendChild(patternRow);
    }

    // Add Backdrop row (e.g., "French Blue")
    if (realBackdrop) {
        const backdropRow = createPropRow('Backdrop', realBackdrop, 'bg', true);
        if (backdropRow) propCont.appendChild(backdropRow);
    }

    // Add any additional attributes from API that we haven't shown yet
    if (item.attributes && Array.isArray(item.attributes)) {
        item.attributes.forEach(attr => {
            const t = attr.trait_type.toLowerCase();
            // Skip already shown
            if (t.includes('model') || t.includes('backdrop') || t.includes('pattern') || t.includes('symbol') || t === 'модель' || t === 'фон' || t === 'узор') return;
            const row = createPropRow(attr.trait_type, attr.value, t, true);
            if (row) propCont.appendChild(row);
        });
    }

    // Setup the main rent button
    const rentBtn = document.getElementById('main-rent-action-btn');
    // Ensure we update price immediately
    updateTotalPrice();

    rentBtn.onclick = async () => {
        if (!tonConnectUI.connected) {
            await tonConnectUI.openModal();
            return;
        }
        const durInput = document.getElementById('rent-duration-input');
        const days = parseInt(durInput.value) || 1;
        const total = (dailyPrice * days).toFixed(2);
        try {
            const res = await tonConnectUI.sendTransaction({
                validUntil: Math.floor(Date.now() / 1000) + 600,
                messages: [{
                    address: OWNER_WALLET,
                    amount: (parseFloat(total) * 1e9).toString()
                }]
            });
            if (res) {
                await fetch(`${BACKEND_URL}/api/mark_rented`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ nft_address: item.nft_address })
                });
                ALL_MARKET_ITEMS = ALL_MARKET_ITEMS.filter(i => i.nft_address !== item.nft_address);
                closeProductView();
                applyHeaderSearch();
                tg.showAlert("Аренда оформлена успешно!");
            }
        } catch (e) {
            tg.showAlert("Ошибка оплаты или отмена.");
        }
    };

}

function adjustDuration(delta) {
    if (!CURRENT_PAYMENT_ITEM) return;
    const input = document.getElementById('rent-duration-input');
    const maxDays = Math.floor(CURRENT_PAYMENT_ITEM.max_duration / 86400);
    let val = parseInt(input.value) + delta;
    if (val < 1) val = 1;
    if (val > maxDays) val = maxDays;
    input.value = val;
    updateTotalPrice();
}

function updateTotalPrice() {
    if (!CURRENT_PAYMENT_ITEM) return;
    const input = document.getElementById('rent-duration-input');
    const dur = parseInt(input.value) || 1;
    const dp = (parseFloat(CURRENT_PAYMENT_ITEM.price_per_day) / 1e9);
    const total = (dp * dur).toFixed(2);
    const priceSpan = document.getElementById('rent-btn-price');
    if (priceSpan) {
        priceSpan.innerText = total;
    }
}

function closeProductView() {
    document.getElementById('product-view').classList.remove('active');
    CURRENT_PAYMENT_ITEM = null;
}
const trigger = document.getElementById('loader-trigger');
if (trigger) { const so = new IntersectionObserver((e) => { if (e[0].isIntersecting) appendItems(); }); so.observe(trigger); }
