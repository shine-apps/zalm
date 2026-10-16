import { activityTemplateIdParamSchema } from '../../../schemas/activity-template'

/** 活动模板详情（admin，编辑表单用）。 */
export default defineEventHandler(async (event) => {
  const { id } = parseParams(event, activityTemplateIdParamSchema)
  return ok(await getAdminTemplate(id))
})
