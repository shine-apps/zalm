import type { PointsFeedItem } from '@/api/points'

type FeedInput = Pick<PointsFeedItem, 'userName' | 'points' | 'category' | 'source' | 'activityTitle'>

/** 首页/积分页爱心动态的统一播报文案（白名单数据，无金额/物资/备注）。 */
export function formatFeedText(item: FeedInput): string {
  if (item.category === 'donation') {
    return `${item.userName} 爱心捐献，获得 ${item.points} 积分`
  }
  const title = item.activityTitle?.trim() || '公益活动'
  if (item.source === 'checkin') {
    return `${item.userName} 参与「${title}」签到，获得 ${item.points} 积分`
  }
  return `${item.userName} 参与「${title}」，获得 ${item.points} 积分`
}
