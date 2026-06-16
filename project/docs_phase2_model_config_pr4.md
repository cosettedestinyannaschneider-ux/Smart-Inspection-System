# Phase 2 PR4：AI 模型配置安全基线

## 本次改动解决了什么问题

- `ai_model_configs.api_key_encrypted` 字段历史上写入的仍是明文值，存在高风险泄露隐患。
- 模型配置更新接口允许请求字段直接映射为 SQL 列，存在越权更新风险。
- 激活模型配置时先全量置零、再启用目标记录，但未使用事务，存在并发下的状态不一致风险。
- 管理端模型配置页面仍使用 mock 数据，无法验证真实后端安全逻辑是否生效。

## 主要实现方式

- 新增 `backend/bll/modelConfigCryptoService.js`：
  - 使用 `AES-256-GCM` 对 API Key 做对称加密
  - 统一提供加密、解密、脱敏与密钥配置检查能力
- 新增 `backend/bll/modelConfigService.js`：
  - 统一封装模型配置新增、更新、启用、删除与列表输出逻辑
  - 列表与当前配置接口只返回 `api_key_masked`
  - 历史明文记录采用“读时识别、写时迁移”为密文
- 重构 `backend/dal/aiModelConfigDal.js`：
  - 更新字段改为数据库列白名单
  - `setActive` 改为事务切换，保证同一时间只有一个启用配置
- 调整 `backend/bll/aiService.js`：
  - 运行时读取真实密钥时通过服务层解密，不再直接使用数据库字段原值
- 调整 `backend/dal/schemaInit.js`：
  - 初始化默认模型配置时，如已配置 `MODEL_CONFIG_SECRET`，会直接加密写入
- 管理端 [model-config.vue](C:/tmp/smart-inspection-phase2-modelcfg/project/uni-app-frontend/pages/admin/model-config.vue) 改为真实联调：
  - 列表、添加、编辑、启用、删除均走后端接口
  - 前端不再看到明文 API Key，也不会回填旧密钥

## 是否涉及数据库、配置或部署

- 不涉及 DDL 变更，`project/database/schema.sql` 无需修改。
- 新增后端环境变量：
  - `MODEL_CONFIG_SECRET`
- 已同步更新：
  - `project/backend/.env.example`
  - `project/README.md`
  - `project/DEPLOY_DOCKER.md`

## 接口与行为说明

- `POST /api/admin/config/ai/list`
  - 返回脱敏后的 `api_key_masked`
  - 不再返回原始 `api_key_encrypted`
- `POST /api/admin/config/ai/add`
  - `provider` 必填
  - `api_key` 必填，后端加密后入库
- `POST /api/admin/config/ai/update`
  - 仅允许白名单字段更新
  - `api_key` 留空时保持原密钥
- `POST /api/admin/config/ai/activate`
  - 事务切换当前启用模型
- `POST /api/admin/config/ai/delete`
  - 当前启用模型禁止删除

## 本地验证建议

### 后端

- `npm run check`

### 前端

- `npm run build:h5`

### 手动验证

1. 管理员进入 AI 模型配置页，可加载真实列表。
2. 新增模型时，后端数据库中 `api_key_encrypted` 不应再是明文。
3. 编辑模型但留空 `api_key` 时，原密钥应保持不变。
4. 删除当前启用模型时，后端应明确拒绝。
5. 切换启用模型后，列表中任一时刻只应有一个 `is_active=1`。

## 风险说明

- 若数据库中已经存在加密格式记录，但环境未配置 `MODEL_CONFIG_SECRET`，模型配置读取会被后端拒绝，这是故意保留的显式失败。
- 若数据库中仍是历史明文记录且暂未配置 `MODEL_CONFIG_SECRET`，列表仍可脱敏展示，但不会自动迁移为密文；补齐环境变量后会在读取时自动迁移。
