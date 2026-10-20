import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Clipboard,
  Crosshair,
  Crown,
  Dice5,
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
  UserPlus,
  Users,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react'
import {
  EFFECT_LABELS,
  getBoardDimensions,
  getBoardGridPosition,
  getRoundTiles,
  PLAYER_COLORS,
  TILE_TYPE_LABELS,
} from './lib/board'
import { createDemoRoom, rollDemoDice, startDemoGame } from './lib/demoGame'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import type {
  GameEvent,
  GameRound,
  GameSnapshot,
  Player,
  PlayerRole,
  Room,
  RoomTile,
  TileEffect,
  TileType,
} from './types'

const ACTIVE_ROOM_KEY = 'delta-monopoly-active-room'
const NICKNAME_KEY = 'delta-monopoly-nickname'
const LAST_ROOM_CODE_KEY = 'delta-monopoly-last-room-code'
const MAX_PLAYERS = 3
const ROUND_LABELS: Record<GameRound, string> = { 1: '第一轮', 2: '第二轮', 3: '第三轮' }
const TILE_TYPES = Object.keys(TILE_TYPE_LABELS) as TileType[]
const TILE_EFFECTS = Object.keys(EFFECT_LABELS) as TileEffect[]

function effectValueHint(effect: TileEffect, round: GameRound) {
  if (effect === 'move') return `正数前进、负数后退，本轮最多 ${round === 1 ? 2 : round === 2 ? 3 : 5} 格`
  if (effect === 'coins') return '正数增加保障，负数扣减保障'
  if (effect === 'skip') return `暂停次数，最多 ${round === 1 ? 1 : 2} 次`
  if (effect === 'extra_roll' || effect === 'lose_roll') return '掷骰次数，允许 1–2 次'
  if (effect === 'advance_chance' || effect === 'advance_round') return '只允许第一轮和第二轮使用；是否落到本格由本轮晋级概率控制'
  if (effect === 'finish') return '只允许第三轮使用'
  return '此效果不需要填写数值'
}

