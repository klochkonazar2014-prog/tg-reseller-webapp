"""
digest_codebase.py — Однократный скрипт для «скармливания» кодовой базы AI.

Читает все ключевые файлы проекта, составляет сжатое описание архитектуры
и записывает его в support_knowledge.txt — этот файл потом вставляется
в SYSTEM_INSTRUCTION юзербота.

Запустить один раз: python digest_codebase.py
"""

import os
import json
from pathlib import Path
from groq import Groq
from dotenv import load_dotenv

load_dotenv()

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
groq_client = Groq(api_key=GROQ_API_KEY)

BASE = Path(__file__).parent

# Файлы бэкенда
BACKEND_FILES = [
    "bot.py",
    "live_server.py",
    "keyboards.py",
    "database.py",
    "auto_buyer.py",
    "background_worker.py",
]

# Файлы фронтенда
FRONTEND_FILES = [
    "web/app.js",
]

MAX_CHARS_PER_FILE = 5000  # Ограничение под Groq TPM лимит (12k токенов/мин)

def read_file_chunk(path: Path, max_chars: int) -> str:
    try:
        content = path.read_text(encoding="utf-8", errors="ignore")
        if len(content) > max_chars:
            content = content[:max_chars] + f"\n... [ОБРЕЗАНО, оригинал: {len(content)} симв.]"
        return content
    except Exception as e:
        return f"[ОШИБКА ЧТЕНИЯ: {e}]"

def build_digest(file_list: list) -> str:
    parts = []
    for fname in file_list:
        p = BASE / fname
        if not p.exists():
            print(f"⚠️  Файл не найден: {fname}")
            continue
        content = read_file_chunk(p, MAX_CHARS_PER_FILE)
        parts.append(f"### ФАЙЛ: {fname}\n```\n{content}\n```")
        print(f"✅ Прочитан: {fname} ({len(content)} симв.)")
    return "\n\n".join(parts)

def ask_ai_for_knowledge(raw_code: str, section: str) -> str:
    print(f"\n🤖 Анализируем {section}...")

    prompt = (
        f"Ты — архитектор проекта OctoRent. Ниже — {section} кодовой базы.\n"
        "Напиши ПОДРОБНОЕ техническое резюме для AI-бота поддержки. Используй формат markdown.\n\n"
        "Обязательно включи:\n"
        "1. Все API-эндпоинты с параметрами и что они возвращают\n"
        "2. Типичные ошибки которые могут возникнуть и их причины\n"
        "3. Как работает оплата (TON/USDT/xRocket/CloudTips) — пошагово\n"
        "4. Как работает аренда — весь флоу от выбора до завершения\n"
        "5. Какие переменные окружения используются и зачем\n"
        "6. Особые нюансы, неочевидные моменты, частые вопросы пользователей\n"
        "7. Связи между компонентами (как bot.py общается с live_server.py и т.д.)\n\n"
        "Пиши по-русски. Максимально детально. НЕ копируй код, только объяснения.\n\n"
        + raw_code
    )

    try:
        completion = groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2,
            max_tokens=4000  # Поднято с 2000
        )
        return completion.choices[0].message.content
    except Exception as e:
        print(f"❌ Ошибка Groq: {e}")
        return f"[ОШИБКА АНАЛИЗА {section}: {e}]"


