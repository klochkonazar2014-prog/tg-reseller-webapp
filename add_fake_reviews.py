import sqlite3
import random

def add_fake_reviews():
    try:
        conn = sqlite3.connect('database.db')
        conn.row_factory = sqlite3.Row
        
        # Находим 3 случайных подарка
        gifts = conn.execute("SELECT title FROM items WHERE type = 'gift' LIMIT 50").fetchall()
        if not gifts:
            print("Подарки не найдены в базе!")
            return
            
        selected_gifts = random.sample(gifts, min(3, len(gifts)))
        
        review_texts = [
            "Все супер! Подарок прилетел моментально, Fragment сразу подхватил. Буду брать еще! 🔥",
            "Лучший сервис для аренды. Все четко, быстро и без лишних вопросов. Рекомендую всем! 💎",
            "Очень удобно, что можно арендовать на пару дней. Все работает как часы, спасибо поддержке за помощь! ✅"
        ]
        
        user_ids = [7868560541, 123456789, 987654321]
        
        for i, gift in enumerate(selected_gifts):
            conn.execute("""
                INSERT INTO reviews (user_id, nft_name, review_text, rating, created_at, is_approved)
                VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, 1)
            """, (user_ids[i], gift['title'], review_texts[i], 5))
            
        conn.commit()
        print(f"Успешно добавлено 3 отзыва для: {[g['title'] for g in selected_gifts]}")
        
    except Exception as e:
        print(f"Ошибка: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    add_fake_reviews()
