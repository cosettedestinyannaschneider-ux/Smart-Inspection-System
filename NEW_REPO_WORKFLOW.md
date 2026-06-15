# 新仓库建立与 GitHub 工作流方案

## 1. 基线选择

当前建议直接以 `merge-stable-report` 作为新仓库基线，并将其推送为新仓库的 `main`。

原因：

- 当前稳定能力不在旧 `main`，而在 `merge-stable-report`
- 报告生成主链路、演示数据、兼容修复和稳定版文档已集中在这个分支
- 新仓库可以从第一天就以“可演示、可开发、可交接”的状态开始，而不是继续背旧仓库的历史分叉负担

## 2. 新仓库创建步骤

1. 在 GitHub 新建空仓库。
2. 不要勾选初始化 README、`.gitignore`、License。
3. 本地新增远端并推送稳定分支为新仓库主线：

```powershell
git -C E:\University\Project\project1.0 remote add teamrepo https://github.com/<你的组织或用户名>/<新仓库名>.git
git -C E:\University\Project\project1.0 push teamrepo merge-stable-report:main
```

4. 在 GitHub 仓库设置中确认默认分支为 `main`。

## 3. 推荐分支策略

- `main`：始终保持可演示、可回归、可交付
- `develop`：可选，用于并行合并多个小功能后再进入 `main`
- `feature/<模块>-<事项>`：新功能
- `fix/<模块>-<事项>`：缺陷修复
- `docs/<主题>`：文档整理

推荐规则：

- 每个 Issue 对应一个分支
- 每个分支只做一类事情
- 合并到 `main` 前必须走 Pull Request
- 每次 PR 至少附带一段“验证记录”

## 4. 密钥与敏感配置处理

项目中最敏感的两类信息：

- MySQL 连接密码
- AI 平台 API Key

这些信息都不能进入 Git 仓库，也不能写死在前端代码或 GitHub Actions 中。

当前处理方式：

- 后端运行配置通过 `project/backend/.env` 注入
- Docker 本地运行数据库参数通过仓库根目录 `.env` 注入
- 仓库只保留模板文件：
  - `project/backend/.env.example`
  - `.env.docker.example`

团队规范：

1. 新成员克隆仓库后，先复制模板：

```powershell
Copy-Item E:\University\Project\project1.0\project\backend\.env.example E:\University\Project\project1.0\project\backend\.env
Copy-Item E:\University\Project\project1.0\.env.docker.example E:\University\Project\project1.0\.env
```

2. 再按个人环境填写真实数据库和 AI 配置。
3. `.gitignore` 已忽略 `.env` 和 `.env.*`，禁止提交真实密钥。

## 5. GitHub Actions 方案

仓库已补充 `.github/workflows/ci.yml`，默认执行三类检查：

- 后端依赖安装与语法检查
- 前端依赖安装与 H5 构建
- Docker 镜像构建检查

为什么 CI 不直接跑真实数据库和 AI：

- 数据库密码和 AI Key 不应暴露给公开仓库
- AI 调用存在费用和外部不稳定因素
- 当前更适合先保证“代码结构正确、前端可构建、容器可构建”

后续可以分两层扩展：

1. 公共 CI：
   只做不依赖真实密钥的检查，适合所有 PR
2. 私有环境验证：
   在组织私有仓库 Secrets 中配置测试数据库与测试 Key 后，再加集成测试工作流

## 6. GitHub Secrets 建议

如果后续需要在 GitHub 上做更深的自动化验证，建议只在“组织私有仓库”或受控仓库里配置：

- `TEST_DB_HOST`
- `TEST_DB_PORT`
- `TEST_DB_USER`
- `TEST_DB_PASSWORD`
- `TEST_DB_NAME`
- `TEST_ARK_BASE_URL`
- `TEST_ARK_API_KEY`
- `TEST_ARK_MODEL`

注意：

- 不建议在公开仓库里直接开放真实生产库或正式 API Key
- 最好准备独立测试库和专用测试 Key
- AI 测试建议增加调用频次控制，避免浪费额度

## 7. Docker 方案

仓库已补充 `compose.yaml`，用于本地开发快速启动：

- `mysql`：MySQL 8.0，自动导入 `schema.sql` 和 `demo_seed.sql`
- `backend`：Node.js + Python 运行环境
- `frontend`：构建 H5 并用 Nginx 提供静态站点

本地启动方式：

```powershell
docker compose up -d --build
```

默认访问地址：

- 前端 H5：`http://localhost:8080`
- 后端：`http://localhost:3000`
- MySQL：`localhost:3306`

说明：

- Docker 环境下 Word 转 PDF 的 Microsoft Word 自动化不可用
- 但系统仍可生成 Word，并通过 `pdfkit` 走降级 PDF 方案
- 正式演示若需要高一致性 PDF，建议保留 Windows + Word 的本地演示机方案

## 8. 分阶段推进建议

建议后续工作继续按阶段推进，每个阶段单独建 Issue、分支、PR、测试记录。

### 阶段 1：新仓库基础设施稳定

- 推送新仓库
- 配置 Branch protection
- 开启 GitHub Actions
- 建立标签：`feature`、`bug`、`docs`、`phase-a`、`phase-b` 等
- 团队统一 `.env` 使用方式

### 阶段 2：配置安全与工程化

- 完善 AI 模型配置安全整改
- 清理潜在敏感配置落库风险
- 补充开发环境和演示环境说明
- 如有需要，增加 Docker 专用后端说明

### 阶段 3：管理员端真实联调

- 模型配置
- 知识库
- 操作日志
- 报告模板
- 数据备份
- 工作台统计

### 阶段 4：普通用户端增强

- UI 优化
- 权限控制细化
- 企业数据隔离复核
- H5 与小程序双端回归

### 阶段 5：质量体系建设

- 增加最小化集成测试
- 建立版本发布节奏
- 补充回归清单
- 建立里程碑和发布说明模板

## 9. Branch Protection 建议

建议在 GitHub `main` 分支开启：

- Require a pull request before merging
- Require status checks to pass before merging
- Require branches to be up to date before merging
- Restrict direct pushes to `main`

如果团队规模较小，至少保证：

- 不直接在 `main` 上开发
- PR 通过 CI 后再合并

## 10. 每一步都可回溯的执行规则

后续每次改动都按下面流程执行：

1. 创建 Issue
2. 从 `main` 拉出功能分支
3. 只做一个明确目标
4. 本地验证
5. 提交 PR
6. CI 通过
7. 合并到 `main`
8. 在 PR 或阶段文档中记录测试结果和影响范围

这样可以保证：

- 每一项修改都能定位来源
- 每一步都能回滚
- 每个阶段都能独立验收
- 团队协作时不容易互相覆盖
