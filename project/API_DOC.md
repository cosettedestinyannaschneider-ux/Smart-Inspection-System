# 智检系统 API 接口文档

基础路径：`http://localhost:3000`

## 统一返回格式

成功响应统一包含固定字段 `code`、`msg`、`success`。

- 当业务数据是对象时，字段会直接平铺到响应顶层，便于兼容旧前端。
- 当业务数据是数组、字符串、数字或 `null` 时，放在 `data` 字段中。

```json
{ "code": 0, "msg": "ok", "success": true, "access_token": "jwt", "user": {} }
```

| 字段 | 类型 | 说明 |
|------|------|------|
| code | number | 0 = 成功；1xxx 认证；2xxx 参数；3xxx 业务；4xxx 资源；5xxx 服务器 |
| msg | string | 可读消息 |
| success | boolean | 是否成功 |
| data | any | 非对象类型的业务数据放在此字段 |
| 其他业务字段 | any | 对象类型业务数据会平铺到顶层 |

## 错误码对照表

| 码位 | 错误码 | 说明 |
|------|--------|------|
| 1xxx 认证 | 1001 | 未登录或登录已过期 |
| | 1002 | 用户名或密码错误 |
| | 1003 | 账户已被锁定 |
| | 1004 | 账户已被禁用 |
| | 1005 | 权限不足 |
| | 1006 | 仅限管理员操作 |
| 2xxx 参数 | 2001 | 缺少必要参数 |
| | 2002 | 参数格式不正确 |
| | 2003 | 用户名已存在 |
| | 2004 | 请上传文件 |
| | 2005 | 文件格式不支持 |
| 3xxx 业务 | 3001 | AI 服务暂时不可用 |
| | 3002 | 报告生成失败 |
| | 3003 | 图片处理失败 |
| | 3004 | 登录状态已过期 |
| | 3005 | 登录已退出或已被禁用 |
| 4xxx 资源 | 4001 | 资源不存在 |
| | 4002 | 用户不存在 |
| | 4003 | 未找到隐患照片 |
| | 4004 | 记录不存在 |
| 5xxx 服务 | 5001 | 服务器内部错误 |
| | 5002 | 数据库操作失败 |

---

## 0. 健康检查

### 0.1 服务状态
- **URL**: `GET /api/health`
- **返回**: `{ code: 0, msg: "Backend is running", success: true, status: "running" }`

---

## 1. 用户与认证模块

### 1.1 用户登录
- **URL**: `POST /api/login`
- **参数**: `username` (String), `password` (String)
- **成功**:

```json
{
  "code": 0,
  "msg": "ok",
  "success": true,
  "access_token": "jwt_access_token",
  "token_type": "Bearer",
  "expires_at": "2026-06-16T12:00:00.000Z",
  "user": {
    "id": 1,
    "username": "demo",
    "role": "user",
    "department_id": 2,
    "status": "active",
    "permissions": {
      "image:manage": true,
      "analysis:run": true
    }
  }
}
```
- **失败**: `{ code: 1002/1003/1004, msg: "..." }`

### 1.2 获取当前登录用户
- **URL**: `GET /api/auth/me`
- **请求头**: `Authorization: Bearer <access_token>`
- **成功**:

```json
{
  "code": 0,
  "msg": "ok",
  "success": true,
  "user": {
    "id": 1,
    "username": "demo",
    "role": "user",
    "department_id": 2,
    "status": "active",
    "permissions": {
      "image:manage": true
    }
  }
}
```

### 1.3 用户退出登录
- **URL**: `POST /api/logout`
- **请求头**: `Authorization: Bearer <access_token>`
- **成功**: `{ "code": 0, "msg": "已退出登录", "success": true, "data": null }`

### 1.4 用户注册
- **URL**: `POST /api/register`
- **参数**: `username` (String), `password` (String), `role` (String, 默认 "user"), `department_id` (Number, 可选)
- **成功**: `{ code: 0, msg: "注册成功" }`
- **失败**: `{ code: 2003, msg: "用户名已存在" }`

### 1.5 部门列表
- **URL**: `GET /api/departments/list`
- **请求头**: `Authorization: Bearer <access_token>`
- **返回**: `{ code: 0, data: [{ id, name, created_at }] }`

> 说明：自 Phase 1 PR2 起，普通用户核心业务接口统一以后端鉴权上下文为准，不再信任客户端传入的 `user_id`。

---

## 2. 企业信息管理

### 2.1 获取企业信息
- **URL**: `POST /api/enterprise/get`
- **请求头**: `Authorization: Bearer <access_token>`
- **权限**: `enterprise:manage`
- **返回**: `{ code: 0, data: { id, name, region, address, contact, phone, industry, enterprise_type, scale, inspector_name, inspection_date, ... } }`

### 2.2 更新企业信息
- **URL**: `POST /api/enterprise/update`
- **请求头**: `Authorization: Bearer <access_token>`
- **权限**: `enterprise:manage`
- **参数**: `name` (String, 必填), `region`, `address`, `contact`, `phone`, `industry`, `enterprise_type`, `scale`, `production_process`, `inspector_name`, `inspection_date`, `project_name`

---

## 3. AI 巡检与处理

### 3.1 AI 智能巡检（单文件）
- **URL**: `POST /api/process`
- **方法**: `POST` (Multipart/form-data)
- **请求头**: `Authorization: Bearer <access_token>`
- **权限**: `analysis:run`
- **参数**: `prompt` (String), `session_id` (String, 可选), `model_id` (Number, 可选), `file` (File, 可选)
- **返回**: `{ code: 0, result, wordPath, pdfPath, sessionId, id, knowledge_refs }`

