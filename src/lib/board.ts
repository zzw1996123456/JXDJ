import type { GameRound, RoomTile, TileDefinition, TileEffect, TileType } from '../types'

const emptyRule: TileDefinition = {
  name: '空格', short_name: '空格', tile_type: 'empty', detail: '平安经过，本格不触发额外效果',
  effect_type: 'none', effect_value: 0, group: 'empty',
}

export const RULE_TEMPLATES: Record<GameRound, TileDefinition[]> = {
  1: [
    emptyRule,
    { name: '基础保底', short_name: '基础保底', tile_type: 'boss', detail: '老板保底增加 20 万', effect_type: 'coins', effect_value: 20, group: 'contract' },
    { name: '轻装试跑', short_name: '轻装试跑', tile_type: 'runner', detail: '下一局采用轻装稳健路线', effect_type: 'none', effect_value: 0, group: 'contract' },
    { name: '物资口令', short_name: '物资口令', tile_type: 'boss', detail: '老板指定一类优先搜索物资', effect_type: 'none', effect_value: 0, group: 'contract' },
    { name: '全队整备', short_name: '全队整备', tile_type: 'shared', detail: '确认预算和禁用项，老板保底增加 5 万', effect_type: 'coins', effect_value: 5, group: 'contract' },
    { name: '补给优惠', short_name: '补给优惠', tile_type: 'runner', detail: '基础装备预算获得补贴，老板保底增加 10 万', effect_type: 'coins', effect_value: 10, group: 'contract' },
    { name: '风险加注', short_name: '风险加注', tile_type: 'boss', detail: '本轮提高任务要求，老板保底减少 10 万', effect_type: 'coins', effect_value: -10, group: 'contract' },
    { name: '抢占先机', short_name: '前进 1 格', tile_type: 'move', detail: '抢先完成准备，立即前进 1 格', effect_type: 'move', effect_value: 1, group: 'movement' },
    { name: '安全捷径', short_name: '前进 2 格', tile_type: 'move', detail: '发现安全捷径，立即前进 2 格', effect_type: 'move', effect_value: 2, group: 'movement' },
    { name: '路口折返', short_name: '后退 1 格', tile_type: 'chance', detail: '路线判断失误，立即后退 1 格', effect_type: 'move', effect_value: -1, group: 'movement' },
    { name: '情报误导', short_name: '后退 2 格', tile_type: 'chance', detail: '遭遇错误情报，立即后退 2 格', effect_type: 'move', effect_value: -2, group: 'movement' },
    { name: '烟雾封路', short_name: '暂停 1 次', tile_type: 'chance', detail: '前路被封锁，跳过下一次行动', effect_type: 'skip', effect_value: 1, group: 'turn' },
    { name: '临时整备', short_name: '整备 1 次', tile_type: 'shared', detail: '留在原地完成整备，跳过下一次行动', effect_type: 'skip', effect_value: 1, group: 'turn' },
    { name: '乘胜追击', short_name: '额外 1 次', tile_type: 'chance', detail: '骰子库存立即增加 1 个，之后仍按顺序轮换', effect_type: 'extra_roll', effect_value: 1, group: 'dice' },
    { name: '弹药清点', short_name: '少摇 1 次', tile_type: 'chance', detail: '下个自己的回合减少 1 次掷骰', effect_type: 'lose_roll', effect_value: 1, group: 'dice' },
    { name: '快速通关', short_name: '直达二轮', tile_type: 'chance', detail: '触发快速通关，队伍直接进入第二轮', effect_type: 'advance_round', effect_value: 0, group: 'advance' },
    { name: '紧急转场', short_name: '进入二轮', tile_type: 'shared', detail: '到达本格后，队伍进入第二轮', effect_type: 'advance_chance', effect_value: 0, group: 'advance_chance' },
  ],
  2: [
    emptyRule,
    { name: '红品加码', short_name: '红品加码', tile_type: 'boss', detail: '带出红色物资时老板保底增加 30 万', effect_type: 'coins', effect_value: 30, group: 'contract' },
    { name: '携行保障', short_name: '携行保障', tile_type: 'boss', detail: '为老板预留携行空间，老板保底增加 15 万', effect_type: 'coins', effect_value: 15, group: 'contract' },
    { name: '稳健打法', short_name: '稳健打法', tile_type: 'runner', detail: '本局不主动追击非任务目标', effect_type: 'none', effect_value: 0, group: 'contract' },
    { name: '遭遇绕行', short_name: '遭遇绕行', tile_type: 'runner', detail: '允许避开一次高风险交战', effect_type: 'none', effect_value: 0, group: 'contract' },
    { name: '路线改判', short_name: '路线改判', tile_type: 'shared', detail: '全队可改判一次已确定的路线', effect_type: 'none', effect_value: 0, group: 'contract' },
    { name: '超时补偿', short_name: '超时补偿', tile_type: 'runner', detail: '行动超时后老板保底增加 15 万', effect_type: 'coins', effect_value: 15, group: 'contract' },
    { name: '交战限制', short_name: '交战限制', tile_type: 'runner', detail: '禁用一种高风险打法', effect_type: 'none', effect_value: 0, group: 'contract' },
    { name: '预算升级', short_name: '预算升级', tile_type: 'boss', detail: '装备预算升级，老板保底增加 25 万', effect_type: 'coins', effect_value: 25, group: 'contract' },
    { name: '线索捷径', short_name: '前进 1 格', tile_type: 'move', detail: '发现可靠线索，立即前进 1 格', effect_type: 'move', effect_value: 1, group: 'movement' },
    { name: '快速搜点', short_name: '前进 2 格', tile_type: 'move', detail: '搜索效率提升，立即前进 2 格', effect_type: 'move', effect_value: 2, group: 'movement' },
    { name: '秘密通道', short_name: '前进 3 格', tile_type: 'move', detail: '发现秘密通道，立即前进 3 格', effect_type: 'move', effect_value: 3, group: 'movement' },
    { name: '临时返仓', short_name: '后退 1 格', tile_type: 'chance', detail: '装备不足需要返仓，立即后退 1 格', effect_type: 'move', effect_value: -1, group: 'movement' },
    { name: '路线封锁', short_name: '后退 2 格', tile_type: 'chance', detail: '主路线被封锁，立即后退 2 格', effect_type: 'move', effect_value: -2, group: 'movement' },
    { name: '遭遇伏击', short_name: '后退 3 格', tile_type: 'chance', detail: '遭遇伏击被迫撤回，立即后退 3 格', effect_type: 'move', effect_value: -3, group: 'movement' },
    { name: '等待情报', short_name: '暂停 1 次', tile_type: 'chance', detail: '等待情报确认，跳过下一次行动', effect_type: 'skip', effect_value: 1, group: 'turn' },
    { name: '受伤治疗', short_name: '暂停 2 次', tile_type: 'chance', detail: '需要治疗整备，跳过接下来 2 次行动', effect_type: 'skip', effect_value: 2, group: 'turn' },
    { name: '隐蔽观察', short_name: '隐蔽 1 次', tile_type: 'shared', detail: '原地观察敌情，跳过下一次行动', effect_type: 'skip', effect_value: 1, group: 'turn' },
    { name: '连续推进', short_name: '额外 1 次', tile_type: 'chance', detail: '骰子库存立即增加 1 个，之后仍按顺序轮换', effect_type: 'extra_roll', effect_value: 1, group: 'dice' },
    { name: '双线行动', short_name: '额外 2 次', tile_type: 'chance', detail: '骰子库存立即增加 2 个，之后仍按顺序轮换', effect_type: 'extra_roll', effect_value: 2, group: 'dice' },
    { name: '负重整理', short_name: '少摇 1 次', tile_type: 'chance', detail: '下个自己的回合减少 1 次掷骰', effect_type: 'lose_roll', effect_value: 1, group: 'dice' },
    { name: '通讯干扰', short_name: '少摇 2 次', tile_type: 'chance', detail: '下个自己的回合减少 2 次掷骰', effect_type: 'lose_roll', effect_value: 2, group: 'dice' },
    { name: '核心情报', short_name: '进入三轮', tile_type: 'chance', detail: '到达本格后，队伍进入第三轮', effect_type: 'advance_chance', effect_value: 0, group: 'advance_chance' },
    { name: '提前撤转', short_name: '提前晋级', tile_type: 'shared', detail: '满足撤转条件，队伍直接进入第三轮', effect_type: 'advance_round', effect_value: 0, group: 'advance' },
    { name: '任务跳级', short_name: '任务跳级', tile_type: 'boss', detail: '完成隐藏目标，队伍直接进入第三轮', effect_type: 'advance_round', effect_value: 0, group: 'advance' },
  ],
  3: [
    emptyRule,
    { name: '终局保底', short_name: '终局保底', tile_type: 'boss', detail: '最终阶段老板保底增加 40 万', effect_type: 'coins', effect_value: 40, group: 'contract' },
    { name: '安全撤离', short_name: '安全撤离', tile_type: 'boss', detail: '老板安全撤离时保底增加 25 万', effect_type: 'coins', effect_value: 25, group: 'contract' },
    { name: '核心搜索', short_name: '核心搜索', tile_type: 'boss', detail: '完成两个核心区域搜索点', effect_type: 'none', effect_value: 0, group: 'contract' },
    { name: '物资优先', short_name: '物资优先', tile_type: 'boss', detail: '目标物资优先完成交付', effect_type: 'none', effect_value: 0, group: 'contract' },
    { name: '战术改判', short_name: '战术改判', tile_type: 'runner', detail: '打手可改判一次路线或打法', effect_type: 'none', effect_value: 0, group: 'contract' },
    { name: '连败补偿', short_name: '连败补偿', tile_type: 'runner', detail: '连续失败后老板保底增加 30 万', effect_type: 'coins', effect_value: 30, group: 'contract' },
    { name: '强制撤离', short_name: '强制撤离', tile_type: 'shared', detail: '出现安全窗口后全队必须转点撤离', effect_type: 'none', effect_value: 0, group: 'contract' },
    { name: '禁用清单', short_name: '禁用清单', tile_type: 'shared', detail: '本局追加一项高风险行为禁令', effect_type: 'none', effect_value: 0, group: 'contract' },
    { name: '高额悬赏', short_name: '高额悬赏', tile_type: 'boss', detail: '完成追加目标，老板保底增加 50 万', effect_type: 'coins', effect_value: 50, group: 'contract' },
    { name: '装备损耗', short_name: '装备损耗', tile_type: 'chance', detail: '装备损耗导致老板保底减少 20 万', effect_type: 'coins', effect_value: -20, group: 'contract' },
    { name: '保险生效', short_name: '保险生效', tile_type: 'shared', detail: '护航保险生效，老板保底增加 20 万', effect_type: 'coins', effect_value: 20, group: 'contract' },
    { name: '近路突进', short_name: '前进 1 格', tile_type: 'move', detail: '抓住空档，立即前进 1 格', effect_type: 'move', effect_value: 1, group: 'movement' },
    { name: '载具接应', short_name: '前进 2 格', tile_type: 'move', detail: '获得载具接应，立即前进 2 格', effect_type: 'move', effect_value: 2, group: 'movement' },
    { name: '密道穿行', short_name: '前进 3 格', tile_type: 'move', detail: '穿过密道，立即前进 3 格', effect_type: 'move', effect_value: 3, group: 'movement' },
    { name: '空投指引', short_name: '前进 4 格', tile_type: 'move', detail: '空投标记出安全路线，立即前进 4 格', effect_type: 'move', effect_value: 4, group: 'movement' },
    { name: '极限突围', short_name: '前进 5 格', tile_type: 'move', detail: '完成极限突围，立即前进 5 格', effect_type: 'move', effect_value: 5, group: 'movement' },
    { name: '回收装备', short_name: '后退 1 格', tile_type: 'chance', detail: '返回回收装备，立即后退 1 格', effect_type: 'move', effect_value: -1, group: 'movement' },
    { name: '撤回掩体', short_name: '后退 2 格', tile_type: 'chance', detail: '火力压制下撤回掩体，立即后退 2 格', effect_type: 'move', effect_value: -2, group: 'movement' },
    { name: '封锁回撤', short_name: '后退 3 格', tile_type: 'chance', detail: '撤离点封锁，立即后退 3 格', effect_type: 'move', effect_value: -3, group: 'movement' },
    { name: '重伤撤退', short_name: '后退 4 格', tile_type: 'chance', detail: '队员重伤，立即后退 4 格', effect_type: 'move', effect_value: -4, group: 'movement' },
    { name: '任务失败', short_name: '后退 5 格', tile_type: 'chance', detail: '关键任务失败，立即后退 5 格', effect_type: 'move', effect_value: -5, group: 'movement' },
    { name: '静默等待', short_name: '暂停 1 次', tile_type: 'chance', detail: '进入静默状态，跳过下一次行动', effect_type: 'skip', effect_value: 1, group: 'turn' },
    { name: '重整队形', short_name: '暂停 2 次', tile_type: 'shared', detail: '重整队形，跳过接下来 2 次行动', effect_type: 'skip', effect_value: 2, group: 'turn' },
    { name: '撤离点关闭', short_name: '暂停 2 次', tile_type: 'chance', detail: '等待撤离点重开，跳过接下来 2 次行动', effect_type: 'skip', effect_value: 2, group: 'turn' },
    { name: '补给空投', short_name: '额外 1 次', tile_type: 'chance', detail: '获得补给空投，骰子库存立即增加 1 个', effect_type: 'extra_roll', effect_value: 1, group: 'dice' },
    { name: '战术连携', short_name: '额外 2 次', tile_type: 'shared', detail: '触发战术连携，骰子库存立即增加 2 个', effect_type: 'extra_roll', effect_value: 2, group: 'dice' },
    { name: '信号延迟', short_name: '少摇 1 次', tile_type: 'chance', detail: '下个自己的回合减少 1 次掷骰', effect_type: 'lose_roll', effect_value: 1, group: 'dice' },
    { name: '装备超重', short_name: '少摇 2 次', tile_type: 'chance', detail: '下个自己的回合减少 2 次掷骰', effect_type: 'lose_roll', effect_value: 2, group: 'dice' },
    { name: '最后冲刺', short_name: '额外 1 次', tile_type: 'move', detail: '进入最后冲刺，骰子库存立即增加 1 个', effect_type: 'extra_roll', effect_value: 1, group: 'dice' },
    { name: '协议结算', short_name: '协议结算', tile_type: 'shared', detail: '本房间规则全部结算，本局结束', effect_type: 'finish', effect_value: 0, group: 'finish' },
    { name: '成功撤离', short_name: '成功撤离', tile_type: 'boss', detail: '完成最终撤离，本局结束', effect_type: 'finish', effect_value: 0, group: 'finish' },
    { name: '任务完成', short_name: '任务完成', tile_type: 'runner', detail: '护航任务全部完成，本局结束', effect_type: 'finish', effect_value: 0, group: 'finish' },
  ],
}

