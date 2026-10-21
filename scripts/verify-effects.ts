import assert from 'node:assert/strict'
import { BOARD_LAYOUT_PRESETS, BOARD_TILE_STEP_X, BOARD_TILE_STEP_Y, createBoardLayout, createDefaultTileEdges, createRandomRoomTiles, getBoardDimensions, getBoardGridPosition, getRoomBoardBounds, getRoomBoardDimensions, getRoomTileCanvasPosition, getRoomTileGridPosition, gridPointToCanvas, RULE_TEMPLATES, usesDenseBoardLayout } from '../src/lib/board'
import { chooseDemoDice, createDemoRoom, resolveDemoDice, startDemoGame } from '../src/lib/demoGame'
import type { GameRound, RoomTile, TileEffect } from '../src/types'

function snapshotFor(effect: TileEffect, value = 0, round: GameRound = 1, roundRollCount = 2) {
  let snapshot = startDemoGame(createDemoRoom('测试玩家', 'boss'))
  snapshot = {
    ...snapshot,
    room: {
      ...snapshot.room,
      current_round: round,
      board_size: round === 1 ? 8 : round === 2 ? 12 : 24,
      rolls_remaining: 2,
    },
    players: snapshot.players.map((player) => ({ ...player, position: 0, distance: 0, coins: 100, skip_turns: 0, next_roll_modifier: 0, round_roll_count: roundRollCount })),
  }

  const tileIndex = snapshot.tiles.findIndex((tile) => tile.round_number === round && tile.position === 1)
  assert.notEqual(tileIndex, -1)
  const tile: RoomTile = {
    ...snapshot.tiles[tileIndex],
    name: `测试-${effect}`,
    short_name: '测试格',
    detail: '效果回归测试',
    tile_type: effect === 'move' ? 'move' : 'chance',
    effect_type: effect,
    effect_value: value,
  }
  const tiles = [...snapshot.tiles]
  tiles[tileIndex] = tile
  return { ...snapshot, tiles }
}

function resolve(effect: TileEffect, value = 0, round: GameRound = 1, roundRollCount = 2) {
  return resolveDemoDice(snapshotFor(effect, value, round, roundRollCount), 1).snapshot
}

const noEffect = resolve('none')
assert.equal(noEffect.room.current_round, 1)
assert.equal(noEffect.players[0].coins, 100)

const guaranteeAdded = resolve('guarantee_add', 20)
assert.equal(guaranteeAdded.players[0].coins, 120)
assert.equal(guaranteeAdded.room.current_round, 1)

const guaranteeSubtracted = resolve('guarantee_subtract', 20)
assert.equal(guaranteeSubtracted.players[0].coins, 80)
assert.equal(resolve('guarantee_subtract', 200).players[0].coins, 0, '老板保底不得低于 0')

const guaranteeMultiplied = resolve('guarantee_multiply', 3)
assert.equal(guaranteeMultiplied.players[0].coins, 300)
assert.equal(resolve('guarantee_multiply', 2.345).players[0].coins, 235, '保底小数乘法结果应四舍五入')
assert.equal(resolve('guarantee_multiply', 0).players[0].coins, 0, '0 倍应将老板保底结算为 0')

const guaranteeDivided = resolve('guarantee_divide', 3)
assert.equal(guaranteeDivided.players[0].coins, 33, '保底除法结果应取整')
assert.equal(resolve('guarantee_divide', 2.5).players[0].coins, 40, '保底除法应支持小数倍数')
assert.equal(resolve('guarantee_divide', 6).players[0].coins, 17, '保底除法结果应四舍五入')
assert.equal(resolve('guarantee_divide', 0).players[0].coins, 0, '除数为 0 时应安全结算为 0')

const runnerGuarantee = snapshotFor('guarantee_add', 20)
runnerGuarantee.players = [
  { ...runnerGuarantee.players[0], id: 'guarantee-boss', user_id: 'guarantee-boss-user', nickname: '老板', role: 'boss', turn_order: 0, coins: 100 },
  { ...runnerGuarantee.players[0], id: 'guarantee-runner', user_id: 'guarantee-runner-user', nickname: '打手', role: 'runner', turn_order: 1, coins: 0 },
]
runnerGuarantee.room.current_turn = 'guarantee-runner-user'
const runnerTriggeredGuarantee = resolveDemoDice(runnerGuarantee, 1).snapshot
assert.equal(runnerTriggeredGuarantee.players[0].coins, 120, '打手触发保底格时应结算到老板')
assert.equal(runnerTriggeredGuarantee.players[1].coins, 0, '打手始终不拥有保底')
assert.equal(createDemoRoom('试玩打手', 'runner').players[0].coins, 0, '打手初始保底必须为 0')

