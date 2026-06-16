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
- **参数**: `name` (String, 必填), `region`, `address`, `contact`, `phone`, `industry`, `enterprise_type`, `scale`, `inspector_name`, `inspection_date`, `project_name`

---

## 3. AI 巡检与处理

### 3.1 AI 智能巡检（单文件）
- **URL**: `POST /api/process`
- **方法**: `POST` (Multipart/form-data)
- **请求头**: `Authorization: Bearer <access_token>`
- **权限**: `analysis:run`
- **参数**: `prompt` (String), `session_id` (String, 可选), `model_id` (Number, 可选), `file` (File, 可选)
- **返回**: `{ code: 0, result, wordPath, pdfPath, sessionId, id }`

### 3.2 多图智能隐患分析
- **URL**: `POST /api/hazard/analyze`
- **方法**: `POST` (JSON)
- **请求头**: `Authorization: Bearer <access_token>`
- **权限**: `analysis:run`
- **参数**: `prompt` (String, 可选), `session_id` (String, 可选), `image_ids` (Number[]), `enterprise_id` (Number, 可选), `model_id` (Number, 可选)
- **返回**: `{ code: 0, result, wordPath, pdfPath, sessionId, id }`

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
- **返回**: `{ code: 0, data: [{ id, prompt, result, image_path, wordPath, pdfPath, ... }] }`

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
- **返回**: `{ code: 0, data: [{ id, prompt, result, image_path, wordPath, pdfPath, ... }] }`

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
| POST | `/api/admin/knowledge/add` | 上传知识文件 |
| POST | `/api/admin/knowledge/update` | 更新知识条目 |
| POST | `/api/admin/knowledge/delete` | 归档知识条目 |
| POST | `/api/admin/knowledge/categories/*` | 分类 CRUD |

### 8.4 AI 模型配置
| 方法 | URL | 说明 |
|------|-----|------|
| POST | `/api/admin/config/ai` | 当前激活的配置 |
| POST | `/api/admin/config/ai/list` | 全部配置列表 |
| POST | `/api/admin/config/ai/add` | 新增模型配置 |
| POST | `/api/admin/config/ai/update` | 更新模型配置 |
| POST | `/api/admin/config/ai/activate` | 激活指定配置 |
| POST | `/api/admin/config/ai/delete` | 删除配置 |

> 新增配置示例：`{ name, provider, base_url, api_key, model_name, max_tokens?, temperature?, timeout_ms? }`

#### 8.4.1 第二阶段前端对接约定

> 当前状态：知识库管理页面仍为后续联调项；AI 模型配置页面已切换为真实接口，并统一只展示脱敏密钥。

##### 知识库接口参数

| 接口 | 请求参数 | 前端说明 |
|---|---|---|
| `POST /api/admin/knowledge/list` | 无业务参数 | 页面初始化加载文档列表 |
| `POST /api/admin/knowledge/add` | Multipart：`title`、`description`、`category_id`、`file`；替换文件时增加 `id`、`isUpdate=true` | 新增必须上传文件 |
| `POST /api/admin/knowledge/update` | `id`、`title`、`description`、`category_id` | 编辑但不更换文件 |
| `POST /api/admin/knowledge/delete` | `id` | 单条软删除 |
| `POST /api/admin/knowledge/categories/list` | 无业务参数 | 页面初始化加载分类 |
| `POST /api/admin/knowledge/categories/add` | `name`、`sort` | 新增分类 |
| `POST /api/admin/knowledge/categories/update` | `id`、`name`、`sort` | 编辑分类 |
| `POST /api/admin/knowledge/categories/delete` | `id` | 删除无关联文档的分类 |

知识列表页面需要的返回字段：

```json
{
  "id": 1,
  "title": "中华人民共和国安全生产法",
  "description": "2021年修订版",
  "category_id": 1,
  "category_name": "煤矿安全",
  "file_path": "uploads/knowledge/example.pdf",
  "file_type": "pdf",
  "status": "active",
  "created_at": "2026-06-09"
}
```

##### AI 模型配置接口参数

| 接口 | 请求参数 | 前端说明 |
|---|---|---|
| `POST /api/admin/config/ai/list` | 无业务参数 | 必须返回脱敏的 `api_key_masked`，禁止返回原始密钥字段 |
| `POST /api/admin/config/ai/add` | `name`、`provider`、`base_url`、`api_key`、`model_name`、`max_tokens`、`temperature`、`timeout_ms` | 新增时 API Key 必填 |
| `POST /api/admin/config/ai/update` | `id` 与允许修改的配置字段 | `api_key` 留空时保持原密钥 |
| `POST /api/admin/config/ai/activate` | `id` | 切换当前启用模型 |
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

### 8.5 报告模板管理
| 方法 | URL | 说明 |
|------|-----|------|
| POST | `/api/admin/templates/list` | 模板列表 |
| POST | `/api/admin/templates/add` | 新增模板 |
| POST | `/api/admin/templates/update` | 更新模板 |
| POST | `/api/admin/templates/set-default` | 设为默认模板 |
| POST | `/api/admin/templates/delete` | 删除模板 |

### 8.6 操作日志
- **URL**: `POST /api/admin/logs/list`
- **返回**: 最近 500 条操作记录（含 IP 地址）

### 8.7 全量历史
- **URL**: `POST /api/admin/history`
- **返回**: 全量用户排查报告列表

### 8.8 第三阶段前端对接约定

> 当前状态：企业数据查询、操作日志、报告模板和数据备份页面已完成 UI 与模拟交互，真实接口尚未接入。

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

#### 报告模板文件上传

- 模板新增和替换文件应使用 Multipart 上传。
- 文件字段名建议统一为 `file`，仅允许 DOCX。
- 编辑但不更换文件时，可继续使用 JSON 更新模板名称和说明。

#### 数据备份目标接口

| 方法 | URL | 说明 |
|---|---|---|
| POST | `/api/admin/backup/create` | 创建手动数据库备份 |
| POST | `/api/admin/backup/records` | 获取备份记录 |
| POST | `/api/admin/backup/policy/get` | 获取自动备份策略 |
| POST | `/api/admin/backup/policy/update` | 更新自动备份周期 |

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
