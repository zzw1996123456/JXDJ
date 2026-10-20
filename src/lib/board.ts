import type { TileDefinition } from '../types'

export const BOARD_TILES: TileDefinition[] = [
  { name: '行动基地', shortName: '基地', type: 'base', detail: '整备出发' },
  { name: '水泥厂', shortName: '水泥厂', type: 'normal', detail: '安全通过' },
  { name: '物资箱', shortName: '物资', type: 'supply', detail: '+80 金币' },
  { name: '老板委托', shortName: '趣味单', type: 'order', detail: '+120 金币' },
  { name: '游客中心', shortName: '游客中心', type: 'normal', detail: '安全通过' },
  { name: '遭遇伏击', shortName: '伏击', type: 'risk', detail: '-60 金币' },
  { name: '航天基地', shortName: '航天', type: 'normal', detail: '安全通过' },
  { name: '空投补给', shortName: '空投', type: 'reward', detail: '+100 金币' },
  { name: '行政楼', shortName: '行政楼', type: 'normal', detail: '安全通过' },
  { name: '撤离委托', shortName: '趣味单', type: 'order', detail: '+120 金币' },
  { name: '维修站', shortName: '维修站', type: 'supply', detail: '+80 金币' },
  { name: '路线封锁', shortName: '封锁', type: 'risk', detail: '-60 金币' },
  { name: '零号大坝', shortName: '大坝', type: 'normal', detail: '安全通过' },
  { name: '战利品箱', shortName: '战利品', type: 'reward', detail: '+100 金币' },
  { name: '组队委托', shortName: '趣味单', type: 'order', detail: '+120 金币' },
  { name: '变电站', shortName: '变电站', type: 'normal', detail: '安全通过' },
  { name: '危险区域', shortName: '危险区', type: 'risk', detail: '-60 金币' },
  { name: '稀有物资', shortName: '稀有物资', type: 'reward', detail: '+100 金币' },
  { name: '巴克什', shortName: '巴克什', type: 'normal', detail: '安全通过' },
  { name: '护送委托', shortName: '趣味单', type: 'order', detail: '+120 金币' },
  { name: '临时补给', shortName: '补给', type: 'supply', detail: '+80 金币' },
  { name: '情报泄露', shortName: '泄露', type: 'risk', detail: '-60 金币' },
  { name: '长弓溪谷', shortName: '长弓溪谷', type: 'normal', detail: '安全通过' },
  { name: '幸运撤离', shortName: '撤离', type: 'reward', detail: '+100 金币' },
]

export const PLAYER_COLORS = ['#dbff4b', '#ff725e', '#50c8ff', '#ffd166', '#d5a6ff', '#8ce99a']

export function getBoardGridPosition(index: number) {
  if (index < 8) return { gridColumn: index + 1, gridRow: 1 }
  if (index < 12) return { gridColumn: 8, gridRow: index - 6 }
  if (index < 20) return { gridColumn: 20 - index, gridRow: 6 }
  return { gridColumn: 1, gridRow: 25 - index }
}
