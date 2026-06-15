-- ============================================================================
-- 后端阶段 A：数据库迁移与组织关系
-- 适用数据库：MySQL 8.0 / ai_project
-- 执行原则：
-- 1. 迁移前为受影响表创建快照，快照表仅首次执行时写入。
-- 2. enterprises.user_id 保留为可空历史字段，不再作为企业归属依据。
-- 3. 用户所属企业统一通过 users.department_id -> departments.enterprise_id 推导。
-- 4. 无法安全自动迁移的数据写入 phase_a_migration_conflicts，不覆盖原值。
-- ============================================================================

-- 执行时必须显式指定目标数据库，例如：mysql ai_project < 本文件。

-- ----------------------------------------------------------------------------
-- 一、迁移前快照与冲突记录
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS phase_a_backup_enterprises LIKE enterprises;
INSERT IGNORE INTO phase_a_backup_enterprises
  (id, user_id, name, region, address, contact, phone, created_at, updated_at,
   industry, enterprise_type, scale, production_process, inspector_name,
   inspection_date, status, project_name)
SELECT
  id, user_id, name, region, address, contact, phone, created_at, updated_at,
  industry, enterprise_type, scale, production_process, inspector_name,
  inspection_date, status, project_name
FROM enterprises;

CREATE TABLE IF NOT EXISTS phase_a_backup_departments LIKE departments;
INSERT IGNORE INTO phase_a_backup_departments (id, name, created_at)
SELECT id, name, created_at FROM departments;

CREATE TABLE IF NOT EXISTS phase_a_backup_users LIKE users;
INSERT IGNORE INTO phase_a_backup_users
  (id, username, password, role, created_at, department_id, status,
   login_attempts, locked_until, last_login_at, updated_at)
SELECT
  id, username, password, role, created_at, department_id, status,
  login_attempts, locked_until, last_login_at, updated_at
FROM users;

CREATE TABLE IF NOT EXISTS phase_a_backup_hazard_images LIKE hazard_images;
INSERT IGNORE INTO phase_a_backup_hazard_images SELECT * FROM hazard_images;

CREATE TABLE IF NOT EXISTS phase_a_backup_inspection_reports LIKE inspection_reports;
INSERT IGNORE INTO phase_a_backup_inspection_reports SELECT * FROM inspection_reports;

CREATE TABLE IF NOT EXISTS phase_a_backup_ai_model_configs LIKE ai_model_configs;
INSERT IGNORE INTO phase_a_backup_ai_model_configs
  (id, name, base_url, api_key_encrypted, model_name, is_active, max_tokens,
   temperature, timeout_ms, created_at, updated_at)
SELECT
  id, name, base_url, api_key_encrypted, model_name, is_active, max_tokens,
  temperature, timeout_ms, created_at, updated_at
FROM ai_model_configs;

