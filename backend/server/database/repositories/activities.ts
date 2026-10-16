import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lt,
  ne,
  or,
  sql,
  type SQL
} from 'drizzle-orm'
import { db } from '../client'
import {
  activity as activityTable,
  activityRegistration as registrationTable,
  user as userTable,
  type activity,
  type activityRegistration,
  type ActivityCategory,
  type ActivityLocation,
  type ActivityStatus
} from '../schema'

export type ActivityRow = typeof activity.$inferSelect
export type NewActivityRow = typeof activity.$inferInsert
export type RegistrationRow = typeof activityRegistration.$inferSelect
export type ActivityStateFilter = 'active' | 'past' | 'cancelled'

/**
 * 可承载查询的执行器：db 本体或事务句柄。
 * 二者查询 API 一致，但**连接不同**——db 走连接池、tx 绑定事务专用连接；
 * 需要事务原子性的调用方必须显式传 tx，否则查询会落到事务之外。
 */
export type DbExecutor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0]

export interface ActivityListParams {
  state: ActivityStateFilter
  keyword?: string
  limit: number
  offset: number
  now: Date
}

export interface NewActivityInput {
  title: string
  description: string
  coverUrl: string | null
  location: ActivityLocation
  categories: ActivityCategory[]
  startTime: Date
  endTime: Date
  registerDeadline: Date | null
  capacity: number | null
  points: number
  createdBy: string
}

export interface RegistrationWithUser extends RegistrationRow {
  userName: string
  userPhone: string | null
  userImage: string | null
}

export interface MyRegistrationItem {
  registration: RegistrationRow
  activity: ActivityRow
}

export interface ActivityStat {
  registeredCount: number
  checkedInCount: number
}

const EMPTY_STAT: ActivityStat = { registeredCount: 0, checkedInCount: 0 }

function keywordFilter(keyword?: string): SQL | undefined {
  const kw = keyword?.trim()
  if (!kw) return undefined
  const pattern = `%${kw.replace(/[\\%_]/g, m => `\\${m}`)}%`
  return or(
    ilike(activityTable.title, pattern),
    sql`${activityTable.location}->>'name' ILIKE ${pattern}`
  )
}

function stateWhere(state: ActivityStateFilter, now: Date): SQL | undefined {
  if (state === 'active') {
    return and(eq(activityTable.status, 'published'), gte(activityTable.endTime, now))
  }
  if (state === 'past') {
    return and(eq(activityTable.status, 'published'), lt(activityTable.endTime, now))
  }
  return eq(activityTable.status, 'cancelled')
}

export async function listActivities(
  params: ActivityListParams
): Promise<{ rows: ActivityRow[], total: number }> {
  const filters: (SQL | undefined)[] = [stateWhere(params.state, params.now), keywordFilter(params.keyword)]
  const where = and(...filters)
  const order = params.state === 'active' ? asc(activityTable.startTime) : desc(activityTable.startTime)

  const [rows, totalRows] = await Promise.all([
    db
      .select()
      .from(activityTable)
      .where(where)
      .orderBy(order)
      .limit(params.limit)
      .offset(params.offset),
    db.select({ value: count() }).from(activityTable).where(where)
  ])
  return { rows, total: Number(totalRows[0]?.value ?? 0) }
}

/** 首页「近期风采」候选：时间窗内已结束的已发布活动，按结束时间倒序。 */
export async function listRecentlyEndedActivities(input: {
  now: Date
  windowMs: number
  limit: number
}): Promise<ActivityRow[]> {
  const since = new Date(input.now.getTime() - input.windowMs)
  const rows = await db
    .select()
    .from(activityTable)
    .where(
      and(
        eq(activityTable.status, 'published'),
        lt(activityTable.endTime, input.now),
        gte(activityTable.endTime, since)
      )
    )
    .orderBy(desc(activityTable.endTime), desc(activityTable.id))
    .limit(input.limit)
  return rows
}

/**
 * 首页「招募中」：已发布且当前未过有效报名截止时间（无截止时间以开始时间为准）。
 * 满员不在此剔除——由前端置灰，保证候选集与统计口径一致。
 */
