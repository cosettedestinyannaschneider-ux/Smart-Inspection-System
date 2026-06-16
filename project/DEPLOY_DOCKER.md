# Docker 本地部署说明

## 1. 目标

本方案用于团队本地快速拉起一套可开发、可演示的基础环境：

- MySQL 数据库
- Node.js 后端
- H5 前端

适用场景：

- 新成员入组
- 本地联调
- 教学/答辩前快速恢复环境

## 2. 前置条件

- 已安装 Docker Desktop
- 已启用 `docker compose`

## 3. 第一次启动前准备

### 3.1 复制 Docker 环境变量模板

```powershell
Copy-Item E:\University\Project\project1.0\.env.docker.example E:\University\Project\project1.0\.env
```

### 3.2 复制后端环境变量模板

```powershell
Copy-Item E:\University\Project\project1.0\project\backend\.env.example E:\University\Project\project1.0\project\backend\.env
```

### 3.3 填写真实 AI 配置

编辑 `project/backend/.env`：

```env
ARK_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
ARK_API_KEY=你的真实API密钥
ARK_MODEL=你的真实模型名称
```

说明：

- Docker 本地数据库账号密码来自仓库根目录 `.env`
- 后端 AI 配置来自 `project/backend/.env`
- 两者都不会进入 Git
- `compose.yaml` 不再内置默认数据库密码；如果 `.env` 未填写，`docker compose` 会直接报错提示

### 3.4 填写数据库密码

编辑仓库根目录 `.env`，至少补齐：

```env
MYSQL_ROOT_PASSWORD=你自己的本地 root 密码
MYSQL_PASSWORD=你自己的本地应用库密码
```

建议：

- 不要继续使用示例占位值
- 开发、演示、正式环境使用不同密码
- 不要把根目录 `.env` 或 `project/backend/.env` 打包、截图或提交到仓库

## 4. 启动命令

```powershell
docker compose up -d --build
```

## 5. 默认服务地址

- 前端 H5：`http://localhost:8080`
- 后端接口：`http://localhost:3000`
- MySQL：`localhost:3306`

## 6. 默认初始化内容

首次启动时，MySQL 会自动执行：

- `project/database/schema.sql`
- `project/database/demo_seed.sql`

可直接使用演示账号：

- 管理员：`admin_demo / DemoAdmin123!`
- 普通用户：`demo_user / DemoUser123!`

## 7. 常用命令

查看容器状态：

```powershell
docker compose ps
```

查看日志：

```powershell
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs -f mysql
```

停止服务：

```powershell
docker compose down
```

停止并删除数据库卷：

```powershell
docker compose down -v
```

## 8. 已知限制

- Linux 容器内不能调用 Microsoft Word 自动转 PDF
- 因此 Docker 环境中 PDF 将回退到程序化生成方式
- 如果答辩或正式演示必须保持 Word 与 PDF 版式高度一致，建议在 Windows 本机运行后端并安装 Microsoft Word

## 9. 推荐使用方式

- 日常开发：优先用 Docker 拉起 MySQL，前后端可继续本机运行
- 全新环境恢复：使用 Docker 全量启动
- 高质量 PDF 演示：保留 Windows 本地后端运行方式