const moveForward = resolve('move', 2)
assert.equal(moveForward.players[0].position, 3)
assert.equal(moveForward.room.current_round, 1)

const moveBack = resolve('move', -2)
assert.equal(moveBack.players[0].position, 7)
assert.equal(moveBack.room.current_round, 1)

const skipped = resolve('skip', 1, 1)
assert.equal(skipped.players[0].skip_turns, 0, '单人试玩应立即结算被跳过的下一次行动')
assert.equal(skipped.room.current_round, 1, '暂停格不得附带晋级')

const extraRoll = resolve('extra_roll', 1)
assert.equal(extraRoll.room.rolls_remaining, 2)
assert.equal(extraRoll.room.current_round, 1)

const loseRoll = resolve('lose_roll', 1)
assert.equal(loseRoll.players[0].next_roll_modifier, 0)
assert.equal(loseRoll.players[0].dice_count, 0, '单人试玩轮回到自己时应结算少摇 1 次')
assert.equal(loseRoll.room.current_round, 1)

const penaltyTurnStart = snapshotFor('lose_roll', 1)
penaltyTurnStart.room.rolls_remaining = 1
penaltyTurnStart.players[0].dice_count = 1
const penaltyTurn = resolveDemoDice(penaltyTurnStart, 1).snapshot
assert.equal(penaltyTurn.room.rolls_remaining, 0)
assert.equal(penaltyTurn.players[0].dice_count, 0)
assert.equal(penaltyTurn.room.current_turn, null)
assert.equal(penaltyTurn.players[0].next_roll_modifier, 0)
assert.match(penaltyTurn.events[0].message, /所有玩家都没有可用骰子/)

const rotatingTurns = snapshotFor('none')
rotatingTurns.players = [
  { ...rotatingTurns.players[0], id: 'player-1', user_id: 'user-1', nickname: '一号', turn_order: 0, dice_count: 5 },
  { ...rotatingTurns.players[0], id: 'player-2', user_id: 'user-2', nickname: '二号', turn_order: 1, dice_count: 5 },
  { ...rotatingTurns.players[0], id: 'player-3', user_id: 'user-3', nickname: '三号', turn_order: 2, dice_count: 5 },
]
rotatingTurns.room.current_turn = 'user-1'
let rotated = resolveDemoDice(rotatingTurns, 1).snapshot
assert.equal(rotated.room.current_turn, 'user-2', '一号掷骰后必须立即轮到二号')
assert.deepEqual(rotated.players.map((player) => player.dice_count), [4, 5, 5])
rotated = resolveDemoDice(rotated, 1).snapshot
assert.equal(rotated.room.current_turn, 'user-3', '二号掷骰后必须立即轮到三号')
assert.deepEqual(rotated.players.map((player) => player.dice_count), [4, 4, 5])
rotated = resolveDemoDice(rotated, 1).snapshot
assert.equal(rotated.room.current_turn, 'user-1', '三号掷骰后必须回到一号')
assert.deepEqual(rotated.players.map((player) => player.dice_count), [4, 4, 4])

const skipsEmptyPlayer = snapshotFor('none')
skipsEmptyPlayer.players = [
  { ...skipsEmptyPlayer.players[0], id: 'skip-player-1', user_id: 'skip-user-1', nickname: '一号', turn_order: 0, dice_count: 5 },
  { ...skipsEmptyPlayer.players[0], id: 'skip-player-2', user_id: 'skip-user-2', nickname: '二号', turn_order: 1, dice_count: 0 },
  { ...skipsEmptyPlayer.players[0], id: 'skip-player-3', user_id: 'skip-user-3', nickname: '三号', turn_order: 2, dice_count: 5 },
]
skipsEmptyPlayer.room.current_turn = 'skip-user-1'
const skippedEmptyPlayer = resolveDemoDice(skipsEmptyPlayer, 1).snapshot
assert.equal(skippedEmptyPlayer.room.current_turn, 'skip-user-3', '骰子为 0 的二号必须被自动跳过')

const extraDiceRotates = snapshotFor('extra_roll', 1)
extraDiceRotates.players = [
  { ...extraDiceRotates.players[0], id: 'extra-player-1', user_id: 'extra-user-1', nickname: '一号', turn_order: 0, dice_count: 5 },
  { ...extraDiceRotates.players[0], id: 'extra-player-2', user_id: 'extra-user-2', nickname: '二号', turn_order: 1, dice_count: 5 },
  { ...extraDiceRotates.players[0], id: 'extra-player-3', user_id: 'extra-user-3', nickname: '三号', turn_order: 2, dice_count: 5 },
]
extraDiceRotates.room.current_turn = 'extra-user-1'
const extraDiceResult = resolveDemoDice(extraDiceRotates, 1).snapshot
assert.equal(extraDiceResult.players[0].dice_count, 5, '额外骰子应加入库存')
assert.equal(extraDiceResult.room.current_turn, 'extra-user-2', '获得额外骰子后仍必须轮到下一人')

