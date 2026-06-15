# 后端阶段 B：用户、企业、部门与权限管理实施计划

## 1. 阶段目标

基于已完成的阶段 A 数据库组织结构，实现并联调管理员用户管理页面所需的真实后端能力：

```text
企业 1 ── N 部门
部门 1 ── N 用户
用户 1 ── N user_permissions
```

本阶段仅完成用户、企业、部门和用户权限管理闭环，不扩展其他管理员模块。

## 2. 开始前必须确认

- 阶段 A 数据库迁移已完成。
- `phase_a_migration_conflicts` 当前为空。
- `enterprises.user_id` 仅为历史兼容字段，禁止新业务继续写入。
- 用户所属企业必须通过 `users.department_id -> departments.enterprise_id` 推导。
- 当前真实库基线：企业 5、部门 5、用户 11、权限 35。

## 3. 实施范围

### 3.1 后端分层

- 路由：继续放在 `backend/server.js`。
- 业务规则与事务：新增或扩展 `backend/bll/` 服务。
- 数据访问：新增或扩展 `backend/dal/`。
- 所有新增代码、接口和复杂逻辑必须有清晰中文注释。

### 3.2 用户管理

需要完成：

- 用户列表返回企业、部门和权限集合。
- 新增用户接收 `department_id`、`permissions`。
- 更新用户接收 `target_id`、`department_id`、`permissions`。
- 用户与权限保存必须使用数据库事务。
- 普通用户必须绑定有效部门；管理员允许部门为空。
- 禁止删除或禁用当前登录管理员。
- 禁止普通用户关联不存在的部门。

目标接口：

- `POST /api/admin/users/list`
- `POST /api/admin/users/add`
- `POST /api/admin/users/update`
- `POST /api/admin/users/delete`

### 3.3 企业组织管理

需要新增：

- `POST /api/admin/enterprises/list`
- `POST /api/admin/enterprises/add`
- `POST /api/admin/enterprises/update`
- `POST /api/admin/enterprises/delete`

关键规则：

- 企业名称全局唯一。
- 新建企业不得写入历史字段 `enterprises.user_id`。
- 企业存在部门、隐患图片、排查报告或其他业务关联时禁止删除。
- 本阶段企业更新只允许修改组织名称，不实现企业综合档案编辑。

### 3.4 部门管理

完善现有接口：

- `POST /api/admin/departments/list`
- `POST /api/admin/departments/add`
- `POST /api/admin/departments/update`
- `POST /api/admin/departments/delete`

关键规则：

- 新增和更新必须携带有效 `enterprise_id`。
- 部门名称在同一企业内唯一。
- 已分配用户的部门禁止删除。
- 已分配用户的部门禁止跨企业移动。

### 3.5 权限持久化

使用 `user_permissions` 关联表，不新增 JSON 权限字段。

允许的权限 Key：

- `enterprise:manage`
- `image:manage`
- `analysis:run`
- `report:download`
- `knowledge:view`

关键规则：

- 后端使用权限白名单过滤请求。
- 用户新增和更新时，在同一事务中替换权限集合。
- 管理员用户不依赖 `user_permissions` 判断管理员身份。
- 用户列表返回前端需要的权限对象。

### 3.6 操作日志

以下操作成功后写入 `action_logs`：

- 新增、更新、禁用用户。
- 新增、更新、删除企业。
- 新增、更新、删除部门。
- 更新用户权限。

## 4. 推荐实施顺序

1. 新增 `userPermissionDal.js`，实现权限查询与事务内替换。
2. 扩展企业、部门、用户 DAL，补齐计数、存在性和删除保护查询。
3. 新增组织管理业务服务，集中执行校验和事务。
4. 调整用户管理接口，完成企业、部门和权限字段返回。
5. 新增企业组织管理接口。
6. 完善部门管理接口和操作日志。
7. 将 `pages/admin/users.vue` 的模拟数据替换为真实接口。
8. 执行 H5 流程测试和微信小程序兼容检查。
9. 更新接口、设计、待办和测试文档。

## 5. 测试与验收

### 5.1 功能测试

- 创建企业 -> 创建部门 -> 创建普通用户 -> 分配权限完整流程通过。
- 用户列表正确返回企业、部门和权限。
- 用户更新部门和权限后立即生效。
- 企业和部门重命名后列表立即更新。

### 5.2 约束与安全测试

- 重复企业名称被拒绝。
- 同一企业内重复部门名称被拒绝。
- 不存在的部门或企业 ID 被拒绝。
- 已分配用户的部门禁止删除和跨企业移动。
- 有部门或业务数据的企业禁止删除。
- 当前登录管理员禁止删除或禁用自己。
- 非白名单权限 Key 不得入库。
- SQL 使用参数化查询。

### 5.3 联调验收

- 管理员用户管理页面不再依赖 `admin-mock-data.js` 的组织与用户数据。
- H5 完成企业、部门、用户和权限管理完整流程。
- 微信小程序端完成相同流程或完成可验证的兼容测试记录。
- 不修改其他管理员页面的模拟数据和接口。

## 6. 阶段交付物

- 后端用户、企业、部门和权限管理代码。
- 管理员用户管理页面真实接口联调。
- 更新后的 `API_DOC.md`。
- 更新后的 `DESIGN_DOC.md`。
- 更新后的 `BACKEND_TODO.md`。
- 更新后的 `TEST_RECORD.md`。
- 如数据库结构无变化，明确记录“阶段 B 无 DDL 变更”。

## 7. 禁止事项

- 不删除 `enterprises.user_id`。
- 不重新执行或改写阶段 A 已完成的数据迁移。
- 不实现企业综合查询、企业档案导出或企业详情聚合接口。
- 不实现知识库、AI 配置、日志列表、模板或备份模块联调。
- 不重构登录认证体系或引入多租户、消息队列、RAG、向量数据库。
- 不一次性替换其他管理员页面的模拟数据。
