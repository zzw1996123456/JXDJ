import type { GameRound, TileDefinition } from '../types'

export const ROUND_TILES: Record<GameRound, TileDefinition[]> = {
  1: [
    { name: '空格', shortName: '空格', type: 'empty', detail: '本次不增加条款', guaranteeChange: 0 },
    { name: '基础保底', shortName: '基础保底', type: 'boss', detail: '本单保障 +20', guaranteeChange: 20 },
    { name: '装备档位', shortName: '装备档位', type: 'runner', detail: '打手选择装备档位', guaranteeChange: 5 },
    { name: '空格', shortName: '空格', type: 'empty', detail: '本次不增加条款', guaranteeChange: 0 },
    { name: '行动地图', shortName: '指定地图', type: 'boss', detail: '老板选择行动地图', guaranteeChange: 0 },
    { name: '首次免赔', shortName: '首次免赔', type: 'runner', detail: '首次失败不扣保障', guaranteeChange: 15 },
    { name: '全队整备', shortName: '全队整备', type: 'shared', detail: '确认预算与禁用项', guaranteeChange: 0 },
    { name: '空格', shortName: '空格', type: 'empty', detail: '本次不增加条款', guaranteeChange: 0 },
  ],
  2: [
    { name: '空格', shortName: '空格', type: 'empty', detail: '本次不增加条款', guaranteeChange: 0 },
    { name: '行动路线', shortName: '指定路线', type: 'boss', detail: '老板二选一行动路线', guaranteeChange: 0 },
    { name: '稳健打法', shortName: '稳健打法', type: 'runner', detail: '不追非任务目标', guaranteeChange: 10 },
    { name: '空格', shortName: '空格', type: 'empty', detail: '本次不增加条款', guaranteeChange: 0 },
    { name: '红装加码', shortName: '红装加码', type: 'boss', detail: '带出红品保障 +30', guaranteeChange: 30 },
    { name: '遭遇绕行', shortName: '遭遇绕行', type: 'runner', detail: '可避开 1 次高危交战', guaranteeChange: 10 },
    { name: '中场复盘', shortName: '中场复盘', type: 'shared', detail: '可调整 1 次已定规则', guaranteeChange: 0 },
    { name: '空格', shortName: '空格', type: 'empty', detail: '本次不增加条款', guaranteeChange: 0 },
    { name: '携行保障', shortName: '携行保障', type: 'boss', detail: '为老板预留 2 格', guaranteeChange: 15 },
    { name: '超时补偿', shortName: '超时补偿', type: 'runner', detail: '超时后保障 +15', guaranteeChange: 15 },
    { name: '撤离方式', shortName: '撤离方式', type: 'boss', detail: '常规或条件撤离', guaranteeChange: 10 },
    { name: '空格', shortName: '空格', type: 'empty', detail: '本次不增加条款', guaranteeChange: 0 },
  ],
  3: [
    { name: '空格', shortName: '空格', type: 'empty', detail: '本次不增加条款', guaranteeChange: 0 },
    { name: '保底加码', shortName: '保底加码', type: 'boss', detail: '基础保障 +20', guaranteeChange: 20 },
    { name: '装备档位', shortName: '装备档位', type: 'runner', detail: '打手选择装备档位', guaranteeChange: 5 },
    { name: '空格', shortName: '空格', type: 'empty', detail: '本次不增加条款', guaranteeChange: 0 },
    { name: '指定路线', shortName: '指定路线', type: 'boss', detail: '老板二选一行动路线', guaranteeChange: 0 },
    { name: '首次免赔', shortName: '首次免赔', type: 'runner', detail: '首次失败不扣保障', guaranteeChange: 15 },
    { name: '战前规则', shortName: '战前规则', type: 'shared', detail: '确认预算与禁用项', guaranteeChange: 0 },
    { name: '撤离优先', shortName: '撤离优先', type: 'boss', detail: '有撤离窗口立即转点', guaranteeChange: 10 },
    { name: '稳健打法', shortName: '稳健打法', type: 'runner', detail: '不追非任务目标', guaranteeChange: 10 },
    { name: '红装加码', shortName: '红装加码', type: 'boss', detail: '带出红品保障 +30', guaranteeChange: 30 },
    { name: '空格', shortName: '空格', type: 'empty', detail: '本次不增加条款', guaranteeChange: 0 },
    { name: '携行保障', shortName: '携行保障', type: 'boss', detail: '为老板预留 2 格', guaranteeChange: 15 },
    { name: '中场复盘', shortName: '中场复盘', type: 'shared', detail: '可调整 1 次已定规则', guaranteeChange: 0 },
    { name: '核心搜索', shortName: '核心搜索', type: 'boss', detail: '完成 2 个核心搜索点', guaranteeChange: 20 },
    { name: '战术改判', shortName: '战术改判', type: 'runner', detail: '打手改判 1 次路线', guaranteeChange: 10 },
    { name: '空格', shortName: '空格', type: 'empty', detail: '本次不增加条款', guaranteeChange: 0 },
    { name: '超时补偿', shortName: '超时补偿', type: 'runner', detail: '超时后保障 +15', guaranteeChange: 15 },
    { name: '撤离方式', shortName: '撤离方式', type: 'boss', detail: '常规或条件撤离', guaranteeChange: 10 },
    { name: '物资优先', shortName: '物资优先', type: 'boss', detail: '目标物资优先归老板', guaranteeChange: 15 },
    { name: '交战限制', shortName: '交战限制', type: 'runner', detail: '禁用 1 种高风险打法', guaranteeChange: 10 },
    { name: '空格', shortName: '空格', type: 'empty', detail: '本次不增加条款', guaranteeChange: 0 },
    { name: '连败补偿', shortName: '连败补偿', type: 'runner', detail: '下局保障 +20', guaranteeChange: 20 },
    { name: '安全撤离', shortName: '安全撤离', type: 'boss', detail: '老板安全撤离保障 +25', guaranteeChange: 25 },
    { name: '协议结算', shortName: '协议结算', type: 'shared', detail: '落到此格完成本局', guaranteeChange: 0 },
  ],
}

export const PLAYER_COLORS = ['#dbff4b', '#ff725e', '#50c8ff', '#ffd166', '#d5a6ff', '#8ce99a']

export function getRoundTiles(round: GameRound) {
  return ROUND_TILES[round]
}

export function getBoardDimensions(size: number) {
  if (size === 8) return { columns: 3, rows: 3 }
  if (size === 12) return { columns: 4, rows: 4 }
  return { columns: 8, rows: 6 }
}

export function getBoardGridPosition(index: number, size: number) {
  const { columns, rows } = getBoardDimensions(size)
  if (index < columns) return { gridColumn: index + 1, gridRow: 1 }

  const rightEnd = columns + rows - 2
  if (index < rightEnd) return { gridColumn: columns, gridRow: index - columns + 2 }

  const bottomEnd = rightEnd + columns
  if (index < bottomEnd) return { gridColumn: columns - (index - rightEnd), gridRow: rows }

  return { gridColumn: 1, gridRow: rows - 1 - (index - bottomEnd) }
}