const protectedAdvance = resolve('advance_round', 0, 1, 0)
assert.equal(protectedAdvance.room.current_round, 1, '第一轮前两次掷骰不得晋级')
assert.equal(protectedAdvance.players[0].round_roll_count, 1)

const protectedRoundTwoAdvance = resolve('advance_round', 0, 2, 1)
assert.equal(protectedRoundTwoAdvance.room.current_round, 2, '第二轮老板前两次掷骰也不得晋级')

const successfulAdvance = resolve('advance_chance', 0, 1)
assert.equal(successfulAdvance.room.current_round, 2)
assert.equal(successfulAdvance.players[0].round_roll_count, 0)

const successfulRoundTwoAdvance = resolve('advance_chance', 0, 2)
assert.equal(successfulRoundTwoAdvance.room.current_round, 3)

const directAdvance = resolve('advance_round')
assert.equal(directAdvance.room.current_round, 2)

const directRoundTwoAdvance = resolve('advance_round', 0, 2)
assert.equal(directRoundTwoAdvance.room.current_round, 3)

const finished = resolve('finish', 0, 3)
assert.equal(finished.room.status, 'finished')
assert.equal(finished.room.current_turn, null)

for (const round of [1, 2, 3] as const) {
  const moveLimit = round === 1 ? 2 : round === 2 ? 3 : 5
  const skipLimit = round === 1 ? 1 : 2
  for (const rule of RULE_TEMPLATES[round]) {
    if (rule.tile_type === 'empty') {
      assert.equal(rule.effect_type, 'none')
      assert.equal(rule.effect_value, 0)
    }
    if (rule.effect_type === 'none' || rule.effect_type === 'advance_chance' || rule.effect_type === 'advance_round' || rule.effect_type === 'finish') {
      assert.equal(rule.effect_value, 0)
    }
    if (rule.effect_type === 'move') {
      assert.notEqual(rule.effect_value, 0)
      assert.ok(Math.abs(rule.effect_value) <= moveLimit)
    }
    if (rule.effect_type === 'guarantee_add' || rule.effect_type === 'guarantee_subtract') {
      assert.ok(Number.isInteger(rule.effect_value) && rule.effect_value >= 1 && rule.effect_value <= 100000)
    }
    if (rule.effect_type === 'guarantee_multiply' || rule.effect_type === 'guarantee_divide') {
      assert.ok(rule.effect_value >= 0 && rule.effect_value <= 10)
    }
    if (rule.effect_type === 'skip') assert.ok(rule.effect_value >= 1 && rule.effect_value <= skipLimit)
    if (rule.effect_type === 'extra_roll' || rule.effect_type === 'lose_roll') assert.ok(rule.effect_value >= 1 && rule.effect_value <= 2)
    if (round === 3) assert.ok(rule.effect_type !== 'advance_chance' && rule.effect_type !== 'advance_round')
    if (round < 3) assert.notEqual(rule.effect_type, 'finish')
  }
}

for (let index = 0; index < 50; index += 1) {
  const tiles = createRandomRoomTiles(`room-${index}`)
  for (const [round, size] of [[1, 8], [2, 12], [3, 24]] as const) {
    const roundTiles = tiles.filter((tile) => tile.round_number === round)
    assert.equal(roundTiles.length, size)
    const startTiles = roundTiles.filter((tile) => tile.tile_type === 'start')
    assert.equal(startTiles.length, 1)
    assert.equal(startTiles[0].position, 0)
    assert.equal(startTiles[0].effect_type, 'none')
    assert.equal(startTiles[0].is_randomized, false)
    assert.ok(roundTiles.some((tile) => tile.tile_type === 'empty'))
  }
  for (const round of [1, 2] as const) {
    const roundTiles = tiles.filter((tile) => tile.round_number === round)
    assert.equal(roundTiles.filter((tile) => tile.effect_type === 'advance_chance').length, 1)
    assert.equal(roundTiles.filter((tile) => tile.effect_type === 'advance_round').length, 1)
    for (let position = 0; position < roundTiles.length; position += 1) {
      const reachable = [1, 2, 3, 4, 5, 6].map((dice) => roundTiles[(position + dice) % roundTiles.length])
      assert.ok(reachable.some((tile) => tile.effect_type === 'advance_chance' || tile.effect_type === 'advance_round'))
      assert.ok(reachable.some((tile) => tile.effect_type !== 'advance_chance' && tile.effect_type !== 'advance_round'))
    }
  }
  assert.equal(tiles.filter((tile) => tile.round_number === 3 && tile.effect_type === 'finish').length, 1)
}

