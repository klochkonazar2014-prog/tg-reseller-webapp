#!/bin/bash
# Quick deployment script for updating bot on VPS

set -e

echo "🚀 Deploying OctoRent Bot..."

# Pull latest changes
echo "📥 Pulling latest code from git..."
git pull origin main

# Activate virtual environment
source .venv/bin/activate

# Install/update dependencies
echo "📦 Updating dependencies..."
pip install -r requirements.txt --upgrade

# Restart services
echo "🔄 Restarting services..."
sudo systemctl restart octorent-bot
sudo systemctl restart octorent-server
sudo systemctl restart octorent-parser
sudo systemctl restart octorent-buyer

# Check status
echo "✅ Checking service status..."
sleep 2
sudo systemctl status octorent-bot --no-pager -l
sudo systemctl status octorent-server --no-pager -l

echo ""
echo "✅ Deployment complete!"
echo "📊 View logs: sudo journalctl -u octorent-bot -f"