CREATE TABLE IF NOT EXISTS phase_a_migration_conflicts (
  id              BIGINT        NOT NULL AUTO_INCREMENT COMMENT '冲突记录主键',
  conflict_type   VARCHAR(100)  NOT NULL COMMENT '冲突类型',
  source_table    VARCHAR(100)  NOT NULL COMMENT '来源表',
  source_id       BIGINT        DEFAULT NULL COMMENT '来源记录主键',
  details         JSON          DEFAULT NULL COMMENT '冲突详情',
  created_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '记录时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_phase_a_conflict (conflict_type, source_table, source_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='阶段 A 数据迁移冲突记录';

-- ----------------------------------------------------------------------------
-- 二、创建可重复执行的迁移过程
-- ----------------------------------------------------------------------------

DROP PROCEDURE IF EXISTS migrate_admin_backend_phase_a;
DELIMITER $$

CREATE PROCEDURE migrate_admin_backend_phase_a()
BEGIN
  DECLARE v_count INT DEFAULT 0;
  DECLARE v_fk_name VARCHAR(128);
  DECLARE v_done INT DEFAULT 0;

  -- enterprises.user_id 当前可能存在重复外键，统一删除后保留普通索引。
  DECLARE enterprise_user_fk_cursor CURSOR FOR
    SELECT CONSTRAINT_NAME
    FROM information_schema.KEY_COLUMN_USAGE
    WHERE CONSTRAINT_SCHEMA = DATABASE()
      AND TABLE_NAME = 'enterprises'
      AND COLUMN_NAME = 'user_id'
      AND REFERENCED_TABLE_NAME = 'users';
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_done = 1;

  -- --------------------------------------------------------------------------
  -- 1. 企业调整为组织主数据
  -- --------------------------------------------------------------------------

  SELECT COUNT(*) INTO v_count
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'enterprises'
    AND COLUMN_NAME = 'inspection_status';
  IF v_count = 0 THEN
    ALTER TABLE enterprises
      ADD COLUMN inspection_status
        ENUM('pending','inspecting','rectification','completed')
        NOT NULL DEFAULT 'pending'
        COMMENT '排查状态：待排查、排查中、整改中、已完成'
        AFTER inspection_date;
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'enterprises'
    AND INDEX_NAME = 'idx_enterprises_inspection_status';
  IF v_count = 0 THEN
    ALTER TABLE enterprises
      ADD KEY idx_enterprises_inspection_status (inspection_status);
  END IF;

  -- 企业名称作为组织主数据名称必须唯一；发现重复时先记录并阻断。
  INSERT IGNORE INTO phase_a_migration_conflicts
    (conflict_type, source_table, source_id, details)
  SELECT
    'ENTERPRISE_NAME_DUPLICATED',
    'enterprises',
    MIN(id),
    JSON_OBJECT('name', name, 'duplicate_count', COUNT(*))
  FROM enterprises
  GROUP BY name
  HAVING COUNT(*) > 1;

  SELECT COUNT(*) INTO v_count
  FROM (
    SELECT name
    FROM enterprises
    GROUP BY name
    HAVING COUNT(*) > 1
  ) duplicated_enterprises;
  IF v_count > 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = '存在重复企业名称，请先处理 phase_a_migration_conflicts';
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'enterprises'
    AND INDEX_NAME = 'uk_enterprises_name';
  IF v_count = 0 THEN
    ALTER TABLE enterprises ADD UNIQUE KEY uk_enterprises_name (name);
  END IF;

  -- 删除 enterprises.user_id 上的历史外键，避免删除用户时级联删除企业。
  SET v_done = 0;
  OPEN enterprise_user_fk_cursor;
  drop_enterprise_user_fk: LOOP
    FETCH enterprise_user_fk_cursor INTO v_fk_name;
    IF v_done = 1 THEN
      LEAVE drop_enterprise_user_fk;
    END IF;
    SET @drop_fk_sql = CONCAT(
      'ALTER TABLE enterprises DROP FOREIGN KEY `',
      REPLACE(v_fk_name, '`', '``'),
      '`'
    );
    PREPARE drop_fk_stmt FROM @drop_fk_sql;
    EXECUTE drop_fk_stmt;
    DEALLOCATE PREPARE drop_fk_stmt;
  END LOOP;
  CLOSE enterprise_user_fk_cursor;

  ALTER TABLE enterprises
    MODIFY COLUMN user_id INT DEFAULT NULL COMMENT '历史归属用户，仅用于兼容旧数据，不作为组织归属依据';

  SELECT COUNT(*) INTO v_count
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'enterprises'
    AND INDEX_NAME = 'idx_enterprises_user_id';
  IF v_count = 0 THEN
    ALTER TABLE enterprises ADD KEY idx_enterprises_user_id (user_id);
  END IF;

  -- --------------------------------------------------------------------------
  -- 2. 建立企业 1:N 部门、部门 1:N 用户关系
  -- --------------------------------------------------------------------------

  SELECT COUNT(*) INTO v_count
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'departments'
    AND COLUMN_NAME = 'enterprise_id';
  IF v_count = 0 THEN
    ALTER TABLE departments
      ADD COLUMN enterprise_id INT DEFAULT NULL COMMENT '所属企业' AFTER id;
  END IF;

  -- 若旧部门内所有用户都能由历史企业 owner 唯一推导到同一企业，则自动补齐部门企业。
  UPDATE departments d
  JOIN (
    SELECT
      u.department_id,
      MIN(e.id) AS enterprise_id
    FROM users u
    JOIN enterprises e ON e.user_id = u.id
    WHERE u.department_id IS NOT NULL
    GROUP BY u.department_id
    HAVING COUNT(DISTINCT e.id) = 1
  ) inferred ON inferred.department_id = d.id
  SET d.enterprise_id = inferred.enterprise_id
  WHERE d.enterprise_id IS NULL;

  -- 无法推导且已有用户的旧部门不能安全自动迁移，记录冲突并阻断迁移。
  INSERT IGNORE INTO phase_a_migration_conflicts
    (conflict_type, source_table, source_id, details)
  SELECT
    'DEPARTMENT_ENTERPRISE_UNRESOLVED',
    'departments',
    d.id,
    JSON_OBJECT('department_name', d.name, 'user_count', COUNT(u.id))
  FROM departments d
  JOIN users u ON u.department_id = d.id
  WHERE d.enterprise_id IS NULL
  GROUP BY d.id, d.name;

  SELECT COUNT(*) INTO v_count
  FROM departments d
  JOIN users u ON u.department_id = d.id
  WHERE d.enterprise_id IS NULL;
  IF v_count > 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = '存在无法自动归属企业且已有用户的部门，请先处理 phase_a_migration_conflicts';
  END IF;

  -- 删除未被任何用户使用且无法归属企业的旧种子部门，原数据已保存在快照表。
  DELETE d
  FROM departments d
  LEFT JOIN users u ON u.department_id = d.id
  WHERE d.enterprise_id IS NULL
    AND u.id IS NULL;

  -- 删除旧的全局部门名称唯一索引，允许不同企业使用相同部门名称。
  SELECT COUNT(*) INTO v_count
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'departments'
    AND INDEX_NAME = 'uk_departments_name';
  IF v_count > 0 THEN
    ALTER TABLE departments DROP INDEX uk_departments_name;
  END IF;

  -- 每个历史企业创建迁移默认部门，保证原 owner 用户能够迁入目标组织关系。
  INSERT INTO departments (enterprise_id, name)
  SELECT e.id, '默认部门'
  FROM enterprises e
  LEFT JOIN departments d
    ON d.enterprise_id = e.id
   AND d.name = '默认部门'
  WHERE d.id IS NULL;

  -- 将企业原 owner 用户迁入对应默认部门；管理员仍允许不绑定部门。
  UPDATE users u
  JOIN enterprises e ON e.user_id = u.id
  JOIN departments d
    ON d.enterprise_id = e.id
   AND d.name = '默认部门'
  SET u.department_id = d.id
  WHERE u.department_id IS NULL;

  SELECT COUNT(*) INTO v_count
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'departments'
    AND INDEX_NAME = 'uk_departments_enterprise_name';
  IF v_count = 0 THEN
    ALTER TABLE departments
      ADD UNIQUE KEY uk_departments_enterprise_name (enterprise_id, name);
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'departments'
    AND INDEX_NAME = 'idx_departments_enterprise_id';
  IF v_count = 0 THEN
    ALTER TABLE departments
      ADD KEY idx_departments_enterprise_id (enterprise_id);
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'departments'
    AND CONSTRAINT_NAME = 'fk_departments_enterprise';
  IF v_count = 0 THEN
    ALTER TABLE departments
      ADD CONSTRAINT fk_departments_enterprise
      FOREIGN KEY (enterprise_id) REFERENCES enterprises (id)
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  ALTER TABLE departments
    MODIFY COLUMN enterprise_id INT NOT NULL COMMENT '所属企业';

  -- --------------------------------------------------------------------------
  -- 3. 用户权限持久化
  -- --------------------------------------------------------------------------

  CREATE TABLE IF NOT EXISTS user_permissions (
    user_id         INT          NOT NULL COMMENT '用户 ID',
    permission_key  VARCHAR(100) NOT NULL COMMENT '权限标识',
    created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '授权时间',
    PRIMARY KEY (user_id, permission_key),
    KEY idx_user_permissions_permission_key (permission_key),
    CONSTRAINT fk_user_permissions_user
      FOREIGN KEY (user_id) REFERENCES users (id)
      ON DELETE CASCADE ON UPDATE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    COMMENT='用户权限关联表';

  -- 为现有普通用户补齐当前系统五项权限，保持迁移前可用能力。
  INSERT IGNORE INTO user_permissions (user_id, permission_key)
  SELECT u.id, permission_keys.permission_key
  FROM users u
  CROSS JOIN (
    SELECT 'enterprise:manage' AS permission_key
    UNION ALL SELECT 'image:manage'
    UNION ALL SELECT 'analysis:run'
    UNION ALL SELECT 'report:download'
    UNION ALL SELECT 'knowledge:view'
  ) permission_keys
  WHERE u.role = 'user';

  -- --------------------------------------------------------------------------
  -- 4. AI 模型服务商字段
  -- --------------------------------------------------------------------------

  SELECT COUNT(*) INTO v_count
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'ai_model_configs'
    AND COLUMN_NAME = 'provider';
  IF v_count = 0 THEN
    ALTER TABLE ai_model_configs
      ADD COLUMN provider VARCHAR(100) DEFAULT NULL COMMENT '模型服务商' AFTER name;
  END IF;

  UPDATE ai_model_configs
  SET provider = CASE
    WHEN LOWER(base_url) LIKE '%volces.com%' OR LOWER(name) LIKE '%豆包%' THEN '豆包'
    WHEN LOWER(base_url) LIKE '%deepseek.com%' OR LOWER(model_name) LIKE '%deepseek%' THEN 'DeepSeek'
    WHEN LOWER(base_url) LIKE '%dashscope%' OR LOWER(name) LIKE '%千问%' THEN '阿里千问'
    ELSE '其他'
  END
  WHERE provider IS NULL OR provider = '';

  ALTER TABLE ai_model_configs
    MODIFY COLUMN provider VARCHAR(100) NOT NULL COMMENT '模型服务商';

  -- --------------------------------------------------------------------------
  -- 5. 数据备份记录表
  -- --------------------------------------------------------------------------

  CREATE TABLE IF NOT EXISTS backup_records (
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
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    COMMENT='数据库备份记录表';

  -- --------------------------------------------------------------------------
  -- 6. 可安全推导的企业业务数据补齐
  -- --------------------------------------------------------------------------

  -- 已有 enterprise_id 与历史 owner 推导企业不一致时仅记录冲突，不覆盖原值。
  INSERT IGNORE INTO phase_a_migration_conflicts
    (conflict_type, source_table, source_id, details)
  SELECT
    'HAZARD_ENTERPRISE_MISMATCH',
    'hazard_images',
    h.id,
    JSON_OBJECT(
      'user_id', h.user_id,
      'current_enterprise_id', h.enterprise_id,
      'owner_enterprise_id', e.id
    )
  FROM hazard_images h
  JOIN enterprises e ON e.user_id = h.user_id
  WHERE h.enterprise_id IS NOT NULL
    AND h.enterprise_id <> e.id;

  INSERT IGNORE INTO phase_a_migration_conflicts
    (conflict_type, source_table, source_id, details)
  SELECT
    'REPORT_ENTERPRISE_MISMATCH',
    'inspection_reports',
    r.id,
    JSON_OBJECT(
      'user_id', r.user_id,
      'current_enterprise_id', r.enterprise_id,
      'owner_enterprise_id', e.id
    )
  FROM inspection_reports r
  JOIN enterprises e ON e.user_id = r.user_id
  WHERE r.enterprise_id IS NOT NULL
    AND r.enterprise_id <> e.id;

  UPDATE hazard_images h
  JOIN enterprises e ON e.user_id = h.user_id
  SET h.enterprise_id = e.id
  WHERE h.enterprise_id IS NULL;

  UPDATE inspection_reports r
  JOIN enterprises e ON e.user_id = r.user_id
  SET r.enterprise_id = e.id
  WHERE r.enterprise_id IS NULL;

  -- 仍无法归属企业的业务数据进入人工确认清单。
  INSERT IGNORE INTO phase_a_migration_conflicts
    (conflict_type, source_table, source_id, details)
  SELECT
    'HAZARD_ENTERPRISE_UNRESOLVED',
    'hazard_images',
    h.id,
    JSON_OBJECT('user_id', h.user_id)
  FROM hazard_images h
  WHERE h.enterprise_id IS NULL;

  INSERT IGNORE INTO phase_a_migration_conflicts
    (conflict_type, source_table, source_id, details)
  SELECT
    'REPORT_ENTERPRISE_UNRESOLVED',
    'inspection_reports',
    r.id,
    JSON_OBJECT('user_id', r.user_id)
  FROM inspection_reports r
  WHERE r.enterprise_id IS NULL;
END$$

DELIMITER ;

CALL migrate_admin_backend_phase_a();
DROP PROCEDURE IF EXISTS migrate_admin_backend_phase_a;
