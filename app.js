const tg = window.Telegram.WebApp;
tg.expand();
tg.MainButton.hide();

// Конфиг
const API_URL = "https://api.marketapp.ws/v1";
const TOKEN = "193541-57afc271119790fc3a4a0e7eb00f7071-1768332974"; // Твой токен, чтобы не было лимитов
const MY_MARKUP = 0.20; // 20%
const OWNER_WALLET = "UQBxgCx_WJ4_fKgz8tec73NZadhoDzV250-Y0taVPJstZsRl";
const MANIFEST_URL = "https://klochkonazar2014-prog.github.io/tg-reseller-webapp/tonconnect-manifest.json";

// Состояние
let allCollections = [];
let currentItems = [];
let tonConnectUI;

// Инициализация
document.addEventListener("DOMContentLoaded", async () => {
    initTonConnect();
    await loadCollections();
});

function initTonConnect() {
    tonConnectUI = new TON_CONNECT_UI.TonConnectUI({
        manifestUrl: MANIFEST_URL,
        buttonRootId: 'ton-connect-btn'
    });
}

// 1. Загрузка Коллекций (Главная)
async function loadCollections() {
    showLoader(true);
    try {
        const res = await fetch(`${API_URL}/collections/gifts/`, {
            headers: { "Authorization": TOKEN }
        });
        if (!res.ok) throw new Error("API Error");

        allCollections = await res.json();
        renderCollections(allCollections);
    } catch (e) {
        document.getElementById('collections-view').innerHTML = `<p style="text-align:center; color: #ff4b4b;">Ошибка загрузки каталога. Включите VPN.</p>`;
    } finally {
        showLoader(false);
    }
}

// 2. Рендер Карточек Коллекций
function renderCollections(list) {
    const container = document.getElementById('collections-view');
    container.innerHTML = "";

    // Для каждой коллекции делаем запрос 1 товара чтобы получить обложку
    // (Или используем дефолтную, чтобы не грузить сеть)

    list.forEach(col => {
        const card = document.createElement('div');
        card.className = "card";
        card.onclick = () => openCollection(col);

        // Пока ставим заглушку, но можно докачать картинку
        // В реальном проекте лучше иметь URL обложки в базе
        const coverImg = "https://ton.org/download/ton_symbol.png";

        card.innerHTML = `
            <div class="card-image-wrapper">
                <img src="${coverImg}" class="card-img" id="img-${col.address}">
            </div>
            <div class="card-content">
                <h3 class="card-title">${col.name}</h3>
                <div class="card-subtitle">Items: 100+</div>
            </div>
        `;
        container.appendChild(card);

        // Ленивая подгрузка обложки (берем первый лот)
        fetchFirstItemImage(col.address).then(url => {
            if (url) document.getElementById(`img-${col.address}`).src = url;
        });
    });
}

async function fetchFirstItemImage(colAddress) {
    try {
        // Берем 1 OnSale предмет чтобы узнать картинку
        const res = await fetch(`${API_URL}/nfts/collections/${colAddress}/?limit=1`, {
            headers: { "Authorization": TOKEN }
        });
        const data = await res.json();
        if (data && data.length > 0) {
            return data[0].image_url || data[0].preview_url;
        }
    } catch (e) { }
    return null;
}

// 3. Открытие Коллекции
async function openCollection(col) {
    // UI Переключение
    document.getElementById('collections-view').classList.add('hidden');
    document.getElementById('items-view').classList.remove('hidden');
    document.getElementById('back-btn').style.display = 'block';

    // Смена заголовка поиска
    document.getElementById('search-input').placeholder = `Поиск в ${col.name}...`;
    document.getElementById('items-view').innerHTML = ""; // Очистка
    showLoader(true);

    try {
        // Загружаем товары в аренде
        const res = await fetch(`${API_URL}/rent/gifts/?collection_address=${col.address}&limit=50`, {
            headers: { "Authorization": TOKEN }
        });
        const data = await res.json();
        currentItems = data.items || [];
        renderItems(currentItems);

    } catch (e) {
        console.error(e);
    } finally {
        showLoader(false);
    }
}

