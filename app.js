// Consts
let tg = null;
const MY_MARKUP = 0.20;
const OWNER_WALLET = "UQBxgCx_WJ4_fKgz8tec73NZadhoDzV250-Y0taVPJstZsRl";
const MANIFEST_URL = "https://klochkonazar2014-prog.github.io/tg-reseller-webapp/tonconnect-manifest.json";

// Tunnel URL
const BACKEND_URL = "https://arendabot.pp.ua";

let tonConnectUI;
let ALL_MARKET_ITEMS = [];
let RENDERED_COUNT = 0;
let BATCH_SIZE = 30; // Better for mobile grid
let IS_LOADING = false;
let GLOBAL_OFFSET = 0;
let HAS_MORE = true;

const isBadUrl = (url) => {
    if (!url) return true;
    const u = String(url).toLowerCase();
    return u.includes('ton_symbol.png') || u.includes('gift.svg');
};
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
    'ducks': 'ducks'
};

function getTelegifterUrl(type, name, collection, slugIndex = 0) {
    if (!name || name === 'Unknown' || name === 'Default' || name === 'Gift' || name === 'Gift #?') return null;
    const cleanName = encodeURIComponent(name);

    if (type === 'symbol') {
        return `${TG_ASSETS_URL}/symbol/${cleanName}.webp`;
    }

    if (type === 'model') {
        // Use local caching endpoint (handled by live_server.py + model_cache.py)
        return `/models/${cleanName}.webp`;
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

document.addEventListener("DOMContentLoaded", async () => {
    try {
        if (window.Telegram && window.Telegram.WebApp) {
            tg = window.Telegram.WebApp;
            tg.expand();
            tg.MainButton.hide();
        }
        initTonConnect();
        loadProfileData(); // Call after initTonConnect
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
    // Indices: 0 = Market, 1 = Profile
    const containers = ['market-container', 'profile-container'];

    // Hide all first
    containers.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });

    // Show target with correct display mode
    const targetId = containers[index];
    const targetEl = document.getElementById(targetId);
    if (targetEl) {
        // Market uses grid, Profile uses block
        targetEl.style.display = (index === 0) ? 'grid' : 'block';
    }

    // Update Nav
    document.querySelectorAll('.nav-item').forEach((nav, i) => {
        if (i === index) nav.classList.add('active');
        else nav.classList.remove('active');
    });

    // Profile logic
    if (index === 1) {
        loadProfileData();
    }
}

// Obsolete loadUserOrders removed as tab is gone.
function loadUserOrders() {
    // No-op 
}

function openTcModal(orderId) {
    document.getElementById('tc-current-order-id').value = orderId;
    document.getElementById('tc-modal-overlay').classList.add('active');
    document.getElementById('tc-modal').classList.add('active');
}

// --- Help Modal Logic ---
function showHelp(type) {
    const title = document.getElementById('help-title');
    const body = document.getElementById('help-body');

    if (type === 'fee') {
        title.innerText = "Why additional 0.2 TON is needed?";
        body.innerHTML = `
            <div style="font-weight:700; color:#fff; margin-bottom:10px;">Additional 0.2 TON is sent to process the rent transaction on the blockchain.</div>
            <p>These funds are used to pay network fees and execute the smart contract.</p>
            <div style="font-weight:700; color:#fff; margin-top:20px; margin-bottom:10px;">What happens with unused TON?</div>
            <p>Most of the unspent TON from this amount will automatically return to your wallet after the transaction is completed. A small part will return after the rent is completed.</p>
            <p>Actual costs are usually only a few cents. You can see this in the transaction history.</p>
            <div style="font-weight:700; color:#fff; margin-top:20px; margin-bottom:10px;">Is it normal?</div>
            <p>This is a standard practice for transactions on the TON network and not only. The non-refundable part goes to network fees, not to the platform.</p>
        `;
    } else if (type === 'listing') {
        title.innerText = "Why does this matter?";
        body.innerHTML = `
            <div style="font-weight:700; color:#fff; margin-bottom:10px;">This gift was recently listed for rent (less than 24 hours ago).</div>
            <p>Fragment has a limit on how many times per day a gift can be linked to a Telegram account.</p>
            <div style="font-weight:700; color:#fff; margin-top:20px; margin-bottom:10px;">What does this mean?</div>
            <p>If the previous owner or renter has recently exhausted this limit, you won't be able to link the gift to your Telegram account immediately. You may have to wait for a day.</p>
            <p style="color:#FF9500; font-weight:700; margin-top:20px;">Rent at your own risk!</p>
        `;
    }

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

    if (!link.startsWith('tc://')) {
        tg.showAlert("Пожалуйста, вставьте корректную ссылку tc:// с Fragment");
        return;
    }

    const btn = document.querySelector('#tc-modal .btn-yellow');
    const originalText = btn.innerText;
    btn.innerText = "Подключение...";
    btn.disabled = true;

    try {
        const res = await fetch(`${BACKEND_URL}/api/submit_tc_link`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ order_id: parseInt(orderId), tc_link: link })
        });
        const data = await res.json();

        if (data.status === 'ok') {
            tg.showAlert("Успешно! Теперь вернитесь на Fragment и нажмите Display in Telegram.");
            closeTcModal();
            loadUserOrders(); // Refresh status
        } else {
            throw new Error(data.error || "Ошибка сервера");
        }
    } catch (e) {
        tg.showAlert("Ошибка: " + e.message);
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
    }
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
        buttonRootId: 'ton-connect-btn',
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
            // MODELS: Require NFT selection first
            if (m.key === 'model') {
                cont.innerHTML = `<div style="padding:20px; color:#8b9bb4; text-align:center; font-size:13px; background:rgba(255,255,255,0.03); border-radius:12px; margin-top:10px;">Выберите NFT коллекцию, чтобы увидеть список моделей.</div>`;
                sInput.disabled = true;
                return;
            }

            // BG & SYMBOLS: Global selection allowed
            const allItemsMap = {};
            // Iterate OVER COLLECTIONS to preserve context
            Object.entries(ATTR_STATS[m.key] || {}).forEach(([colName, list]) => {
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
            sInput.placeholder = `Поиск ${m.label}... (Все NFT)`;

            if (!sVal || "выбрать все".includes(sVal)) {
                addFilterItem(cont, "Выбрать все", "all", m.key, ACTIVE_FILTERS[m.key] === 'all');
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
        sInput.placeholder = `Поиск ${m.label}...`;

        if (!sVal || "выбрать все".includes(sVal)) {
            addFilterItem(cont, "Выбрать все", "all", m.key, ACTIVE_FILTERS[m.key] === 'all');
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
    } else if (imgUrl && !isBadUrl(imgUrl)) {
        const fallback = (fallbackImgUrl && !isBadUrl(fallbackImgUrl)) ? fallbackImgUrl : 'https://nft.fragment.com/guide/gift.svg';

        visualHTML = `<div style="width:52px; height:52px; border-radius:12px; background: rgba(255, 255, 255, 0.05); border:1px solid rgba(255, 255, 255, 0.1); display:flex; align-items:center; justify-content:center; position:relative; overflow:hidden;">
            <span style="color:#8b9bb4; font-size:11px; font-weight:700; position:absolute; z-index:1;">${name.substring(0, 3).toUpperCase()}</span>
            <img src="${imgUrl}" class="filter-img" style="width:100%; height:100%; object-fit:contain; z-index:2; opacity:0; transition:opacity 0.2s;" 
                onload="this.style.opacity='1';"
                onerror="
                    const name = '${name.replace(/'/g, "\\'")}';
                    const col = '${(collectionContext || '').replace(/'/g, "\\'")}';
                    this.dataset.slugIndex = this.dataset.slugIndex ? parseInt(this.dataset.slugIndex) + 1 : 1;
                    const nextUrl = getTelegifterUrl('model', name, col, parseInt(this.dataset.slugIndex));
                    if (nextUrl && parseInt(this.dataset.slugIndex) < 20) {
                        this.src = nextUrl;
                    } else if (this.src !== '${fallback}') {
                        this.src = '${fallback}';
                        this.style.opacity = '1';
                    } else {
                        this.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
                        this.style.display = 'none';
                    }
                ">
        </div>`;
    } else {
        const labelText = name.substring(0, 3).toUpperCase();
        visualHTML = `<div style="width:52px; height:52px; border-radius:12px; background: rgba(255, 255, 255, 0.05); border:1px solid rgba(255, 255, 255, 0.1); display:flex; align-items:center; justify-content:center; position:relative; overflow:hidden;">
            <span style="color:#8b9bb4; font-size:11px; font-weight:700; z-index:1;">${labelText}</span>
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

    // Price from backend is already in TON and marked up
    const myPrice = parseFloat(item.price_per_day).toFixed(2);

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

    let fallbackImg = "https://cdn-icons-png.flaticon.com/512/4213/4213958.png";
    const fragmentUrls = generateFragmentUrls(item.nft_name);
    const lottieId = `lottie-${item.nft_address}`;

    // SMART IMAGE LOGIC:
    // If server gives us a 'bad' placeholder (gift.svg/ton_symbol), IGNORE IT and use generated Fragment URL.
    let imgSrc = item._realImage;
    if (!imgSrc || imgSrc.includes('gift.svg') || imgSrc.includes('ton_symbol')) {
        imgSrc = fragmentUrls.image;
    }
    // Final fallback
    if (!imgSrc) imgSrc = fallbackImg;

    let mediaHTML = `
        <div class="card-days-badge">Days: 1 – ${maxDays}</div>
        <img src="${imgSrc}" class="card-img ${fragmentUrls.lottie ? 'lottie-bg' : ''}" id="img-${lottieId}" loading="lazy" onerror="this.src='${fallbackImg}'">
    `;
    // Set z-index 3 for Lottie to be clearly above img and badge (badge is 1)
    if (fragmentUrls.lottie) mediaHTML += `<div id="${lottieId}" class="card-img lottie-container" style="z-index: 3;"></div>`;

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
        .replace(/[^a-z0-9]/g, ''); // keep ONLY alphanumeric (remove spaces, dashes)

    return {
        image: `https://nft.fragment.com/gift/${name}-${match[2]}.webp`,
        lottie: `https://nft.fragment.com/gift/${name}-${match[2]}.lottie.json`
    };
}
const LOTTIE_OBSERVER = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        const card = entry.target;
        if (!card.dataset.lottieUrl) return;
        const container = document.getElementById(card.dataset.lottieId);
        if (!container) return;

        if (entry.isIntersecting) {
            const staticImg = document.getElementById(`img-${card.dataset.lottieId}`);
            if (staticImg) staticImg.style.opacity = '0'; // Hide static image immediately

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
            const staticImg = document.getElementById(`img-${card.dataset.lottieId}`);
            if (staticImg) staticImg.style.opacity = '1'; // Show static image again
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
        // Hide static image if Lottie exists
        document.getElementById('view-img').style.opacity = '0';
        lottie.loadAnimation({
            container: lottieCont,
            renderer: 'svg',
            loop: true,
            autoplay: true,
            path: fUrls.lottie
        });
    } else {
        // Ensure static image is visible if no Lottie
        document.getElementById('view-img').style.opacity = '1';
    }

    const colName = (item._collection && item._collection.name) ? item._collection.name : "Gifts";
    document.getElementById('view-title').innerText = item.nft_name;
    document.getElementById('view-collection').innerText = `${colName} >`;

    const ownerEl = document.getElementById('view-owner');

    // Safety check for initialOwner
    let initialOwner = 'Loading...';
    try {
        initialOwner = item.lender_address || item.seller_address || item._realOwner || 'Loading...';
        if (typeof initialOwner === 'string') {
            if (initialOwner.startsWith('EQ')) {
                initialOwner = 'UQ' + initialOwner.substring(2);
            }
            if (initialOwner.length > 15 && !initialOwner.includes('.')) {
                initialOwner = initialOwner.substring(0, 4) + '...' + initialOwner.substring(initialOwner.length - 4);
            }
        }
    } catch (e) { console.error("Initial owner error", e); }

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

                    if (type === 'Model' || type === 'Character') targetLabel = 'Модель';
                    else if (type === 'Backdrop' || type === 'Background') targetLabel = 'Фон';
                    else if (type === 'Pattern' || type === 'Theme' || type === 'Symbol') targetLabel = 'Символ';

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
    // Ensure dailyPrice is a valid number, fallback to 0.11 if everything fails
    let rawP = parseFloat(item.price_per_day);
    if (isNaN(rawP) || rawP <= 0) rawP = 0.11;
    const dailyPrice = rawP.toFixed(2);
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
        if (!value || value === 'Default' || value === 'Common' || value === 'Gift' || value === 'Unknown') return "25.0";
        try {
            const valStr = String(value);
            const hash = valStr.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
            return (0.1 + (hash % 100) / 10).toFixed(1);
        } catch (e) {
            return "15.0";
        }
    };

    // Helper to create property row with percent
    const createPropRow = (label, value, statKey, showFloor = false) => {
        // Remove Gift/Unknown filter to ensure rows exist for fetch-update to find them
        const displayValue = (!value || value === 'Unknown' || value === 'Gift') ? 'Loading...' : value;
        const percent = getPercent(statKey, value);
        const row = document.createElement('div');
        row.className = 'property-item';
        row.style.cursor = 'pointer'; // Make it clickable

        // Hide if it looks like an address or is labelled as such
        const isAddr = value && typeof value === 'string' && (value.startsWith('EQ') || value.startsWith('UQ')) && value.length > 30;
        if (label.toLowerCase().includes('owner') || label.toLowerCase().includes('address') || isAddr) {
            row.classList.add('ownership-row');
        }

        row.innerHTML = `
            <div class="prop-left"><div class="prop-name">${label}</div></div>
            <div class="prop-right">
                <span class="prop-value-text" style="color:var(--accent-blue); font-weight:600;">${displayValue}</span>
                <span class="prop-percent-text" style="font-size:11px; color:rgba(77,178,255,0.7); margin-left:6px;">${percent}%</span>
                ${showFloor ? `<span class="prop-floor-text" style="margin-left:8px;">${renderTonAmount(dailyPrice)}</span>` : ''}
            </div>
        `;

        row.onclick = (e) => {
            if (displayValue === 'Loading...') return;
            e.stopPropagation();
            console.log(`Filtering by ${statKey}: ${displayValue}`);

            // Re-apply filters
            ACTIVE_FILTERS[statKey] = displayValue;

            // "нфт подтягиваеться в случае с моделью" - if it's a model, link collection too
            if (statKey === 'model' && item.collection_address) {
                ACTIVE_FILTERS.nft = item.collection_address;
            }

            closeProductView();
            loadLiveItems(true); // Refresh with new filters
            tg.HapticFeedback.impactOccurred('medium');
        };

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

    // 4. PRE-FILL from item data if available
    let realModel = item._modelName || null;
    let realBackdrop = item._backdrop || null;
    let realPattern = item._symbol || null;

    if (item.attributes && Array.isArray(item.attributes)) {
        item.attributes.forEach(attr => {
            const t = attr.trait_type.toLowerCase();
            if (t.includes('model') || t === 'модель') realModel = attr.value;
            else if (t.includes('backdrop') || t === 'фон') realBackdrop = attr.value;
            else if (t.includes('pattern') || t.includes('symbol') || t === 'узор') realPattern = attr.value;
        });
    }

    if (!realModel || realModel === 'Unknown') realModel = 'Loading...';
    if (!realBackdrop || realBackdrop === 'Unknown') realBackdrop = 'Loading...';
    if (!realPattern || realPattern === 'Unknown' || realPattern === 'None') realPattern = 'Loading...';

    // Add Model row (e.g., "Ninja Turtle")
    if (realModel) {
        const modelRow = createPropRow('Модель', realModel, 'model', true);
        if (modelRow) propCont.appendChild(modelRow);
    }

    // Add Pattern/Symbol row (e.g., "Champagne")
    if (realPattern) {
        const patternRow = createPropRow('Символ', realPattern, 'symbol', true);
        if (patternRow) propCont.appendChild(patternRow);
    }

    // Add Backdrop row (e.g., "French Blue")
    if (realBackdrop) {
        const backdropRow = createPropRow('Фон', realBackdrop, 'bg', true);
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
        if (!tonConnectUI || !tonConnectUI.connected) {
            if (tonConnectUI) await tonConnectUI.openModal();
            else tg.showAlert("Кошелек не инициализирован");
            return;
        }

        const durInput = document.getElementById('rent-duration-input');
        const days = parseInt(durInput.value) || 1;

        // Show loading state
        const originalBtnHTML = rentBtn.innerHTML;
        rentBtn.innerHTML = "Подготовка...";
        rentBtn.disabled = true;

        try {
            // 1. Получаем параметры транзакции от бэкенда (сплит-платеж)
            const userId = (tg && tg.initDataUnsafe && tg.initDataUnsafe.user) ? tg.initDataUnsafe.user.id : 0;
            const prepResp = await fetch(`${BACKEND_URL}/api/prepare_rent?nft_address=${item.nft_address}&days=${days}&user_id=${userId}`);
            const prepData = await prepResp.json();

            if (prepData.error) {
                throw new Error(prepData.error);
            }

            // 2. Отправляем транзакцию через TON Connect
            const res = await tonConnectUI.sendTransaction({
                validUntil: Math.floor(Date.now() / 1000) + 600,
                messages: prepData.messages
            });

            if (res) {
                // 3. Уведомляем сервер
                await fetch(`${BACKEND_URL}/api/mark_rented`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ nft_address: item.nft_address, order_id: prepData.order_id })
                });

                ALL_MARKET_ITEMS = ALL_MARKET_ITEMS.filter(i => i.nft_address !== item.nft_address);
                closeProductView();
                applyHeaderSearch();

                tg.showPopup({
                    title: "Оплата принята",
                    message: "Ваш платеж обрабатывается. Окно для ввода ссылки Fragment откроется автоматически через 20-40 секунд.",
                    buttons: [{ type: "ok" }]
                }, () => {
                    // После закрытия попапа открываем модалку ожидания
                    openTcModal(prepData.order_id, true);
                    startPollingOrder(prepData.order_id);
                });
            }
        } catch (e) {
            console.error(e);
            tg.showAlert("Ошибка: " + (e.message || "Оплата отменена"));
        } finally {
            rentBtn.innerHTML = originalBtnHTML;
            rentBtn.disabled = false;
        }
    };

    // Listing Warning Logic
    const warningBox = document.getElementById('listing-warning-box');
    const warningTime = document.getElementById('view-listed-time');
    if (warningBox) warningBox.style.display = 'none';

    // Fetch full details to check listed_at
    fetch(`${BACKEND_URL}/api/nft_details?nft_address=${item.nft_address}`)
        .then(r => r.json())
        .then(details => {
            if (details.rent && details.rent.listed_at) {
                const listedAt = details.rent.listed_at * 1000;
                const now = Date.now();
                const diffMs = now - listedAt;
                const diffHrs = diffMs / (1000 * 60 * 60);

                if (diffHrs < 24) {
                    if (warningBox) warningBox.style.display = 'block';
                    if (warningTime) {
                        if (diffHrs < 1) {
                            const mins = Math.round(diffMs / (1000 * 60));
                            warningTime.innerText = `${mins} minutes ago`;
                        } else {
                            warningTime.innerText = `${Math.round(diffHrs)} hours ago`;
                        }
                    }
                }
            }
        }).catch(e => console.error("Details fetch fail:", e));

    document.getElementById('product-view').classList.add('active');
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
    const dur = parseInt(input.value) || 1;
    const dp = parseFloat(CURRENT_PAYMENT_ITEM.price_per_day);
    const markupPerDay = calculateMarkup(dp);
    const total = ((dp + markupPerDay) * dur).toFixed(2);
    const priceSpan = document.getElementById('rent-btn-price');
    if (priceSpan) {
        priceSpan.innerText = total;
    }
}

