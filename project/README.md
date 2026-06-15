# 智检系统

安全生产社会化服务智检系统的当前稳定版说明文档。

本项目基于 `uni-app + Vue 3 + Vite` 构建前端，基于 `Node.js + Express + MySQL` 构建后端，并接入大模型完成隐患图片分析、报告生成、历史存档与基础管理后台能力。

当前稳定分支：`merge-stable-report`

相关文档：

- [稳定演示版本说明](./STABLE_VERSION.md)
- [稳定版本交接说明](./RELEASE_HANDOFF.md)
- [接口文档](./API_DOC.md)
- [设计文档](./DESIGN_DOC.md)
- [部署文档](./DEPLOY.md)
- [Docker 本地部署说明](./DEPLOY_DOCKER.md)
- [阶段开发计划](./PHASE_PLAN.md)
- [数据库结构](./database/schema.sql)

## 1. 当前版本能做什么

当前版本已经可以稳定演示以下主流程：

- 用户登录
- 企业信息录入与维护
- 隐患图片上传
- AI 文本/图片分析
- Word 报告生成
- PDF 报告导出
- 历史记录查看
- 管理员查看用户、企业、知识库、模型配置、日志等基础页面

当前最稳定的演示主线是：

1. 登录普通用户
2. 补充企业信息
3. 上传一张或多张隐患图片
4. 调用 AI 分析
5. 下载 Word / PDF 报告
6. 进入历史记录查看留档

## 2. 项目结构

```text
project/
├── README.md
├── STABLE_VERSION.md
├── RELEASE_HANDOFF.md
├── API_DOC.md
├── DESIGN_DOC.md
├── DEPLOY.md
├── database/
│   ├── schema.sql
│   ├── demo_seed.sql
│   └── migrations/
├── backend/
│   ├── server.js
│   ├── bll/
│   ├── dal/
│   ├── routes/
│   ├── middleware/
│   ├── tools/
│   └── templates/
└── uni-app-frontend/
    ├── pages/
    ├── components/
    ├── composables/
    └── common/
```

## 3. 环境要求

建议本地环境如下：

- Node.js 16 及以上
- npm
- MySQL 5.7 及以上
- Python 3
- Windows 演示环境建议安装 Microsoft Word

说明：

- Word 模板报告生成依赖后端脚本和模板文件。
- 高一致性的 PDF 导出优先依赖 Word 转 PDF。
- 如果 Word 转 PDF 不可用，系统会降级使用程序化 PDF 生成方案，但版式会弱一些。

## 4. 必要配置

后端使用 `backend/.env` 读取配置。

当前代码中实际会读取以下环境变量：

- `DB_HOST`
- `DB_PORT`
- `DB_USER`
- `DB_PASSWORD`
- `DB_NAME`
- `ARK_BASE_URL`
- `ARK_API_KEY`
- `ARK_MODEL`
- `PORT`

推荐的 `.env` 示例：

```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=你的数据库密码
DB_NAME=ai_project

ARK_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
ARK_API_KEY=你的模型API密钥
ARK_MODEL=你的模型名称

PORT=3000
```

如需 Docker 本地部署，请同时参考：

- [../.env.docker.example](../.env.docker.example)
- [DEPLOY_DOCKER.md](./DEPLOY_DOCKER.md)

## 5. 数据库初始化

### 5.1 创建数据库

先在 MySQL 中创建数据库：

```sql
CREATE DATABASE IF NOT EXISTS ai_project
DEFAULT CHARACTER SET utf8mb4
COLLATE utf8mb4_unicode_ci;
```

### 5.2 导入基础表结构

将 [database/schema.sql](./database/schema.sql) 导入数据库。

你可以使用任意一种方式：

- Navicat、DBeaver、MySQL Workbench 等图形工具
- 命令行导入

命令行示例：

```powershell
mysql -u root -p ai_project < project\database\schema.sql
```

### 5.3 可选：导入最小演示数据

仓库额外提供一个可选演示数据文件：

- [database/demo_seed.sql](./database/demo_seed.sql)

它会插入：

- 1 个管理员账号
- 1 个普通用户账号
- 1 家演示企业
- 1 个演示部门

导入命令：

```powershell
mysql -u root -p ai_project < project\database\demo_seed.sql
```

演示账号：

- 管理员：`admin_demo` / `DemoAdmin123!`
- 普通用户：`demo_user` / `DemoUser123!`

说明：

- 演示数据是可选的。
- 正式开发或正式部署不建议依赖大量人工填充的测试数据。
- 启动后端时，`schemaInit` 还会自动做一次兼容迁移检查，适合旧库升级场景。

## 6. 后端启动

进入后端目录：

```powershell
cd project\backend
```

安装依赖：

```powershell
npm install
```

启动后端：

```powershell
npm start
```

默认端口为 `3000`。

启动成功后可访问健康检查接口：

```text
http://localhost:3000/api/health
```

## 7. 前端启动

