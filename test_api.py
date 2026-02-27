import requests
import json

URL = "http://localhost:8001/api/items?status=rented&type=gift"
try:
    resp = requests.get(URL)
    print(f"Status: {resp.status_code}")
    data = resp.json()
    items = data.get("items", [])
    print(f"Rented items count: {len(items)}")
    if items:
        print(f"First item: {items[0]['nft_name']} ({items[0]['nft_address']})")
except Exception as e:
    print(f"Error calling API: {e}")
