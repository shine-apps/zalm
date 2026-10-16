/** 活动模板精简列表（活动组织者；发布活动选择器用）。 */
export default defineEventHandler(async (event) => {
  requireAnyRole(event, ACTIVITY_ORGANIZER_ROLES)
  const rows = await listOrganizerTemplateSummaries()
  return ok(rows)
})
