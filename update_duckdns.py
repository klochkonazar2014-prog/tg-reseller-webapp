import requests
import time
import os
from dotenv import load_dotenv

# Загружаем переменные из .env
load_dotenv()

DOMAIN = os.getenv("DUCKDNS_DOMAIN", "YOUR_SUBDOMAIN") # Только имя, без .duckdns.org
TOKEN = os.getenv("DUCKDNS_TOKEN", "YOUR_TOKEN")

def update_duck_dns():
    print(f"🔄 Обновление DuckDNS для {DOMAIN}...")
    url = f"https://www.duckdns.org/update?domains={DOMAIN}&token={TOKEN}&ip="
    try:
        response = requests.get(url, timeout=10)
        if response.text == "OK":
            print(f"✅ Успешно! {DOMAIN}.duckdns.org теперь указывает на ваш текущий IP.")
        else:
            print(f"❌ Ошибка DuckDNS: {response.text}")
    except Exception as e:
        print(f"❌ Ошибка сети при обновлении DuckDNS: {e}")

if __name__ == "__main__":
    # Запускаем один раз или в цикле
    update_duck_dns()
    
    # Если хочешь, чтобы он работал постоянно в фоне на сервере:
    # while True:
    #     update_duck_dns()
    #     time.sleep(300) # Каждые 5 минут
