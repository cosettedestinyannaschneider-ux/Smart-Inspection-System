# 安全生产社会化服务智检系统 — 数据库 E-R 图

> 优化版本，覆盖立项书 8 大核心模块。

```mermaid
erDiagram
  %% ===== 核心实体 =====

  departments ||--o{ users : "department_id"
  users ||--o{ enterprises : "user_id"
  users ||--o{ hazard_images : "user_id"
  users ||--o{ inspection_reports : "user_id"
  users ||--o{ sessions : "user_id"
  users ||--o{ action_logs : "user_id"

  enterprises ||--o{ hazard_images : "enterprise_id"
  enterprises ||--o{ inspection_reports : "enterprise_id"

  sessions ||--o{ inspection_reports : "session_id"

  inspection_reports ||--o{ inspection_report_images : "report_id"
  hazard_images ||--o{ inspection_report_images : "image_id"

  knowledge_categories ||--o{ knowledge : "category_id"

  %% ===== 表定义 =====

  departments {
    INT id PK "自增主键"
    VARCHAR name UK "部门名称，唯一"
    TIMESTAMP created_at
  }

  users {
    INT id PK "自增主键"
    VARCHAR username UK "用户名，唯一"
    VARCHAR password "scrypt加盐哈希"
    VARCHAR role "admin | user"
    INT department_id FK "所属部门"
    ENUM status "active|disabled|locked"
    INT login_attempts "连续登录失败次数"
    DATETIME locked_until "锁定到期时间"
    DATETIME last_login_at "最后登录时间"
    TIMESTAMP created_at
    TIMESTAMP updated_at
  }

  enterprises {
    INT id PK "自增主键，独立ID"
    INT user_id FK "归属用户"
    VARCHAR name "企业名称"
    VARCHAR region "所在地区"
    VARCHAR address "详细地址"
    VARCHAR contact "联系人"
    VARCHAR phone "联系电话"
    VARCHAR industry "所属行业"
    VARCHAR enterprise_type "企业类型"
    VARCHAR scale "企业规模"
    TEXT production_process "生产工艺等扩展字段JSON"
    VARCHAR inspector_name "排查人员"
    DATE inspection_date "排查日期"
    VARCHAR project_name "项目名称"
    ENUM status "active|archived"
    TIMESTAMP created_at
    TIMESTAMP updated_at
    INDEX idx_enterprises_name "name"
    INDEX idx_enterprises_region "region"
    INDEX idx_enterprises_user_id "user_id"
  }

  hazard_images {
    INT id PK "自增主键"
    INT user_id FK "上传用户"
    INT enterprise_id FK "关联企业"
    VARCHAR file_path "文件存储路径"
    VARCHAR original_name "原始文件名"
    BIGINT file_size "文件大小(字节)"
    INT image_width "图片宽度"
    INT image_height "图片高度"
    VARCHAR label "文字标注"
    VARCHAR hazard_type "隐患类型分类"
    ENUM status "active|deleted"
    TIMESTAMP created_at
    TIMESTAMP updated_at
    INDEX idx_hi_user_id "user_id"
    INDEX idx_hi_enterprise_id "enterprise_id"
    INDEX idx_hi_hazard_type "hazard_type"
  }

  sessions {
    VARCHAR id PK "会话标识UUID"
    INT user_id FK "所属用户"
    VARCHAR title "会话标题"
    ENUM status "active|archived"
    TIMESTAMP created_at
    TIMESTAMP updated_at
    INDEX idx_sessions_user_id "user_id"
  }

  inspection_reports {
    INT id PK "自增主键"
    INT user_id FK "所属用户"
    INT enterprise_id FK "关联企业"
    VARCHAR session_id FK "关联会话"
    VARCHAR title "报告标题"
    TEXT prompt "用户输入/AI prompt"
    LONGTEXT result "AI分析结果JSON"
    VARCHAR word_path "Word报告路径"
    VARCHAR pdf_path "PDF报告路径"
    ENUM status "draft|completed"
    TIMESTAMP created_at
    TIMESTAMP updated_at
    INDEX idx_ir_user_id "user_id"
    INDEX idx_ir_session_id "session_id"
    INDEX idx_ir_enterprise_id "enterprise_id"
    INDEX idx_ir_created_at "created_at"
  }

  inspection_report_images {
    INT id PK "自增主键"
    INT report_id FK "报告ID"
    INT image_id FK "图片ID"
    TIMESTAMP created_at
    UNIQUE uk_report_image "report_id,image_id"
  }

  knowledge_categories {
    INT id PK "自增主键"
    VARCHAR name UK "分类名称，唯一"
    VARCHAR description "分类描述"
    INT sort "排序序号"
    TIMESTAMP created_at
    TIMESTAMP updated_at
  }

  knowledge {
    INT id PK "自增主键"
    VARCHAR title "文档标题"
    VARCHAR file_path "文件路径"
    BIGINT file_size "文件大小"
    VARCHAR file_type "文件类型 pdf|docx|image"
    TEXT description "文档描述"
    INT category_id FK "所属分类"
    ENUM status "active|archived"
    TIMESTAMP created_at
    TIMESTAMP updated_at
    INDEX idx_knowledge_category "category_id"
    INDEX idx_knowledge_title "title"
  }

  action_logs {
    INT id PK "自增主键"
    INT user_id FK "操作用户"
    VARCHAR action "操作类型"
    TEXT details "操作详情JSON"
    VARCHAR ip_address "客户端IP"
    TIMESTAMP created_at
    INDEX idx_al_user_id "user_id"
    INDEX idx_al_action "action"
    INDEX idx_al_created_at "created_at"
  }

  ai_model_configs {
    INT id PK "自增主键"
    VARCHAR name "配置名称"
    VARCHAR base_url "API地址"
    VARCHAR api_key_encrypted "加密存储的密钥"
    VARCHAR model_name "模型标识"
    BOOLEAN is_active "是否启用"
    INT max_tokens "最大token"
    DECIMAL temperature "温度参数"
    INT timeout_ms "超时毫秒"
    TIMESTAMP created_at
    TIMESTAMP updated_at
  }

  report_templates {
    INT id PK "自增主键"
    VARCHAR name "模板名称"
    VARCHAR file_path "模板文件路径"
    TEXT description "模板说明"
    BOOLEAN is_default "是否默认模板"
    TIMESTAMP created_at
    TIMESTAMP updated_at
  }
```

