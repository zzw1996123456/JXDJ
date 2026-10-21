export type PlayerRole = 'boss' | 'runner'
export type RoomStatus = 'lobby' | 'playing' | 'finished'
export type GameRound = number
export type TileType = 'start' | 'shared' | 'boss' | 'runner' | 'empty' | 'move' | 'chance'
export type GuaranteeEffect = 'guarantee_add' | 'guarantee_subtract' | 'guarantee_multiply' | 'guarantee_divide'
export type TileEffect = 'none' | GuaranteeEffect | 'move' | 'skip' | 'extra_roll' | 'lose_roll' | 'advance_chance' | 'advance_round' | 'finish'

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
  base_guarantee: number
  total_rounds: number
  round1_board_size: number
  round2_board_size: number
  round3_board_size: number
  round_board_sizes: number[]
  round_advance_chances: number[]
  imported_config: boolean
  pending_dice: number | null
  pending_player_id: string | null
  pending_route_options: RouteOption[]
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
  tile_color: string | null
  is_randomized: boolean
  grid_x: number | null
  grid_y: number | null
  layout_x: number | null
  layout_y: number | null
  image_id: string | null
  image_url: string | null
  created_at: string
}

export interface RoomTileImage {
  id: string
  room_id: string | null
  name: string
  storage_path: string
  public_url: string
  width: number
  height: number
  byte_size: number
  mime_type: string
  created_at: string
}

export interface RoomTileEdge {
  id: string
  room_id: string
  round_number: GameRound
  from_tile_id: string
  to_tile_id: string
  is_bidirectional: boolean
  created_at: string
}

export interface RouteOption {
  tile_id: string
  position: number
  path: string[]
}

export interface GameEvent {
  id: number | string
  room_id: string
  message: string
  event_type?: 'system' | 'roll' | 'settlement_rule'
  metadata?: {
    player_name?: string
    role?: PlayerRole
    round?: number
    dice?: number
    tile_name?: string
    tile_detail?: string
    tile_type?: TileType
    effect_type?: TileEffect
    effect_value?: number
    sequence_number?: number
  }
  settlement_rule_id?: number | null
  created_at: string
}

export interface SettlementRule {
  id: number
  room_id: string
  sequence_number: number
  base_text: string
  suffix: string
  created_at: string
}

export interface GameSnapshot {
  room: Room
  players: Player[]
  events: GameEvent[]
  tiles: RoomTile[]
  edges: RoomTileEdge[]
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
