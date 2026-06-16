# 后端改造与前端联调待办

## 当前执行顺序

- 管理员前端 UI 已完成，下一步进入管理员后端与数据库实施。
- 完整执行计划见 `ADMIN_BACKEND_PLAN.md`。
- **后端阶段 C：企业综合查询与档案管理已完成（2026-06-09）。**
- 企业综合查询、完整档案更新、CSV 导出、企业归属强制校验全部完成。
- 阶段 C 已联调 `pages/admin/enterprises.vue`，未扩展其他管理员模块。
- 阶段 B：用户、企业、部门与权限管理已完成（2026-06-09）。

## 后端阶段 A 完成记录（2026-06-09）

- **状态**：已完成
- 已完成企业 1:N 部门、部门 1:N 用户的数据库目标结构。
- 已保留 `enterprises.user_id` 为可空历史兼容字段，并移除级联删除外键。
- 已新增 `user_permissions`，现有 7 个普通用户共写入 35 条权限。
- 已新增 `enterprises.inspection_status`、`ai_model_configs.provider` 和 `backup_records`。
- 已新增独立、可重复执行的迁移 SQL 与验证 SQL。
- 已更新完整 `database/schema.sql` 和低风险启动初始化器。
- 未修改管理员前端，未实现阶段 B 管理员接口。
- 10 条无法安全推导企业的测试报告已确认并删除。
- 2 条企业关联冲突的测试图片已确认并删除。
- 已完成现有后端对阶段 A 结构的必要兼容修复：企业列表、企业组织推导、企业档案更新和部门接口不再依赖旧归属模型。

## 使用规则

- 本文档记录前端完成后需要后端新增或调整的接口、数据库结构与联调位置。
- 状态统一使用：`待开发`、`开发中`、`待联调`、`已完成`。
- 后端实现时必须同步更新 `API_DOC.md`、`DESIGN_DOC.md`、`database/schema.sql` 和 `TEST_RECORD.md`。
- 当前前端使用统一模拟数据，后端实现前不得将模拟字段视为已落库字段。

## 第一阶段：管理员公共框架与用户管理

### 1. 企业、部门、用户组织关系

- **状态**：已完成
- **目标关系**：

```text
企业 1 ── N 部门
部门 1 ── N 用户
```

- **前端页面**：`pages/admin/users.vue`
- **前端模拟数据字段**：
  - 企业：`id`、`name`
  - 部门：`id`、`enterprise_id`、`name`
  - 用户：`enterprise_id`、`enterprise_name`、`department_id`、`department_name`

#### 数据库改造

- 当前 `enterprises.user_id NOT NULL` 表示企业归属单个用户，与目标组织关系冲突。
- 将企业从“用户私有记录”调整为“组织主数据”：迁移并移除 `enterprises.user_id`，或至少先改为可空并停止作为企业归属依据。
- 普通用户所属企业统一通过 `users.department_id -> departments.enterprise_id` 推导。
- 迁移前必须处理现有企业与用户数据，避免同一企业因不同用户重复保存。
- `departments` 增加 `enterprise_id INT NOT NULL`。
- 增加索引 `idx_departments_enterprise_id`。
- 增加外键 `departments.enterprise_id -> enterprises.id`。
- 部门名称唯一约束从全局唯一改为企业内唯一：`UNIQUE (enterprise_id, name)`。
- 明确企业删除规则：企业下存在部门或业务数据时禁止删除，避免级联误删。
- 编写迁移脚本，为现有部门补充所属企业；无法自动匹配的数据需要人工确认。
- 用户继续通过 `users.department_id` 关联部门，用户所属企业由部门关系推导，避免重复数据不一致。

#### 用户接口调整

| 接口 | 状态 | 后端调整 | 前端替换位置 |
|---|---|---|---|
| `POST /api/admin/users/list` | 已完成 | 返回企业与部门字段、权限字段 | `fetchUsers` |
| `POST /api/admin/users/add` | 已完成 | 接收 `department_id` 和 `permissions`，事务保存用户与权限 | `saveUser` 新增分支 |
| `POST /api/admin/users/update` | 已完成 | 接收 `target_id`、`department_id`、`permissions`，事务替换权限 | `saveUser` 编辑分支 |
| `POST /api/admin/users/delete` | 已完成 | 使用 `target_id` 软禁用用户，禁止禁用当前管理员 | `handleDelete` |

用户列表目标返回字段：

