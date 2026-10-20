import assert from 'node:assert/strict'
import { createRandomRoomTiles, RULE_TEMPLATES } from '../src/lib/board'
import { chooseDemoDice, createDemoRoom, resolveDemoDice, startDemoGame } from '../src/lib/demoGame'
import type { GameRound, RoomTile, TileEffect } from '../src/types'

function snapshotFor(effect: TileEffect, value = 0, round: GameRound = 1) {
  let snapshot = startDemoGame(createDemoRoom('测试玩家', 'runner'))
  snapshot = {
    ...snapshot,
    room: {
      ...snapshot.room,
      current_round: round,
      board_size: round === 1 ? 8 : round === 2 ? 12 : 24,
      rolls_remaining: 2,
    },
    players: snapshot.players.map((player) => ({ ...player, position: 0, distance: 0, coins: 100, skip_turns: 0, next_roll_modifier: 0 })),
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

function resolve(effect: TileEffect, value = 0, round: GameRound = 1) {
  return resolveDemoDice(snapshotFor(effect, value, round), 1).snapshot
}

const noEffect = resolve('none')
assert.equal(noEffect.room.current_round, 1)
assert.equal(noEffect.players[0].coins, 100)

const coins = resolve('coins', 20)
assert.equal(coins.players[0].coins, 120)
assert.equal(coins.room.current_round, 1)

const moveForward = resolve('move', 2)
assert.equal(moveForward.players[0].position, 3)
assert.equal(moveForward.room.current_round, 1)

const moveBack = resolve('move', -2)
assert.equal(moveBack.players[0].position, 7)
assert.equal(moveBack.room.current_round, 1)

const skipped = resolve('skip', 1, 1)
assert.equal(skipped.players[0].skip_turns, 1)
assert.equal(skipped.room.current_round, 1, '暂停格不得附带晋级')

const extraRoll = resolve('extra_roll', 1)
assert.equal(extraRoll.room.rolls_remaining, 2)
assert.equal(extraRoll.room.current_round, 1)

const loseRoll = resolve('lose_roll', 1)
assert.equal(loseRoll.players[0].next_roll_modifier, -1)
assert.equal(loseRoll.room.current_round, 1)

const penaltyTurnStart = snapshotFor('lose_roll', 1)
penaltyTurnStart.room.rolls_remaining = 1
penaltyTurnStart.players[0].dice_count = 1
const penaltyTurn = resolveDemoDice(penaltyTurnStart, 1).snapshot
assert.equal(penaltyTurn.room.rolls_remaining, 1)
assert.equal(penaltyTurn.players[0].next_roll_modifier, 0)

const successfulAdvance = resolve('advance_chance', 0, 1)
assert.equal(successfulAdvance.room.current_round, 2)

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

const weighted = startDemoGame(createDemoRoom('概率测试', 'runner'))
weighted.room.round1_advance_chance = 0
const zeroChanceDice = chooseDemoDice(weighted, 0, 0)
const zeroChanceTile = weighted.tiles.find((tile) => tile.round_number === 1 && tile.position === zeroChanceDice)
assert.ok(zeroChanceTile?.effect_type !== 'advance_chance' && zeroChanceTile?.effect_type !== 'advance_round', '0% 不得落到晋级格')

weighted.room.round1_advance_chance = 10
const successfulChanceDice = chooseDemoDice(weighted, 9, 0)
const successfulChanceTile = weighted.tiles.find((tile) => tile.round_number === 1 && tile.position === successfulChanceDice)
assert.ok(successfulChanceTile?.effect_type === 'advance_chance' || successfulChanceTile?.effect_type === 'advance_round', '10% 命中时必须落到晋级格')
const failedChanceDice = chooseDemoDice(weighted, 10, 0)
const failedChanceTile = weighted.tiles.find((tile) => tile.round_number === 1 && tile.position === failedChanceDice)
assert.ok(failedChanceTile?.effect_type !== 'advance_chance' && failedChanceTile?.effect_type !== 'advance_round', '10% 未命中时不得落到晋级格')

console.log('效果回归测试通过：全部落格效果、分轮规则与 50 组三轮随机棋盘')
