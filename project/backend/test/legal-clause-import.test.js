const test = require('node:test')
const assert = require('node:assert/strict')
const {
  REQUIRED_HEADERS,
  stringifyCsv,
  parseCsvRecords,
  importCsvText,
} = require('../bll/legalClauseImportService')
const knowledgeDal = require('../dal/knowledgeDal')
const knowledgeCategoryDal = require('../dal/knowledgeCategoryDal')
const knowledgeCategoryRelationDal = require('../dal/knowledgeCategoryRelationDal')
const knowledgeClauseDal = require('../dal/knowledgeClauseDal')
const {
  validateLegalClauseCsvText,
} = require('../bll/legalClauseValidationService')

const originalMethods = []
const patch = (target, method, implementation) => {
  originalMethods.push([target, method, target[method]])
  target[method] = implementation
}

const restorePatches = () => {
  while (originalMethods.length) {
    const [target, method, original] = originalMethods.pop()
    target[method] = original
  }
}

test('法规条文 CSV 模板包含固定表头', () => {
  assert.deepEqual(REQUIRED_HEADERS, [
    '分类',
    '法规名称',
    '文号/标准号',
    '条款号',
    '条文内容',
    '关键词',
    '官方来源URL',
    '发布机关',
    '施行日期',
    '现行状态',
    '备注',
  ])
})

test('法规条文 CSV 解析支持逗号和双引号转义', () => {
  const csv = stringifyCsv([{
    分类: '消防安全',
    法规名称: '中华人民共和国消防法',
    '文号/标准号': '主席令第二十九号',
    条款号: '第二十八条',
    条文内容: '不得占用、堵塞、封闭疏散通道，安全出口。',
    关键词: '消防通道,安全出口',
    官方来源URL: 'https://www.gov.cn/example',
    发布机关: '全国人民代表大会常务委员会',
    施行日期: '2021-04-29',
    现行状态: '现行有效',
    备注: '包含逗号和“引号”的测试',
  }])

  const records = parseCsvRecords(csv)
  assert.equal(records.length, 1)
  assert.equal(records[0].分类, '消防安全')
  assert.equal(records[0].关键词, '消防通道,安全出口')
  assert.equal(records[0].备注, '包含逗号和“引号”的测试')
})

test('法规条文 CSV 缺少必填表头时拒绝解析', () => {
  assert.throws(
    () => parseCsvRecords('"分类","法规名称"\n"消防安全","中华人民共和国消防法"'),
    /CSV 缺少必填表头/
  )
})

test('法规条文 CSV 校验会阻断 local 来源和重复条款', () => {
  const row = {
    分类: '消防安全',
    法规名称: '中华人民共和国消防法',
    '文号/标准号': '主席令第二十九号',
    条款号: '第二十八条',
    条文内容: '任何单位、个人不得占用、堵塞、封闭疏散通道、安全出口。',
    关键词: '消防通道,安全出口',
    官方来源URL: 'local://fire-law',
    发布机关: '全国人民代表大会常务委员会',
    施行日期: '2021-04-29',
    现行状态: '现行有效',
    备注: '',
  }

  const summary = validateLegalClauseCsvText(stringifyCsv([row, row]))
  assert.equal(summary.passed, false)
  assert.ok(summary.issues.some((issue) => issue.field === '官方来源URL'))
  assert.ok(summary.issues.some((issue) => issue.field === '重复条款'))
})

test('法规条文 CSV 短条文只产生 warning', () => {
  const csv = stringifyCsv([{
    分类: '消防安全',
    法规名称: '中华人民共和国消防法',
    '文号/标准号': '主席令第二十九号',
    条款号: '目录',
    条文内容: '附录',
    关键词: '消防',
    官方来源URL: 'https://flk.npc.gov.cn/example',
    发布机关: '全国人民代表大会常务委员会',
    施行日期: '2021-04-29',
    现行状态: '现行有效',
    备注: '',
  }])

  const summary = validateLegalClauseCsvText(csv)
  assert.equal(summary.passed, true)
  assert.equal(summary.warning_count, 1)
})

test('国家标准现行状态允许填写“现行”', () => {
  const csv = stringifyCsv([{
    分类: '消防安全',
    法规名称: '手提式灭火器',
    '文号/标准号': 'GB 4351-2023',
    条款号: '5.1',
    条文内容: '灭火器应符合对应配置和使用要求。',
    关键词: '灭火器,配置',
    官方来源URL: 'https://openstd.samr.gov.cn/example',
    发布机关: '国家市场监督管理总局、国家标准化管理委员会',
    施行日期: '2025-01-01',
    现行状态: '现行',
    备注: '',
  }])

  const summary = validateLegalClauseCsvText(csv)
  assert.equal(summary.passed, true)
})

test('正式 CSV 刷新导入前会归档同名旧知识文档和旧条文', async () => {
  const csv = stringifyCsv([{
    分类: '消防安全',
    法规名称: '手提式灭火器',
    '文号/标准号': 'GB 4351-2023',
    条款号: '5.1',
    条文内容: '灭火器应符合对应配置和使用要求。',
    关键词: '灭火器,配置',
    官方来源URL: 'https://openstd.samr.gov.cn/example',
    发布机关: '国家市场监督管理总局、国家标准化管理委员会',
    施行日期: '2025-01-01',
    现行状态: '现行',
    备注: '',
  }])

  let archivedKnowledgeIds = []
  let archivedClauseIds = []
  let createdClause = null
  patch(knowledgeCategoryDal, 'findAll', async () => ([{ id: 5, name: '消防安全' }]))
  patch(knowledgeDal, 'findActiveByTitles', async (titles) => {
    assert.deepEqual(titles, ['手提式灭火器'])
    return [{ id: 8, title: '手提式灭火器', clause_count: 3 }]
  })
  patch(knowledgeClauseDal, 'archiveByKnowledgeIds', async (ids) => { archivedClauseIds = ids })
  patch(knowledgeDal, 'archiveMany', async (ids) => { archivedKnowledgeIds = ids })
  patch(knowledgeClauseDal, 'findDuplicate', async () => null)
  patch(knowledgeDal, 'findBySourceIdentity', async () => null)
  patch(knowledgeDal, 'create', async () => 18)
  patch(knowledgeCategoryRelationDal, 'replaceByKnowledgeId', async () => undefined)
  patch(knowledgeClauseDal, 'create', async (knowledgeId, clause) => {
    createdClause = { knowledgeId, clause }
    return 28
  })

  try {
    const summary = await importCsvText(csv, { refreshOfficialSources: true })
    assert.deepEqual(archivedKnowledgeIds, [8])
    assert.deepEqual(archivedClauseIds, [8])
    assert.equal(summary.archived_knowledge, 1)
    assert.equal(summary.archived_clauses, 3)
    assert.equal(summary.imported_clauses, 1)
    assert.equal(createdClause.clause.current_status, '现行')
  } finally {
    restorePatches()
  }
})