> 业务范围：纯文本请求会进行安全生产业务范围保底判断。与安全检查、隐患分析、整改建议、法规标准、企业安全管理或报告生成无关的问题会返回业务范围提示，不生成 Word/PDF 报告。
>
> 模型能力：上传图片或进行隐患图片分析时，需要选择支持视觉/多模态输入的模型。若模型 API Key、API 地址、模型 ID 或图片能力异常，后端返回归一化错误提示，不暴露 API Key、请求头或供应商原始响应。
>
> 法规依据：隐患分析会基于用户描述、图片名称/标签和企业信息检索本地 `knowledge_clauses`，将命中的条款作为受控上下文注入模型，并把命中条款快照返回到 `knowledge_refs`。未命中本地条款时，AI 应返回“需人工复核具体条款”，不得编造法规编号或条款内容。

### 3.2 多图智能隐患分析
- **URL**: `POST /api/hazard/analyze`
- **方法**: `POST` (JSON)
- **请求头**: `Authorization: Bearer <access_token>`
- **权限**: `analysis:run`
- **参数**: `prompt` (String, 可选), `session_id` (String, 可选), `image_ids` (Number[]), `enterprise_id` (Number, 可选), `model_id` (Number, 可选)
- **返回**: `{ code: 0, result, wordPath, pdfPath, sessionId, id, knowledge_refs }`

> 图片顺序：后端按 `image_ids` 的传入顺序读取图片，并要求 AI 结果中的 `image_id` 与该顺序一致，避免报告中的“图片 1/2/3”与用户选择顺序错位。
>
> 法规依据：后端使用 MySQL LIKE 从 `knowledge_clauses` 检索本地条款，并要求模型仅引用命中的条款；分析结果保存后，命中条款快照写入 `inspection_report_knowledge_refs`，用于历史报告和企业档案回查。

`knowledge_refs` 字段结构：

```json
[
  {
    "knowledge_clause_id": 1,
    "knowledge_id": 2,
    "source_title": "安全生产法",
    "source_code": "",
    "clause_no": "第三十六条",
    "content": "生产经营单位应当...",
    "match_keyword": "安全"
  }
]
```

### 3.3 编辑保存分析结果
- **URL**: `POST /api/history/update-result`
- **请求头**: `Authorization: Bearer <access_token>`
- **权限**: `analysis:run`
- **参数**: `id` (Number), `result` (String)
- **返回**: `{ code: 0, wordPath, pdfPath }`

---

## 4. 会话管理

### 4.1 获取会话列表
- **URL**: `GET /api/sessions`
- **请求头**: `Authorization: Bearer <access_token>`
- **返回**: `{ code: 0, data: [{ session_id, title, created_at }] }`

### 4.2 获取会话详情
- **URL**: `GET /api/session/:session_id`
- **请求头**: `Authorization: Bearer <access_token>`
- **返回**: `{ code: 0, data: [{ id, prompt, result, image_path, wordPath, pdfPath, knowledge_refs, ... }] }`

### 4.3 删除会话
- **URL**: `POST /api/session/delete`
- **请求头**: `Authorization: Bearer <access_token>`
- **参数**: `session_id` (String)

---

## 5. 隐患图片管理（9.5 模块）

### 5.1 上传隐患图片
- **URL**: `POST /api/hazard/images/upload`
- **方法**: `POST` (Multipart, 最多 9 张)
- **请求头**: `Authorization: Bearer <access_token>`
- **权限**: `image:manage`
- **参数**: `files` (File[]), `enterprise_id` (Number, 可选)

### 5.2 获取图片列表
- **URL**: `GET /api/hazard/images/list`
- **请求头**: `Authorization: Bearer <access_token>`
- **权限**: `image:manage`
- **返回**: `{ code: 0, data: [{ id, file_path, original_name, ... }] }`

> `file_path` 为后端返回的受控预览地址，前端应直接使用，不再拼接公开 `/uploads/...` 路径。

### 5.3 删除图片（软删除）
- **URL**: `POST /api/hazard/images/delete`
- **请求头**: `Authorization: Bearer <access_token>`
- **权限**: `image:manage`
- **参数**: `id` (Number)

### 5.4 更新图片标签
- **URL**: `POST /api/hazard/images/label`
- **请求头**: `Authorization: Bearer <access_token>`
- **权限**: `image:manage`
- **参数**: `id` (Number), `label` (String)

---

## 6. 报告管理（9.7 模块）

### 6.1 删除报告记录
- **URL**: `POST /api/history/delete`
- **请求头**: `Authorization: Bearer <access_token>`
- **权限**: `report:download`
- **参数**: `id` (Number)

### 6.2 查看历史记录
- **URL**: `GET /api/history`
- **请求头**: `Authorization: Bearer <access_token>`
- **权限**: `report:download`
- **返回**: `{ code: 0, data: [{ id, prompt, result, image_path, wordPath, pdfPath, knowledge_refs, ... }] }`

### 6.3 受控文件访问

以下地址主要由后端返回给前端直接使用，支持两种访问方式：

- 请求头携带 `Authorization: Bearer <access_token>`
- 或使用后端返回的 `access_token` 查询参数短时票据

接口列表：

