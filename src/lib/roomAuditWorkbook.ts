import ExcelJS from 'exceljs'
import type {
  DiceRequest,
  GameEvent,
  GuaranteeRequest,
  Player,
  Room,
  SettlementRule,
} from '../types'

export interface RoomAuditExportData {
  room: Room
  players: Player[]
  events: GameEvent[]
  diceRequests: DiceRequest[]
  guaranteeRequests: GuaranteeRequest[]
  settlementRules: SettlementRule[]
  exportedAt: Date
}

type AuditValue = string | number | boolean | Date | null

interface AuditColumn<Row> {
  header: string
  width: number
  value: (row: Row, index: number) => AuditValue
  numberFormat?: string
  wrap?: boolean
}

const COLORS = {
  ink: 'FF17231F',
  header: 'FF243D35',
  headerBorder: 'FF637B71',
  accent: 'FFD9A9B8',
  pale: 'FFF2F6F4',
  stripe: 'FFF7F9F8',
  border: 'FFD5DEDA',
  muted: 'FF617069',
  white: 'FFFFFFFF',
}

function asDate(value: string | null | undefined) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function roleLabel(role: string | null | undefined) {
  if (role === 'boss') return '老板'
  if (role === 'runner') return '打手'
  return null
}

function statusLabel(status: string) {
  if (status === 'lobby') return '等待玩家'
  if (status === 'playing') return '进行中'
  if (status === 'finished') return '已结束'
  if (status === 'pending') return '待处理'
  if (status === 'approved') return '已同意'
  if (status === 'rejected') return '已拒绝'
  return status
}

function operationLabel(operation: string) {
  if (operation === 'add') return '增加'
  if (operation === 'subtract') return '减少'
  return operation
}

function guaranteeTargetLabel(target: string) {
  if (target === 'current') return '现有保底'
  if (target === 'base') return '基础保底'
  if (target === 'auto') return '自动扣减'
  return target
}

function eventTypeLabel(type: GameEvent['event_type']) {
  if (type === 'roll') return '摇骰'
  if (type === 'settlement_rule') return '归零规则'
  return '系统事件'
}

function metadataJson(event: GameEvent) {
  return JSON.stringify(event.metadata ?? {})
}

function isRoutePendingEvent(event: GameEvent) {
  return event.event_type !== 'roll' && event.message.includes('遇到分叉路线，等待选择走向')
}

function rollIdentity(event: GameEvent) {
  if (event.metadata?.player_name && event.metadata.dice != null) {
    return `${event.metadata.player_name}:${event.metadata.dice}`
  }
  const match = event.message.match(/^(.*?)\s+掷出\s+(\d+)/)
  return match ? `${match[1]}:${match[2]}` : null
}

export function selectRollEvents(events: GameEvent[]) {
  return events.filter((event, index) => {
    if (event.event_type === 'roll') return true
    if (!event.message.includes('掷出')) return false
    if (!isRoutePendingEvent(event)) return true

    const identity = rollIdentity(event)
    if (!identity) return true
    const completed = events.slice(index + 1).find((candidate) => {
      if (candidate.message.includes('掷出') && rollIdentity(candidate) !== identity) return true
      return candidate.event_type === 'roll' && rollIdentity(candidate) === identity
    })
    return completed?.event_type !== 'roll' || rollIdentity(completed) !== identity
  })
}

function applySheetTitle(sheet: ExcelJS.Worksheet, title: string, description: string) {
  sheet.getCell('A2').value = title
  sheet.getCell('A2').font = { name: 'Aptos', size: 14, bold: true, color: { argb: COLORS.ink } }
  sheet.getCell('A3').value = description
  sheet.getCell('A3').font = { name: 'Aptos', size: 10, italic: true, color: { argb: COLORS.muted } }
  sheet.getCell('A3').alignment = { vertical: 'middle' }
  sheet.getRow(2).height = 22
  sheet.getRow(3).height = 18
}