function closeProductView() {
    const pv = document.getElementById('product-view');
    if (pv) pv.classList.remove('active');
    CURRENT_PAYMENT_ITEM = null;
    const lottieCont = document.getElementById('view-lottie');
    if (lottieCont && lottieCont.anim) {
        lottieCont.anim.destroy();
        lottieCont.anim = null;
        lottieCont.innerHTML = '';
    }
    const viewImg = document.getElementById('view-img');
    if (viewImg) viewImg.style.opacity = '1';
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

    const body = document.querySelector('#tc-modal div[style*="padding: 20px"]');
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
    list.innerHTML = '<div style="color:#8b9bb4; text-align:center; padding:10px;"><div class="premium-spinner" style="width:20px;height:20px;margin:10px auto;"></div>Загрузка...</div>';

    try {
        const userId = (tg && tg.initDataUnsafe && tg.initDataUnsafe.user) ? tg.initDataUnsafe.user.id : 0;
        const resp = await fetch(`${BACKEND_URL}/api/my_orders?user_id=${userId}`);
        const orders = await resp.json();

        if (!orders || orders.length === 0) {
            list.innerHTML = '<div style="color:#8b9bb4; text-align:center; padding:20px;">История пуста</div>';
            return;
        }

        list.innerHTML = '';
        orders.forEach(o => {
            const item = document.createElement('div');
            item.className = 'history-item';
            item.style = 'background:rgba(255,255,255,0.05); border-radius:12px; padding:12px; margin-bottom:10px; display:flex; flex-direction:column; gap:8px;';

            let statusColor = '#8b9bb4';
            let statusText = o.status;
            if (o.status === 'rented') { statusColor = '#FF9500'; statusText = 'Ожидает ссылку'; }
            if (o.status === 'active') { statusColor = '#34C759'; statusText = 'Активен'; }
            if (o.status === 'paid') { statusColor = '#007AFF'; statusText = 'Выкуплен'; }

            item.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span style="color:#fff; font-weight:600;">${o.nft_name}</span>
                    <span style="color:${statusColor}; font-size:11px; font-weight:700; text-transform:uppercase;">${statusText}</span>
                </div>
                <div style="display:flex; justify-content:space-between; font-size:12px; color:#8b9bb4;">
                    <span>Срок: ${o.days} дн.</span>
                    <span>${o.total_price} TON</span>
                </div>
                ${o.status === 'rented' ? `
                    <button onclick="openTcModal(${o.id})" class="btn-yellow" style="height:36px; font-size:12px; margin-top:5px;">Отправить tc:// ссылку</button>
                ` : ''}
            `;
            list.appendChild(item);
        });
    } catch (e) {
        list.innerHTML = '<div style="color:#ff3b30; text-align:center; padding:10px;">Ошибка загрузки</div>';
    }
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
    // 1. User Info from Telegram
    if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user) {
        const u = tg.initDataUnsafe.user;
        const avaEl = document.getElementById('profile-avatar');
        const headerAva = document.getElementById('header-mini-avatar');

        if (u.photo_url) {
            if (avaEl) avaEl.src = u.photo_url;
            if (headerAva) headerAva.src = u.photo_url;
        }
    }

    // 2. Balance (Static or API)
    const balance = "0.00";
    const balElBase = document.getElementById('profile-balance');
    const balElMini = document.getElementById('header-mini-balance');

    if (balElBase) balElBase.textContent = balance;
    if (balElMini) balElMini.textContent = balance;

    // 3. Wallet State Sync
    updateWalletBtnState();
}

function updateWalletBtnState() {
    console.log('Updating wallet button state...');
    const btnText = document.getElementById('blue-wallet-text');
    if (!btnText) return;

    if (tonConnectUI && tonConnectUI.account) {
        let addr = tonConnectUI.account.address;
        console.log('Account found:', addr);

        // Try to convert to user-friendly address
        try {
            // New way: tonConnectUI.account.address usually comes as raw.
            // But we can format it if required. 
            // Most TC versions have a utility for this or provide a friendly address in account
        } catch (e) { }

        const short = addr.slice(0, 4) + '...' + addr.slice(-4);
        btnText.textContent = short;
        console.log('Button text updated to:', short);
    } else {
        console.log('No account found or disconnected');
        btnText.textContent = "Connect Wallet";
    }
}

// Redundant listener removed (moved to initTonConnect)

// Fallback in case overlay fails
function openWalletConnect() {
    if (tonConnectUI) {
        tonConnectUI.openModal();
    }
}


// --- Language Switcher ---
function switchLanguage() {
    // Simple toggle for now
    const label = document.getElementById('lang-label');
    const current = label.innerText;

    if (current.includes('Русский')) {
        label.innerText = 'English >';
        tg.showAlert('Language switched to English');
    } else {
        label.innerText = 'Русский >';
        tg.showAlert('Язык изменен на Русский');
    }
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
document.addEventListener('DOMContentLoaded', () => {
    // Initial checks if needed
});
