import re

def fix_appjs():
    with open('web/app.js', 'r', encoding='utf-8') as f:
        content = f.read()

    # Cards
    content = re.sub(
        r'const myPrice = priceVal > 0 \? priceVal\.toFixed\(2\) : \"---\";',
        r'const myPrice = priceVal > 0 ? Math.round(priceVal * (FIAT_RATES.RUB || 230)) : "---";',
        content
    )
    # Fix the card HTML price render.
    content = re.sub(
        r" <span class=\"icon-ton\"></span>'\s*:\s*''}\s*\$\{myPrice\}\s*\$\{item\.type && item\.type !== 'gift' \? 'TON' : ''\}",
        " <span class=\"icon-ton\"></span>' : ''} ${myPrice} ₽",
        content
    )

    # Modal
    content = re.sub(
        r'const dailyPrice = rawP > 0 \? rawP\.toFixed\(2\) : \"---\";',
        r'const dailyPrice = rawP > 0 ? Math.round(rawP * (FIAT_RATES.RUB || 230)) : "---";',
        content
    )
    content = content.replace('id="modal-price-val">${dailyPrice} TON', 'id="modal-price-val">${dailyPrice} ₽')
    
    # Text block
    content = re.sub(
        r'Для активации <b>смарт-контрактов для оплаты комисии блокчейна<\/b> необходимо отправить <b>0\.2 TON<\/b>, остаток которых \(<b>~0\.14 TON<\/b>\) будет возвращен вам автоматически после завершения срока аренды.',
        r'Для обеспечения работы <b>смарт-контрактов сети</b> в финальную цену уже включён разовый сбор блокчейна за газ (<b>~0.06 TON</b>). Дополнительных депозитов не требуется.',
        content
    )
    content = re.sub(
        r'<b>Возврат работает автоматически:<\/b><br>\s*Смарт-контракт заберет только фактическую комиссию сети\. Весь неиспользованный остаток моментально и автоматически возвращается на ваш кошелек!',
        r'<b>Оптимизация платежей:</b><br>Мы берем всю техническую логику залогов блокчейна на себя! Вы оплачиваете только саму аренду и фактический сожженный газ.',
        content
    )

    with open('web/app.js', 'w', encoding='utf-8') as f:
        f.write(content)
        
    print("Fixed app.js successfully")

if __name__ == "__main__":
    fix_appjs()
