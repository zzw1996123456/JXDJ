import { BOARD_TILES } from './board'
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
    board_size: BOARD_TILES.length,
    target_laps: 2,
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
      { id: crypto.randomUUID(), room_id: snapshot.room.id, message: '护航推演开始：20 个权益格按老板 60%、打手 40%配置', created_at: now() },
      ...snapshot.events,
    ],
  }
}

export function rollDemoDice(snapshot: GameSnapshot): { snapshot: GameSnapshot; dice: number } {
  const dice = Math.floor(Math.random() * 6) + 1
  const current = snapshot.players[0]
  const distance = current.distance + dice
  const position = distance % BOARD_TILES.length
  const tile = BOARD_TILES[position]
  let coinChange = tile.guaranteeChange
  if (Math.floor(distance / BOARD_TILES.length) > Math.floor(current.distance / BOARD_TILES.length)) coinChange += 20

  const player = { ...current, distance, position, coins: Math.max(0, current.coins + coinChange) }
  const won = distance >= BOARD_TILES.length * snapshot.room.target_laps
  const guaranteeText = coinChange === 0 ? '' : `，保障值 +${coinChange}`
  const event: GameEvent = {
    id: crypto.randomUUID(),
    room_id: snapshot.room.id,
    message: `${player.nickname} 掷出 ${dice}，触发「${tile.name}」：${tile.detail}${guaranteeText}`,
    created_at: now(),
  }
  const winEvent: GameEvent = {
    id: crypto.randomUUID(),
    room_id: snapshot.room.id,
    message: `${player.nickname} 完成两圈护航推演，本局协议生成完毕`,
    created_at: now(),
  }

  return {
    dice,
    snapshot: {
      ...snapshot,
      players: [player],
      room: won
        ? { ...snapshot.room, status: 'finished', winner_id: player.user_id, current_turn: null }
        : snapshot.room,
      events: won ? [winEvent, event, ...snapshot.events] : [event, ...snapshot.events],
    },
  }
}