进入前端目录：

```powershell
cd project\uni-app-frontend
```

安装依赖：

```powershell
npm ci
```

启动 H5 调试：

```powershell
npm run dev:h5
```

H5 调试时请注意：

- 不要直接打开 `index.html`
- 不要用 Live Server 直接跑
- 必须通过 `npm run dev:h5` 启动，才能使用 Vite 代理转发 `/api`

构建检查：

```powershell
npm run build:h5
```

如需运行微信小程序版本：

```powershell
npm run dev:mp-weixin
```

然后使用微信开发者工具打开：

```text
uni-app-frontend/unpackage/dist/dev/mp-weixin
```

## 8. 推荐演示流程

### 8.1 普通用户演示

推荐演示顺序：

1. 使用普通用户登录
2. 补充或修改企业信息
3. 上传一张或多张隐患图片
4. 使用文字提示词触发 AI 分析
5. 查看返回结果
6. 下载 Word 报告
7. 下载 PDF 报告
8. 进入历史记录页查看留档

### 8.2 管理员演示

推荐演示顺序：

1. 使用管理员账号登录
2. 进入用户管理页查看用户
3. 进入企业数据查询页查看企业档案
4. 查看历史分析留下的报告记录
5. 进入 AI 模型配置页查看当前模型
6. 进入知识库页查看管理能力

## 9. 主要页面说明

普通用户页面：

- `pages/login/login`：登录
- `pages/process/process`：智检分析主页面
- `pages/history/history`：历史记录
- `pages/settings/settings`：服务器设置
- `pages/workbench/workbench`：工作台

管理员页面：

- `pages/admin/users`：用户管理
- `pages/admin/enterprises`：企业数据查询
- `pages/admin/knowledge`：知识库管理
- `pages/admin/model-config`：AI 模型配置
- `pages/admin/templates`：报告模板
- `pages/admin/logs`：操作日志
- `pages/admin/backup`：数据备份

## 10. 当前稳定版关键改动

这一稳定版主要包含两组核心改动。

### 10.1 报告生成稳定化

- AI 分析结果统一结构化
- Word 报告按模板生成
- PDF 报告优先由 Word 导出
- 多图上传可生成多条隐患分析
- 图片与报告记录建立关联
- 企业档案中可查看关联报告

### 10.2 管理端兼容与演示优化

- 修复旧数据库结构导致的管理员用户管理报错
- 兼容旧 `departments` 表结构
- 企业查询页增加空值与乱码兜底显示
- 补充最小演示数据脚本

## 11. 常见问题

### 11.1 `mysql` 命令无法识别

说明本机没有把 MySQL 命令行工具加入环境变量。

解决方式：

- 使用图形数据库工具导入 SQL
- 或将 MySQL 的 `bin` 目录加入系统 `PATH`

### 11.2 后端提示 `EADDRINUSE: address already in use :::3000`

说明 3000 端口已被占用。

可用命令查看并结束占用进程：

```powershell
netstat -ano | findstr :3000
taskkill /PID 进程号 /F
```

### 11.3 注册成功但登录时报服务器错误

优先检查：

- 数据库是否已正常建表
- 后端 `.env` 是否正确
- `schemaInit` 是否已完成兼容迁移
- 数据库用户表中密码字段是否已正常生成

### 11.4 AI 调用失败

优先检查：

- `ARK_API_KEY` 是否正确
- `ARK_MODEL` 是否正确
- `ARK_BASE_URL` 是否正确
- 网络是否能访问模型服务
- 后端日志中是否有模型返回错误

### 11.5 Word 正常但 PDF 排版异常

当前高质量 PDF 依赖：

- Windows
- Microsoft Word
- Python 可调用 Word 转换脚本

如果这条链路不可用，系统会降级为程序化 PDF，版式可能和 Word 不一致。

## 12. 已知限制

当前版本虽然已经适合演示和继续开发，但仍有一些限制：

- 管理后台部分页面仍偏基础能力，未全部形成完整业务闭环
- 还没有建立正式的 GitHub CI 流程
- 自动化测试覆盖仍然不足
- 生产部署文档还可以继续细化
- 正式交付前，AI 返回的法规条文仍建议人工复核

## 13. 建议的协作方式

如果团队后续继续迭代，建议采用下面的方式：

1. 以当前稳定分支为基线继续开发
2. 一个功能一个分支
3. 一个功能一个 PR
4. 每次合并前做最小冒烟测试
5. 后续逐步补充 CI、PR 模板和 issue 模板

## 14. 参考文档

- [稳定演示版本说明](./STABLE_VERSION.md)
- [稳定版本交接说明](./RELEASE_HANDOFF.md)
- [接口文档](./API_DOC.md)
- [设计文档](./DESIGN_DOC.md)
- [部署文档](./DEPLOY.md)
- [Docker 本地部署说明](./DEPLOY_DOCKER.md)
- [阶段开发计划](./PHASE_PLAN.md)
