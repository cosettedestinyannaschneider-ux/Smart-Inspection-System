# Phase 1 PR2 交付说明

## 变更目标

- 完成普通用户核心接口的身份收口，后端不再信任客户端传入的 `user_id`。
- 为隐患图片、报告 Word/PDF、历史回放图片增加受控文件访问能力。
- 统一前端用户工作台与历史页的请求方式，确保 Bearer Token 会随接口、上传和下载一起生效。
- 关闭普通用户侧知识库写入口，保留只读查询。

## 后端实现摘要

关键文件：

- [server.js](C:/tmp/smart-inspection-phase1-auth2/project/backend/server.js)
- [authService.js](C:/tmp/smart-inspection-phase1-auth2/project/backend/bll/authService.js)
- [authToken.js](C:/tmp/smart-inspection-phase1-auth2/project/backend/common/authToken.js)
- [fileAccess.js](C:/tmp/smart-inspection-phase1-auth2/project/backend/common/fileAccess.js)
- [historyDal.js](C:/tmp/smart-inspection-phase1-auth2/project/backend/dal/historyDal.js)

本次收口的用户侧接口：

- `GET /api/departments/list`
- `POST /api/hazard/images/upload`
- `GET /api/hazard/images/list`
- `POST /api/hazard/images/delete`
- `POST /api/hazard/images/label`
- `POST /api/hazard/analyze`
- `POST /api/process`
- `POST /api/clear-session`
- `GET /api/sessions`
- `GET /api/session/:session_id`
- `POST /api/session/delete`
- `POST /api/history/update-result`
- `POST /api/history/delete`
- `GET /api/history`
- `POST /api/enterprise/get`
- `POST /api/enterprise/update`
- `GET /api/knowledge/list`
- `GET /api/knowledge/categories/list`

权限门对应关系：

- `enterprise:manage`
- `image:manage`
- `analysis:run`
- `report:download`
- `knowledge:view`

## 受控文件访问

新增或启用的受控文件接口：

- `GET /api/files/hazard-images/:image_id`
- `GET /api/files/reports/:report_id/image`
- `GET /api/files/reports/:report_id/word`
- `GET /api/files/reports/:report_id/pdf`

实现要点：

- 报告与隐患图片不再依赖公开 `/uploads/...` 直链作为最终访问方式。
- 静态 `/uploads` 仅保留低风险公开文件访问；隐患图片与报告文件会被静态层拦截。
- 文件接口支持两种鉴权方式：
  - `Authorization: Bearer <access_token>`
  - 后端返回的短时 `access_token` 查询参数票据
- 文件票据会校验资源类型、资源 ID、格式和登录会话有效性。

## 正确性修复

- 历史记录与会话回放中的 `image_path` 不再错误地把报告 ID 当成隐患图片 ID 使用。
- 新增“按报告回放图片”的受控访问地址，优先读取 `inspection_report_images` 关联图片，兼容旧单图 `image_path` 数据。
- 编辑分析结果时，报告重新生成会沿用现有报告-图片关联，不再错误依赖 AI 返回体中的 `image_id` 作为数据库主键映射。

## 前端变更摘要

关键文件：

- [api-config.js](C:/tmp/smart-inspection-phase1-auth2/project/uni-app-frontend/common/api-config.js)
- [process.vue](C:/tmp/smart-inspection-phase1-auth2/project/uni-app-frontend/pages/process/process.vue)
- [history.vue](C:/tmp/smart-inspection-phase1-auth2/project/uni-app-frontend/pages/history/history.vue)

主要调整：

- 用户工作台与历史页改用统一请求封装，自动带上 `Authorization: Bearer ...`。
- 新增 `requestTask`，保留可中止请求能力，兼容“停止分析”场景。
- 图片预览、报告下载统一直接使用后端返回的受控 URL。
- 前端不再向用户侧接口传递 `user_id`。

## 数据库与配置

- 本 PR **不新增 DDL**。
- 依赖已在 PR1 引入的认证配置：
  - `JWT_ACCESS_SECRET`
  - `JWT_ACCESS_EXPIRES_IN`
- 新增可选配置：
  - `JWT_FILE_EXPIRES_IN`（默认 `30m`）

## 本地验证

后端检查：

```powershell
npm run check
```

前端构建：

```powershell
npm run build:h5
```

建议手动验证：

1. 普通用户登录后进入工作台。
2. 上传隐患图片并刷新图片列表。
3. 选择多图执行分析，确认返回 Word/PDF 受控下载地址。
4. 打开历史记录，确认可下载报告、会话回放可显示对应图片。
5. 使用抓包或手工构造请求验证：即使伪造 `user_id`，也不能访问他人企业、图片、报告和会话数据。

## 风险与说明

- 本 PR 只处理普通用户主链路，管理员模块仍保留原有鉴权方式，计划在 Phase 2 收口。
- H5 下载和 `<image>` 预览无法稳定携带自定义 Header，因此受控文件接口保留短时查询参数票据作为兼容方案。
- 旧数据库中若仍存在历史报告 `image_path` 但没有 `inspection_report_images` 关联，系统会回退使用旧字段，确保单图历史记录可继续预览。
