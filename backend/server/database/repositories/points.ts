import { and, asc, count, desc, eq, gt, ilike, ne, or, sql, type SQL } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { db } from '../client'
import {
  activity as activityTable,
  pointsLedger as ledgerTable,
  user as userTable,
  userPoints as pointsTable,
  type DonationKind,
  type PointsCategory,
  type PointsSource
} from '../schema'
import type { DbExecutor } from './activities'

export type PointsLedgerRow = typeof ledgerTable.$inferSelect
export type PointsDimension = 'total' | 'activity' | 'donation'

export interface NewLedgerInput {
  userId: string
  points: number
  category: PointsCategory
  source: PointsSource
  activityId?: string | null
  registrationId?: string | null
  donationKind?: DonationKind | null
  note?: string
  createdBy?: string | null
  reversalOf?: string | null
  createdAt?: Date
}

interface PageParams {
  limit: number
  offset: number
}

// ===== 汇总 =====

export async function getUserPoints(
  userId: string,
  exec: DbExecutor = db
): Promise<{ activityPoints: number, donationPoints: number } | null> {
  const rows = await exec.select().from(pointsTable).where(eq(pointsTable.userId, userId)).limit(1)
  return rows[0] ?? null
}

/**
 * 冲正事务入口：对用户汇总行加排他锁（FOR UPDATE），把同一用户的并发冲正串行化。
 * 必须在事务内调用；行不存在时返回 null（调用方按余额不足处理）。
 */
export async function getUserPointsForUpdate(
  tx: DbExecutor,
  userId: string
): Promise<{ activityPoints: number, donationPoints: number } | null> {
  const rows = await tx
    .select()
    .from(pointsTable)
    .where(eq(pointsTable.userId, userId))
    .for('update')
    .limit(1)
  return rows[0] ?? null
}

/** 同事务内增量 upsert；delta 可正可负。 */
export async function upsertPointsDelta(
  userId: string,
  category: PointsCategory,
  delta: number,
  exec: DbExecutor = db
): Promise<void> {
  const setClause = category === 'activity'
    ? { activityPoints: sql`${pointsTable.activityPoints} + ${delta}`, updatedAt: new Date() }
    : { donationPoints: sql`${pointsTable.donationPoints} + ${delta}`, updatedAt: new Date() }
  await exec
    .insert(pointsTable)
    .values({
      userId,
      activityPoints: category === 'activity' ? delta : 0,
      donationPoints: category === 'donation' ? delta : 0
    })
    .onConflictDoUpdate({ target: pointsTable.userId, set: setClause })
}

// ===== 流水写入 =====

/**
 * 插入流水。ignoreRegistrationConflict=true 时 ON CONFLICT DO NOTHING，
 * 用于签到发分（部分唯一索引 registration_id 兜底重复签到/补签）；
 * 冲突时返回 null，调用方据此跳过汇总增量。
 */
export async function insertLedger(
  input: NewLedgerInput,
  exec: DbExecutor = db,
  opts: { ignoreRegistrationConflict?: boolean } = {}
): Promise<PointsLedgerRow | null> {
  const query = exec
    .insert(ledgerTable)
    .values({
      userId: input.userId,
      points: input.points,
      category: input.category,
      source: input.source,
      activityId: input.activityId ?? null,
      registrationId: input.registrationId ?? null,
      donationKind: input.donationKind ?? null,
      note: input.note ?? '',
      createdBy: input.createdBy ?? null,
      reversalOf: input.reversalOf ?? null,
      ...(input.createdAt ? { createdAt: input.createdAt } : {})
    })
  const rows = await (opts.ignoreRegistrationConflict
    ? query.onConflictDoNothing().returning()
    : query.returning())
  return rows[0] ?? null
}

export async function getLedgerById(id: string): Promise<PointsLedgerRow | null> {
  const rows = await db.select().from(ledgerTable).where(eq(ledgerTable.id, id)).limit(1)
  return rows[0] ?? null
}

export async function getReversalOf(originalId: string): Promise<PointsLedgerRow | null> {
  const rows = await db
    .select()
    .from(ledgerTable)
    .where(eq(ledgerTable.reversalOf, originalId))
    .limit(1)
  return rows[0] ?? null
}

// ===== 排行榜 =====