// 4. Рендер Товаров (NFT)
function renderItems(list) {
    const container = document.getElementById('items-view');
    container.innerHTML = "";

    if (list.length === 0) {
        container.innerHTML = "<p style='grid-column: 1/-1; text-align: center; color: #8b9bb4;'>Нет доступных лотов.</p>";
        return;
    }

    list.forEach(item => {
        const card = document.createElement('div');
        card.className = "card";

        const price = parseFloat(item.price_per_day) / 1000000000;
        const myPrice = (price * (1 + MY_MARKUP)).toFixed(2);

        card.onclick = () => openPaymentModal(item, myPrice);

        // Чтобы не тормозить, картинку берем из item.metadata если сервер отдал,
        // но endpoint /rent/gifts/ не всегда отдает картинки. 
        // Здесь ставим заглушку и докачиваем, или используем прокси-данные
        // (Для скорости поставим дефолт, а в реале надо подтягивать nfts/{addr})
        const imgUrl = "https://ton.org/download/ton_symbol.png";

        card.innerHTML = `
            <div class="card-image-wrapper">
                <img src="${imgUrl}" class="card-img" id="nft-img-${item.nft_address}">
                <div class="rarity-badge">Live</div>
            </div>
            <div class="card-content">
                <h3 class="card-title">${item.nft_name}</h3>
                <div class="badge">${myPrice} TON</div>
            </div>
        `;
        container.appendChild(card);

        // Подгрузка реальной картинки
        fetchNftImage(item.nft_address).then(url => {
            if (url) document.getElementById(`nft-img-${item.nft_address}`).src = url;
        });
    });
}

async function fetchNftImage(address) {
    try {
        const res = await fetch(`${API_URL}/nfts/${address}/`, {
            headers: { "Authorization": TOKEN }
        });
        const d = await res.json();
        return d.image_url || d.animation_url || d.preview_url;
    } catch (e) { return null; }
}

// --- Навигация ---

function goBack() {
    document.getElementById('collections-view').classList.remove('hidden');
    document.getElementById('items-view').classList.add('hidden');
    document.getElementById('back-btn').style.display = 'none';
    document.getElementById('search-input').placeholder = "Поиск коллекции...";
    document.getElementById('search-input').value = "";
    renderCollections(allCollections); // Сброс фильтра
}

function handleSearch() {
    const query = document.getElementById('search-input').value.toLowerCase();

    if (!document.getElementById('collections-view').classList.contains('hidden')) {
        // Фильтр коллекций
        const filtered = allCollections.filter(c => c.name.toLowerCase().includes(query));
        renderCollections(filtered);
    } else {
        // Фильтр товаров
        const filtered = currentItems.filter(i => i.nft_name.toLowerCase().includes(query));
        renderItems(filtered);
    }
}

function showLoader(show) {
    document.getElementById('loader').style.display = show ? 'flex' : 'none';
}

// --- Оплата ---

let selectedItem = null;

async function openPaymentModal(item, finalPrice) {
    selectedItem = { ...item, finalPrice };
    document.getElementById('payment-modal').classList.add('active');

    document.getElementById('modal-title').innerText = item.nft_name;
    document.getElementById('modal-price').innerText = `${finalPrice} TON`;

    // Картинку берем из уже загруженной в карточке
    const existingImg = document.getElementById(`nft-img-${item.nft_address}`).src;
    document.getElementById('modal-img').src = existingImg;

    // Пересоздаем кнопку оплаты с новой транзакцией
    // ... логика транзакции аналогична той что была ...
}

function closeModal() {
    document.getElementById('payment-modal').classList.remove('active');
}

// Логику транзакции можно перенести из старого app.js (split payment)
