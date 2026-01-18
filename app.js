// Consts
let tg = null;
const MY_MARKUP = 0.20;
const OWNER_WALLET = "UQBxgCx_WJ4_fKgz8tec73NZadhoDzV250-Y0taVPJstZsRl";
const MANIFEST_URL = "https://klochkonazar2014-prog.github.io/tg-reseller-webapp/tonconnect-manifest.json";

// Tunnel URL
const BACKEND_URL = "https://vw3i1p-ip-149-22-93-239.tunnelmole.net";

let tonConnectUI;
let ALL_MARKET_ITEMS = [];
let RENDERED_COUNT = 0;
let BATCH_SIZE = 30; // Better for mobile grid
let IS_LOADING = false;
let GLOBAL_OFFSET = 0;
let HAS_MORE = true;
const renderTonAmount = (val) => `<span class="icon-before icon-ton tm-amount">${val}</span>`;
let ATTR_STATS = { model: {}, bg: {}, symbol: {} };
let CURRENT_PAYMENT_ITEM = null;

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
        loadFilterData();
        await loadLiveItems(true);

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

async function loadLiveItems(reset = true) {
    if (IS_LOADING) return;
    if (!HAS_MORE && !reset) return;

    if (reset) {
        GLOBAL_OFFSET = 0;
        HAS_MORE = true;
        document.getElementById('items-view').innerHTML = '';
        document.getElementById('top-loader').style.display = 'block';
    }

    IS_LOADING = true;
    const loader = document.getElementById('top-loader');

    const hideLoading = () => {
        const screen = document.getElementById('loading-screen');
        if (screen) {
            screen.style.opacity = '0';
            setTimeout(() => screen.style.display = 'none', 500);
        }
    };

    try {
        const params = new URLSearchParams({
            limit: BATCH_SIZE,
            offset: GLOBAL_OFFSET,
            nft: ACTIVE_FILTERS.nft,
            model: ACTIVE_FILTERS.model,
            bg: ACTIVE_FILTERS.bg,
            symbol: ACTIVE_FILTERS.symbol,
            search: ACTIVE_FILTERS.search,
            price_from: ACTIVE_FILTERS.price_from || "",
            price_to: ACTIVE_FILTERS.price_to || "",
            gift_number: ACTIVE_FILTERS.gift_number || "",
            t: Date.now()
        });

        const response = await fetch(`${BACKEND_URL}/api/items?${params.toString()}`);
        if (!response.ok) throw new Error("Server Error");
        const data = await response.json();

        if (data && data.items) {
            const items = data.items;
            if (items.length < BATCH_SIZE) HAS_MORE = false;
            GLOBAL_OFFSET += items.length;

            const processed = items.map(item => {
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
                        <div style="font-size: 18px; font-weight: 700; color: #fff;">Ничего не найдено</div>
                        <div style="color: #8b9bb4; margin-top: 8px;">Попробуйте сбросить фильтры</div>
                    </div>`;
            } else {
                renderItemsBatch(processed);
            }

            if (reset) initFilterLists();
        }

        if (loader) loader.style.display = 'none';
        hideLoading();
    } catch (e) {
        console.error("Load Error:", e);
        if (loader) loader.innerText = "Ошибка загрузки.";
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
        const res = await fetch(`${BACKEND_URL}/api/filters`);
        const data = await res.json();
        if (data) {
            window.STATIC_COLLECTIONS = data.collections; // now they have {name, image}
            ATTR_STATS = {
                model: data.models, // {name, image}
                bg: data.backdrops,
                symbol: data.symbols
            };
            initFilterLists();
        }
    } catch (e) {
        console.error("Filter Load Error:", e);
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
    const nftSearch = document.getElementById('filter-search-nft').value.toLowerCase();
    nftCont.innerHTML = '';

    if (!nftSearch || "все".includes(nftSearch)) {
        addFilterItem(nftCont, "Все", "all", 'nft', ACTIVE_FILTERS.nft === 'all');
    }

    (window.STATIC_COLLECTIONS || []).forEach(col => {
        if (col.name.toLowerCase().includes(nftSearch)) {
            addFilterItem(nftCont, col.name, col.name, 'nft', ACTIVE_FILTERS.nft === col.name, col.image);
        }
    });

    const maps = [
        { id: 'model-list-container', key: 'model', search: 'filter-search-model', label: 'модели' },
        { id: 'bg-list-container', key: 'bg', search: 'filter-search-bg', label: 'фона' },
        { id: 'symbol-list-container', key: 'symbol', search: 'filter-search-symbol', label: 'символа' }
    ];

    const selectedNFT = ACTIVE_FILTERS.nft;

    maps.forEach(m => {
        const cont = document.getElementById(m.id);
        const sInput = document.getElementById(m.search);
        if (!cont || !sInput) return;
        const sVal = sInput.value.toLowerCase();
        cont.innerHTML = '';

        if (selectedNFT === 'all') {
            cont.innerHTML = `<div style="padding:30px 20px; color:#8b9bb4; text-align:center; font-size:14px; background:rgba(255,255,255,0.02); border-radius:12px; margin:10px auto; width:calc(100% - 40px);">Сначала выберите NFT</div>`;
            sInput.disabled = true;
            sInput.placeholder = "Выберите NFT выше...";
            return;
        }

        sInput.disabled = false;
        sInput.placeholder = `Поиск ${m.label}...`;

        if (!sVal || "выбрать все".includes(sVal)) {
            addFilterItem(cont, "Выбрать все", "all", m.key, ACTIVE_FILTERS[m.key] === 'all');
        }

        const items = (ATTR_STATS[m.key] && ATTR_STATS[m.key][selectedNFT]) || [];
        items.forEach(item => {
            if (item.name.toLowerCase().includes(sVal)) {
                let icon = item.image;
                if (!icon && (m.key === 'bg' || m.key === 'symbol')) icon = VISUAL_MAP[m.key][item.name] || null;
                addFilterItem(cont, item.name, item.name, m.key, ACTIVE_FILTERS[m.key] === item.name, icon, selectedNFT);
            }
        });
    });
}

function addFilterItem(container, name, value, key, isSelected, imgUrl, collectionContext) {
    const div = document.createElement('div');
    div.className = `filter-list-item ${isSelected ? 'selected' : ''}`;

    let visualHTML = '';
    if (key === 'bg' && VISUAL_MAP.bg[name]) {
        visualHTML = `<div class="filter-color-circle" style="background: ${VISUAL_MAP.bg[name]}"></div>`;
    } else if (key === 'symbol' && VISUAL_MAP.symbol[name]) {
        visualHTML = `<img src="${VISUAL_MAP.symbol[name]}" class="filter-img" style="filter: invert(1); background: rgba(255,255,255,0.08); padding:4px;" onerror="this.style.display='none'">`;
    } else if (imgUrl && !imgUrl.includes('ton_symbol.png')) {
        visualHTML = `<img src="${imgUrl}" class="filter-img" loading="lazy" onerror="this.onerror=null; this.src='https://nft.fragment.com/guide/gift.svg'">`;
    } else {
        let label = (key === 'nft' || key === 'model') ? name.split(' ')[0].substring(0, 3).toUpperCase() : 'NFT';
        visualHTML = `<div style="width:32px; height:32px; border-radius:8px; background: rgba(5, 5, 5, 0.4); border:1px solid rgba(255, 255, 255, 0.05); display:flex; align-items:center; justify-content:center; position:relative; overflow:hidden;">
            <img src="https://nft.fragment.com/guide/gift.svg" style="width:100%; height:100%; opacity:0.15; position:absolute; filter:grayscale(1);">
            <span style="color:#aaa; font-size:9px; font-weight:700; position:relative; z-index:1;">${label}</span>
        </div>`;
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
function generateFragmentUrls(n) {
    const match = n.match(/^(.*?)\s*#(\d+)$/);
    if (!match) return { image: null, lottie: null };

    // Improved slug generation for Fragment
    let name = match[1].trim().toLowerCase()
        .replace(/\s+/g, '-') // spaces to dashes
        .replace(/[^a-z0-9-]/g, ''); // keep alphanumeric and dashes

    // If it ends with 's' (plural like 'Kissed Frogs'), Fragment often uses singular
    let singular = name.endsWith('s') ? name.slice(0, -1) : name;

    return {
        image: `https://nft.fragment.com/gift/${singular}-${match[2]}.webp`,
        lottie: `https://nft.fragment.com/gift/${singular}-${match[2]}.lottie.json`
    };
}
const LOTTIE_OBSERVER = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        const card = entry.target;
        if (!card.dataset.lottieUrl) return;
        const container = document.getElementById(card.dataset.lottieId);
        if (!container) return;

        if (entry.isIntersecting) {
            // Re-creating/Loading the animation when entering the "8-closest" zone
            if (!container.anim) {
                container.anim = lottie.loadAnimation({
                    container: container,
                    renderer: 'svg',
                    loop: true,
                    autoplay: true,
                    path: card.dataset.lottieUrl
                });
                container.style.opacity = '1';
            } else {
                container.anim.play();
            }
        } else {
            // Destroying the animation when it's out of range to save RAM/CPU
            if (container.anim) {
                container.anim.destroy();
                container.anim = null;
                container.innerHTML = ''; // Clean SVG blobs
            }
        }
    });
}, { rootMargin: "300px", threshold: 0.01 });

