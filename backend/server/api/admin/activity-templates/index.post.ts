import { activityTemplateCreateBodySchema } from '../../../schemas/activity-template'

/** 手工新建活动模板（admin；仅 name 必填，其余字段均可缺失）。 */
export default defineEventHandler(async (event) => {
  const admin = requireAdmin(event)
  const body = await parseBody(event, activityTemplateCreateBodySchema)
  const template = await createTemplate(body, admin.id)
  setResponseStatus(event, 201)
  return ok(template, '模板创建成功')
})
