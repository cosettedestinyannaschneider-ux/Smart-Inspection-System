-- ============================================================================
-- 安全生产社会化服务智检系统 — 完整数据库 DDL
-- 基于立项书 v20260414，MySQL 5.7+ / InnoDB / utf8mb4
-- ============================================================================

CREATE DATABASE IF NOT EXISTS ai_project
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;
USE ai_project;

-- ============================================================================
-- 1. 企业信息表：企业作为组织主数据，不再归属于单个用户
-- ============================================================================
CREATE TABLE enterprises (
  id                INT           NOT NULL AUTO_INCREMENT,
  user_id           INT           DEFAULT NULL COMMENT '历史归属用户，仅用于兼容旧数据，不作为组织归属依据',
  name              VARCHAR(200)  NOT NULL COMMENT '企业名称',
  region            VARCHAR(200)  DEFAULT NULL COMMENT '所在地区',
  address           VARCHAR(500)  DEFAULT NULL COMMENT '详细地址',
  contact           VARCHAR(100)  DEFAULT NULL COMMENT '联系人',
  phone             VARCHAR(50)   DEFAULT NULL COMMENT '联系电话',
  industry          VARCHAR(100)  DEFAULT NULL COMMENT '所属行业',
  enterprise_type   VARCHAR(100)  DEFAULT NULL COMMENT '企业类型',
  scale             VARCHAR(50)   DEFAULT NULL COMMENT '企业规模',
  production_process TEXT         DEFAULT NULL COMMENT '生产工艺等扩展字段(JSON)',
  inspector_name    VARCHAR(100)  DEFAULT NULL COMMENT '排查人员',
  inspection_date   DATE          DEFAULT NULL COMMENT '排查日期',
  inspection_status ENUM('pending','inspecting','rectification','completed') NOT NULL DEFAULT 'pending' COMMENT '排查状态',
  project_name      VARCHAR(200)  DEFAULT NULL COMMENT '项目名称',
  status            ENUM('active','archived') NOT NULL DEFAULT 'active',
  created_at        TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_enterprises_user_id (user_id),
  UNIQUE KEY uk_enterprises_name (name),
  KEY idx_enterprises_region (region),
  KEY idx_enterprises_inspection_status (inspection_status),
  KEY idx_enterprises_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 2. 部门表：企业 1:N 部门
-- ============================================================================
CREATE TABLE departments (
  id             INT           NOT NULL AUTO_INCREMENT,
  enterprise_id  INT           NOT NULL COMMENT '所属企业',
  name           VARCHAR(100)  NOT NULL,
  created_at     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_departments_enterprise_name (enterprise_id, name),
  KEY idx_departments_enterprise_id (enterprise_id),
  CONSTRAINT fk_departments_enterprise
    FOREIGN KEY (enterprise_id) REFERENCES enterprises (id)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 3. 用户表：部门 1:N 用户，管理员允许不绑定部门
-- ============================================================================
CREATE TABLE users (
  id              INT           NOT NULL AUTO_INCREMENT,
  username        VARCHAR(100)  NOT NULL,
  password        VARCHAR(255)  NOT NULL COMMENT 'scrypt加盐哈希',
  role            VARCHAR(20)   NOT NULL DEFAULT 'user' COMMENT 'admin|user',
  department_id   INT           DEFAULT NULL COMMENT '所属部门',
  status          ENUM('active','disabled','locked') NOT NULL DEFAULT 'active',
  login_attempts  INT           NOT NULL DEFAULT 0 COMMENT '连续登录失败次数',
  locked_until    DATETIME      DEFAULT NULL COMMENT '锁定到期时间',
  last_login_at   DATETIME      DEFAULT NULL,
  created_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_users_username (username),
  KEY idx_users_role (role),
  KEY idx_users_department_id (department_id),
  CONSTRAINT fk_users_department
    FOREIGN KEY (department_id) REFERENCES departments (id)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 4. 用户权限关联表
-- ============================================================================
CREATE TABLE user_permissions (
  user_id         INT          NOT NULL COMMENT '用户 ID',
  permission_key  VARCHAR(100) NOT NULL COMMENT '权限标识',
  created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '授权时间',
  PRIMARY KEY (user_id, permission_key),
  KEY idx_user_permissions_permission_key (permission_key),
  CONSTRAINT fk_user_permissions_user
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户权限关联表';

-- ============================================================================
-- 5. 认证会话表（JWT 撤销、在线状态与审计）
-- ============================================================================
CREATE TABLE auth_sessions (
  id              INT           NOT NULL AUTO_INCREMENT,
  jti             VARCHAR(64)   NOT NULL COMMENT 'JWT 唯一标识',
  user_id         INT           NOT NULL COMMENT '所属用户',
  role_snapshot   VARCHAR(20)   NOT NULL COMMENT '登录时角色快照',
  status          ENUM('active','revoked','expired') NOT NULL DEFAULT 'active' COMMENT '认证会话状态',
  expires_at      DATETIME      NOT NULL COMMENT '访问令牌过期时间',
  revoked_at      DATETIME      DEFAULT NULL COMMENT '撤销时间',
  last_seen_at    DATETIME      DEFAULT NULL COMMENT '最近活跃时间',
  last_ip         VARCHAR(45)   DEFAULT NULL COMMENT '最近访问 IP',
  user_agent      VARCHAR(500)  DEFAULT NULL COMMENT '最近访问 User-Agent',
  created_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_auth_sessions_jti (jti),
  KEY idx_auth_sessions_user_id (user_id),
  KEY idx_auth_sessions_status (status),
  KEY idx_auth_sessions_expires_at (expires_at),
  CONSTRAINT fk_auth_sessions_user
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='认证会话表';

-- ============================================================================
-- 6. 隐患图片表（立项书 §四(五) 隐患图片上传与处理模块 + §9.5）
-- ============================================================================
CREATE TABLE hazard_images (
  id              INT           NOT NULL AUTO_INCREMENT,
  user_id         INT           NOT NULL COMMENT '上传用户',
  enterprise_id   INT           DEFAULT NULL COMMENT '关联企业',
  file_path       VARCHAR(500)  NOT NULL COMMENT '文件存储路径',
  original_name   VARCHAR(255)  DEFAULT NULL COMMENT '原始文件名',
  file_size       BIGINT UNSIGNED DEFAULT NULL COMMENT '文件大小(字节)',
  image_width     INT UNSIGNED  DEFAULT NULL COMMENT '图片宽度(px)',
  image_height    INT UNSIGNED  DEFAULT NULL COMMENT '图片高度(px)',
  label           VARCHAR(200)  DEFAULT NULL COMMENT '文字标注',
  hazard_type     VARCHAR(100)  DEFAULT NULL COMMENT '隐患类型分类',
  status          ENUM('active','deleted') NOT NULL DEFAULT 'active',
  created_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_hi_user_id (user_id),
  KEY idx_hi_enterprise_id (enterprise_id),
  KEY idx_hi_hazard_type (hazard_type),
  KEY idx_hi_status (status),
  KEY idx_hi_created_at (created_at),
  CONSTRAINT fk_hi_user
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_hi_enterprise
    FOREIGN KEY (enterprise_id) REFERENCES enterprises (id)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 7. 会话表（业务会话持久化，替代内存 Map）
-- ============================================================================
CREATE TABLE sessions (
  id          VARCHAR(64)   NOT NULL COMMENT 'UUID',
  user_id     INT           NOT NULL COMMENT '所属用户',
  title       VARCHAR(200)  DEFAULT '新对话' COMMENT '会话标题',
  status      ENUM('active','archived') NOT NULL DEFAULT 'active',
  created_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_sessions_user_id (user_id),
  KEY idx_sessions_created_at (created_at),
  CONSTRAINT fk_sessions_user
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 8. 排查报告表（原 results 表重命名，立项书 §四(七) 报告生成与下载模块）
-- ============================================================================
CREATE TABLE inspection_reports (
  id              INT           NOT NULL AUTO_INCREMENT,
  user_id         INT           NOT NULL COMMENT '所属用户',
  enterprise_id   INT           DEFAULT NULL COMMENT '关联企业',
  session_id      VARCHAR(64)   DEFAULT NULL COMMENT '关联会话',
  title           VARCHAR(300)  DEFAULT NULL COMMENT '报告标题',
  prompt          TEXT          DEFAULT NULL COMMENT '用户输入/AI prompt',
  result          LONGTEXT      DEFAULT NULL COMMENT 'AI分析结果(JSON)',
  word_path       VARCHAR(500)  DEFAULT NULL COMMENT 'Word报告路径',
  pdf_path        VARCHAR(500)  DEFAULT NULL COMMENT 'PDF报告路径',
  image_path      VARCHAR(500)  DEFAULT NULL COMMENT '兼容旧单图报告的图片路径',
  status          ENUM('draft','completed') NOT NULL DEFAULT 'draft',
  review_status   ENUM('pending','confirmed','rejected','needs_review') NOT NULL DEFAULT 'pending' COMMENT '人工复核状态',
  review_required TINYINT(1)    NOT NULL DEFAULT 1 COMMENT '是否需要人工确认',
  review_comment  TEXT          DEFAULT NULL COMMENT '人工复核意见',
  reviewed_by     INT           DEFAULT NULL COMMENT '复核人',
  reviewed_at     DATETIME      DEFAULT NULL COMMENT '复核时间',
  report_allowed  TINYINT(1)    NOT NULL DEFAULT 0 COMMENT '是否允许生成正式报告',
  report_block_reason VARCHAR(500) DEFAULT NULL COMMENT '禁止生成正式报告原因',
  created_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_ir_user_id (user_id),
  KEY idx_ir_session_id (session_id),
  KEY idx_ir_enterprise_id (enterprise_id),
  KEY idx_ir_status (status),
  KEY idx_ir_review_status (review_status),
  KEY idx_ir_reviewed_by (reviewed_by),
  KEY idx_ir_created_at (created_at),
  CONSTRAINT fk_ir_user
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_ir_enterprise
    FOREIGN KEY (enterprise_id) REFERENCES enterprises (id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_ir_session
    FOREIGN KEY (session_id) REFERENCES sessions (id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_ir_reviewed_by
    FOREIGN KEY (reviewed_by) REFERENCES users (id)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 9. 报告-图片关联表（支持多图分析结果与图片的多对多关系）
-- ============================================================================
CREATE TABLE inspection_report_images (
  id          INT           NOT NULL AUTO_INCREMENT,
  report_id   INT           NOT NULL,
  image_id    INT           NOT NULL,
  created_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_report_image (report_id, image_id),
  KEY idx_iri_image_id (image_id),
  CONSTRAINT fk_iri_report
    FOREIGN KEY (report_id) REFERENCES inspection_reports (id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_iri_image
    FOREIGN KEY (image_id) REFERENCES hazard_images (id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 10. 知识库分类表（立项书 §四(三) 知识库管理模块）
-- ============================================================================
CREATE TABLE knowledge_categories (
  id          INT           NOT NULL AUTO_INCREMENT,
  name        VARCHAR(100)  NOT NULL,
  description VARCHAR(500)  DEFAULT NULL COMMENT '分类描述',
  sort        INT           NOT NULL DEFAULT 0,
  created_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_kc_name (name),
  KEY idx_kc_sort (sort)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 11. 知识库条目表（立项书 §四(三) 知识库管理模块）
-- ============================================================================
CREATE TABLE knowledge (
  id          INT           NOT NULL AUTO_INCREMENT,
  title       VARCHAR(300)  NOT NULL COMMENT '文档标题',
  file_path   VARCHAR(500)  NOT NULL COMMENT '文件路径',
  file_size   BIGINT UNSIGNED DEFAULT NULL COMMENT '文件大小(字节)',
  file_type   VARCHAR(20)   DEFAULT NULL COMMENT 'pdf|docx|doc|image',
  description TEXT          DEFAULT NULL,
  category_id INT           DEFAULT NULL,
  source_code VARCHAR(100)  DEFAULT NULL COMMENT '文号或标准号',
  source_url  VARCHAR(1000) DEFAULT NULL COMMENT '官方来源URL',
  issuing_authority VARCHAR(200) DEFAULT NULL COMMENT '发布机关',
  document_type VARCHAR(50) DEFAULT NULL COMMENT '文件类型：法律/行政法规/部门规章/规范性文件/国家标准/行业标准等',
  publish_date DATE DEFAULT NULL COMMENT '发布日期',
  effective_date DATE DEFAULT NULL COMMENT '施行日期',
  current_status VARCHAR(50) NOT NULL DEFAULT '现行有效' COMMENT '现行状态',
  verification_status VARCHAR(50) NOT NULL DEFAULT 'pending' COMMENT '人工校验状态：pending/verified/rejected',
  parse_status ENUM('pending','parsed','skipped','failed') NOT NULL DEFAULT 'pending' COMMENT '条款抽取状态',
  parse_message VARCHAR(500) DEFAULT NULL COMMENT '条款抽取说明或失败原因',
  status      ENUM('active','archived') NOT NULL DEFAULT 'active',
  created_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_knowledge_category (category_id),
  KEY idx_knowledge_title (title),
  KEY idx_knowledge_source_code (source_code),
  KEY idx_knowledge_document_type (document_type),
  KEY idx_knowledge_verification_status (verification_status),
  KEY idx_knowledge_status (status),
  CONSTRAINT fk_knowledge_category
    FOREIGN KEY (category_id) REFERENCES knowledge_categories (id)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 12. 知识文档适用分类关联表（支持一份通用法规适用于多个行业）
-- ============================================================================
CREATE TABLE knowledge_category_relations (
  knowledge_id  INT         NOT NULL COMMENT '知识文档ID',
  category_id   INT         NOT NULL COMMENT '适用分类ID',
  relation_type VARCHAR(20) NOT NULL DEFAULT 'applicable' COMMENT '关联类型',
  created_at    TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (knowledge_id, category_id),
  KEY idx_kcr_category_id (category_id),
  CONSTRAINT fk_kcr_knowledge
    FOREIGN KEY (knowledge_id) REFERENCES knowledge (id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_kcr_category
    FOREIGN KEY (category_id) REFERENCES knowledge_categories (id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='知识文档适用分类关联表';

-- ============================================================================
-- 13. 知识库条款表（AI 报告引用依据）
-- ============================================================================
CREATE TABLE knowledge_clauses (
  id            INT           NOT NULL AUTO_INCREMENT,
  knowledge_id  INT           NOT NULL COMMENT '所属知识文档',
  category_id   INT           DEFAULT NULL COMMENT '冗余分类，便于后续检索',
  source_title  VARCHAR(300)  NOT NULL COMMENT '来源文档标题',
  source_code   VARCHAR(100)  DEFAULT NULL COMMENT '法规或标准编号',
  source_url    VARCHAR(1000) DEFAULT NULL COMMENT '官方来源URL快照',
  issuing_authority VARCHAR(200) DEFAULT NULL COMMENT '发布机关快照',
  document_type VARCHAR(50) DEFAULT NULL COMMENT '文件类型快照',
  publish_date  DATE DEFAULT NULL COMMENT '发布日期快照',
  effective_date DATE DEFAULT NULL COMMENT '施行日期快照',
  current_status VARCHAR(50) NOT NULL DEFAULT '现行有效' COMMENT '现行状态快照',
  verification_status VARCHAR(50) NOT NULL DEFAULT 'pending' COMMENT '人工校验状态快照',
  clause_no     VARCHAR(100)  DEFAULT NULL COMMENT '条款号',
  content       TEXT          NOT NULL COMMENT '条款内容',
  keywords      VARCHAR(500)  DEFAULT NULL COMMENT '关键词，用于 MySQL 关键词检索',
  sort          INT           NOT NULL DEFAULT 0 COMMENT '条款顺序',
  status        ENUM('active','archived') NOT NULL DEFAULT 'active',
  created_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_kcl_knowledge_id (knowledge_id),
  KEY idx_kcl_category_id (category_id),
  KEY idx_kcl_source_code (source_code),
  KEY idx_kcl_document_type (document_type),
  KEY idx_kcl_verification_status (verification_status),
  KEY idx_kcl_current_status (current_status),
  KEY idx_kcl_clause_no (clause_no),
  KEY idx_kcl_status (status),
  KEY idx_kcl_sort (sort),
  CONSTRAINT fk_kcl_knowledge
    FOREIGN KEY (knowledge_id) REFERENCES knowledge (id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_kcl_category
    FOREIGN KEY (category_id) REFERENCES knowledge_categories (id)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='知识库条款表';

-- ============================================================================
-- 14. 知识库条款抽取草稿表（PDF/DOCX 抽取先审核再进入正式条文库）
-- ============================================================================
CREATE TABLE knowledge_clause_drafts (
  id            INT           NOT NULL AUTO_INCREMENT,
  knowledge_id  INT           NOT NULL COMMENT '来源知识文档',
  category_id   INT           DEFAULT NULL COMMENT '分类快照',
  source_title  VARCHAR(300)  NOT NULL COMMENT '来源文档标题快照',
  source_code   VARCHAR(100)  DEFAULT NULL COMMENT '法规或标准编号快照',
  source_url    VARCHAR(1000) DEFAULT NULL COMMENT '官方来源URL快照',
  issuing_authority VARCHAR(200) DEFAULT NULL COMMENT '发布机关快照',
  document_type VARCHAR(50) DEFAULT NULL COMMENT '文件类型快照',
  publish_date  DATE DEFAULT NULL COMMENT '发布日期快照',
  effective_date DATE DEFAULT NULL COMMENT '施行日期快照',
  current_status VARCHAR(50) NOT NULL DEFAULT '现行有效' COMMENT '现行状态快照',
  clause_no     VARCHAR(100)  DEFAULT NULL COMMENT '草稿条款号',
  content       TEXT          NOT NULL COMMENT '草稿条文内容',
  keywords      VARCHAR(500)  DEFAULT NULL COMMENT '关键词',
  extraction_method VARCHAR(30) NOT NULL DEFAULT 'auto' COMMENT '抽取方式：pdf/docx/ocr/manual',
  confidence_level VARCHAR(20) NOT NULL DEFAULT 'medium' COMMENT '抽取置信等级：high/medium/low',
  review_status VARCHAR(20) NOT NULL DEFAULT 'pending' COMMENT '审核状态：pending/approved/rejected',
  review_note   VARCHAR(500) DEFAULT NULL COMMENT '审核备注',
  reviewed_by   INT DEFAULT NULL COMMENT '审核人',
  reviewed_at   DATETIME DEFAULT NULL COMMENT '审核时间',
  sort          INT           NOT NULL DEFAULT 0 COMMENT '草稿顺序',
  status        ENUM('active','archived') NOT NULL DEFAULT 'active',
  created_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_kcd_knowledge_id (knowledge_id),
  KEY idx_kcd_category_id (category_id),
  KEY idx_kcd_review_status (review_status),
  KEY idx_kcd_status (status),
  KEY idx_kcd_sort (sort),
  CONSTRAINT fk_kcd_knowledge
    FOREIGN KEY (knowledge_id) REFERENCES knowledge (id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_kcd_category
    FOREIGN KEY (category_id) REFERENCES knowledge_categories (id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_kcd_reviewer
    FOREIGN KEY (reviewed_by) REFERENCES users (id)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='知识库条款抽取草稿表';
-- ============================================================================
-- 14. 报告-知识条款引用表（报告依据可追溯）
-- ============================================================================
CREATE TABLE inspection_report_knowledge_refs (
  id                  INT           NOT NULL AUTO_INCREMENT,
  report_id           INT           NOT NULL COMMENT '所属排查报告',
  knowledge_clause_id INT           DEFAULT NULL COMMENT '生成报告时命中的知识条款 ID',
  knowledge_id        INT           DEFAULT NULL COMMENT '来源知识文档 ID',
  source_title        VARCHAR(300)  NOT NULL COMMENT '来源文档标题快照',
  source_code         VARCHAR(100)  DEFAULT NULL COMMENT '法规或标准编号快照',
  clause_no           VARCHAR(100)  DEFAULT NULL COMMENT '条款号快照',
  content             TEXT          NOT NULL COMMENT '条款内容快照',
  match_keyword       VARCHAR(100)  DEFAULT NULL COMMENT '命中关键词',
  sort                INT           NOT NULL DEFAULT 0 COMMENT '引用展示顺序',
  created_at          TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_irk_report_id (report_id),
  KEY idx_irk_clause_id (knowledge_clause_id),
  KEY idx_irk_knowledge_id (knowledge_id),
  KEY idx_irk_sort (sort),
  CONSTRAINT fk_irk_report
    FOREIGN KEY (report_id) REFERENCES inspection_reports (id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='报告引用依据快照表';
-- ============================================================================
-- 15. 报告-隐患规则引用快照表（报告判定规则可追溯）
-- ============================================================================
CREATE TABLE inspection_report_rule_refs (
  id                   INT           NOT NULL AUTO_INCREMENT,
  report_id            INT           NOT NULL COMMENT '所属排查报告',
  rule_id              INT           DEFAULT NULL COMMENT '生成报告时命中的规则 ID',
  rule_name            VARCHAR(200)  NOT NULL COMMENT '规则名称快照',
  hazard_level         VARCHAR(50)   DEFAULT NULL COMMENT '规则判定等级快照',
  evidence_sufficiency VARCHAR(50)   DEFAULT NULL COMMENT '证据充分性快照',
  judgment_reason      TEXT          DEFAULT NULL COMMENT '判定理由快照',
  sort                 INT           NOT NULL DEFAULT 0 COMMENT '引用展示顺序',
  created_at           TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_irrr_report_id (report_id),
  KEY idx_irrr_rule_id (rule_id),
  KEY idx_irrr_sort (sort),
  CONSTRAINT fk_irrr_report
    FOREIGN KEY (report_id) REFERENCES inspection_reports (id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='报告命中规则快照表';

-- ============================================================================
-- 16. 隐患判定规则表（法规条文到隐患等级的人工规则映射）
-- ============================================================================
CREATE TABLE hazard_rules (
  id                          INT           NOT NULL AUTO_INCREMENT,
  seed_key                    VARCHAR(100)  DEFAULT NULL COMMENT '内置种子规则唯一标识，便于重复导入',
  name                        VARCHAR(200)  NOT NULL COMMENT '规则名称',
  category_id                 INT           DEFAULT NULL COMMENT '所属法规分类',
  hazard_level                VARCHAR(50)   NOT NULL COMMENT '判定等级：一般隐患/疑似重大隐患/重大隐患/需人工复核等',
  visible_fact_keywords       VARCHAR(500)  DEFAULT NULL COMMENT '可见事实关键词，供 AI 事实抽取和规则检索使用',
  trigger_condition           TEXT          NOT NULL COMMENT '触发条件',
  required_evidence           TEXT          NOT NULL COMMENT '所需证据',
  image_evidence_supported    TINYINT(1)    NOT NULL DEFAULT 0 COMMENT '图片是否可独立支持判断',
  insufficient_evidence_level VARCHAR(50)   NOT NULL DEFAULT '需人工复核' COMMENT '证据不足时默认结论',
  rectification_template      TEXT          NOT NULL COMMENT '整改建议模板',
  is_active                   TINYINT(1)    NOT NULL DEFAULT 0 COMMENT '是否启用',
  status                      ENUM('active','archived') NOT NULL DEFAULT 'active' COMMENT '规则状态',
  created_at                  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_hazard_rules_seed_key (seed_key),
  KEY idx_hr_category_id (category_id),
  KEY idx_hr_hazard_level (hazard_level),
  KEY idx_hr_is_active (is_active),
  KEY idx_hr_status (status),
  CONSTRAINT fk_hr_category
    FOREIGN KEY (category_id) REFERENCES knowledge_categories (id)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='隐患判定规则表';

-- ============================================================================
-- 17. 隐患规则-法规条款关联表
-- ============================================================================
CREATE TABLE hazard_rule_clause_refs (
  rule_id    INT       NOT NULL COMMENT '规则ID',
  clause_id  INT       NOT NULL COMMENT '正式法规条款ID',
  sort       INT       NOT NULL DEFAULT 0 COMMENT '引用顺序',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (rule_id, clause_id),
  KEY idx_hrcr_clause_id (clause_id),
  KEY idx_hrcr_sort (sort),
  CONSTRAINT fk_hrcr_rule
    FOREIGN KEY (rule_id) REFERENCES hazard_rules (id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_hrcr_clause
    FOREIGN KEY (clause_id) REFERENCES knowledge_clauses (id)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='隐患规则关联法规条款表';
-- ============================================================================
-- 14. 操作日志表（立项书：所有角色操作行为留痕 + §四(一)§4）
-- ============================================================================
CREATE TABLE action_logs (
  id          INT           NOT NULL AUTO_INCREMENT,
  user_id     INT           NOT NULL,
  action      VARCHAR(100)  NOT NULL COMMENT '操作类型',
  details     TEXT          DEFAULT NULL COMMENT '操作详情(JSON)',
  ip_address  VARCHAR(45)   DEFAULT NULL COMMENT '客户端IPv4/IPv6',
  created_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_al_user_id (user_id),
  KEY idx_al_action (action),
  KEY idx_al_created_at (created_at),
  CONSTRAINT fk_al_user
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 14. AI 模型配置表（立项书 §四(四) AI大模型对接模块）
-- ============================================================================
CREATE TABLE ai_model_configs (
  id                INT           NOT NULL AUTO_INCREMENT,
  name              VARCHAR(100)  NOT NULL COMMENT '配置名称',
  provider          VARCHAR(100)  NOT NULL COMMENT '模型服务商',
  base_url          VARCHAR(500)  NOT NULL COMMENT 'API地址',
  api_key_encrypted VARCHAR(500)  NOT NULL COMMENT '加密存储的API密钥',
  model_name        VARCHAR(100)  NOT NULL COMMENT '模型标识',
  is_active         TINYINT(1)    NOT NULL DEFAULT 0 COMMENT '是否启用',
  max_tokens        INT           NOT NULL DEFAULT 4096,
  temperature       DECIMAL(3,2)  NOT NULL DEFAULT 0.70,
  timeout_ms        INT           NOT NULL DEFAULT 60000 COMMENT '超时毫秒',
  created_at        TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_amc_is_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 15. 报告模板表（立项书 §四(七) 报告格式标准化）
-- ============================================================================
CREATE TABLE report_templates (
  id          INT           NOT NULL AUTO_INCREMENT,
  name        VARCHAR(200)  NOT NULL COMMENT '模板名称',
  file_path   VARCHAR(500)  DEFAULT NULL COMMENT '模板文件路径',
  description TEXT          DEFAULT NULL COMMENT '模板说明',
  is_default  TINYINT(1)    NOT NULL DEFAULT 0 COMMENT '是否默认模板',
  created_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 数据库备份记录表
-- ============================================================================
CREATE TABLE backup_records (
  id            BIGINT        NOT NULL AUTO_INCREMENT COMMENT '备份记录主键',
  file_name     VARCHAR(255)  NOT NULL COMMENT '备份文件名',
  file_path     VARCHAR(500)  NOT NULL COMMENT '备份文件路径',
  file_size     BIGINT UNSIGNED DEFAULT NULL COMMENT '备份文件大小（字节）',
  backup_type   ENUM('manual','automatic') NOT NULL DEFAULT 'manual' COMMENT '备份类型',
  status        ENUM('pending','running','completed','failed') NOT NULL DEFAULT 'pending' COMMENT '备份状态',
  error_message TEXT          DEFAULT NULL COMMENT '失败原因',
  created_by    INT           DEFAULT NULL COMMENT '创建用户；自动任务可为空',
  started_at    DATETIME      DEFAULT NULL COMMENT '开始时间',
  completed_at  DATETIME      DEFAULT NULL COMMENT '完成时间',
  created_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (id),
  KEY idx_backup_records_status (status),
  KEY idx_backup_records_type (backup_type),
  KEY idx_backup_records_created_by (created_by),
  KEY idx_backup_records_created_at (created_at),
  CONSTRAINT fk_backup_records_created_by
    FOREIGN KEY (created_by) REFERENCES users (id)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='数据库备份记录表';

-- ============================================================================
-- 分类种子数据（安全生产行业分类）
-- ============================================================================
INSERT INTO knowledge_categories (name, sort) VALUES
  ('煤矿安全', 1),
  ('非煤矿山安全', 2),
  ('危险化学品与化工安全', 3),
  ('建筑施工安全', 4),
  ('消防安全', 5),
  ('特种设备安全', 6),
  ('交通运输安全', 7),
  ('工贸行业安全', 8),
  ('电力安全', 9),
  ('石油天然气安全', 10),
  ('农林牧渔安全', 11),
  ('职业健康与劳动安全', 12),
  ('应急与事故管理', 13),
  ('其他专项安全', 14)
ON DUPLICATE KEY UPDATE sort = VALUES(sort);

-- 企业和部门属于组织主数据，由管理员创建，不预置无归属部门。
