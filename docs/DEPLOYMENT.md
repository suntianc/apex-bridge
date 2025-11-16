---
title: 部署指南
type: documentation
module: deployment
priority: high
environment: production
last-updated: 2025-11-16
---

# 📦 部署指南

ApexBridge 生产环境部署指南。

## 📋 部署要求

### 系统要求

- **操作系统**: Linux (Ubuntu 20.04+/CentOS 8+) 或 macOS
- **Node.js**: v16.0.0 或更高版本
- **npm**: v8.0.0 或更高版本
- **内存**: 至少 2GB RAM (推荐 4GB+)
- **磁盘**: 至少 5GB 可用空间

### 网络要求

- **端口**: 3000 (HTTP/WebSocket)
- **出站**: 访问 LLM API (OpenAI, DeepSeek 等)
- **可选**: Redis (6379), PostgreSQL (5432)

## 🚀 部署方式

### 方式1：PM2 部署 (推荐)

#### 安装 PM2

```bash
# 全局安装 PM2
npm install -g pm2

# 验证安装
pm2 --version
```

#### 部署应用

```bash
# 1. 克隆代码
git clone https://github.com/suntianc/apex-bridge.git
cd apex-bridge

# 2. 安装依赖
npm run install:all

# 3. 配置环境变量
cp env.template .env
# 编辑 .env 文件，填写 API keys

# 4. 构建应用
npm run build

# 5. 使用 PM2 启动
pm2 start dist/server.js --name apex-bridge

# 6. 保存配置
pm2 save

# 7. 设置开机启动
pm2 startup
```

#### PM2 常用命令

```bash
# 查看状态
pm2 status
pm2 list

# 查看日志
pm2 logs apex-bridge
pm2 logs apex-bridge --lines 100

# 重启应用
pm2 restart apex-bridge

# 停止应用
pm2 stop apex-bridge

# 删除应用
pm2 delete apex-bridge

# 监控资源
pm2 monit
```

#### 配置 PM2 配置文件

创建 `ecosystem.config.js`:

```javascript
module.exports = {
  apps: [
    {
      name: 'apex-bridge',
      script: './dist/server.js',
      instances: 'max',          // 使用所有CPU核心
      exec_mode: 'cluster',      // 集群模式
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      log_file: './logs/combined.log',
      out_file: './logs/out.log',
      error_file: './logs/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm Z',
      merge_logs: true,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G'
    }
  ]
};
```

启动：
```bash
pm2 start ecosystem.config.js --env production
```

### 方式2：Docker 部署

#### 创建 Dockerfile

```dockerfile
# 使用 Node.js 官方镜像
FROM node:18-alpine

# 设置工作目录
WORKDIR /app

# 复制 package 文件
COPY package*.json ./

# 安装依赖
RUN npm ci --only=production

# 复制源代码
COPY . .

# 构建应用
RUN npm run build

# 创建日志目录
RUN mkdir -p logs

# 暴露端口
EXPOSE 3000

# 启动应用
CMD ["node", "dist/server.js"]
```

#### 构建和运行

```bash
# 1. 构建镜像
docker build -t apex-bridge:latest .

# 2. 运行容器
docker run -d \
  --name apex-bridge \
  -p 3000:3000 \
  -e OPENAI_API_KEY=your-key \
  -v $(pwd)/config:/app/config \
  -v $(pwd)/logs:/app/logs \
  -v $(pwd)/data:/app/data \
  apex-bridge:latest

# 3. 查看日志
docker logs -f apex-bridge
```

#### Docker Compose

创建 `docker-compose.yml`:

```yaml
version: '3.8'

services:
  apex-bridge:
    build: .
    container_name: apex-bridge
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - REDIS_URL=redis://redis:6379
    volumes:
      - ./config:/app/config
      - ./logs:/app/logs
      - ./data:/app/data
    depends_on:
      - redis
    restart: unless-stopped
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

  redis:
    image: redis:7-alpine
    container_name: apex-redis
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    restart: unless-stopped

volumes:
  redis_data:
```

启动：
```bash
# 创建 .env 文件
echo "OPENAI_API_KEY=your-key" > .env

# 启动服务
docker-compose up -d

# 查看日志
docker-compose logs -f
```

### 方式3：Systemd 服务

#### 创建服务文件

创建 `/etc/systemd/system/apex-bridge.service`:

