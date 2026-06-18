const path = require('path')
const db = require('../dal/db')
const schemaInit = require('../dal/schemaInit')
const { importCsvFile } = require('../bll/legalClauseImportService')

/** 命令行导入法规条文 CSV，默认导入仓库内演示种子数据 */
const main = async () => {
  const inputPath = process.argv[2]
    ? path.resolve(process.argv[2])
    : path.resolve(__dirname, '../../database/legal_clause_seed.csv')

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
