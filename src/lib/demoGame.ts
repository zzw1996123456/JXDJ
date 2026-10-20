import { getRoundTiles } from './board'
import type { GameEvent, GameSnapshot, Player, PlayerRole, Room } from '../types'

const DEMO_USER_ID = 'demo-player'

function now() {
  return new Date().toISOString()
}

export function createDemoRoom(nickname: string, role: PlayerRole): GameSnapshot {
  const room: Room = {
    id: 'demo-room',
    code: 'DEMO88',
    host_user_id: DEMO_USER_ID,
    status: 'lobby',
    current_turn: null,
    winner_id: null,
    board_size: 8,
    target_laps: 3,
    current_round: 1,
    round1_advance_chance: 35,
    round2_advance_chance: 30,
    created_at: now(),
  }

  const player: Player = {
    id: 'demo-player-record',
    room_id: room.id,
    user_id: DEMO_USER_ID,
    nickname,
    role,
    position: 0,
    distance: 0,
    coins: 100,
    is_ready: true,
    turn_order: 0,
    created_at: now(),
  }

  return {
    room,
    players: [player],
    events: [{ id: 'welcome', room_id: room.id, message: `${nickname} 创建了护航协议试玩房，基础保障 100`, created_at: now() }],
    userId: DEMO_USER_ID,
    isDemo: true,
  }
}

export function startDemoGame(snapshot: GameSnapshot): GameSnapshot {
  const player = snapshot.players[0]
  return {
    ...snapshot,
    room: { ...snapshot.room, status: 'playing', current_turn: player.user_id },
    events: [
      { id: crypto.randomUUID(), room_id: snapshot.room.id, message: '护航推演开始，当前为第一轮 8 格棋盘', created_at: now() },
      ...snapshot.events,
    ],
  }
}

export function rollDemoDice(snapshot: GameSnapshot): { snapshot: GameSnapshot; dice: number } {
  const dice = Math.floor(Math.random() * 6) + 1
  const current = snapshot.players[0]
  const round = snapshot.room.current_round
  const tiles = getRoundTiles(round)
  const distance = current.distance + dice
  const position = (current.position + dice) % tiles.length
  const tile = tiles[position]
  const coinChange = tile.guaranteeChange

  let player = { ...current, distance, position, coins: Math.max(0, current.coins + coinChange) }
  const guaranteeText = coinChange === 0 ? '' : `，保障值 +${coinChange}`
  const event: GameEvent = {
    id: crypto.randomUUID(),
    room_id: snapshot.room.id,
    message: `${player.nickname} 掷出 ${dice}，触发「${tile.name}」：${tile.detail}${guaranteeText}`,
    created_at: now(),
  }
  const chance = round === 1 ? snapshot.room.round1_advance_chance : snapshot.room.round2_advance_chance
  const advanced = round < 3 && Math.random() * 100 < chance
  const finished = round === 3 && position === tiles.length - 1
  let room = snapshot.room
  let events = [event, ...snapshot.events]

  if (advanced) {
    const nextRound = (round + 1) as 2 | 3
    const nextTiles = getRoundTiles(nextRound)
    player = { ...player, position: 0 }
    room = { ...room, current_round: nextRound, board_size: nextTiles.length }
    events = [{
      id: crypto.randomUUID(),
      room_id: snapshot.room.id,
      message: `晋级判定成功，进入第${nextRound === 2 ? '二' : '三'}轮 ${nextTiles.length} 格棋盘`,
      created_at: now(),
    }, ...events]
  } else if (finished) {
    room = { ...room, status: 'finished', winner_id: player.user_id, current_turn: null }
    events = [{
      id: crypto.randomUUID(),
      room_id: snapshot.room.id,
      message: `${player.nickname} 摇到协议结算格，本局结束`,
      created_at: now(),
    }, ...events]
  }

  return {
    dice,
    snapshot: {
      ...snapshot,
      players: [player],
      room,
      events,
    },
  }
}