const ROUND_GROUPS: Record<GameRound, TileDefinition['group'][]> = {
  1: ['empty', 'contract', 'movement', 'movement', 'turn', 'dice', 'advance_chance', 'advance'],
  2: ['empty', 'empty', 'contract', 'contract', 'movement', 'movement', 'turn', 'turn', 'dice', 'dice', 'advance_chance', 'advance'],
  3: ['empty', 'empty', 'empty', 'empty', 'contract', 'contract', 'contract', 'contract', 'contract', 'movement', 'movement', 'movement', 'movement', 'movement', 'movement', 'turn', 'turn', 'turn', 'dice', 'dice', 'dice', 'dice', 'dice'],
}

export const PLAYER_COLORS = ['#dbff4b', '#ff725e', '#50c8ff']

export const TILE_TYPE_LABELS: Record<TileType, string> = {
  shared: '公共', boss: '老板', runner: '打手', empty: '空格', move: '移动', chance: '事件',
}

export const EFFECT_LABELS: Record<TileEffect, string> = {
  none: '仅显示规则', coins: '修改老板保底', move: '前进 / 后退', skip: '暂停行动',
  extra_roll: '增加骰子库存', lose_roll: '下次行动减少骰子',
  advance_chance: '进入下一轮', advance_round: '进入下一轮', finish: '结束本局',
}

