import type { TileDefinition } from '../types'

export const BOARD_TILES: TileDefinition[] = [
  { name: '护航接单', shortName: '接单', type: 'shared', detail: '老板 60% · 打手 40%', guaranteeChange: 0 },
  { name: '基础保底加码', shortName: '保底加码', type: 'boss', detail: '基础保障 +20', guaranteeChange: 20 },
  { name: '指定搜撤目标', shortName: '指定物资', type: 'boss', detail: '老板指定 2 类物资', guaranteeChange: 0 },
  { name: '装备档位选择', shortName: '装备档位', type: 'runner', detail: '打手选择装备档位', guaranteeChange: 5 },
  { name: '行动路线指定', shortName: '指定路线', type: 'boss', detail: '老板二选一行动路线', guaranteeChange: 0 },
  { name: '首次失败免赔', shortName: '首次免赔', type: 'runner', detail: '首次失败不扣保障', guaranteeChange: 15 },
  { name: '战前整备', shortName: '战前整备', type: 'shared', detail: '确认预算与禁用项', guaranteeChange: 0 },
  { name: '撤离时机优先', shortName: '撤离优先', type: 'boss', detail: '有撤离窗口立即转点', guaranteeChange: 10 },
  { name: '稳健搜撤打法', shortName: '稳健打法', type: 'runner', detail: '不追非任务目标', guaranteeChange: 10 },
  { name: '红色物资加码', shortName: '红装加码', type: 'boss', detail: '带出红品保障 +30', guaranteeChange: 30 },
  { name: '高危遭遇绕行', shortName: '遭遇绕行', type: 'runner', detail: '可避开 1 次高危交战', guaranteeChange: 10 },
  { name: '老板携行保障', shortName: '携行保障', type: 'boss', detail: '为老板预留 2 格', guaranteeChange: 15 },
  { name: '中场规则复盘', shortName: '中场复盘', type: 'shared', detail: '可调整 1 次已定规则', guaranteeChange: 0 },
  { name: '核心区域搜索', shortName: '核心搜索', type: 'boss', detail: '完成 2 个核心搜索点', guaranteeChange: 20 },
  { name: '打手战术改判', shortName: '战术改判', type: 'runner', detail: '打手改判 1 次路线', guaranteeChange: 10 },
  { name: '机密任务加注', shortName: '机密任务', type: 'boss', detail: '完成指定机密任务', guaranteeChange: 25 },
  { name: '超时补偿', shortName: '超时补偿', type: 'runner', detail: '超时后保障 +15', guaranteeChange: 15 },
  { name: '撤离方式选择', shortName: '撤离方式', type: 'boss', detail: '常规或条件撤离', guaranteeChange: 10 },
  { name: '目标物资优先', shortName: '物资优先', type: 'boss', detail: '目标物资优先归老板', guaranteeChange: 15 },
  { name: '交战方式限制', shortName: '交战限制', type: 'runner', detail: '禁用 1 种高风险打法', guaranteeChange: 10 },
  { name: '行动地图指定', shortName: '指定地图', type: 'boss', detail: '老板选择行动地图', guaranteeChange: 0 },
  { name: '连续失败补偿', shortName: '连败补偿', type: 'runner', detail: '下局保障 +20', guaranteeChange: 20 },
  { name: '老板安全撤离', shortName: '安全撤离', type: 'boss', detail: '安全撤离保障 +25', guaranteeChange: 25 },
  { name: '护航协议结算', shortName: '协议结算', type: 'shared', detail: '记录本局新增条款', guaranteeChange: 0 },
]

export const PLAYER_COLORS = ['#dbff4b', '#ff725e', '#50c8ff', '#ffd166', '#d5a6ff', '#8ce99a']

export function getBoardGridPosition(index: number) {
  if (index < 8) return { gridColumn: index + 1, gridRow: 1 }
  if (index < 12) return { gridColumn: 8, gridRow: index - 6 }
  if (index < 20) return { gridColumn: 20 - index, gridRow: 6 }
  return { gridColumn: 1, gridRow: 25 - index }
}
