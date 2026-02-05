import subprocess
import time
import sys
import os
import re
from dotenv import load_dotenv

load_dotenv()
OWNER_WALLET_ADDR = os.getenv("OWNER_WALLET")

# DuckDNS Domain (stable, works in Russia)
PERMANENT_URL = "https://octorent.duckdns.org"

def log(msg):
    print(msg)
    sys.stdout.flush()

def update_web_config(url):
    log(f"Updating web config with URL: {url}")
    app_js_path = os.path.join("web", "app.js")
    index_html_path = os.path.join("web", "index.html")
    
    if os.path.exists(app_js_path):
        with open(app_js_path, "r", encoding="utf-8", errors="ignore") as f:
            content = f.read()
        # Заменяем любой BACKEND_URL на наш постоянный
        content = re.sub(r'const BACKEND_URL = ".*?";', f'const BACKEND_URL = "{url}";', content)
        with open(app_js_path, "w", encoding="utf-8") as f:
            f.write(content)
            
    if os.path.exists(index_html_path):
        with open(index_html_path, "r", encoding="utf-8", errors="ignore") as f:
            html = f.read()
        
        # Update version for app.js and style.css to force cache busting
        new_v = int(time.time())
        
        # Update app.js version
        if 'app.js?v=' in html:
            html = re.sub(r'app.js\?v=[0-9.]+', f'app.js?v={new_v}', html)
        else:
            html = html.replace('app.js', f'app.js?v={new_v}')
            
        # Update style.css version
        if 'style.css?v=' in html:
            html = re.sub(r'style.css\?v=[0-9.]+', f'style.css?v={new_v}', html)
        else:
            html = html.replace('style.css', f'style.css?v={new_v}')
            
        with open(index_html_path, "w", encoding="utf-8") as f:
            f.write(html)
            
    log("Pushing updates to GitHub...")
    web_dir = os.path.abspath("web")
    try:
        # Using a single string command to avoid process overhead
        cmd = 'git add . && git commit -m "Update domain to arendabot.pp.ua" && git push origin main --force'
        subprocess.run(cmd, cwd=web_dir, shell=True, timeout=60)
        log("GitHub push successful.")
    except Exception as e:
        log(f"GitHub Sync Error: {e}")

def run_all():
    log("--- Starting OctoRent Bot System (Demo Mode) ---")
    
    # 1. Start Cloudflare Tunnel (Quick Tunnel)
    log(f"[1/4] Starting Cloudflare Tunnel...")
    cf_proc = subprocess.Popen(
        [sys.executable, "start_cf.py"], 
        stdout=subprocess.PIPE, 
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1
    )
    
    found_url = None
    log("Waiting for Quick Tunnel URL...")
    
    max_retries = 40
    retry_count = 0
    while retry_count < max_retries:
        line = cf_proc.stdout.readline()
        if line:
            line_stripped = line.strip()
            if line_stripped: print(f"[CF] {line_stripped}")
            
            match = re.search(r'https://(?!api\.)[a-zA-Z0-9-]+\.trycloudflare\.com', line)
            if match:
                found_url = match.group(0)
                log(f"SUCCESS! URL: {found_url}")
                break
        retry_count += 1
        time.sleep(0.3)
        
    if found_url:
        update_web_config(found_url)
    else:
        log("WARNING: Tunnel URL not detected. Using PERMANENT_URL.")

    # 2. Start Live Server
    log(f"[2/4] Starting Live Server (Port 8001)...")
    server_proc = subprocess.Popen([sys.executable, "live_server.py"], bufsize=1)
    
    # 3. Start Telegram Bot
    log(f"[3/4] Starting Telegram Bot...")
    bot_proc = subprocess.Popen([sys.executable, "bot.py"], bufsize=1)

    # 4. Start Parser
    log(f"[4/4] Starting Parser...")
    parser_proc = subprocess.Popen([sys.executable, "parser.py"], bufsize=1)

    # 5. Start Auto-Buyer
    log(f"[5/5] Starting Auto-Buyer...")
    buyer_proc = subprocess.Popen([sys.executable, "auto_buyer.py"], bufsize=1)

    log("\nALL SYSTEMS GO!")
    log(f"Web App: {found_url if found_url else PERMANENT_URL}")

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        log("\nStopping...")
        server_proc.terminate()
        bot_proc.terminate()
        parser_proc.terminate()
        buyer_proc.terminate()
        cf_proc.terminate()
        log("All processes terminated.")

if __name__ == "__main__":
    run_all()
