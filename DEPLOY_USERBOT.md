# Инструкция по запуску ИИ-Юзербота на сервере 🚀

Поскольку это юзербот (работает от твоего имени), первый запуск нужно сделать **вручную**, чтобы ввести код подтверждения от Telegram. Потом мы настроим его как службу, чтобы он работал 24/7.

### Шаг 1: Установка библиотек
Зайди на сервер и выполни команду, чтобы установить нужные пакеты в твое виртуальное окружение:
```bash
/home/octorent/.venv/bin/pip install pyrogram groq python-dotenv tgcrypto
```

### Шаг 2: Первый запуск и авторизация (ВАЖНО)
Запусти скрипт вручную:
```bash
cd /home/octorent
/home/octorent/.venv/bin/python userbot_support.py
```
**Что будет дальше:**
1. Программа попросит ввести твой **номер телефона** (в формате +7...).
2. Telegram пришлет тебе **код подтверждения** (в само приложение ТГ). Введи его в консоль.
3. Если стоит облачный пароль (2FA) — введи и его.
4. Как только увидишь надпись `🚀 Запуск ИИ-Юзербота OctoRent...`, значит всё ок!
5. Нажми `Ctrl + C`, чтобы остановить его. Теперь у тебя в папке появился файл `octorent_userbot.session` — это твой «ключ» для входа без пароля.

### Шаг 3: Настройка автозапуска (24/7)
Чтобы бот не выключался, создадим системную службу.

1. Создай файл службы:
```bash
sudo nano /etc/systemd/system/octorent-support.service
```

2. Вставь туда этот текст (проверь пути, если они отличаются):
```ini
[Unit]
Description=OctoRent AI Support Userbot
After=network.target

[Service]
User=octorent
Group=octorent
WorkingDirectory=/home/octorent
EnvironmentFile=/home/octorent/.env
ExecStart=/home/octorent/.venv/bin/python userbot_support.py
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

3. Сохрани (`Ctrl+O`, `Enter`) и выйди (`Ctrl+X`).

4. Запусти службу:
```bash
sudo systemctl daemon-reload
sudo systemctl enable octorent-support
sudo systemctl start octorent-support
```

### Как проверять работу?
Посмотреть логи ИИ-бота в реальном времени:
```bash
journalctl -u octorent-support -f
```

Теперь твой ИИ-саппорт будет работать вечно! 🦾🔥
