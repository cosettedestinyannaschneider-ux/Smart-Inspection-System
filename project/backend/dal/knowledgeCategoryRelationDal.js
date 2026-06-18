const db = require('./db')

/** 知识文档适用分类关联数据访问层 */
const knowledgeCategoryRelationDal = {
  /** 替换某个知识文档的全部适用分类 */
  async replaceByKnowledgeId(knowledgeId, categoryIds = []) {
    const normalizedIds = Array.from(new Set(
      categoryIds.map((item) => Number(item || 0)).filter((item) => item > 0)
    ))

    const connection = await db.getConnection()
    try {
      await connection.beginTransaction()
      await connection.execute('DELETE FROM knowledge_category_relations WHERE knowledge_id = ?', [knowledgeId])

      for (const categoryId of normalizedIds) {
        await connection.execute(
          `INSERT IGNORE INTO knowledge_category_relations (knowledge_id, category_id, relation_type)
           VALUES (?, ?, 'applicable')`,
          [knowledgeId, categoryId]
        )
      }

      await connection.commit()
    } catch (error) {
      await connection.rollback()
      throw error
    } finally {
      connection.release()
    }
  },

  /** 删除某个知识文档的适用分类关系 */
  async deleteByKnowledgeId(knowledgeId) {
    await db.execute('DELETE FROM knowledge_category_relations WHERE knowledge_id = ?', [knowledgeId])
  },
}

module.exports = knowledgeCategoryRelationDal