def ask_ai_for_file(filename: str, code: str) -> str:
    """Генерирует ГЛУБОКУЮ базу знаний для поддержки, вытаскивая 'секреты' и внутреннюю логику."""
    print(f"  🤖 Вытаскиваем 'подноготную' из {filename}...")
    prompt = (
        f"Ты — технический аудитор и главный по поддержке OctoRent. Твоя задача — изучить код файла `{filename}` "
        "и вытащить из него ВСЕ 'секреты', скрытую логику и технические нюансы, о которых не знает обычный юзер, "
        "но которые ОБЯЗАН знать AI-бот поддержки, чтобы отвечать как профи.\n\n"
        "Пиши максимально конкретно, с цифрами, условиями и 'грязными' подробностями реализации. "
        "Формат — markdown, по-русски.\n\n"
        "### 🔍 Внутренняя логика и 'Секреты'\n"
        "– Как именно здесь ходят деньги/активы? Какие скрытые проверки есть?\n"
        "– Есть ли 'костыли' или особенности, которые могут вызвать вопросы у юзера?\n"
        "– Какие константы, лимиты или комиссии зашиты в этом файле? (выпиши цифры)\n\n"
        "### ⚠️ Ловушки и Частые проблемы (Технический разбор)\n"
        "– В какой строчке/условии чаще всего 'ломается' процесс для юзера?\n"
        "– Что отвечать, если юзер жалуется на конкретный шаг, описанный в этом коде?\n"
        "– Если это API — какие неочевидные ошибки оно возвращает (403, 400, 500) и что они ЗНАЧАТ на самом деле?\n\n"
        "### 💡 Инсайды для ответов пользователю\n"
        "– Расскажи 'внутреннюю кухню': почему сделано именно так?\n"
        "– Дай конкретные инструкции для бота: 'Если видишь в базе X, говори пользователю Y'.\n\n"
        "### 📈 Флоу процесса (Подробно)\n"
        "– Опиши пошагово, что происходит в коде, когда пользователь совершает действие. "
        "Где создается запись, куда летит запрос, какой статус меняется.\n\n"
        "НЕ ЛЕЙ ВОДУ. Только жесткие технические факты и инсайды из кода.\n\n"
        f"Код для вскрытия:\n```\n{code}\n```"
    )
    try:
        completion = groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.1,  # Уменьшаем температуру для более точных фактов
            max_tokens=1500
        )
        return completion.choices[0].message.content
    except Exception as e:
        print(f"  ❌ Ошибка: {e}")
        return f"[ОШИБКА: {e}]"


def main():
    import time
    all_files = BACKEND_FILES + FRONTEND_FILES
    sections = []

    print("📚 Читаем и анализируем кодовую базу OctoRent...\n")
    print(f"⚠️  Groq лимит: 12k токенов/мин. Пауза 65с каждые 3 файла.\n")

    for i, fname in enumerate(all_files):
        p = BASE / fname
        if not p.exists():
            print(f"⚠️  Файл не найден: {fname}")
            continue

        code = read_file_chunk(p, MAX_CHARS_PER_FILE)
        print(f"✅ Прочитан: {fname} ({len(code)} симв.)")

        knowledge = ask_ai_for_file(fname, code)
        sections.append(f"## 📄 {fname}\n\n{knowledge}")

        # Пауза каждые 3 файла чтобы сбросить TPM лимит
        if (i + 1) % 3 == 0 and (i + 1) < len(all_files):
            print(f"\n⏳ Пауза 65 сек для сброса TPM лимита Groq... ({i+1}/{len(all_files)} файлов готово)")
            time.sleep(65)
        else:
            time.sleep(3)  # Малая пауза между запросами

    full_knowledge = (
        "# 📚 OctoRent — База знаний для AI-поддержки\n\n"
        "_Автоматически сгенерировано `digest_codebase.py`_\n\n---\n\n"
        + "\n\n---\n\n".join(sections)
    )

    output_file = BASE / "support_knowledge.txt"
    output_file.write_text(full_knowledge, encoding="utf-8")

    print(f"\n✅ Готово! Файл: {output_file}")
    print(f"📏 Всего символов: {len(full_knowledge)}")
    print("\n--- ПРЕВЬЮ ---")
    print(full_knowledge[:600])
    print("\n...\n")
    print("💡 Скопируй содержимое support_knowledge.txt и вставь в SYSTEM_INSTRUCTION в userbot_support.py")

if __name__ == "__main__":
    main()
