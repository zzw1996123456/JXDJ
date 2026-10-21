import { createDefaultTileEdges, createRandomRoomTiles, getRoundTiles } from './board'
import type { GameEvent, GameSnapshot, Player, PlayerRole, Room } from '../types'

const DEMO_USER_ID = 'demo-player'

function now() {
  return new Date().toISOString()
}

function event(roomId: string, message: string, metadata?: GameEvent['metadata'], eventType?: GameEvent['event_type']): GameEvent {
  return { id: crypto.randomUUID(), room_id: roomId, message, event_type: eventType, metadata, created_at: now() }
}

export function createDemoRoom(nickname: string, role: PlayerRole): GameSnapshot {
  const room: Room = {
    id: 'demo-room', name: '本机试玩房', code: 'DEMO88', host_user_id: DEMO_USER_ID, status: 'lobby', is_paused: false,
    current_turn: null, winner_id: null, board_size: 8, target_laps: 3, current_round: 1,
    round1_advance_chance: 35, round2_advance_chance: 30, starting_player_id: DEMO_USER_ID,
    rolls_per_turn: 2, rolls_remaining: 2, base_guarantee: 100, base_guarantee_balance: 100,
    total_rounds: 3, round1_board_size: 8, round2_board_size: 12, round3_board_size: 24,
    round_board_sizes: [8, 12, 24, 24, 24, 24, 24, 24, 24, 24],
    round_advance_chances: [35, 30, 30, 30, 30, 30, 30, 30, 30],
    imported_config: false, pending_dice: null, pending_player_id: null, pending_route_options: [], created_at: now(),
  }

  const player: Player = {
    id: 'demo-player-record', room_id: room.id, user_id: DEMO_USER_ID, nickname, role,
    position: 0, distance: 0, coins: role === 'boss' ? room.base_guarantee : 0, is_ready: true, turn_order: 0,
    skip_turns: 0, next_roll_modifier: 0, dice_count: room.rolls_per_turn, round_roll_count: 0, created_at: now(),
  }
  const entryMessage = role === 'boss'
    ? `${nickname} 进入随机规则试玩房，基础保底 ${room.base_guarantee} 万`
    : `${nickname} 进入随机规则试玩房，打手不设保底`

  const tiles = createRandomRoomTiles(room.id)
  return {
    room,
    players: [player],
    events: [event(room.id, entryMessage)],
    tiles,
    edges: createDefaultTileEdges(tiles),
    guaranteeRequests: [],
    userId: DEMO_USER_ID,
    isDemo: true,
  }
}

export function startDemoGame(snapshot: GameSnapshot): GameSnapshot {
  const player = snapshot.players[0]
  return {
    ...snapshot,
    room: {
      ...snapshot.room,
      status: 'playing',
      current_turn: player.user_id,
      rolls_remaining: snapshot.room.rolls_per_turn,
    },
    players: snapshot.players.map((item) => ({
      ...item,
      coins: item.role === 'boss' ? snapshot.room.base_guarantee : 0,
      dice_count: snapshot.room.rolls_per_turn,
      round_roll_count: 0,
    })),
    events: [event(snapshot.room.id, `试玩开始，${player.nickname} 先行动，初始有 ${snapshot.room.rolls_per_turn} 个骰子`), ...snapshot.events],
  }
}

