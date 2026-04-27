import sqlite3
import sys

# Set encoding for Windows console
if sys.platform == 'win32':
    import codecs
    sys.stdout = codecs.getwriter('utf-8')(sys.stdout.detach())

def get_stats():
    try:
        conn = sqlite3.connect('database.db')
        conn.row_factory = sqlite3.Row
        
        print("="*40)
        print("FINANCIAL STATISTICS")
        print("="*40)
        
        # Всего заказов
        total_orders = conn.execute("SELECT COUNT(*) FROM orders").fetchone()[0]
        
        # Активные заказы (оплаченные и в процессе)
        active_orders = conn.execute("SELECT COUNT(*) FROM orders WHERE status IN ('rented', 'active', 'paid')").fetchone()[0]
        
        # Общий объем в TON (только активные)
        volume = conn.execute("SELECT SUM(total_price) FROM orders WHERE status IN ('rented', 'active', 'paid')").fetchone()[0] or 0
        
        # Общий объем по всем заказам (исторический)
        total_volume = conn.execute("SELECT SUM(total_price) FROM orders WHERE status != 'pending_payment'").fetchone()[0] or 0
        
        # Средний чек
        avg = conn.execute("SELECT AVG(total_price) FROM orders WHERE status IN ('rented', 'active', 'paid')").fetchone()[0] or 0
        
        # Реферальные
        ref_comm = conn.execute("SELECT SUM(referral_commission) FROM orders WHERE status IN ('rented', 'active', 'paid')").fetchone()[0] or 0

        print(f"Active orders: {active_orders}")
        print(f"Total active volume (TON): {volume:.2f}")
        print(f"Historical turnover: {total_volume:.2f}")
        print(f"Referral payouts: {ref_comm:.2f}")
        print(f"Net volume (no refs): {(volume - ref_comm):.2f}")
        print(f"Average order price: {avg:.2f}")
        print(f"Total orders in DB: {total_orders}")
        print("="*40)
        
    except Exception as e:
        print(f"Error: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    get_stats()