export async function listRecruitingActivities(input: {
  now: Date
  limit: number
}): Promise<ActivityRow[]> {
  const rows = await db
    .select()
    .from(activityTable)
    .where(
      and(
        eq(activityTable.status, 'published'),
        // 有效报名截止时间 = register_deadline ?? start_time。
        // 展开成 OR 而非原生 COALESCE 片段：postgres.js 对 sql 片段中的裸 Date 参数
        // 没有列类型编码器会报错，列条件里的 Date 则走正常参数编码。
        or(
          and(isNotNull(activityTable.registerDeadline), gte(activityTable.registerDeadline, input.now)),
          and(isNull(activityTable.registerDeadline), gte(activityTable.startTime, input.now))
        )
      )
    )
    .orderBy(asc(activityTable.startTime), asc(activityTable.id))
    .limit(input.limit)
  return rows
}

export async function getActivityById(id: string, exec: DbExecutor = db): Promise<ActivityRow | null> {
  const rows = await exec.select().from(activityTable).where(eq(activityTable.id, id)).limit(1)
  return rows[0] ?? null
}

/**
 * 报名事务入口：对活动行加排他锁（FOR UPDATE），把同一活动的并发报名串行化。
 * 没有这把锁时，Read Committed 下并发事务会各自 count 出旧值再插入，导致超卖。
 */
export async function lockActivity(id: string, exec: DbExecutor): Promise<void> {
  await exec
    .select({ id: activityTable.id })
    .from(activityTable)
    .where(eq(activityTable.id, id))
    .for('update')
}

export async function insertActivity(input: NewActivityInput): Promise<ActivityRow> {
  const rows = await db
    .insert(activityTable)
    .values({
      title: input.title,
      description: input.description,
      coverUrl: input.coverUrl,
      location: input.location,
      categories: input.categories,
      startTime: input.startTime,
      endTime: input.endTime,
      registerDeadline: input.registerDeadline,
      capacity: input.capacity,
      points: input.points,
      status: 'published',
      createdBy: input.createdBy
    })
    .returning()
  return rows[0]!
}

export async function patchActivity(
  id: string,
  data: Partial<Omit<NewActivityRow, 'id' | 'createdBy' | 'createdAt' | 'updatedAt'>>
): Promise<ActivityRow | null> {
  const rows = await db.update(activityTable).set(data).where(eq(activityTable.id, id)).returning()
  return rows[0] ?? null
}

export async function setActivityStatus(id: string, status: ActivityStatus): Promise<ActivityRow | null> {
  const rows = await db
    .update(activityTable)
    .set({ status })
    .where(eq(activityTable.id, id))
    .returning()
  return rows[0] ?? null
}

export async function getRegistration(
  activityId: string,
  userId: string,
  exec: DbExecutor = db
): Promise<RegistrationRow | null> {
  const rows = await exec
    .select()
    .from(registrationTable)
    .where(
      and(eq(registrationTable.activityId, activityId), eq(registrationTable.userId, userId))
    )
    .limit(1)
  return rows[0] ?? null
}

export async function insertRegistration(
  activityId: string,
  userId: string,
  exec: DbExecutor = db
): Promise<RegistrationRow> {
  const rows = await exec
    .insert(registrationTable)
    .values({ activityId, userId, status: 'registered' })
    .returning()
  return rows[0]!
}

export async function reviveRegistration(id: string, exec: DbExecutor = db): Promise<RegistrationRow | null> {
  const rows = await exec
    .update(registrationTable)
    .set({ status: 'registered', cancelledAt: null })
    .where(eq(registrationTable.id, id))
    .returning()
  return rows[0] ?? null
}

export async function setRegistrationCancelled(
  id: string,
  cancelledAt: Date
): Promise<RegistrationRow | null> {
  const rows = await db
    .update(registrationTable)
    .set({ status: 'cancelled', cancelledAt })
    .where(eq(registrationTable.id, id))
    .returning()
  return rows[0] ?? null
}

/**
 * 仅当报名行当前非 checked_in 时更新为已签到（原子条件更新）。
 * 返回到更新后的行表示「首次签到」；返回 null 表示此前已签到（幂等请求）。
 * 必须在事务内调用，与积分发放同事务。
 */
export async function setRegistrationCheckedInIfFirst(
  id: string,
  input: { checkInAt: Date, method: 'scan' | 'manual', checkedInBy: string | null },
  exec: DbExecutor
): Promise<RegistrationRow | null> {
  const rows = await exec
    .update(registrationTable)
    .set({
      status: 'checked_in',
      checkInAt: input.checkInAt,
      checkInMethod: input.method,
      checkedInBy: input.checkedInBy
    })
    .where(and(eq(registrationTable.id, id), ne(registrationTable.status, 'checked_in')))
    .returning()
  return rows[0] ?? null
}