function addAuditSheet<Row>(
  workbook: ExcelJS.Workbook,
  name: string,
  title: string,
  description: string,
  columns: AuditColumn<Row>[],
  rows: Row[],
  freezeColumns = 1,
) {
  const sheet = workbook.addWorksheet(name, {
    properties: { defaultRowHeight: 18, tabColor: { argb: COLORS.header } },
    views: [{ state: 'frozen', xSplit: freezeColumns, ySplit: 5, showGridLines: false }],
  })
  applySheetTitle(sheet, title, description)

  const headerRow = sheet.getRow(5)
  headerRow.values = columns.map((column) => column.header)
  headerRow.height = 24
  headerRow.eachCell((cell) => {
    cell.font = { name: 'Aptos', size: 10, bold: true, color: { argb: COLORS.white } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.header } }
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
    cell.border = {
      right: { style: 'thin', color: { argb: COLORS.headerBorder } },
      bottom: { style: 'thin', color: { argb: COLORS.headerBorder } },
    }
  })

  columns.forEach((column, columnIndex) => {
    sheet.getColumn(columnIndex + 1).width = column.width
  })

  rows.forEach((row, rowIndex) => {
    const excelRow = sheet.getRow(rowIndex + 6)
    excelRow.values = columns.map((column) => column.value(row, rowIndex))
    excelRow.height = columns.some((column) => column.wrap) ? 30 : 20
    excelRow.eachCell((cell, columnIndex) => {
      const column = columns[columnIndex - 1]
      cell.font = { name: 'Aptos', size: 10, color: { argb: COLORS.ink } }
      cell.alignment = {
        horizontal: typeof cell.value === 'number' ? 'right' : cell.value instanceof Date ? 'center' : 'left',
        vertical: column.wrap ? 'top' : 'middle',
        wrapText: column.wrap ?? false,
      }
      cell.border = {
        right: { style: 'thin', color: { argb: COLORS.border } },
        bottom: { style: 'thin', color: { argb: COLORS.border } },
      }
      if (column.numberFormat) cell.numFmt = column.numberFormat
      if (rowIndex % 2 === 1) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.stripe } }
      }
    })
  })

  if (rows.length === 0) {
    const emptyCell = sheet.getCell('A6')
    emptyCell.value = '暂无记录'
    emptyCell.font = { name: 'Aptos', size: 10, italic: true, color: { argb: COLORS.muted } }
  }

  const lastColumn = Math.max(1, columns.length)
  sheet.autoFilter = {
    from: { row: 5, column: 1 },
    to: { row: 5, column: lastColumn },
  }
  sheet.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
  return sheet
}

function addSummarySheet(workbook: ExcelJS.Workbook, data: RoomAuditExportData, rollEvents: GameEvent[]) {
  const winner = data.players.find((player) => player.user_id === data.room.winner_id)
  const rows: Array<{ item: string; value: AuditValue }> = [
    { item: '房间名称', value: data.room.name },
    { item: '房间码', value: data.room.code },
    { item: '房间状态', value: statusLabel(data.room.status) },
    { item: '房间创建时间', value: asDate(data.room.created_at) },
    { item: '导出时间', value: data.exportedAt },
    { item: '总轮数', value: data.room.total_rounds },
    { item: '当前轮次', value: data.room.current_round },
    { item: '各轮格子数', value: data.room.round_board_sizes.slice(0, data.room.total_rounds).join('/') },
    { item: '各轮晋级概率', value: data.room.total_rounds > 1 ? data.room.round_advance_chances.slice(0, data.room.total_rounds - 1).map((value) => `${value}%`).join('/') : null },
    { item: '初始骰子数', value: data.room.rolls_per_turn },
    { item: '配置基础保底（万）', value: data.room.base_guarantee },
    { item: '最终基础保底余额（万）', value: data.room.base_guarantee_balance },
    { item: '获胜玩家', value: winner?.nickname ?? null },
    { item: '玩家数', value: data.players.length },
    { item: '完整事件数', value: data.events.length },
    { item: '实际摇骰次数', value: rollEvents.length },
    { item: '骰子申请数', value: data.diceRequests.length },
    { item: '保底申请数', value: data.guaranteeRequests.length },
    { item: '归零规则数', value: data.settlementRules.length },
  ]

  const sheet = addAuditSheet(
    workbook,
    '对局摘要',
    '对局摘要',
    '本工作簿包含该房间已保存的全部事件、申请审计、摇骰明细和归零规则。',
    [
      { header: '项目', width: 30, value: (row) => row.item },
      { header: '值', width: 42, value: (row) => row.value },
    ],
    rows,
    0,
  )
  sheet.views = [{ state: 'normal', showGridLines: false }]
  sheet.getColumn(2).numFmt = '#,##0'
  for (let row = 6; row <= rows.length + 5; row += 1) {
    const cell = sheet.getCell(row, 2)
    if (cell.value instanceof Date) cell.numFmt = 'yyyy-mm-dd hh:mm:ss'
  }
  sheet.properties.tabColor = { argb: COLORS.accent }
}

