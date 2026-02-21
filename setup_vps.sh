#!/bin/bash
# OctoRent VPS Auto-Setup Script
# Targeted for Ubuntu 24.04 (Noble Numbat) on GCP e2-micro

set -e

# --- Configuration ---
PROJECT_NAME="octorent"
INSTALL_DIR="/home/$PROJECT_NAME"
LOG_DIR="/var/log/$PROJECT_NAME"
PYTHON_VERSION="3.12"
SWAP_SIZE="2G"

echo "===================================================="
echo "🚀 Starting OctoRent VPS Setup (Ubuntu 24.04)"
echo "===================================================="

# 1. Update and basic tools
echo "📥 Updating system packages..."
sudo apt update && sudo apt upgrade -y
sudo apt install -y python$PYTHON_VERSION python$PYTHON_VERSION-venv python3-pip nginx certbot python3-certbot-nginx git ufw curl htop cron

# 2. Configure Swap (Critical for e2-micro)
if [ ! -f /swapfile ]; then
    echo "💾 Creating $SWAP_SIZE Swap file..."
    sudo fallocate -l $SWAP_SIZE /swapfile
    sudo chmod 600 /swapfile
    sudo mkswap /swapfile
    sudo swapon /swapfile
    echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
    echo "✅ Swap configured."
else
    echo "✅ Swap already exists."
fi

# 3. Create octorent user
if ! id -u $PROJECT_NAME >/dev/null 2>&1; then
    echo "👤 Creating system user: $PROJECT_NAME..."
    sudo useradd -m -s /bin/bash $PROJECT_NAME
    sudo usermod -aG sudo $PROJECT_NAME
else
    echo "✅ User $PROJECT_NAME already exists."
fi

# 4. Directory and permissions
echo "📁 Setting up directories..."
sudo mkdir -p $INSTALL_DIR
sudo mkdir -p $LOG_DIR
sudo chown -R $PROJECT_NAME:$PROJECT_NAME $INSTALL_DIR
sudo chown -R $PROJECT_NAME:$PROJECT_NAME $LOG_DIR

# 5. Virtual Environment and Requirements
echo "🐍 Setting up Python Virtual Environment..."
sudo -u $PROJECT_NAME python$PYTHON_VERSION -m venv $INSTALL_DIR/.venv
sudo -u $PROJECT_NAME $INSTALL_DIR/.venv/bin/pip install --upgrade pip
if [ -f "$INSTALL_DIR/requirements.txt" ]; then
    echo "📦 Installing requirements..."
    sudo -u $PROJECT_NAME $INSTALL_DIR/.venv/bin/pip install -r $INSTALL_DIR/requirements.txt
fi

# 5.1 Setup DuckDNS Auto-Update (Cron)
echo "🦆 Setting up DuckDNS auto-update..."
CRON_JOB="*/5 * * * * cd $INSTALL_DIR && $INSTALL_DIR/.venv/bin/python update_duckdns.py >> $LOG_DIR/duckdns.log 2>&1"
(sudo -u $PROJECT_NAME crontab -l 2>/dev/null; echo "$CRON_JOB") | sudo -u $PROJECT_NAME crontab -

# 6. Systemd Services
echo "⚙️  Generating Systemd services..."

services=("bot" "server" "parser" "buyer")
commands=("bot.py" "live_server.py" "parser.py" "auto_buyer.py")

for i in "${!services[@]}"; do
    cat <<EOF | sudo tee /etc/systemd/system/octorent-${services[$i]}.service
[Unit]
Description=OctoRent ${services[$i]^}
After=network.target

[Service]
User=$PROJECT_NAME
Group=$PROJECT_NAME
WorkingDirectory=$INSTALL_DIR
EnvironmentFile=$INSTALL_DIR/.env
ExecStart=$INSTALL_DIR/.venv/bin/python ${commands[$i]}
Restart=always
RestartSec=5
StandardOutput=append:$LOG_DIR/${services[$i]}.log
StandardError=append:$LOG_DIR/${services[$i]}.log

[Install]
WantedBy=multi-user.target
EOF
done

# 7. Nginx Configuration
echo "🌐 Configuring Nginx..."
cat <<EOF | sudo tee /etc/nginx/sites-available/$PROJECT_NAME
server {
    listen 80;
    server_name _; 

    # Security Headers
    add_header X-Frame-Options "SAMEORIGIN";
    add_header X-XSS-Protection "1; mode=block";
    add_header X-Content-Type-Options "nosniff";
    server_tokens off;

    location / {
        root $INSTALL_DIR/web;
        index index.html;
        try_files \$uri \$uri/ /index.html;
    }

    location /api {
        proxy_pass http://127.0.0.1:8001; # live_server.py port (8001 as in file)
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        
        # Security: Limit body size
        client_max_body_size 10M;
    }
    
    # Large headers for TON Connect
    proxy_buffer_size 128k;
    proxy_buffers 4 256k;
    proxy_busy_buffers_size 256k;
}
EOF

sudo ln -sf /etc/nginx/sites-available/$PROJECT_NAME /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl restart nginx

# 8. Firewall
echo "🛡️  Configuring Firewall..."
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
echo "y" | sudo ufw enable

echo "===================================================="
echo "✅ VPS SETUP COMPLETE!"
echo "===================================================="
echo "Next steps:"
echo "1. Put your code into $INSTALL_DIR"
echo "2. Create $INSTALL_DIR/.env file"
echo "3. Run certbot: sudo certbot --nginx -d YOUR_DOMAIN"
echo "4. Reload services: sudo systemctl daemon-reload"
echo "5. Start all: sudo systemctl enable --now octorent-*"
echo "===================================================="
