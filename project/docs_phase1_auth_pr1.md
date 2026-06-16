# Phase 1 PR1 交付说明

## 变更目标

- 建立用户认证底座，采用 `Access JWT + auth_sessions`。
- 登录成功后返回 `access_token`、`token_type`、`expires_at` 和 `user`。
- 增加 `/api/auth/me` 与 `/api/logout`。
- 前端统一保存 Token，并自动为请求、上传、下载注入 `Authorization: Bearer ...`。
- 管理员禁用用户时，立即撤销该用户的全部活动登录会话。

## 数据库变更

新增表：`auth_sessions`

核心字段：

- `jti`
- `user_id`
- `role_snapshot`
- `status`
- `expires_at`
- `revoked_at`
- `last_seen_at`
- `last_ip`
- `user_agent`
- `created_at`
- `updated_at`

实际初始化入口：

- [schema.sql](C:/tmp/smart-inspection-phase1-auth1/project/database/schema.sql)
- [schemaInit.js](C:/tmp/smart-inspection-phase1-auth1/project/backend/dal/schemaInit.js)

## 新增接口

### `POST /api/login`

请求参数：

```json
{
  "username": "demo",
  "password": "demo123"
}
```

成功响应示例：

```json
{
  "code": 0,
  "msg": "ok",
  "success": true,
  "access_token": "jwt_token_here",
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

### `GET /api/auth/me`

请求头：

```http
Authorization: Bearer <access_token>
```

成功响应示例：

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

### `POST /api/logout`

请求头：

```http
Authorization: Bearer <access_token>
```

成功响应示例：

```json
{
  "code": 0,
  "msg": "已退出登录",
  "success": true,
  "data": null
}
```

## 前端变更

关键文件：

- [api-config.js](C:/tmp/smart-inspection-phase1-auth1/project/uni-app-frontend/common/api-config.js)
- [main.js](C:/tmp/smart-inspection-phase1-auth1/project/uni-app-frontend/main.js)
- [login.vue](C:/tmp/smart-inspection-phase1-auth1/project/uni-app-frontend/pages/login/login.vue)
- [AdminShell.vue](C:/tmp/smart-inspection-phase1-auth1/project/uni-app-frontend/components/admin/AdminShell.vue)
- [history.vue](C:/tmp/smart-inspection-phase1-auth1/project/uni-app-frontend/pages/history/history.vue)
- [process.vue](C:/tmp/smart-inspection-phase1-auth1/project/uni-app-frontend/pages/process/process.vue)

变更要点：

- 登录后保存 `user + accessToken + expiresAt`。
- 请求、上传、下载统一注入 Bearer Token。
- 退出登录时调用 `/api/logout` 并清理本地登录态。
- 页面读取用户信息改为统一从登录会话中获取。

## 本地验证

后端语法检查命令：

```powershell
npm run check
```

已验证结果：

- 通过，`[syntax-check] passed: 37 files`

## 风险与兼容说明

- 本 PR 已同步补齐 `auth_sessions` 的完整 DDL 到 `project/database/schema.sql`，避免初始化脚本与总设计 DDL 脱节。
- 本 PR 先建立认证底座，用户业务接口仍暂时保留 `user_id` 传参兼容；彻底收口留到 Phase 1 PR2。
- 现有页面大部分请求会通过全局 `uni.request / uploadFile / downloadFile` 包装自动带 Token。
- 若环境未配置 `JWT_ACCESS_SECRET`，后端会使用开发兜底密钥，仅适用于本地调试。
