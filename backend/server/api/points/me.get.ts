/** 我的积分总览。 */
export default defineEventHandler((event) => {
  const me = requireUser(event)
  return getMyPointsOverview(me.id).then(data => ok(data))
})