```json
{
  "id": 1,
  "username": "检查员小王",
  "role": "user",
  "enterprise_id": 10,
  "enterprise_name": "示例企业",
  "department_id": 101,
  "department_name": "安全管理部",
  "permissions": {
    "enterprise:manage": true,
    "image:manage": true,
    "analysis:run": true,
    "report:download": true,
    "knowledge:view": true
  },
  "created_at": "2026-06-09"
}
```

#### 企业管理接口

| 建议接口 | 状态 | 请求参数 | 说明 | 前端替换位置 |
|---|---|---|---|---|
| `POST /api/admin/enterprises/list` | 已完成 | 无 | 返回组织管理企业列表和部门、用户数量 | `fetchEnterprises` |
| `POST /api/admin/enterprises/add` | 已完成 | `name` | 新增企业且不写入 `enterprises.user_id` | `saveEnterprise` 新增分支 |
| `POST /api/admin/enterprises/update` | 已完成 | `id`、`name` | 本阶段仅重命名企业 | `saveEnterprise` 编辑分支 |
| `POST /api/admin/enterprises/delete` | 已完成 | `id` | 有部门、隐患图片或排查报告时禁止删除 | `deleteEnterprise` |

#### 部门管理接口

| 接口 | 状态 | 请求参数调整 | 前端替换位置 |
|---|---|---|---|
| `POST /api/admin/departments/list` | 已完成 | 支持 `enterprise_id`，返回 `enterprise_id` | `fetchDepartments` |
| `POST /api/admin/departments/add` | 已完成 | 必须接收 `enterprise_id`、`name` | `saveDepartment` 新增分支 |
| `POST /api/admin/departments/update` | 已完成 | 接收 `id`、`enterprise_id`、`name` | `saveDepartment` 编辑分支 |
| `POST /api/admin/departments/delete` | 已完成 | 正常或锁定用户阻止删除；仅关联禁用用户时事务解除关联后删除 | `deleteDepartment` |

#### 权限持久化

- **状态**：已完成
- 当前数据库已使用 `user_permissions` 存储用户权限，现有接口尚未接收或返回 `permissions`。
- 后端必须使用权限 Key 白名单，并在用户新增和更新事务中保存权限。
- 后端必须校验管理员权限，前端权限控制仅用于界面收敛。

#### 验收条件

- 企业列表、企业下部门列表和用户列表均来自真实接口。
- 新增、重命名、删除企业与部门后页面立即刷新。
- 用户选择企业后只能选择该企业下的部门。
- 后端拒绝跨企业部门关联、删除有关联数据的企业、删除已分配用户的部门。
- H5 与微信小程序完成真实接口联调。

## 后端阶段 B 完成记录（2026-06-09）

- 用户新增和更新均使用数据库事务同步写入 `users` 与 `user_permissions`。
- 普通用户必须绑定有效部门；管理员允许部门为空。
- 用户企业归属统一通过 `users.department_id -> departments.enterprise_id` 推导。
- 企业新增、组织列表和阶段 B 更新流程不写入或依赖 `enterprises.user_id`。
- 企业、部门、用户删除保护和当前管理员保护已由后端强制执行。
- 用户、权限、企业和部门的全部阶段 B 修改操作均写入 `action_logs`。
- `pages/admin/users.vue` 已替换用户、企业、部门模拟数据，只联调本页面。
- 阶段 B 无 DDL 变更。
- 部门删除规则已优化：禁用用户不再永久阻止组织清理，删除部门时事务内解除其部门关联并在日志中记录用户 ID。
- 已完成阶段 B 独立模块化整理：用户、企业、部门路由从 `server.js` 拆分，管理员鉴权改为公共中间件。
- `pages/admin/users.vue` 已拆出阶段 B API 客户端和用户列表纯展示逻辑；接口与业务行为保持不变。
- 模块化整理后完整 HTTP 闭环与删除保护回归通过。
- 阶段 B 模块化整理无 DDL 变更。
- 已完成阶段 B 第二轮独立模块化整理：新增 `useOrganizationManagement.js` 和 `useUserEditor.js`，分别承载组织管理与用户编辑业务状态和操作。
- 用户编辑弹窗、企业与部门管理弹窗、组织删除确认层已拆为独立组件；页面样式和交互效果保持不变。
- 第二轮整理后真实阶段 B HTTP 完整闭环、权限完整替换、事务回滚和删除保护回归通过。
- HBuilderX Web 与微信小程序运行目标均完成编译更新；登录后页面点击验收仍需使用当前有效管理员凭据确认。
- **阶段 B 第二轮模块化整理无 DDL 变更。**
- 2026-06-10 收尾复核：用户、企业、部门真实列表返回 `12 / 5 / 3`，当前管理员禁用保护和企业业务关联删除保护通过。
- 数据库完整性复核：无孤立部门、孤立用户组织关系、孤立权限或非法排查状态；无 `PHASE_*` 隔离测试用户残留。
- 企业查询页状态下拉兼容修复不涉及后端接口、业务规则或数据库行为，后端无新增待办。

