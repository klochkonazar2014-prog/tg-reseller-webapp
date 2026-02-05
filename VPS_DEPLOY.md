# OctoRent Bot - VPS Deployment Guide

## Quick Start

После получения доступа к VPS (Oracle Cloud, Aeza, Timeweb и т.д.):

### 1. Подключение к серверу

```bash
ssh root@YOUR_SERVER_IP
```

### 2. Клонирование репозитория

```bash
cd /home
git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git octorent
cd octorent
```

### 3. Запуск автоматической установки

```bash
chmod +x setup_vps.sh
sudo ./setup_vps.sh
```

Скрипт автоматически:
- Установит Python 3.11, nginx, git
- Создаст пользователя `octorent`
- Настроит виртуальное окружение
- Установит все зависимости
- Создаст systemd-сервисы для автозапуска
- Настроит nginx как reverse proxy

### 4. Настройка переменных окружения

```bash
nano .env
```

Скопируй значения из своего локального `.env` файла.

### 5. Запуск сервисов

```bash
sudo systemctl start octorent-bot
sudo systemctl start octorent-server
sudo systemctl start octorent-parser
sudo systemctl start octorent-buyer
```

### 6. Проверка статуса

```bash
sudo systemctl status octorent-bot
sudo systemctl status octorent-server
```

### 7. Просмотр логов

```bash
# Все логи бота
sudo journalctl -u octorent-bot -f

# Логи сервера
sudo journalctl -u octorent-server -f
```

## Обновление кода

```bash
cd /home/octorent
./deploy.sh
```

## Настройка Web App

В файле `web/app.js` обнови `BACKEND_URL`:

```javascript
const BACKEND_URL = "http://YOUR_SERVER_IP";
// или
const BACKEND_URL = "https://YOUR_DOMAIN";
```

Затем запуш изменения на GitHub Pages:

```bash
cd web
git add .
git commit -m "Update backend URL for VPS"
git push origin main
```

## Полезные команды

```bash
# Перезапуск всех сервисов
sudo systemctl restart octorent-*

# Остановка всех сервисов
sudo systemctl stop octorent-*

# Просмотр статуса всех сервисов
sudo systemctl status octorent-* --no-pager

# Просмотр логов с фильтром
sudo journalctl -u octorent-bot --since "1 hour ago"

# Очистка старых логов
sudo journalctl --vacuum-time=7d
```

## Firewall (если используется)

Открой порты для nginx:

```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

## SSL Certificate (опционально)

Для HTTPS используй Let's Encrypt:

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d YOUR_DOMAIN
```

## Мониторинг

Проверка использования ресурсов:

```bash
# CPU и память
htop

# Дисковое пространство
df -h

# Размер базы данных
du -h database.db
```

## Troubleshooting

### Сервис не запускается

```bash
# Проверь логи
sudo journalctl -u octorent-bot -n 50

# Проверь права доступа
ls -la /home/octorent/bot

# Проверь .env файл
cat /home/octorent/bot/.env
```

### База данных заблокирована

```bash
# Останови все сервисы
sudo systemctl stop octorent-*

# Проверь процессы
ps aux | grep python

# Запусти снова
sudo systemctl start octorent-*
```

### Nginx не работает

```bash
# Проверь конфигурацию
sudo nginx -t

# Перезапусти nginx
sudo systemctl restart nginx

# Проверь логи
sudo tail -f /var/log/nginx/error.log
```
