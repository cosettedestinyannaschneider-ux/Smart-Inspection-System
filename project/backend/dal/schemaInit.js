const db = require('./db')
const { hasModelConfigSecret, encryptApiKey } = require('../bll/modelConfigCryptoService')
const { LEGAL_KNOWLEDGE_CATEGORIES } = require('../common/legalKnowledgeTaxonomy')

/**
 * 数据库结构初始化与迁移模块
 *
 * 采用渐进式 ALTER：仅处理低风险补充结构，所有操作通过存在性检查保证幂等。
 * 企业、部门和用户的旧数据关系必须使用独立迁移 SQL，禁止在服务启动时静默迁移。
 */
const schemaInit = {
  async init() {
    console.log('[schemaInit] 开始检查数据库结构...')

    // FK 依赖顺序：enterprises → departments → users → user_permissions
    //              → sessions → inspection_reports
    //              → hazard_images → inspection_report_images → action_logs
    //              → knowledge_categories → knowledge
    //              → ai_model_configs → report_templates → backup_records
    await this.step03_enterprises()
    await this.step01_departments()
    await this.step02_users()
    await this.step02UserPermissions()
    await this.step02AuthSessions()
    await this.step04_sessions()
    await this.step05_inspectionReports()
    await this.step07_hazardImages()
    await this.step06_inspectionReportImages()
    await this.step08_knowledgeCategories()
    await this.step09_knowledge()
    await this.step09KnowledgeCategoryRelations()
    await this.step09KnowledgeClauses()
    await this.step09KnowledgeClauseDrafts()
    await this.step09InspectionReportKnowledgeRefs()
    await this.step09InspectionReportRuleRefs()
    await this.step09HazardRules()
    await this.step10_actionLogs()
    await this.step11_aiModelConfigs()
    await this.step12_reportTemplates()
    await this.step13BackupRecords()

    console.log('[schemaInit] 数据库结构检查完成')
  },

  /** 检查列是否存在 */
  async _hasColumn(table, column) {
    try {
      const [rows] = await db.execute(`SHOW COLUMNS FROM \`${table}\` LIKE '${column}'`)
      return rows.length > 0
    } catch { return false }
  },

  /** 检查表是否存在 */
  async _hasTable(table) {
    try {
      const [rows] = await db.execute(`SHOW TABLES LIKE '${table}'`)
      return rows.length > 0
    } catch { return false }
  },

  /** 安全添加列：存在则跳过 */
  async _addColumn(table, colDef) {
    const colName = colDef.trim().split(/\s+/)[0].replace(/`/g, '')
    if (await this._hasColumn(table, colName)) return
    try { await db.execute(`ALTER TABLE \`${table}\` ADD COLUMN ${colDef}`) }
    catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') console.warn(`[schemaInit] ${table}.${colName}: ${e.message}`) }
  },

  /** 安全添加索引：存在则跳过 */
  async _addIndex(table, indexName, indexDef) {
    try { await db.execute(`ALTER TABLE \`${table}\` ADD ${indexDef}`) }
    catch (e) { /* 索引已存在则忽略 */ }
  },

  /** 检查索引是否存在 */
  async _hasIndex(table, indexName) {
    try {
      const [rows] = await db.execute(`SHOW INDEX FROM \`${table}\` WHERE Key_name = '${indexName}'`)
      return rows.length > 0
    } catch { return false }
  },

  /** 安全删除旧索引：不存在则跳过 */
  async _dropIndex(table, indexName) {
    if (!await this._hasIndex(table, indexName)) return
    try { await db.execute(`ALTER TABLE \`${table}\` DROP INDEX \`${indexName}\``) }
    catch (e) { /* 索引不存在或无法删除则忽略 */ }
  },

  /** 安全添加外键：存在则跳过 */
  async _addFK(table, fkName, fkDef) {
    try { await db.execute(`ALTER TABLE \`${table}\` ADD CONSTRAINT ${fkName} ${fkDef}`) }
    catch (e) { /* FK 已存在则忽略 */ }
  },

  // =========================================================================
  // Step 1: 部门表（企业 1:N 部门）
  // =========================================================================
  async step01_departments() {
    if (await this._hasTable('departments')) {
      if (!await this._hasColumn('departments', 'enterprise_id')) {
        await this._addColumn('departments', 'enterprise_id INT DEFAULT NULL')
        console.warn('[schemaInit] departments.enterprise_id 已补齐；旧部门暂未绑定企业，请在管理员端完成组织归属整理')
      }
      await this._dropIndex('departments', 'uk_departments_name')
      await this._addIndex('departments', 'uk_departments_enterprise_name', 'UNIQUE KEY uk_departments_enterprise_name (enterprise_id, name)')
      await this._addIndex('departments', 'idx_departments_enterprise_id', 'KEY idx_departments_enterprise_id (enterprise_id)')
      await this._addFK('departments', 'fk_departments_enterprise',
        'FOREIGN KEY (enterprise_id) REFERENCES enterprises (id) ON DELETE RESTRICT ON UPDATE CASCADE')
      return
    }
    await db.execute(`
      CREATE TABLE IF NOT EXISTS departments (
        id             INT           NOT NULL AUTO_INCREMENT,
        enterprise_id  INT           NOT NULL,
        name           VARCHAR(100)  NOT NULL,
        created_at     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uk_departments_enterprise_name (enterprise_id, name),
        KEY idx_departments_enterprise_id (enterprise_id),
        CONSTRAINT fk_departments_enterprise
          FOREIGN KEY (enterprise_id) REFERENCES enterprises (id)
          ON DELETE RESTRICT ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `)
    console.log('[schemaInit] departments 已创建')
  },

  // =========================================================================
  // Step 2: 用户表（增强安全字段）
  // =========================================================================
  async step02_users() {
    // 新增字段
    for (const colDef of [
      'department_id INT DEFAULT NULL',
      "status VARCHAR(20) NOT NULL DEFAULT 'active'",
      'login_attempts INT NOT NULL DEFAULT 0',
      'locked_until DATETIME DEFAULT NULL',
      'last_login_at DATETIME DEFAULT NULL',
      'created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP',
      'updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
    ]) {
      await this._addColumn('users', colDef)
    }

    // 索引
    await this._addIndex('users', 'uk_users_username', 'UNIQUE KEY uk_users_username (username)')
    await this._addIndex('users', 'idx_users_role', 'KEY idx_users_role (role)')
    await this._addIndex('users', 'idx_users_department_id', 'KEY idx_users_department_id (department_id)')

    // 修改 password 为 VARCHAR(255) 以容纳 scrypt 哈希
    try { await db.execute("ALTER TABLE users MODIFY password VARCHAR(255) NOT NULL COMMENT 'scrypt加盐哈希'") }
    catch (e) { /* 忽略 */ }

    // 外键（departments 表必须已存在）
    await this._addFK('users', 'fk_users_department',
      'FOREIGN KEY (department_id) REFERENCES departments (id) ON DELETE SET NULL ON UPDATE CASCADE')
  },

  // =========================================================================
  // Step 2.1: 用户权限关联表
  // =========================================================================
  async step02UserPermissions() {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS user_permissions (
        user_id         INT          NOT NULL,
        permission_key  VARCHAR(100) NOT NULL,
        created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, permission_key),
        KEY idx_user_permissions_permission_key (permission_key),
        CONSTRAINT fk_user_permissions_user
          FOREIGN KEY (user_id) REFERENCES users (id)
          ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `)
  },

  // =========================================================================
  // Step 2.2: 认证会话表
  // =========================================================================
  async step02AuthSessions() {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS auth_sessions (
        id            INT           NOT NULL AUTO_INCREMENT,
        jti           VARCHAR(64)   NOT NULL,
        user_id       INT           NOT NULL,
        role_snapshot VARCHAR(20)   NOT NULL,
        status        ENUM('active','revoked','expired') NOT NULL DEFAULT 'active',
        expires_at    DATETIME      NOT NULL,
        revoked_at    DATETIME      DEFAULT NULL,
        last_seen_at  DATETIME      DEFAULT NULL,
        last_ip       VARCHAR(45)   DEFAULT NULL,
        user_agent    VARCHAR(500)  DEFAULT NULL,
        created_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uk_auth_sessions_jti (jti),
        KEY idx_auth_sessions_user_id (user_id),
        KEY idx_auth_sessions_status (status),
        KEY idx_auth_sessions_expires_at (expires_at),
        CONSTRAINT fk_auth_sessions_user
          FOREIGN KEY (user_id) REFERENCES users (id)
          ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `)
  },

  // =========================================================================
  // Step 3: 企业表（PK 从 user_id 迁移到独立 id）
  // =========================================================================
  async step03_enterprises() {
    if (!await this._hasTable('enterprises')) {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS enterprises (
          id                INT           NOT NULL AUTO_INCREMENT,
          user_id           INT           DEFAULT NULL,
          name              VARCHAR(200)  NOT NULL,
          region            VARCHAR(200)  DEFAULT NULL,
          address           VARCHAR(500)  DEFAULT NULL,
          contact           VARCHAR(100)  DEFAULT NULL,
          phone             VARCHAR(50)   DEFAULT NULL,
          industry          VARCHAR(100)  DEFAULT NULL,
          enterprise_type   VARCHAR(100)  DEFAULT NULL,
          scale             VARCHAR(50)   DEFAULT NULL,
          production_process TEXT         DEFAULT NULL,
          inspector_name    VARCHAR(100)  DEFAULT NULL,
          inspection_date   DATE          DEFAULT NULL,
          inspection_status ENUM('pending','inspecting','rectification','completed') NOT NULL DEFAULT 'pending',
          project_name      VARCHAR(200)  DEFAULT NULL,
          status            VARCHAR(20)   NOT NULL DEFAULT 'active',
          created_at        TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at        TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          KEY idx_enterprises_user_id (user_id),
          KEY idx_enterprises_name (name(100)),
          KEY idx_enterprises_region (region(100)),
          KEY idx_enterprises_inspection_status (inspection_status),
          KEY idx_enterprises_status (status)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `)
      console.log('[schemaInit] enterprises 已创建')
      return
    }

    const hasId = await this._hasColumn('enterprises', 'id')

    if (!hasId) {
      // 先删除旧主键（user_id），再添加自增 id 作为新主键
      try { await db.execute('ALTER TABLE enterprises DROP PRIMARY KEY') } catch (e) { /* 可能没有主键 */ }
      try { await db.execute('ALTER TABLE enterprises MODIFY user_id INT NOT NULL') } catch (e) { /* 已经是 INT */ }
      try { await db.execute('ALTER TABLE enterprises ADD COLUMN id INT NOT NULL AUTO_INCREMENT PRIMARY KEY FIRST') }
      catch (e) { console.warn('[schemaInit] enterprises 添加 id 列失败:', e.message) }
    }

    // 新增业务字段
    for (const colDef of [
      'industry VARCHAR(100) DEFAULT NULL',
      'enterprise_type VARCHAR(100) DEFAULT NULL',
      'scale VARCHAR(50) DEFAULT NULL',
      'production_process TEXT DEFAULT NULL',
      'inspector_name VARCHAR(100) DEFAULT NULL',
      'inspection_date DATE DEFAULT NULL',
      "inspection_status ENUM('pending','inspecting','rectification','completed') NOT NULL DEFAULT 'pending'",
      'project_name VARCHAR(200) DEFAULT NULL',
      "status VARCHAR(20) NOT NULL DEFAULT 'active'",
      'updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
    ]) {
      await this._addColumn('enterprises', colDef)
    }

    // 索引
    await this._addIndex('enterprises', 'idx_enterprises_name', 'KEY idx_enterprises_name (name(100))')
    await this._addIndex('enterprises', 'idx_enterprises_region', 'KEY idx_enterprises_region (region(100))')
    await this._addIndex('enterprises', 'idx_enterprises_status', 'KEY idx_enterprises_status (status)')
    await this._addIndex('enterprises', 'idx_enterprises_inspection_status', 'KEY idx_enterprises_inspection_status (inspection_status)')

    if (!await this._hasColumn('departments', 'enterprise_id')) {
      console.warn('[schemaInit] enterprises.user_id 保留旧关系，请执行阶段 A 独立迁移 SQL 后再启用组织关系')
    }
  },

  // =========================================================================
  // Step 4: 会话表（替代内存 Map）
  // =========================================================================
  async step04_sessions() {
    if (await this._hasTable('sessions')) return
    await db.execute(`
      CREATE TABLE IF NOT EXISTS sessions (
        id          VARCHAR(64)   NOT NULL,
        user_id     INT           NOT NULL,
        title       VARCHAR(200)  DEFAULT '新对话',
        status      VARCHAR(20)   NOT NULL DEFAULT 'active',
        created_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_sessions_user_id (user_id),
        KEY idx_sessions_created_at (created_at),
        CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `)
    console.log('[schemaInit] sessions 已创建')
  },

  // =========================================================================
  // Step 5: 排查报告表（原 results 表重命名并增强）
  // =========================================================================
  async step05_inspectionReports() {
    const hasResults = await this._hasTable('results')
    const hasReports = await this._hasTable('inspection_reports')

    if (hasResults && !hasReports) {
      // 重命名旧表
      try { await db.execute('RENAME TABLE results TO inspection_reports') }
      catch (e) { console.warn('[schemaInit] 重命名 results → inspection_reports 失败:', e.message) }
    }

    // 如果是全新环境，创建 inspection_reports 表
    if (!hasResults && !hasReports) {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS inspection_reports (
          id              INT           NOT NULL AUTO_INCREMENT,
          user_id         INT           NOT NULL,
          enterprise_id   INT           DEFAULT NULL,
          session_id      VARCHAR(64)   DEFAULT NULL,
          title           VARCHAR(300)  DEFAULT NULL,
          prompt          TEXT          DEFAULT NULL,
          result          LONGTEXT      DEFAULT NULL,
          word_path       VARCHAR(500)  DEFAULT NULL,
          pdf_path        VARCHAR(500)  DEFAULT NULL,
          image_path      VARCHAR(500)  DEFAULT NULL,
          status          VARCHAR(20)   NOT NULL DEFAULT 'completed',
          review_status   VARCHAR(30)   NOT NULL DEFAULT 'pending',
          review_required TINYINT(1)    NOT NULL DEFAULT 1,
          review_comment  TEXT          DEFAULT NULL,
          reviewed_by     INT           DEFAULT NULL,
          reviewed_at     DATETIME      DEFAULT NULL,
          report_allowed  TINYINT(1)    NOT NULL DEFAULT 0,
          report_block_reason VARCHAR(500) DEFAULT NULL,
          created_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          KEY idx_ir_user_id (user_id),
          KEY idx_ir_session_id (session_id),
          KEY idx_ir_created_at (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `)
    }

    // 为已有 inspection_reports 表添加新列
    if (hasReports || hasResults) {
      for (const colDef of [
        'enterprise_id INT DEFAULT NULL',
        'session_id VARCHAR(64) DEFAULT NULL',
        'title VARCHAR(300) DEFAULT NULL',
        'image_path VARCHAR(500) DEFAULT NULL',
        "status VARCHAR(20) NOT NULL DEFAULT 'completed'",
        "review_status VARCHAR(30) NOT NULL DEFAULT 'pending'",
        'review_required TINYINT(1) NOT NULL DEFAULT 1',
        'review_comment TEXT DEFAULT NULL',
        'reviewed_by INT DEFAULT NULL',
        'reviewed_at DATETIME DEFAULT NULL',
        'report_allowed TINYINT(1) NOT NULL DEFAULT 0',
        'report_block_reason VARCHAR(500) DEFAULT NULL',
        'updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
      ]) {
        await this._addColumn('inspection_reports', colDef)
      }
      // 确保 session_id 迁移无问题的索引
      await this._addIndex('inspection_reports', 'idx_ir_session_id', 'KEY idx_ir_session_id (session_id)')
      await this._addIndex('inspection_reports', 'idx_ir_enterprise_id', 'KEY idx_ir_enterprise_id (enterprise_id)')
      await this._addIndex('inspection_reports', 'idx_ir_status', 'KEY idx_ir_status (status)')
      await this._addIndex('inspection_reports', 'idx_ir_review_status', 'KEY idx_ir_review_status (review_status)')
      await this._addIndex('inspection_reports', 'idx_ir_reviewed_by', 'KEY idx_ir_reviewed_by (reviewed_by)')
    }

    // 外键
    await this._addFK('inspection_reports', 'fk_ir_user',
      'FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE ON UPDATE CASCADE')
    await this._addFK('inspection_reports', 'fk_ir_enterprise',
      'FOREIGN KEY (enterprise_id) REFERENCES enterprises (id) ON DELETE SET NULL ON UPDATE CASCADE')
    await this._addFK('inspection_reports', 'fk_ir_session',
      'FOREIGN KEY (session_id) REFERENCES sessions (id) ON DELETE SET NULL ON UPDATE CASCADE')
    await this._addFK('inspection_reports', 'fk_ir_reviewed_by',
      'FOREIGN KEY (reviewed_by) REFERENCES users (id) ON DELETE SET NULL ON UPDATE CASCADE')
  },

  // =========================================================================
  // Step 6: 报告-图片中间表（支持多图分析）
  // =========================================================================
  async step06_inspectionReportImages() {
    if (await this._hasTable('inspection_report_images')) return
    await db.execute(`
      CREATE TABLE IF NOT EXISTS inspection_report_images (
        id          INT           NOT NULL AUTO_INCREMENT,
        report_id   INT           NOT NULL,
        image_id    INT           NOT NULL,
        created_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uk_report_image (report_id, image_id),
        KEY idx_iri_image_id (image_id),
        CONSTRAINT fk_iri_report FOREIGN KEY (report_id) REFERENCES inspection_reports (id) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT fk_iri_image FOREIGN KEY (image_id) REFERENCES hazard_images (id) ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `)
    console.log('[schemaInit] inspection_report_images 已创建')
  },

  // =========================================================================
  // Step 7: 隐患图片表（增强字段）
  // =========================================================================
  async step07_hazardImages() {
    // 确保表存在（旧项目可能还没有这张表）
    try {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS hazard_images (
          id INT AUTO_INCREMENT PRIMARY KEY,
          user_id INT NOT NULL,
          file_path VARCHAR(255) NOT NULL,
          original_name VARCHAR(255) NULL,
          file_size INT NULL,
          label VARCHAR(100) NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_hazard_images_user_id (user_id),
          INDEX idx_hazard_images_created_at (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `)
    } catch (e) { /* 表已存在 */ }

    // 新增列
    for (const colDef of [
      'enterprise_id INT DEFAULT NULL',
      'image_width INT UNSIGNED DEFAULT NULL',
      'image_height INT UNSIGNED DEFAULT NULL',
      'hazard_type VARCHAR(100) DEFAULT NULL',
      "status VARCHAR(20) NOT NULL DEFAULT 'active'",
      'updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
    ]) {
      await this._addColumn('hazard_images', colDef)
    }

    // file_size 类型改为 BIGINT（从 INT 扩展）
    try { await db.execute('ALTER TABLE hazard_images MODIFY file_size BIGINT UNSIGNED DEFAULT NULL') }
    catch (e) { /* 忽略 */ }

    // 索引
    await this._addIndex('hazard_images', 'idx_hi_enterprise_id', 'KEY idx_hi_enterprise_id (enterprise_id)')
    await this._addIndex('hazard_images', 'idx_hi_hazard_type', 'KEY idx_hi_hazard_type (hazard_type)')
    await this._addIndex('hazard_images', 'idx_hi_status', 'KEY idx_hi_status (status)')

    // 外键
    await this._addFK('hazard_images', 'fk_hi_user',
      'FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE ON UPDATE CASCADE')
    await this._addFK('hazard_images', 'fk_hi_enterprise',
      'FOREIGN KEY (enterprise_id) REFERENCES enterprises (id) ON DELETE SET NULL ON UPDATE CASCADE')
  },

  // =========================================================================
  // Step 8: 知识库分类表（补字段）
  // =========================================================================
  async step08_knowledgeCategories() {
    // 确保表存在
    try {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS knowledge_categories (
          id INT AUTO_INCREMENT PRIMARY KEY,
          name VARCHAR(100) NOT NULL,
          sort INT DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY uk_knowledge_categories_name (name),
          INDEX idx_knowledge_categories_sort (sort)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `)
    } catch (e) { /* 已存在 */ }

    for (const colDef of [
      'description VARCHAR(500) DEFAULT NULL',
      'updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
    ]) {
      await this._addColumn('knowledge_categories', colDef)
    }

    // 固定 14 类法规分类；旧“安全生产隐患排查报告”不再作为法规分类种子。
    for (const category of LEGAL_KNOWLEDGE_CATEGORIES) {
      try {
        await db.execute(
          `INSERT INTO knowledge_categories (name, description, sort)
           VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE description = VALUES(description), sort = VALUES(sort)`,
          [category.name, category.description, category.sort]
        )
      } catch (e) { /* 忽略 */ }
    }

    // 历史兼容分类只标记为归档用途，不删除已有数据，避免破坏旧知识文档外键。
    try {
      await db.execute(
        `UPDATE knowledge_categories
         SET description = '历史兼容分类，不再作为法规条文分类使用', sort = 999
         WHERE name = '安全生产隐患排查报告'`
      )
    } catch (e) { /* 忽略 */ }
  },

  // =========================================================================
  // Step 9: 知识库条目表（补字段）
  // =========================================================================
  async step09_knowledge() {
    // 确保表存在
    try {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS knowledge (
          id INT AUTO_INCREMENT PRIMARY KEY,
          title VARCHAR(255) NOT NULL,
          file_path VARCHAR(255) DEFAULT NULL,
          description TEXT DEFAULT NULL,
          category_id INT DEFAULT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `)
    } catch (e) { /* 已存在 */ }

    for (const colDef of [
      'file_size BIGINT UNSIGNED DEFAULT NULL',
      'file_type VARCHAR(20) DEFAULT NULL',
      'source_code VARCHAR(100) DEFAULT NULL',
      'source_url VARCHAR(1000) DEFAULT NULL',
      'issuing_authority VARCHAR(200) DEFAULT NULL',
      'document_type VARCHAR(50) DEFAULT NULL',
      'publish_date DATE DEFAULT NULL',
      'effective_date DATE DEFAULT NULL',
      "current_status VARCHAR(50) NOT NULL DEFAULT '现行有效'",
      "verification_status VARCHAR(50) NOT NULL DEFAULT 'pending'",
      "parse_status VARCHAR(20) NOT NULL DEFAULT 'pending'",
      'parse_message VARCHAR(500) DEFAULT NULL',
      "status VARCHAR(20) NOT NULL DEFAULT 'active'",
      'updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
    ]) {
      await this._addColumn('knowledge', colDef)
    }

    await this._addIndex('knowledge', 'idx_knowledge_status', 'KEY idx_knowledge_status (status)')
    await this._addIndex('knowledge', 'idx_knowledge_title', 'KEY idx_knowledge_title (title(100))')
    await this._addIndex('knowledge', 'idx_knowledge_source_code', 'KEY idx_knowledge_source_code (source_code)')
    await this._addIndex('knowledge', 'idx_knowledge_document_type', 'KEY idx_knowledge_document_type (document_type)')
    await this._addIndex('knowledge', 'idx_knowledge_verification_status', 'KEY idx_knowledge_verification_status (verification_status)')

    // 外键
    await this._addFK('knowledge', 'fk_knowledge_category',
      'FOREIGN KEY (category_id) REFERENCES knowledge_categories (id) ON DELETE SET NULL ON UPDATE CASCADE')
  },

  // =========================================================================
  // Step 9.2: 知识文档适用分类关联表（一份法规可适用于多个行业分类）
  // =========================================================================
  async step09KnowledgeCategoryRelations() {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS knowledge_category_relations (
        knowledge_id  INT         NOT NULL,
        category_id   INT         NOT NULL,
        relation_type VARCHAR(20) NOT NULL DEFAULT 'applicable',
        created_at    TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (knowledge_id, category_id),
        KEY idx_kcr_category_id (category_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `)

    await this._addFK('knowledge_category_relations', 'fk_kcr_knowledge',
      'FOREIGN KEY (knowledge_id) REFERENCES knowledge (id) ON DELETE CASCADE ON UPDATE CASCADE')
    await this._addFK('knowledge_category_relations', 'fk_kcr_category',
      'FOREIGN KEY (category_id) REFERENCES knowledge_categories (id) ON DELETE CASCADE ON UPDATE CASCADE')

    // 将旧的主分类关系回填为适用分类，确保现有知识文档进入多分类检索体系。
    try {
      await db.execute(`
        INSERT IGNORE INTO knowledge_category_relations (knowledge_id, category_id)
        SELECT id, category_id
        FROM knowledge
        WHERE category_id IS NOT NULL
      `)
    } catch (e) { /* 忽略 */ }
  },

  // =========================================================================
  // Step 9.5: 知识库条款表（AI 报告引用依据）
  // =========================================================================
  async step09KnowledgeClauses() {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS knowledge_clauses (
        id            INT           NOT NULL AUTO_INCREMENT,
        knowledge_id  INT           NOT NULL,
        category_id   INT           DEFAULT NULL,
        source_title  VARCHAR(300)  NOT NULL,
        source_code   VARCHAR(100)  DEFAULT NULL,
        source_url    VARCHAR(1000) DEFAULT NULL,
        issuing_authority VARCHAR(200) DEFAULT NULL,
        document_type VARCHAR(50) DEFAULT NULL,
        publish_date  DATE DEFAULT NULL,
        effective_date DATE DEFAULT NULL,
        current_status VARCHAR(50) NOT NULL DEFAULT '现行有效',
        verification_status VARCHAR(50) NOT NULL DEFAULT 'pending',
        clause_no     VARCHAR(100)  DEFAULT NULL,
        content       TEXT          NOT NULL,
        keywords      VARCHAR(500)  DEFAULT NULL,
        sort          INT           NOT NULL DEFAULT 0,
        status        VARCHAR(20)   NOT NULL DEFAULT 'active',
        created_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_kcl_knowledge_id (knowledge_id),
        KEY idx_kcl_category_id (category_id),
        KEY idx_kcl_source_code (source_code),
        KEY idx_kcl_clause_no (clause_no),
        KEY idx_kcl_status (status),
        KEY idx_kcl_sort (sort)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `)

    for (const colDef of [
      'source_url VARCHAR(1000) DEFAULT NULL',
      'issuing_authority VARCHAR(200) DEFAULT NULL',
      'document_type VARCHAR(50) DEFAULT NULL',
      'publish_date DATE DEFAULT NULL',
      'effective_date DATE DEFAULT NULL',
      "current_status VARCHAR(50) NOT NULL DEFAULT '现行有效'",
      "verification_status VARCHAR(50) NOT NULL DEFAULT 'pending'",
    ]) {
      await this._addColumn('knowledge_clauses', colDef)
    }

    await this._addIndex('knowledge_clauses', 'idx_kcl_document_type', 'KEY idx_kcl_document_type (document_type)')
    await this._addIndex('knowledge_clauses', 'idx_kcl_verification_status', 'KEY idx_kcl_verification_status (verification_status)')
    await this._addIndex('knowledge_clauses', 'idx_kcl_current_status', 'KEY idx_kcl_current_status (current_status)')

    await this._addFK('knowledge_clauses', 'fk_kcl_knowledge',
      'FOREIGN KEY (knowledge_id) REFERENCES knowledge (id) ON DELETE CASCADE ON UPDATE CASCADE')
    await this._addFK('knowledge_clauses', 'fk_kcl_category',
      'FOREIGN KEY (category_id) REFERENCES knowledge_categories (id) ON DELETE SET NULL ON UPDATE CASCADE')
  },

  // =========================================================================
  // Step 9.6: 知识库条款抽取草稿表（PDF/DOCX 抽取先审核再入正式库）
  // =========================================================================
  async step09KnowledgeClauseDrafts() {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS knowledge_clause_drafts (
        id            INT           NOT NULL AUTO_INCREMENT,
        knowledge_id  INT           NOT NULL,
        category_id   INT           DEFAULT NULL,
        source_title  VARCHAR(300)  NOT NULL,
        source_code   VARCHAR(100)  DEFAULT NULL,
        source_url    VARCHAR(1000) DEFAULT NULL,
        issuing_authority VARCHAR(200) DEFAULT NULL,
        document_type VARCHAR(50) DEFAULT NULL,
        publish_date  DATE DEFAULT NULL,
        effective_date DATE DEFAULT NULL,
        current_status VARCHAR(50) NOT NULL DEFAULT '现行有效',
        clause_no     VARCHAR(100)  DEFAULT NULL,
        content       TEXT          NOT NULL,
        keywords      VARCHAR(500)  DEFAULT NULL,
        extraction_method VARCHAR(30) NOT NULL DEFAULT 'auto',
        confidence_level VARCHAR(20) NOT NULL DEFAULT 'medium',
        review_status VARCHAR(20) NOT NULL DEFAULT 'pending',
        review_note   VARCHAR(500) DEFAULT NULL,
        reviewed_by   INT DEFAULT NULL,
        reviewed_at   DATETIME DEFAULT NULL,
        sort          INT           NOT NULL DEFAULT 0,
        status        VARCHAR(20)   NOT NULL DEFAULT 'active',
        created_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_kcd_knowledge_id (knowledge_id),
        KEY idx_kcd_category_id (category_id),
        KEY idx_kcd_review_status (review_status),
        KEY idx_kcd_status (status),
        KEY idx_kcd_sort (sort)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `)

    for (const colDef of [
      "extraction_method VARCHAR(30) NOT NULL DEFAULT 'auto'",
      "confidence_level VARCHAR(20) NOT NULL DEFAULT 'medium'",
      "review_status VARCHAR(20) NOT NULL DEFAULT 'pending'",
      'review_note VARCHAR(500) DEFAULT NULL',
      'reviewed_by INT DEFAULT NULL',
      'reviewed_at DATETIME DEFAULT NULL',
      "status VARCHAR(20) NOT NULL DEFAULT 'active'",
    ]) {
      await this._addColumn('knowledge_clause_drafts', colDef)
    }

    await this._addIndex('knowledge_clause_drafts', 'idx_kcd_knowledge_id', 'KEY idx_kcd_knowledge_id (knowledge_id)')
    await this._addIndex('knowledge_clause_drafts', 'idx_kcd_category_id', 'KEY idx_kcd_category_id (category_id)')
    await this._addIndex('knowledge_clause_drafts', 'idx_kcd_review_status', 'KEY idx_kcd_review_status (review_status)')
    await this._addIndex('knowledge_clause_drafts', 'idx_kcd_status', 'KEY idx_kcd_status (status)')

    await this._addFK('knowledge_clause_drafts', 'fk_kcd_knowledge',
      'FOREIGN KEY (knowledge_id) REFERENCES knowledge (id) ON DELETE CASCADE ON UPDATE CASCADE')
    await this._addFK('knowledge_clause_drafts', 'fk_kcd_category',
      'FOREIGN KEY (category_id) REFERENCES knowledge_categories (id) ON DELETE SET NULL ON UPDATE CASCADE')
    await this._addFK('knowledge_clause_drafts', 'fk_kcd_reviewer',
      'FOREIGN KEY (reviewed_by) REFERENCES users (id) ON DELETE SET NULL ON UPDATE CASCADE')
  },
  // =========================================================================
  // Step 9.6: 报告-知识条款引用表（保存 AI 报告引用依据快照）
  // =========================================================================
  async step09InspectionReportKnowledgeRefs() {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS inspection_report_knowledge_refs (
        id                  INT           NOT NULL AUTO_INCREMENT,
        report_id           INT           NOT NULL,
        knowledge_clause_id INT           DEFAULT NULL,
        knowledge_id        INT           DEFAULT NULL,
        source_title        VARCHAR(300)  NOT NULL,
        source_code         VARCHAR(100)  DEFAULT NULL,
        clause_no           VARCHAR(100)  DEFAULT NULL,
        content             TEXT          NOT NULL,
        match_keyword       VARCHAR(100)  DEFAULT NULL,
        sort                INT           NOT NULL DEFAULT 0,
        created_at          TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_irk_report_id (report_id),
        KEY idx_irk_clause_id (knowledge_clause_id),
        KEY idx_irk_knowledge_id (knowledge_id),
        KEY idx_irk_sort (sort)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `)

    await this._addFK('inspection_report_knowledge_refs', 'fk_irk_report',
      'FOREIGN KEY (report_id) REFERENCES inspection_reports (id) ON DELETE CASCADE ON UPDATE CASCADE')
  },

  // =========================================================================
  // Step 9.7: 报告-规则快照（保证正式报告判定链可追溯）
  // =========================================================================
  async step09InspectionReportRuleRefs() {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS inspection_report_rule_refs (
        id                   INT           NOT NULL AUTO_INCREMENT,
        report_id            INT           NOT NULL,
        rule_id              INT           DEFAULT NULL,
        rule_name            VARCHAR(200)  NOT NULL,
        hazard_level         VARCHAR(50)   DEFAULT NULL,
        evidence_sufficiency VARCHAR(50)   DEFAULT NULL,
        judgment_reason      TEXT          DEFAULT NULL,
        sort                 INT           NOT NULL DEFAULT 0,
        created_at           TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_irrr_report_id (report_id),
        KEY idx_irrr_rule_id (rule_id),
        KEY idx_irrr_sort (sort)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `)

    await this._addFK('inspection_report_rule_refs', 'fk_irrr_report',
      'FOREIGN KEY (report_id) REFERENCES inspection_reports (id) ON DELETE CASCADE ON UPDATE CASCADE')
  },
  // =========================================================================
  // Step 9.8: 隐患判定规则库（法规条文到隐患等级的人工规则映射）
  // =========================================================================
  async step09HazardRules() {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS hazard_rules (
        id                          INT           NOT NULL AUTO_INCREMENT,
        seed_key                    VARCHAR(100)  DEFAULT NULL,
        name                        VARCHAR(200)  NOT NULL,
        category_id                 INT           DEFAULT NULL,
        hazard_level                VARCHAR(50)   NOT NULL,
        visible_fact_keywords       VARCHAR(500)  DEFAULT NULL,
        trigger_condition           TEXT          NOT NULL,
        required_evidence           TEXT          NOT NULL,
        image_evidence_supported    TINYINT(1)    NOT NULL DEFAULT 0,
        insufficient_evidence_level VARCHAR(50)   NOT NULL DEFAULT '需人工复核',
        rectification_template      TEXT          NOT NULL,
        is_active                   TINYINT(1)    NOT NULL DEFAULT 0,
        status                      VARCHAR(20)   NOT NULL DEFAULT 'active',
        created_at                  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at                  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uk_hazard_rules_seed_key (seed_key),
        KEY idx_hr_category_id (category_id),
        KEY idx_hr_hazard_level (hazard_level),
        KEY idx_hr_is_active (is_active),
        KEY idx_hr_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `)

    await db.execute(`
      CREATE TABLE IF NOT EXISTS hazard_rule_clause_refs (
        rule_id    INT       NOT NULL,
        clause_id  INT       NOT NULL,
        sort       INT       NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (rule_id, clause_id),
        KEY idx_hrcr_clause_id (clause_id),
        KEY idx_hrcr_sort (sort)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `)

    for (const colDef of [
      'seed_key VARCHAR(100) DEFAULT NULL',
      'visible_fact_keywords VARCHAR(500) DEFAULT NULL',
      'image_evidence_supported TINYINT(1) NOT NULL DEFAULT 0',
      "insufficient_evidence_level VARCHAR(50) NOT NULL DEFAULT '需人工复核'",
      'is_active TINYINT(1) NOT NULL DEFAULT 0',
      "status VARCHAR(20) NOT NULL DEFAULT 'active'",
      'updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
    ]) {
      await this._addColumn('hazard_rules', colDef)
    }

    await this._addIndex('hazard_rules', 'uk_hazard_rules_seed_key', 'UNIQUE KEY uk_hazard_rules_seed_key (seed_key)')
    await this._addIndex('hazard_rules', 'idx_hr_category_id', 'KEY idx_hr_category_id (category_id)')
    await this._addIndex('hazard_rules', 'idx_hr_hazard_level', 'KEY idx_hr_hazard_level (hazard_level)')
    await this._addIndex('hazard_rules', 'idx_hr_is_active', 'KEY idx_hr_is_active (is_active)')
    await this._addIndex('hazard_rules', 'idx_hr_status', 'KEY idx_hr_status (status)')
    await this._addIndex('hazard_rule_clause_refs', 'idx_hrcr_clause_id', 'KEY idx_hrcr_clause_id (clause_id)')
    await this._addIndex('hazard_rule_clause_refs', 'idx_hrcr_sort', 'KEY idx_hrcr_sort (sort)')

    await this._addFK('hazard_rules', 'fk_hr_category',
      'FOREIGN KEY (category_id) REFERENCES knowledge_categories (id) ON DELETE SET NULL ON UPDATE CASCADE')
    await this._addFK('hazard_rule_clause_refs', 'fk_hrcr_rule',
      'FOREIGN KEY (rule_id) REFERENCES hazard_rules (id) ON DELETE CASCADE ON UPDATE CASCADE')
    await this._addFK('hazard_rule_clause_refs', 'fk_hrcr_clause',
      'FOREIGN KEY (clause_id) REFERENCES knowledge_clauses (id) ON DELETE RESTRICT ON UPDATE CASCADE')
  },
  // =========================================================================
  // Step 10: 操作日志表（补字段）
  // =========================================================================
  async step10_actionLogs() {
    // 确保表存在
    try {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS action_logs (
          id INT AUTO_INCREMENT PRIMARY KEY,
          user_id INT NOT NULL,
          action VARCHAR(100) NOT NULL,
          details TEXT DEFAULT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `)
    } catch (e) { /* 已存在 */ }

    await this._addColumn('action_logs', 'ip_address VARCHAR(45) DEFAULT NULL')
    await this._addIndex('action_logs', 'idx_al_action', 'KEY idx_al_action (action)')
    await this._addIndex('action_logs', 'idx_al_created_at', 'KEY idx_al_created_at (created_at)')

    await this._addFK('action_logs', 'fk_al_user',
      'FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE ON UPDATE CASCADE')
  },

  // =========================================================================
  // Step 11: AI 模型配置表（替代 .env 硬编码）
  // =========================================================================
  async step11_aiModelConfigs() {
    if (!await this._hasTable('ai_model_configs')) {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS ai_model_configs (
          id                INT           NOT NULL AUTO_INCREMENT,
          name              VARCHAR(100)  NOT NULL,
          provider          VARCHAR(100)  NOT NULL,
          base_url          VARCHAR(500)  NOT NULL,
          api_key_encrypted VARCHAR(500)  NOT NULL,
          model_name        VARCHAR(100)  NOT NULL,
          is_active         TINYINT(1)    NOT NULL DEFAULT 0,
          max_tokens        INT           NOT NULL DEFAULT 4096,
          temperature       DECIMAL(3,2)  NOT NULL DEFAULT 0.70,
          timeout_ms        INT           NOT NULL DEFAULT 60000,
          created_at        TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at        TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          KEY idx_amc_is_active (is_active)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `)

      // 从 .env 读取当前配置写入种子数据。
      const baseUrl = process.env.ARK_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3'
      const apiKey = process.env.ARK_API_KEY || ''
      const model = process.env.ARK_MODEL || 'deepseek-v3'
      try {
        const storedApiKey = apiKey && hasModelConfigSecret() ? encryptApiKey(apiKey) : apiKey
        await db.execute(
          'INSERT IGNORE INTO ai_model_configs (name, provider, base_url, api_key_encrypted, model_name, is_active) VALUES (?, ?, ?, ?, ?, 1)',
          ['default', '豆包', baseUrl, storedApiKey, model]
        )
      } catch (e) { /* 忽略 */ }
      console.log('[schemaInit] ai_model_configs 已创建')
      return
    }

    if (!await this._hasColumn('ai_model_configs', 'provider')) {
      await this._addColumn('ai_model_configs', 'provider VARCHAR(100) DEFAULT NULL')
      console.warn('[schemaInit] ai_model_configs.provider 已添加；旧数据回填请执行阶段 A 独立迁移 SQL')
    }
  },

  // =========================================================================
  // Step 12: 报告模板表（立项书 §四(七)）
  // =========================================================================
  async step12_reportTemplates() {
    if (!await this._hasTable('report_templates')) {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS report_templates (
          id          INT           NOT NULL AUTO_INCREMENT,
          name        VARCHAR(200)  NOT NULL,
          file_path   VARCHAR(500)  DEFAULT NULL,
          description TEXT          DEFAULT NULL,
          is_default  TINYINT(1)    NOT NULL DEFAULT 0,
          created_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `)
      console.log('[schemaInit] report_templates 已创建')
    }

    try {
      const [rows] = await db.execute(`
        SELECT
          COUNT(*) AS total_count,
          SUM(CASE WHEN is_default = 1 THEN 1 ELSE 0 END) AS default_count
        FROM report_templates
      `)
      const totalCount = Number(rows[0]?.total_count || 0)
      const defaultCount = Number(rows[0]?.default_count || 0)
      if (totalCount > 0 && defaultCount === 0) {
        await db.execute(`
          UPDATE report_templates
          SET is_default = 1
          WHERE id = (
            SELECT id FROM (
              SELECT id FROM report_templates ORDER BY id ASC LIMIT 1
            ) seeded_default
          )
        `)
      } else if (defaultCount > 1) {
        await db.execute(`
          UPDATE report_templates
          SET is_default = CASE
            WHEN id = (
              SELECT id FROM (
                SELECT id
                FROM report_templates
                WHERE is_default = 1
                ORDER BY updated_at DESC, id DESC
                LIMIT 1
              ) latest_default
            ) THEN 1
            ELSE 0
          END
        `)
      }
    } catch (error) {
      console.warn('[schemaInit] report_templates default normalization failed:', error.message)
    }
  },

  // =========================================================================
  // Step 13: 数据库备份记录表
  // =========================================================================
  async step13BackupRecords() {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS backup_records (
        id            BIGINT        NOT NULL AUTO_INCREMENT,
        file_name     VARCHAR(255)  NOT NULL,
        file_path     VARCHAR(500)  NOT NULL,
        file_size     BIGINT UNSIGNED DEFAULT NULL,
        backup_type   VARCHAR(20)   NOT NULL DEFAULT 'manual',
        status        VARCHAR(20)   NOT NULL DEFAULT 'pending',
        error_message TEXT          DEFAULT NULL,
        created_by    INT           DEFAULT NULL,
        started_at    DATETIME      DEFAULT NULL,
        completed_at  DATETIME      DEFAULT NULL,
        created_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_backup_records_status (status),
        KEY idx_backup_records_type (backup_type),
        KEY idx_backup_records_created_by (created_by),
        KEY idx_backup_records_created_at (created_at),
        CONSTRAINT fk_backup_records_created_by
          FOREIGN KEY (created_by) REFERENCES users (id)
          ON DELETE SET NULL ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `)
  },
}

module.exports = schemaInit