export interface LeaderboardRow {
  userId: string
  name: string
  image: string | null
  activityPoints: number
  donationPoints: number
  total: number
}

export async function listLeaderboard(
  dimension: PointsDimension,
  { limit, offset }: PageParams
): Promise<{ rows: LeaderboardRow[], total: number }> {
  const totalExpr = sql`${pointsTable.activityPoints} + ${pointsTable.donationPoints}`.mapWith(Number)
  const orderExpr = dimension === 'activity'
    ? pointsTable.activityPoints
    : dimension === 'donation'
      ? pointsTable.donationPoints
      : totalExpr
  const positiveWhere: SQL = dimension === 'activity'
    ? gt(pointsTable.activityPoints, 0)
    : dimension === 'donation'
      ? gt(pointsTable.donationPoints, 0)
      : gt(totalExpr, 0)

  const rows = await db
    .select({
      userId: userTable.id,
      name: userTable.name,
      image: userTable.image,
      activityPoints: pointsTable.activityPoints,
      donationPoints: pointsTable.donationPoints,
      total: totalExpr.as('total')
    })
    .from(pointsTable)
    .innerJoin(userTable, eq(pointsTable.userId, userTable.id))
    .where(and(eq(userTable.banned, false), positiveWhere))
    .orderBy(desc(orderExpr), asc(userTable.name))
    .limit(limit)
    .offset(offset)

  const totalRows = await db
    .select({ value: count() })
    .from(pointsTable)
    .innerJoin(userTable, eq(pointsTable.userId, userTable.id))
    .where(and(eq(userTable.banned, false), positiveWhere))

  return { rows, total: Number(totalRows[0]?.value ?? 0) }
}

// ===== 动态 / 明细（join 行） =====

export interface LedgerJoinRow extends PointsLedgerRow {
  userName: string
  userImage: string | null
  activityTitle: string | null
}

export interface AdminLedgerJoinRow extends LedgerJoinRow {
  userPhone: string | null
  operatorName: string | null
  /** 若该原记录已被冲正，这里是冲正流水 id（自连接 points_ledger.reversal_of）。 */
  reversalId: string | null
}

function feedFilters(category?: PointsCategory): (SQL | undefined)[] {
  return [
    category ? eq(ledgerTable.category, category) : undefined,
    ne(ledgerTable.source, 'reversal'),
    gt(ledgerTable.points, 0)
  ]
}

export async function listFeed(
  category: PointsCategory | undefined,
  { limit, offset }: PageParams
): Promise<{ rows: LedgerJoinRow[], total: number }> {
  const where = and(...feedFilters(category))
  const [rows, totalRows] = await Promise.all([
    db
      .select({
        id: ledgerTable.id,
        userId: ledgerTable.userId,
        points: ledgerTable.points,
        category: ledgerTable.category,
        source: ledgerTable.source,
        activityId: ledgerTable.activityId,
        registrationId: ledgerTable.registrationId,
        donationKind: ledgerTable.donationKind,
        note: ledgerTable.note,
        createdBy: ledgerTable.createdBy,
        reversalOf: ledgerTable.reversalOf,
        createdAt: ledgerTable.createdAt,
        userName: userTable.name,
        userImage: userTable.image,
        activityTitle: activityTable.title
      })
      .from(ledgerTable)
      .innerJoin(userTable, eq(ledgerTable.userId, userTable.id))
      .leftJoin(activityTable, eq(ledgerTable.activityId, activityTable.id))
      .where(where)
      .orderBy(desc(ledgerTable.createdAt), desc(ledgerTable.id))
      .limit(limit)
      .offset(offset),
    db.select({ value: count() }).from(ledgerTable).where(where)
  ])
  return { rows: rows as unknown as LedgerJoinRow[], total: Number(totalRows[0]?.value ?? 0) }
}

