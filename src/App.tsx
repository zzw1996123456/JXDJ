import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Cropper, { type Area } from 'react-easy-crop'
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Move,
  Check,
  Clipboard,
  Crosshair,
  Crown,
  Dice5,
  Download,
  Images,
  Flag,
  LoaderCircle,
  LockKeyhole,
  LogIn,
  LogOut,
  Minus,
  Pause,
  Play,
  Plus,
  Radio,
  Route,
  RotateCcw,
  Save,
  Settings2,
  Shield,
  Shuffle,
  SlidersHorizontal,
  SquarePen,
  Sparkles,
  Swords,
  Trash2,
  Upload,
  UserPlus,
  Users,
  Wifi,
  WifiOff,
  X,
  ZoomIn,
  ZoomOut,
  Maximize2,
} from 'lucide-react'
import {
  BOARD_LAYOUT_PRESETS,
  BOARD_TILE_HEIGHT,
  BOARD_TILE_WIDTH,
  createBoardLayout,
  EFFECT_LABELS,
  getRoomBoardBounds,
  getRoomTileCanvasPosition,
  gridPointToCanvas,
  getRoundTiles,
  PLAYER_COLORS,
  TILE_TYPE_LABELS,
} from './lib/board'
import type { BoardCanvasPoint, BoardLayoutPresetId } from './lib/board'
import { cropTileImage, TILE_IMAGE_ASPECT, TILE_IMAGE_MAX_SOURCE_BYTES } from './lib/tileImages'
import { createDemoRoom, rollDemoDice, startDemoGame } from './lib/demoGame'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import type {
  GameEvent,
  GameRound,
  GameSnapshot,
  GuaranteeEffect,
  Player,
  PlayerRole,
  Room,
  RoomTile,
  RoomTileEdge,
  RoomTileImage,
  RouteOption,
  SettlementRule,
  TileEffect,
  TileType,
} from './types'

const ACTIVE_ROOM_KEY = 'delta-monopoly-active-room'
const NICKNAME_KEY = 'delta-monopoly-nickname'
const LAST_ROOM_CODE_KEY = 'delta-monopoly-last-room-code'
const MAX_PLAYERS = 3
const MAX_ROUNDS = 10
const MIN_BOARD_SIZE = 2
const MAX_BOARD_SIZE = 100
const DEFAULT_ROUND_SIZES = [8, 12, 24, 24, 24, 24, 24, 24, 24, 24]
const DEFAULT_ADVANCE_CHANCES = [35, 30, 30, 30, 30, 30, 30, 30, 30]
const NO_PLAYERS: Player[] = []
const TILE_TYPES = Object.keys(TILE_TYPE_LABELS) as TileType[]
const TILE_EFFECTS = Object.keys(EFFECT_LABELS) as TileEffect[]
const GUARANTEE_EFFECTS: GuaranteeEffect[] = ['guarantee_add', 'guarantee_subtract', 'guarantee_multiply', 'guarantee_divide']
const ROOM_CONFIG_FORMAT = 'jingxu-delta-monopoly-room'
const ROOM_CONFIG_VERSION = 5
const MIN_BOARD_ZOOM = 0.1
const MAX_BOARD_ZOOM = 2
const BOARD_VIEW_PADDING = 12

interface RoomConfigFile {
  format: typeof ROOM_CONFIG_FORMAT
  version: typeof ROOM_CONFIG_VERSION
  exported_at: string
  settings: {
    name: string
    round1_advance_chance: number
    round2_advance_chance: number
    rolls_per_turn: number
    base_guarantee: number
    total_rounds: number
    round_sizes: number[]
    round_advance_chances: number[]
  }
  tiles: Array<Pick<RoomTile, 'round_number' | 'position' | 'name' | 'short_name' | 'tile_type' | 'detail' | 'effect_type' | 'effect_value' | 'tile_color' | 'is_randomized' | 'grid_x' | 'grid_y' | 'layout_x' | 'layout_y'>>
  edges: Array<{
    round_number: GameRound
    from_position: number
    to_position: number
    is_bidirectional: boolean
  }>
}

function roundLabel(round: GameRound) {
  return `第 ${round} 轮`
}

function roomRoundSizes(room: Room) {
  if (Array.isArray(room.round_board_sizes) && room.round_board_sizes.length === MAX_ROUNDS) {
    return room.round_board_sizes.map(Number)
  }
  return [room.round1_board_size ?? 8, room.round2_board_size ?? 12, room.round3_board_size ?? 24, ...DEFAULT_ROUND_SIZES.slice(3)]
}

function roomAdvanceChances(room: Room) {
  if (Array.isArray(room.round_advance_chances) && room.round_advance_chances.length === MAX_ROUNDS - 1) {
    return room.round_advance_chances.map(Number)
  }
  return [room.round1_advance_chance ?? 35, room.round2_advance_chance ?? 30, ...DEFAULT_ADVANCE_CHANCES.slice(2)]
}

function roundBoardSize(room: Room, round: GameRound) {
  return roomRoundSizes(room)[round - 1] ?? DEFAULT_ROUND_SIZES[round - 1] ?? 24
}

function roomBoardSizeSummary(room: Room) {
  const sizes = roomRoundSizes(room).slice(0, room.total_rounds ?? 3)
  if (sizes.length <= 4) return `${sizes.join(' → ')} 格`
  const minimum = Math.min(...sizes)
  const maximum = Math.max(...sizes)
  return minimum === maximum ? `每轮 ${minimum} 格` : `每轮 ${minimum}–${maximum} 格`
}

function tileColorStyle(tile: RoomTile): React.CSSProperties {
  if (!tile.tile_color) return {}
  const value = tile.tile_color.replace('#', '')
  const red = Number.parseInt(value.slice(0, 2), 16)
  const green = Number.parseInt(value.slice(2, 4), 16)
  const blue = Number.parseInt(value.slice(4, 6), 16)
  const light = (red * 299 + green * 587 + blue * 114) / 1000 > 145
  return {
    backgroundColor: tile.tile_color,
    borderTopColor: light ? '#11140f' : '#f4f6ef',
    color: light ? '#11140f' : '#f4f6ef',
    '--tile-detail-color': light ? '#30362d' : '#e3e8dc',
    '--tile-meta-color': light ? '#42493f' : '#d4dacd',
  } as React.CSSProperties
}

function safeFilename(value: string) {
  const cleaned = value.trim().replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, '_')
  return cleaned || '趣味房间'
}