## 后续阶段登记区

| 阶段 | 页面或模块 | 状态 | 说明 |
|---|---|---|---|
| 第二阶段 | 知识库管理、AI 模型配置 | 待登记 | 完成前端 UI 时补充接口待办 |
| 第三阶段 | 企业查询 | 已完成（阶段 C） | 企业综合查询、档案更新、CSV 导出、归属校验已完成 |
| 第三阶段 | 日志、模板、备份 | 待登记 | 阶段 D/E 实施 |

## 第二阶段：知识库管理与 AI 模型配置

### 1. 知识库管理联调

- **状态**：待联调
- **前端页面**：`pages/admin/knowledge.vue`
- **前端展示组件**：`components/admin/knowledge/KnowledgeItemCard.vue`
- **当前实现**：页面使用统一模拟数据，支持搜索、分类筛选、上传、编辑、单条删除、批量删除和分类管理。

| 接口 | 当前状态 | 后端调整或确认事项 | 前端替换位置 |
|---|---|---|---|
| `POST /api/admin/knowledge/list` | 待联调 | 确认返回 `category_id`、`category_name`、`file_path`、`file_type`、`created_at` | `fetchKnowledge` |
| `POST /api/admin/knowledge/add` | 待联调 | 使用 Multipart；新增必须上传文件，替换文件时使用 `isUpdate=true` | `saveKnowledge` 新增与换文件分支 |
| `POST /api/admin/knowledge/update` | 待联调 | 不更换文件时更新标题、说明和分类 | `saveKnowledge` 编辑分支 |
| `POST /api/admin/knowledge/delete` | 待联调 | 当前为软删除，参数为 `id` | `deleteKnowledge` |
| `POST /api/admin/knowledge/batch-delete` | 待开发 | 建议接收 `ids` 数组并统一软删除，避免前端循环请求 | `batchDelete` |
| `POST /api/admin/knowledge/categories/list` | 待联调 | 返回分类 ID、名称与排序 | `fetchCategories` |
| `POST /api/admin/knowledge/categories/add` | 待联调 | 校验分类名称不重复 | `saveCategory` 新增分支 |
| `POST /api/admin/knowledge/categories/update` | 待联调 | 参数为 `id`、`name`、`sort` | `saveCategory` 编辑分支 |
| `POST /api/admin/knowledge/categories/delete` | 待调整 | 有关联文档时返回明确业务错误，不能只返回数据库错误 | `deleteCategory` |

#### 知识库后端改进项

- 增加批量归档接口，事务内统一更新知识条目状态。
- 分类删除前由后端检查关联文档，前端限制仅用于交互提示。
- 后续实现文档解析时，增加解析状态和错误原因字段，并按项目异常处理规则提供重新解析入口。
- 文件上传必须校验扩展名、MIME 类型和大小，文件名由后端安全生成。

### 2. AI 模型配置联调

- **状态**：已完成第二阶段安全基线与真实联调
- **前端页面**：`pages/admin/model-config.vue`
- **当前实现**：支持模型概览、新增、编辑、启用切换和删除；API Key 仅展示脱敏内容。

| 接口 | 当前状态 | 后端调整或确认事项 | 前端替换位置 |
|---|---|---|---|
| `POST /api/admin/config/ai/list` | 已完成 | 列表返回脱敏 `api_key_masked`，不再暴露原始密钥字段 | `fetchModels` |
| `POST /api/admin/config/ai/add` | 已完成 | 接收并持久化 `provider`；API Key 使用 AES-256-GCM 加密后入库 | `saveModel` 新增分支 |
| `POST /api/admin/config/ai/update` | 已完成 | API Key 留空时保持原值；更新字段受白名单限制 | `saveModel` 编辑分支 |
| `POST /api/admin/config/ai/activate` | 已完成 | 参数为 `id`；事务切换保证仅一个启用模型 | `activate` |
| `POST /api/admin/config/ai/delete` | 已完成 | 后端禁止删除当前启用模型 | `deleteModel` |

#### AI 配置安全整改

