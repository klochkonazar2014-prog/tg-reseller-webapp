import sys
import os
import asyncio
import aiosqlite

# Добавляем текущую директорию в пути, чтобы найти базу данных
sys.path.append(os.getcwd())
try:
    import database as db
except ImportError:
    # Фоллбек если скрипт в поддиректории
    sys.path.append(os.path.join(os.getcwd(), ".."))
    import database as db

async def cleanup():
    # Мы просто удаляем все из таблицы items.
    # Новый парсер (с пагинацией) заполнит всё заново и правильно.
    print(f"--- Очистка базы данных OctoRent ---")
    print(f"Путь к БД: {db.DB_PATH}")
    
    if not os.path.exists(db.DB_PATH):
        print("❌ Файл базы данных не найден!")
        return

    try:
        async with aiosqlite.connect(db.DB_PATH) as conn:
            print("Удаление старых данных из таблицы items...")
            await conn.execute("DELETE FROM items")
            print("Удаление истории заказов (кроме активных арен)...")
            await conn.execute("DELETE FROM orders WHERE status != 'rented'")
            await conn.commit()
            print("✅ База данных успешно очищена.")
            print("Теперь запустите парсер (parser.py), чтобы он загрузил свежие и правильные данные.")
    except Exception as e:
        print(f"❌ Ошибка при очистке: {e}")

if __name__ == "__main__":
    asyncio.run(cleanup())
