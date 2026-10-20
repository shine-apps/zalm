import { activityIdParamSchema } from '../../../schemas/activity'
import { getRoleNames, requireUser } from '../../../utils/auth-context'

/** 活动报名/签到名单（所有登录用户可查看；组织者才能看到完整手机号）。 */
export default defineEventHandler(async (event) => {
  requireUser(event)
  const organizer = isOrganizer(event)
  const { id } = parseParams(event, activityIdParamSchema)
  const query = parseQuery(event, pageQuerySchema)
  const { rows, total, stats } = await getRegistrationListView(id, query.page, query.pageSize)

  // 非组织者脱敏手机号（置为 null）
  const safeRows = organizer
    ? rows
    : rows.map(r => ({ ...r, userPhone: null }))

  const envelope = paginated(
    safeRows,
    buildPaginationMeta(total, { page: query.page, pageSize: query.pageSize })
  )
  return { ...envelope, stats }
})

function isOrganizer(event: Parameters<typeof getRoleNames>[0]): boolean {
  const roles = getRoleNames(event)
  return roles.includes('admin') || roles.includes('activity_admin')
}