- `GET /api/files/hazard-images/:image_id`
- `GET /api/files/reports/:report_id/image`
- `GET /api/files/reports/:report_id/word`
- `GET /api/files/reports/:report_id/pdf`

---

## 7. 知识库管理

### 7.1 知识列表
- **URL**: `GET /api/knowledge/list`
- **URL**: `GET /api/knowledge/categories/list`
- **请求头**: `Authorization: Bearer <access_token>`
- **权限**: `knowledge:view`
- **返回**: `{ code: 0, data: [...] }`

> 普通用户侧不再提供知识库写接口；上传、更新、归档统一走管理员接口。

---

## 8. 管理员接口

> 鉴权：请求头携带 `Authorization: Bearer <access_token>`，且当前登录用户角色必须为 `admin`

### 8.1 用户管理
| 方法 | URL | 说明 |
|------|-----|------|
| POST | `/api/admin/users/list` | 用户列表（含部门、对话统计） |
| POST | `/api/admin/users/add` | 创建用户（含 department_id） |
| POST | `/api/admin/users/update` | 更新用户信息 |
| POST | `/api/admin/users/delete` | 禁用用户（软删除） |

#### 8.1.1 前端用户管理页面对接说明

> 当前状态：管理员用户管理页面已完成 UI 和前端交互，暂时使用模拟数据，以下接口等待逐步联调。
>
> 权限字段说明：当前后端用户接口尚未接收或返回 `permissions`。前端权限卡片暂时使用模拟数据；后续接入权限持久化时，需要单独设计后端存储与接口。
>
> 组织关系说明：前端已按“企业 1:N 部门、部门 1:N 用户”实现模拟交互，当前后端与数据库尚未支持该完整关系。详细后端改造任务见 `BACKEND_TODO.md`。

所有管理员用户接口均需通过请求头携带：

```http
Authorization: Bearer <access_token>
```

##### 用户列表

- **URL**：`POST /api/admin/users/list`
- **前端调用时机**：用户管理页面初始化完成管理员鉴权后。
- **请求参数**：当前阶段无筛选参数；关键词与角色筛选暂由前端完成。
- **当前后端返回字段**：`id`、`username`、`role`、`department_id`、`department_name`、`enterprise_id`、`enterprise_name`、`created_at`、`chatCount` 等用户查询字段。
- **页面后续需要扩展的字段**：`permissions`。
- **页面目标返回示例**：

```json
{
  "code": 0,
  "data": [
    {
      "id": 1,
      "username": "检查员小王",
      "role": "user",
      "enterprise_id": 10,
      "enterprise_name": "示例建筑企业",
      "department_id": 1,
      "department_name": "安全项目部",
      "permissions": {
        "enterprise:manage": true,
        "image:manage": true,
        "analysis:run": true,
        "report:download": true,
        "knowledge:view": true
      },
      "created_at": "2026-05-10"
    }
  ]
}
```

##### 创建用户

- **URL**：`POST /api/admin/users/add`
- **前端调用时机**：管理员填写新增用户表单并点击“创建用户”。
- **请求参数**：

```json
{
  "username": "检查员小王",
  "password": "初始密码",
  "role": "user",
  "department_id": 1
}
```

- **当前后端支持字段**：`username`、`password`、`role`、`department_id`
- **后续待扩展能力**：根据 `department_id` 校验和返回所属企业，并持久化 `permissions`。

##### 更新用户

- **URL**：`POST /api/admin/users/update`
- **前端调用时机**：管理员编辑用户并点击“保存修改”。
- **当前后端请求参数**：`target_id`、`username`、`password`、`role`、`department_id`
- **密码规则**：密码留空时不修改密码。
- **后续待扩展能力**：根据 `department_id` 校验和返回所属企业，并持久化 `permissions`。

##### 删除或禁用用户

- **URL**：`POST /api/admin/users/delete`
- **前端调用时机**：管理员二次确认删除用户后。
- **当前后端请求参数**：`target_id`
- **前端限制**：不允许删除当前登录的管理员账号。

##### 部门列表

- **URL**：`POST /api/admin/departments/list`
- **前端调用时机**：用户管理页面初始化后，与用户列表同时加载。
- **页面需要的返回字段**：`id`、`name`
- **说明**：当前用户管理 UI 使用管理员部门列表接口，不使用公共注册页面的部门列表接口。

### 8.2 部门管理
| 方法 | URL | 说明 |
|------|-----|------|
| POST | `/api/admin/departments/list` | 部门列表 |
| POST | `/api/admin/departments/add` | 新增部门 |
| POST | `/api/admin/departments/update` | 更新部门 |
| POST | `/api/admin/departments/delete` | 删除部门 |

#### 8.2.1 前端所属部门管理对接说明

> 当前状态：用户管理页面已提供企业与部门级联选择和组织管理弹窗，当前使用前端模拟数据。
>
> 当前数据库与现有部门接口已适配企业 1:N 部门、部门 1:N 用户关系。完整管理员组织管理流程仍在后端阶段 B 联调。

##### 获取部门列表

- **URL**：`POST /api/admin/departments/list`
- **前端调用方法**：`fetchDepartments`
- **请求参数**：`enterprise_id`（可选，不传时查询全部）
- **返回字段**：`id`、`enterprise_id`、`name`、`created_at`

##### 新增部门

- **URL**：`POST /api/admin/departments/add`
- **前端调用位置**：所属部门管理弹窗点击“新增部门”
- **请求参数**：`enterprise_id`、`name`，均为必填；企业不存在时拒绝创建。

