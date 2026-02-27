import sqlite3
import time
import json

def check():
    conn = sqlite3.connect('database.db')
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    now = time.time()
    print(f"Current time: {now} ({time.ctime(now)})")
    
    # Check rented items
    cursor.execute("SELECT id, nft_address, status, rent_ends_at, title FROM items WHERE status = 'rented'")
    rented_items = cursor.fetchall()
    print(f"\nRented items in 'items' table: {len(rented_items)}")
    for item in rented_items:
        ends = item['rent_ends_at']
        remaining = ends - now if ends else -1
        print(f"  - Item #{item['id']} {item['title']}: ends at {ends} ({time.ctime(ends) if ends else 'N/A'}). Remaining: {remaining}s")
    
    # Check orders status
    cursor.execute("SELECT id, status, refund_tx_hash, user_wallet, nft_address FROM orders WHERE status IN ('rented', 'active', 'expired')")
    orders = cursor.fetchall()
    print(f"\nOrders with active/expired status: {len(orders)}")
    for o in orders:
        print(f"  - Order #{o['id']} for {o['nft_address'][:10]}: status={o['status']}, refund_tx_hash={o['refund_tx_hash']}, wallet={o['user_wallet']}")

    conn.close()

if __name__ == '__main__':
    check()