export async function listMyLedger(
  userId: string,
  category: PointsCategory | undefined,
  { limit, offset }: PageParams
): Promise<{ rows: LedgerJoinRow[], total: number }> {
  const where = and(eq(ledgerTable.userId, userId), category ? eq(ledgerTable.category, category) : undefined)
  const [rows, totalRows] = await Promise.all([
    db
      .select({
        id: ledgerTable.id,
        userId: ledgerTable.userId,
        points: ledgerTable.points,
        category: ledgerTable.category,
        source: ledgerTable.source,
        activityId: ledgerTable.activityId,
        registrationId: ledgerTable.registrationId,
        donationKind: ledgerTable.donationKind,
        note: ledgerTable.note,
        createdBy: ledgerTable.createdBy,
        reversalOf: ledgerTable.reversalOf,
        createdAt: ledgerTable.createdAt,
        userName: userTable.name,
        userImage: userTable.image,
        activityTitle: activityTable.title
      })
      .from(ledgerTable)
      .innerJoin(userTable, eq(ledgerTable.userId, userTable.id))
      .leftJoin(activityTable, eq(ledgerTable.activityId, activityTable.id))
      .where(where)
      .orderBy(desc(ledgerTable.createdAt), desc(ledgerTable.id))
      .limit(limit)
      .offset(offset),
    db.select({ value: count() }).from(ledgerTable).where(where)
  ])
  return { rows: rows as unknown as LedgerJoinRow[], total: Number(totalRows[0]?.value ?? 0) }
}

// ===== 后台审计流 =====

export async function listAllLedger(input: {
  category?: PointsCategory
  source?: PointsSource
  keyword?: string
  limit: number
  offset: number
}): Promise<{ rows: AdminLedgerJoinRow[], total: number }> {
  const operator = alias(userTable, 'operator')
  const reversedRecord = alias(ledgerTable, 'reversed_record')
  const kw = input.keyword?.trim()
  const keywordWhere: SQL | undefined = kw
    ? or(
        ilike(userTable.name, `%${kw.replace(/[\\%_]/g, m => `\\${m}`)}%`),
        ilike(userTable.phoneNumber, `%${kw.replace(/[\\%_]/g, m => `\\${m}`)}%`)
      )
    : undefined
  const where = and(
    input.category ? eq(ledgerTable.category, input.category) : undefined,
    input.source ? eq(ledgerTable.source, input.source) : undefined,
    keywordWhere
  )

  const selectShape = {
    id: ledgerTable.id,
    userId: ledgerTable.userId,
    points: ledgerTable.points,
    category: ledgerTable.category,
    source: ledgerTable.source,
    activityId: ledgerTable.activityId,
    registrationId: ledgerTable.registrationId,
    donationKind: ledgerTable.donationKind,
    note: ledgerTable.note,
    createdBy: ledgerTable.createdBy,
    reversalOf: ledgerTable.reversalOf,
    createdAt: ledgerTable.createdAt,
    userName: userTable.name,
    userImage: userTable.image,
    userPhone: userTable.phoneNumber,
    activityTitle: activityTable.title,
    operatorName: operator.name,
    reversalId: reversedRecord.id
  }

  const [rows, totalRows] = await Promise.all([
    db
      .select(selectShape)
      .from(ledgerTable)
      .innerJoin(userTable, eq(ledgerTable.userId, userTable.id))
      .leftJoin(activityTable, eq(ledgerTable.activityId, activityTable.id))
      .leftJoin(operator, eq(ledgerTable.createdBy, operator.id))
      .leftJoin(reversedRecord, eq(reversedRecord.reversalOf, ledgerTable.id))
      .where(where)
      .orderBy(desc(ledgerTable.createdAt), desc(ledgerTable.id))
      .limit(input.limit)
      .offset(input.offset),
    db
      .select({ value: count() })
      .from(ledgerTable)
      .innerJoin(userTable, eq(ledgerTable.userId, userTable.id))
      .where(where)
  ])
  return { rows: rows as unknown as AdminLedgerJoinRow[], total: Number(totalRows[0]?.value ?? 0) }
}

// ===== 后台活动选择器 =====

export interface ActivityPickerItem {
  id: string
  title: string
  startTime: Date
  endTime: Date
  status: string
  points: number
}

export async function listActivitiesForPicker(keyword: string | undefined): Promise<ActivityPickerItem[]> {
  const kw = keyword?.trim()
  const where = kw
    ? ilike(activityTable.title, `%${kw.replace(/[\\%_]/g, m => `\\${m}`)}%`)
    : undefined
  return db
    .select({
      id: activityTable.id,
      title: activityTable.title,
      startTime: activityTable.startTime,
      endTime: activityTable.endTime,
      status: activityTable.status,
      points: activityTable.points
    })
    .from(activityTable)
    .where(where)
    .orderBy(desc(activityTable.startTime))
    .limit(30)
}
