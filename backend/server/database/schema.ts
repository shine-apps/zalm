import {
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique
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
  startTime: timestamp('start_time', { withTimezone: true }).notNull(),
  endTime: timestamp('end_time', { withTimezone: true }).notNull(),
  registerDeadline: timestamp('register_deadline', { withTimezone: true }),
  capacity: integer('capacity'),
  status: text('status').notNull().default('published'),
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

// Better Auth 四张表
export { account, session, user, verification } from './auth-schema'