/**
 * 单活动报名统计（registeredCount 口径 = registered + checked_in）。
 */
export async function getActivityStat(
  activityId: string,
  exec: DbExecutor = db
): Promise<ActivityStat> {
  const rows = await exec
    .select({ status: registrationTable.status, value: count() })
    .from(registrationTable)
    .where(eq(registrationTable.activityId, activityId))
    .groupBy(registrationTable.status)

  let registeredCount = 0
  let checkedInCount = 0
  for (const row of rows) {
    if (row.status === 'registered' || row.status === 'checked_in') {
      registeredCount += Number(row.value)
    }
    if (row.status === 'checked_in') checkedInCount += Number(row.value)
  }
  return { registeredCount, checkedInCount }
}

/** 批量统计，避免列表 N+1。 */
export async function getActivityStatsMap(activityIds: string[]): Promise<Map<string, ActivityStat>> {
  const map = new Map<string, ActivityStat>()
  if (activityIds.length === 0) return map
  const rows = await db
    .select({
      activityId: registrationTable.activityId,
      status: registrationTable.status,
      value: count()
    })
    .from(registrationTable)
    .where(inArray(registrationTable.activityId, activityIds))
    .groupBy(registrationTable.activityId, registrationTable.status)

  for (const row of rows) {
    const stat = map.get(row.activityId) ?? { ...EMPTY_STAT }
    if (row.status === 'registered' || row.status === 'checked_in') {
      stat.registeredCount += Number(row.value)
    }
    if (row.status === 'checked_in') stat.checkedInCount += Number(row.value)
    map.set(row.activityId, stat)
  }
  return map
}

/**
 * 某活动全部有效报名用户 id（registered + checked_in，不含已取消）。
 * 用于活动取消/变更时的通知收件人。
 */
export async function listActiveRegistrationUserIds(
  activityId: string,
  exec: DbExecutor = db
): Promise<string[]> {
  const rows = await exec
    .select({ userId: registrationTable.userId })
    .from(registrationTable)
    .where(
      and(
        eq(registrationTable.activityId, activityId),
        inArray(registrationTable.status, ['registered', 'checked_in'])
      )
    )
  return rows.map(r => r.userId)
}

/** 报名/签到名单（含用户展示字段，仅组织者/管理员接口调用）。 */
export async function listRegistrationsWithUsers(
  activityId: string,
  limit: number,
  offset: number
): Promise<{ rows: RegistrationWithUser[], total: number }> {
  const where = eq(registrationTable.activityId, activityId)
  const [rows, totalRows] = await Promise.all([
    db
      .select({
        id: registrationTable.id,
        activityId: registrationTable.activityId,
        userId: registrationTable.userId,
        status: registrationTable.status,
        checkInAt: registrationTable.checkInAt,
        checkInMethod: registrationTable.checkInMethod,
        checkedInBy: registrationTable.checkedInBy,
        createdAt: registrationTable.createdAt,
        cancelledAt: registrationTable.cancelledAt,
        userName: userTable.name,
        userPhone: userTable.phoneNumber,
        userImage: userTable.image
      })
      .from(registrationTable)
      .innerJoin(userTable, eq(registrationTable.userId, userTable.id))
      .where(where)
      .orderBy(desc(registrationTable.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ value: count() }).from(registrationTable).where(where)
  ])
  return { rows, total: Number(totalRows[0]?.value ?? 0) }
}

/** 我的报名（含活动行）。 */
export async function listMyRegistrations(
  userId: string,
  limit: number,
  offset: number
): Promise<{ rows: MyRegistrationItem[], total: number }> {
  const where = eq(registrationTable.userId, userId)
  const [rows, totalRows] = await Promise.all([
    db
      .select({ registration: registrationTable, activity: activityTable })
      .from(registrationTable)
      .innerJoin(activityTable, eq(registrationTable.activityId, activityTable.id))
      .where(where)
      .orderBy(desc(registrationTable.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ value: count() }).from(registrationTable).where(where)
  ])
  return {
    rows: rows.map(r => ({ registration: r.registration, activity: r.activity })),
    total: Number(totalRows[0]?.value ?? 0)
  }
}
