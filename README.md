# 项目1.0

这是“安全生产社会化服务智检系统”的仓库首页说明。

当前稳定开发分支为 `merge-stable-report`。项目主体代码与详细文档位于 [`project/`](./project) 目录中。

## 项目简介

本项目用于实现企业安全生产隐患的智能识别、分析与报告生成，当前版本已经具备以下核心能力：

- 普通用户登录与企业信息维护
- 隐患图片上传与 AI 分析
- Word / PDF 报告生成与下载
- 历史记录留存
- 管理员查看用户、企业、知识库、模型配置、日志等基础页面

## 仓库结构

```text
project1.0/
├── README.md                 # 仓库首页说明（当前文件）
├── project/                  # 项目主体目录
│   ├── README.md             # 项目使用说明
│   ├── STABLE_VERSION.md     # 稳定演示版本说明
│   ├── RELEASE_HANDOFF.md    # 稳定版本交接说明
│   ├── API_DOC.md            # 接口文档
│   ├── DESIGN_DOC.md         # 设计文档
│   ├── DEPLOY.md             # 部署文档
│   ├── backend/              # 后端
│   ├── uni-app-frontend/     # 前端
│   └── database/             # 数据库脚本
└── 其他历史文件或参考材料
```

## 从哪里开始看

如果你是第一次接触这个仓库，建议按下面顺序阅读：

1. [project/README.md](./project/README.md)：项目使用说明，告诉你怎么配置、启动、演示
2. [project/STABLE_VERSION.md](./project/STABLE_VERSION.md)：当前稳定版的能力、验证情况与限制
3. [project/RELEASE_HANDOFF.md](./project/RELEASE_HANDOFF.md)：当前稳定版本的交接说明和后续开发建议
4. [project/API_DOC.md](./project/API_DOC.md)：接口说明
5. [project/DESIGN_DOC.md](./project/DESIGN_DOC.md)：系统设计说明
6. [NEW_REPO_WORKFLOW.md](./NEW_REPO_WORKFLOW.md)：新仓库建立、GitHub 工作流与阶段推进方案

## 当前建议使用方式

如果你是组员、评审或演示人员，优先进入：

- [project/README.md](./project/README.md)

这里已经整理了：

- 环境要求
- `.env` 配置
- 数据库初始化
- 后端启动
- 前端启动
- Docker 本地部署
- 演示账号
- 推荐演示流程
- 常见问题排查

## 说明

- 仓库根目录的这个 `README.md` 主要用于 GitHub 首页展示。
- 更完整、更具体的项目说明保留在 [project/README.md](./project/README.md)。
- 如果你已经创建了 Pull Request，那么本次根目录 `README.md` 提交并推送后，现有 PR 会自动更新，不需要重新创建 PR。
