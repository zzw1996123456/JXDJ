export type PlayerRole = 'boss' | 'runner'
export type RoomStatus = 'lobby' | 'playing' | 'finished'
export type GameRound = 1 | 2 | 3
export type TileType = 'shared' | 'boss' | 'runner' | 'empty' | 'move' | 'chance'
export type TileEffect = 'none' | 'coins' | 'move' | 'skip' | 'extra_roll' | 'lose_roll' | 'advance_chance' | 'advance_round' | 'finish'

export interface Room {
  id: string
  name: string
  code: string
  host_user_id: string
  status: RoomStatus
  is_paused: boolean
  current_turn: string | null
  winner_id: string | null
  board_size: number
  target_laps: number
  current_round: GameRound
  round1_advance_chance: number
  round2_advance_chance: number
  starting_player_id: string | null
  rolls_per_turn: number
  rolls_remaining: number
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
  skip_turns: number
  next_roll_modifier: number
  dice_count: number
  round_roll_count: number
  created_at: string
}

export interface RoomTile {
  id: string
  room_id: string
  template_id: number | null
  round_number: GameRound
  position: number
  name: string
  short_name: string
  tile_type: TileType
  detail: string
  effect_type: TileEffect
  effect_value: number
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
  tiles: RoomTile[]
  userId: string
  isDemo: boolean
}

export interface TileDefinition {
  name: string
  short_name: string
  tile_type: TileType
  detail: string
  effect_type: TileEffect
  effect_value: number
  group: 'empty' | 'contract' | 'movement' | 'turn' | 'dice' | 'advance_chance' | 'advance' | 'finish'
}