function advanceDemoTurn(room: Room, players: Player[], afterOrder: number) {
  const nextPlayers = players.map((player) => ({ ...player }))
  const orderedIds = [...nextPlayers]
    .sort((left, right) => left.turn_order - right.turn_order)
    .map((player) => player.id)
  const addedEvents: GameEvent[] = []
  let order = afterOrder

  for (let step = 1; step <= Math.max(orderedIds.length * 6, 6); step += 1) {
    const orderedPlayers = orderedIds.map((id) => nextPlayers.find((player) => player.id === id)!)
    const candidate = orderedPlayers.find((player) => player.turn_order > order) ?? orderedPlayers[0]
    if (!candidate) break
    const candidateIndex = nextPlayers.findIndex((player) => player.id === candidate.id)

    if (candidate.skip_turns > 0) {
      nextPlayers[candidateIndex] = { ...candidate, skip_turns: candidate.skip_turns - 1 }
      addedEvents.unshift(event(room.id, `${candidate.nickname} 跳过 1 次行动`))
      order = candidate.turn_order
    } else {
      const diceCount = Math.max(0, Math.min(20, candidate.dice_count + candidate.next_roll_modifier))
      nextPlayers[candidateIndex] = { ...candidate, dice_count: diceCount, next_roll_modifier: 0 }
      if (diceCount > 0) {
        return {
          room: { ...room, current_turn: candidate.user_id, rolls_remaining: diceCount },
          players: nextPlayers,
          events: addedEvents,
        }
      }
      addedEvents.unshift(event(room.id, `${candidate.nickname} 没有可用骰子，自动跳过本回合`))
      order = candidate.turn_order
    }

    if (step % nextPlayers.length === 0 && !nextPlayers.some((player) => player.dice_count > 0)) {
      addedEvents.unshift(event(room.id, '所有玩家都没有可用骰子，等待管理员补充'))
      return {
        room: { ...room, current_turn: null, rolls_remaining: 0 },
        players: nextPlayers,
        events: addedEvents,
      }
    }
  }

  addedEvents.unshift(event(room.id, '当前没有可行动玩家，等待管理员处理'))
  return {
    room: { ...room, current_turn: null, rolls_remaining: 0 },
    players: nextPlayers,
    events: addedEvents,
  }
}

export function resolveDemoDice(snapshot: GameSnapshot, dice: number): { snapshot: GameSnapshot; dice: number } {
  if (!Number.isInteger(dice) || dice < 1 || dice > 6) throw new Error('骰子点数必须是 1–6')
  const currentIndex = snapshot.players.findIndex((player) => player.user_id === snapshot.room.current_turn)
  if (currentIndex < 0) throw new Error('当前没有可行动玩家')
  const current = snapshot.players[currentIndex]
  const round = snapshot.room.current_round
  const tiles = getRoundTiles(snapshot.tiles, round)
  const landedPosition = (current.position + dice) % tiles.length
  const tile = tiles[landedPosition]
  let position = landedPosition
  let distance = current.distance + dice
  let skipTurns = current.skip_turns
  let nextRollModifier = current.next_roll_modifier
  let rollsRemaining = Math.max(0, current.dice_count - 1)
  let advanced = false
  let finished = false
  const addedEvents: GameEvent[] = []

  switch (tile.effect_type) {
    case 'guarantee_add':
    case 'guarantee_subtract':
    case 'guarantee_multiply':
    case 'guarantee_divide':
      break
    case 'move':
      position = ((position + tile.effect_value) % tiles.length + tiles.length) % tiles.length
      distance = Math.max(0, distance + tile.effect_value)
      break
    case 'skip':
      skipTurns = Math.min(3, skipTurns + tile.effect_value)
      break
    case 'extra_roll':
      rollsRemaining = Math.min(20, rollsRemaining + tile.effect_value)
      break
    case 'lose_roll':
      nextRollModifier = Math.max(-4, nextRollModifier - tile.effect_value)
      break
    case 'advance_chance':
    case 'advance_round':
      advanced = round < snapshot.room.total_rounds && (snapshot.isDemo || current.role === 'boss') && current.round_roll_count >= 2
      break
    case 'finish':
      finished = round === snapshot.room.total_rounds
      break
  }

  const player: Player = {
    ...current,
    position,
    distance,
    skip_turns: skipTurns,
    next_roll_modifier: nextRollModifier,
    dice_count: rollsRemaining,
    round_roll_count: current.round_roll_count + 1,
  }
  addedEvents.push(event(
    snapshot.room.id,
    `${player.nickname} 掷出 ${dice}，落到「${tile.name}」：${tile.detail}`,
    {
      player_id: player.id,
      player_name: player.nickname,
      role: player.role,
      round,
      dice,
      landed_position: landedPosition,
      tile_name: tile.name,
      tile_detail: tile.detail,
      tile_type: tile.tile_type,
      effect_type: tile.effect_type,
      effect_value: tile.effect_value,
    },
    'roll',
  ))
  if (tile.effect_type === 'move') {
    addedEvents.unshift(event(snapshot.room.id, `${player.nickname} ${tile.effect_value > 0 ? '前进' : '后退'} ${Math.abs(tile.effect_value)} 格，到达第 ${position + 1} 格`))
  }
  let players = snapshot.players.map((item, index) => index === currentIndex ? player : item)
  if (['guarantee_add', 'guarantee_subtract', 'guarantee_multiply', 'guarantee_divide'].includes(tile.effect_type)) {
    const previousBoss = players.find((item) => item.role === 'boss')
    if (previousBoss) {
      const nextGuarantee = tile.effect_type === 'guarantee_add'
        ? Math.min(1_000_000, previousBoss.coins + tile.effect_value)
        : tile.effect_type === 'guarantee_subtract'
          ? Math.max(0, previousBoss.coins - tile.effect_value)
          : tile.effect_type === 'guarantee_multiply'
            ? Math.round(Math.min(1_000_000, previousBoss.coins * tile.effect_value))
            : tile.effect_value === 0 ? 0 : Math.round(previousBoss.coins / tile.effect_value)
      players = players.map((item) => item.role === 'boss'
        ? { ...item, coins: nextGuarantee }
        : { ...item, coins: 0 })
      const operation = tile.effect_type === 'guarantee_add'
        ? `增加 ${tile.effect_value} 万`
        : tile.effect_type === 'guarantee_subtract'
          ? `减少 ${tile.effect_value} 万`
          : tile.effect_type === 'guarantee_multiply'
            ? `乘以 ${tile.effect_value}`
            : `除以 ${tile.effect_value}`
      addedEvents.unshift(event(
        snapshot.room.id,
        `老板保底${operation}：${previousBoss.coins} 万 → ${nextGuarantee} 万`,
      ))
    }
  }
  let room = { ...snapshot.room, rolls_remaining: rollsRemaining }
  if (advanced) {
    const nextRound = round + 1
    const nextTiles = getRoundTiles(snapshot.tiles, nextRound)
    players = players.map((item) => ({ ...item, position: 0, round_roll_count: 0 }))
    room = { ...room, current_round: nextRound, board_size: nextTiles.length }
    addedEvents.unshift(event(room.id, `队伍进入第 ${nextRound} 轮 ${nextTiles.length} 格棋盘`))
  }

  if (finished) {
    room = { ...room, status: 'finished', winner_id: player.user_id, current_turn: null, rolls_remaining: 0 }
    addedEvents.unshift(event(room.id, `${player.nickname} 完成最终结算，本局结束`))
  } else {
    const nextTurn = advanceDemoTurn(room, players, player.turn_order)
    room = nextTurn.room
    players = nextTurn.players
    addedEvents.unshift(...nextTurn.events)
  }

  return {
    dice,
    snapshot: {
      ...snapshot,
      players,
      room,
      events: [...addedEvents, ...snapshot.events],
    },
  }
}

