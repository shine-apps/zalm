import { activityTemplateIdParamSchema } from '../../../schemas/activity-template'

/** 删除活动模板（admin；模板不被活动引用，删除无副作用）。 */
export default defineEventHandler(async (event) => {
  const { id } = parseParams(event, activityTemplateIdParamSchema)
  await removeTemplate(id)
  return ok(null, '模板已删除')
})
