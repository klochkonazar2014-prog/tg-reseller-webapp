#!/usr/bin/env python3
"""
VPS Runner - Simplified version for production server
This script is used ONLY on VPS. For local development, use run.py
"""
import subprocess
import sys
import os
from dotenv import load_dotenv

load_dotenv()

def log(msg):
    print(msg)
    sys.stdout.flush()

def main():
    log("=== OctoRent Bot - VPS Mode ===")
    log("Starting all components...")
    log("")
    
    # On VPS, systemd manages services, so this script is just for manual testing
    # In production, use: sudo systemctl start octorent-*
    
    log("✅ Bot components should be managed via systemd:")
    log("   sudo systemctl start octorent-bot")
    log("   sudo systemctl start octorent-server")
    log("   sudo systemctl start octorent-parser")
    log("   sudo systemctl start octorent-buyer")
    log("")
    log("📊 Check status:")
    log("   sudo systemctl status octorent-bot")
    log("")
    log("📋 View logs:")
    log("   sudo journalctl -u octorent-bot -f")
    log("")
    log("For manual testing, components can be run directly:")
    log("   python bot.py")
    log("   python live_server.py")
    log("   python parser.py")
    log("   python auto_buyer.py")

if __name__ == "__main__":
    main()