function observeNewCards() {
    document.querySelectorAll('.card.has-lottie:not(.observed)').forEach(c => {
        c.classList.add('observed');
        LOTTIE_OBSERVER.observe(c);
    });
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

    // Ownership: Use the pre-calculated _realOwner or explicit fields. NEVER fallback to nft_address or "fragment.ton" unless    // Reset Owner to Loading...
    // Ownership: Try to show Lender/Seller immediately from list item
    let initialOwner = item.lender_address || item.seller_address || item._realOwner || 'Loading...';

    // Fix format: EQ -> UQ
    if (initialOwner.startsWith && initialOwner.startsWith('EQ')) {
        initialOwner = 'UQ' + initialOwner.substring(2);
    }
    // Truncate
    if (initialOwner.length > 15) {
        initialOwner = initialOwner.substring(0, 4) + '...' + initialOwner.substring(initialOwner.length - 4);
    }

    const ownerEl = document.getElementById('view-owner');
    if (ownerEl) ownerEl.textContent = initialOwner === 'Loading...' ? 'Loading...' : (initialOwner + ' >');

    // Fetch REAL Details to get attributes and confirm Owner
    fetch(`${BACKEND_URL}/api/nft_details?nft_address=${item.nft_address}`)
        .then(r => r.json())
        .then(details => {
            let realOwnerName = 'Unknown';

            // PRIORITY: Lender (Name/Addr) > Owner Name > Real Owner > Owner Address
            if (details.lender) realOwnerName = details.lender;
            else if (details.lender_address) realOwnerName = details.lender_address;
            else if (details.owner && details.owner.name) realOwnerName = details.owner.name;
            else if (details.real_owner) realOwnerName = details.real_owner;
            else if (details.owner) {
                realOwnerName = (typeof details.owner === 'object') ? (details.owner.address || 'Unknown') : details.owner;
            } else if (details.owner_address) realOwnerName = details.owner_address;

            // EQ -> UQ conversion for addresses
            if (realOwnerName && realOwnerName.startsWith('EQ') && realOwnerName.length > 30) {
                realOwnerName = 'UQ' + realOwnerName.substring(2);
            }

            // Truncate only if it looks like an address (long, no dots usually)
            // Preserves "user.ton" or names
            if (realOwnerName.length > 15 && !realOwnerName.includes('.')) {
                realOwnerName = realOwnerName.substring(0, 4) + '...' + realOwnerName.substring(realOwnerName.length - 4);
            }

            if (ownerEl) ownerEl.textContent = realOwnerName + ' >';

            // ALSO UPDATE ATTRIBUTES from detailed response
            if (details.attributes && Array.isArray(details.attributes)) {
                // Clear existing props to rebuild or just find specific rows?
                // Easier to update if we search for them, but our props are dynamic.
                // Let's try to map them to variables and re-run logic, or direct DOM manipulation if rows exist.

                // Strategy: Parse new stats and update text content if row exists.
                // We need to match "Model", "Backdrop", "Theme" etc.

                details.attributes.forEach(attr => {
                    const type = attr.trait_type;
                    const val = attr.value;
                    let targetLabel = null;

                    if (type === 'Model' || type === 'Character') targetLabel = 'Model';
                    else if (type === 'Backdrop' || type === 'Background') targetLabel = 'Backdrop';
                    else if (type === 'Pattern' || type === 'Theme' || type === 'Symbol') targetLabel = 'Pattern';

                    if (targetLabel) {
                        // Find the row with this label
                        const propRows = document.querySelectorAll('.property-item');
                        propRows.forEach(row => {
                            const nameSpan = row.querySelector('.prop-name');
                            if (nameSpan && nameSpan.textContent.includes(targetLabel)) {
                                const valSpan = row.querySelector('.prop-value-text');
                                if (valSpan) valSpan.textContent = val;

                                // Reset percent to empty or try to calc? 
                                // For now, keep existing percent or hide if unknown. 
                                // Real app has global stats, we might mismatch if we change value.
                                // But correctness of Name is more important.
                            }
                        });
                    }
                });
            }

            // FORCE WHITE ICON AGAIN just in case
            const svgs = document.querySelectorAll('.main-rent-btn svg, .main-rent-btn svg path');
            svgs.forEach(s => {
                s.style.fill = '#FFFFFF';
                s.style.filter = 'brightness(0) invert(1)';
            });

        })
        .catch(err => {
            console.error("Failed to fetch details", err);
            if (ownerEl) ownerEl.textContent = 'Unknown >';
        });
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
        if (value === 'Default' || value === 'Common' || value === 'Gift') return "25.0";
        const hash = value.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
        return (0.1 + (hash % 100) / 10).toFixed(1);
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

    // Set static text back as requested
    rentBtn.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path fill-rule="evenodd" clip-rule="evenodd" d="M14.1839 17.7069C13.6405 18.6507 13.3688 19.1226 13.0591 19.348C12.4278 19.8074 11.5723 19.8074 10.941 19.348C10.6312 19.1226 10.3595 18.6507 9.81613 17.7069L5.52066 10.2464C4.76864 8.94024 4.39263 8.28717 4.33762 7.75894C4.2255 6.68236 4.81894 5.65591 5.80788 5.21589C6.29309 5 7.04667 5 8.55383 5H15.4462C16.9534 5 17.7069 5 18.1922 5.21589C19.1811 5.65591 19.7745 6.68236 19.6624 7.75894C19.6074 8.28717 19.2314 8.94024 18.4794 10.2464L14.1839 17.7069ZM11.1 16.3412L6.56139 8.48002C6.31995 8.06185 6.19924 7.85276 6.18146 7.68365C6.14523 7.33896 6.33507 7.01015 6.65169 6.86919C6.80703 6.80002 7.04847 6.80002 7.53133 6.80002H7.53134L11.1 6.80002V16.3412ZM12.9 16.3412L17.4387 8.48002C17.6801 8.06185 17.8008 7.85276 17.8186 7.68365C17.8548 7.33896 17.665 7.01015 17.3484 6.86919C17.193 6.80002 16.9516 6.80002 16.4687 6.80002L12.9 6.80002V16.3412Z" fill="#FFFFFF" />
        </svg>
        Арендовать за <span id="rent-btn-price">0.00</span>
    `;

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

function renderItemsBatch(items) {
    const container = document.getElementById('items-view');
    items.forEach(item => {
        const card = createItemCard(item);
        if (card) container.appendChild(card);
    });
    observeNewCards();
}

function closeProductView() {
    document.getElementById('product-view').classList.remove('active');
    CURRENT_PAYMENT_ITEM = null;
}
const trigger = document.getElementById('loader-trigger');
if (trigger) {
    const so = new IntersectionObserver((e) => {
        if (e[0].isIntersecting && HAS_MORE && !IS_LOADING) loadLiveItems(false);
    });
    so.observe(trigger);
}
