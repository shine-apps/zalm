import { count, desc, eq, ilike, or, type SQL } from 'drizzle-orm'
import { db } from '../client'
import {
  activityTemplate as templateTable,
  user as userTable,
  type activityTemplate
} from '../schema'

export type ActivityTemplateRow = typeof activityTemplate.$inferSelect
export type NewActivityTemplateRow = typeof activityTemplate.$inferInsert

/** 组织者选择器用的精简项（不带长文本/地点/时间）。 */
export interface TemplateSummary {
  id: string
  name: string
  title: string | null
  categories: string[]
}

/** 后台列表项：模板行 + 创建者展示字段（避免列表 N+1）。 */
export interface AdminTemplateListItem extends ActivityTemplateRow {
  creatorName: string
  creatorEmail: string
}

function keywordFilter(keyword?: string): SQL | undefined {
  const kw = keyword?.trim()
  if (!kw) return undefined
  const pattern = `%${kw.replace(/[\\%_]/g, m => `\\${m}`)}%`
  return or(ilike(templateTable.name, pattern), ilike(templateTable.title, pattern))
}

/** 组织者选择器：最近更新的在前。 */
export async function listTemplateSummaries(): Promise<TemplateSummary[]> {
  return db
    .select({
      id: templateTable.id,
      name: templateTable.name,
      title: templateTable.title,
      categories: templateTable.categories
    })
    .from(templateTable)
    .orderBy(desc(templateTable.updatedAt), desc(templateTable.id))
}

export async function getTemplateById(id: string): Promise<ActivityTemplateRow | null> {
  const rows = await db.select().from(templateTable).where(eq(templateTable.id, id)).limit(1)
  return rows[0] ?? null
}

export async function insertTemplate(
  input: NewActivityTemplateRow
): Promise<ActivityTemplateRow> {
  const rows = await db.insert(templateTable).values(input).returning()
  return rows[0]!
}

/**
 * 部分更新：undefined 字段被 Drizzle 跳过（保持原值）；
 * 需要清空的字段（地点/时间/容量/积分/标题/封面）由调用方显式传 null。
 */
export async function patchTemplate(
  id: string,
  data: Partial<Omit<NewActivityTemplateRow, 'id' | 'createdBy' | 'createdAt' | 'updatedAt'>>
): Promise<ActivityTemplateRow | null> {
  const rows = await db.update(templateTable).set(data).where(eq(templateTable.id, id)).returning()
  return rows[0] ?? null
}

export async function deleteTemplate(id: string): Promise<ActivityTemplateRow | null> {
  const rows = await db.delete(templateTable).where(eq(templateTable.id, id)).returning()
  return rows[0] ?? null
}

export async function listAdminTemplates(input: {
  keyword?: string
  limit: number
  offset: number
}): Promise<{ rows: AdminTemplateListItem[], total: number }> {
  const where = keywordFilter(input.keyword)
  const [rows, totalRows] = await Promise.all([
    db
      .select({
        template: templateTable,
        creatorName: userTable.name,
        creatorEmail: userTable.email
      })
      .from(templateTable)
      .innerJoin(userTable, eq(templateTable.createdBy, userTable.id))
      .where(where)
      .orderBy(desc(templateTable.updatedAt), desc(templateTable.id))
      .limit(input.limit)
      .offset(input.offset),
    db.select({ value: count() }).from(templateTable).where(where)
  ])
  return {
    rows: rows.map(r => ({ ...r.template, creatorName: r.creatorName, creatorEmail: r.creatorEmail })),
    total: Number(totalRows[0]?.value ?? 0)
  }
}
