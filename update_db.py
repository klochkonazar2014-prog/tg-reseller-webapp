import sqlite3

def update():
    c = sqlite3.connect('database.db')
    c.execute("UPDATE orders SET status='rented', tx_hash='manual_override' WHERE id=6")
    c.commit()
    print("Order #6 updated to 'rented'")
    
if __name__ == "__main__":
    update()