##### 重命名部门

- **URL**：`POST /api/admin/departments/update`
- **前端调用位置**：所属部门管理弹窗点击“重命名”后保存
- **请求参数**：`id`、`enterprise_id`、`name`，均为必填。
- **组织保护**：已分配用户的部门禁止跨企业移动。

##### 删除部门

- **URL**：`POST /api/admin/departments/delete`
- **前端调用位置**：所属部门管理弹窗点击“删除”
- **请求参数**：`id`
- **后端限制**：已分配用户的部门不允许直接删除，应先调整相关用户所属部门。

#### 8.2.2 企业与部门组织管理待开发接口

> 以下接口为前端已使用模拟数据实现、后端尚待开发的目标接口。详细字段、数据库迁移和验收条件见 `BACKEND_TODO.md`。

| 方法 | 建议 URL | 说明 |
|------|----------|------|
| POST | `/api/admin/enterprises/list` | 获取组织管理企业列表 |
| POST | `/api/admin/enterprises/add` | 新增企业 |
| POST | `/api/admin/enterprises/update` | 更新企业名称 |
| POST | `/api/admin/enterprises/delete` | 删除无关联数据的企业 |

### 8.3 知识库管理
| 方法 | URL | 说明 |
|------|-----|------|
| POST | `/api/admin/knowledge/list` | 知识库列表 |
| POST | `/api/admin/knowledge/coverage` | 14 类法规知识库覆盖率 |
| POST | `/api/admin/knowledge/clauses/list` | 查询某个知识文档的结构化条款 |
| POST | `/api/admin/knowledge/add` | 上传知识文件 |
| POST | `/api/admin/knowledge/update` | 更新知识条目 |
| POST | `/api/admin/knowledge/save` | 更新知识条目并可选替换文件 |
| POST | `/api/admin/knowledge/delete` | 归档知识条目 |
| POST | `/api/admin/knowledge/batch-delete` | 批量归档知识条目 |
| POST | `/api/admin/knowledge/categories/*` | 分类 CRUD |

### 8.4 AI 模型配置
| 方法 | URL | 说明 |
|------|-----|------|
| POST | `/api/admin/config/ai` | 当前激活的配置 |
| POST | `/api/admin/config/ai/list` | 全部配置列表 |
| POST | `/api/admin/config/ai/env-default` | 只读查看环境变量兜底模型 |
| POST | `/api/admin/config/ai/add` | 新增模型配置 |
| POST | `/api/admin/config/ai/update` | 更新模型配置 |
| POST | `/api/admin/config/ai/activate` | 激活指定配置 |
| POST | `/api/admin/config/ai/test` | 手动检测指定模型配置连通性 |
| POST | `/api/admin/config/ai/delete` | 删除配置 |

> 新增配置示例：`{ name, provider, base_url, api_key, model_name, max_tokens?, temperature?, timeout_ms? }`

#### 8.4.1 第二阶段前端对接约定

> 当前状态：知识库管理页面已切换为真实接口；AI 模型配置页面已切换为真实接口，并统一只展示脱敏密钥。

##### 知识库接口参数

| 接口 | 请求参数 | 前端说明 |
|---|---|---|
| `POST /api/admin/knowledge/list` | 无业务参数 | 页面初始化加载文档列表 |
| `POST /api/admin/knowledge/clauses/list` | `knowledge_id` 或 `id` | 管理员检查某个文档的条款抽取结果 |
| `POST /api/admin/knowledge/coverage` | 无业务参数 | 获取 14 类法规知识库覆盖率 |
| `POST /api/admin/knowledge/clauses/import-csv` | Multipart：`file` | 批量导入法规条文 CSV |
| `POST /api/admin/knowledge/add` | Multipart：`title`、`description`、`category_id`、`applicable_category_ids`、来源字段、`file` | 新增必须上传文件 |
| `POST /api/admin/knowledge/update` | `id`、`title`、`description`、`category_id`、`applicable_category_ids`、来源字段 | 编辑但不更换文件 |
| `POST /api/admin/knowledge/save` | Multipart：`id`、`title`、`description`、`category_id`、`applicable_category_ids`、来源字段、可选 `file` | 编辑并替换文件时使用 |
| `POST /api/admin/knowledge/delete` | `id` | 单条归档，默认不物理删除文件 |
| `POST /api/admin/knowledge/batch-delete` | `ids: number[]` | 批量归档已选知识文档 |
| `POST /api/admin/knowledge/categories/list` | 无业务参数 | 页面初始化加载分类 |
| `POST /api/admin/knowledge/categories/add` | `name`、`sort` | 仅允许固定 14 类法规分类名称 |
| `POST /api/admin/knowledge/categories/update` | `id`、`name`、`sort` | 仅允许固定 14 类法规分类名称 |
| `POST /api/admin/knowledge/categories/delete` | `id` | 删除无关联文档的分类；若仍有关联文档，后端明确拒绝 |

知识库管理规则：

