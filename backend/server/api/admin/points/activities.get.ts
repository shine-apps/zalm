import { listActivitiesForPicker } from '../../../database/repositories/points'
import { activityPickerQuerySchema } from '../../../schemas/points'

/** 录入活动积分时的活动下拉候选（最近 30 条，可按标题搜索，仅 admin）。 */
export default defineEventHandler(async (event) => {
  requireAdmin(event)
  const query = parseQuery(event, activityPickerQuerySchema)
  const rows = await listActivitiesForPicker(query.keyword)
  return ok(rows)
})
