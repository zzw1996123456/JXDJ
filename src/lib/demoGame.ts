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
    coins: 500,
    is_ready: true,
    turn_order: 0,
    created_at: now(),
  }

  return {
    room,
    players: [player],
    events: [{ id: 'welcome', room_id: room.id, message: `${nickname} 创建了本机试玩房`, created_at: now() }],
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
      { id: crypto.randomUUID(), room_id: snapshot.room.id, message: '行动开始，率先完成 2 圈即可获胜', created_at: now() },
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
  let coinChange = 0

  if (tile.type === 'supply') coinChange = 80
  if (tile.type === 'reward') coinChange = 100
  if (tile.type === 'order') coinChange = 120
  if (tile.type === 'risk') coinChange = -60
  if (Math.floor(distance / BOARD_TILES.length) > Math.floor(current.distance / BOARD_TILES.length)) coinChange += 200

  const player = { ...current, distance, position, coins: Math.max(0, current.coins + coinChange) }
  const won = distance >= BOARD_TILES.length * snapshot.room.target_laps
  const moneyText = coinChange === 0 ? '' : `，金币 ${coinChange > 0 ? '+' : ''}${coinChange}`
  const event: GameEvent = {
    id: crypto.randomUUID(),
    room_id: snapshot.room.id,
    message: `${player.nickname} 掷出 ${dice}，抵达${tile.name}${moneyText}`,
    created_at: now(),
  }
  const winEvent: GameEvent = {
    id: crypto.randomUUID(),
    room_id: snapshot.room.id,
    message: `${player.nickname} 完成行动，获得本局第一名`,
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