- 法规分类固定为 14 类：煤矿安全、非煤矿山安全、危险化学品与化工安全、建筑施工安全、消防安全、特种设备安全、交通运输安全、工贸行业安全、电力安全、石油天然气安全、农林牧渔安全、职业健康与劳动安全、应急与事故管理、其他专项安全
- 历史分类“安全生产隐患排查报告”不再作为法规分类返回；旧库中如已存在，仅作为历史兼容数据保留，不在新建流程中使用
- `knowledge.category_id` 表示主分类；`knowledge_category_relations` 表示适用分类，一份通用法规可以关联多个行业分类
- 来源字段包括：`source_code`、`source_url`、`issuing_authority`、`document_type`、`publish_date`、`effective_date`、`current_status`、`verification_status`
- `verification_status` 取值：`pending` 待校验、`verified` 已校验、`rejected` 不采用；未校验条文后续不得直接作为正式法规结论
- 仅允许上传 `PDF`、`DOC`、`DOCX`，单文件大小不超过 `20MB`
- 知识文档统一存放到 `uploads/knowledge/` 子目录，数据库保存相对路径
- PDF 使用 `pdf-parse` 抽取文本，DOCX 使用 `jszip` 读取 `word/document.xml` 抽取文本
- DOC 旧二进制格式暂不自动抽取条款，仅保留文件级管理，列表返回 `parse_status = skipped`
- 自动抽取的条款写入 `knowledge_clauses`，单文档最多自动保留 300 条，单条内容最多保留 4000 字符
- `knowledge.parse_status` 记录抽取状态：`pending`、`parsed`、`skipped`、`failed`
- `knowledge.parse_message` 记录跳过原因或失败原因，便于管理员复核
- CSV 导入模板位于 `project/database/legal_clause_import_template.csv`，演示种子位于 `project/database/legal_clause_seed.csv`，第一批正式法规标准条文位于 `project/database/legal_clause_official.csv`
- CSV 导入字段固定为：分类、法规名称、文号/标准号、条款号、条文内容、关键词、官方来源URL、发布机关、施行日期、现行状态、备注
- CSV 导入会自动创建或复用 `knowledge` 文档记录，并追加写入 `knowledge_clauses`；重复条款按“法规名称 + 文号/标准号 + 条款号 + 条文内容”识别并跳过。命令行导入前会自动执行质量校验，阻断缺表头、非法分类、`local://` 来源、必填字段缺失和 CSV 内重复条款
- 命令行校验正式 CSV：`npm --prefix project/backend run validate:legal-clauses`；命令行导入演示种子：`npm --prefix project/backend run import:legal-clauses`；导入正式 CSV：`npm --prefix project/backend run import:legal-clauses -- project/database/legal_clause_official.csv`
- 覆盖率接口按 14 类返回法规文件数、条文数、已校验条文数、未校验条文数和可用状态；空知识库时前端必须提示只能进行图片事实识别，不能出具法规判断
- 覆盖率接口的 `summary.knowledge_count` 和 `summary.clause_count` 为全库唯一计数；分类卡片按适用分类统计，同一份通用法规关联多个分类时会分别体现到各分类
- 分类删除前，后端会校验该分类下没有 `status='active'` 的知识文档
- 知识文档删除语义改为**归档优先**，即将 `status` 更新为 `archived`
- 当前阶段已完成条款结构化入库、CSV 导入、正式 CSV 数据资产和知识库覆盖率看板；规则库数量和严格隐患判定由后续规则库 PR 接入

知识列表页面需要的返回字段：

```json
{
  "id": 1,
  "title": "中华人民共和国安全生产法",
  "description": "2021年修订版",
  "category_id": 1,
  "category_name": "煤矿安全",
  "applicable_category_ids": [1, 8],
  "applicable_category_names": "煤矿安全、工贸行业安全",
  "source_code": "主席令第八十八号",
  "source_url": "https://flk.npc.gov.cn/...",
  "issuing_authority": "全国人民代表大会常务委员会",
  "document_type": "法律",
  "publish_date": "2021-06-10",
  "effective_date": "2021-09-01",
  "current_status": "现行有效",
  "verification_status": "verified",
  "file_path": "knowledge/1718527000000-123456789.pdf",
  "file_name": "1718527000000-123456789.pdf",
  "file_type": "PDF",
  "file_size": 245760,
  "clause_count": 26,
  "parse_status": "parsed",
  "parse_message": "",
  "status": "active",
  "created_at": "2026-06-09T09:20:00.000Z",
  "updated_at": "2026-06-17T10:00:00.000Z"
}
```

条款列表返回字段示例：

```json
{
  "code": 0,
  "success": true,
  "data": [
    {
      "id": 1,
      "knowledge_id": 10,
      "category_id": 2,
      "source_title": "中华人民共和国安全生产法",
      "source_code": "主席令第八十八号",
      "source_url": "https://flk.npc.gov.cn/...",
      "issuing_authority": "全国人民代表大会常务委员会",
      "document_type": "法律",
      "publish_date": "2021-06-10",
      "effective_date": "2021-09-01",
      "current_status": "现行有效",
      "verification_status": "verified",
      "clause_no": "第三十六条",
      "content": "生产经营单位应当...",
      "keywords": "生产经营,单位应当",
      "sort": 1,
      "status": "active"
    }
  ]
}
```

覆盖率接口返回字段示例：

```json
{
  "code": 0,
  "success": true,
  "msg": "ok",
  "data": {
    "summary": {
      "category_count": 14,
      "covered_category_count": 3,
      "usable_category_count": 2,
      "knowledge_count": 4,
      "clause_count": 12,
      "verified_clause_count": 8,
      "pending_clause_count": 4,
      "rejected_clause_count": 0
    },
    "categories": [
      {
        "category_id": 5,
        "category_name": "消防安全",
        "knowledge_count": 1,
        "clause_count": 3,
        "verified_clause_count": 2,
        "pending_clause_count": 1,
        "coverage_status": "usable",
        "verified_ratio": 0.6667
      }
    ],
    "is_empty": false,
    "can_support_formal_assessment": true,
    "message": "已有人工校验条文，可为后续规则判定和报告依据追溯提供基础。"
  }
}
```

