export type PlayerRole = 'boss' | 'runner'
export type RoomStatus = 'lobby' | 'playing' | 'finished'
export type GameRound = 1 | 2 | 3

export interface Room {
  id: string
  code: string
  host_user_id: string
  status: RoomStatus
  current_turn: string | null
  winner_id: string | null
  board_size: number
  target_laps: number
  current_round: GameRound
  round1_advance_chance: number
  round2_advance_chance: number
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
  type: 'shared' | 'boss' | 'runner' | 'empty'
  detail: string
  guaranteeChange: number
}
