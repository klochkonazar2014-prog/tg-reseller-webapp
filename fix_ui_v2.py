import re
import os

def fix_ui():
    # 1. Update app.js: updateTotalPrice()
    app_js_path = 'web/app.js'
    if os.path.exists(app_js_path):
        with open(app_js_path, 'r', encoding='utf-8') as f:
            app_js = f.read()

        # Update rent-btn-price to RUB conversion
        # Match: priceSpan.innerText = total !== "0.00" ? total : dp.toFixed(2);
        # Replace with calculation in RUB
        app_js = re.sub(
            r'priceSpan\.innerText = total !== "0\.00" \? total : dp\.toFixed\(2\);',
            r'const rubValMain = Math.round((parseFloat(total) + 0.06) * (FIAT_RATES.RUB || 230) * 1.05); priceSpan.innerText = rubValMain + " ₽";',
            app_js
        )

        with open(app_js_path, 'w', encoding='utf-8') as f:
            f.write(app_js)
        print("Updated app.js price script")

    # 2. Update index.html
    index_html_path = 'web/index.html'
    if os.path.exists(index_html_path):
        with open(index_html_path, 'r', encoding='utf-8') as f:
            index_html = f.read()

        # Comment out fee-notice-box
        # Pattern matches the div and its contents
        index_html = re.sub(
            r'(<div class="fee-notice-box"[\s\S]*?</div>)',
            r'<!-- \1 -->',
            index_html,
            count=1
        )

        # Fix rent-btn-price class (remove icon-ton)
        index_html = index_html.replace('id="rent-btn-price" class="icon-ton"', 'id="rent-btn-price"')

        # Apply max-height: 95vh to .bottom-sheet-content in styles
        index_html = re.sub(
            r'\.bottom-sheet-content\s*\{',
            r'.bottom-sheet-content {\n            max-height: 95vh;',
            index_html
        )

        with open(index_html_path, 'w', encoding='utf-8') as f:
            f.write(index_html)
        print("Updated index.html layout")

if __name__ == '__main__':
    fix_ui()
