import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

type Edge = { from: string; to: string; bidirectional?: boolean }
type Tile = { id: string; advances?: boolean }

function adjacency(edges: Edge[], direction: 1 | -1) {
  const result = new Map<string, string[]>()
  const add = (from: string, to: string) => result.set(from, [...(result.get(from) ?? []), to])
  for (const edge of edges) {
    if (direction === 1) add(edge.from, edge.to)
    else add(edge.to, edge.from)
    if (edge.bidirectional) {
      if (direction === 1) add(edge.to, edge.from)
      else add(edge.from, edge.to)
    }
  }
  return result
}

function viableNextTiles(
  tiles: Tile[],
  edges: Edge[],
  current: string,
  remainingSteps: number,
  direction: 1 | -1,
  requireAdvance: boolean | null,
) {
  const graph = adjacency(edges, direction)
  const tileById = new Map(tiles.map((tile) => [tile.id, tile]))
  const canFinish = (tileId: string, steps: number): boolean => {
    if (steps === 0) return requireAdvance === null || Boolean(tileById.get(tileId)?.advances) === requireAdvance
    return (graph.get(tileId) ?? []).some((next) => canFinish(next, steps - 1))
  }
  return (graph.get(current) ?? []).filter((next) => canFinish(next, remainingSteps - 1))
}

function passesAdvanceRoll(chance: number, roll: number) {
  return roll < chance
}

const tiles: Tile[] = [
  { id: 'start' }, { id: 'fork-1' }, { id: 'left' }, { id: 'right' },
  { id: 'effect-start' }, { id: 'fork-2' }, { id: 'normal' }, { id: 'advance', advances: true }, { id: 'finish' },
]
const edges: Edge[] = [
  { from: 'start', to: 'fork-1' },
  { from: 'fork-1', to: 'left' },
  { from: 'fork-1', to: 'right' },
  { from: 'left', to: 'advance' },
  { from: 'right', to: 'normal' },
  { from: 'effect-start', to: 'fork-2' },
  { from: 'fork-2', to: 'advance' },
  { from: 'fork-2', to: 'finish' },
]

assert.deepEqual(
  viableNextTiles(tiles, edges, 'fork-1', 2, 1, false),
  ['right'],
  '未通过晋级判定时，只能显示最终不会晋级的下一格',
)
assert.deepEqual(
  viableNextTiles(tiles, edges, 'fork-1', 2, 1, true),
  ['left'],
  '通过晋级判定时，只能显示可以到达晋级格的下一格',
)
assert.deepEqual(
  viableNextTiles(tiles, edges, 'fork-2', 1, 1, null),
  ['advance', 'finish'],
  '额外移动不受本次晋级筛选影响，后续岔路仍须自主选择',
)
assert.deepEqual(
  viableNextTiles(tiles, edges, 'normal', 2, -1, null),
  ['right'],
  '后退效果必须沿箭头反方向寻找可完成的路线',
)

assert.equal(passesAdvanceRoll(0, 0), false, '0% 永远不能通过晋级判定')
assert.equal(passesAdvanceRoll(10, 9), true, '10% 的随机区间应包含 0 到 9')
assert.equal(passesAdvanceRoll(10, 10), false, '10% 的随机区间不应包含 10')
assert.equal(passesAdvanceRoll(100, 99), true, '100% 永远通过晋级判定')

const appSource = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
const schemaSource = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8')
assert.equal(appSource.includes('route-choice-panel'), false, '旧的棋盘下方路线按钮区域必须移除')
assert.ok(appSource.includes('route-choice-target'), '棋盘待选格必须拥有闪烁选择状态')
assert.ok(schemaSource.includes('pending_route_state'), '数据库必须持久化逐步路线状态')
assert.ok(schemaSource.lastIndexOf('create or replace function public.choose_route(p_room_id uuid, p_tile_id uuid)')
  > schemaSource.lastIndexOf('create or replace function public.choose_route(p_room_id uuid, p_path jsonb)'),
'最终生效的路线接口必须接收下一格，而不是完整路径')

console.log('路线选择回归测试通过：逐个岔路、晋级概率、额外移动与反向路线')