```ini
[Unit]
Description=ApexBridge AI Server
Documentation=https://github.com/suntianc/apex-bridge
After=network.target

[Service]
Type=simple
User=ubuntu
Group=ubuntu
WorkingDirectory=/home/ubuntu/apex-bridge
ExecStart=/usr/bin/node /home/ubuntu/apex-bridge/dist/server.js
Restart=on-failure
RestartSec=10
Environment=NODE_ENV=production
Environment=PORT=3000

# Security
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=/home/ubuntu/apex-bridge/logs
ReadWritePaths=/home/ubuntu/apex-bridge/data
ReadWritePaths=/home/ubuntu/apex-bridge/config

# Resource limits
LimitNOFILE=65536
LimitNPROC=4096

[Install]
WantedBy=multi-user.target
```

#### 管理服务

```bash
# 重新加载配置
sudo systemctl daemon-reload

# 启动服务
sudo systemctl start apex-bridge

# 查看状态
sudo systemctl status apex-bridge

# 设置开机启动
sudo systemctl enable apex-bridge

# 查看日志
sudo journalctl -u apex-bridge -f
sudo journalctl -u apex-bridge --since "1 hour ago"

# 重启服务
sudo systemctl restart apex-bridge

# 停止服务
sudo systemctl stop apex-bridge
```

## 🔐 生产环境配置

### 1. 环境变量

创建 `.env.production`:

```bash
# LLM API Keys
OPENAI_API_KEY=sk-prod-...
DEEPSEEK_API_KEY=sk-prod-...

# 配置
NODE_ENV=production
PORT=3000
HOST=0.0.0.0

# 日志
LOG_LEVEL=info
LOG_FILE=./logs/app.log

# Redis (可选)
REDIS_URL=redis://localhost:6379
```

### 2. 配置文件

创建 `config/admin-config.production.json`:

```json
{
  "general": {
    "server": {
      "port": 3000,
      "host": "0.0.0.0"
    },
    "debug": false,
    "logLevel": "warn"
  },
  "llm": {
    "provider": "openai",
    "apiKey": "${OPENAI_API_KEY}",
    "model": "gpt-4",
    "max_tokens": 2000,
    "temperature": 0.7,
    "timeout": 30000
  },
  "security": {
    "rateLimit": {
      "windowMs": 60000,
      "max": 100
    },
    "cors": {
      "origin": ["https://your-domain.com"],
      "credentials": true
    }
  },
  "abp": {
    "skills": {
      "scanInterval": 300000,
      "cacheEnabled": true
    }
  },
  "setup_completed": true
}
```

### 3. PM2 配置

创建 `ecosystem.config.js`:

```javascript
module.exports = {
  apps: [{
    name: 'apex-bridge',
    script: './dist/server.js',
    instances: require('os').cpus().length,
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    log_file: './logs/combined.log',
    out_file: './logs/out.log',
    error_file: './logs/error.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    autorestart: true,
    watch: false,
    max_memory_restart: '2G',
    min_uptime: '10s',
    max_restarts: 5,
    env_production: {
      NODE_ENV: 'production'
    }
  }]
};
```

## 📡 反向代理配置

### Nginx

```nginx
# /etc/nginx/sites-available/apex-bridge
upstream apex_bridge {
    server 127.0.0.1:3000;
}

server {
    listen 80;
    server_name your-domain.com;

    # 重定向到 HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    # SSL 配置
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;

    # 日志
    access_log /var/log/nginx/apex-bridge.access.log;
    error_log /var/log/nginx/apex-bridge.error.log;

    # 静态文件（AdminPanel）
    location /admin {
        alias /path/to/apex-bridge/admin/dist;
        try_files $uri $uri/ /admin/index.html;
    }

    # API 代理
    location /api {
        proxy_pass http://apex_bridge;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_connect_timeout 30s;
        proxy_send_timeout 30s;
        proxy_read_timeout 30s;
    }

    # WebSocket 代理
    location ~ ^/(ABPlog|log|admin)/ {
        proxy_pass http://apex_bridge;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 30s;
        proxy_send_timeout 30s;
        proxy_read_timeout 300s;  # WebSocket 需要更长时间
    }

    # Gzip 压缩
    gzip on;
    gzip_vary on;
    gzip_min_length 10240;
    gzip_types text/plain text/css text/xml text/javascript application/x-javascript application/xml+rss application/javascript application/json;

    # 安全头
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
}
```

启用：
```bash
# 创建软连接
sudo ln -s /etc/nginx/sites-available/apex-bridge /etc/nginx/sites-enabled/

# 测试配置
sudo nginx -t

# 重载配置
sudo systemctl reload nginx
```

### Apache