##### AI 模型配置接口参数

| 接口 | 请求参数 | 前端说明 |
|---|---|---|
| `POST /api/admin/config/ai/list` | 无业务参数 | 必须返回脱敏的 `api_key_masked`，禁止返回原始密钥字段 |
| `POST /api/admin/config/ai/env-default` | 无业务参数 | 返回 `.env` 兜底模型的只读脱敏信息，不进入数据库配置列表 |
| `POST /api/admin/config/ai/add` | `name`、`provider`、`base_url`、`api_key`、`model_name`、`max_tokens`、`temperature`、`timeout_ms` | 新增时 API Key 必填 |
| `POST /api/admin/config/ai/update` | `id` 与允许修改的配置字段 | `api_key` 留空时保持原密钥 |
| `POST /api/admin/config/ai/activate` | `id` | 切换当前启用模型 |
| `POST /api/admin/config/ai/test` | `id` | 后端使用已保存配置发起最小化模型调用；仅返回脱敏后的成功/失败提示 |
| `POST /api/admin/config/ai/delete` | `id` | 当前启用模型禁止删除 |

模型列表页面需要的返回字段：

```json
{
  "id": 1,
  "name": "豆包视觉模型",
  "provider": "豆包",
  "base_url": "https://example.com/api/v3",
  "model_name": "doubao-vision-pro-32k",
  "api_key_masked": "ark-****8f2a",
  "max_tokens": 4096,
  "temperature": 0.7,
  "timeout_ms": 60000,
  "is_active": true
}
```

> 安全要求：AI 配置列表和当前配置接口均不得返回可还原的 API Key；详细整改任务见 `BACKEND_TODO.md`。
>
> 环境要求：若需要对 `ai_model_configs` 中的密钥做加密存储与运行时解密，后端必须配置 `MODEL_CONFIG_SECRET`。历史明文记录会在读取时自动迁移为密文。
>
> 检测说明：`/api/admin/config/ai/test` 不返回 API Key、请求头、原始模型响应或供应商错误原文。该接口会触发一次最小化模型调用，因此只由管理员手动点击检测，不在保存配置或公共 CI 中自动执行。

### 8.5 报告模板管理
| 方法 | URL | 说明 |
|------|-----|------|
| POST | `/api/admin/templates/list` | 模板列表 |
| POST | `/api/admin/templates/create` | 上传新模板（Multipart） |
| POST | `/api/admin/templates/save` | 更新模板名称、说明或替换文件 |
| POST | `/api/admin/templates/activate` | 设为默认模板 |
| POST | `/api/admin/templates/remove` | 删除模板 |
| GET | `/api/admin/templates/:template_id/file` | 下载模板文件 |

- 所有接口均要求管理员登录态：`Authorization: Bearer <access_token>`。
- 模板文件字段统一为 `file`，仅允许上传 `.docx`。
- 首个成功上传的模板会自动成为默认模板。
- 默认模板不可删除；若当前默认模板文件缺失，报告生成会自动回退到内置模板。

`POST /api/admin/templates/list` 返回示例：

```json
{
  "code": 0,
  "success": true,
  "data": [
    {
      "id": 3,
      "name": "标准排查模板",
      "description": "适用于常规企业隐患排查",
      "file_path": "report-templates/1718527000000-123456789.docx",
      "file_name": "1718527000000-123456789.docx",
      "is_default": true,
      "has_file": true,
      "created_at": "2026-06-16T09:20:00.000Z",
      "updated_at": "2026-06-16T09:20:00.000Z",
      "download_url": "/api/admin/templates/3/file?access_token=..."
    }
  ]
}
```

`POST /api/admin/templates/create`：

- 请求方式：`Multipart/form-data`
- 表单字段：
  - `name`：模板名称
  - `description`：模板说明，可空
  - `file`：DOCX 模板文件，必填

`POST /api/admin/templates/save`：

- 仅修改名称和说明时可使用 JSON：

```json
{
  "id": 3,
  "name": "标准排查模板 V2",
  "description": "更新了封面和签字栏"
}
```

- 替换模板文件时使用 `Multipart/form-data`，并额外携带：
  - `id`
  - `name`
  - `description`
  - `file`

`POST /api/admin/templates/activate`：

```json
{ "id": 3 }
```

`POST /api/admin/templates/remove`：

```json
{ "id": 4 }
```

### 8.6 管理员工作台统计
- **URL**: `POST /api/admin/workbench/stats`
- **返回**: 管理员工作台真实统计数据

返回示例：

```json
{
  "code": 0,
  "success": true,
  "data": {
    "enterprise_count": 5,
    "pending_image_count": 3,
    "report_count": 25,
    "today_report_count": 2
  }
}
```

统计口径说明：

- `enterprise_count`：`enterprises.status = 'active'` 的企业总数
- `pending_image_count`：已上传且 `status = 'active'`，但尚未关联任何排查报告的隐患图片数量
- `report_count`：`inspection_reports` 总数
- `today_report_count`：按数据库当前日期统计的当日新增报告数

### 8.7 操作日志
- **URL**: `POST /api/admin/logs/list`
- **返回**: 最近 500 条操作记录（含 IP 地址、角色、模块和格式化详情）

