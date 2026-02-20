import os
import subprocess
import requests
import sys
import re

# Настройки
PORT = 8001
EXE_NAME = "cloudflared.exe"
CLOUDFLARED_URL = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"

def log(msg):
    print(f"[CF TUNNEL] {msg}")

def download_if_missing():
    if not os.path.exists(EXE_NAME):
        log("cloudflared.exe не найден. Скачивание...")
        try:
            r = requests.get(CLOUDFLARED_URL, stream=True)
            r.raise_for_status()
            with open(EXE_NAME, 'wb') as f:
                for chunk in r.iter_content(chunk_size=8192):
                    f.write(chunk)
            log("Скачивание завершено.")
        except Exception as e:
            log(f"Ошибка при скачивании: {e}")
            sys.exit(1)

def update_configs(new_url):
    """Автоматически обновляет .env и app.js при получении нового URL"""
    try:
        log(f"Обновление конфигураций новым URL: {new_url}")
        
        # 1. Обновление .env
        env_path = ".env"
        if os.path.exists(env_path):
            with open(env_path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            # Заменяем WEB_APP_URL=... на новый
            new_content = re.sub(r'WEB_APP_URL=https://[a-z0-9.-]+\.trycloudflare\.com', f'WEB_APP_URL={new_url}', content)
            
            with open(env_path, 'w', encoding='utf-8') as f:
                f.write(new_content)
            log("Файл .env успешно обновлен.")

        # 2. Обновление web/app.js
        app_js_path = os.path.join("web", "app.js")
        if os.path.exists(app_js_path):
            with open(app_js_path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            # Заменяем const BACKEND_URL = "..." на новый
            new_content = re.sub(
                r'const BACKEND_URL = "https://[a-z0-9.-]+\.trycloudflare\.com"', 
                f'const BACKEND_URL = "{new_url}"', 
                content
            )
            
            with open(app_js_path, 'w', encoding='utf-8') as f:
                f.write(new_content)
            log("Файл web/app.js успешно обновлен.")
            
    except Exception as e:
        log(f"Ошибка при обновлении конфигураций: {e}")

def run_tunnel():
    log("Запуск Quick Tunnel (TryCloudflare)...")
    log("Ожидайте получения случайного домена...")
    print("-" * 50)
    sys.stdout.flush()
    
    cmd = [EXE_NAME, "tunnel", "--url", f"http://127.0.0.1:{PORT}"]
    url_found = False
    
    try:
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1
        )
        
        for line in proc.stdout:
            raw_line = line.rstrip()
            print(raw_line)
            sys.stdout.flush()
            
            # Ищем URL туннеля в выводе
            if not url_found and "https://" in raw_line and ".trycloudflare.com" in raw_line:
                match = re.search(r'https://[a-z0-9.-]+\.trycloudflare\.com', raw_line)
                if match:
                    new_url = match.group(0)
                    url_found = True
                    update_configs(new_url)
            
    except KeyboardInterrupt:
        log("Туннель остановлен пользователем.")
        if proc: proc.terminate()
    except Exception as e:
        log(f"Ошибка при работе туннеля: {e}")

if __name__ == "__main__":
    download_if_missing()
    run_tunnel()