export function chooseDemoDice(snapshot: GameSnapshot, chanceRoll = Math.random() * 100, choiceRoll = Math.random()) {
  const round = snapshot.room.current_round
  const tiles = getRoundTiles(snapshot.tiles, round)
  const player = snapshot.players[0]
  const advanceChance = snapshot.room.round_advance_chances?.[round - 1]
    ?? (round === 1 ? snapshot.room.round1_advance_chance : snapshot.room.round2_advance_chance)
  const canAdvance = (snapshot.isDemo || player.role === 'boss') && player.round_roll_count >= 2
  const shouldAdvance = round < snapshot.room.total_rounds && canAdvance && chanceRoll < advanceChance
  const candidates = [1, 2, 3, 4, 5, 6].filter((dice) => {
    const tile = tiles[(player.position + dice) % tiles.length]
    const isAdvance = tile.effect_type === 'advance_chance' || tile.effect_type === 'advance_round'
    return isAdvance === shouldAdvance
  })
  if (candidates.length === 0) throw new Error('当前棋盘的晋级格布局无效，请重新随机棋盘')
  return candidates[Math.min(candidates.length - 1, Math.floor(choiceRoll * candidates.length))]
}

export function rollDemoDice(snapshot: GameSnapshot): { snapshot: GameSnapshot; dice: number } {
  return resolveDemoDice(snapshot, chooseDemoDice(snapshot))
}