function shuffled<T>(items: T[]) {
  const result = [...items]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1))
    ;[result[index], result[target]] = [result[target], result[index]]
  }
  return result
}

export function createRandomRoomTiles(roomId: string): RoomTile[] {
  const createdAt = new Date().toISOString()
  const tiles: RoomTile[] = []

  for (const round of [1, 2, 3] as GameRound[]) {
    const usedNames = new Set<string>()
    const groups = shuffled(ROUND_GROUPS[round])
    if (round < 3) {
      const firstAdvancePosition = Math.floor(Math.random() * (groups.length / 2))
      const advancePositions = [firstAdvancePosition, firstAdvancePosition + groups.length / 2]
      ;(['advance_chance', 'advance'] as TileDefinition['group'][]).forEach((group, index) => {
        const currentPosition = groups.indexOf(group)
        const targetPosition = advancePositions[index]
        ;[groups[currentPosition], groups[targetPosition]] = [groups[targetPosition], groups[currentPosition]]
      })
    }
    if (round === 3) groups.push('finish')

    groups.forEach((group, position) => {
      const candidates = RULE_TEMPLATES[round].filter((rule) => rule.group === group)
      const fresh = candidates.filter((rule) => !usedNames.has(rule.name))
      const pool = fresh.length ? fresh : candidates
      const selected = pool[Math.floor(Math.random() * pool.length)]
      usedNames.add(selected.name)
      tiles.push({
        id: crypto.randomUUID(), room_id: roomId, template_id: null, round_number: round, position,
        name: selected.name, short_name: selected.short_name, tile_type: selected.tile_type,
        detail: selected.detail, effect_type: selected.effect_type, effect_value: selected.effect_value,
        created_at: createdAt,
      })
    })
  }

  return tiles
}

export function getRoundTiles(tiles: RoomTile[], round: GameRound) {
  return tiles.filter((tile) => tile.round_number === round).sort((a, b) => a.position - b.position)
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