function availableEffects(round: GameRound) {
  return TILE_EFFECTS.filter((effect) => round === 3
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
  const [roomResult, playersResult, eventsResult, tilesResult] = await Promise.all([
    supabase.from('rooms').select('*').eq('id', roomId).single(),
    supabase.from('room_players').select('*').eq('room_id', roomId).order('turn_order'),
    supabase.from('game_events').select('*').eq('room_id', roomId).order('created_at', { ascending: false }).limit(40),
    supabase.from('room_tiles').select('*').eq('room_id', roomId).order('round_number').order('position'),
  ])

  if (roomResult.error) throw roomResult.error
  if (playersResult.error) throw playersResult.error
  if (eventsResult.error) throw eventsResult.error
  if (tilesResult.error) throw tilesResult.error

  return {
    room: roomResult.data as Room,
    players: playersResult.data as Player[],
    events: eventsResult.data as GameEvent[],
    tiles: tilesResult.data as RoomTile[],
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
                <span>每个房间自动生成不同棋盘，在移动、暂停与护航条款之间完成三轮推演。</span>
              </span>
              <span className="mode-card-footer">
                <span>三轮棋盘 · 最多 3 人</span>
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
          <p className="hero-subtitle">三轮随机棋盘逐步扩张，每个房间都有不同的移动、回合和护航规则。</p>
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
          <p className="role-help">首次加入时选择席位；重新进入时自动恢复原身份。</p>
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

function RoomHeader({ snapshot, onExit }: { snapshot: GameSnapshot; onExit: () => void }) {
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
        <button aria-label="暂离房间" className="icon-button" onClick={onExit} title="暂离房间（保留席位）" type="button">
          <ArrowLeft size={19} />
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
  const [error, setError] = useState('')
  const [rooms, setRooms] = useState<Room[]>([])
  const [newRoomName, setNewRoomName] = useState('')
  const [players, setPlayers] = useState<Player[]>([])
  const [events, setEvents] = useState<GameEvent[]>([])
  const [roomTiles, setRoomTiles] = useState<RoomTile[]>([])
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null)
  const [roomPendingDelete, setRoomPendingDelete] = useState<string | null>(null)
  const [round1Chance, setRound1Chance] = useState('35')
  const [round2Chance, setRound2Chance] = useState('30')
  const [startingPlayerId, setStartingPlayerId] = useState('')
  const [rollsPerTurn, setRollsPerTurn] = useState('1')
  const [editorRound, setEditorRound] = useState<GameRound>(1)
  const [selectedTileId, setSelectedTileId] = useState<string | null>(null)
  const [tileDraft, setTileDraft] = useState<RoomTile | null>(null)

  const selectedRoom = rooms.find((room) => room.id === selectedRoomId) ?? null
  const selectedPlayers = players.filter((player) => player.room_id === selectedRoomId)
  const selectedEvents = events.filter((event) => event.room_id === selectedRoomId)
  const selectedRoundTiles = roomTiles
    .filter((tile) => tile.room_id === selectedRoomId && tile.round_number === editorRound)
    .sort((a, b) => a.position - b.position)
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
    setRoomTiles(data as RoomTile[])
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
        if (selectedRoomId) void loadRoomTiles(selectedRoomId)
      })
      .subscribe()

    return () => {
      void client.removeChannel(channel)
    }
  }, [authorized, loadDashboard, loadRoomEvents, loadRoomTiles, selectedRoomId])

  useEffect(() => {
    if (!authorized) return
    if (!selectedRoomId) {
      setEvents([])
      setRoomTiles([])
      return
    }
    void Promise.all([loadRoomEvents(selectedRoomId), loadRoomTiles(selectedRoomId)])
      .catch((loadError) => setError(formatError(loadError)))
  }, [authorized, loadRoomEvents, loadRoomTiles, selectedRoomId])

  useEffect(() => {
    if (!selectedRoom) return
    setRound1Chance(String(selectedRoom.round1_advance_chance))
    setRound2Chance(String(selectedRoom.round2_advance_chance))
    setStartingPlayerId(selectedRoom.starting_player_id ?? '')
    setRollsPerTurn(String(selectedRoom.rolls_per_turn))
  }, [
    selectedRoom?.id,
    selectedRoom?.round1_advance_chance,
    selectedRoom?.round2_advance_chance,
    selectedRoom?.rolls_per_turn,
    selectedRoom?.starting_player_id,
  ])

  useEffect(() => {
    setRoomPendingDelete(null)
    setCodeCopied(false)
  }, [selectedRoomId])

  useEffect(() => {
    const nextTile = selectedRoundTiles.find((tile) => tile.id === selectedTileId) ?? selectedRoundTiles[0] ?? null
    setSelectedTileId(nextTile?.id ?? null)
    setTileDraft(nextTile ? { ...nextTile } : null)
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
      setRoomTiles([])
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
      const first = Number(round1Chance)
      const second = Number(round2Chance)
      if (!Number.isInteger(first) || first < 0 || first > 100 || !Number.isInteger(second) || second < 0 || second > 100) {
        throw new Error('晋级概率必须是 0–100 的整数')
      }
      const { error: rpcError } = await supabase.rpc('admin_update_round_chances', {
        p_room_id: selectedRoom.id,
        p_round1_chance: first,
        p_round2_chance: second,
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
      if (!Number.isInteger(rollCount) || rollCount < 1 || rollCount > 5) {
        throw new Error('每回合掷骰次数必须是 1–5 的整数')
      }
      if (startingPlayerId && !selectedPlayers.some((player) => player.user_id === startingPlayerId)) {
        throw new Error('首位玩家必须在当前房间中')
      }
      const { error: rpcError } = await supabase.rpc('admin_update_room_settings', {
        p_room_id: selectedRoom.id,
        p_starting_player_id: startingPlayerId || null,
        p_rolls_per_turn: rollCount,
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

  function chooseTile(tile: RoomTile) {
    setSelectedTileId(tile.id)
    setTileDraft({ ...tile })
  }

  function saveTile() {
    if (!selectedRoom || !tileDraft) return
    void runAdminAction(async () => {
      if (!supabase) return
      const effectValue = Number(tileDraft.effect_value)
      if (!tileDraft.name.trim() || !tileDraft.short_name.trim() || !tileDraft.detail.trim()) {
        throw new Error('格子名称、棋盘短名和说明都不能为空')
      }
      if (!Number.isInteger(effectValue)) throw new Error('效果数值必须是整数')
      const { error: rpcError } = await supabase.rpc('admin_update_room_tile', {
        p_tile_id: tileDraft.id,
        p_name: tileDraft.name.trim(),
        p_short_name: tileDraft.short_name.trim(),
        p_tile_type: tileDraft.tile_type,
        p_detail: tileDraft.detail.trim(),
        p_effect_type: tileDraft.effect_type,
        p_effect_value: effectValue,
      })
      if (rpcError) throw rpcError
      await loadRoomTiles(selectedRoom.id)
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

  function adjustPlayerDice(playerId: string, delta: -1 | 1) {
    if (!selectedRoom) return
    void runAdminAction(async () => {
      if (!supabase) return
      const { error: rpcError } = await supabase.rpc('admin_adjust_player_dice', {
        p_room_id: selectedRoom.id,
        p_player_id: playerId,
        p_delta: delta,
      })
      if (rpcError) throw rpcError
      await loadDashboard()
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

  if (checking) {
    return <div className="loading-screen"><Logo /><LoaderCircle className="spin" size={28} /></div>
  }

  return (
    <div className="admin-page">
      <header className="portal-header">
        <Logo />
        <button className="back-link" onClick={onBack} type="button"><ArrowLeft size={17} /> 返回玩家入口</button>
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
                    <span><strong>{room.name}</strong><small>{room.code} · {count}/3 人 · {ROUND_LABELS[room.current_round]}</small></span>
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

                <div className="admin-summary-strip">
                  <span><small>状态</small><strong>{roomStatusLabel(selectedRoom)}</strong></span>
                  <span><small>当前轮次</small><strong>{ROUND_LABELS[selectedRoom.current_round]}</strong></span>
                  <span><small>玩家</small><strong>{selectedPlayers.length} / 3</strong></span>
                  <span><small>每回合掷骰</small><strong>{selectedRoom.rolls_per_turn} 次</strong></span>
                </div>

                <section className="admin-turn-panel">
                  <div className="section-title"><p className="kicker">回合设置</p><SlidersHorizontal size={18} /></div>
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
                      <span>每回合连续掷骰次数</span>
                      <input disabled={selectedRoom.status !== 'lobby'} max="5" min="1" onChange={(event) => setRollsPerTurn(event.target.value)} type="number" value={rollsPerTurn} />
                    </label>
                    <button className="button secondary" disabled={busy || selectedRoom.status !== 'lobby'} onClick={saveRoomSettings} type="button"><Save size={17} /> 保存回合设置</button>
                  </div>
                </section>

                <section className="admin-probability-panel">
                  <div className="section-title"><p className="kicker">每次掷骰晋级概率</p><Settings2 size={18} /></div>
                  <div className="probability-grid">
                    <label><span>第一轮 → 第二轮</span><span className="percent-input"><input max="100" min="0" onChange={(event) => setRound1Chance(event.target.value)} type="number" value={round1Chance} /><b>%</b></span></label>
                    <label><span>第二轮 → 第三轮</span><span className="percent-input"><input max="100" min="0" onChange={(event) => setRound2Chance(event.target.value)} type="number" value={round2Chance} /><b>%</b></span></label>
                    <button className="button secondary" disabled={busy || selectedRoom.status !== 'lobby'} onClick={saveChances} type="button"><Save size={17} /> 保存概率</button>
                  </div>
                </section>

                <section className="admin-board-panel">
                  <div className="board-editor-heading">
                    <div className="section-title"><p className="kicker">随机棋盘与逐格编辑</p><SquarePen size={18} /></div>
                    <button className="button secondary" disabled={busy || selectedRoom.status !== 'lobby'} onClick={randomizeBoard} type="button"><Shuffle size={17} /> 重新随机全部三轮</button>
                  </div>
                  <div className="round-tabs" role="tablist" aria-label="选择编辑轮次">
                    {([1, 2, 3] as GameRound[]).map((round) => (
                      <button aria-selected={editorRound === round} className={editorRound === round ? 'active' : ''} key={round} onClick={() => setEditorRound(round)} role="tab" type="button">
                        {ROUND_LABELS[round]} <small>{round === 1 ? 8 : round === 2 ? 12 : 24} 格</small>
                      </button>
                    ))}
                  </div>
                  <div className="tile-editor-layout">
                    <div className="admin-tile-list">
                      {selectedRoundTiles.map((tile) => (
                        <button className={`${selectedTileId === tile.id ? 'active' : ''} tile-kind-${tile.tile_type}`} key={tile.id} onClick={() => chooseTile(tile)} type="button">
                          <span>{String(tile.position + 1).padStart(2, '0')}</span>
                          <strong>{tile.short_name}</strong>
                          <small>{EFFECT_LABELS[tile.effect_type]}</small>
                        </button>
                      ))}
                    </div>
                    {tileDraft ? (
                      <div className="tile-edit-form">
                        <div className="tile-edit-title">
                          <span>第 {tileDraft.position + 1} 格</span>
                          <strong>{ROUND_LABELS[tileDraft.round_number]}</strong>
                        </div>
                        <div className="tile-form-grid">
                          <label><span>完整名称</span><input disabled={selectedRoom.status !== 'lobby'} maxLength={40} onChange={(event) => setTileDraft({ ...tileDraft, name: event.target.value })} value={tileDraft.name} /></label>
                          <label><span>棋盘短名</span><input disabled={selectedRoom.status !== 'lobby'} maxLength={16} onChange={(event) => setTileDraft({ ...tileDraft, short_name: event.target.value })} value={tileDraft.short_name} /></label>
                          <label>
                            <span>格子分类</span>
                            <select disabled={selectedRoom.status !== 'lobby'} onChange={(event) => {
                              const tileType = event.target.value as TileType
                              setTileDraft({ ...tileDraft, tile_type: tileType, ...(tileType === 'empty' ? { effect_type: 'none' as TileEffect, effect_value: 0 } : {}) })
                            }} value={tileDraft.tile_type}>
                              {TILE_TYPES.map((type) => <option key={type} value={type}>{TILE_TYPE_LABELS[type]}</option>)}
                            </select>
                          </label>
                          <label>
                            <span>实际效果</span>
                            <select disabled={selectedRoom.status !== 'lobby' || tileDraft.tile_type === 'empty'} onChange={(event) => {
                              const effectType = event.target.value as TileEffect
                              const needsZero = ['none', 'advance_chance', 'advance_round', 'finish'].includes(effectType)
                              setTileDraft({ ...tileDraft, effect_type: effectType, effect_value: needsZero ? 0 : Math.max(1, Math.abs(tileDraft.effect_value)) })
                            }} value={tileDraft.effect_type}>
                              {availableEffects(tileDraft.round_number).map((effect) => <option key={effect} value={effect}>{EFFECT_LABELS[effect]}</option>)}
                            </select>
                          </label>
                          <label className="tile-detail-field"><span>落格说明</span><textarea disabled={selectedRoom.status !== 'lobby'} maxLength={160} onChange={(event) => setTileDraft({ ...tileDraft, detail: event.target.value })} rows={3} value={tileDraft.detail} /></label>
                          <label><span>效果数值</span><input disabled={selectedRoom.status !== 'lobby' || ['none', 'advance_chance', 'advance_round', 'finish'].includes(tileDraft.effect_type)} onChange={(event) => setTileDraft({ ...tileDraft, effect_value: Number(event.target.value) })} type="number" value={tileDraft.effect_value} /><small>{effectValueHint(tileDraft.effect_type, tileDraft.round_number)}</small></label>
                        </div>
                        <button className="button primary full" disabled={busy || selectedRoom.status !== 'lobby'} onClick={saveTile} type="button"><Save size={17} /> 保存这个格子</button>
                      </div>
                    ) : <p className="admin-empty">这一轮还没有生成棋盘格。</p>}
                  </div>
                </section>

                <section className="admin-player-panel">
                  <div className="section-title"><p className="kicker">房间玩家</p><Users size={18} /></div>
                  <div className="admin-player-list">
                    {selectedPlayers.map((player, index) => (
                      <div className="admin-player-row" key={player.id}>
                        <PlayerAvatar index={index} player={player} />
                        <span><strong>{player.nickname}</strong><small>{player.role === 'boss' ? '老板' : '打手'}{player.user_id === selectedRoom.starting_player_id ? ' · 先手' : ''} · {player.is_ready ? '已准备' : '未准备'}</small></span>
                        <div className="admin-dice-stepper">
                          <button aria-label={`减少 ${player.nickname} 的骰子`} disabled={busy || selectedRoom.status === 'finished' || player.dice_count <= 1} onClick={() => adjustPlayerDice(player.id, -1)} title="减少 1 个骰子" type="button"><Minus size={14} /></button>
                          <strong><Dice5 size={13} /> {player.dice_count}</strong>
                          <button aria-label={`增加 ${player.nickname} 的骰子`} disabled={busy || selectedRoom.status === 'finished' || player.dice_count >= 20} onClick={() => adjustPlayerDice(player.id, 1)} title="增加 1 个骰子" type="button"><Plus size={14} /></button>
                        </div>
                      </div>
                    ))}
                    {selectedPlayers.length === 0 && <p className="admin-empty">等待玩家使用房间码加入。</p>}
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
  onStart,
  onExit,
}: {
  snapshot: GameSnapshot
  busy: boolean
  onReady: () => void
  onStart: () => void
  onExit: () => void
}) {
  const currentPlayer = snapshot.players.find((player) => player.user_id === snapshot.userId)
  const boss = snapshot.players.find((player) => player.role === 'boss')
  const runners = snapshot.players.filter((player) => player.role === 'runner')
  const validLineup = Boolean(boss) && runners.length >= 1 && runners.length <= 2 && snapshot.players.length <= MAX_PLAYERS
  const rosterSlots = [
    { key: 'boss', label: '老板席', player: boss },
    { key: 'runner-1', label: '打手席 A', player: runners[0] },
    { key: 'runner-2', label: '打手席 B', player: runners[1] },
  ]

  return (
    <div className="app-shell">
      <RoomHeader onExit={onExit} snapshot={snapshot} />
      <main className="lobby-layout">
        <section className="lobby-intro">
          <p className="eyebrow"><Radio size={14} /> 集结阶段</p>
          <h1>等待队员<br /><span>进入行动。</span></h1>
          <p>房间码 <strong>{snapshot.room.code}</strong></p>
          <div className="lobby-rule-line">
            <span><Flag size={17} /> 三轮推演</span>
            <span><Dice5 size={17} /> 8 → 12 → 24 格</span>
            <span><Users size={17} /> 最多 3 人</span>
            <span><Radio size={17} /> 每回合 {snapshot.room.rolls_per_turn} 次</span>
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

function Board({ players, room, tiles: allTiles }: { players: Player[]; room: Room; tiles: RoomTile[] }) {
  const tiles = getRoundTiles(allTiles, room.current_round)
  const dimensions = getBoardDimensions(tiles.length)

  return (
    <div
      aria-label={`${ROUND_LABELS[room.current_round]}行动棋盘`}
      className={`board board-size-${tiles.length}`}
      style={{
        '--board-columns': dimensions.columns,
        '--board-rows': dimensions.rows,
      } as React.CSSProperties}
    >
      {tiles.map((tile, index) => {
        const playersHere = players
          .map((player, playerIndex) => ({ player, playerIndex }))
          .filter(({ player }) => player.position === index)
        return (
          <div className={`tile tile-${tile.tile_type}`} key={tile.id} style={getBoardGridPosition(index, tiles.length)}>
            <span className="tile-number">{String(index + 1).padStart(2, '0')}</span>
            <span className="tile-owner">{TILE_TYPE_LABELS[tile.tile_type]}</span>
            <strong>{tile.short_name}</strong>
            <small>{tile.detail}</small>
            <div className="tile-players">
              {playersHere.map(({ player, playerIndex }) => (
                <PlayerAvatar index={playerIndex} key={player.id} player={player} />
              ))}
            </div>
          </div>
        )
      })}
      <div
        className="board-center"
        data-round={room.current_round}
        style={{ gridColumn: `2 / ${dimensions.columns}`, gridRow: `2 / ${dimensions.rows}` }}
      >
        <span className="center-mark"><span /></span>
        <p>{ROUND_LABELS[room.current_round]} · {tiles.length} CELLS</p>
        <strong>护航协议局</strong>
        <small>每个房间使用独立随机棋盘</small>
      </div>
    </div>
  )
}

function GameView({
  snapshot,
  busy,
  dice,
  onRoll,
  onRestart,
  onExit,
}: {
  snapshot: GameSnapshot
  busy: boolean
  dice: number | null
  onRoll: () => void
  onRestart: () => void
  onExit: () => void
}) {
  const currentPlayer = snapshot.players.find((player) => player.user_id === snapshot.room.current_turn)
  const ownPlayer = snapshot.players.find((player) => player.user_id === snapshot.userId)
  const winner = snapshot.players.find((player) => player.user_id === snapshot.room.winner_id)
  const isMyTurn = snapshot.room.current_turn === snapshot.userId
  const sortedPlayers = useMemo(
    () => [...snapshot.players].sort((a, b) => b.distance - a.distance || b.coins - a.coins),
    [snapshot.players],
  )

  return (
    <div className="app-shell game-shell">
      <RoomHeader onExit={onExit} snapshot={snapshot} />
      <main className="game-layout">
        <section className="board-section">
          <div className="turn-strip">
            <div>
              <span className={`turn-indicator ${isMyTurn && !snapshot.room.is_paused ? 'active' : ''}`} />
              <p>{snapshot.room.is_paused ? '本局已暂停' : snapshot.room.status === 'finished' ? '行动结束' : isMyTurn ? '轮到你行动' : `等待 ${currentPlayer?.nickname ?? '队员'}`}</p>
            </div>
            <span>{ROUND_LABELS[snapshot.room.current_round]} · {snapshot.room.board_size} 格 · 当前骰子 {ownPlayer?.dice_count ?? 0} 个</span>
          </div>
          <Board players={snapshot.players} room={snapshot.room} tiles={snapshot.tiles} />
        </section>

        <aside className="game-sidebar">
          <section className="dice-panel">
            <div className={`dice-face ${busy ? 'rolling' : ''}`} aria-label={dice ? `骰子点数 ${dice}` : '等待掷骰'}>
              {dice ?? <Dice5 size={34} />}
            </div>
            <button className="button primary roll-button" disabled={busy || snapshot.room.is_paused || !isMyTurn || snapshot.room.status !== 'playing'} onClick={onRoll} type="button">
              {busy ? <LoaderCircle className="spin" size={19} /> : <Dice5 size={19} />}
              {snapshot.room.is_paused ? '等待管理员继续' : isMyTurn ? `掷骰行动 · 剩余 ${ownPlayer?.dice_count ?? 0}` : '等待回合'}
            </button>
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
                      <span className="guarantee-score"><small>保障</small>{player.coins}</span>
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
        <LobbyView busy={busy} onExit={exitRoom} onReady={toggleReady} onStart={startGame} snapshot={snapshot} />
      )}
      {snapshot && snapshot.room.status !== 'lobby' && (
        <GameView busy={busy} dice={dice} onExit={exitRoom} onRestart={restartDemo} onRoll={rollDice} snapshot={snapshot} />
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
