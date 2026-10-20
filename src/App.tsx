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
  LogIn,
  Play,
  Radio,
  Route,
  RotateCcw,
  Shield,
  Sparkles,
  Swords,
  UserPlus,
  Users,
  Wifi,
  WifiOff,
} from 'lucide-react'
import { BOARD_TILES, getBoardGridPosition, PLAYER_COLORS } from './lib/board'
import { createDemoRoom, rollDemoDice, startDemoGame } from './lib/demoGame'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import type { GameEvent, GameSnapshot, Player, PlayerRole, Room } from './types'

const ACTIVE_ROOM_KEY = 'delta-monopoly-active-room'
const NICKNAME_KEY = 'delta-monopoly-nickname'
const MAX_PLAYERS = 3

function getPlayerShare(player: Player, players: Player[]) {
  if (player.role === 'boss') return 60
  const runnerCount = players.filter((item) => item.role === 'runner').length
  return runnerCount > 0 ? 40 / runnerCount : 0
}

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
          <p>每一种玩法都是独立趣味单。选定模式后，再创建房间邀请队友加入。</p>
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
              <span className="mode-status live"><Radio size={13} /> 可创建房间</span>
              <span className="mode-preview monopoly-preview" aria-hidden="true">
                {Array.from({ length: 16 }, (_, index) => <i key={index} />)}
                <b><Dice5 size={34} /></b>
              </span>
              <span className="mode-card-copy">
                <small>趣味单 01</small>
                <strong>护航大富翁</strong>
                <span>轮流掷骰生成护航条款，在保底、路线与打法之间完成一份小队协议。</span>
              </span>
              <span className="mode-card-footer">
                <span>2–3 人 · 1老板 + 最多2打手</span>
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
  onCreate,
  onJoin,
  onDemo,
  onBack,
}: {
  busy: boolean
  onCreate: (nickname: string, role: PlayerRole) => void
  onJoin: (nickname: string, role: PlayerRole, code: string) => void
  onDemo: (nickname: string, role: PlayerRole) => void
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

  function create() {
    const name = validate()
    if (name) onCreate(name, role)
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
          <p className="hero-subtitle">老板与打手轮流掷骰，把保底、搜撤路线、装备档位和交战方式写进本局护航协议。</p>
          <div className="mission-stats" aria-label="游戏规则概览">
            <span><strong>60%</strong> 老板权益</span>
            <span><strong>40%</strong> 打手权益</span>
            <span><strong>3</strong> 人上限</span>
          </div>
        </section>

        <section className="entry-panel" aria-labelledby="entry-title">
        <div className="panel-heading">
          <div>
            <p className="kicker">新行动</p>
            <h2 id="entry-title">创建或加入房间</h2>
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
              <Swords size={17} /> 打手席 · 共 40%
            </button>
            <button className={role === 'boss' ? 'active' : ''} onClick={() => setRole('boss')} type="button">
              <Crown size={17} /> 老板席 · 60%
            </button>
          </div>
          <p className="role-help">两名打手满编时各占 20%；只有一名打手时独享打手席 40%。</p>
        </fieldset>

        {formError && <p className="form-error" role="alert">{formError}</p>}

        <button className="button primary create-button" disabled={busy || !isSupabaseConfigured} onClick={create} type="button">
          {busy ? <LoaderCircle className="spin" size={19} /> : <UserPlus size={19} />}
          创建在线房间
        </button>

        <div className="join-row">
          <input
            aria-label="房间码"
            maxLength={6}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            placeholder="6 位房间码"
            value={code}
          />
          <button className="button secondary" disabled={busy || !isSupabaseConfigured} onClick={join} type="button">
            <LogIn size={18} /> 加入
          </button>
        </div>

        <div className="divider"><span>或</span></div>
        <button className="button ghost full" disabled={busy} onClick={demo} type="button">
          <Dice5 size={18} /> 本机试玩
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
  const isHost = snapshot.room.host_user_id === snapshot.userId
  const allReady = snapshot.players.length > 0 && snapshot.players.every((player) => player.is_ready)
  const boss = snapshot.players.find((player) => player.role === 'boss')
  const runners = snapshot.players.filter((player) => player.role === 'runner')
  const validLineup = Boolean(boss) && runners.length >= 1 && runners.length <= 2 && snapshot.players.length <= MAX_PLAYERS
  const rosterSlots = [
    { key: 'boss', label: '老板席', share: 60, player: boss },
    { key: 'runner-1', label: '打手席 A', share: runners.length === 1 ? 40 : 20, player: runners[0] },
    { key: 'runner-2', label: '打手席 B', share: 20, player: runners[1] },
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
            <span><Crown size={17} /> 老板 60%</span>
            <span><Swords size={17} /> 打手共 40%</span>
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
                  <span className={`share-state ${slot.player ? 'filled' : ''}`}>{slot.share}% 权益</span>
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
            {isHost && (
              <button className="button primary" disabled={busy || !allReady || (!snapshot.isDemo && !validLineup)} onClick={onStart} type="button">
                {busy ? <LoaderCircle className="spin" size={18} /> : <Play size={18} />}
                开始行动
              </button>
            )}
          </div>
          {snapshot.isDemo && <p className="inline-note">试玩房已自动准备，可直接开始。</p>}
          {!snapshot.isDemo && !validLineup && <p className="inline-note">至少需要 1 名老板和 1 名打手；满编为 1 老板 + 2 打手。</p>}
          {!snapshot.isDemo && validLineup && runners.length === 1 && <p className="inline-note">当前打手独享 40% 权益；第 2 名打手加入后各占 20%。</p>}
        </section>
      </main>
    </div>
  )
}

function Board({ players }: { players: Player[] }) {
  return (
    <div className="board" aria-label="行动棋盘">
      {BOARD_TILES.map((tile, index) => {
        const playersHere = players
          .map((player, playerIndex) => ({ player, playerIndex }))
          .filter(({ player }) => player.position === index)
        return (
          <div className={`tile tile-${tile.type}`} key={tile.name} style={getBoardGridPosition(index)}>
            <span className="tile-number">{String(index + 1).padStart(2, '0')}</span>
            <span className="tile-owner">{tile.type === 'boss' ? '老板' : tile.type === 'runner' ? '打手' : '公共'}</span>
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
      <div className="board-center">
        <span className="center-mark"><span /></span>
        <p>TACTICAL BOARD</p>
        <strong>护航协议局</strong>
        <div className="equity-split" aria-label="权益格比例">
          <span><Crown size={14} /> 老板 60%</span>
          <span><Swords size={14} /> 打手 40%</span>
        </div>
        <small>12 个老板格 · 8 个打手格 · 4 个公共节点</small>
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
            <span>{ownPlayer ? `第 ${Math.floor(ownPlayer.distance / snapshot.room.board_size) + 1} 圈` : ''}</span>
          </div>
          <Board players={snapshot.players} />
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
              <p className="kicker">权益进度</p>
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
                      <small>{player.role === 'boss' ? '老板' : '打手'} · {getPlayerShare(player, snapshot.players)}% 权益</small>
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
            <h2 id="winner-title">护航协议已生成</h2>
            <p>{winner?.nickname ?? '行动队员'} 完成两圈推演，最终保障值为 {winner?.coins ?? 0}。</p>
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
  }, [selectedMode, snapshot?.room.status])

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

  function createOnline(nickname: string, role: PlayerRole) {
    void runAction(async () => {
      if (!supabase) throw new Error('请先完成 Supabase 配置')
      const user = await ensureOnlineUser()
      const { data, error: rpcError } = await supabase.rpc('create_room', { p_nickname: nickname, p_role: role })
      if (rpcError) throw rpcError
      const result = Array.isArray(data) ? data[0] : data
      if (!result?.room_id) throw new Error('创建房间失败')
      localStorage.setItem(ACTIVE_ROOM_KEY, result.room_id)
      setSnapshot(await fetchSnapshot(result.room_id, user.id))
    })
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
    if (!snapshot) return
    if (snapshot.isDemo) {
      setSnapshot(startDemoGame(snapshot))
      return
    }
    if (!supabase) return
    const client = supabase
    void runAction(async () => {
      const { error: rpcError } = await client.rpc('start_game', { p_room_id: snapshot.room.id })
      if (rpcError) throw rpcError
      await refreshRoom(snapshot.room.id, snapshot.userId)
    })
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

  return (
    <>
      {!snapshot && !selectedMode && <ModeHub onSelect={() => setSelectedMode('monopoly')} />}
      {!snapshot && selectedMode === 'monopoly' && (
        <MonopolyEntry
          busy={busy}
          onBack={() => setSelectedMode(null)}
          onCreate={createOnline}
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
