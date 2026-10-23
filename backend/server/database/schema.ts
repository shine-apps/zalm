import { desc, sql } from 'drizzle-orm'
import {
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  type AnyPgColumn
} from 'drizzle-orm/pg-core'
import { user } from './auth-schema'
import type { MediaMetadata } from '../utils/media'

/**
 * 业务表 + Better Auth 表统一出口。
 * 时间字段统一 timestamp with time zone。
 */

// 轻量角色模型：name 为稳定英文码（admin/user），description 存中文友好名
export const role = pgTable('role', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text('name').notNull().unique(),
  description: text('description').notNull().default(''),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
})

// 用户-角色 多对多关联
export const userRole = pgTable(
  'user_role',
  {
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    roleId: text('role_id')
      .notNull()
      .references(() => role.id, { onDelete: 'cascade' })
  },
  t => [primaryKey({ columns: [t.userId, t.roleId] })]
)

/**
 * 通用媒体表：COS 直传对象登记。
 * 只有固定列 id/url/type/ref_count/metadata/created_at，其余属性放 metadata jsonb。
 */
export const mediaFile = pgTable('media_file', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  url: text('url').notNull().unique(),
  type: text('type').notNull(),
  refCount: integer('ref_count').notNull().default(0),
  metadata: jsonb('metadata').$type<MediaMetadata>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
})

/**
 * 全局设置表：key/value 两列，value 为任意 JSON 值。
 * 通过公开端点 GET /api/settings 对所有访客只读可见，勿存放密钥。
 */
export const setting = pgTable('setting', {
  key: text('key').primaryKey(),
  value: jsonb('value').$type<unknown>().notNull()
})

// ===== 活动业务 =====

export const ACTIVITY_STATUSES = ['published', 'cancelled'] as const
export type ActivityStatus = (typeof ACTIVITY_STATUSES)[number]

export const REGISTRATION_STATUSES = ['registered', 'cancelled', 'checked_in'] as const
export type RegistrationStatus = (typeof REGISTRATION_STATUSES)[number]

export const CHECK_IN_METHODS = ['scan', 'manual'] as const
export type CheckInMethod = (typeof CHECK_IN_METHODS)[number]

/** 活动分类值域（固定 5 项，直接存中文名，前后端展示无需映射）。 */
export const ACTIVITY_CATEGORIES = [
  '爱心物资',
  '助学帮扶',
  '传统文化',
  '乡村振兴',
  '关爱群体'
] as const
export type ActivityCategory = (typeof ACTIVITY_CATEGORIES)[number]

/** 活动标准化位置（GCJ-02 经纬度；手动降级时经纬度为 null）。 */
export interface ActivityLocation {
  name: string
  address: string
  latitude: number | null
  longitude: number | null
}

export const activity = pgTable('activity', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  coverUrl: text('cover_url'),
  location: jsonb('location').$type<ActivityLocation>().notNull(),
  // 所属分类（text[] 固定值域多选，Zod 入口保证值域；默认空数组兜底直接 SQL 插入）
  categories: text('categories')
    .array()
    .$type<ActivityCategory[]>()
    .notNull()
    .default(sql`'{}'::text[]`),
  startTime: timestamp('start_time', { withTimezone: true }).notNull(),
  endTime: timestamp('end_time', { withTimezone: true }).notNull(),
  registerDeadline: timestamp('register_deadline', { withTimezone: true }),
  capacity: integer('capacity'),
  // 签到成功可得的参与积分，0 表示该活动不计分（值域 0..9999，Zod 入口保证）
  points: integer('points').notNull().default(0),
  status: text('status').$type<ActivityStatus>().notNull().default('published'),
  createdBy: text('created_by')
    .notNull()
    .references(() => user.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date())
})

export const activityRegistration = pgTable(
  'activity_registration',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    activityId: text('activity_id')
      .notNull()
      .references(() => activity.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    status: text('status').notNull().default('registered'),
    checkInAt: timestamp('check_in_at', { withTimezone: true }),
    checkInMethod: text('check_in_method'),
    checkedInBy: text('checked_in_by').references(() => user.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true })
  },
  t => [unique('activity_registration_activity_user_unique').on(t.activityId, t.userId)]
)