```apache
<VirtualHost *:80>
    ServerName your-domain.com
    Redirect permanent / https://your-domain.com/
</VirtualHost>

<VirtualHost *:443>
    ServerName your-domain.com

    # SSL
    SSLEngine on
    SSLCertificateFile /path/to/cert.pem
    SSLCertificateKeyFile /path/to/key.pem

    # 日志
    ErrorLog ${APACHE_LOG_DIR}/apex-bridge.error.log
    CustomLog ${APACHE_LOG_DIR}/apex-bridge.access.log combined

    # API 代理
    ProxyPass /api http://127.0.0.1:3000/api
    ProxyPassReverse /api http://127.0.0.1:3000/api

    # WebSocket 代理
    RewriteEngine on
    RewriteCond %{HTTP:Upgrade} websocket [NC]
    RewriteCond %{HTTP:Connection} upgrade [NC]
    RewriteRule ^/?(.*) "ws://127.0.0.1:3000/$1" [P,L]
    ProxyPass / http://127.0.0.1:3000/
    ProxyPassReverse / http://127.0.0.1:3000/

    # 超时设置
    ProxyTimeout 300
</VirtualHost>
```

启用：
```bash
# 启用必要模块
sudo a2enmod proxy proxy_http proxy_wstunnel ssl rewrite

# 重载 Apache
sudo systemctl reload apache2
```

## 🔍 监控与日志

### 应用日志

```bash
# 查看实时日志
tail -f logs/app.log

# 查看错误日志
tail -f logs/error.log

# 日志轮转（logrotate）
# 创建 /etc/logrotate.d/apex-bridge
/path/to/apex-bridge/logs/*.log {
    daily
    missingok
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 ubuntu ubuntu
    sharedscripts
    postrotate
        systemctl reload apex-bridge
    endscript
}
```

### 系统监控

```bash
# 查看进程
ps aux | grep apex-bridge

# 查看端口
netstat -tlnp | grep 3000

# 查看资源使用
top -p $(pgrep -f "node.*server.js")

# 磁盘空间
df -h /path/to/apex-bridge

# 内存使用
free -h
```

### 健康检查

```bash
# HTTP 健康检查
curl -f http://localhost:3000/api/admin/status || echo "DOWN"

# WebSocket 健康检查
wscat -c ws://localhost:3000/ABPlog/ABP_Key=your-key -w 5
```

## 🔄 CI/CD 部署

### GitHub Actions

创建 `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: |
          npm ci
          cd admin && npm ci

      - name: Build
        run: |
          npm run build
          cd admin && npm run build

      - name: Deploy
        uses: easingthemes/ssh-deploy@main
        env:
          SSH_PRIVATE_KEY: ${{ secrets.SSH_PRIVATE_KEY }}
          REMOTE_HOST: ${{ secrets.REMOTE_HOST }}
          REMOTE_USER: ${{ secrets.REMOTE_USER }}
          SOURCE: "."
          TARGET: "/home/ubuntu/apex-bridge"
          EXCLUDE: "node_modules/,.git/,logs/,data/"

      - name: Restart service
        uses: appleboy/ssh-action@master
        with:
          host: ${{ secrets.REMOTE_HOST }}
          username: ${{ secrets.REMOTE_USER }}
          key: ${{ secrets.SSH_PRIVATE_KEY }}
          script: |
            cd /home/ubuntu/apex-bridge
            npm ci --production
            pm2 restart apex-bridge || pm2 start dist/server.js --name apex-bridge
```

## ✅ 部署检查清单

### 预部署

- [ ] 代码已提交并推送到主分支
- [ ] 所有测试通过 (npm test)
- [ ] 构建成功 (npm run build)
- [ ] 配置文件已更新（生产环境配置）
- [ ] 环境变量已配置 (.env.production)
- [ ] API keys 已设置
- [ ] 备份策略已配置

### 部署中

- [ ] 停止旧版本
- [ ] 部署新版本代码
- [ ] 安装依赖 (npm ci --production)
- [ ] 运行数据库迁移（如果有）
- [ ] 启动新版本
- [ ] 验证服务状态

### 部署后

- [ ] 健康检查通过
- [ ] 日志中没有错误
- [ ] API 测试通过
- [ ] WebSocket 连接正常
- [ ] 性能监控正常
- [ ] 备份已完成

## 🔒 安全加固

### 系统安全

```bash
# 更新系统
sudo apt update && sudo apt upgrade -y

# 配置防火墙
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable

# SSH 安全
sudo sed -i 's/#PermitRootLogin yes/PermitRootLogin no/' /etc/ssh/sshd_config
sudo systemctl restart sshd
```

### 应用安全

- 使用强 API keys
- 启用速率限制
- 配置 CORS
- 设置请求大小限制
- 定期更新依赖
- 监控安全漏洞

## 📞 故障回滚

### 快速回滚

```bash
# 使用 PM2
pm2 stop apex-bridge
pm2 start dist/server.js --name apex-bridge

# 或恢复到上一个版本
git checkout HEAD~1
npm run build
pm2 restart apex-bridge
```

---

**最后更新**: 2025-11-16
**文档版本**: v1.0.1
