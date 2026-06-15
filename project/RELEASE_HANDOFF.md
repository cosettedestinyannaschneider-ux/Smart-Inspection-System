# 稳定版本交接说明

本文档用于说明 `merge-stable-report` 分支当前稳定版本的功能范围、主要改动、运行方式、已知限制与后续协作建议。

## 1. 当前版本定位

当前版本可以视为一个适合课堂演示、本地联调与后续继续开发的稳定基线，重点已经放在以下两条主线上：

1. 用户端隐患图片分析与报告生成链路稳定化
2. 管理端基础组织数据兼容与演示环境可用性提升

当前分支关键提交：

- `d492fc3 stable: improve inspection report generation`
- `8de6350 stabilize admin data compatibility and add demo seed`

## 2. 当前功能框架

### 2.1 前端页面结构

前端位于 `uni-app-frontend/`，当前包含以下主要页面：

- `pages/login/login`：登录页
- `pages/process/process`：智检分析主页面
- `pages/workbench/workbench`：工作台
- `pages/history/history`：历史记录
- `pages/settings/settings`：服务器设置

管理员页面：

- `pages/admin/users`：用户管理
- `pages/admin/enterprises`：企业数据查询
- `pages/admin/knowledge`：知识库管理
- `pages/admin/model-config`：AI 模型配置
- `pages/admin/templates`：报告模板
- `pages/admin/logs`：操作日志
- `pages/admin/backup`：数据备份

### 2.2 后端结构

后端位于 `backend/`，入口文件为 `server.js`。

主要分层如下：

- `routes/`：路由拆分，当前已包含管理员用户/企业/部门路由
- `bll/`：业务逻辑层
- `dal/`：数据库访问层
- `tools/`：Word 模板填充、PDF 转换等辅助脚本
- `templates/`：报告模板文件

主要业务模块：

- `aiService.js`：统一处理 AI 调用、提示词与分析结果
- `docService.js`：将分析结果整理为正式报告数据，并生成 Word/PDF
- `userService.js`：用户、角色、权限相关逻辑
- `organizationService.js`：企业/部门组织结构逻辑
- `knowledgeService.js`：知识库相关逻辑

### 2.3 数据层结构

数据库使用 MySQL，当前数据模型主要覆盖：

- 用户 `users`
- 企业 `enterprises`
- 部门 `departments`
- 用户权限 `user_permissions`
- 历史记录 `history`
- 上传图片及报告关联表
- AI 模型配置
- 知识库与分类
- 日志与模板配置

其中 `schemaInit.js` 在后端启动时承担以下职责：

- 检查基础表结构
- 自动补齐部分缺失字段
- 对旧版本数据库执行兼容迁移

## 3. 本版本已完成的主要工作

### 3.1 报告生成链路稳定化

围绕隐患排查报告生成，已完成：

- 接入固定 Word 报告模板
- 支持将 AI 返回结果填充到模板中
- 支持导出 Word 文档
- 支持通过 Python 工具链转换为 PDF
- 将报告与历史记录、上传图片建立关联
- 优化前端分析页对返回结果与导出链接的处理

当前主流程已经具备：

1. 上传隐患图片
2. AI 分析
3. 生成结构化分析结果
4. 输出 Word/PDF 报告
5. 保存历史记录
6. 在企业档案中查看报告记录

### 3.2 管理端兼容修复

针对合并后出现的管理员端兼容问题，已完成：

- 修复旧数据库 `departments` 表缺少 `enterprise_id` 时导致的后台异常
- 自动补齐旧索引与新索引关系
- 给用户列表查询增加旧企业归属兜底逻辑
- 修复管理员打开“用户管理”时的 SQL 报错

### 3.3 企业档案展示优化

为提升演示观感，企业管理页已增加前端兜底逻辑：

- 空值统一显示为“未填写”
- 空企业名称显示为“未命名企业”
- 空图片、空分析、空报告显示统一提示
- 对明显问号/乱码占位做兜底替换

### 3.4 最小演示数据

仓库已增加可选演示数据：

- 文件：`database/demo_seed.sql`

作用：

- 快速生成可登录管理员账号
- 快速生成一个普通用户、一个企业和一个部门
- 方便本地评审与课堂演示

该演示数据为可选内容，不应替代真实部署时的数据库初始化流程。

## 4. 当前可以稳定演示的内容

目前建议作为“稳定演示内容”的部分如下：

- 登录
- 普通用户进入智检分析页
- 上传隐患图片并调用 AI 分析
- 生成并下载 Word/PDF 报告
- 查看历史记录
- 管理员查看企业档案、报告记录、用户列表
- 管理员查看 AI 模型配置、知识库、日志等基础页面

## 5. 当前已知限制

以下问题目前不影响基础演示，但还不适合称为全部完工：

- 管理后台部分页面仍偏“前端壳子”或基础 CRUD，尚未形成完整闭环
- 数据备份等模块还没有真正做成完整生产能力
- 自动化测试与 GitHub CI 仍未建立
- 仍依赖本地数据库、AI 密钥和文档环境配置
- 高质量 PDF 输出仍建议在 Windows + Microsoft Word 环境下运行

## 6. 本地运行建议

### 6.1 后端

在 `backend/` 目录完成 `.env` 配置后：

```powershell
npm start
```

启动前建议确认：

- MySQL 已启动
- 数据库已导入 `schema.sql`，或至少启动过一次后端让 `schemaInit` 自动建表
- `.env` 中数据库连接、AI Key、模型名配置正确

### 6.2 前端

在 `uni-app-frontend/` 目录：

```powershell
npm run dev:h5
```

或用于打包检查：

```powershell
npm run build:h5
```

### 6.3 演示数据

如果需要最小演示账号，可执行：

```powershell
mysql -u root -p ai_project < project\database\demo_seed.sql
```

演示账号：

- 管理员：`admin_demo` / `DemoAdmin123!`
- 普通用户：`demo_user` / `DemoUser123!`

## 7. GitHub 协作建议

当前版本已经适合作为一个稳定里程碑推送并继续迭代。建议后续流程如下：

1. 以当前稳定版本为基线建立 Pull Request
2. 后续每个功能使用单独分支开发
3. 每个功能尽量保持“小步提交、单一目标”
4. 合并前至少执行一次基础冒烟测试

建议后续建立的协作资产：

- `pull_request_template.md`
- `issue` 模板
- 基础 CI：前端构建、后端语法检查、Python 脚本检查
- 演示与部署文档分离

## 8. 下一阶段优先级建议

如果继续迭代，建议优先级如下：

1. 完善管理员后台真实功能闭环
2. 建立 GitHub CI 与基础测试流程
3. 规范 AI 输出结构与异常处理
4. 继续优化 PDF 排版一致性
5. 增加更清晰的演示/部署/联调文档

## 9. 结论

当前版本已经不再是最初“只能跑通局部功能”的状态，而是具备了一个可演示、可联调、可继续演进的稳定基础版本。

它的核心价值在于：

- 用户主链路已经跑通
- 报告生成已经具备较强的成果展示能力
- 管理端最容易卡住的兼容问题已经被修复
- 项目现在有了继续规范化推进的基础
