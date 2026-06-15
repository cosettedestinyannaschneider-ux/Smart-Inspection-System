const knowledgeDal = require('../dal/knowledgeDal');
const fs = require('fs');
const path = require('path');

const knowledgeService = {
  /**
   * 添加知识库文件（支持分类）
   * @param {string} title
   * @param {string} filePath
   * @param {string} description
   * @param {number|null} categoryId
   */
  async addKnowledge(title, filePath, description, categoryId = null) {
    return await knowledgeDal.create(title, filePath, description, categoryId);
  },

  async getAllKnowledge() {
    return await knowledgeDal.findAll();
  },

  /**
   * 更新知识条目（支持分类）
   * @param {number} id
   * @param {string} title
   * @param {string} description
   * @param {number|null} categoryId
   */
  async updateKnowledge(id, title, description, categoryId = null) {
    return await knowledgeDal.update(id, title, description, null, categoryId);
  },

  async deleteKnowledge(id) {
    const item = await knowledgeDal.findById(id);
    if (item) {
      const fullPath = path.join(__dirname, '..', item.file_path);
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
      }
      await knowledgeDal.delete(id);
    }
  }
};

module.exports = knowledgeService;