const weighted = startDemoGame(createDemoRoom('概率测试', 'boss'))
weighted.room.round1_advance_chance = 0
weighted.room.round_advance_chances[0] = 0
const zeroChanceDice = chooseDemoDice(weighted, 0, 0)
const zeroChanceTile = weighted.tiles.find((tile) => tile.round_number === 1 && tile.position === zeroChanceDice)
assert.ok(zeroChanceTile?.effect_type !== 'advance_chance' && zeroChanceTile?.effect_type !== 'advance_round', '0% 不得落到晋级格')

weighted.room.round1_advance_chance = 100
weighted.room.round_advance_chances[0] = 100
for (const protectedRollCount of [0, 1]) {
  weighted.players[0].round_roll_count = protectedRollCount
  const protectedDice = chooseDemoDice(weighted, 0, 0)
  const protectedTile = weighted.tiles.find((tile) => tile.round_number === 1 && tile.position === protectedDice)
  assert.ok(protectedTile?.effect_type !== 'advance_chance' && protectedTile?.effect_type !== 'advance_round', '第一轮前两次不得落到晋级格')
}

weighted.room.round1_advance_chance = 10
weighted.room.round_advance_chances[0] = 10
weighted.players[0].round_roll_count = 2
const successfulChanceDice = chooseDemoDice(weighted, 9, 0)
const successfulChanceTile = weighted.tiles.find((tile) => tile.round_number === 1 && tile.position === successfulChanceDice)
assert.ok(successfulChanceTile?.effect_type === 'advance_chance' || successfulChanceTile?.effect_type === 'advance_round', '10% 命中时必须落到晋级格')
const failedChanceDice = chooseDemoDice(weighted, 10, 0)
const failedChanceTile = weighted.tiles.find((tile) => tile.round_number === 1 && tile.position === failedChanceDice)
assert.ok(failedChanceTile?.effect_type !== 'advance_chance' && failedChanceTile?.effect_type !== 'advance_round', '10% 未命中时不得落到晋级格')

const onlineRunner = startDemoGame(createDemoRoom('打手测试', 'runner'))
onlineRunner.isDemo = false
onlineRunner.room.round1_advance_chance = 100
onlineRunner.room.round_advance_chances[0] = 100
onlineRunner.players[0].round_roll_count = 20
const runnerDice = chooseDemoDice(onlineRunner, 0, 0)
const runnerTile = onlineRunner.tiles.find((tile) => tile.round_number === 1 && tile.position === runnerDice)
assert.ok(runnerTile?.effect_type !== 'advance_chance' && runnerTile?.effect_type !== 'advance_round', '打手不得落到晋级格')

const forcedRunnerAdvance = snapshotFor('advance_round', 0, 1, 20)
forcedRunnerAdvance.isDemo = false
forcedRunnerAdvance.players[0].role = 'runner'
assert.equal(resolveDemoDice(forcedRunnerAdvance, 1).snapshot.room.current_round, 1, '打手即使落到晋级格也不得晋级')

for (let size = 2; size <= 100; size += 2) {
  const dimensions = getBoardDimensions(size)
  const positions = Array.from({ length: size }, (_, index) => getBoardGridPosition(index, size))
  const uniquePositions = new Set(positions.map((position) => `${position.gridColumn}:${position.gridRow}`))
  assert.equal(uniquePositions.size, size, `${size} 格棋盘不能出现重叠位置`)
  for (const position of positions) {
    assert.ok(position.gridColumn >= 1 && position.gridColumn <= dimensions.columns, `${size} 格棋盘列坐标越界`)
    assert.ok(position.gridRow >= 1 && position.gridRow <= dimensions.rows, `${size} 格棋盘行坐标越界`)
  }
  if (usesDenseBoardLayout(size)) {
    const centerStart = (dimensions.columns - 1) / 2
    const routeCapacity = dimensions.columns * dimensions.rows - 9
    assert.ok(routeCapacity >= size, `${size} 格多环棋盘容量不足`)
    assert.ok((dimensions.columns - 2) ** 2 - 9 < size, `${size} 格多环棋盘使用了多余外环`)
    for (let index = 1; index < positions.length; index += 1) {
      const columnDistance = Math.abs(positions[index].gridColumn - positions[index - 1].gridColumn)
      const rowDistance = Math.abs(positions[index].gridRow - positions[index - 1].gridRow)
      assert.equal(columnDistance + rowDistance, 1, `${size} 格棋盘路线必须连续`)
    }
    for (const position of positions) {
      const insideCenter = position.gridColumn >= centerStart
        && position.gridColumn < centerStart + 3
        && position.gridRow >= centerStart
        && position.gridRow < centerStart + 3
      assert.equal(insideCenter, false, `${size} 格默认同心路线应保留中心留白`)
    }
  }
}

