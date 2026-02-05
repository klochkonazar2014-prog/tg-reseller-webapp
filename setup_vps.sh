#!/bin/bash
# VPS Setup Script for OctoRent Bot
# Tested on Ubuntu 22.04 LTS

set -e  # Exit on error

echo "========================================="
echo "  OctoRent Bot - VPS Setup Script"
echo "========================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() {
    echo -e "${GREEN}[✓]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[!]${NC} $1"
}

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    warn "This script should be run as root (use sudo)"
    exit 1
fi

# Update system
log "Updating system packages..."
apt-get update -qq
apt-get upgrade -y -qq

# Install Python 3.11+
log "Installing Python 3.11..."
apt-get install -y software-properties-common
add-apt-repository -y ppa:deadsnakes/ppa
apt-get update -qq
apt-get install -y python3.11 python3.11-venv python3.11-dev python3-pip git nginx

# Create bot user
log "Creating bot user..."
if ! id "octorent" &>/dev/null; then
    useradd -m -s /bin/bash octorent
    log "User 'octorent' created"
else
    warn "User 'octorent' already exists"
fi

# Clone repository
BOT_DIR="/home/octorent/bot"
log "Setting up bot directory..."
if [ ! -d "$BOT_DIR" ]; then
    warn "Please clone your bot repository manually to $BOT_DIR"
    warn "Example: git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git $BOT_DIR"
    warn "Then run this script again"
    exit 1
fi

cd "$BOT_DIR"

# Create virtual environment
log "Creating Python virtual environment..."
python3.11 -m venv .venv
source .venv/bin/activate

# Install dependencies
log "Installing Python dependencies..."
pip install --upgrade pip
pip install -r requirements.txt

# Setup .env file
if [ ! -f ".env" ]; then
    warn "No .env file found. Please create one from .env.example"
    warn "cp .env.example .env"
    warn "Then edit .env with your tokens and configuration"
fi

# Set permissions
log "Setting file permissions..."
chown -R octorent:octorent "$BOT_DIR"
chmod +x "$BOT_DIR/run.py"

# Create systemd services
log "Creating systemd services..."

# Bot service
cat > /etc/systemd/system/octorent-bot.service << 'EOF'
[Unit]
Description=OctoRent Telegram Bot
After=network.target

[Service]
Type=simple
User=octorent
WorkingDirectory=/home/octorent/bot
Environment="PATH=/home/octorent/bot/.venv/bin"
ExecStart=/home/octorent/bot/.venv/bin/python bot.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# Live Server service
cat > /etc/systemd/system/octorent-server.service << 'EOF'
[Unit]
Description=OctoRent API Server
After=network.target

[Service]
Type=simple
User=octorent
WorkingDirectory=/home/octorent/bot
Environment="PATH=/home/octorent/bot/.venv/bin"
ExecStart=/home/octorent/bot/.venv/bin/python live_server.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# Parser service
cat > /etc/systemd/system/octorent-parser.service << 'EOF'
[Unit]
Description=OctoRent Market Parser
After=network.target octorent-server.service

[Service]
Type=simple
User=octorent
WorkingDirectory=/home/octorent/bot
Environment="PATH=/home/octorent/bot/.venv/bin"
ExecStart=/home/octorent/bot/.venv/bin/python parser.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# Auto-buyer service
cat > /etc/systemd/system/octorent-buyer.service << 'EOF'
[Unit]
Description=OctoRent Auto Buyer
After=network.target octorent-server.service

[Service]
Type=simple
User=octorent
WorkingDirectory=/home/octorent/bot
Environment="PATH=/home/octorent/bot/.venv/bin"
ExecStart=/home/octorent/bot/.venv/bin/python auto_buyer.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# Reload systemd
log "Reloading systemd daemon..."
systemctl daemon-reload

# Enable services
log "Enabling services..."
systemctl enable octorent-bot.service
systemctl enable octorent-server.service
systemctl enable octorent-parser.service
systemctl enable octorent-buyer.service

# Configure nginx (optional)
log "Configuring nginx reverse proxy..."
cat > /etc/nginx/sites-available/octorent << 'EOF'
server {
    listen 80;
    server_name _;

    location / {
        proxy_pass http://127.0.0.1:8001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
EOF

ln -sf /etc/nginx/sites-available/octorent /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl restart nginx

echo ""
echo "========================================="
log "Setup complete!"
echo "========================================="
echo ""
echo "Next steps:"
echo "1. Edit .env file: nano $BOT_DIR/.env"
echo "2. Start services:"
echo "   sudo systemctl start octorent-bot"
echo "   sudo systemctl start octorent-server"
echo "   sudo systemctl start octorent-parser"
echo "   sudo systemctl start octorent-buyer"
echo ""
echo "3. Check status:"
echo "   sudo systemctl status octorent-bot"
echo ""
echo "4. View logs:"
echo "   sudo journalctl -u octorent-bot -f"
echo ""
echo "Your server IP: $(curl -s ifconfig.me)"
echo "========================================="
