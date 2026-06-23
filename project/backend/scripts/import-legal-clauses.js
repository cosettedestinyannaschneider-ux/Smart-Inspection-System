const path = require('path')
const db = require('../dal/db')
const schemaInit = require('../dal/schemaInit')
const { importCsvFile } = require('../bll/legalClauseImportService')
const { validateLegalClauseCsvFile } = require('../bll/legalClauseValidationService')

/** 命令行导入法规条文 CSV，默认导入仓库内演示种子数据 */
const main = async () => {
  const inputPath = process.argv[2]
    ? path.resolve(process.argv[2])
    : path.resolve(__dirname, '../../database/legal_clause_seed.csv')

  const validation = validateLegalClauseCsvFile(inputPath)
  if (!validation.passed) {
    console.error(JSON.stringify(validation, null, 2))
    process.exitCode = 1
    return
  }
  if (validation.warning_count) {
    console.warn(JSON.stringify({
      message: '法规条文 CSV 存在 warning，导入继续执行，请后续人工复核。',
      warning_count: validation.warning_count,
      warnings: validation.issues.filter((issue) => issue.level === 'warning').slice(0, 20),
    }, null, 2))
  }
  await schemaInit.init()
  const summary = await importCsvFile(inputPath)
  console.log(JSON.stringify(summary, null, 2))

  if (summary.failed_rows.length) {
    process.exitCode = 1
  }
}

main()
  .catch((error) => {
    console.error(error.message || error)
    process.exitCode = 1
  })
  .finally(async () => {
    await db.end()
  })
