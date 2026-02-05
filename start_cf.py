import os
import subprocess
import requests
import sys

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

def run_tunnel():
    log("Запуск Quick Tunnel (TryCloudflare)...")
    log("Ожидайте получения случайного домена...")
    print("-" * 50)
    sys.stdout.flush()  # Force flush to ensure parent process sees output
    
    # Запуск Quick Tunnel (без имени, просто --url)
    cmd = [EXE_NAME, "tunnel", "--url", f"http://127.0.0.1:{PORT}"]
    try:
        # Используем Popen чтобы процесс работал в фоне
        # stderr=subprocess.STDOUT чтобы весь вывод шел в stdout
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1  # Line buffered
        )
        
        # Читаем и выводим строки (родительский процесс их перехватит)
        for line in proc.stdout:
            print(line.rstrip())  # Print without adding extra newline
            sys.stdout.flush()  # Force flush each line
            
    except KeyboardInterrupt:
        log("Туннель остановлен пользователем.")
        if proc:
            proc.terminate()
    except Exception as e:
        log(f"Ошибка при работе туннеля: {e}")

if __name__ == "__main__":
    download_if_missing()
    run_tunnel()
