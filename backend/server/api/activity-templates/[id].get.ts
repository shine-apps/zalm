import { activityTemplateIdParamSchema } from '../../schemas/activity-template'

/** 单个活动模板完整内容（活动组织者；预填发布表单用）。 */
export default defineEventHandler(async (event) => {
  requireAnyRole(event, ACTIVITY_ORGANIZER_ROLES)
  const { id } = parseParams(event, activityTemplateIdParamSchema)
  return ok(await getOrganizerTemplate(id))
})