## 优化清单（对比旧版）

### 新增表（6 张）
| 表名 | 解决哪个立项书需求 |
|------|-------------------|
| `departments` | 用户需填写"所属部门" |
| `sessions` | 会话持久化，服务器重启不丢失 |
| `inspection_report_images` | 解决多图分析结果与图片的多对多关联 |
| `ai_model_configs` | 对接多模型、管理员动态切换 |
| `report_templates` | 报告格式标准化 |

### 字段增强（关键变更）
| 表 | 新增字段 | 原因 |
|----|---------|------|
| users | `status`, `login_attempts`, `locked_until`, `last_login_at` | 账户安全锁定、操作留痕 |
| users | `department_id` FK | 立项书要求 |
| users | `username` UNIQUE | 防止重复注册 |
| enterprises | 独立 `id` PK | 一个用户可排查多家企业 |
| enterprises | `industry`, `enterprise_type`, `scale`, `inspector_name`, `inspection_date` | 立项书表单字段 |
| hazard_images | `enterprise_id` FK | 图片与企业自动关联 |
| hazard_images | `hazard_type`, `image_width`, `image_height` | 按隐患类型分类、前端展示 |
| inspection_reports | `enterprise_id` FK, `title`, `status` | 报告与企业直接关联、按状态管理 |
| knowledge | `file_size`, `file_type`, `status` | 文件管理完整性 |
| action_logs | `ip_address` | 安全审计 |