export async function buildRoomAuditWorkbook(data: RoomAuditExportData) {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = '景序电竞三角洲趣味'
  workbook.created = data.exportedAt
  workbook.modified = data.exportedAt
  workbook.subject = `${data.room.name} 完整对局记录`
  workbook.title = `${data.room.name} 完整对局记录`

  const rollEvents = selectRollEvents(data.events)
  addSummarySheet(workbook, data, rollEvents)

  addAuditSheet(
    workbook,
    '玩家最终状态',
    '玩家最终状态',
    '房间结束或导出时保存的玩家状态快照。',
    [
      { header: '行动顺序', width: 12, value: (row) => row.turn_order + 1, numberFormat: '#,##0' },
      { header: '行动代号', width: 18, value: (row) => row.nickname },
      { header: '身份', width: 10, value: (row) => roleLabel(row.role) },
      { header: '加入时间', width: 20, value: (row) => asDate(row.created_at), numberFormat: 'yyyy-mm-dd hh:mm:ss' },
      { header: '最终位置', width: 12, value: (row) => row.position + 1, numberFormat: '#,##0' },
      { header: '累计步数', width: 12, value: (row) => row.distance, numberFormat: '#,##0' },
      { header: '最终骰子数', width: 14, value: (row) => row.dice_count, numberFormat: '#,##0' },
      { header: '最终现有保底（万）', width: 20, value: (row) => row.coins, numberFormat: '#,##0' },
      { header: '跳过行动次数', width: 16, value: (row) => row.skip_turns, numberFormat: '#,##0' },
      { header: '下次骰子修正', width: 16, value: (row) => row.next_roll_modifier, numberFormat: '#,##0' },
      { header: '本轮已掷次数', width: 16, value: (row) => row.round_roll_count, numberFormat: '#,##0' },
      { header: '准备状态', width: 12, value: (row) => row.is_ready ? '已准备' : '未准备' },
      { header: '玩家 ID', width: 38, value: (row) => row.id },
      { header: '用户 ID', width: 38, value: (row) => row.user_id },
    ],
    data.players,
    3,
  )

  addAuditSheet(
    workbook,
    '完整事件流水',
    '完整事件流水',
    '按时间顺序保留数据库中全部对局事件，包括系统操作、申请审批、摇骰和归零规则。',
    [
      { header: '序号', width: 10, value: (_row, index) => index + 1, numberFormat: '#,##0' },
      { header: '事件 ID', width: 16, value: (row) => String(row.id) },
      { header: '时间', width: 20, value: (row) => asDate(row.created_at), numberFormat: 'yyyy-mm-dd hh:mm:ss' },
      { header: '事件类型', width: 14, value: (row) => eventTypeLabel(row.event_type) },
      { header: '事件内容', width: 60, value: (row) => row.message, wrap: true },
      { header: '玩家', width: 18, value: (row) => row.metadata?.player_name ?? null },
      { header: '身份', width: 10, value: (row) => roleLabel(row.metadata?.role) },
      { header: '轮次', width: 10, value: (row) => row.metadata?.round ?? null, numberFormat: '#,##0' },
      { header: '骰子点数', width: 12, value: (row) => row.metadata?.dice ?? null, numberFormat: '#,##0' },
      { header: '落格序号', width: 12, value: (row) => row.metadata?.landed_position == null ? null : row.metadata.landed_position + 1, numberFormat: '#,##0' },
      { header: '格子名称', width: 20, value: (row) => row.metadata?.tile_name ?? null },
      { header: '格子说明', width: 48, value: (row) => row.metadata?.tile_detail ?? null, wrap: true },
      { header: '格子类型', width: 14, value: (row) => row.metadata?.tile_type ?? null },
      { header: '效果类型', width: 22, value: (row) => row.metadata?.effect_type ?? null },
      { header: '效果数值', width: 14, value: (row) => row.metadata?.effect_value ?? null, numberFormat: '#,##0.00' },
      { header: '关联申请 ID', width: 38, value: (row) => row.metadata?.request_id ?? null },
      { header: '关联归零规则 ID', width: 22, value: (row) => row.settlement_rule_id == null ? null : String(row.settlement_rule_id) },
      { header: '原始 metadata', width: 70, value: (row) => metadataJson(row), wrap: true },
    ],
    data.events,
    5,
  )

  addAuditSheet(
    workbook,
    '摇骰明细',
    '摇骰明细',
    '每次实际摇骰只保留一条；分叉路线的等待事件不会与最终落格重复计数。',
    [
      { header: '次数', width: 10, value: (_row, index) => index + 1, numberFormat: '#,##0' },
      { header: '事件 ID', width: 16, value: (row) => String(row.id) },
      { header: '时间', width: 20, value: (row) => asDate(row.created_at), numberFormat: 'yyyy-mm-dd hh:mm:ss' },
      { header: '玩家', width: 18, value: (row) => row.metadata?.player_name ?? null },
      { header: '身份', width: 10, value: (row) => roleLabel(row.metadata?.role) },
      { header: '轮次', width: 10, value: (row) => row.metadata?.round ?? null, numberFormat: '#,##0' },
      { header: '骰子点数', width: 12, value: (row) => row.metadata?.dice ?? null, numberFormat: '#,##0' },
      { header: '落格序号', width: 12, value: (row) => row.metadata?.landed_position == null ? null : row.metadata.landed_position + 1, numberFormat: '#,##0' },
      { header: '格子名称', width: 20, value: (row) => row.metadata?.tile_name ?? null },
      { header: '格子说明', width: 48, value: (row) => row.metadata?.tile_detail ?? null, wrap: true },
      { header: '格子类型', width: 14, value: (row) => row.metadata?.tile_type ?? null },
      { header: '效果类型', width: 22, value: (row) => row.metadata?.effect_type ?? null },
      { header: '效果数值', width: 14, value: (row) => row.metadata?.effect_value ?? null, numberFormat: '#,##0.00' },
      { header: '原始事件', width: 60, value: (row) => row.message, wrap: true },
    ],
    rollEvents,
    4,
  )

  addAuditSheet(
    workbook,
    '骰子申请审计',
    '骰子申请审计',
    '包含所有待处理、已同意和已拒绝的骰子数量申请。',
    [
      { header: '序号', width: 10, value: (_row, index) => index + 1, numberFormat: '#,##0' },
      { header: '申请 ID', width: 38, value: (row) => row.id },
      { header: '提交时间', width: 20, value: (row) => asDate(row.created_at), numberFormat: 'yyyy-mm-dd hh:mm:ss' },
      { header: '申请人', width: 18, value: (row) => row.requester_nickname },
      { header: '目标玩家', width: 18, value: (row) => row.target_player_nickname },
      { header: '操作', width: 10, value: (row) => operationLabel(row.operation) },
      { header: '申请数量', width: 14, value: (row) => row.amount, numberFormat: '#,##0' },
      { header: '状态', width: 12, value: (row) => statusLabel(row.status) },
      { header: '变更前骰子', width: 14, value: (row) => row.dice_before, numberFormat: '#,##0' },
      { header: '实际变化', width: 14, value: (row) => row.dice_delta, numberFormat: '+#,##0;-#,##0;0' },
      { header: '变更后骰子', width: 14, value: (row) => row.dice_after, numberFormat: '#,##0' },
      { header: '审核时间', width: 20, value: (row) => asDate(row.reviewed_at), numberFormat: 'yyyy-mm-dd hh:mm:ss' },
      { header: '审核备注', width: 42, value: (row) => row.review_note ?? null, wrap: true },
      { header: '审核人用户 ID', width: 38, value: (row) => row.reviewer_user_id ?? null },
      { header: '申请人用户 ID', width: 38, value: (row) => row.requester_user_id },
      { header: '目标玩家 ID', width: 38, value: (row) => row.target_player_id },
    ],
    data.diceRequests,
    5,
  )

  addAuditSheet(
    workbook,
    '保底申请审计',
    '保底申请审计',
    '包含所有待处理、已同意和已拒绝的现有保底与基础保底申请。',
    [
      { header: '序号', width: 10, value: (_row, index) => index + 1, numberFormat: '#,##0' },
      { header: '申请 ID', width: 38, value: (row) => row.id },
      { header: '提交时间', width: 20, value: (row) => asDate(row.created_at), numberFormat: 'yyyy-mm-dd hh:mm:ss' },
      { header: '申请人', width: 18, value: (row) => row.requester_nickname },
      { header: '操作', width: 10, value: (row) => operationLabel(row.operation) },
      { header: '目标账户', width: 16, value: (row) => guaranteeTargetLabel(row.target) },
      { header: '申请金额（万）', width: 18, value: (row) => row.amount, numberFormat: '#,##0' },
      { header: '状态', width: 12, value: (row) => statusLabel(row.status) },
      { header: '现有保底变更前', width: 18, value: (row) => row.current_guarantee_before, numberFormat: '#,##0' },
      { header: '现有保底变化', width: 18, value: (row) => row.current_guarantee_delta, numberFormat: '+#,##0;-#,##0;0' },
      { header: '现有保底变更后', width: 18, value: (row) => row.current_guarantee_after, numberFormat: '#,##0' },
      { header: '基础保底变更前', width: 18, value: (row) => row.base_guarantee_before, numberFormat: '#,##0' },
      { header: '基础保底变化', width: 18, value: (row) => row.base_guarantee_delta, numberFormat: '+#,##0;-#,##0;0' },
      { header: '基础保底变更后', width: 18, value: (row) => row.base_guarantee_after, numberFormat: '#,##0' },
      { header: '审核时间', width: 20, value: (row) => asDate(row.reviewed_at), numberFormat: 'yyyy-mm-dd hh:mm:ss' },
      { header: '审核备注', width: 42, value: (row) => row.review_note ?? null, wrap: true },
      { header: '审核人用户 ID', width: 38, value: (row) => row.reviewer_user_id ?? null },
      { header: '申请人用户 ID', width: 38, value: (row) => row.requester_user_id },
    ],
    data.guaranteeRequests,
    4,
  )

  addAuditSheet(
    workbook,
    '归零规则',
    '全员骰子归零规则',
    '每次全员骰子归零时生成的结算规则，包含管理员保存的最终手动后缀。',
    [
      { header: '规则序号', width: 14, value: (row) => row.sequence_number, numberFormat: '#,##0' },
      { header: '生成时间', width: 20, value: (row) => asDate(row.created_at), numberFormat: 'yyyy-mm-dd hh:mm:ss' },
      { header: '基础规则', width: 70, value: (row) => row.base_text, wrap: true },
      { header: '手动后缀', width: 50, value: (row) => row.suffix || null, wrap: true },
      { header: '完整规则', width: 90, value: (row) => `${row.base_text}${row.suffix ? ` ${row.suffix}` : ''}`, wrap: true },
      { header: '规则 ID', width: 16, value: (row) => String(row.id) },
    ],
    data.settlementRules,
    1,
  )

  const output = await workbook.xlsx.writeBuffer()
  return new Uint8Array(output)
}