/**
 * 活动相册关联：一个活动挂多条媒体（image/video），每条带选填描述。
 * (activity_id, media_id) 唯一防重复挂载；删活动级联清理，删媒体被 restrict 拦截（配合 ref_count 护栏）。
 */
export const activityMedia = pgTable(
  'activity_media',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    activityId: text('activity_id')
      .notNull()
      .references(() => activity.id, { onDelete: 'cascade' }),
    mediaId: text('media_id')
      .notNull()
      .references(() => mediaFile.id, { onDelete: 'restrict' }),
    description: text('description').notNull().default(''),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  t => [unique('activity_media_activity_media_unique').on(t.activityId, t.mediaId)]
)

/**
 * 活动模板：admin 在 PC 后台维护；组织者也可在活动详情页「存为模板」。
 * 除 name 外字段均可空——NULL/空数组表示「模板未预设该项」，创建活动时保持空白由组织者补填；
 * points 用 NULL 区分「未预设」与「预设为 0 分」。
 * 模板与活动无持久关联：活动一经创建即独立，模板之后被修改/删除不影响已有活动，故不存模板来源 id。
 */
export const activityTemplate = pgTable('activity_template', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  // 仅后台/模板选择器展示的模板名称（非活动标题）
  name: text('name').notNull(),
  title: text('title'),
  description: text('description').notNull().default(''),
  coverUrl: text('cover_url'),
  // 地点整体可空（缺失=不预设地点）
  location: jsonb('location').$type<ActivityLocation>(),
  // 空数组=未预设分类
  categories: text('categories')
    .array()
    .$type<ActivityCategory[]>()
    .notNull()
    .default(sql`'{}'::text[]`),
  // 时间三项允许为空：模板通常不带排期，由组织者创建时填写
  startTime: timestamp('start_time', { withTimezone: true }),
  endTime: timestamp('end_time', { withTimezone: true }),
  registerDeadline: timestamp('register_deadline', { withTimezone: true }),
  capacity: integer('capacity'),
  points: integer('points'),
  createdBy: text('created_by')
    .notNull()
    .references(() => user.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date())
})

// ===== 积分 =====

export const POINTS_CATEGORIES = ['activity', 'donation'] as const
export type PointsCategory = (typeof POINTS_CATEGORIES)[number]

export const POINTS_SOURCES = ['checkin', 'manual_activity', 'manual_donation', 'reversal'] as const
export type PointsSource = (typeof POINTS_SOURCES)[number]

export const DONATION_KINDS = ['money', 'goods'] as const
export type DonationKind = (typeof DONATION_KINDS)[number]

/**
 * 积分流水（唯一事实源）：一行一次变动，points 带符号（得分正、冲正负）。
 * - (registration_id) 部分唯一索引：一场签到最多一条活动积分流水（并发/重复签到兜底）
 * - (reversal_of) 部分唯一索引：一条流水最多被冲正一次
 */
