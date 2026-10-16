import {
  activityTemplateIdParamSchema,
  activityTemplateUpdateBodySchema
} from '../../../schemas/activity-template'

/** 编辑活动模板（admin；null=清空该预设，缺省 key=不改动）。 */
export default defineEventHandler(async (event) => {
  const { id } = parseParams(event, activityTemplateIdParamSchema)
  const body = await parseBody(event, activityTemplateUpdateBodySchema)
  return ok(await updateTemplate(id, body))
})
