import os
import requests
import sys
from dotenv import load_dotenv

load_dotenv()

# DuckDNS Configuration
DUCKDNS_DOMAIN = "octorent"  # Without .duckdns.org
DUCKDNS_TOKEN = os.getenv("DUCKDNS_TOKEN", "66fe4488-685c-4e72-8c8f-6603c0a7bcee")

def log(msg):
    print(f"[DuckDNS] {msg}")
    sys.stdout.flush()

def update_ip():
    """Update DuckDNS with current public IP"""
    url = f"https://www.duckdns.org/update?domains={DUCKDNS_DOMAIN}&token={DUCKDNS_TOKEN}&ip="
    
    try:
        response = requests.get(url, timeout=10)
        if response.text.strip() == "OK":
            log(f"✅ IP updated successfully for {DUCKDNS_DOMAIN}.duckdns.org")
            return True
        else:
            log(f"❌ Failed to update IP: {response.text}")
            return False
    except Exception as e:
        log(f"❌ Error updating IP: {e}")
        return False

if __name__ == "__main__":
    log(f"Updating IP for {DUCKDNS_DOMAIN}.duckdns.org...")
    update_ip()
