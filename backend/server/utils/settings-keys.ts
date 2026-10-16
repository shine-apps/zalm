/**
 * 预置设置键（setting 表 key 命名空间）。
 * setting 表内容经公开端点 GET /api/settings 对所有访客只读可见，
 * 这里只允许放「前端公开可见、靠第三方域名白名单保护」类配置，禁止放服务端密钥。
 */
export const SETTING_KEYS = {
  /**
   * 腾讯位置服务 key（WebServiceAPI / JS API 同源 key）。
   * 用途：PC 后台地图选点（locpicker）；App 端 uni.chooseLocation 的 key 走构建期 env，不在此列。
   * 值为字符串，空串表示未配置。
   */
  MAP_QQMAP_KEY: 'map.qqmap_key'
} as const

/** 预置设置默认值，db:seed 幂等确保这些键存在。 */
export const DEFAULT_SETTINGS: Record<string, unknown> = {
  [SETTING_KEYS.MAP_QQMAP_KEY]: ''
}
