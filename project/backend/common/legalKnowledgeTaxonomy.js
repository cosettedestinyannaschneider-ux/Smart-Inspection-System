/** 法规知识库固定行业分类，作为官方条文库、导入校验和覆盖率统计的统一来源 */
const LEGAL_KNOWLEDGE_CATEGORIES = [
  { name: '煤矿安全', sort: 1, description: '煤矿行业安全生产法律法规、标准规范和监管要求' },
  { name: '非煤矿山安全', sort: 2, description: '非煤矿山开采、尾矿库和相关作业安全要求' },
  { name: '危险化学品与化工安全', sort: 3, description: '危险化学品生产、储存、经营、使用和化工过程安全要求' },
  { name: '建筑施工安全', sort: 4, description: '建筑施工现场、高处作业、临边洞口、临时用电等安全要求' },
  { name: '消防安全', sort: 5, description: '消防设施、疏散通道、动火管理和火灾防控要求' },
  { name: '特种设备安全', sort: 6, description: '锅炉、压力容器、电梯、起重机械等特种设备安全要求' },
  { name: '交通运输安全', sort: 7, description: '道路、水路、港口、运输组织和车辆设备安全要求' },
  { name: '工贸行业安全', sort: 8, description: '冶金、有色、机械、轻工、纺织、烟草、商贸等工贸安全要求' },
  { name: '电力安全', sort: 9, description: '发电、输变电、配电和电力作业安全要求' },
  { name: '石油天然气安全', sort: 10, description: '油气勘探、开采、储运和管道安全要求' },
  { name: '农林牧渔安全', sort: 11, description: '农业机械、林业、畜牧、渔业等生产安全要求' },
  { name: '职业健康与劳动安全', sort: 12, description: '职业病防护、劳动防护用品和作业场所健康安全要求' },
  { name: '应急与事故管理', sort: 13, description: '应急预案、事故报告、调查处理和应急处置要求' },
  { name: '其他专项安全', sort: 14, description: '无法归入以上行业的专项安全法规和标准' },
]

const LEGAL_KNOWLEDGE_CATEGORY_NAMES = new Set(
  LEGAL_KNOWLEDGE_CATEGORIES.map((category) => category.name)
)

/** 判断分类名称是否属于固定法规分类 */
const isLegalKnowledgeCategoryName = (name) => LEGAL_KNOWLEDGE_CATEGORY_NAMES.has(String(name || '').trim())

module.exports = {
  LEGAL_KNOWLEDGE_CATEGORIES,
  LEGAL_KNOWLEDGE_CATEGORY_NAMES,
  isLegalKnowledgeCategoryName,
}
