const db = require('./db')

/** 数据库备份记录数据访问层，统一封装 backup_records 表读写 */
const backupRecordDal = {
  /** 新建备份记录，创建时即进入 running 状态，便于失败也可审计 */
  async createRunning({ fileName, filePath, backupType = 'manual', createdBy = null }) {
    const [result] = await db.execute(
      `INSERT INTO backup_records
        (file_name, file_path, backup_type, status, created_by, started_at)
       VALUES (?, ?, ?, 'running', ?, NOW())`,
      [fileName, filePath, backupType, createdBy]
    )
    return result.insertId
  },

  /** 标记备份执行成功，并记录文件大小和完成时间 */
  async markCompleted(id, fileSize) {
    await db.execute(
      `UPDATE backup_records
       SET status = 'completed',
           file_size = ?,
           error_message = NULL,
           completed_at = NOW()
       WHERE id = ?`,
      [fileSize, id]
    )
  },

  /** 标记备份执行失败，并保留可读错误原因 */
  async markFailed(id, errorMessage) {
    await db.execute(
      `UPDATE backup_records
       SET status = 'failed',
           error_message = ?,
           completed_at = NOW()
       WHERE id = ?`,
      [errorMessage, id]
    )
  },

  /** 查询备份记录列表，管理员页面按创建时间倒序展示 */
  async findAll(limit = 100) {
    const safeLimit = Math.max(1, Math.min(Number(limit || 100), 200))
    const [rows] = await db.execute(
      `SELECT
         b.id,
         b.file_name,
         b.file_path,
         b.file_size,
         b.backup_type,
         b.status,
         b.error_message,
         b.created_by,
         u.username AS created_by_username,
         DATE_FORMAT(b.started_at, '%Y-%m-%d %H:%i:%s') AS started_at,
         DATE_FORMAT(b.completed_at, '%Y-%m-%d %H:%i:%s') AS completed_at,
         DATE_FORMAT(b.created_at, '%Y-%m-%d %H:%i:%s') AS created_at
       FROM backup_records b
       LEFT JOIN users u ON b.created_by = u.id
       ORDER BY b.created_at DESC, b.id DESC
       LIMIT ${safeLimit}`
    )
    return rows
  },

  /** 按主键查询单条备份记录 */
  async findById(id) {
    const [rows] = await db.execute(
      `SELECT
         b.id,
         b.file_name,
         b.file_path,
         b.file_size,
         b.backup_type,
         b.status,
         b.error_message,
         b.created_by,
         u.username AS created_by_username,
         DATE_FORMAT(b.started_at, '%Y-%m-%d %H:%i:%s') AS started_at,
         DATE_FORMAT(b.completed_at, '%Y-%m-%d %H:%i:%s') AS completed_at,
         DATE_FORMAT(b.created_at, '%Y-%m-%d %H:%i:%s') AS created_at
       FROM backup_records b
       LEFT JOIN users u ON b.created_by = u.id
       WHERE b.id = ?
       LIMIT 1`,
      [id]
    )
    return rows[0] || null
  },
}

module.exports = backupRecordDal
