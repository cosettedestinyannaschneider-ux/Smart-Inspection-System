const test = require('node:test')
const assert = require('node:assert/strict')
const {
  REQUIRED_HEADERS,
  stringifyCsv,
  parseCsvRecords,
} = require('../bll/legalClauseImportService')
const {
  validateLegalClauseCsvText,
} = require('../bll/legalClauseValidationService')

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
