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
  Play,
  Plus,
  Radio,
  Route,
  RotateCcw,
  Save,
  Settings2,
  Shield,
  Sparkles,
  Swords,
  UserPlus,
  Users,
  Wifi,
  WifiOff,
} from 'lucide-react'
import { getBoardDimensions, getBoardGridPosition, getRoundTiles, PLAYER_COLORS } from './lib/board'
import { createDemoRoom, rollDemoDice, startDemoGame } from './lib/demoGame'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import type { GameEvent, GameRound, GameSnapshot, Player, PlayerRole, Room } from './types'

const ACTIVE_ROOM_KEY = 'delta-monopoly-active-room'
const NICKNAME_KEY = 'delta-monopoly-nickname'
const MAX_PLAYERS = 3
const ROUND_LABELS: Record<GameRound, string> = { 1: '第一轮', 2: '第二轮', 3: '第三轮' }

function formatError(error: unknown) {
  if (error instanceof Error) return error.message
  if (typeof error === 'object' && error && 'message' in error) return String(error.message)
  return '操作失败，请稍后重试'
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
  const [roomResult, playersResult, eventsResult] = await Promise.all([
    supabase.from('rooms').select('*').eq('id', roomId).single(),
    supabase.from('room_players').select('*').eq('room_id', roomId).order('turn_order'),
    supabase.from('game_events').select('*').eq('room_id', roomId).order('created_at', { ascending: false }).limit(40),
  ])

  if (roomResult.error) throw roomResult.error
  if (playersResult.error) throw playersResult.error
  if (eventsResult.error) throw eventsResult.error

  return {
    room: roomResult.data as Room,
    players: playersResult.data as Player[],
    events: eventsResult.data as GameEvent[],
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
                <span>从 8 格逐轮晋级到 24 格，在空格与护航条款之间完成三轮推演。</span>
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
  const [code, setCode] = useState('')
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
          <p className="hero-subtitle">三轮棋盘逐步扩张，任何身份都可能触发老板权益、打手权益、公共事件或空格。</p>
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
          <legend>本局身份</legend>
          <div className="segmented">
            <button className={role === 'runner' ? 'active' : ''} onClick={() => setRole('runner')} type="button">
              <Swords size={17} /> 打手
            </button>
            <button className={role === 'boss' ? 'active' : ''} onClick={() => setRole('boss')} type="button">
              <Crown size={17} /> 老板
            </button>
          </div>
          <p className="role-help">身份不会限制落格，老板也会触发打手权益，打手也会触发老板权益。</p>
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

        <p className="config-note">在线房间由管理员创建。取得 6 位房间码后即可加入。</p>

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
          <span>房间</span>
          <strong>{snapshot.room.code}</strong>
          {copied ? <Check size={16} /> : <Clipboard size={16} />}
        </button>
        <button aria-label="退出房间" className="icon-button" onClick={onExit} title="退出房间" type="button">
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
  const [error, setError] = useState('')
  const [rooms, setRooms] = useState<Room[]>([])
  const [players, setPlayers] = useState<Player[]>([])
  const [events, setEvents] = useState<GameEvent[]>([])
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null)
  const [round1Chance, setRound1Chance] = useState('35')
  const [round2Chance, setRound2Chance] = useState('30')

  const selectedRoom = rooms.find((room) => room.id === selectedRoomId) ?? null
  const selectedPlayers = players.filter((player) => player.room_id === selectedRoomId)
  const selectedEvents = events.filter((event) => event.room_id === selectedRoomId)
  const selectedBosses = selectedPlayers.filter((player) => player.role === 'boss').length
  const selectedRunners = selectedPlayers.filter((player) => player.role === 'runner').length
  const canStart = selectedRoom?.status === 'lobby'
    && selectedPlayers.length >= 2
    && selectedPlayers.length <= 3
    && selectedBosses === 1
    && selectedRunners >= 1
    && selectedRunners <= 2
    && selectedPlayers.every((player) => player.is_ready)

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
      .subscribe()

    return () => {
      void client.removeChannel(channel)
    }
  }, [authorized, loadDashboard, loadRoomEvents, selectedRoomId])

  useEffect(() => {
    if (!authorized) return
    if (!selectedRoomId) {
      setEvents([])
      return
    }
    void loadRoomEvents(selectedRoomId).catch((loadError) => setError(formatError(loadError)))
  }, [authorized, loadRoomEvents, selectedRoomId])

  useEffect(() => {
    if (!selectedRoom) return
    setRound1Chance(String(selectedRoom.round1_advance_chance))
    setRound2Chance(String(selectedRoom.round2_advance_chance))
  }, [selectedRoom?.id, selectedRoom?.round1_advance_chance, selectedRoom?.round2_advance_chance])

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
      setSelectedRoomId(null)
    })
  }

  function createRoom() {
    void runAdminAction(async () => {
      if (!supabase) return
      const { data, error: rpcError } = await supabase.rpc('admin_create_room')
      if (rpcError) throw rpcError
      const result = Array.isArray(data) ? data[0] : data
      await loadDashboard()
      if (result?.room_id) setSelectedRoomId(result.room_id)
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

  async function copyRoomCode() {
    if (selectedRoom) await navigator.clipboard.writeText(selectedRoom.code)
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
              <button aria-label="创建房间" className="icon-button admin-add" disabled={busy} onClick={createRoom} title="创建房间" type="button"><Plus size={19} /></button>
            </div>
            <button className="button primary full" disabled={busy} onClick={createRoom} type="button"><UserPlus size={18} /> 创建新房间</button>
            <div className="admin-room-items">
              {rooms.map((room) => {
                const count = players.filter((player) => player.room_id === room.id).length
                return (
                  <button className={`admin-room-item ${selectedRoomId === room.id ? 'active' : ''}`} key={room.id} onClick={() => setSelectedRoomId(room.id)} type="button">
                    <span><strong>{room.code}</strong><small>{count}/3 人 · {ROUND_LABELS[room.current_round]}</small></span>
                    <em className={`room-status status-${room.status}`}>{room.status === 'lobby' ? '等待' : room.status === 'playing' ? '进行中' : '已结束'}</em>
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
                    <button className="admin-code" onClick={copyRoomCode} title="复制房间码" type="button">{selectedRoom.code} <Clipboard size={17} /></button>
                  </div>
                  <div className="admin-room-actions">
                    <button className="button primary" disabled={busy || !canStart} onClick={startRoom} type="button"><Play size={17} /> 开始房间</button>
                    <button className="button secondary" disabled={busy || selectedRoom.status !== 'playing'} onClick={finishRoom} type="button"><Flag size={17} /> 结束本局</button>
                  </div>
                </div>

                <div className="admin-summary-strip">
                  <span><small>状态</small><strong>{selectedRoom.status === 'lobby' ? '等待玩家' : selectedRoom.status === 'playing' ? '进行中' : '已结束'}</strong></span>
                  <span><small>当前轮次</small><strong>{ROUND_LABELS[selectedRoom.current_round]}</strong></span>
                  <span><small>玩家</small><strong>{selectedPlayers.length} / 3</strong></span>
                </div>

                <section className="admin-probability-panel">
                  <div className="section-title"><p className="kicker">晋级概率</p><Settings2 size={18} /></div>
                  <div className="probability-grid">
                    <label><span>第一轮 → 第二轮</span><span className="percent-input"><input max="100" min="0" onChange={(event) => setRound1Chance(event.target.value)} type="number" value={round1Chance} /><b>%</b></span></label>
                    <label><span>第二轮 → 第三轮</span><span className="percent-input"><input max="100" min="0" onChange={(event) => setRound2Chance(event.target.value)} type="number" value={round2Chance} /><b>%</b></span></label>
                    <button className="button secondary" disabled={busy} onClick={saveChances} type="button"><Save size={17} /> 保存概率</button>
                  </div>
                </section>

                <section className="admin-player-panel">
                  <div className="section-title"><p className="kicker">房间玩家</p><Users size={18} /></div>
                  <div className="admin-player-list">
                    {selectedPlayers.map((player, index) => (
                      <div className="admin-player-row" key={player.id}>
                        <PlayerAvatar index={index} player={player} />
                        <span><strong>{player.nickname}</strong><small>{player.role === 'boss' ? '老板' : '打手'}</small></span>
                        <em>{player.is_ready ? '已准备' : '未准备'}</em>
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
                    <span>{slot.label}{slot.player?.user_id === snapshot.room.host_user_id ? ' · 房主' : ''}</span>
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

function Board({ players, room }: { players: Player[]; room: Room }) {
  const tiles = getRoundTiles(room.current_round)
  const dimensions = getBoardDimensions(tiles.length)
  const advanceChance = room.current_round === 1 ? room.round1_advance_chance : room.round2_advance_chance

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
          <div className={`tile tile-${tile.type}`} key={`${tile.name}-${index}`} style={getBoardGridPosition(index, tiles.length)}>
            <span className="tile-number">{String(index + 1).padStart(2, '0')}</span>
            <span className="tile-owner">{tile.type === 'boss' ? '老板' : tile.type === 'runner' ? '打手' : tile.type === 'empty' ? '空格' : '公共'}</span>
            <strong>{tile.shortName}</strong>
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
        <small>{room.current_round < 3 ? `本轮晋级概率 ${advanceChance}%` : '摇到协议结算格完成本局'}</small>
        <small>所有身份均可能触发任意权益格</small>
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
              <span className={`turn-indicator ${isMyTurn ? 'active' : ''}`} />
              <p>{snapshot.room.status === 'finished' ? '行动结束' : isMyTurn ? '轮到你行动' : `等待 ${currentPlayer?.nickname ?? '队员'}`}</p>
            </div>
            <span>{ROUND_LABELS[snapshot.room.current_round]} · {snapshot.room.board_size} 格</span>
          </div>
          <Board players={snapshot.players} room={snapshot.room} />
        </section>

        <aside className="game-sidebar">
          <section className="dice-panel">
            <div className={`dice-face ${busy ? 'rolling' : ''}`} aria-label={dice ? `骰子点数 ${dice}` : '等待掷骰'}>
              {dice ?? <Dice5 size={34} />}
            </div>
            <button className="button primary roll-button" disabled={busy || !isMyTurn || snapshot.room.status !== 'playing'} onClick={onRoll} type="button">
              {busy ? <LoaderCircle className="spin" size={19} /> : <Dice5 size={19} />}
              {isMyTurn ? '掷骰行动' : '等待回合'}
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
                      <small>{player.role === 'boss' ? '老板' : '打手'} · 当前第 {player.position + 1} 格</small>
                    </div>
                    <span className="guarantee-score"><small>保障</small>{player.coins}</span>
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
            <p>{winner ? `${winner.nickname} 摇到协议结算格。` : '管理员已结束本局。'} 最终记录已保存在管理面板。</p>
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
      setSnapshot(await fetchSnapshot(result.room_id, user.id))
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
    if (!snapshot || snapshot.isDemo || !supabase) {
      clearLocalRoom()
      return
    }
    const client = supabase
    const roomId = snapshot.room.id
    void runAction(async () => {
      const { error: rpcError } = await client.rpc('leave_room', { p_room_id: roomId })
      if (rpcError) throw rpcError
      clearLocalRoom()
    })
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
