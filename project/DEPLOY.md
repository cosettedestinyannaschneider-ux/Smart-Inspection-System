# 智检系统 — 部署与运维手册

## 1. 服务器环境要求

| 组件 | 最低版本 | 说明 |
|------|---------|------|
| Node.js | 16.x+ | 推荐 18 LTS 或 20 LTS |
| MySQL | 5.7+ | 推荐 8.0，InnoDB 引擎 |
| Nginx | 1.20+ | 反向代理 + 静态资源 |
| Docker | 20.10+ | 可选，容器化部署 |
| 操作系统 | Linux (Ubuntu 20.04+ / CentOS 7+) | 也支持 Windows Server |

**硬件建议**（内网 20 并发用户）：
- CPU: 4 核
- 内存: 8 GB（AI 分析时峰值）
- 磁盘: 50 GB SSD（含上传文件与报告存储）

---

## 2. 依赖清单

### 2.1 系统依赖
```bash
# Ubuntu
apt-get install -y curl git unzip nginx fontconfig

# CentOS
yum install -y curl git unzip nginx fontconfig
```

### 2.2 Node.js 全局依赖
```bash
npm install -g pm2
```

### 2.3 中文字体（PDF 生成必需）
```bash
# 将 simhei.ttf 放置到 /usr/share/fonts/ 并刷新缓存
cp simhei.ttf /usr/share/fonts/
fc-cache -fv
```

---

## 3. 多环境配置

项目通过 `.env` 文件切换环境：

### 3.1 开发环境（dev）
```ini
# backend/.env
DB_HOST=127.0.0.1
DB_USER=root
DB_PASSWORD=your_dev_password
DB_NAME=ai_project
PORT=3000
ARK_API_KEY=your_api_key
ARK_MODEL=ep-your-model-id
```

### 3.2 测试环境（test）
```ini
DB_HOST=192.168.1.100
DB_USER=ai_test
DB_PASSWORD=strong_test_password
DB_NAME=ai_project_test
PORT=3000
```

### 3.3 生产环境（prod）
```ini
DB_HOST=127.0.0.1
DB_USER=ai_prod
DB_PASSWORD=strong_prod_password_here
DB_NAME=ai_project
PORT=3000
ARK_API_KEY=prod_api_key
ARK_MODEL=ep-prod-model-id
```

> 生产环境必须使用高强度密码，`.env` 文件权限设为 `600`。

---

## 4. Nginx 配置

### 4.1 反向代理
```nginx
server {
    listen 80;
    server_name your-domain.com;  # 替换为实际域名

    # 前端静态资源
    root /opt/ai-project/uni-app-frontend/dist/h5;
    index index.html;

    # API 反向代理
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 120s;  # AI 分析超时
        client_max_body_size 50m; # 文件上传限制
    }

    # 静态文件（上传 + 报告）
    location /uploads/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
    }

    # 前端 SPA fallback
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

### 4.2 HTTPS 配置（生产必需）
```nginx
server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate     /etc/nginx/ssl/your-domain.crt;
    ssl_certificate_key /etc/nginx/ssl/your-domain.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # 同上 location 块...
}

server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$host$request_uri;
}
```

---

## 5. Docker 容器化部署

### 5.1 Dockerfile（后端）
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]
```

### 5.2 docker-compose.yml
```yaml
version: '3.8'
services:
  mysql:
    image: mysql:8.0
    environment:
      MYSQL_ROOT_PASSWORD: ${DB_PASSWORD}
      MYSQL_DATABASE: ai_project
    volumes:
      - mysql_data:/var/lib/mysql
      - ./init.sql:/docker-entrypoint-initdb.d/init.sql
    ports:
      - "3306:3306"

  backend:
    build: ./backend
    ports:
      - "3000:3000"
    environment:
      DB_HOST: mysql
      DB_USER: root
      DB_PASSWORD: ${DB_PASSWORD}
      DB_NAME: ai_project
      ARK_API_KEY: ${ARK_API_KEY}
      ARK_MODEL: ${ARK_MODEL}
    depends_on:
      - mysql
    volumes:
      - uploads_data:/app/uploads

  frontend:
    image: nginx:alpine
    ports:
      - "80:80"
    volumes:
      - ./uni-app-frontend/dist/h5:/usr/share/nginx/html
      - ./nginx.conf:/etc/nginx/conf.d/default.conf
    depends_on:
      - backend

volumes:
  mysql_data:
  uploads_data:
```

### 5.3 启动
```bash
docker-compose up -d
```

---

## 6. 服务保活（PM2）

```bash
# 启动
pm2 start server.js --name ai-backend --cwd /opt/ai-project/backend

# 开机自启
pm2 startup
pm2 save

# 查看状态
pm2 status

# 日志
pm2 logs ai-backend
```

---

## 7. 日志持久化

PM2 默认日志路径：
- 标准输出: `~/.pm2/logs/ai-backend-out.log`
- 错误输出: `~/.pm2/logs/ai-backend-error.log`

建议配置日志轮转：
```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 30
```

---

## 8. 数据库备份

### 8.1 手动备份
```bash
mysqldump -u root -p ai_project > backup_$(date +%Y%m%d).sql
```

### 8.2 自动备份（crontab）
```bash
# 每天凌晨 2 点备份，保留最近 30 天
0 2 * * * mysqldump -u root -p'password' ai_project > /opt/backups/ai_project_$(date +\%Y\%m\%d).sql
0 3 * * * find /opt/backups/ -name "*.sql" -mtime +30 -delete
```

---

## 9. 安全加固清单

- [ ] MySQL root 密码强度 ≥12 位
- [ ] 生产环境 `PORT` 不暴露到公网（仅通过 Nginx 代理）
- [ ] 防火墙：仅开放 80/443 端口
- [ ] `.env` 文件权限 `chmod 600`
- [ ] HTTPS 证书配置
- [ ] PM2 非 root 用户运行
- [ ] MySQL 应用账号最小权限（仅 `ai_project` 库权限）
- [ ] 上传目录禁止脚本执行（Nginx location 配置）

---

## 10. 微信小程序上线注意

1. 微信公众平台配置 `request` 合法域名：`https://your-domain.com`
2. 配置 `downloadFile` 合法域名：同上
3. 服务器 TLS 版本 ≥ 1.2
4. 后端所有接口必须使用 HTTPS
