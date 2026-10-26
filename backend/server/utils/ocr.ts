import { getCosConfig } from './cos'
import { getEnv } from './env'

/**
 * 腾讯云 OCR 预填：身份证人像面（IDCardOCR）与营业执照（BizLicenseOCR）。
 * 仅用于表单预填，识别结果不落库、不参与判定；任何失败一律返回 null，
 * 由前端回退为手工填写，绝不影响提交主链路。
 */

export interface OcrResult<TFields> {
  fields: TFields
  raw: Record<string, unknown>
}

export interface IdCardFields {
  realName: string
  idCardNumber: string
}

export interface BizLicenseFields {
  companyName: string
  creditCode: string
  legalPerson: string
}

const MOCK_ID_CARD: OcrResult<IdCardFields> = {
  fields: { realName: '张三', idCardNumber: '110101199003071276' },
  raw: { mock: true }
}

const MOCK_BIZ_LICENSE: OcrResult<BizLicenseFields> = {
  fields: {
    companyName: '众爱联盟科技有限公司',
    creditCode: '91110108MA01C8YT3Q',
    legalPerson: '张三'
  },
  raw: { mock: true }
}

interface OcrClient {
  IDCardOCR: (req: { ImageBase64: string }) => Promise<Record<string, unknown>>
  BizLicenseOCR: (req: { ImageBase64: string }) => Promise<Record<string, unknown>>
}

let ocrClient: OcrClient | null | undefined

/**
 * 惰性构建 OCR client（复用 COS 永久密钥）；未配置密钥（开发环境常见）时
 * 降级为 null，调用方拿到 null 直接返回"未识别"。
 */
async function getOcrClient(): Promise<OcrClient | null> {
  if (ocrClient !== undefined) return ocrClient
  try {
    const { secretId, secretKey } = getCosConfig()
    const mod = await import('tencentcloud-sdk-nodejs-ocr')
    const { Client } = mod.ocr.v20181119
    ocrClient = new Client({
      credential: { secretId, secretKey },
      region: getEnv().TENCENT_OCR_REGION,
      profile: { httpProfile: { endpoint: 'ocr.tencentcloudapi.com' } }
    }) as unknown as OcrClient
    return ocrClient
  } catch {
    ocrClient = null
    return null
  }
}

/** 身份证人像面 OCR；mock 模式返回固定结果，未配置/识别失败返回 null。 */
export async function recognizeIdCard(image: Buffer): Promise<OcrResult<IdCardFields> | null> {
  if (getEnv().OCR_MOCK) return MOCK_ID_CARD
  const client = await getOcrClient()
  if (!client) return null
  try {
    const raw = await client.IDCardOCR({ ImageBase64: image.toString('base64') })
    const name = typeof raw.Name === 'string' ? raw.Name : ''
    const idNum = typeof raw.IdNum === 'string' ? raw.IdNum : ''
    if (!name || !idNum) return null
    return { fields: { realName: name, idCardNumber: idNum }, raw }
  } catch {
    return null
  }
}

/** 营业执照 OCR；mock 模式返回固定结果，未配置/识别失败返回 null。 */
export async function recognizeBizLicense(image: Buffer): Promise<OcrResult<BizLicenseFields> | null> {
  if (getEnv().OCR_MOCK) return MOCK_BIZ_LICENSE
  const client = await getOcrClient()
  if (!client) return null
  try {
    const raw = await client.BizLicenseOCR({ ImageBase64: image.toString('base64') })
    const companyName = typeof raw.Name === 'string' ? raw.Name : ''
    const creditCode = typeof raw.RegNum === 'string' ? raw.RegNum : ''
    const legalPerson = typeof raw.Person === 'string' ? raw.Person : ''
    if (!companyName || !creditCode) return null
    return { fields: { companyName, creditCode, legalPerson }, raw }
  } catch {
    return null
  }
}
