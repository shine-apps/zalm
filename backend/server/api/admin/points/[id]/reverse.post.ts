import { ledgerIdParamsSchema, reversalBodySchema } from '../../../../schemas/points'
import { reverseLedger } from '../../../../utils/points-service'

/** 冲正一条积分流水（生成等额负流水，仅 admin）。 */
export default defineEventHandler(async (event) => {
  const admin = requireAdmin(event)
  const params = parseParams(event, ledgerIdParamsSchema)
  const body = await parseBody(event, reversalBodySchema)
  const row = await reverseLedger(params.id, body.reason, admin.id)
  return ok(row, '冲正成功')
})
