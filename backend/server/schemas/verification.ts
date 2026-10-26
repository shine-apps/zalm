import { z } from 'zod'
import { pageQuerySchema } from '../utils/pagination'

// ===== 身份证号校验位（GB 11643）=====
const ID_CARD_WEIGHTS = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2]
const ID_CARD_CHECK_CODES = '10X98765432'

/** 18 位身份证号校验位验证（导出供单测）。 */
export function isValidIdCardNumber(id: string): boolean {
  if (!/^\d{17}[\dX]$/.test(id)) return false
  let sum = 0
  for (let i = 0; i < 17; i += 1) {
    sum += Number(id[i]) * ID_CARD_WEIGHTS[i]!
  }
  return ID_CARD_CHECK_CODES[sum % 11] === id[17]
}

/** 统一社会信用代码：18 位，字符集排除 I/O/S/V/Z。 */
const CREDIT_CODE_PATTERN = /^[0-9A-HJ-NPQRTUWXY]{2}\d{6}[0-9A-HJ-NPQRTUWXY]{10}$/

export const personalPayloadSchema = z.object({
  realName: z.string().trim().min(2, '姓名至少 2 个字符').max(30, '姓名过长'),
  idCardNumber: z
    .string()
    .trim()
    .toUpperCase()
    .refine(isValidIdCardNumber, '身份证号校验失败，请核对后重新输入')
})

export const enterprisePayloadSchema = z.object({
  companyName: z.string().trim().min(4, '公司名称至少 4 个字符').max(60, '公司名称过长'),
  creditCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(CREDIT_CODE_PATTERN, '统一社会信用代码格式不正确'),
  legalPerson: z.string().trim().min(2, '法定代表人姓名至少 2 个字符').max(30, '姓名过长')
})

export const showcaseMediaItemSchema = z.object({
  url: z.string().min(1),
  type: z.enum(['image', 'video'])
})

const baseFields = {
  verificationImage: z.string().min(1, '请上传证件照'),
  showcaseMedia: z.array(showcaseMediaItemSchema).max(9, '展示相册最多 9 个媒体').default([]),
  introduction: z.string().trim().max(2000, '介绍最多 2000 字').default(''),
  /** OCR 预填快照（前端回传存档，供管理员比对用户修改；不校验内部结构）。 */
  ocrResult: z.record(z.string(), z.unknown()).optional()
}

/** 提交认证申请：按 kind 判别 payload 结构。 */
export const submitVerificationSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('personal'), payload: personalPayloadSchema, ...baseFields }),
  z.object({ kind: z.literal('enterprise'), payload: enterprisePayloadSchema, ...baseFields })
])

export type SubmitVerificationInput = z.infer<typeof submitVerificationSchema>

/** OCR 预填请求。 */
export const ocrRequestSchema = z.object({
  kind: z.enum(['personal', 'enterprise']),
  imageUrl: z.string().min(1, '缺少证件照地址')
})

/** 管理端列表查询：分页 + 状态/类型筛选。 */
export const listVerificationsQuerySchema = pageQuerySchema.extend({
  status: z.enum(['pending', 'approved', 'rejected']).optional(),
  kind: z.enum(['personal', 'enterprise']).optional()
})

/** 审核操作：驳回必须填写原因。 */
export const reviewVerificationSchema = z
  .object({
    action: z.enum(['approve', 'reject']),
    rejectReason: z.string().trim().max(500, '驳回原因最多 500 字').optional()
  })
  .superRefine((value, ctx) => {
    if (value.action === 'reject' && !value.rejectReason) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['rejectReason'],
        message: '驳回时必须填写驳回原因'
      })
    }
  })
