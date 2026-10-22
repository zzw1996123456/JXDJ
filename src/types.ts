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
  base_guarantee_balance: number
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
  pending_route_state: PendingRouteState
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

export interface SiteImage {
  id: string
  name: string
  storage_path: string
  public_url: string
  width: number
  height: number
  byte_size: number
  mime_type: string
  created_at: string
}

export interface SiteImageSlot {
  slot: string
  image_id: string | null
  updated_at: string
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

export interface PendingRouteState {
  phase?: 'dice' | 'effect'
  original_dice?: number
  remaining_steps?: number
  direction?: 1 | -1
  path?: string[]
  primary_landing_tile_id?: string | null
  should_advance?: boolean
}

export interface GameEvent {
  id: number | string
  room_id: string
  message: string
  event_type?: 'system' | 'roll' | 'settlement_rule'
  metadata?: {
    player_id?: string
    player_name?: string
    role?: PlayerRole
    round?: number
    dice?: number
    landed_position?: number
    tile_name?: string
    tile_detail?: string
    tile_type?: TileType
    effect_type?: TileEffect
    effect_value?: number
    movement_path?: string[]
    final_position?: number
    sequence_number?: number
    request_id?: string
    operation?: 'add' | 'subtract'
    target?: 'current' | 'base' | 'auto'
    amount?: number
    current_before?: number
    base_before?: number
    current_delta?: number
    base_delta?: number
    current_after?: number
    base_after?: number
  }
  settlement_rule_id?: number | null
  created_at: string
}

export type GuaranteeRequestStatus = 'pending' | 'approved' | 'rejected'
export type GuaranteeRequestOperation = 'add' | 'subtract'
export type GuaranteeRequestTarget = 'current' | 'base' | 'auto'

export interface GuaranteeRequest {
  id: string
  room_id: string
  requester_player_id: string
  requester_user_id: string
  requester_nickname: string
  operation: GuaranteeRequestOperation
  target: GuaranteeRequestTarget
  amount: number
  status: GuaranteeRequestStatus
  current_guarantee_before: number
  base_guarantee_before: number
  current_guarantee_delta: number
  base_guarantee_delta: number
  current_guarantee_after: number
  base_guarantee_after: number
  reviewer_user_id: string | null
  reviewed_at: string | null
  review_note: string | null
  created_at: string
}

export interface DiceRequest {
  id: string
  room_id: string
  requester_player_id: string
  requester_user_id: string
  requester_nickname: string
  target_player_id: string
  target_player_nickname: string
  operation: 'add' | 'subtract'
  amount: number
  status: GuaranteeRequestStatus
  dice_before: number
  dice_delta: number
  dice_after: number
  reviewer_user_id: string | null
  reviewed_at: string | null
  review_note: string | null
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
  guaranteeRequests: GuaranteeRequest[]
  diceRequests: DiceRequest[]
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
