const tg = window.Telegram.WebApp;

// Инициализация TON Connect
const tonConnectUI = new TON_CONNECT_UI.TonConnectUI({
    manifestUrl: 'https://klochkonazar2014-prog.github.io/tg-reseller-webapp/tonconnect-manifest.json',
    buttonRootId: 'ton-connect-button'
});

tg.expand();

// Получаем параметры из URL
const urlParams = new URLSearchParams(window.location.search);
const nftAddress = urlParams.get('nft_address');
const title = urlParams.get('title') || 'NFT Gift';
const myMarkup = parseFloat(urlParams.get('markup')) || 0; // Твоя наценка в TON
const ownerWallet = urlParams.get('owner_wallet'); // Твой кошелек для прибыли
const apiToken = "193541-57afc271119790fc3a4a0e7eb00f7071-1768332974";

// Обновляем UI
document.getElementById('item-name').innerText = title;

async function preparePayment() {
    try {
        // 1. Запрашиваем транзакцию у MarketApp API
        const response = await fetch(`https://api.marketapp.ws/v1/rent/${nftAddress}/pay/`, {
            method: 'POST',
            headers: {
                'Authorization': apiToken,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ duration: 86400 }) // Аренда на 1 день (можно менять)
        });

        if (!response.ok) throw new Error('Ошибка API маркетплейса');

        const marketAppData = await response.json();
        const marketMsg = marketAppData.messages[0];

        document.getElementById('duration').innerText = "1 день";
        const originalPrice = parseFloat(marketMsg.amount) / 1000000000;
        const totalToPay = originalPrice + myMarkup;

        document.getElementById('total-price').innerText = `${totalToPay.toFixed(2)} TON`;

        return {
            validUntil: Math.floor(Date.now() / 1000) + 300,
            messages: [
                // Сообщение 1: Оплата в MarketApp (цена сайта)
                {
                    address: marketMsg.address,
                    amount: marketMsg.amount,
                    payload: marketMsg.payload
                },
                // Сообщение 2: Твоя прибыль (наценка)
                {
                    address: ownerWallet,
                    amount: (myMarkup * 1000000000).toString(),
                    payload: ""
                }
            ]
        };
    } catch (e) {
        tg.showAlert("Ошибка: " + e.message);
        return null;
    }
}

tonConnectUI.onStatusChange(async (wallet) => {
    const mainBtn = document.getElementById('main-action');
    if (wallet) {
        mainBtn.classList.remove('hidden');
        await preparePayment(); // Сразу считаем цену
    } else {
        mainBtn.classList.add('hidden');
    }
});

async function handlePayment() {
    const tx = await preparePayment();
    if (!tx) return;

    try {
        const result = await tonConnectUI.sendTransaction(tx);

        tg.showAlert('Готово! Аренда оплачена. Твоя наценка уже на твоем кошельке!');

        tg.sendData(JSON.stringify({
            status: 'success',
            boc: result.boc
        }));

        setTimeout(() => tg.close(), 3000);
    } catch (e) {
        tg.showAlert('Отмена или ошибка: ' + e.message);
    }
}
