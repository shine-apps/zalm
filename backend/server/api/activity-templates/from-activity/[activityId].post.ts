import {
  templateFromActivityBodySchema,
  templateFromActivityParamsSchema
} from '../../../schemas/activity-template'

/** 把当前活动存为模板（活动组织者）；时间字段强制留空、相册不带入。 */
export default defineEventHandler(async (event) => {
  const organizer = requireAnyRole(event, ACTIVITY_ORGANIZER_ROLES)
  const { activityId } = parseParams(event, templateFromActivityParamsSchema)
  const body = await parseBody(event, templateFromActivityBodySchema)
  const template = await createTemplateFromActivity(activityId, body.name, organizer.id)
  setResponseStatus(event, 201)
  return ok(template, '已存为活动模板')
})