### 8.8 全量历史
- **URL**: `POST /api/admin/history`
- **返回**: 全量用户排查报告列表

### 8.9 第三阶段前端对接约定

> 当前状态：企业数据查询、操作日志、管理员工作台和报告模板已完成真实接口联调；数据备份页面仍处于后续规划阶段。

#### 企业综合查询目标接口

- **URL**：`POST /api/admin/enterprises/query`
- **参数**：`keyword`、`industry`、`enterprise_type`、`risk_level`、`status`、`inspection_date`、`sort_by`
- **返回**：企业完整档案、检查员、隐患整改统计、主要隐患类型与报告列表。

企业综合查询目标返回示例：

```json
{
  "id": 1,
  "name": "示例企业",
  "region": "陕西省西安市",
  "address": "详细地址",
  "industry": "建筑施工",
  "enterprise_type": "有限责任公司",
  "scale": "中型",
  "production_process": "房建施工、机电安装",
  "contact": "张经理",
  "phone": "13800138001",
  "username": "检查员小王",
  "inspector_name": "李工",
  "inspection_date": "2026-06-01",
  "inspection_status": "待整改",
  "status": "active",
  "risk_level": "中风险",
  "hazard_count": 7,
  "pending_count": 2,
  "rectified_count": 5,
  "image_count": 5,
  "analysis_count": 3,
  "report_count": 2,
  "main_hazards": ["临时用电", "高处作业"],
  "recent_images": ["临时配电箱.jpg"],
  "recent_analyses": ["临时用电防护不规范"],
  "reports": []
}
```

#### 企业信息更新目标接口

- **URL**：`POST /api/admin/enterprises/update`
- **参数**：`id`、`name`、`region`、`address`、`industry`、`enterprise_type`、`scale`、`production_process`、`contact`、`phone`、`inspector_name`、`inspection_date`、`inspection_status`、`status`
- **行为**：更新成功后返回企业最新完整记录，并写入管理员操作日志。

#### 企业专属档案关联规则

- 隐患图片上传必须携带目标 `enterprise_id`。
- AI 分析结果和生成的 Word/PDF 报告必须写入同一 `enterprise_id`。
- 查询企业专属档案时，根据 `enterprise_id` 聚合隐患图片、分析结果、报告与报告图片关联。
- 管理员可查看全部企业档案，普通用户仅能查看自身创建或后端授权的数据。

- **URL**：`POST /api/admin/enterprises/export`
- **参数**：与查询接口一致。
- **返回**：Excel 文件下载地址。

#### 操作日志页面字段

`POST /api/admin/logs/list` 页面需要返回：

```json
{
  "id": 1,
  "username": "admin",
  "role": "管理员",
  "action": "更新模型配置",
  "module": "系统管理",
  "details": "切换当前 AI 模型",
  "ip_address": "192.168.1.1",
  "created_at": "2026-06-09 09:30"
}
```

#### 管理员工作台统计接口

`POST /api/admin/workbench/stats` 页面需要返回：

```json
{
  "enterprise_count": 5,
  "pending_image_count": 3,
  "report_count": 25,
  "today_report_count": 2
}
```

字段说明：

- `enterprise_count`：有效企业总数
- `pending_image_count`：待分析图片数，统计尚未进入任何排查报告的有效隐患图片
- `report_count`：报告总数
- `today_report_count`：今日新增报告数

#### 报告模板文件上传

- 模板新增和替换文件应使用 Multipart 上传。
- 文件字段名建议统一为 `file`，仅允许 DOCX。
- 编辑但不更换文件时，可继续使用 JSON 更新模板名称和说明。
- 模板文件不再通过公开 `/uploads/...` 直链暴露，前端应使用后端返回的 `download_url`。
- 模板管理页真实接口已切换为 `/create`、`/save`、`/activate`、`/remove`。

#### 数据备份目标接口

| 方法 | URL | 说明 |
|---|---|---|
| POST | `/api/admin/backup/status` | 获取手动备份能力状态 |
| POST | `/api/admin/backup/create` | 创建手动数据库备份 |
| POST | `/api/admin/backup/records` | 获取备份记录 |
| GET | `/api/admin/backup/:backup_id/file` | 通过短期文件访问票据下载备份文件 |

当前阶段只实现真实手动备份。自动备份策略保留为规划能力，前端不再提供可保存的伪配置。

`POST /api/admin/backup/status` 返回示例：

```json
{
  "available": true,
  "reason": "",
  "backup_dir": "uploads/backups",
  "automatic_policy": {
    "enabled": false,
    "label": "规划中"
  }
}
```

`POST /api/admin/backup/records` 返回字段：

- `id`：备份记录 ID
- `file_name`：备份文件名
- `file_size`：文件大小，单位字节
- `backup_type`：`manual` 或 `automatic`
- `status`：`pending`、`running`、`completed`、`failed`
- `error_message`：失败原因
- `has_file`：本地备份文件是否仍存在
- `download_url`：管理员受控下载地址，只有成功且文件存在时返回

## 后端阶段 B 已实现接口（2026-06-09）

所有接口均为 `POST`，必须携带有效管理员 `Authorization: Bearer <access_token>`。统一成功响应为 `{ "success": true, "code": 0, ... }`，业务校验失败返回明确 `msg`。

