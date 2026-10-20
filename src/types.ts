export type PlayerRole = 'boss' | 'runner'
export type RoomStatus = 'lobby' | 'playing' | 'finished'

export interface Room {
  id: string
  code: string
  host_user_id: string
  status: RoomStatus
  current_turn: string | null
  winner_id: string | null
  board_size: number
  target_laps: number
  created_at: string
}

export interface Player {
  id: string
  room_id: string
  user_id: string
  nickname: string
  role: PlayerRole
  position: number
  distance: number
  coins: number
  is_ready: boolean
  turn_order: number
  created_at: string
}

export interface GameEvent {
  id: number | string
  room_id: string
  message: string
  created_at: string
}

export interface GameSnapshot {
  room: Room
  players: Player[]
  events: GameEvent[]
  userId: string
  isDemo: boolean
}

export interface TileDefinition {
  name: string
  shortName: string
  type: 'base' | 'normal' | 'reward' | 'risk' | 'order' | 'supply'
  detail: string
}
