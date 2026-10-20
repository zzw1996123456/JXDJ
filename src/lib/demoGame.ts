import { createRandomRoomTiles, getRoundTiles } from './board'
import type { GameEvent, GameSnapshot, Player, PlayerRole, Room } from '../types'

const DEMO_USER_ID = 'demo-player'

function now() {
  return new Date().toISOString()
}

function event(roomId: string, message: string): GameEvent {
  return { id: crypto.randomUUID(), room_id: roomId, message, created_at: now() }
}

export function createDemoRoom(nickname: string, role: PlayerRole): GameSnapshot {
  const room: Room = {
    id: 'demo-room', code: 'DEMO88', host_user_id: DEMO_USER_ID, status: 'lobby',
    current_turn: null, winner_id: null, board_size: 8, target_laps: 3, current_round: 1,
    round1_advance_chance: 35, round2_advance_chance: 30, starting_player_id: DEMO_USER_ID,
    rolls_per_turn: 2, rolls_remaining: 2, created_at: now(),
  }

  const player: Player = {
    id: 'demo-player-record', room_id: room.id, user_id: DEMO_USER_ID, nickname, role,
    position: 0, distance: 0, coins: 100, is_ready: true, turn_order: 0,
    skip_turns: 0, next_roll_modifier: 0, created_at: now(),
  }

  return {
    room,
    players: [player],
    events: [event(room.id, `${nickname} 进入随机规则试玩房，基础保障 100`)],
    tiles: createRandomRoomTiles(room.id),
    userId: DEMO_USER_ID,
    isDemo: true,
  }
}

export function startDemoGame(snapshot: GameSnapshot): GameSnapshot {
  const player = snapshot.players[0]
  return {
    ...snapshot,
    room: {
      ...snapshot.room,
      status: 'playing',
      current_turn: player.user_id,
      rolls_remaining: snapshot.room.rolls_per_turn,
    },
    events: [event(snapshot.room.id, `试玩开始，${player.nickname} 先行动，每回合可掷 ${snapshot.room.rolls_per_turn} 次`), ...snapshot.events],
  }
}

export function rollDemoDice(snapshot: GameSnapshot): { snapshot: GameSnapshot; dice: number } {
  const dice = Math.floor(Math.random() * 6) + 1
  const current = snapshot.players[0]
  const round = snapshot.room.current_round
  const tiles = getRoundTiles(snapshot.tiles, round)
  const landedPosition = (current.position + dice) % tiles.length
  const tile = tiles[landedPosition]
  let position = landedPosition
  let distance = current.distance + dice
  let coins = current.coins
  let skipTurns = current.skip_turns
  let nextRollModifier = current.next_roll_modifier
  let rollsRemaining = Math.max(0, snapshot.room.rolls_remaining - 1)
  let advanced = false
  let finished = false
  const addedEvents: GameEvent[] = []

  if (tile.effect_type === 'coins') coins = Math.max(0, coins + tile.effect_value)
  if (tile.effect_type === 'move') {
    position = ((position + tile.effect_value) % tiles.length + tiles.length) % tiles.length
    distance = Math.max(0, distance + tile.effect_value)
  }
  if (tile.effect_type === 'skip') skipTurns = Math.min(3, skipTurns + tile.effect_value)
  if (tile.effect_type === 'extra_roll') rollsRemaining = Math.min(6, rollsRemaining + tile.effect_value)
  if (tile.effect_type === 'lose_roll') nextRollModifier = Math.max(-4, nextRollModifier - tile.effect_value)
  if (tile.effect_type === 'advance_round' && round < 3) advanced = true
  if (tile.effect_type === 'finish' && round === 3) finished = true

  let player: Player = { ...current, position, distance, coins, skip_turns: skipTurns, next_roll_modifier: nextRollModifier }
  addedEvents.push(event(snapshot.room.id, `${player.nickname} 掷出 ${dice}，落到「${tile.name}」：${tile.detail}`))
  if (tile.effect_type === 'move') {
    addedEvents.unshift(event(snapshot.room.id, `${player.nickname} ${tile.effect_value > 0 ? '前进' : '后退'} ${Math.abs(tile.effect_value)} 格，到达第 ${position + 1} 格`))
  }

  if (!advanced && round < 3) {
    const chance = round === 1 ? snapshot.room.round1_advance_chance : snapshot.room.round2_advance_chance
    advanced = Math.random() * 100 < chance
  }

  let room = { ...snapshot.room, rolls_remaining: rollsRemaining }
  if (advanced) {
    const nextRound = (round + 1) as 2 | 3
    const nextTiles = getRoundTiles(snapshot.tiles, nextRound)
    player = { ...player, position: 0 }
    room = { ...room, current_round: nextRound, board_size: nextTiles.length }
    addedEvents.unshift(event(room.id, `队伍进入第${nextRound === 2 ? '二' : '三'}轮 ${nextTiles.length} 格棋盘`))
  }

  if (finished) {
    room = { ...room, status: 'finished', winner_id: player.user_id, current_turn: null, rolls_remaining: 0 }
    addedEvents.unshift(event(room.id, `${player.nickname} 完成最终结算，本局结束`))
  } else if (rollsRemaining <= 0) {
    if (player.skip_turns > 0) {
      player = { ...player, skip_turns: player.skip_turns - 1 }
      addedEvents.unshift(event(room.id, `${player.nickname} 跳过 1 次行动`))
    }
    const nextRolls = Math.max(1, room.rolls_per_turn + player.next_roll_modifier)
    player = { ...player, next_roll_modifier: 0 }
    room = { ...room, current_turn: player.user_id, rolls_remaining: nextRolls }
  }

  return {
    dice,
    snapshot: {
      ...snapshot,
      players: [player],
      room,
      events: [...addedEvents, ...snapshot.events],
    },
  }
}
