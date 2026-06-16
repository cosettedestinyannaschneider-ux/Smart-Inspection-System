# Phase 2 PR3：管理员鉴权与管理端登录态收口

## 本次改动解决了什么问题

- 管理员端前端页面仍存在通过 `admin_id` 传参与识别身份的残留逻辑。
- 后端 CORS 与接口实现中仍保留 `X-Admin-Id`、`admin_id` 的历史兼容痕迹，容易让后续维护者误以为这些字段仍是可信身份来源。
- 管理员页面进入时主要依赖本地缓存用户信息，缺少一次基于服务端会话的登录态确认。

## 主要实现方式

- 后端移除 CORS 允许头中的 `X-Admin-Id`，避免继续对外暴露旧鉴权入口。
- 后端 `POST /api/admin/config/ai/update` 不再读取或解构 `admin_id`，统一仅通过 `adminAuth` 中间件识别管理员身份。
- 前端 `common/api/admin-organization-api.js` 改为统一走 `request` 封装，由 `Authorization: Bearer <access_token>` 自动携带管理员身份。
- 前端用户管理页与企业查询页移除 `admin_id` 传参，统一改为 Bearer Token 鉴权。
- `AdminShell.vue` 在管理页初始化时调用 `GET /api/auth/me`，用后端会话校验当前管理员登录状态；若失效则清理本地登录态并跳回登录页。

## 是否涉及数据库、配置或部署

- 不涉及数据库结构变更。
- 不新增配置项。
- 不涉及部署脚本调整。

## 接口与文档同步

- 更新 `project/API_DOC.md` 中管理员接口鉴权方式说明，统一改为 `Authorization: Bearer <access_token>`。
- 更新 `project/DESIGN_DOC.md` 中管理员鉴权实现说明，明确 `adminAuth` 仅信任 Bearer Token 登录态。

## 本地验证建议

### 后端

- `npm run check`

### 前端

- `npm run build:h5`

### 手动验证

1. 管理员登录后进入工作台与用户管理页，应能正常加载。
2. 删除本地 token 或调用 `/api/logout` 后，再进入任一管理页，应被重定向到登录页。
3. 管理员页面发起请求时，请求体中不再包含 `admin_id`。

## 风险说明

- 本次仅收口管理员身份识别方式，不处理 AI 配置加密、模型配置字段白名单重构等 Phase 2 PR4 内容。
- 企业查询页中的导出下载与报告下载链路本次未改造为新的受控文件接口，保持现状以控制 PR 范围。
