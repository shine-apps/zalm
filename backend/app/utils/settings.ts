/**
 * 预置设置键（与 server/utils/settings-keys.ts 保持同名同值；
 * app 端无法直接 import server 目录，故此处显式镜像一份）。
 */
export const SETTING_KEYS = {
  /** 腾讯位置服务 key（PC 后台地图选点用）。 */
  MAP_QQMAP_KEY: 'map.qqmap_key'
} as const
