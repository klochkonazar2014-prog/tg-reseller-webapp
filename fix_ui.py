import re
import os

def fix_ui():
    # 1. Fix app.js modal price
    app_js_path = 'web/app.js'
    if os.path.exists(app_js_path):
        with open(app_js_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Replace the modal price span that still has the TON icon
        content = re.sub(
            r'<span class="icon-before icon-ton tm-amount">\${dailyPrice}</span>',
            r'<span class="tm-amount">${dailyPrice} ₽</span>',
            content
        )
        
        with open(app_js_path, 'w', encoding='utf-8') as f:
            f.write(content)
        print("Updated app.js")

    # 2. Fix index.html static icons and examples
    index_html_path = 'web/index.html'
    if os.path.exists(index_html_path):
        with open(index_html_path, 'r', encoding='utf-8') as f:
            content = f.read()

        # Replace TON white icons in inputs
        content = re.sub(
            r'<span class="icon-ton-white"[^>]*></span>',
            r'<span style="position: absolute; left: 14px; top: 50%; transform: translateY(-50%); opacity: 0.6; color: #fff; font-weight: 800; font-size: 18px;">₽</span>',
            content
        )

        # Replace generic TON icons
        content = re.sub(
            r'<span class="icon-ton"></span>',
            r'<span style="font-weight: 800; margin-right: 4px;">₽</span>',
            content
        )

        # Replace example amount
        content = re.sub(
            r'<span\s+class="icon-before icon-ton tm-amount">1\.75</span>',
            r'<span class="tm-amount">402 ₽</span>',
            content
        )

        with open(index_html_path, 'w', encoding='utf-8') as f:
            f.write(content)
        print("Updated index.html")

if __name__ == '__main__':
    fix_ui()