function downloadTextFile(filename: string, content: string, type: string, withBom = false) {
  const blob = new Blob([withBom ? '\uFEFF' : '', content], { type })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

function isGuaranteeEffect(effect: TileEffect): effect is GuaranteeEffect {
  return GUARANTEE_EFFECTS.includes(effect as GuaranteeEffect)
}

function guaranteePresetLabel(effect: GuaranteeEffect, value: number) {
  if (effect === 'guarantee_add') return `增加 ${value} 万`
  if (effect === 'guarantee_subtract') return `减少 ${value} 万`
  if (effect === 'guarantee_multiply') return `乘以 ${value}（结果四舍五入取整）`
  return value === 0 ? '除数为 0，按 0 万结算' : `除以 ${value}（结果四舍五入取整）`
}

function applyGuaranteePreset(tile: RoomTile, effect: GuaranteeEffect, value: number): RoomTile {
  const names: Record<GuaranteeEffect, string> = {
    guarantee_add: '保底加注',
    guarantee_subtract: '保底扣减',
    guarantee_multiply: '保底倍增',
    guarantee_divide: '保底折算',
  }
  const symbols: Record<GuaranteeEffect, string> = {
    guarantee_add: `+${value}万`,
    guarantee_subtract: `-${value}万`,
    guarantee_multiply: `×${value}`,
    guarantee_divide: `÷${value}`,
  }
  return {
    ...tile,
    name: names[effect],
    short_name: `保底 ${symbols[effect]}`,
    detail: `老板当前保底${guaranteePresetLabel(effect, value)}`,
    effect_type: effect,
    effect_value: value,
  }
}

function effectValueHint(effect: TileEffect, _round: GameRound) {
  if (effect === 'move') return '正数前进、负数后退，最多 5 格'
  if (effect === 'skip') return '暂停次数，最多 2 次'
  if (effect === 'extra_roll' || effect === 'lose_roll') return '掷骰次数，允许 1–2 次'
  if (effect === 'advance_chance' || effect === 'advance_round') return '只允许第一轮和第二轮使用；是否落到本格由本轮晋级概率控制'
  if (effect === 'finish') return '只允许最终轮使用'
  return '此效果不需要填写数值'
}

function availableEffects(round: GameRound, finalRound: GameRound) {
  return TILE_EFFECTS.filter((effect) => round === finalRound
    ? effect !== 'advance_chance' && effect !== 'advance_round'
    : effect !== 'finish')
}

function formatError(error: unknown) {
  if (error instanceof Error) return error.message
  if (typeof error === 'object' && error && 'message' in error) return String(error.message)
  return '操作失败，请稍后重试'
}

function roomStatusLabel(room: Room) {
  if (room.is_paused) return '已暂停'
  if (room.status === 'lobby') return '等待玩家'
  if (room.status === 'playing') return '进行中'
  return '已结束'
}

async function ensureOnlineUser() {
  if (!supabase) throw new Error('尚未配置 Supabase')
  const { data: sessionData } = await supabase.auth.getSession()
  if (sessionData.session?.user) return sessionData.session.user

  const { data, error } = await supabase.auth.signInAnonymously()
  if (error) throw error
  if (!data.user) throw new Error('无法建立匿名身份')
  return data.user
}

async function fetchSnapshot(roomId: string, userId: string): Promise<GameSnapshot> {
  if (!supabase) throw new Error('尚未配置 Supabase')
  const [roomResult, playersResult, eventsResult, tilesResult, edgesResult] = await Promise.all([
    supabase.from('rooms').select('*').eq('id', roomId).single(),
    supabase.from('room_players').select('*').eq('room_id', roomId).order('turn_order'),
    supabase.from('game_events').select('*').eq('room_id', roomId).order('created_at', { ascending: false }).limit(40),
    supabase.from('room_tiles').select('*').eq('room_id', roomId).order('round_number').order('position'),
    supabase.from('room_tile_edges').select('*').eq('room_id', roomId).order('created_at'),
  ])

  if (roomResult.error) throw roomResult.error
  if (playersResult.error) throw playersResult.error
  if (eventsResult.error) throw eventsResult.error
  if (tilesResult.error) throw tilesResult.error
  if (edgesResult.error) throw edgesResult.error

  return {
    room: roomResult.data as Room,
    players: playersResult.data as Player[],
    events: eventsResult.data as GameEvent[],
    tiles: tilesResult.data as RoomTile[],
    edges: edgesResult.data as RoomTileEdge[],
    userId,
    isDemo: false,
  }
}

function Logo() {
  return (
    <div className="brand" aria-label="景序电竞三角洲趣味">
      <span className="brand-mark" aria-hidden="true">
        <span />
      </span>
      <span className="brand-copy">
        <strong>景序电竞三角洲趣味</strong>
        <small>JINGXU ESPORTS</small>
      </span>
    </div>
  )
}

function StatusPill({ online }: { online: boolean }) {
  return (
    <span className={`status-pill ${online ? 'online' : 'offline'}`}>
      {online ? <Wifi size={14} /> : <WifiOff size={14} />}
      {online ? '在线房间' : '本机试玩'}
    </span>
  )
}

function ModeHub({ onSelect }: { onSelect: () => void }) {
  return (
    <div className="portal-page">
      <header className="portal-header">
        <Logo />
        <span className="portal-channel"><Sparkles size={15} /> 趣味大厅</span>
      </header>

      <main className="mode-hub">
        <section className="mode-intro">
          <p className="eyebrow"><Radio size={14} /> 景序电竞 · 三角洲行动</p>
          <h1>选择你的<br /><span>趣味行动。</span></h1>
          <p>每一种玩法都是独立趣味单。管理员创建房间后，玩家凭房间码加入。</p>
        </section>

        <section className="mode-catalog" aria-labelledby="mode-title">
          <div className="catalog-heading">
            <div>
              <p className="kicker">FUN MISSIONS</p>
              <h2 id="mode-title">趣味单库</h2>
            </div>
            <span>01 个可用</span>
          </div>

          <div className="mode-grid">
            <button className="mode-card featured" onClick={onSelect} type="button">
              <span className="mode-status live"><Radio size={13} /> 可在线组队</span>
              <span className="mode-preview monopoly-preview" aria-hidden="true">
                {Array.from({ length: 16 }, (_, index) => <i key={index} />)}
                <b><Dice5 size={34} /></b>
              </span>
              <span className="mode-card-copy">
                <small>趣味单 01</small>
                <strong>护航大富翁</strong>
                <span>每个房间自动生成不同棋盘，可配置最多十轮移动、暂停与护航条款。</span>
              </span>
              <span className="mode-card-footer">
                <span>1–10 轮棋盘 · 最多 3 人</span>
                <span className="enter-mode">进入 <ArrowRight size={17} /></span>
              </span>
            </button>

            <article className="mode-card upcoming">
              <span className="mode-status">筹备中</span>
              <span className="upcoming-icon" aria-hidden="true"><Crosshair size={30} /></span>
              <span className="mode-card-copy">
                <small>趣味单 02</small>
                <strong>武器轮盘</strong>
                <span>随机武器与限制条件组成每一轮挑战。</span>
              </span>
            </article>

            <article className="mode-card upcoming">
              <span className="mode-status">筹备中</span>
              <span className="upcoming-icon route-icon" aria-hidden="true"><Route size={30} /></span>
              <span className="mode-card-copy">
                <small>趣味单 03</small>
                <strong>撤离挑战</strong>
                <span>用特殊路线与撤离条件完成小队行动。</span>
              </span>
            </article>
          </div>
        </section>
      </main>
    </div>
  )
}

function MonopolyEntry({
  busy,
  onJoin,
  onDemo,
  onAdmin,
  onBack,
}: {
  busy: boolean
  onJoin: (nickname: string, role: PlayerRole, code: string) => void
  onDemo: (nickname: string, role: PlayerRole) => void
  onAdmin: () => void
  onBack: () => void
}) {
  const [nickname, setNickname] = useState(() => localStorage.getItem(NICKNAME_KEY) ?? '')
  const [role, setRole] = useState<PlayerRole>('runner')
  const [code, setCode] = useState(() => localStorage.getItem(LAST_ROOM_CODE_KEY) ?? '')
  const [formError, setFormError] = useState('')

  function validate() {
    const name = nickname.trim()
    if (name.length < 2 || name.length > 12) {
      setFormError('昵称需要 2–12 个字符')
      return null
    }
    localStorage.setItem(NICKNAME_KEY, name)
    setFormError('')
    return name
  }

  function join() {
    const name = validate()
    if (!name) return
    const cleanCode = code.trim().toUpperCase()
    if (!/^[A-Z0-9]{6}$/.test(cleanCode)) {
      setFormError('请输入 6 位房间码')
      return
    }
    onJoin(name, role, cleanCode)
  }

  function demo() {
    const name = validate()
    if (name) onDemo(name, role)
  }

  return (
    <div className="entry-page">
      <header className="portal-header">
        <Logo />
        <button className="back-link" onClick={onBack} type="button"><ArrowLeft size={17} /> 趣味大厅</button>
      </header>
      <main className="home-shell">
        <section className="hero-copy">
          <p className="eyebrow"><Dice5 size={14} /> 趣味单 01 · 大富翁</p>
          <h1>大富翁<br /><span>护航协议局。</span></h1>
          <p className="hero-subtitle">多轮随机棋盘逐步扩张，每个房间都有不同的移动、回合和护航规则。</p>
          <div className="mission-stats" aria-label="游戏规则概览">
            <span><strong>3</strong> 轮推演</span>
            <span><strong>8/12/24</strong> 格棋盘</span>
            <span><strong>3</strong> 人上限</span>
          </div>
        </section>

        <section className="entry-panel" aria-labelledby="entry-title">
        <div className="panel-heading">
          <div>
            <p className="kicker">新行动</p>
            <h2 id="entry-title">加入在线房间</h2>
          </div>
          <StatusPill online={isSupabaseConfigured} />
        </div>

        <label className="field">
          <span>行动代号</span>
          <input
            autoComplete="nickname"
            maxLength={12}
            onChange={(event) => setNickname(event.target.value)}
            placeholder="输入你的昵称"
            value={nickname}
          />
        </label>

        <fieldset className="role-field">
          <legend>首次加入身份</legend>
          <div className="segmented">
            <button className={role === 'runner' ? 'active' : ''} onClick={() => setRole('runner')} type="button">
              <Swords size={17} /> 打手
            </button>
            <button className={role === 'boss' ? 'active' : ''} onClick={() => setRole('boss')} type="button">
              <Crown size={17} /> 老板
            </button>
          </div>
          <p className="role-help">加入后可在开局前修改行动代号和身份。</p>
        </fieldset>

        {formError && <p className="form-error" role="alert">{formError}</p>}

        <div className="join-row">
          <input
            aria-label="房间码"
            maxLength={6}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            placeholder="6 位房间码"
            value={code}
          />
          <button className="button primary" disabled={busy || !isSupabaseConfigured} onClick={join} type="button">
            <LogIn size={18} /> 加入
          </button>
        </div>

        <p className="config-note">退出或关闭网页不会清除席位，使用同一房间码和原行动代号即可继续。</p>

        <div className="divider"><span>或</span></div>
        <button className="button ghost full" disabled={busy} onClick={demo} type="button">
          <Dice5 size={18} /> 本机试玩
        </button>
        <button className="button admin-entry full" disabled={busy || !isSupabaseConfigured} onClick={onAdmin} type="button">
          <LockKeyhole size={17} /> 管理员入口
        </button>

        {!isSupabaseConfigured && (
          <p className="config-note">在线功能尚未配置，部署教程见项目 README。</p>
        )}
        </section>
      </main>
    </div>
  )
}

function PlayerAvatar({ player, index }: { player: Player; index: number }) {
  return (
    <span className="player-avatar" style={{ '--player-color': PLAYER_COLORS[index % PLAYER_COLORS.length] } as React.CSSProperties}>
      {player.nickname.slice(0, 1).toUpperCase()}
    </span>
  )
}

function RoomHeader({ snapshot }: { snapshot: GameSnapshot }) {
  const [copied, setCopied] = useState(false)

  async function copyCode() {
    await navigator.clipboard.writeText(snapshot.room.code)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  return (
    <header className="room-header">
      <Logo />
      <div className="room-actions">
        <StatusPill online={!snapshot.isDemo} />
        <button className="room-code" onClick={copyCode} title="复制房间码" type="button">
          <span title={snapshot.room.name}>{snapshot.room.name}</span>
          <strong>{snapshot.room.code}</strong>
          {copied ? <Check size={16} /> : <Clipboard size={16} />}
          {copied && <small className="copy-confirmation">已复制</small>}
        </button>
      </div>
    </header>
  )
}

function AdminPanel({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authorized, setAuthorized] = useState(false)
  const [checking, setChecking] = useState(true)
  const [busy, setBusy] = useState(false)
  const [creating, setCreating] = useState(false)
  const [codeCopied, setCodeCopied] = useState(false)
  const [cacheCleared, setCacheCleared] = useState(false)
  const [error, setError] = useState('')
  const [rooms, setRooms] = useState<Room[]>([])
  const [newRoomName, setNewRoomName] = useState('')
  const [players, setPlayers] = useState<Player[]>([])
  const [events, setEvents] = useState<GameEvent[]>([])
  const [settlementRules, setSettlementRules] = useState<SettlementRule[]>([])
  const [roomTiles, setRoomTiles] = useState<RoomTile[]>([])
  const [roomEdges, setRoomEdges] = useState<RoomTileEdge[]>([])
  const [tileImages, setTileImages] = useState<RoomTileImage[]>([])
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null)
  const [roomPendingDelete, setRoomPendingDelete] = useState<string | null>(null)
  const [advanceChances, setAdvanceChances] = useState<string[]>(DEFAULT_ADVANCE_CHANCES.map(String))
  const [startingPlayerId, setStartingPlayerId] = useState('')
  const [rollsPerTurn, setRollsPerTurn] = useState('1')
  const [baseGuarantee, setBaseGuarantee] = useState('100')
  const [totalRounds, setTotalRounds] = useState(3)
  const [roundSizes, setRoundSizes] = useState<number[]>(DEFAULT_ROUND_SIZES)
  const [editorRound, setEditorRound] = useState<GameRound>(1)
  const [selectedTileId, setSelectedTileId] = useState<string | null>(null)
  const [tileDraft, setTileDraft] = useState<RoomTile | null>(null)
  const [edgeTargetId, setEdgeTargetId] = useState('')
  const [edgeBidirectional, setEdgeBidirectional] = useState(false)
  const [diceDrafts, setDiceDrafts] = useState<Record<string, string>>({})
  const [guaranteeDrafts, setGuaranteeDrafts] = useState<Record<string, string>>({})
  const [suffixDrafts, setSuffixDrafts] = useState<Record<number, string>>({})
  const [configNotice, setConfigNotice] = useState('')
  const configInputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const [cropSource, setCropSource] = useState<{ url: string; name: string } | null>(null)
  const tileRefreshTimerRef = useRef<number | null>(null)
  const pendingTileMovesRef = useRef(new Map<string, { x: number; y: number; revision: number }>())
  const tileMoveQueueRef = useRef(new Map<string, Promise<void>>())
  const tileMoveRevisionRef = useRef(0)
  const layoutUndoRef = useRef(new Map<GameRound, BoardCanvasPoint[]>())

  const selectedRoom = rooms.find((room) => room.id === selectedRoomId) ?? null
  const selectedPlayers = players.filter((player) => player.room_id === selectedRoomId)
  const selectedEvents = events.filter((event) => event.room_id === selectedRoomId)
  const selectedSettlementRules = settlementRules
    .filter((rule) => rule.room_id === selectedRoomId)
    .sort((left, right) => left.sequence_number - right.sequence_number)
  const selectedRoundTiles = roomTiles
    .filter((tile) => tile.room_id === selectedRoomId && tile.round_number === editorRound)
    .sort((a, b) => a.position - b.position)
  const selectedRoundEdges = roomEdges.filter((edge) => edge.round_number === editorRound)
  const selectedBosses = selectedPlayers.filter((player) => player.role === 'boss').length
  const selectedRunners = selectedPlayers.filter((player) => player.role === 'runner').length
  const canStart = selectedRoom?.status === 'lobby'
    && selectedPlayers.length >= 2
    && selectedPlayers.length <= 3
    && selectedBosses === 1
    && selectedRunners >= 1
    && selectedRunners <= 2
    && selectedPlayers.every((player) => player.is_ready)

  const loadRoomTiles = useCallback(async (roomId: string) => {
    if (!supabase) return
    const { data, error: tilesError } = await supabase
      .from('room_tiles')
      .select('*')
      .eq('room_id', roomId)
      .order('round_number')
      .order('position')
    if (tilesError) throw tilesError
    setRoomTiles((data as RoomTile[]).map((tile) => {
      const pending = pendingTileMovesRef.current.get(tile.id)
      return pending ? { ...tile, layout_x: pending.x, layout_y: pending.y } : tile
    }))
  }, [])

  const loadTileImages = useCallback(async () => {
    if (!supabase) return
    const { data, error: imagesError } = await supabase
      .from('room_tile_images')
      .select('*')
      .order('created_at', { ascending: false })
    if (imagesError) throw imagesError
    setTileImages(data as RoomTileImage[])
  }, [])

  const loadRoomEdges = useCallback(async (roomId: string) => {
    if (!supabase) return
    const { error: ensureError } = await supabase.rpc('admin_ensure_room_edges', { p_room_id: roomId })
    if (ensureError) throw ensureError
    const { data, error: edgesError } = await supabase
      .from('room_tile_edges')
      .select('*')
      .eq('room_id', roomId)
      .order('created_at')
    if (edgesError) throw edgesError
    setRoomEdges(data as RoomTileEdge[])
  }, [])

  const loadRoomEvents = useCallback(async (roomId: string) => {
    if (!supabase) return
    const pageSize = 1000
    const allEvents: GameEvent[] = []

    for (let from = 0; ; from += pageSize) {
      const { data, error: eventsError } = await supabase
        .from('game_events')
        .select('*')
        .eq('room_id', roomId)
        .order('created_at', { ascending: false })
        .range(from, from + pageSize - 1)
      if (eventsError) throw eventsError

      const batch = data as GameEvent[]
      allEvents.push(...batch)
      if (batch.length < pageSize) break
    }

    setEvents(allEvents)
  }, [])

  const loadSettlementRules = useCallback(async (roomId: string) => {
    if (!supabase) return
    const { data, error: rulesError } = await supabase
      .from('room_settlement_rules')
      .select('*')
      .eq('room_id', roomId)
      .order('sequence_number')
    if (rulesError) throw rulesError
    setSettlementRules(data as SettlementRule[])
  }, [])

  const loadDashboard = useCallback(async () => {
    if (!supabase) return
    const [roomsResult, playersResult] = await Promise.all([
      supabase.from('rooms').select('*').order('created_at', { ascending: false }),
      supabase.from('room_players').select('*').order('turn_order'),
    ])
    if (roomsResult.error) throw roomsResult.error
    if (playersResult.error) throw playersResult.error

    const nextRooms = roomsResult.data as Room[]
    setRooms(nextRooms)
    setPlayers(playersResult.data as Player[])
    setSelectedRoomId((current) => current && nextRooms.some((room) => room.id === current) ? current : nextRooms[0]?.id ?? null)
  }, [])

  useEffect(() => {
    async function checkSession() {
      if (!supabase) {
        setChecking(false)
        return
      }
      const { data } = await supabase.auth.getSession()
      if (!data.session) {
        setChecking(false)
        return
      }
      const { data: isAdmin, error: adminError } = await supabase.rpc('is_admin')
      if (!adminError && isAdmin === true) {
        setAuthorized(true)
        try {
          await loadDashboard()
        } catch (loadError) {
          setError(formatError(loadError))
        }
      }
      setChecking(false)
    }
    void checkSession()
  }, [loadDashboard])

  useEffect(() => {
    if (!authorized || !supabase) return
    const client = supabase
    const channel = client
      .channel('admin-dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms' }, () => void loadDashboard())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'room_players' }, () => void loadDashboard())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game_events' }, () => {
        if (selectedRoomId) void loadRoomEvents(selectedRoomId)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'room_tiles' }, () => {
        if (!selectedRoomId) return
        if (tileRefreshTimerRef.current !== null) window.clearTimeout(tileRefreshTimerRef.current)
        tileRefreshTimerRef.current = window.setTimeout(() => {
          tileRefreshTimerRef.current = null
          void loadRoomTiles(selectedRoomId)
        }, 150)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'room_tile_edges' }, () => {
        if (selectedRoomId) void loadRoomEdges(selectedRoomId)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'room_tile_images' }, () => {
        void loadTileImages()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'room_settlement_rules' }, () => {
        if (selectedRoomId) void loadSettlementRules(selectedRoomId)
      })
      .subscribe()

    return () => {
      if (tileRefreshTimerRef.current !== null) {
        window.clearTimeout(tileRefreshTimerRef.current)
        tileRefreshTimerRef.current = null
      }
      void client.removeChannel(channel)
    }
  }, [authorized, loadDashboard, loadRoomEdges, loadRoomEvents, loadRoomTiles, loadSettlementRules, loadTileImages, selectedRoomId])

  useEffect(() => {
    if (!authorized) return
    if (!selectedRoomId) {
      setEvents([])
      setSettlementRules([])
      setRoomTiles([])
      setRoomEdges([])
      return
    }
    void Promise.all([loadRoomEvents(selectedRoomId), loadRoomTiles(selectedRoomId), loadRoomEdges(selectedRoomId), loadTileImages(), loadSettlementRules(selectedRoomId)])
      .catch((loadError) => setError(formatError(loadError)))
  }, [authorized, loadRoomEdges, loadRoomEvents, loadRoomTiles, loadSettlementRules, loadTileImages, selectedRoomId])

  useEffect(() => {
    if (!selectedRoom) return
    setAdvanceChances(roomAdvanceChances(selectedRoom).map(String))
    setStartingPlayerId(selectedRoom.starting_player_id ?? '')
    setRollsPerTurn(String(selectedRoom.rolls_per_turn))
    setBaseGuarantee(String(selectedRoom.base_guarantee ?? 100))
    setTotalRounds(selectedRoom.total_rounds ?? 3)
    setRoundSizes(roomRoundSizes(selectedRoom))
    if (editorRound > (selectedRoom.total_rounds ?? 3)) setEditorRound(1)
  }, [
    selectedRoom?.id,
    selectedRoom?.round1_advance_chance,
    selectedRoom?.round2_advance_chance,
    selectedRoom?.rolls_per_turn,
    selectedRoom?.base_guarantee,
    selectedRoom?.starting_player_id,
    selectedRoom?.total_rounds,
    selectedRoom?.round1_board_size,
    selectedRoom?.round2_board_size,
    selectedRoom?.round3_board_size,
    selectedRoom?.round_board_sizes,
    selectedRoom?.round_advance_chances,
  ])

  useEffect(() => {
    setRoomPendingDelete(null)
    setCodeCopied(false)
    setConfigNotice('')
    setDiceDrafts({})
    setGuaranteeDrafts({})
    setSuffixDrafts({})
    setCropSource((current) => {
      if (current) URL.revokeObjectURL(current.url)
      return null
    })
  }, [selectedRoomId])

  useEffect(() => () => {
    if (cropSource) URL.revokeObjectURL(cropSource.url)
  }, [cropSource])

  useEffect(() => {
    const nextTile = selectedRoundTiles.find((tile) => tile.id === selectedTileId) ?? selectedRoundTiles[0] ?? null
    setSelectedTileId(nextTile?.id ?? null)
    setTileDraft(nextTile ? { ...nextTile } : null)
    setEdgeTargetId('')
  }, [editorRound, selectedRoomId, roomTiles])

  async function runAdminAction(action: () => Promise<void>) {
    setBusy(true)
    setError('')
    try {
      await action()
    } catch (actionError) {
      setError(formatError(actionError))
    } finally {
      setBusy(false)
    }
  }

  function login() {
    void runAdminAction(async () => {
      if (!supabase) throw new Error('尚未配置 Supabase')
      if (!email.trim() || !password) throw new Error('请输入管理员邮箱和密码')
      const { error: loginError } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (loginError) throw loginError
      const { data: isAdmin, error: adminError } = await supabase.rpc('is_admin')
      if (adminError) throw adminError
      if (isAdmin !== true) {
        await supabase.auth.signOut()
        throw new Error('此账号不在管理员白名单中')
      }
      setAuthorized(true)
      setPassword('')
      await loadDashboard()
    })
  }

  function logout() {
    void runAdminAction(async () => {
      if (supabase) await supabase.auth.signOut()
      setAuthorized(false)
      setRooms([])
      setPlayers([])
      setEvents([])
      setSettlementRules([])
      setRoomTiles([])
      setRoomEdges([])
      setSelectedRoomId(null)
    })
  }

  function createRoom() {
    setCreating(true)
    void runAdminAction(async () => {
      try {
        if (!supabase) return
        const roomName = newRoomName.trim()
        if (roomName.length < 1 || roomName.length > 24) throw new Error('房间名需要 1–24 个字符')
        const { data, error: rpcError } = await supabase.rpc('admin_create_room', { p_room_name: roomName })
        if (rpcError) throw rpcError
        const result = Array.isArray(data) ? data[0] : data
        await loadDashboard()
        if (result?.room_id) setSelectedRoomId(result.room_id)
        setNewRoomName('')
      } finally {
        setCreating(false)
      }
    })
  }

  function saveChances() {
    if (!selectedRoom) return
    void runAdminAction(async () => {
      if (!supabase) return
      const chances = advanceChances.map(Number)
      if (chances.slice(0, Math.max(0, totalRounds - 1)).some((chance) => !Number.isInteger(chance) || chance < 0 || chance > 100)) {
        throw new Error('晋级概率必须是 0–100 的整数')
      }
      const { error: rpcError } = await supabase.rpc('admin_update_round_chances_v2', {
        p_room_id: selectedRoom.id,
        p_round_chances: chances,
      })
      if (rpcError) throw rpcError
      await loadDashboard()
    })
  }

  function saveRoomSettings() {
    if (!selectedRoom) return
    void runAdminAction(async () => {
      if (!supabase) return
      const rollCount = Number(rollsPerTurn)
      const guarantee = Number(baseGuarantee)
      if (!Number.isInteger(rollCount) || rollCount < 1 || rollCount > 5) {
        throw new Error('初始骰子数量必须是 1–5 的整数')
      }
      if (!Number.isInteger(guarantee) || guarantee < 0 || guarantee > 10000) {
        throw new Error('基础保底必须是 0–10000 万的整数')
      }
      if (startingPlayerId && !selectedPlayers.some((player) => player.user_id === startingPlayerId)) {
        throw new Error('首位玩家必须在当前房间中')
      }
      const { error: rpcError } = await supabase.rpc('admin_update_room_settings', {
        p_room_id: selectedRoom.id,
        p_starting_player_id: startingPlayerId || null,
        p_rolls_per_turn: rollCount,
        p_base_guarantee: guarantee,
      })
      if (rpcError) throw rpcError
      await loadDashboard()
    })
  }

  function randomizeBoard() {
    if (!selectedRoom) return
    void runAdminAction(async () => {
      if (!supabase) return
      const { error: rpcError } = await supabase.rpc('admin_randomize_room_board', { p_room_id: selectedRoom.id })
      if (rpcError) throw rpcError
      await loadRoomTiles(selectedRoom.id)
    })
  }

  function saveBoardStructure() {
    if (!selectedRoom) return
    void runAdminAction(async () => {
      if (!supabase) return
      if (!Number.isInteger(totalRounds) || totalRounds < 1 || totalRounds > MAX_ROUNDS) {
        throw new Error(`轮数必须在 1–${MAX_ROUNDS} 之间`)
      }
      if (roundSizes.slice(0, totalRounds).some((size) => !Number.isInteger(size) || size < MIN_BOARD_SIZE || size > MAX_BOARD_SIZE || size % 2 !== 0)) {
        throw new Error(`每轮格子数必须是 ${MIN_BOARD_SIZE}–${MAX_BOARD_SIZE} 之间的偶数`)
      }
      const { error: rpcError } = await supabase.rpc('admin_update_board_structure', {
        p_room_id: selectedRoom.id,
        p_total_rounds: totalRounds,
        p_round_sizes: roundSizes,
      })
      if (rpcError) throw rpcError
      await Promise.all([loadDashboard(), loadRoomTiles(selectedRoom.id), loadRoomEdges(selectedRoom.id), loadRoomEvents(selectedRoom.id)])
      setConfigNotice('棋盘轮数和格子数已保存')
    })
  }

  const chooseTile = useCallback((tile: RoomTile) => {
    setSelectedTileId(tile.id)
    setTileDraft({ ...tile })
  }, [])

  function saveTile() {
    if (!selectedRoom || !tileDraft) return
    void runAdminAction(async () => {
      if (!supabase) return
      const effectValue = Number(tileDraft.effect_value)
      if (!tileDraft.name.trim() || !tileDraft.short_name.trim() || !tileDraft.detail.trim()) {
        throw new Error('格子名称、棋盘短名和说明都不能为空')
      }
      if (!Number.isFinite(effectValue)) throw new Error('效果数值无效')
      const acceptsDecimal = ['guarantee_multiply', 'guarantee_divide'].includes(tileDraft.effect_type)
      if (!acceptsDecimal && !Number.isInteger(effectValue)) throw new Error('该效果数值必须是整数')
      if (['guarantee_add', 'guarantee_subtract'].includes(tileDraft.effect_type) && (effectValue < 1 || effectValue > 100000)) {
        throw new Error('保底增加或减少必须是 1–100000 万的整数')
      }
      if (acceptsDecimal && (effectValue < 0 || effectValue > 10)) {
        throw new Error('保底乘除倍数必须在 0–10 之间')
      }
      const { error: rpcError } = await supabase.rpc('admin_update_room_tile', {
        p_tile_id: tileDraft.id,
        p_name: tileDraft.name.trim(),
        p_short_name: tileDraft.short_name.trim(),
        p_tile_type: tileDraft.tile_type,
        p_detail: tileDraft.detail.trim(),
        p_effect_type: tileDraft.effect_type,
        p_effect_value: effectValue,
        p_tile_color: tileDraft.tile_color || null,
        p_is_randomized: tileDraft.tile_type === 'start' ? false : tileDraft.is_randomized,
      })
      if (rpcError) throw rpcError
      if (tileDraft.layout_x !== null && tileDraft.layout_y !== null) {
        const { error: layoutError } = await supabase.rpc('admin_update_tile_position', {
          p_tile_id: tileDraft.id,
          p_layout_x: tileDraft.layout_x,
          p_layout_y: tileDraft.layout_y,
        })
        if (layoutError) throw layoutError
      }
      await loadRoomTiles(selectedRoom.id)
    })
  }

  const moveTile = useCallback((tile: RoomTile, x: number, y: number) => {
    if (!selectedRoom || selectedRoom.status !== 'lobby') return
    const currentIndex = selectedRoundTiles.findIndex((candidate) => candidate.id === tile.id)
    const currentPosition = getRoomTileCanvasPosition(tile, currentIndex, selectedRoundTiles.length)
    const previousX = tile.layout_x
    const previousY = tile.layout_y
    if (currentPosition.x === x && currentPosition.y === y) return

    const revision = tileMoveRevisionRef.current + 1
    tileMoveRevisionRef.current = revision
    pendingTileMovesRef.current.set(tile.id, { x, y, revision })
    setError('')
    setRoomTiles((current) => current.map((candidate) => candidate.id === tile.id
      ? { ...candidate, layout_x: x, layout_y: y }
      : candidate))
    setTileDraft((current) => current?.id === tile.id ? { ...current, layout_x: x, layout_y: y } : current)

    const priorTask = tileMoveQueueRef.current.get(tile.id) ?? Promise.resolve()
    let task: Promise<void>
    task = priorTask.catch(() => undefined).then(async () => {
      if (!supabase) return
      const { error: rpcError } = await supabase.rpc('admin_update_tile_position', {
        p_tile_id: tile.id,
        p_layout_x: x,
        p_layout_y: y,
      })
      if (rpcError) throw rpcError
    }).then(() => {
      if (pendingTileMovesRef.current.get(tile.id)?.revision === revision) pendingTileMovesRef.current.delete(tile.id)
    }, (moveError) => {
      if (pendingTileMovesRef.current.get(tile.id)?.revision !== revision) return
      pendingTileMovesRef.current.delete(tile.id)
      setRoomTiles((current) => current.map((candidate) => candidate.id === tile.id
        ? { ...candidate, layout_x: previousX, layout_y: previousY }
        : candidate))
      setTileDraft((current) => current?.id === tile.id ? { ...current, layout_x: previousX, layout_y: previousY } : current)
      setError(formatError(moveError))
    }).finally(() => {
      if (tileMoveQueueRef.current.get(tile.id) === task) tileMoveQueueRef.current.delete(tile.id)
    })
    tileMoveQueueRef.current.set(tile.id, task)
  }, [selectedRoom, selectedRoundTiles])

  function updateRoundLayout(points: BoardCanvasPoint[]) {
    const coordinates = new Map(selectedRoundTiles.map((tile, index) => [tile.id, points[index]]))
    setRoomTiles((current) => current.map((tile) => {
      const point = coordinates.get(tile.id)
      return point ? { ...tile, layout_x: point.x, layout_y: point.y } : tile
    }))
    setTileDraft((current) => {
      if (!current) return current
      const point = coordinates.get(current.id)
      return point ? { ...current, layout_x: point.x, layout_y: point.y } : current
    })
  }

  function persistRoundLayout(
    points: BoardCanvasPoint[],
    rollback: BoardCanvasPoint[],
    notice: string,
    onSuccess?: () => void,
    onError?: () => void,
  ) {
    if (!selectedRoom) return
    updateRoundLayout(points)
    void runAdminAction(async () => {
      if (!supabase) return
      const { error: rpcError } = await supabase.rpc('admin_apply_board_layout', {
        p_room_id: selectedRoom.id,
        p_round: editorRound,
        p_positions: points.map((point, position) => ({ position, layout_x: point.x, layout_y: point.y })),
      })
      if (rpcError) {
        updateRoundLayout(rollback)
        onError?.()
        throw rpcError
      }
      await loadRoomTiles(selectedRoom.id)
      onSuccess?.()
      setConfigNotice(notice)
    })
  }

  function applyLayoutPreset(preset: BoardLayoutPresetId) {
    const previous = selectedRoundTiles.map((tile, index) => getRoomTileCanvasPosition(tile, index, selectedRoundTiles.length))
    layoutUndoRef.current.set(editorRound, previous)
    const next = createBoardLayout(selectedRoundTiles.length, preset).map(gridPointToCanvas)
    const presetName = BOARD_LAYOUT_PRESETS.find((item) => item.id === preset)?.name ?? '地图'
    persistRoundLayout(
      next,
      previous,
      `${roundLabel(editorRound)}已应用“${presetName}”预设`,
      undefined,
      () => layoutUndoRef.current.delete(editorRound),
    )
  }

  function undoLayoutPreset() {
    const previous = layoutUndoRef.current.get(editorRound)
    if (!previous) return
    const current = selectedRoundTiles.map((tile, index) => getRoomTileCanvasPosition(tile, index, selectedRoundTiles.length))
    persistRoundLayout(
      previous,
      current,
      `${roundLabel(editorRound)}已恢复应用预设前的排布`,
      () => layoutUndoRef.current.delete(editorRound),
    )
  }

  function chooseImageFile(file: File | undefined) {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('请选择 JPEG、PNG 或 WebP 图片')
      return
    }
    if (file.size > TILE_IMAGE_MAX_SOURCE_BYTES) {
      setError('原图不能超过 20 MB')
      return
    }
    setError('')
    setCropSource((current) => {
      if (current) URL.revokeObjectURL(current.url)
      return { url: URL.createObjectURL(file), name: file.name.replace(/\.[^.]+$/, '').slice(0, 60) || '格子图片' }
    })
    if (imageInputRef.current) imageInputRef.current.value = ''
  }

  function cancelImageCrop() {
    setCropSource((current) => {
      if (current) URL.revokeObjectURL(current.url)
      return null
    })
  }

  async function uploadCroppedImage(blob: Blob, width: number, height: number, name: string) {
    if (!selectedRoom || !supabase) return
    const storagePath = `${selectedRoom.id}/${crypto.randomUUID()}.webp`
    const { error: uploadError } = await supabase.storage.from('tile-images').upload(storagePath, blob, {
      contentType: 'image/webp',
      cacheControl: '31536000',
      upsert: false,
    })
    if (uploadError) throw uploadError
    const publicUrl = supabase.storage.from('tile-images').getPublicUrl(storagePath).data.publicUrl
    const { error: createError } = await supabase.rpc('admin_create_tile_image', {
      p_room_id: selectedRoom.id,
      p_name: name,
      p_storage_path: storagePath,
      p_public_url: publicUrl,
      p_width: width,
      p_height: height,
      p_byte_size: blob.size,
      p_mime_type: 'image/webp',
    })
    if (createError) {
      await supabase.storage.from('tile-images').remove([storagePath])
      throw createError
    }
    cancelImageCrop()
    await loadTileImages()
    setConfigNotice(`图片已裁剪并压缩至 ${(blob.size / 1024).toFixed(1)} KB`)
  }

  function assignTileImage(image: RoomTileImage | null) {
    if (!selectedRoom || !tileDraft) return
    void runAdminAction(async () => {
      if (!supabase) return
      const { error: rpcError } = await supabase.rpc('admin_set_tile_image', {
        p_tile_id: tileDraft.id,
        p_image_id: image?.id ?? null,
      })
      if (rpcError) throw rpcError
      await loadRoomTiles(selectedRoom.id)
    })
  }

  function deleteLibraryImage(image: RoomTileImage) {
    if (!selectedRoom || !window.confirm(`删除公共图片“${image.name}”？所有房间中使用它的格子都会恢复为无图片。`)) return
    void runAdminAction(async () => {
      if (!supabase) return
      const { error: storageError } = await supabase.storage.from('tile-images').remove([image.storage_path])
      if (storageError) throw storageError
      const { error: rpcError } = await supabase.rpc('admin_delete_tile_image', { p_image_id: image.id })
      if (rpcError) throw rpcError
      await Promise.all([loadTileImages(), loadRoomTiles(selectedRoom.id)])
    })
  }

  function addTiles() {
    if (!selectedRoom || !tileDraft) return
    void runAdminAction(async () => {
      if (!supabase) return
      const anchor = getRoomTileCanvasPosition(tileDraft, selectedRoundTiles.findIndex((tile) => tile.id === tileDraft.id), selectedRoundTiles.length)
      const { error: rpcError } = await supabase.rpc('admin_add_room_tiles_around', {
        p_tile_id: tileDraft.id,
        p_anchor_x: anchor.x,
        p_anchor_y: anchor.y,
      })
      if (rpcError) throw rpcError
      await Promise.all([loadDashboard(), loadRoomTiles(selectedRoom.id), loadRoomEdges(selectedRoom.id)])
    })
  }

  function deleteTilePair() {
    if (!selectedRoom || !tileDraft || tileDraft.tile_type === 'start') return
    if (!window.confirm(`将删除第 ${tileDraft.position + 1} 格，并同时删除本轮最后一个非起点格，以保证格子总数为偶数。继续吗？`)) return
    void runAdminAction(async () => {
      if (!supabase) return
      const { error: rpcError } = await supabase.rpc('admin_delete_room_tile_pair', { p_tile_id: tileDraft.id })
      if (rpcError) throw rpcError
      await Promise.all([loadDashboard(), loadRoomTiles(selectedRoom.id), loadRoomEdges(selectedRoom.id)])
    })
  }

  function addEdge() {
    if (!selectedRoom || !tileDraft || !edgeTargetId) return
    void runAdminAction(async () => {
      if (!supabase) return
      const { error: rpcError } = await supabase.rpc('admin_upsert_tile_edge', {
        p_from_tile_id: tileDraft.id,
        p_to_tile_id: edgeTargetId,
        p_is_bidirectional: edgeBidirectional,
      })
      if (rpcError) throw rpcError
      await loadRoomEdges(selectedRoom.id)
      setEdgeTargetId('')
    })
  }

  function deleteEdge(edgeId: string) {
    if (!selectedRoom) return
    void runAdminAction(async () => {
      if (!supabase) return
      const { error: rpcError } = await supabase.rpc('admin_delete_tile_edge', { p_edge_id: edgeId })
      if (rpcError) throw rpcError
      await loadRoomEdges(selectedRoom.id)
    })
  }

  function startRoom() {
    if (!selectedRoom) return
    void runAdminAction(async () => {
      if (!supabase) return
      const { error: rpcError } = await supabase.rpc('admin_start_game', { p_room_id: selectedRoom.id })
      if (rpcError) throw rpcError
      await loadDashboard()
    })
  }

  function finishRoom() {
    if (!selectedRoom) return
    void runAdminAction(async () => {
      if (!supabase) return
      const { error: rpcError } = await supabase.rpc('admin_finish_room', { p_room_id: selectedRoom.id })
      if (rpcError) throw rpcError
      await loadDashboard()
    })
  }

  function toggleRoomPause() {
    if (!selectedRoom || selectedRoom.status !== 'playing') return
    void runAdminAction(async () => {
      if (!supabase) return
      const { error: rpcError } = await supabase.rpc('admin_set_room_paused', {
        p_room_id: selectedRoom.id,
        p_paused: !selectedRoom.is_paused,
      })
      if (rpcError) throw rpcError
      await loadDashboard()
    })
  }

  function savePlayerDice(player: Player) {
    if (!selectedRoom) return
    void runAdminAction(async () => {
      if (!supabase) return
      const diceCount = Number(diceDrafts[player.id] ?? player.dice_count)
      if (!Number.isInteger(diceCount) || diceCount < 0 || diceCount > 20) {
        throw new Error('骰子数量必须是 0–20 的整数')
      }
      const { error: rpcError } = await supabase.rpc('admin_set_player_dice', {
        p_room_id: selectedRoom.id,
        p_player_id: player.id,
        p_dice_count: diceCount,
      })
      if (rpcError) throw rpcError
      await loadDashboard()
      setDiceDrafts((current) => {
        const next = { ...current }
        delete next[player.id]
        return next
      })
    })
  }

  function saveBossGuarantee(player: Player) {
    if (!selectedRoom) return
    void runAdminAction(async () => {
      if (!supabase) return
      const guarantee = Number(guaranteeDrafts[player.id] ?? player.coins)
      const maximum = selectedRoom.status === 'lobby' ? 10000 : 1000000
      if (!Number.isInteger(guarantee) || guarantee < 0 || guarantee > maximum) {
        throw new Error(`老板保底必须是 0–${maximum} 万的整数`)
      }
      const { error: rpcError } = await supabase.rpc('admin_set_boss_guarantee', {
        p_room_id: selectedRoom.id,
        p_guarantee: guarantee,
      })
      if (rpcError) throw rpcError
      await loadDashboard()
      await loadRoomEvents(selectedRoom.id)
      setGuaranteeDrafts((current) => {
        const next = { ...current }
        delete next[player.id]
        return next
      })
    })
  }

  function updatePlayerRole(player: Player, role: PlayerRole) {
    if (!selectedRoom || player.role === role) return
    void runAdminAction(async () => {
      if (!supabase) return
      const { error: rpcError } = await supabase.rpc('admin_update_player_role', {
        p_room_id: selectedRoom.id,
        p_player_id: player.id,
        p_role: role,
      })
      if (rpcError) throw rpcError
      await loadDashboard()
      await loadRoomEvents(selectedRoom.id)
    })
  }

  function deleteRoom() {
    if (!selectedRoom || roomPendingDelete !== selectedRoom.id) return
    const roomId = selectedRoom.id
    void runAdminAction(async () => {
      if (!supabase) return
      const { error: rpcError } = await supabase.rpc('admin_delete_room', { p_room_id: roomId })
      if (rpcError) throw rpcError
      setRoomPendingDelete(null)
      await loadDashboard()
    })
  }

  async function copyRoomCode() {
    if (!selectedRoom) return
    await navigator.clipboard.writeText(selectedRoom.code)
    setCodeCopied(true)
    window.setTimeout(() => setCodeCopied(false), 1600)
  }

  function exportRoomConfig() {
    if (!selectedRoom) return
    void runAdminAction(async () => {
      if (!supabase) return
      const [roomResult, tilesResult, edgesResult] = await Promise.all([
        supabase.from('rooms').select('*').eq('id', selectedRoom.id).single(),
        supabase.from('room_tiles').select('*').eq('room_id', selectedRoom.id).order('round_number').order('position'),
        supabase.from('room_tile_edges').select('*').eq('room_id', selectedRoom.id).order('created_at'),
      ])
      if (roomResult.error) throw roomResult.error
      if (tilesResult.error) throw tilesResult.error
      if (edgesResult.error) throw edgesResult.error
      const room = roomResult.data as Room
      const tiles = tilesResult.data as RoomTile[]
      const expectedTiles = Array.from({ length: room.total_rounds ?? 3 }, (_, index) => roundBoardSize(room, (index + 1) as GameRound))
        .reduce((sum, size) => sum + size, 0)
      if (tiles.length !== expectedTiles) throw new Error('当前房间的棋盘不完整，无法导出')

      const config: RoomConfigFile = {
        format: ROOM_CONFIG_FORMAT,
        version: ROOM_CONFIG_VERSION,
        exported_at: new Date().toISOString(),
        settings: {
          name: room.name,
          round1_advance_chance: room.round1_advance_chance,
          round2_advance_chance: room.round2_advance_chance,
          rolls_per_turn: room.rolls_per_turn,
          base_guarantee: room.base_guarantee,
          total_rounds: room.total_rounds ?? 3,
          round_sizes: roomRoundSizes(room),
          round_advance_chances: roomAdvanceChances(room),
        },
        tiles: tiles.map((tile) => ({
          round_number: tile.round_number,
          position: tile.position,
          name: tile.name,
          short_name: tile.short_name,
          tile_type: tile.tile_type,
          detail: tile.detail,
          effect_type: tile.effect_type,
          effect_value: Number(tile.effect_value),
          tile_color: tile.tile_color,
          is_randomized: tile.is_randomized,
          grid_x: tile.grid_x,
          grid_y: tile.grid_y,
          layout_x: tile.layout_x,
          layout_y: tile.layout_y,
        })),
        edges: (edgesResult.data as RoomTileEdge[]).map((edge) => ({
          round_number: edge.round_number,
          from_position: tiles.find((tile) => tile.id === edge.from_tile_id)?.position ?? -1,
          to_position: tiles.find((tile) => tile.id === edge.to_tile_id)?.position ?? -1,
          is_bidirectional: edge.is_bidirectional,
        })).filter((edge) => edge.from_position >= 0 && edge.to_position >= 0),
      }
      const date = new Date().toISOString().slice(0, 10)
      downloadTextFile(`${safeFilename(room.name)}_房间设置_${date}.json`, JSON.stringify(config, null, 2), 'application/json;charset=utf-8')
      setConfigNotice('房间设置已导出，不包含玩家和摇骰记录')
    })
  }

  function importRoomConfig(file: File | undefined) {
    if (!file || !selectedRoom) return
    if (selectedRoom.status !== 'lobby') {
      setError('只能向等待中的房间导入设置')
      return
    }
    if (!window.confirm(`确定用「${file.name}」覆盖当前房间设置和棋盘吗？玩家席位不会被删除。`)) return

    void runAdminAction(async () => {
      if (!supabase) return
      const raw = (await file.text()).replace(/^\uFEFF/, '')
      let config: unknown
      try {
        config = JSON.parse(raw)
      } catch {
        throw new Error('导入文件不是有效的 JSON')
      }
      if (!config || typeof config !== 'object') throw new Error('导入文件内容无效')
      const candidate = config as Partial<RoomConfigFile> & { version?: number }
      if (candidate.format !== ROOM_CONFIG_FORMAT || ![1, 2, 3, 4, ROOM_CONFIG_VERSION].includes(candidate.version ?? 0)) {
        throw new Error('不支持的房间设置文件格式或版本')
      }
      if (!candidate.settings || !Array.isArray(candidate.tiles) || candidate.tiles.length < MIN_BOARD_SIZE) {
        throw new Error('导入文件缺少完整的房间设置或棋盘格')
      }
      const { error: rpcError } = await supabase.rpc('admin_import_room_config', {
        p_room_id: selectedRoom.id,
        p_config: config,
      })
      if (rpcError) throw rpcError
      const { error: graphError } = await supabase.rpc('admin_import_room_graph', {
        p_room_id: selectedRoom.id,
        p_config: config,
      })
      if (graphError) throw graphError
      await Promise.all([loadDashboard(), loadRoomTiles(selectedRoom.id), loadRoomEdges(selectedRoom.id), loadRoomEvents(selectedRoom.id)])
      setConfigNotice('房间设置已导入；之后重新随机只会替换标记为“参与随机”的格子')
    })
  }

  function saveSettlementSuffix(rule: SettlementRule) {
    if (!selectedRoom) return
    void runAdminAction(async () => {
      if (!supabase) return
      const suffix = (suffixDrafts[rule.id] ?? rule.suffix).trim()
      if (suffix.length > 200) throw new Error('规则后缀最多 200 个字符')
      const { error: rpcError } = await supabase.rpc('admin_update_settlement_rule_suffix', {
        p_rule_id: rule.id,
        p_suffix: suffix,
      })
      if (rpcError) throw rpcError
      await Promise.all([loadSettlementRules(selectedRoom.id), loadRoomEvents(selectedRoom.id)])
      setSuffixDrafts((current) => {
        const next = { ...current }
        delete next[rule.id]
        return next
      })
    })
  }

  function exportRollLog() {
    if (!selectedRoom || selectedRoom.status !== 'finished') return
    void runAdminAction(async () => {
      if (!supabase) return
      const pageSize = 1000
      const allEvents: GameEvent[] = []
      for (let from = 0; ; from += pageSize) {
        const { data, error: eventsError } = await supabase
          .from('game_events')
          .select('*')
          .eq('room_id', selectedRoom.id)
          .order('created_at', { ascending: true })
          .range(from, from + pageSize - 1)
        if (eventsError) throw eventsError
        const batch = data as GameEvent[]
        allEvents.push(...batch)
        if (batch.length < pageSize) break
      }
      const { data: rulesData, error: rulesError } = await supabase
        .from('room_settlement_rules')
        .select('*')
        .eq('room_id', selectedRoom.id)
        .order('sequence_number')
      if (rulesError) throw rulesError
      const rules = rulesData as SettlementRule[]
      const rollEvents = allEvents.filter((event) => event.event_type === 'roll' || event.message.includes('掷出'))
      const rollLines = rollEvents.map((event, index) => {
        const metadata = event.metadata ?? {}
        const timestamp = new Date(event.created_at).toLocaleString('zh-CN', { hour12: false })
        if (!metadata.player_name || !metadata.dice) return `${index + 1}. [${timestamp}] ${event.message}`
        const role = metadata.role === 'boss' ? '老板' : '打手'
        return `${index + 1}. [${timestamp}] ${metadata.player_name}（${role}） · 第${metadata.round}轮 · 掷出 ${metadata.dice} · 落到「${metadata.tile_name}」：${metadata.tile_detail}`
      })
      const ruleLines = rules.map((rule) => `${rule.sequence_number}. ${rule.base_text}${rule.suffix ? ` ${rule.suffix}` : ''}`)
      const content = [
        '景序电竞三角洲趣味 · 全部摇骰记录',
        `房间：${selectedRoom.name}`,
        `房间码：${selectedRoom.code}`,
        `导出时间：${new Date().toLocaleString('zh-CN', { hour12: false })}`,
        `摇骰次数：${rollEvents.length}`,
        '',
        '=== 全部摇骰记录 ===',
        ...(rollLines.length ? rollLines : ['本局没有摇骰记录。']),
        '',
        '=== 全员骰子归零规则 ===',
        ...(ruleLines.length ? ruleLines : ['本局没有生成归零规则。']),
        '',
      ].join('\r\n')
      const date = new Date().toISOString().slice(0, 10)
      downloadTextFile(`${safeFilename(selectedRoom.name)}_全部摇骰记录_${date}.txt`, content, 'text/plain;charset=utf-8', true)
    })
  }

  function clearCaches() {
    void runAdminAction(async () => {
      if (!supabase) return
      const { error: rpcError } = await supabase.rpc('admin_clear_cache')
      if (rpcError) throw rpcError
      localStorage.removeItem(ACTIVE_ROOM_KEY)
      localStorage.removeItem(LAST_ROOM_CODE_KEY)
      localStorage.removeItem(NICKNAME_KEY)
      if ('caches' in window) {
        const cacheNames = await window.caches.keys()
        await Promise.all(cacheNames.map((name) => window.caches.delete(name)))
      }
      setEvents([])
      setRoomTiles([])
      await loadDashboard()
      if (selectedRoomId) await Promise.all([loadRoomEvents(selectedRoomId), loadRoomTiles(selectedRoomId)])
      setCacheCleared(true)
      window.setTimeout(() => setCacheCleared(false), 1800)
    })
  }

  if (checking) {
    return <div className="loading-screen"><Logo /><LoaderCircle className="spin" size={28} /></div>
  }

  return (
    <div className="admin-page">
      <header className="portal-header">
        <Logo />
        <div className="admin-header-tools">
          {authorized && (
            <button className="back-link cache-button" disabled={busy} onClick={clearCaches} title="清理前端与后端缓存" type="button">
              {cacheCleared ? <Check size={17} /> : <RotateCcw size={17} />} <span>{cacheCleared ? '已清理' : '清理缓存'}</span>
            </button>
          )}
          <button className="back-link" onClick={onBack} type="button"><ArrowLeft size={17} /> 返回玩家入口</button>
        </div>
      </header>

      {!authorized ? (
        <main className="admin-login-shell">
          <section className="admin-login-copy">
            <p className="eyebrow"><LockKeyhole size={14} /> 管理员控制台</p>
            <h1>管理房间与<br /><span>全部摇骰记录。</span></h1>
            <p>只有加入 Supabase 管理员白名单的账号可以登录。</p>
          </section>
          <section className="entry-panel">
            <div className="panel-heading">
              <div><p className="kicker">ADMIN</p><h2>管理员登录</h2></div>
              <Shield size={21} />
            </div>
            <label className="field">
              <span>邮箱</span>
              <input autoComplete="username" onChange={(event) => setEmail(event.target.value)} type="email" value={email} />
            </label>
            <label className="field">
              <span>密码</span>
              <input autoComplete="current-password" onChange={(event) => setPassword(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && login()} type="password" value={password} />
            </label>
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="button primary full" disabled={busy} onClick={login} type="button">
              {busy ? <LoaderCircle className="spin" size={18} /> : <LogIn size={18} />} 登录管理面板
            </button>
          </section>
        </main>
      ) : (
        <main className="admin-shell">
          <aside className="admin-room-list">
            <div className="admin-section-heading">
              <div><p className="kicker">ROOMS</p><h1>房间管理</h1></div>
            </div>
            <div className="admin-create-room">
              <label htmlFor="new-room-name">房间名称</label>
              <div>
                <input
                  id="new-room-name"
                  maxLength={24}
                  onChange={(event) => setNewRoomName(event.target.value)}
                  onKeyDown={(event) => event.key === 'Enter' && !busy && newRoomName.trim() && createRoom()}
                  placeholder="例如：周末护航局"
                  value={newRoomName}
                />
                <button aria-label="创建房间" className="button primary" disabled={busy || !newRoomName.trim()} onClick={createRoom} title="创建房间" type="button">
                  {creating ? <LoaderCircle className="spin" size={18} /> : <Plus size={18} />}
                  {creating ? '创建中' : '创建'}
                </button>
              </div>
              {creating && <div className="creation-progress" role="status"><span /><p>正在创建房间并生成三轮随机棋盘...</p></div>}
            </div>
            <div className="admin-room-items">
              {rooms.map((room) => {
                const count = players.filter((player) => player.room_id === room.id).length
                return (
                  <button className={`admin-room-item ${selectedRoomId === room.id ? 'active' : ''}`} key={room.id} onClick={() => setSelectedRoomId(room.id)} type="button">
                    <span><strong>{room.name}</strong><small>{room.code} · {count}/3 人 · {roundLabel(room.current_round)}</small></span>
                    <em className={`room-status status-${room.is_paused ? 'paused' : room.status}`}>{roomStatusLabel(room)}</em>
                  </button>
                )
              })}
              {rooms.length === 0 && <p className="admin-empty">还没有房间，点击上方按钮创建。</p>}
            </div>
            <button className="button ghost full admin-logout" disabled={busy} onClick={logout} type="button"><LogOut size={17} /> 退出管理员</button>
          </aside>

          <section className="admin-room-detail">
            {selectedRoom ? (
              <>
                <div className="admin-detail-header">
                  <div>
                    <p className="kicker">SELECTED ROOM</p>
                    <h2 className="admin-room-title">{selectedRoom.name}</h2>
                    <button className="admin-code" onClick={copyRoomCode} title="复制房间码" type="button">
                      {selectedRoom.code} {codeCopied ? <><Check size={17} /><small>已复制</small></> : <Clipboard size={17} />}
                    </button>
                  </div>
                  <div className="admin-room-actions">
                    <button className="button secondary" disabled={busy} onClick={exportRoomConfig} type="button"><Download size={17} /> 导出设置</button>
                    <button className="button secondary" disabled={busy || selectedRoom.status !== 'lobby'} onClick={() => configInputRef.current?.click()} type="button"><Upload size={17} /> 导入设置</button>
                    <input
                      accept="application/json,.json"
                      className="visually-hidden"
                      onChange={(event) => {
                        const file = event.currentTarget.files?.[0]
                        event.currentTarget.value = ''
                        importRoomConfig(file)
                      }}
                      ref={configInputRef}
                      type="file"
                    />
                    <button className="button secondary" disabled={busy || selectedRoom.status !== 'finished'} onClick={exportRollLog} title={selectedRoom.status === 'finished' ? '导出全部摇骰记录' : '房间结束后可导出'} type="button"><Download size={17} /> 导出记录</button>
                    <button className="button primary" disabled={busy || !canStart} onClick={startRoom} type="button"><Play size={17} /> 开始房间</button>
                    <button className="button secondary" disabled={busy || selectedRoom.status !== 'playing'} onClick={toggleRoomPause} type="button">
                      {selectedRoom.is_paused ? <Play size={17} /> : <Pause size={17} />}
                      {selectedRoom.is_paused ? '继续本局' : '暂停本局'}
                    </button>
                    <button className="button secondary" disabled={busy || selectedRoom.status !== 'playing'} onClick={finishRoom} type="button"><Flag size={17} /> 结束本局</button>
                    {roomPendingDelete === selectedRoom.id ? (
                      <>
                        <button className="button danger" disabled={busy} onClick={deleteRoom} type="button"><Trash2 size={17} /> 确认删除</button>
                        <button aria-label="取消删除" className="button ghost" disabled={busy} onClick={() => setRoomPendingDelete(null)} title="取消删除" type="button"><X size={17} /></button>
                      </>
                    ) : (
                      <button className="button danger" disabled={busy} onClick={() => setRoomPendingDelete(selectedRoom.id)} type="button"><Trash2 size={17} /> 删除房间</button>
                    )}
                  </div>
                </div>

                {configNotice && <p className="admin-operation-notice" role="status"><Check size={15} /> {configNotice}</p>}

                <div className="admin-summary-strip">
                  <span><small>状态</small><strong>{roomStatusLabel(selectedRoom)}</strong></span>
                  <span><small>当前轮次</small><strong>{roundLabel(selectedRoom.current_round)} / 共 {selectedRoom.total_rounds ?? 3} 轮</strong></span>
                  <span><small>玩家</small><strong>{selectedPlayers.length} / 3</strong></span>
                  <span><small>初始骰子</small><strong>{selectedRoom.rolls_per_turn} 个</strong></span>
                  <span><small>基础保底</small><strong>{selectedRoom.base_guarantee ?? 100} 万</strong></span>
                </div>

                <section className="admin-turn-panel">
                  <div className="section-title"><p className="kicker">开局设置</p><SlidersHorizontal size={18} /></div>
                  <div className="turn-settings-grid">
                    <label>
                      <span>谁先掷骰</span>
                      <select disabled={selectedRoom.status !== 'lobby'} onChange={(event) => setStartingPlayerId(event.target.value)} value={startingPlayerId}>
                        <option value="">按加入顺序自动选择</option>
                        {selectedPlayers.map((player) => (
                          <option key={player.id} value={player.user_id}>{player.nickname} · {player.role === 'boss' ? '老板' : '打手'}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>每位玩家初始骰子数量</span>
                      <input disabled={selectedRoom.status !== 'lobby'} max="5" min="1" onChange={(event) => setRollsPerTurn(event.target.value)} type="number" value={rollsPerTurn} />
                    </label>
                    <label>
                      <span>老板基础保底（万）</span>
                      <input disabled={selectedRoom.status !== 'lobby'} max="10000" min="0" onChange={(event) => setBaseGuarantee(event.target.value)} type="number" value={baseGuarantee} />
                    </label>
                    <button className="button secondary" disabled={busy || selectedRoom.status !== 'lobby'} onClick={saveRoomSettings} type="button"><Save size={17} /> 保存开局设置</button>
                  </div>
                </section>

                <section className="admin-probability-panel">
                  <div className="section-title"><p className="kicker">每次掷骰晋级概率</p><Settings2 size={18} /></div>
                  <p className="probability-note">仅老板可以晋级；老板每轮前 2 次掷骰为保护期，打手不会触发晋级。</p>
                  <div className="probability-grid">
                    {Array.from({ length: Math.max(0, totalRounds - 1) }, (_, index) => (
                      <label key={index}>
                        <span>第 {index + 1} 轮 → 第 {index + 2} 轮</span>
                        <span className="percent-input">
                          <input max="100" min="0" onChange={(event) => setAdvanceChances((values) => values.map((value, valueIndex) => valueIndex === index ? event.target.value : value))} type="number" value={advanceChances[index]} />
                          <b>%</b>
                        </span>
                      </label>
                    ))}
                    <button className="button secondary" disabled={busy || selectedRoom.status !== 'lobby'} onClick={saveChances} type="button"><Save size={17} /> 保存概率</button>
                  </div>
                </section>

                <section className="admin-board-panel">
                  <div className="board-editor-heading">
                    <div className="section-title"><p className="kicker">随机棋盘与逐格编辑</p><SquarePen size={18} /></div>
                    <div className="board-editor-actions">
                      <button className="button secondary" disabled={busy || selectedRoom.status !== 'lobby'} onClick={randomizeBoard} type="button"><Shuffle size={17} /> 重新随机全部 {selectedRoom.total_rounds ?? 3} 轮</button>
                    </div>
                  </div>
                  <div className="board-structure-editor">
                    <div className="structure-stepper">
                      <span>轮数</span>
                      <button aria-label="减少轮数" disabled={selectedRoom.status !== 'lobby' || totalRounds <= 1} onClick={() => setTotalRounds((value) => Math.max(1, value - 1))} title="减少轮数" type="button"><Minus size={15} /></button>
                      <strong>{totalRounds}</strong>
                      <button aria-label="增加轮数" disabled={selectedRoom.status !== 'lobby' || totalRounds >= MAX_ROUNDS} onClick={() => setTotalRounds((value) => Math.min(MAX_ROUNDS, value + 1))} title="增加轮数" type="button"><Plus size={15} /></button>
                    </div>
                    {roundSizes.slice(0, totalRounds).map((size, index) => (
                      <div className="structure-stepper" key={index}>
                        <span>{roundLabel(index + 1)}格子</span>
                        <button aria-label={`减少${roundLabel(index + 1)}格子`} disabled={selectedRoom.status !== 'lobby' || size <= MIN_BOARD_SIZE} onClick={() => setRoundSizes((values) => values.map((value, valueIndex) => valueIndex === index ? Math.max(MIN_BOARD_SIZE, value - 2) : value))} title="减少格子" type="button"><Minus size={15} /></button>
                        <input aria-label={`${roundLabel(index + 1)}格子数`} disabled={selectedRoom.status !== 'lobby'} max={MAX_BOARD_SIZE} min={MIN_BOARD_SIZE} onChange={(event) => setRoundSizes((values) => values.map((value, valueIndex) => valueIndex === index ? Number(event.target.value) : value))} step="2" type="number" value={size} />
                        <button aria-label={`增加${roundLabel(index + 1)}格子`} disabled={selectedRoom.status !== 'lobby' || size >= MAX_BOARD_SIZE} onClick={() => setRoundSizes((values) => values.map((value, valueIndex) => valueIndex === index ? Math.min(MAX_BOARD_SIZE, value + 2) : value))} title="增加格子" type="button"><Plus size={15} /></button>
                      </div>
                    ))}
                    <button className="button secondary" disabled={busy || selectedRoom.status !== 'lobby'} onClick={saveBoardStructure} type="button"><Save size={17} /> 保存棋盘结构</button>
                  </div>
                  <div className="layout-presets">
                    <div className="layout-presets-heading">
                      <span><Route size={15} /> 地图排布预设</span>
                      <button disabled={busy || selectedRoom.status !== 'lobby' || !layoutUndoRef.current.has(editorRound)} onClick={undoLayoutPreset} title="恢复应用预设前的排布" type="button"><RotateCcw size={14} /> 撤销预设</button>
                    </div>
                    <div className="layout-preset-grid">
                      {BOARD_LAYOUT_PRESETS.map((preset, index) => (
                        <button disabled={busy || selectedRoom.status !== 'lobby' || selectedRoundTiles.length === 0} key={preset.id} onClick={() => applyLayoutPreset(preset.id)} type="button">
                          <span className="layout-preset-index">0{index + 1}</span>
                          <span><strong>{preset.name}</strong><small>{preset.tag}</small></span>
                          <p>{preset.description}</p>
                          <ArrowUpRight size={15} />
                        </button>
                      ))}
                    </div>
                  </div>
                  <p className="probability-note">画布可无限平移缩放，格子支持任意像素位置与重叠。先选择格子，再在右侧围绕它新增两格或编辑路线。</p>
                  <div className="round-tabs" role="tablist" aria-label="选择编辑轮次">
                    {Array.from({ length: selectedRoom.total_rounds ?? 3 }, (_, index) => index + 1).map((round) => (
                      <button aria-selected={editorRound === round} className={editorRound === round ? 'active' : ''} key={round} onClick={() => setEditorRound(round)} role="tab" type="button">
                        {roundLabel(round)} <small>{roundBoardSize(selectedRoom, round)} 格</small>
                      </button>
                    ))}
                  </div>
                  <div className="tile-editor-layout">
                    {selectedRoundTiles.length > 0 && (
                      <Board
                        className="admin-board"
                        displayRound={editorRound}
                        edges={selectedRoundEdges}
                        onTileMove={moveTile}
                        onTileSelect={chooseTile}
                        players={NO_PLAYERS}
                        room={selectedRoom}
                        selectedTileId={selectedTileId}
                        tiles={roomTiles}
                      />
                    )}
                    {tileDraft ? (
                      <div className="tile-edit-form">
                        <div className="tile-edit-title">
                          <span>第 {tileDraft.position + 1} 格</span>
                          <span className="tile-edit-title-actions">
                            <strong>{roundLabel(tileDraft.round_number)}</strong>
                            <button disabled={busy || selectedRoom.status !== 'lobby' || selectedRoundTiles.length > MAX_BOARD_SIZE - 2} onClick={addTiles} type="button"><Plus size={14} /> 围绕此格添加 2 格</button>
                          </span>
                        </div>
                        <div className="tile-form-grid">
                          <label><span>完整名称</span><input disabled={selectedRoom.status !== 'lobby' || tileDraft.tile_type === 'start'} maxLength={40} onChange={(event) => setTileDraft({ ...tileDraft, name: event.target.value })} value={tileDraft.name} /></label>
                          <label><span>棋盘短名</span><input disabled={selectedRoom.status !== 'lobby' || tileDraft.tile_type === 'start'} maxLength={16} onChange={(event) => setTileDraft({ ...tileDraft, short_name: event.target.value })} value={tileDraft.short_name} /></label>
                          <label>
                            <span>格子分类</span>
                            <select disabled={selectedRoom.status !== 'lobby' || tileDraft.tile_type === 'start'} onChange={(event) => {
                              const tileType = event.target.value as TileType
                              setTileDraft({ ...tileDraft, tile_type: tileType, ...(tileType === 'empty' ? { effect_type: 'none' as TileEffect, effect_value: 0 } : {}) })
                            }} value={tileDraft.tile_type}>
                              {TILE_TYPES.filter((type) => type !== 'start').map((type) => <option key={type} value={type}>{TILE_TYPE_LABELS[type]}</option>)}
                              {tileDraft.tile_type === 'start' && <option value="start">起点</option>}
                            </select>
                          </label>
                          <label>
                            <span>实际效果</span>
                            <select disabled={selectedRoom.status !== 'lobby' || tileDraft.tile_type === 'empty' || tileDraft.tile_type === 'start'} onChange={(event) => {
                              const effectType = event.target.value as TileEffect
                              const needsZero = ['none', 'advance_chance', 'advance_round', 'finish'].includes(effectType)
                              const effectValue = needsZero ? 0 : isGuaranteeEffect(effectType)
                                ? effectType === 'guarantee_multiply' || effectType === 'guarantee_divide' ? 2 : 10
                                : Math.max(1, Math.abs(tileDraft.effect_value))
                              const nextTile = { ...tileDraft, effect_type: effectType, effect_value: effectValue }
                              setTileDraft(isGuaranteeEffect(effectType) ? applyGuaranteePreset(nextTile, effectType, effectValue) : nextTile)
                            }} value={tileDraft.effect_type}>
                              {availableEffects(tileDraft.round_number, (selectedRoom.total_rounds ?? 3) as GameRound).map((effect) => <option key={effect} value={effect}>{EFFECT_LABELS[effect]}</option>)}
                            </select>
                          </label>
                          <label className="tile-detail-field"><span>落格说明</span><textarea disabled={selectedRoom.status !== 'lobby' || tileDraft.tile_type === 'start'} maxLength={160} onChange={(event) => setTileDraft({ ...tileDraft, detail: event.target.value })} rows={3} value={tileDraft.detail} /></label>
                          {isGuaranteeEffect(tileDraft.effect_type) ? (
                            <label>
                              <span>保底变化</span>
                              <input
                                disabled={selectedRoom.status !== 'lobby'}
                                max={tileDraft.effect_type === 'guarantee_add' || tileDraft.effect_type === 'guarantee_subtract' ? 100000 : 10}
                                min={tileDraft.effect_type === 'guarantee_add' || tileDraft.effect_type === 'guarantee_subtract' ? 1 : 0}
                                onChange={(event) => {
                                  setTileDraft(applyGuaranteePreset(tileDraft, tileDraft.effect_type as GuaranteeEffect, Number(event.target.value)))
                                }}
                                step={tileDraft.effect_type === 'guarantee_add' || tileDraft.effect_type === 'guarantee_subtract' ? 1 : 'any'}
                                type="number"
                                value={tileDraft.effect_value || ''}
                              />
                              <small>{tileDraft.effect_type === 'guarantee_add' || tileDraft.effect_type === 'guarantee_subtract' ? '手动输入 1–100000 万整数' : '手动输入 0–10 倍，可使用小数，结果四舍五入'}，名称和说明会自动更新</small>
                            </label>
                          ) : (
                            <label><span>效果数值</span><input disabled={selectedRoom.status !== 'lobby' || ['none', 'advance_chance', 'advance_round', 'finish'].includes(tileDraft.effect_type)} onChange={(event) => setTileDraft({ ...tileDraft, effect_value: Number(event.target.value) })} type="number" value={tileDraft.effect_value} /><small>{effectValueHint(tileDraft.effect_type, tileDraft.round_number)}</small></label>
                          )}
                          <label className="tile-color-field">
                            <span>格子颜色</span>
                            <span className="color-control">
                              <input aria-label="选择格子颜色" disabled={selectedRoom.status !== 'lobby'} onChange={(event) => setTileDraft({ ...tileDraft, tile_color: event.target.value })} type="color" value={tileDraft.tile_color || '#1b1e18'} />
                              <input aria-label="格子颜色值" disabled={selectedRoom.status !== 'lobby'} maxLength={7} onChange={(event) => setTileDraft({ ...tileDraft, tile_color: /^#[0-9a-fA-F]{6}$/.test(event.target.value) ? event.target.value : tileDraft.tile_color })} value={tileDraft.tile_color || ''} placeholder="默认" />
                              <button aria-label="恢复默认颜色" disabled={selectedRoom.status !== 'lobby' || !tileDraft.tile_color} onClick={() => setTileDraft({ ...tileDraft, tile_color: null })} title="恢复默认颜色" type="button"><RotateCcw size={14} /></button>
                            </span>
                          </label>
                          <label><span>画布 X 坐标</span><input disabled={selectedRoom.status !== 'lobby'} max="100000" min="-100000" onChange={(event) => setTileDraft({ ...tileDraft, layout_x: Number(event.target.value) })} step="0.1" type="number" value={tileDraft.layout_x ?? getRoomTileCanvasPosition(tileDraft, selectedRoundTiles.findIndex((tile) => tile.id === tileDraft.id), selectedRoundTiles.length).x} /></label>
                          <label><span>画布 Y 坐标</span><input disabled={selectedRoom.status !== 'lobby'} max="100000" min="-100000" onChange={(event) => setTileDraft({ ...tileDraft, layout_y: Number(event.target.value) })} step="0.1" type="number" value={tileDraft.layout_y ?? getRoomTileCanvasPosition(tileDraft, selectedRoundTiles.findIndex((tile) => tile.id === tileDraft.id), selectedRoundTiles.length).y} /></label>
                          <label className="randomize-toggle">
                            <input checked={tileDraft.is_randomized} disabled={selectedRoom.status !== 'lobby' || tileDraft.tile_type === 'start'} onChange={(event) => setTileDraft({ ...tileDraft, is_randomized: event.target.checked })} type="checkbox" />
                            <span>重新随机时替换此格</span>
                            <small>导入设置后，未勾选的格子始终保持不变</small>
                          </label>
                        </div>
                        <div className="tile-image-library">
                          <div className="tile-image-library-heading">
                            <span><Images size={15} /> 公共图片库</span>
                            <button disabled={busy || selectedRoom.status !== 'lobby'} onClick={() => imageInputRef.current?.click()} type="button"><Plus size={14} /> 添加图片</button>
                            <input accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => chooseImageFile(event.target.files?.[0])} ref={imageInputRef} type="file" />
                          </div>
                          <div className="tile-image-list">
                            <button aria-pressed={!tileDraft.image_id} className={!tileDraft.image_id ? 'selected' : ''} disabled={busy || selectedRoom.status !== 'lobby'} onClick={() => assignTileImage(null)} type="button"><span className="tile-image-none"><X size={18} /></span><small>无图片</small></button>
                            {tileImages.map((image) => (
                              <div className={`tile-image-option ${tileDraft.image_id === image.id ? 'selected' : ''}`} key={image.id}>
                                <button aria-label={`使用图片 ${image.name}`} aria-pressed={tileDraft.image_id === image.id} disabled={busy || selectedRoom.status !== 'lobby'} onClick={() => assignTileImage(image)} type="button"><img alt="" src={image.public_url} /><small>{image.name}</small></button>
                                <button aria-label={`删除图片 ${image.name}`} className="tile-image-delete" disabled={busy || selectedRoom.status !== 'lobby'} onClick={() => deleteLibraryImage(image)} title="删除图片" type="button"><Trash2 size={13} /></button>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="tile-form-actions">
                          <button className="button primary" disabled={busy || selectedRoom.status !== 'lobby'} onClick={saveTile} type="button"><Save size={17} /> 保存格子内容</button>
                          <button className="button danger" disabled={busy || selectedRoom.status !== 'lobby' || tileDraft.tile_type === 'start' || selectedRoundTiles.length <= MIN_BOARD_SIZE} onClick={deleteTilePair} type="button"><Trash2 size={17} /> 删除选中及末格</button>
                        </div>
                        <div className="edge-editor">
                          <div className="edge-editor-title"><span>路线连接</span><Route size={16} /></div>
                          <div className="edge-create-row">
                            <select aria-label="路线终点" disabled={selectedRoom.status !== 'lobby'} onChange={(event) => setEdgeTargetId(event.target.value)} value={edgeTargetId}>
                              <option value="">选择终点格</option>
                              {selectedRoundTiles.filter((tile) => tile.id !== tileDraft.id).map((tile) => <option key={tile.id} value={tile.id}>第 {tile.position + 1} 格 · {tile.short_name}</option>)}
                            </select>
                            <div className="edge-direction" role="group" aria-label="路线方向">
                              <button className={!edgeBidirectional ? 'active' : ''} onClick={() => setEdgeBidirectional(false)} type="button"><ArrowRight size={15} /> 单向</button>
                              <button className={edgeBidirectional ? 'active' : ''} onClick={() => setEdgeBidirectional(true)} type="button"><ArrowLeft size={15} /><ArrowRight size={15} /> 双向</button>
                            </div>
                            <button className="button secondary" disabled={busy || selectedRoom.status !== 'lobby' || !edgeTargetId} onClick={addEdge} type="button"><ArrowUpRight size={16} /> 添加路线</button>
                          </div>
                          <div className="edge-list">
                            {selectedRoundEdges.filter((edge) => edge.from_tile_id === tileDraft.id || (edge.is_bidirectional && edge.to_tile_id === tileDraft.id)).map((edge) => {
                              const outgoing = edge.from_tile_id === tileDraft.id
                              const otherId = outgoing ? edge.to_tile_id : edge.from_tile_id
                              const other = selectedRoundTiles.find((tile) => tile.id === otherId)
                              return <div key={edge.id}><span>{edge.is_bidirectional ? '双向' : '单向'} · {outgoing ? '前往' : '来自'}第 {other ? other.position + 1 : '?'} 格</span><button aria-label="删除路线" disabled={busy || selectedRoom.status !== 'lobby'} onClick={() => deleteEdge(edge.id)} title="删除路线" type="button"><X size={14} /></button></div>
                            })}
                            {selectedRoundEdges.every((edge) => edge.from_tile_id !== tileDraft.id && (!edge.is_bidirectional || edge.to_tile_id !== tileDraft.id)) && <small>当前格子还没有可用出口</small>}
                          </div>
                        </div>
                      </div>
                    ) : <p className="admin-empty">这一轮还没有生成棋盘格。</p>}
                  </div>
                  {cropSource && <TileImageCropDialog name={cropSource.name} onCancel={cancelImageCrop} onConfirm={uploadCroppedImage} sourceUrl={cropSource.url} />}
                </section>

                <section className="admin-player-panel">
                  <div className="section-title"><p className="kicker">房间玩家</p><Users size={18} /></div>
                  <div className="admin-player-list">
                    {selectedPlayers.map((player, index) => (
                      <div className="admin-player-row" key={player.id}>
                        <PlayerAvatar index={index} player={player} />
                        <span><strong>{player.nickname}</strong><small>{player.role === 'boss' ? '老板' : '打手'}{player.user_id === selectedRoom.starting_player_id ? ' · 先手' : ''} · {player.is_ready ? '已准备' : '未准备'}</small></span>
                        <div className="admin-player-controls">
                          <select aria-label={`修改 ${player.nickname} 的身份`} className="admin-role-select" disabled={busy || selectedRoom.status === 'finished'} onChange={(event) => updatePlayerRole(player, event.target.value as PlayerRole)} value={player.role}>
                            <option value="boss">老板</option>
                            <option value="runner">打手</option>
                          </select>
                          {player.role === 'boss' && (
                            <div className="admin-resource-editor">
                              <Shield size={13} />
                              <input aria-label="老板保底数值" disabled={busy || selectedRoom.status === 'finished'} max={selectedRoom.status === 'lobby' ? 10000 : 1000000} min="0" onChange={(event) => setGuaranteeDrafts((current) => ({ ...current, [player.id]: event.target.value }))} type="number" value={guaranteeDrafts[player.id] ?? String(player.coins)} />
                              <small>万</small>
                              <button aria-label="保存老板保底" disabled={busy || selectedRoom.status === 'finished'} onClick={() => saveBossGuarantee(player)} title="保存保底" type="button"><Save size={14} /></button>
                            </div>
                          )}
                          <div className="admin-resource-editor">
                            <Dice5 size={13} />
                            <input aria-label={`${player.nickname} 的骰子数量`} disabled={busy || selectedRoom.status === 'finished'} max="20" min="0" onChange={(event) => setDiceDrafts((current) => ({ ...current, [player.id]: event.target.value }))} type="number" value={diceDrafts[player.id] ?? String(player.dice_count)} />
                            <small>个</small>
                            <button aria-label={`保存 ${player.nickname} 的骰子数量`} disabled={busy || selectedRoom.status === 'finished'} onClick={() => savePlayerDice(player)} title="保存骰子数量" type="button"><Save size={14} /></button>
                          </div>
                        </div>
                      </div>
                    ))}
                    {selectedPlayers.length === 0 && <p className="admin-empty">等待玩家使用房间码加入。</p>}
                  </div>
                </section>

                <section className="admin-settlement-panel">
                  <div className="section-title"><p className="kicker">全员骰子归零规则</p><Clipboard size={18} /></div>
                  <p className="probability-note">每次全员骰子重新归零时，累计汇总截至当时打手触发的全部遵守规则和老板当前保底。</p>
                  <div className="admin-settlement-list">
                    {selectedSettlementRules.map((rule) => (
                      <article className="admin-settlement-row" key={rule.id}>
                        <span className="settlement-number">{String(rule.sequence_number).padStart(2, '0')}</span>
                        <div>
                          <p>{rule.base_text}</p>
                          <label>
                            <span>手动后缀</span>
                            <input maxLength={200} onChange={(event) => setSuffixDrafts((current) => ({ ...current, [rule.id]: event.target.value }))} placeholder="例如：本条从下一局开始执行" value={suffixDrafts[rule.id] ?? rule.suffix} />
                          </label>
                        </div>
                        <button aria-label={`保存第 ${rule.sequence_number} 条规则后缀`} disabled={busy || (suffixDrafts[rule.id] ?? rule.suffix).trim() === rule.suffix} onClick={() => saveSettlementSuffix(rule)} title="保存后缀" type="button"><Save size={15} /></button>
                      </article>
                    ))}
                    {selectedSettlementRules.length === 0 && <p className="admin-empty">全员骰子第一次归零后，这里会自动生成规则。</p>}
                  </div>
                </section>

                <section className="admin-event-panel">
                  <div className="section-title"><p className="kicker">全部摇骰记录</p><Radio size={18} /></div>
                  <div className="admin-event-list">
                    {selectedEvents.map((event) => (
                      <div className="admin-event-row" key={event.id}>
                        <time>{new Date(event.created_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time>
                        <p>{event.message}</p>
                      </div>
                    ))}
                    {selectedEvents.length === 0 && <p className="admin-empty">暂无记录。</p>}
                  </div>
                </section>
              </>
            ) : (
              <div className="admin-detail-empty"><Settings2 size={34} /><p>创建或选择一个房间开始管理。</p></div>
            )}
          </section>
        </main>
      )}
    </div>
  )
}

function LobbyView({
  snapshot,
  busy,
  onReady,
  onProfileUpdate,
  onStart,
}: {
  snapshot: GameSnapshot
  busy: boolean
  onReady: () => void
  onProfileUpdate: (nickname: string, role: PlayerRole) => void
  onStart: () => void
}) {
  const currentPlayer = snapshot.players.find((player) => player.user_id === snapshot.userId)
  const [nicknameDraft, setNicknameDraft] = useState(currentPlayer?.nickname ?? '')
  const [roleDraft, setRoleDraft] = useState<PlayerRole>(currentPlayer?.role ?? 'runner')
  const boss = snapshot.players.find((player) => player.role === 'boss')
  const runners = snapshot.players.filter((player) => player.role === 'runner')
  const validLineup = Boolean(boss) && runners.length >= 1 && runners.length <= 2 && snapshot.players.length <= MAX_PLAYERS
  const rosterSlots = [
    { key: 'boss', label: '老板席', player: boss },
    { key: 'runner-1', label: '打手席 A', player: runners[0] },
    { key: 'runner-2', label: '打手席 B', player: runners[1] },
  ]

  useEffect(() => {
    setNicknameDraft(currentPlayer?.nickname ?? '')
    setRoleDraft(currentPlayer?.role ?? 'runner')
  }, [currentPlayer?.nickname, currentPlayer?.role])

  return (
    <div className="app-shell">
      <RoomHeader snapshot={snapshot} />
      <main className="lobby-layout">
        <section className="lobby-intro">
          <p className="eyebrow"><Radio size={14} /> 集结阶段</p>
          <h1>等待队员<br /><span>进入行动。</span></h1>
          <p>房间码 <strong>{snapshot.room.code}</strong></p>
          <div className="lobby-rule-line">
            <span><Flag size={17} /> {snapshot.room.total_rounds ?? 3} 轮推演</span>
            <span><Dice5 size={17} /> {roomBoardSizeSummary(snapshot.room)}</span>
            <span><Users size={17} /> 最多 3 人</span>
            <span><Radio size={17} /> 初始骰子 {snapshot.room.rolls_per_turn} 个</span>
          </div>
        </section>

        <section className="roster-panel">
          <div className="panel-heading">
            <div>
              <p className="kicker">行动小队</p>
              <h2>{snapshot.players.length} / {MAX_PLAYERS} 已加入</h2>
            </div>
            <Users size={22} />
          </div>

          <div className="player-list">
            {rosterSlots.map((slot) => {
              const playerIndex = slot.player ? snapshot.players.findIndex((item) => item.id === slot.player?.id) : 0
              return (
                <div className={`player-row ${slot.player ? '' : 'empty'}`} key={slot.key}>
                  {slot.player
                    ? <PlayerAvatar index={playerIndex} player={slot.player} />
                    : <span className="empty-avatar"><UserPlus size={14} /></span>}
                  <div className="player-info">
                    <strong>{slot.player?.nickname ?? `等待${slot.label}`}</strong>
                    <span>
                      {slot.label}{slot.player ? ` · ${slot.player.dice_count} 个骰子` : ''}
                      {slot.player?.user_id === snapshot.room.starting_player_id ? ' · 先手' : ''}
                      {slot.player?.user_id === snapshot.room.host_user_id ? ' · 房主' : ''}
                    </span>
                  </div>
                  <span className={`share-state ${slot.player ? 'filled' : ''}`}>{slot.player ? '已占用' : '空缺'}</span>
                  {slot.player && (
                    <span className={`ready-state ${slot.player.is_ready ? 'ready' : ''}`}>
                      {slot.player.is_ready ? <Check size={15} /> : <span className="waiting-dot" />}
                      {slot.player.is_ready ? '已准备' : '等待中'}
                    </span>
                  )}
                </div>
              )
            })}
          </div>

          {currentPlayer && (
            <div className="lobby-profile-editor">
              <label className="field">
                <span>行动代号</span>
                <input disabled={busy} maxLength={12} onChange={(event) => setNicknameDraft(event.target.value)} value={nicknameDraft} />
              </label>
              <fieldset className="role-field">
                <legend>开局身份</legend>
                <div className="segmented">
                  <button className={roleDraft === 'runner' ? 'active' : ''} disabled={busy} onClick={() => setRoleDraft('runner')} type="button"><Swords size={16} /> 打手</button>
                  <button className={roleDraft === 'boss' ? 'active' : ''} disabled={busy} onClick={() => setRoleDraft('boss')} type="button"><Crown size={16} /> 老板</button>
                </div>
              </fieldset>
              <button className="button secondary" disabled={busy || nicknameDraft.trim().length < 2 || nicknameDraft.trim().length > 12 || (nicknameDraft.trim() === currentPlayer.nickname && roleDraft === currentPlayer.role)} onClick={() => onProfileUpdate(nicknameDraft.trim(), roleDraft)} type="button"><Save size={17} /> 保存信息</button>
            </div>
          )}

          <div className="lobby-controls">
            <button className={`button ${currentPlayer?.is_ready ? 'secondary' : 'primary'}`} disabled={busy || snapshot.isDemo} onClick={onReady} type="button">
              <Shield size={18} /> {currentPlayer?.is_ready ? '取消准备' : '准备'}
            </button>
            {snapshot.isDemo ? (
              <button className="button primary" disabled={busy} onClick={onStart} type="button">
                {busy ? <LoaderCircle className="spin" size={18} /> : <Play size={18} />}
                开始试玩
              </button>
            ) : (
              <div className="admin-waiting"><Settings2 size={17} /> 等待管理员开始</div>
            )}
          </div>
          {snapshot.isDemo && <p className="inline-note">试玩房已自动准备，可直接开始。</p>}
          {!snapshot.isDemo && !validLineup && <p className="inline-note">至少需要 1 名老板和 1 名打手；满编为 1 老板 + 2 打手。</p>}
          {!snapshot.isDemo && validLineup && <p className="inline-note">全员准备后，由管理员在管理面板开始本局。</p>}
        </section>
      </main>
    </div>
  )
}

function TileImageCropDialog({
  sourceUrl,
  name,
  onCancel,
  onConfirm,
}: {
  sourceUrl: string
  name: string
  onCancel: () => void
  onConfirm: (blob: Blob, width: number, height: number, name: string) => Promise<void>
}) {
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [pixels, setPixels] = useState<Area | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function confirmCrop() {
    if (!pixels) return
    setBusy(true)
    setError('')
    try {
      const result = await cropTileImage(sourceUrl, pixels)
      await onConfirm(result.blob, result.width, result.height, name)
    } catch (cropError) {
      setError(formatError(cropError))
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop crop-dialog-backdrop" role="presentation">
      <section aria-labelledby="crop-dialog-title" aria-modal="true" className="crop-dialog" role="dialog">
        <div className="crop-dialog-title">
          <span><Images size={18} /></span>
          <div><p className="kicker">图片库 · 上传前处理</p><h2 id="crop-dialog-title">裁剪格子图片</h2></div>
          <button aria-label="关闭裁剪" disabled={busy} onClick={onCancel} title="关闭" type="button"><X size={18} /></button>
        </div>
        <div className="crop-workspace">
          <Cropper
            aspect={TILE_IMAGE_ASPECT}
            crop={crop}
            image={sourceUrl}
            onCropChange={setCrop}
            onCropComplete={(_, croppedPixels) => setPixels(croppedPixels)}
            onZoomChange={setZoom}
            showGrid
            zoom={zoom}
          />
        </div>
        <label className="crop-zoom"><span>缩放</span><input max="3" min="1" onChange={(event) => setZoom(Number(event.target.value))} step="0.01" type="range" value={zoom} /></label>
        {error && <p className="form-error">{error}</p>}
        <div className="crop-actions">
          <button className="button ghost" disabled={busy} onClick={onCancel} type="button"><X size={16} /> 取消</button>
          <button className="button primary" disabled={busy || !pixels} onClick={() => void confirmCrop()} type="button">{busy ? <LoaderCircle className="spin" size={16} /> : <Upload size={16} />} 裁剪、压缩并上传</button>
        </div>
      </section>
    </div>
  )
}

const Board = memo(function Board({
  players,
  room,
  tiles: allTiles,
  edges: allEdges,
  displayRound = room.current_round,
  className = '',
  selectedTileId,
  onTileSelect,
  onTileMove,
}: {
  players: Player[]
  room: Room
  tiles: RoomTile[]
  edges: RoomTileEdge[]
  displayRound?: GameRound
  className?: string
  selectedTileId?: string | null
  onTileSelect?: (tile: RoomTile) => void
  onTileMove?: (tile: RoomTile, x: number, y: number) => void
}) {
  const tiles = getRoundTiles(allTiles, displayRound)
  const edges = allEdges.filter((edge) => edge.round_number === displayRound)
  const bounds = getRoomBoardBounds(tiles)
  const stageRef = useRef<HTMLDivElement>(null)
  const boardRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef({ x: BOARD_VIEW_PADDING, y: BOARD_VIEW_PADDING, scale: 1 })
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(null)
  const tileDragRef = useRef<{
    pointerId: number
    tile: RoomTile
    element: HTMLButtonElement
    startX: number
    startY: number
    latestX: number
    latestY: number
    originX: number
    originY: number
    moved: boolean
    frame: number | null
  } | null>(null)
  const suppressTileClickRef = useRef(false)
  const zoomLabelRef = useRef<HTMLSpanElement>(null)
  const zoomOutButtonRef = useRef<HTMLButtonElement>(null)
  const zoomInButtonRef = useRef<HTMLButtonElement>(null)
  const [isDragging, setIsDragging] = useState(false)

  const tilePositions = useMemo(() => new Map(tiles.map((tile, index) => {
    const point = getRoomTileCanvasPosition(tile, index, tiles.length)
    return [tile.id, {
      x: point.x + BOARD_TILE_WIDTH / 2,
      y: point.y + BOARD_TILE_HEIGHT / 2,
    }]
  })), [tiles])

  const edgeLines = useMemo(() => edges.flatMap((edge) => {
    const from = tilePositions.get(edge.from_tile_id)
    const to = tilePositions.get(edge.to_tile_id)
    if (!from || !to) return []
    const dx = to.x - from.x
    const dy = to.y - from.y
    const distance = Math.hypot(dx, dy)
    if (distance < 1) return []
    const unitX = dx / distance
    const unitY = dy / distance
    const horizontalBoundary = Math.abs(unitX) > 0.001 ? BOARD_TILE_WIDTH / 2 / Math.abs(unitX) : Number.POSITIVE_INFINITY
    const verticalBoundary = Math.abs(unitY) > 0.001 ? BOARD_TILE_HEIGHT / 2 / Math.abs(unitY) : Number.POSITIVE_INFINITY
    const inset = Math.min(distance / 2 - 2, Math.min(horizontalBoundary, verticalBoundary) + 6)
    return [{ edge, x1: from.x + unitX * inset, y1: from.y + unitY * inset, x2: to.x - unitX * inset, y2: to.y - unitY * inset }]
  }), [edges, tilePositions])

  const applyBoardView = useCallback((view: { x: number; y: number; scale: number }, updateZoom = false) => {
    const nextView = view
    viewRef.current = nextView
    if (boardRef.current) {
      boardRef.current.style.transform = `translate3d(${nextView.x}px, ${nextView.y}px, 0) scale(${nextView.scale})`
    }
    if (stageRef.current) {
      const gridSize = 24 * nextView.scale
      stageRef.current.style.backgroundSize = `${gridSize}px ${gridSize}px`
      stageRef.current.style.backgroundPosition = `${nextView.x}px ${nextView.y}px`
    }
    if (updateZoom) {
      const percent = Math.round(nextView.scale * 100)
      if (zoomLabelRef.current) zoomLabelRef.current.textContent = `${percent}%`
      if (zoomOutButtonRef.current) zoomOutButtonRef.current.disabled = percent <= MIN_BOARD_ZOOM * 100
      if (zoomInButtonRef.current) zoomInButtonRef.current.disabled = percent >= MAX_BOARD_ZOOM * 100
    }
  }, [])

  const zoomBoard = useCallback((nextScale: number, clientX?: number, clientY?: number) => {
    const stage = stageRef.current
    if (!stage) return
    const current = viewRef.current
    const scale = Math.min(MAX_BOARD_ZOOM, Math.max(MIN_BOARD_ZOOM, nextScale))
    const rect = stage.getBoundingClientRect()
    const anchorX = clientX === undefined ? stage.clientWidth / 2 : clientX - rect.left
    const anchorY = clientY === undefined ? stage.clientHeight / 2 : clientY - rect.top
    applyBoardView({
      scale,
      x: anchorX - (anchorX - current.x) * (scale / current.scale),
      y: anchorY - (anchorY - current.y) * (scale / current.scale),
    }, true)
  }, [applyBoardView])

  const resetBoardView = useCallback(() => {
    const stage = stageRef.current
    if (!stage) return
    applyBoardView({
      x: Math.round((stage.clientWidth - bounds.width) / 2 - bounds.minX),
      y: Math.round((stage.clientHeight - bounds.height) / 2 - bounds.minY),
      scale: 1,
    }, true)
  }, [applyBoardView, bounds.height, bounds.minX, bounds.minY, bounds.width])

  const fitBoardView = useCallback(() => {
    const stage = stageRef.current
    if (!stage) return
    const scale = Math.min(
      1,
      Math.max(
        MIN_BOARD_ZOOM,
        Math.min(
          (stage.clientWidth - BOARD_VIEW_PADDING * 2) / bounds.width,
          (stage.clientHeight - BOARD_VIEW_PADDING * 2) / bounds.height,
        ),
      ),
    )
    applyBoardView({
      x: Math.round((stage.clientWidth - bounds.width * scale) / 2 - bounds.minX * scale),
      y: Math.round((stage.clientHeight - bounds.height * scale) / 2 - bounds.minY * scale),
      scale,
    }, true)
  }, [applyBoardView, bounds.height, bounds.minX, bounds.minY, bounds.width])

  useEffect(() => {
    const frame = window.requestAnimationFrame(resetBoardView)
    return () => window.cancelAnimationFrame(frame)
  }, [displayRound, tiles.length])

  useEffect(() => {
    const stage = stageRef.current
    if (!stage || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => applyBoardView(viewRef.current, true))
    observer.observe(stage)
    return () => observer.disconnect()
  }, [applyBoardView])

  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault()
      event.stopPropagation()
      zoomBoard(viewRef.current.scale + (event.deltaY < 0 ? 0.1 : -0.1), event.clientX, event.clientY)
    }
    stage.addEventListener('wheel', handleWheel, { passive: false })
    return () => stage.removeEventListener('wheel', handleWheel)
  }, [zoomBoard])

  useEffect(() => () => {
    const drag = tileDragRef.current
    if (drag?.frame !== null && drag?.frame !== undefined) window.cancelAnimationFrame(drag.frame)
  }, [])

  function startBoardDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: viewRef.current.x,
      originY: viewRef.current.y,
    }
    suppressTileClickRef.current = false
  }

  function moveBoard(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const deltaX = event.clientX - drag.startX
    const deltaY = event.clientY - drag.startY
    if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) {
      if (!suppressTileClickRef.current) {
        suppressTileClickRef.current = true
        event.currentTarget.setPointerCapture(event.pointerId)
        setIsDragging(true)
      }
    } else {
      return
    }
    applyBoardView({ ...viewRef.current, x: drag.originX + deltaX, y: drag.originY + deltaY })
  }

  function stopBoardDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId !== event.pointerId) return
    dragRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    setIsDragging(false)
    window.setTimeout(() => { suppressTileClickRef.current = false }, 0)
  }

  function startTileDrag(event: React.PointerEvent<HTMLButtonElement>, tile: RoomTile, index: number) {
    if (!onTileMove || event.button !== 0) return
    event.stopPropagation()
    const origin = getRoomTileCanvasPosition(tile, index, tiles.length)
    tileDragRef.current = {
      pointerId: event.pointerId,
      tile,
      element: event.currentTarget,
      startX: event.clientX,
      startY: event.clientY,
      latestX: event.clientX,
      latestY: event.clientY,
      originX: origin.x,
      originY: origin.y,
      moved: false,
      frame: null,
    }
    suppressTileClickRef.current = false
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function moveTileDrag(event: React.PointerEvent<HTMLButtonElement>) {
    const drag = tileDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    event.stopPropagation()
    drag.latestX = event.clientX
    drag.latestY = event.clientY
    if (!drag.moved && (Math.abs(event.clientX - drag.startX) > 3 || Math.abs(event.clientY - drag.startY) > 3)) {
      drag.moved = true
      suppressTileClickRef.current = true
      drag.element.classList.add('tile-dragging')
    }
    if (!drag.moved || drag.frame !== null) return
    drag.frame = window.requestAnimationFrame(() => {
      drag.frame = null
      const deltaX = (drag.latestX - drag.startX) / viewRef.current.scale
      const deltaY = (drag.latestY - drag.startY) / viewRef.current.scale
      drag.element.style.transform = `translate3d(${deltaX}px, ${deltaY}px, 0)`
    })
  }

  function stopTileDrag(event: React.PointerEvent<HTMLButtonElement>) {
    const drag = tileDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    event.stopPropagation()
    tileDragRef.current = null
    if (drag.frame !== null) {
      window.cancelAnimationFrame(drag.frame)
      drag.frame = null
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    if (!drag.moved || !onTileMove) return
    const deltaX = (event.clientX - drag.startX) / viewRef.current.scale
    const deltaY = (event.clientY - drag.startY) / viewRef.current.scale
    const nextX = Math.round((drag.originX + deltaX) * 10) / 10
    const nextY = Math.round((drag.originY + deltaY) * 10) / 10
    onTileMove(drag.tile, nextX, nextY)
    window.requestAnimationFrame(() => {
      drag.element.classList.remove('tile-dragging')
      drag.element.style.transform = ''
    })
    window.setTimeout(() => { suppressTileClickRef.current = false }, 0)
  }

  function cancelTileDrag(event: React.PointerEvent<HTMLButtonElement>) {
    const drag = tileDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    event.stopPropagation()
    tileDragRef.current = null
    if (drag.frame !== null) window.cancelAnimationFrame(drag.frame)
    drag.element.classList.remove('tile-dragging')
    drag.element.style.transform = ''
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    suppressTileClickRef.current = true
    window.setTimeout(() => { suppressTileClickRef.current = false }, 0)
  }

  return (
    <div className={`board-viewport ${className === 'admin-board' ? 'admin-board-viewport' : ''}`}>
      <div className="board-toolbar" aria-label="棋盘缩放工具">
        <button aria-label="缩小棋盘" onClick={() => zoomBoard(viewRef.current.scale - 0.2)} ref={zoomOutButtonRef} title="缩小" type="button"><ZoomOut size={16} /></button>
        <span aria-live="polite" ref={zoomLabelRef}>100%</span>
        <button aria-label="放大棋盘" onClick={() => zoomBoard(viewRef.current.scale + 0.2)} ref={zoomInButtonRef} title="放大" type="button"><ZoomIn size={16} /></button>
        <button aria-label="恢复棋盘原始大小" onClick={resetBoardView} title="恢复 100%" type="button"><Crosshair size={16} /></button>
        <button aria-label="让完整棋盘适应视图" onClick={fitBoardView} title="适应视图" type="button"><Maximize2 size={16} /></button>
      </div>
      <div
        className={`board-stage ${isDragging ? 'dragging' : ''}`}
        onPointerCancel={stopBoardDrag}
        onPointerDown={startBoardDrag}
        onPointerMove={moveBoard}
        onPointerUp={stopBoardDrag}
        ref={stageRef}
      >
        <div
          aria-label={`${roundLabel(displayRound)}行动棋盘`}
          className={`board ${className}`.trim()}
          ref={boardRef}
        >
          <svg aria-hidden="true" className="board-routes">
            <defs>
              <marker id={`route-arrow-${displayRound}-${className || 'player'}`} markerHeight="10" markerUnits="userSpaceOnUse" markerWidth="10" orient="auto-start-reverse" refX="8" refY="5" viewBox="0 0 10 10"><path d="M 0 0 L 10 5 L 0 10 z" /></marker>
            </defs>
            {edgeLines.map(({ edge, x1, y1, x2, y2 }) => <line
              className={edge.is_bidirectional ? 'route-line bidirectional' : 'route-line'}
              key={edge.id}
              markerEnd={`url(#route-arrow-${displayRound}-${className || 'player'})`}
              markerStart={edge.is_bidirectional ? `url(#route-arrow-${displayRound}-${className || 'player'})` : undefined}
              x1={x1} x2={x2} y1={y1} y2={y2}
            />)}
          </svg>
          {tiles.map((tile, index) => {
            const playersHere = players
              .map((player, playerIndex) => ({ player, playerIndex }))
              .filter(({ player }) => player.position === tile.position)
            const tileContent = (
              <>
                {tile.image_url && <><img alt="" className="tile-image" draggable={false} src={tile.image_url} /><span className="tile-image-shade" /></>}
                <span className="tile-number">{String(tile.position + 1).padStart(2, '0')}</span>
                <span className="tile-owner">{TILE_TYPE_LABELS[tile.tile_type]}</span>
                <strong>{tile.short_name}</strong>
                <small>{tile.detail}</small>
                <div className="tile-players">
                  {playersHere.map(({ player, playerIndex }) => (
                    <PlayerAvatar index={playerIndex} key={player.id} player={player} />
                  ))}
                </div>
              </>
            )
            const tileClassName = `tile tile-${tile.tile_type} ${selectedTileId === tile.id ? 'selected' : ''}`.trim()
            const canvasPosition = getRoomTileCanvasPosition(tile, index, tiles.length)
            const positionStyle = { left: canvasPosition.x, top: canvasPosition.y, ...tileColorStyle(tile) }
            return onTileSelect ? (
              <button
                aria-label={`编辑第 ${index + 1} 格：${tile.short_name}`}
                aria-pressed={selectedTileId === tile.id}
                className={tileClassName}
                key={tile.id}
                onPointerCancel={cancelTileDrag}
                onPointerDown={(event) => startTileDrag(event, tile, index)}
                onPointerMove={moveTileDrag}
                onPointerUp={stopTileDrag}
                onClick={() => {
                  if (!suppressTileClickRef.current && !tileDragRef.current) onTileSelect(tile)
                }}
                style={positionStyle}
                type="button"
              >
                {tileContent}
              </button>
            ) : (
              <div className={tileClassName} key={tile.id} style={positionStyle}>
                {tileContent}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
})

function GameView({
  snapshot,
  busy,
  dice,
  onRoll,
  onChooseRoute,
  onAddDemoDice,
  onRestart,
  onExit,
}: {
  snapshot: GameSnapshot
  busy: boolean
  dice: number | null
  onRoll: () => void
  onChooseRoute: (route: RouteOption) => void
  onAddDemoDice: () => void
  onRestart: () => void
  onExit: () => void
}) {
  const currentPlayer = snapshot.players.find((player) => player.user_id === snapshot.room.current_turn)
  const ownPlayer = snapshot.players.find((player) => player.user_id === snapshot.userId)
  const winner = snapshot.players.find((player) => player.user_id === snapshot.room.winner_id)
  const isMyTurn = snapshot.room.current_turn === snapshot.userId
  const waitingForDice = snapshot.room.status === 'playing' && snapshot.room.current_turn === null
  const routePending = snapshot.room.pending_player_id !== null
  const isChoosingRoute = snapshot.room.pending_player_id === snapshot.userId
  const sortedPlayers = useMemo(
    () => [...snapshot.players].sort((a, b) => b.distance - a.distance || a.turn_order - b.turn_order),
    [snapshot.players],
  )

  return (
    <div className="app-shell game-shell">
      <RoomHeader snapshot={snapshot} />
      <main className="game-layout">
        <section className="board-section">
          <div className="turn-strip">
            <div>
              <span className={`turn-indicator ${isMyTurn && !snapshot.room.is_paused ? 'active' : ''}`} />
              <p>{snapshot.room.is_paused ? '本局已暂停' : snapshot.room.status === 'finished' ? '行动结束' : waitingForDice ? snapshot.isDemo ? '试玩骰子已用完' : '等待管理员补充骰子' : isMyTurn ? '轮到你行动' : `等待 ${currentPlayer?.nickname ?? '队员'}`}</p>
            </div>
            <span>{roundLabel(snapshot.room.current_round)} · {snapshot.room.board_size} 格 · 当前骰子 {ownPlayer?.dice_count ?? 0} 个</span>
          </div>
          <Board edges={snapshot.edges} players={snapshot.players} room={snapshot.room} tiles={snapshot.tiles} />
          {routePending && (
            <section className="route-choice-panel" aria-live="polite">
              <div><Route size={19} /><strong>{isChoosingRoute ? `骰子为 ${snapshot.room.pending_dice}，请选择路线` : `等待 ${currentPlayer?.nickname ?? '当前玩家'} 选择路线`}</strong></div>
              {isChoosingRoute && <div className="route-options">
                {snapshot.room.pending_route_options.map((option, index) => {
                  const destination = snapshot.tiles.find((tile) => tile.id === option.tile_id)
                  const pathLabels = option.path.slice(1).map((tileId) => {
                    const tile = snapshot.tiles.find((item) => item.id === tileId)
                    return tile ? String(tile.position + 1) : '?'
                  }).join(' → ')
                  return <button disabled={busy} key={`${option.tile_id}-${index}`} onClick={() => onChooseRoute(option)} type="button"><span>路线 {index + 1}</span><strong>前往第 {option.position + 1} 格 · {destination?.short_name ?? '未知格'}</strong><small>{pathLabels}</small></button>
                })}
              </div>}
            </section>
          )}
        </section>

        <aside className="game-sidebar">
          <section className="dice-panel">
            <div className={`dice-face ${busy ? 'rolling' : ''}`} aria-label={dice ? `骰子点数 ${dice}` : '等待掷骰'}>
              {dice ?? <Dice5 size={34} />}
            </div>
            <div className="dice-actions">
              <button className="button primary roll-button" disabled={busy || routePending || snapshot.room.is_paused || !isMyTurn || snapshot.room.status !== 'playing' || (ownPlayer?.dice_count ?? 0) <= 0} onClick={onRoll} type="button">
                {busy ? <LoaderCircle className="spin" size={19} /> : <Dice5 size={19} />}
                <span>{snapshot.room.is_paused ? '等待管理员继续' : waitingForDice ? '等待补充骰子' : isMyTurn ? `掷骰行动 · 剩余 ${ownPlayer?.dice_count ?? 0}` : '等待回合'}</span>
              </button>
              {snapshot.isDemo && waitingForDice && (
                <button className="button secondary roll-button" onClick={onAddDemoDice} type="button"><Plus size={19} /><span>补充 1 个骰子</span></button>
              )}
            </div>
          </section>

          <section className="ranking-panel">
            <div className="section-title">
              <p className="kicker">玩家状态</p>
              <Flag size={18} />
            </div>
            <div className="ranking-list">
              {sortedPlayers.map((player) => {
                const originalIndex = snapshot.players.findIndex((item) => item.id === player.id)
                return (
                  <div className={`ranking-row ${player.user_id === snapshot.room.current_turn ? 'current' : ''}`} key={player.id}>
                    <span className="rank-number">{sortedPlayers.indexOf(player) + 1}</span>
                    <PlayerAvatar index={originalIndex} player={player} />
                    <div>
                      <strong>{player.nickname}</strong>
                      <small>
                        {player.role === 'boss' ? '老板' : '打手'} · 第 {player.position + 1} 格
                        {player.skip_turns > 0 ? ` · 暂停 ${player.skip_turns} 次` : ''}
                        {player.next_roll_modifier < 0 ? ` · 下回合少摇 ${Math.abs(player.next_roll_modifier)} 次` : ''}
                      </small>
                    </div>
                    <div className="player-resources">
                      <span className="dice-count"><small>骰子</small>{player.dice_count}</span>
                      {player.role === 'boss' && <span className="guarantee-score"><small>保底</small><span>{player.coins}<em>万</em></span></span>}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>

          <section className="log-panel">
            <div className="section-title">
              <p className="kicker">行动记录</p>
              <Radio size={17} />
            </div>
            <div className="event-list">
              {snapshot.events.slice(0, 8).map((event) => (
                <div className="event-row" key={event.id}>
                  <span />
                  <p>{event.message}</p>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </main>

      {snapshot.room.status === 'finished' && (
        <div className="modal-backdrop" role="presentation">
          <section aria-labelledby="winner-title" aria-modal="true" className="winner-dialog" role="dialog">
            <span className="winner-icon"><Crown size={34} /></span>
            <p className="kicker">AGREEMENT COMPLETE</p>
            <h2 id="winner-title">本局已经结束</h2>
            <p>{winner ? `${winner.nickname} 完成最终结算。` : '管理员已结束本局。'} 最终记录已保存在管理面板。</p>
            <div className="winner-actions">
              {snapshot.isDemo && <button className="button primary" onClick={onRestart} type="button"><RotateCcw size={18} /> 再来一局</button>}
              <button className="button secondary" onClick={onExit} type="button"><ArrowLeft size={18} /> 返回房间入口</button>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}

export default function App() {
  const [selectedMode, setSelectedMode] = useState<'monopoly' | null>(null)
  const [showAdmin, setShowAdmin] = useState(false)
  const [snapshot, setSnapshot] = useState<GameSnapshot | null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [dice, setDice] = useState<number | null>(null)

  const refreshRoom = useCallback(async (roomId: string, userId: string) => {
    try {
      const next = await fetchSnapshot(roomId, userId)
      localStorage.setItem(LAST_ROOM_CODE_KEY, next.room.code)
      const ownPlayer = next.players.find((player) => player.user_id === userId)
      if (ownPlayer) localStorage.setItem(NICKNAME_KEY, ownPlayer.nickname)
      if (next.room.is_paused) {
        localStorage.removeItem(ACTIVE_ROOM_KEY)
        setSelectedMode('monopoly')
        setSnapshot(null)
        setDice(null)
        setError('本局已被管理员暂停，继续后可使用原行动代号重新进入')
        return
      }
      setSnapshot(next)
    } catch (refreshError) {
      const message = formatError(refreshError)
      if (message.toLowerCase().includes('row') || message.toLowerCase().includes('multiple')) {
        localStorage.removeItem(ACTIVE_ROOM_KEY)
        setSnapshot(null)
      } else {
        setError(message)
      }
    }
  }, [])

  useEffect(() => {
    async function restore() {
      const roomId = localStorage.getItem(ACTIVE_ROOM_KEY)
      if (!roomId || !supabase) {
        setLoading(false)
        return
      }
      try {
        const { data } = await supabase.auth.getSession()
        if (!data.session?.user) {
          localStorage.removeItem(ACTIVE_ROOM_KEY)
          return
        }
        setSelectedMode('monopoly')
        await refreshRoom(roomId, data.session.user.id)
      } finally {
        setLoading(false)
      }
    }
    void restore()
  }, [refreshRoom])

  useEffect(() => {
    if (!snapshot || snapshot.isDemo || !supabase) return
    const client = supabase
    const roomId = snapshot.room.id
    const userId = snapshot.userId
    const channel = client
      .channel(`room-${roomId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` }, () => void refreshRoom(roomId, userId))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'room_players', filter: `room_id=eq.${roomId}` }, () => void refreshRoom(roomId, userId))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game_events', filter: `room_id=eq.${roomId}` }, () => void refreshRoom(roomId, userId))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'room_tiles', filter: `room_id=eq.${roomId}` }, () => void refreshRoom(roomId, userId))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'room_tile_edges', filter: `room_id=eq.${roomId}` }, () => void refreshRoom(roomId, userId))
      .subscribe()

    return () => {
      void client.removeChannel(channel)
    }
  }, [snapshot?.room.id, snapshot?.isDemo, snapshot?.userId, refreshRoom])

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' })
  }, [selectedMode, showAdmin, snapshot?.room.status])

  async function runAction(action: () => Promise<void>) {
    setBusy(true)
    setError('')
    try {
      await action()
    } catch (actionError) {
      setError(formatError(actionError))
    } finally {
      setBusy(false)
    }
  }

  function createDemo(nickname: string, role: PlayerRole) {
    setSnapshot(createDemoRoom(nickname, role))
    setDice(null)
    setError('')
  }

  function joinOnline(nickname: string, role: PlayerRole, code: string) {
    void runAction(async () => {
      if (!supabase) throw new Error('请先完成 Supabase 配置')
      const user = await ensureOnlineUser()
      const { data, error: rpcError } = await supabase.rpc('join_room', { p_code: code, p_nickname: nickname, p_role: role })
      if (rpcError) throw rpcError
      const result = Array.isArray(data) ? data[0] : data
      if (!result?.room_id) throw new Error('未找到该房间')
      localStorage.setItem(ACTIVE_ROOM_KEY, result.room_id)
      localStorage.setItem(LAST_ROOM_CODE_KEY, result.room_code ?? code)
      const next = await fetchSnapshot(result.room_id, user.id)
      if (next.room.is_paused) {
        localStorage.removeItem(ACTIVE_ROOM_KEY)
        throw new Error('本局已被管理员暂停，暂时无法进入')
      }
      setSnapshot(next)
    })
  }

  function toggleReady() {
    if (!snapshot || snapshot.isDemo || !supabase) return
    const client = supabase
    const player = snapshot.players.find((item) => item.user_id === snapshot.userId)
    void runAction(async () => {
      const { error: rpcError } = await client.rpc('set_ready', {
        p_room_id: snapshot.room.id,
        p_ready: !player?.is_ready,
      })
      if (rpcError) throw rpcError
      await refreshRoom(snapshot.room.id, snapshot.userId)
    })
  }

  function updateLobbyProfile(nickname: string, role: PlayerRole) {
    if (!snapshot || snapshot.room.status !== 'lobby') return
    if (nickname.length < 2 || nickname.length > 12) {
      setError('行动代号需要 2–12 个字符')
      return
    }
    if (snapshot.isDemo) {
      setSnapshot((current) => {
        if (!current || current.room.status !== 'lobby') return current
        return {
          ...current,
          players: current.players.map((player) => player.user_id === current.userId
            ? { ...player, nickname, role, coins: role === 'boss' ? current.room.base_guarantee : 0 }
            : player),
        }
      })
      localStorage.setItem(NICKNAME_KEY, nickname)
      return
    }
    if (!supabase) return
    const client = supabase
    void runAction(async () => {
      const { error: rpcError } = await client.rpc('update_lobby_player', {
        p_room_id: snapshot.room.id,
        p_nickname: nickname,
        p_role: role,
      })
      if (rpcError) throw rpcError
      localStorage.setItem(NICKNAME_KEY, nickname)
      await refreshRoom(snapshot.room.id, snapshot.userId)
    })
  }

  function startGame() {
    if (snapshot?.isDemo) setSnapshot(startDemoGame(snapshot))
  }

  function rollDice() {
    if (!snapshot) return
    if (snapshot.isDemo) {
      setBusy(true)
      window.setTimeout(() => {
        const result = rollDemoDice(snapshot)
        setDice(result.dice)
        setSnapshot(result.snapshot)
        setBusy(false)
      }, 520)
      return
    }
    if (!supabase) return
    const client = supabase
    void runAction(async () => {
      const { data, error: rpcError } = await client.rpc('roll_dice', { p_room_id: snapshot.room.id })
      if (rpcError) throw rpcError
      const result = Array.isArray(data) ? data[0] : data
      setDice(result?.dice_value ?? null)
      await refreshRoom(snapshot.room.id, snapshot.userId)
    })
  }

  function chooseRoute(route: RouteOption) {
    if (!snapshot || snapshot.isDemo || !supabase) return
    const client = supabase
    void runAction(async () => {
      const { error: rpcError } = await client.rpc('choose_route', {
        p_room_id: snapshot.room.id,
        p_path: route.path,
      })
      if (rpcError) throw rpcError
      await refreshRoom(snapshot.room.id, snapshot.userId)
    })
  }

  function clearLocalRoom() {
    localStorage.removeItem(ACTIVE_ROOM_KEY)
    setSnapshot(null)
    setDice(null)
    setError('')
  }

  function exitRoom() {
    clearLocalRoom()
  }

  function restartDemo() {
    if (!snapshot) return
    const player = snapshot.players[0]
    const fresh = createDemoRoom(player.nickname, player.role)
    setSnapshot(startDemoGame(fresh))
    setDice(null)
  }

  function addDemoDice() {
    setSnapshot((current) => {
      if (!current?.isDemo || current.room.status !== 'playing') return current
      const player = current.players[0]
      const nextCount = Math.min(20, player.dice_count + 1)
      return {
        ...current,
        room: { ...current.room, current_turn: player.user_id, rolls_remaining: nextCount },
        players: [{ ...player, dice_count: nextCount }],
        events: [{
          id: crypto.randomUUID(),
          room_id: current.room.id,
          message: `${player.nickname} 在试玩模式补充了 1 个骰子`,
          created_at: new Date().toISOString(),
        }, ...current.events],
      }
    })
  }

  if (loading) {
    return <div className="loading-screen"><Logo /><LoaderCircle className="spin" size={28} /></div>
  }

  if (showAdmin && !snapshot) {
    return <AdminPanel onBack={() => setShowAdmin(false)} />
  }

  return (
    <>
      {!snapshot && !selectedMode && <ModeHub onSelect={() => setSelectedMode('monopoly')} />}
      {!snapshot && selectedMode === 'monopoly' && (
        <MonopolyEntry
          busy={busy}
          onBack={() => setSelectedMode(null)}
          onAdmin={() => setShowAdmin(true)}
          onDemo={createDemo}
          onJoin={joinOnline}
        />
      )}
      {snapshot?.room.status === 'lobby' && (
        <LobbyView busy={busy} onProfileUpdate={updateLobbyProfile} onReady={toggleReady} onStart={startGame} snapshot={snapshot} />
      )}
      {snapshot && snapshot.room.status !== 'lobby' && (
        <GameView busy={busy} dice={dice} onAddDemoDice={addDemoDice} onChooseRoute={chooseRoute} onExit={exitRoom} onRestart={restartDemo} onRoll={rollDice} snapshot={snapshot} />
      )}
      {error && (
        <div className="toast" role="alert">
          <span>{error}</span>
          <button aria-label="关闭提示" onClick={() => setError('')} type="button">×</button>
        </div>
      )}
    </>
  )
}
