# 新仓库 GitHub 工作流方案

## 1. 当前仓库状态

新仓库已经建立完成：

- 仓库：`cosettedestinyannaschneider-ux/Smart-Inspection-System`
- 默认分支：`main`
- 已启用 GitHub Actions CI
- 已配置 PR 模板与 Issue 模板

当前主线约束：

- `main` 必须保持可构建、可演示、可回归
- 后续功能、修复、文档整理都通过分支和 Pull Request 进入 `main`
- 每个阶段尽量拆成小 PR，便于审查、定位和回滚

## 2. 推荐分支策略

- `main`：始终保持可演示、可回归、可交付
- `develop`：可选，用于并行合并多个小功能后再进入 `main`
- `feature/<模块>-<事项>`：新功能
- `fix/<模块>-<事项>`：缺陷修复
- `docs/<主题>`：文档整理
- `codex/<阶段>-<主题>`：阶段性改造或智能代理协作分支

推荐规则：

- 每个 Issue 对应一个分支
- 每个分支只做一类事情
- 合并到 `main` 前必须走 Pull Request
- 每次 PR 至少附带一段“验证记录”
- 每个阶段都要同步更新相关文档和测试记录

## 3. 密钥与敏感配置处理

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

## 4. 模板复制方式

```powershell
Copy-Item E:\University\Project\project1.0\project\backend\.env.example E:\University\Project\project1.0\project\backend\.env
Copy-Item E:\University\Project\project1.0\.env.docker.example E:\University\Project\project1.0\.env
```

再按个人环境填写真实数据库和 AI 配置。

说明：

- `.env.docker.example` 与 `project/backend/.env.example` 只保留占位值
- `compose.yaml` 不再内置默认数据库密码
- 任何真实密码、真实 API Key、真实库地址都不得进入 Git 历史

## 5. GitHub Actions 方案

仓库当前 `.github/workflows/ci.yml` 默认执行三类检查：

- 后端依赖安装与语法检查
- 前端依赖安装与 H5 构建
- Docker 镜像构建检查

为什么 CI 不直接跑真实数据库和 AI：

- 数据库密码和 AI Key 不应暴露给公开仓库
- AI 调用存在费用和外部不稳定因素
- 当前更适合先保证“代码结构正确、前端可构建、容器可构建”

后续可以分两层扩展：

1. 公共 CI：只做不依赖真实密钥的检查，适合所有 PR
2. 私有环境验证：在受控仓库 Secrets 中配置测试数据库与测试 Key 后，再加集成测试工作流

## 6. GitHub 上的小 PR 测试流程

建议先用低风险内容验证整个 GitHub 流程，例如：

1. 更新文档或环境变量模板
2. 创建独立分支
3. 本地运行最小验证
4. 推送分支
5. 创建 Pull Request
6. 等待 CI 通过
7. 完成审查后合并

推荐命名：

- 分支：`codex/phase0-config-baseline`
- PR 标题：`chore: establish repository config baseline`

这个测试 PR 不修改数据库结构、不修改业务接口，只验证：

- 分支策略是否可用
- CI 是否正常触发
- PR 模板是否正常承接
- 团队是否能按统一节奏审查和合并

## 7. GitHub Secrets 建议

如果后续需要在 GitHub 上做更深的自动化验证，建议只在受控仓库里配置：

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

## 8. Docker 方案

仓库已补充 `compose.yaml`，用于本地开发快速启动：

- `mysql`：MySQL 8.0，自动导入 `schema.sql` 和 `demo_seed.sql`
- `backend`：Node.js + Python 运行环境
- `frontend`：构建 H5 并提供静态站点

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

## 9. 分阶段推进建议

建议后续工作继续按阶段推进，每个阶段单独建 Issue、分支、PR、测试记录。

### Phase 0：仓库治理基线

- 校正文档中的旧分支描述
- 规范 `.env.example` 与 Docker 模板
- 确认 PR/CI 流程可跑通

### Phase 1：用户态认证与核心接口收口

- 建立统一登录态
- 核心用户接口不再信任前端传入 `user_id`
- 完成主链路数据隔离回归

### Phase 2：管理员态鉴权与 AI 配置安全

- 管理员接口改为真正后端鉴权
- AI 模型配置加密、脱敏、字段白名单、事务化启用

### Phase 3：后台治理模块真实联调

- 模型配置
- 知识库
- 操作日志
- 报告模板
- 数据备份
- 工作台统计

### Phase 4：知识依据追溯与产品闭环增强

- 知识库条款化
- 报告依据追溯
- 统计与整改闭环增强

### Phase 5：测试与发布治理

- 最小化集成测试
- CI 分层
- 版本发布节奏
- 回归清单与里程碑

详细拆分见 [project/PHASE_B_ROADMAP.md](./project/PHASE_B_ROADMAP.md)。

## 10. Branch Protection 建议

建议在 GitHub `main` 分支开启：

- Require a pull request before merging
- Require status checks to pass before merging
- Require branches to be up to date before merging
- Restrict direct pushes to `main`

如果团队规模较小，至少保证：

- 不直接在 `main` 上开发
- PR 通过 CI 后再合并

## 11. 每一步都可回溯的执行规则

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
