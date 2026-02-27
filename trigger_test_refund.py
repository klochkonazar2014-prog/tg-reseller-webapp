import sqlite3
import os

DB_PATH = "database.db"

def setup_test_refund():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # We'll use the OWNER_WALLET from .env as a destination for the test refund
    # Usually you'd use a separate test wallet, but for logic verification this is fine.
    test_wallet = "UQAotn3cT26kUKW5wSpP9dYKxwEQQ0qffDB24HGzuBrJ5PFB"
    
    print(f"Setting up test refund for Order #6...")
    
    # Update Order #6 to be expired and have a wallet
    cursor.execute("""
        UPDATE orders 
        SET status = 'expired', 
            user_wallet = ?, 
            refund_tx_hash = NULL 
        WHERE id = 6
    """, (test_wallet,))
    
    conn.commit()
    print(f"Order #6 updated: status='expired', user_wallet='{test_wallet}', refund_tx_hash=NULL")
    
    # Also ensure there is an item linked to it if needed, 
    # but the refund worker only looks for 'expired' status and user_wallet.
    
    conn.close()

if __name__ == "__main__":
    setup_test_refund()