for (const preset of BOARD_LAYOUT_PRESETS) {
  for (let size = 2; size <= 100; size += 2) {
    const positions = createBoardLayout(size, preset.id)
    const uniquePositions = new Set(positions.map((position) => `${position.gridX}:${position.gridY}`))
    assert.equal(positions.length, size, `${preset.name}必须适配 ${size} 格`)
    assert.equal(uniquePositions.size, size, `${preset.name}的 ${size} 格排布不能重叠`)
    assert.ok(positions.every((position) => position.gridX >= 0 && position.gridX <= 200), `${preset.name}横坐标越界`)
    assert.ok(positions.every((position) => position.gridY >= 0 && position.gridY <= 200), `${preset.name}纵坐标越界`)
  }
  const small = createBoardLayout(8, preset.id)
  const large = createBoardLayout(100, preset.id)
  const smallSpan = Math.max(...small.map((position) => position.gridX)) + Math.max(...small.map((position) => position.gridY))
  const largeSpan = Math.max(...large.map((position) => position.gridX)) + Math.max(...large.map((position) => position.gridY))
  assert.ok(largeSpan > smallSpan, `${preset.name}应随格子数量增加而扩展复杂度`)
}

const graphTiles = createRandomRoomTiles('graph-test-room')
const graphEdges = createDefaultTileEdges(graphTiles)
assert.equal(graphEdges.length, graphTiles.length, '默认图必须为每个格子创建一条出口')
for (const round of [1, 2, 3] as const) {
  const roundTiles = graphTiles.filter((tile) => tile.round_number === round)
  const roundEdges = graphEdges.filter((edge) => edge.round_number === round)
  assert.equal(roundEdges.length, roundTiles.length)
  roundTiles.forEach((tile, index) => {
    const edge = roundEdges.find((candidate) => candidate.from_tile_id === tile.id)
    assert.equal(edge?.to_tile_id, roundTiles[(index + 1) % roundTiles.length].id, '默认路线必须形成单向闭环')
  })
}
const movedTiles = graphTiles.filter((tile) => tile.round_number === 1).map((tile, index) => index === 0 ? { ...tile, grid_x: 14, grid_y: 9 } : tile)
assert.deepEqual(getRoomTileGridPosition(movedTiles[0], 0, movedTiles.length), { gridColumn: 15, gridRow: 10 })
const movedDimensions = getRoomBoardDimensions(movedTiles)
assert.ok(movedDimensions.columns >= 15 && movedDimensions.rows >= 10, '自由移动后的棋盘边界必须随格子扩张')

const legacyCanvasPosition = getRoomTileCanvasPosition(movedTiles[0], 0, movedTiles.length)
assert.deepEqual(legacyCanvasPosition, { x: 14 * BOARD_TILE_STEP_X, y: 9 * BOARD_TILE_STEP_Y }, '旧网格坐标必须自动转换为画布像素坐标')
const freelyMovedTiles = movedTiles.map((tile, index) => index === 0 ? { ...tile, layout_x: -137.5, layout_y: 42.25 } : tile)
assert.deepEqual(getRoomTileCanvasPosition(freelyMovedTiles[0], 0, freelyMovedTiles.length), { x: -137.5, y: 42.25 }, '连续坐标必须支持负数和小数并优先于旧网格')
const freeBounds = getRoomBoardBounds(freelyMovedTiles)
assert.equal(freeBounds.minX, -137.5, '画布边界必须包含负坐标')
assert.ok(freeBounds.width > 120 && freeBounds.height >= 92, '画布边界必须覆盖全部格子')
for (const preset of BOARD_LAYOUT_PRESETS) {
  const canvasPoints = createBoardLayout(24, preset.id).map(gridPointToCanvas)
  assert.ok(canvasPoints.every((point) => point.x % BOARD_TILE_STEP_X === 0 && point.y % BOARD_TILE_STEP_Y === 0), `${preset.name}必须转换为稳定的像素间距`)
}

console.log('效果回归测试通过：落格效果、分轮规则、无限画布、5 种自适应预设与默认路线图')
