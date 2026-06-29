const ACTIVE_LEGAL_CLAUSE_STATUSES = ['现行有效', '现行']

/** 判断法规/标准条文是否属于当前可用于规则和报告依据的状态 */
const isActiveLegalClauseStatus = (status) => ACTIVE_LEGAL_CLAUSE_STATUSES.includes(String(status || '').trim())

module.exports = {
  ACTIVE_LEGAL_CLAUSE_STATUSES,
  isActiveLegalClauseStatus,
}
