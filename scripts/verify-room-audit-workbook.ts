import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import ExcelJS from 'exceljs'
import { buildRoomAuditWorkbook, selectRollEvents } from '../src/lib/roomAuditWorkbook'
import type { GameEvent, RoomAuditExportData } from '../src/lib/roomAuditWorkbook'

const events: GameEvent[] = [
  {
    id: 1,
    room_id: 'room-1',
    message: '测试玩家 掷出 4，遇到分叉路线，等待选择走向',
    event_type: 'system',
    metadata: {},
    created_at: '2026-10-21T10:00:00.000Z',
  },
  {
    id: 2,
    room_id: 'room-1',
    message: '测试玩家 掷出 4，沿所选路线落到「测试格」：触发效果',
    event_type: 'roll',
    metadata: {
      player_id: 'player-1',
      player_name: '测试玩家',
      role: 'runner',
      round: 1,
      dice: 4,
      landed_position: 4,
      tile_name: '测试格',
      tile_detail: '触发效果',
      tile_type: 'shared',
      effect_type: 'none',
      effect_value: 0,
    },
    created_at: '2026-10-21T10:00:01.000Z',
  },
  {
    id: 3,
    room_id: 'room-1',
    message: '管理员暂停了本局，所有行动已锁定',
    event_type: 'system',
    metadata: {},
    created_at: '2026-10-21T10:01:00.000Z',
  },
]

assert.equal(selectRollEvents(events).length, 1, '分叉等待事件不应重复计入摇骰次数')

const data: RoomAuditExportData = {
  room: {
    id: 'room-1', name: '测试房间', code: 'ABC123', host_user_id: 'admin-1', status: 'finished', is_paused: false,
    current_turn: null, winner_id: 'user-1', board_size: 8, target_laps: 3, current_round: 1,
    round1_advance_chance: 35, round2_advance_chance: 30, starting_player_id: 'user-1', rolls_per_turn: 1,
    rolls_remaining: 0, base_guarantee: 100, base_guarantee_balance: 90, total_rounds: 3,
    round1_board_size: 8, round2_board_size: 12, round3_board_size: 24, round_board_sizes: [8, 12, 24],
    round_advance_chances: [35, 30], imported_config: false, pending_dice: null, pending_player_id: null,
    pending_route_options: [], pending_route_state: {}, created_at: '2026-10-21T09:00:00.000Z',
  },
  players: [{
    id: 'player-1', room_id: 'room-1', user_id: 'user-1', nickname: '测试玩家', role: 'runner', position: 4,
    distance: 4, coins: 0, is_ready: true, turn_order: 0, skip_turns: 0, next_roll_modifier: 0,
    dice_count: 0, round_roll_count: 1, created_at: '2026-10-21T09:10:00.000Z',
  }],
  events,
  diceRequests: [{
    id: 'dice-1', room_id: 'room-1', requester_player_id: 'player-1', requester_user_id: 'user-1',
    requester_nickname: '测试玩家', target_player_id: 'player-1', target_player_nickname: '测试玩家', operation: 'add',
    amount: 2, status: 'approved', dice_before: 1, dice_delta: 2, dice_after: 3, reviewer_user_id: 'boss-1',
    reviewed_at: '2026-10-21T09:30:00.000Z', review_note: '同意', created_at: '2026-10-21T09:29:00.000Z',
  }],
  guaranteeRequests: [{
    id: 'guarantee-1', room_id: 'room-1', requester_player_id: 'player-1', requester_user_id: 'user-1',
    requester_nickname: '测试玩家', operation: 'subtract', target: 'current', amount: 10, status: 'approved',
    current_guarantee_before: 100, base_guarantee_before: 100, current_guarantee_delta: -10, base_guarantee_delta: 0,
    current_guarantee_after: 90, base_guarantee_after: 100, reviewer_user_id: 'boss-1',
    reviewed_at: '2026-10-21T09:40:00.000Z', review_note: null, created_at: '2026-10-21T09:39:00.000Z',
  }],
  settlementRules: [{
    id: 1, room_id: 'room-1', sequence_number: 1, base_text: '基础规则', suffix: '手动后缀',
    created_at: '2026-10-21T10:02:00.000Z',
  }],
  exportedAt: new Date('2026-10-21T11:00:00.000Z'),
}

const bytes = await buildRoomAuditWorkbook(data)
assert.ok(bytes.byteLength > 10_000, '工作簿输出应包含完整格式和数据')
if (process.env.EXPORT_TEST_WORKBOOK_PATH) await writeFile(process.env.EXPORT_TEST_WORKBOOK_PATH, bytes)

const workbook = new ExcelJS.Workbook()
await workbook.xlsx.load(bytes)
assert.deepEqual(workbook.worksheets.map((sheet) => sheet.name), [
  '对局摘要', '玩家最终状态', '完整事件流水', '摇骰明细', '骰子申请审计', '保底申请审计', '归零规则',
])
assert.equal(workbook.getWorksheet('完整事件流水')?.rowCount, 8, '全部事件都应导出')
assert.equal(workbook.getWorksheet('摇骰明细')?.rowCount, 6, '分叉摇骰应去重')
assert.equal(workbook.getWorksheet('骰子申请审计')?.getCell('H6').value, '已同意')
assert.equal(workbook.getWorksheet('保底申请审计')?.getCell('G6').value, 10)
assert.equal(workbook.getWorksheet('保底申请审计')?.getCell('P6').value, null, '缺失的备注应保持为空单元格')
assert.equal(workbook.getWorksheet('归零规则')?.getCell('E6').value, '基础规则 手动后缀')

console.log('对局导出回归测试通过：7 个工作表、全事件流水、分叉摇骰去重与两类申请审计')
