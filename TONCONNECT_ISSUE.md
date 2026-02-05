# Проблема с TonConnect подключением

## Текущая ситуация
Fragment API возвращает ошибку 400 "forbidden" при попытке отправить TC ссылку.

**Лог:**
```
INFO:root:Sending POST to https://api.marketapp.ws/v1/rent/EQCPYZ.../tonconnect/
INFO:root:Fragment API Response Status: 400
INFO:root:Fragment API Response Body: {"detail":"forbidden"}
```

## Причина
Используется общий токен из `.env`, но для подключения TonConnect к конкретному NFT нужен **токен владельца** этого NFT.

## Возможные решения

### Вариант 1: Получить токен владельца
Запросить у MarketApp API токен владельца NFT для TonConnect подключения.

### Вариант 2: Использовать другой flow
Возможно MarketApp использует другой механизм для TonConnect:
- Webhook callback
- Polling статуса
- Прямое подключение без API

### Вариант 3: Проверить документацию
Нужно изучить официальную документацию MarketApp API для правильного flow аренды.

## Что нужно сделать
1. Проверить документацию MarketApp API
2. Возможно нужно использовать другой endpoint
3. Или получать специальный токен для каждой транзакции
