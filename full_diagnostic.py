
import sqlite3
import os
import requests
import json
from dotenv import load_dotenv

load_dotenv()

def diagnostic():
    db_path = 'database.db'
    if not os.path.exists(db_path):
        print("❌ Database not found at database.db")
        return

    print("--- 📊 Последние 3 заказа ---")
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cur = conn.execute("SELECT id, status, nft_name, total_price, created_at, payment_gateway FROM orders ORDER BY id DESC LIMIT 3")
    for row in cur.fetchall():
        print(f"ID: {row['id']} | Статус: {row['status']} | Предмет: {row['nft_name']} | Метод: {row['payment_gateway']}")

    print("\n--- 🔧 Проверка окружения ---")
    owner = os.getenv("OWNER_WALLET")
    buyer_token = os.getenv("MARKETAPP_TOKEN_BUYER")
    print(f"OWNER_WALLET: {'✅ Задан' if owner else '❌ ОТСУТСТВУЕТ'}")
    print(f"MARKETAPP_TOKEN_BUYER: {'✅ Задан' if buyer_token else '❌ ОТСУТСТВУЕТ'}")
    
    print("\n--- 🛡️ Проверка баланса кошелька (Toncenter) ---")
    api_key = os.getenv("TONCENTER_API_KEY", "")
    if owner:
        try:
            url = f"https://toncenter.com/api/v2/getAddressBalance?address={owner}"
            if api_key: url += f"&api_key={api_key}"
            resp = requests.get(url, timeout=10).json()
            if resp.get('ok'):
                balance = int(resp['result']) / 1e9
                print(f"Баланс кошелька бота: {balance} TON")
                if balance < 0.5:
                    print("⚠️ ВНИМАНИЕ: Низкий баланс! Может не хватить на газ/аренду.")
            else:
                print(f"❌ Не удалось проверить баланс: {resp}")
        except Exception as e:
            print(f"❌ Ошибка при проверке баланса: {e}")

    conn.close()

if __name__ == "__main__":
    diagnostic()