| URL | 主要参数 | 返回或行为 |
|---|---|---|
| `/api/admin/users/list` | 无业务必填参数 | 返回有效用户，包含企业、部门和 `permissions` 对象 |
| `/api/admin/users/add` | `username`、`password`、`role`、`department_id`、`permissions` | 事务新增用户与权限 |
| `/api/admin/users/update` | `target_id`、`username`、可选 `password`、`role`、`department_id`、`status`、`permissions` | 事务更新用户并完整替换权限；`status` 可选值为 `active` 或 `disabled`，用于启用/禁用用户 |
| `/api/admin/users/delete` | `target_id` | 软禁用用户；禁止禁用当前管理员；已禁用用户可通过 update 接口重新启用 |
| `/api/admin/enterprises/list` | 无业务必填参数 | 返回企业及 `department_count`、`user_count` |
| `/api/admin/enterprises/add` | `name` | 新增企业，不写入 `enterprises.user_id` |
| `/api/admin/enterprises/update` | `id`、`name` | 本阶段仅修改企业名称 |
| `/api/admin/enterprises/delete` | `id` | 存在部门、隐患图片或排查报告时拒绝删除 |
| `/api/admin/departments/list` | 可选 `enterprise_id` | 返回部门及所属企业 ID |
| `/api/admin/departments/add` | `enterprise_id`、`name` | 新增企业内唯一部门 |
| `/api/admin/departments/update` | `id`、`enterprise_id`、`name` | 更新部门；有用户时禁止跨企业移动 |
| `/api/admin/departments/delete` | `id` | 存在正常或锁定用户时拒绝；仅有关联禁用用户时，事务内解除其部门关联后删除 |

允许的权限 Key：`enterprise:manage`、`image:manage`、`analysis:run`、`report:download`、`knowledge:view`。非白名单权限会被后端拒绝且不会落库。

用户企业字段不作为请求入库字段。列表中的 `enterprise_id`、`enterprise_name` 始终由 `users.department_id -> departments.enterprise_id` 推导。

---

## 后端阶段 C 已实现接口（2026-06-09）

### 企业综合查询

- **URL**: `POST /api/admin/enterprises/query`
- **参数**（均为可选）：
  | 参数 | 类型 | 说明 |
  |------|------|------|
  | `keyword` | String | 搜索企业名称/检查员/联系人/地区 |
  | `industry` | String | 行业筛选 |
  | `enterprise_type` | String | 企业类型筛选 |
  | `risk_level` | String | 风险等级：高风险/中风险/低风险 |
  | `status` | String | 档案状态：active/archived |
  | `inspection_date` | String | 排查月份 YYYY-MM |
  | `sort_by` | String | date/risk/name，默认 date |

- **返回示例**：
```json
{
  "code": 0,
  "data": [{
    "id": 1,
    "name": "示例企业",
    "region": "陕西省西安市",
    "address": "详细地址",
    "industry": "建筑施工",
    "enterprise_type": "有限责任公司",
    "scale": "中型",
    "contact": "张经理",
    "phone": "13800138001",
    "username": "检查员小王",
    "inspector_name": "李工",
    "inspection_date": "2026-06-01",
    "inspection_status": "待整改",
    "status": "active",
    "risk_level": "中风险",
    "hazard_count": 7,
    "pending_count": 2,
    "rectified_count": 5,
    "image_count": 5,
    "analysis_count": 3,
    "report_count": 2,
    "main_hazards": ["临时用电", "高处作业"],
    "recent_images": ["临时配电箱.jpg"],
    "recent_analyses": ["排查分析"],
    "reports": [{ "id": 101, "title": "排查报告", "created_at": "...", "word_path": "...", "pdf_path": "..." }],
    "updated_at": "2026-06-09"
  }]
}
```

报告列表补充字段：

- `knowledge_ref_count`：该报告关联的本地知识条款数量
- `knowledge_refs`：该报告前 3 条引用依据摘要，字段同 `knowledge_refs`

### 企业档案更新（扩展）

- **URL**: `POST /api/admin/enterprises/update`（已扩展，向后兼容阶段 B）
- **参数**：`id` + 任意企业档案字段（`name`/`region`/`address`/`industry`/`enterprise_type`/`scale`/`contact`/`phone`/`inspector_name`/`inspection_date`/`inspection_status`/`status`/`production_process`）
- **行为**：仅在包含 `industry`/`region`/`inspection_status`/`status` 等档案字段时触发档案更新；仅含 `id`/`name` 时仍执行阶段 B 组织名称更新

### 企业查询导出

- **URL**: `POST /api/admin/enterprises/export`
- **参数**：与 query 接口相同的筛选条件
- **返回**：`{ file_path: "exports/enterprises_export_20260609.csv", file_name: "..." }`
- **文件位置**：可通过 `/uploads/exports/` 路径下载

### 企业归属强制校验

- 隐患图片上传前端已补充 `enterprise_id` 参数（`process.vue`）。
- 多图 AI 分析前端已补充 `enterprise_id` 参数（`process.vue`）。
- 后端 `/api/hazard/analyze` 和 `/api/enterprise/get` 已通过 `findByUserOrganization` 推导企业归属。

## 阶段 B 模块化整理说明（2026-06-09）

- 阶段 B 用户、企业、部门接口已拆分到独立后端路由模块。
- 本次整理未改变任何接口路径、请求参数、返回结构或错误语义。
- 前端 `pages/admin/users.vue` 继续调用相同阶段 B 接口，仅将请求封装移至公共 API 模块。
- **阶段 B 模块化整理无 DDL 变更。**