- 已接入模型配置加密与解密模块，新增 `MODEL_CONFIG_SECRET` 环境变量。
- 已实现“读时识别、写时迁移”：历史明文记录在配置好 `MODEL_CONFIG_SECRET` 后会自动迁移为密文。
- 列表与当前配置接口只返回 `api_key_masked`，不再向前端暴露可还原密钥。
- 前端模型配置页面已切换为真实接口，不再依赖 mock 数据。

### 3. 第二阶段数据库变更登记

- **本次前端开发 DDL**：无变更。
- **后端实施结果**：`ai_model_configs.provider` 已增加并完成旧数据回填；知识解析状态相关字段待解析功能实施时统一设计。
- 后端修改数据库后，必须同步更新 `database/schema.sql` 与 `DESIGN_DOC.md`。

## 第三阶段：企业查询、操作日志、报告模板与数据备份

### 1. 企业综合数据查询

- **状态**：已完成（阶段 C，2026-06-09）
- **前端页面**：`pages/admin/enterprises.vue`（已替换真实接口）
- **后端接口**：`POST /api/admin/enterprises/query`、`POST /api/admin/enterprises/export`、`POST /api/admin/enterprises/update`（已扩展）
- 企业综合查询聚合隐患图片数、AI 分析数、报告数、隐患整改统计和主要隐患类型，风险等级由后端根据隐患数据计算。
- 支持按 `keyword`/`industry`/`enterprise_type`/`risk_level`/`status`/`inspection_date` 筛选，按 `date`/`risk`/`name` 排序。
- 导出为 UTF-8 BOM CSV，Excel 可直接打开。
- 企业档案更新使用字段白名单，变更写入操作日志。
- 隐患图片上传和多图 AI 分析前端已补充 `enterprise_id` 参数，确保业务数据自动关联企业。<

### 2. 操作日志联调

- **状态**：已完成基础真实联调（阶段 D，2026-06-16）
- **前端页面**：`pages/admin/logs.vue`
- `POST /api/admin/logs/list` 已返回最近 500 条真实日志。
- 返回字段已包含 `username`、`role`、`action`、`module`、`details`、`ip_address`、`created_at`。
- 当前 `action_logs` 表仍未新增 `module` 字段，本阶段由后端根据 `action` 统一映射模块并格式化详情文案。
- 后续增强项可再补充 `keyword`、`module`、开始时间、结束时间和分页参数，当前 PR 不扩展查询协议。

### 3. 管理员工作台真实统计

- **状态**：已完成基础真实联调（阶段 D，2026-06-16）
- **前端页面**：`pages/workbench/workbench.vue`
- 已新增 `POST /api/admin/workbench/stats`。
- 当前工作台仅展示真实可计算指标：
  - 企业总数
  - 待分析图片数
  - 报告总数
  - 今日新增报告数
- “待分析图片数” 当前口径为：已上传、状态有效且尚未关联任何排查报告的隐患图片数量。

### 4. 报告模板联调

- **状态**：待调整
- **前端页面**：`pages/admin/templates.vue`
- 现有新增接口仅接收 `file_path` 字符串，不能完成真实 DOCX 文件上传。
- 建议将新增和替换文件接口调整为 Multipart 上传，由后端校验 DOCX 类型并安全保存。
- 后端必须禁止删除当前默认模板，设置默认模板应使用事务。
- 模板更新接口必须使用允许字段白名单，禁止请求参数动态转换为任意数据库列。

### 5. 数据备份后端建设

- **状态**：待开发
- **前端页面**：`pages/admin/backup.vue`

| 建议接口 | 请求参数 | 说明 |
|---|---|---|
| `POST /api/admin/backup/create` | 无 | 创建手动数据库备份 |
| `POST /api/admin/backup/records` | 分页参数 | 获取备份记录 |
| `POST /api/admin/backup/policy/get` | 无 | 获取自动备份策略 |
| `POST /api/admin/backup/policy/update` | `period` | 更新自动备份周期 |

- 建议新增 `backup_records` 表，记录文件名、文件路径、大小、类型、状态、错误原因、创建人和创建时间。
- 自动备份需要后端定时调度能力；第一阶段不使用消息队列。
- 恢复数据库属于高风险操作，本阶段不提供前端恢复入口。

### 6. 第三阶段数据库变更登记

- **本次前端开发 DDL**：无变更。
- **后端实施结果**：`backup_records` 表与 `enterprises.inspection_status` 已完成；操作日志模块本阶段未新增落库字段，继续采用后端映射模块。