export const pointsLedger = pgTable(
  'points_ledger',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    points: integer('points').notNull(),
    category: text('category').$type<PointsCategory>().notNull(),
    source: text('source').$type<PointsSource>().notNull(),
    activityId: text('activity_id').references(() => activity.id, { onDelete: 'restrict' }),
    registrationId: text('registration_id').references(() => activityRegistration.id, {
      onDelete: 'restrict'
    }),
    donationKind: text('donation_kind').$type<DonationKind>(),
    // 金额/物资名称等仅后台与本人可见；全站动态流在序列化层强制剔除
    note: text('note').notNull().default(''),
    createdBy: text('created_by').references(() => user.id, { onDelete: 'restrict' }),
    reversalOf: text('reversal_of').references((): AnyPgColumn => pointsLedger.id, {
      onDelete: 'restrict'
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  t => [
    uniqueIndex('points_ledger_registration_uidx')
      .on(t.registrationId)
      .where(sql`${t.registrationId} IS NOT NULL`),
    uniqueIndex('points_ledger_reversal_uidx')
      .on(t.reversalOf)
      .where(sql`${t.reversalOf} IS NOT NULL`),
    index('points_ledger_user_idx').on(t.userId, t.category, desc(t.createdAt)),
    index('points_ledger_category_idx').on(t.category, desc(t.createdAt))
  ]
)

/** 用户积分汇总（读优化）；只允许由流水在同事务内 upsert 增量，无其他修改入口。 */
export const userPoints = pgTable('user_points', {
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  activityPoints: integer('activity_points').notNull().default(0),
  donationPoints: integer('donation_points').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date())
})

// ===== 分享埋点 =====

/**
 * 分享行为事件（前端 /api/share/events 上报）。
 * 公开端点游客可报，actorUserId 软挂会话、可空且不设外键，避免账号删除影响埋点留存。
 */
export const shareEvent = pgTable(
  'share_event',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    actorUserId: text('actor_user_id'),
    platform: text('platform').notNull(),
    page: text('page').notNull(),
    targetType: text('target_type'),
    targetId: text('target_id'),
    channel: text('channel'),
    event: text('event').notNull(),
    shareUrl: text('share_url'),
    panelId: text('panel_id'),
    extra: jsonb('extra').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  t => [
    index('share_event_target_idx').on(t.targetType, t.targetId, t.createdAt),
    index('share_event_event_idx').on(t.event, t.createdAt),
    index('share_event_actor_idx').on(t.actorUserId)
  ]
)

// ===== 站内通知 =====

/**
 * 通知事件码：`域.事件` 点分命名。
 * 本期仅活动域 4 类；新增域时在此登记（不入 DB 枚举约束，值域由 TS + 入口校验守住）。
 */
export const NOTIFICATION_TYPES = [
  'activity.registered',
  'activity.checked_in',
  'activity.cancelled',
  'activity.updated'
] as const
export type NotificationType = (typeof NOTIFICATION_TYPES)[number]

/** 通知跳转对象类型；本期仅活动。 */
export const NOTIFICATION_TARGET_TYPES = ['activity'] as const
export type NotificationTargetType = (typeof NOTIFICATION_TARGET_TYPES)[number]

/**
 * 站内通知（通用，不绑死具体业务）：
 * - title/body 在生成时快照，业务对象之后改名不影响历史消息；
 * - target_type/target_id 提供跳转，data jsonb 存附加结构化数据（禁放敏感信息）；
 * - read_at 为 null 即未读。
 */
export const notification = pgTable(
  'notification',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    type: text('type').$type<NotificationType>().notNull(),
    title: text('title').notNull(),
    body: text('body').notNull().default(''),
    targetType: text('target_type').$type<NotificationTargetType>(),
    targetId: text('target_id'),
    data: jsonb('data').$type<Record<string, unknown>>().notNull().default({}),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  t => [
    index('notification_user_created_idx').on(t.userId, desc(t.createdAt)),
    // 未读数高频查询：部分索引只挂未读行
    index('notification_user_unread_idx')
      .on(t.userId)
      .where(sql`${t.readAt} IS NULL`)
  ]
)

// ===== 关注（单表多态收藏夹） =====

/** 可关注的目标类型；值域由 TS 常量 + Zod 入参双层守住（DB 无枚举约束）。 */
export const FOLLOW_TARGET_TYPES = ['activity', 'user'] as const
export type FollowTargetType = (typeof FOLLOW_TARGET_TYPES)[number]

/**
 * 关注关系（仅收藏夹语义：无粉丝数、无通知、无 feed）。
 * - user_id 为关注者，挂真实外键：用户注销 → 其关注自动清理；
 * - target_id 多态无外键：活动被删/目标用户注销产生的孤儿记录，
 *   由列表查询 inner join 目标表自然过滤，不做异步清理任务。
 */
export const follow = pgTable(
  'follow',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    targetType: text('target_type').$type<FollowTargetType>().notNull(),
    targetId: text('target_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  t => [
    unique('follow_user_target_unique').on(t.userId, t.targetType, t.targetId),
    index('follow_user_type_idx').on(t.userId, t.targetType)
  ]
)

// Better Auth 四张表
export { account, session, user, verification } from './auth-schema'
