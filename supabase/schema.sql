-- 景序电竞三角洲趣味：随机规则三轮大富翁
-- 在 Supabase Dashboard > SQL Editor 中完整执行本文件。

create extension if not exists pgcrypto;

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null default '趣味房间' check (char_length(trim(name)) between 1 and 24),
  code text not null unique check (char_length(code) = 6),
  host_user_id uuid not null,
  status text not null default 'lobby' check (status in ('lobby', 'playing', 'finished')),
  is_paused boolean not null default false,
  current_turn uuid,
  winner_id uuid,
  board_size integer not null default 8,
  target_laps integer not null default 3,
  current_round integer not null default 1 check (current_round between 1 and 3),
  round1_advance_chance integer not null default 35 check (round1_advance_chance between 0 and 100),
  round2_advance_chance integer not null default 30 check (round2_advance_chance between 0 and 100),
  starting_player_id uuid,
  rolls_per_turn integer not null default 1 check (rolls_per_turn between 1 and 5),
  rolls_remaining integer not null default 1 check (rolls_remaining between 0 and 20),
  base_guarantee integer not null default 100 check (base_guarantee between 0 and 10000),
  created_at timestamptz not null default now()
);

alter table public.rooms add column if not exists name text not null default '趣味房间';
alter table public.rooms add column if not exists is_paused boolean not null default false;
alter table public.rooms add column if not exists current_round integer not null default 1;
alter table public.rooms add column if not exists round1_advance_chance integer not null default 35;
alter table public.rooms add column if not exists round2_advance_chance integer not null default 30;
alter table public.rooms add column if not exists starting_player_id uuid;
alter table public.rooms add column if not exists rolls_per_turn integer not null default 1;
alter table public.rooms add column if not exists rolls_remaining integer not null default 1;
alter table public.rooms add column if not exists base_guarantee integer not null default 100;
alter table public.rooms drop constraint if exists rooms_rolls_remaining_check;
alter table public.rooms add constraint rooms_rolls_remaining_check check (rolls_remaining between 0 and 20);
alter table public.rooms drop constraint if exists rooms_base_guarantee_check;
alter table public.rooms add constraint rooms_base_guarantee_check check (base_guarantee between 0 and 10000);
alter table public.rooms alter column board_size set default 8;
alter table public.rooms alter column target_laps set default 3;

create table if not exists public.room_players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null,
  nickname text not null check (char_length(nickname) between 2 and 12),
  role text not null check (role in ('boss', 'runner')),
  position integer not null default 0,
  distance integer not null default 0,
  coins integer not null default 0,
  is_ready boolean not null default false,
  turn_order integer not null,
  skip_turns integer not null default 0,
  next_roll_modifier integer not null default 0,
  dice_count integer not null default 1 check (dice_count between 0 and 20),
  round_roll_count integer not null default 0 check (round_roll_count >= 0),
  created_at timestamptz not null default now(),
  unique (room_id, user_id),
  unique (room_id, turn_order)
);

alter table public.room_players add column if not exists skip_turns integer not null default 0;
alter table public.room_players add column if not exists next_roll_modifier integer not null default 0;
alter table public.room_players add column if not exists round_roll_count integer not null default 0;
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'room_players' and column_name = 'dice_count'
  ) then
    alter table public.room_players add column dice_count integer not null default 1;
    update public.room_players p set dice_count = case
      when p.user_id = r.current_turn then greatest(1, r.rolls_remaining)
      else r.rolls_per_turn
    end from public.rooms r where r.id = p.room_id;
  end if;
end $$;
alter table public.room_players drop constraint if exists room_players_dice_count_check;
alter table public.room_players add constraint room_players_dice_count_check check (dice_count between 0 and 20);
alter table public.room_players drop constraint if exists room_players_round_roll_count_check;
alter table public.room_players add constraint room_players_round_roll_count_check check (round_roll_count >= 0);
alter table public.room_players alter column coins set default 0;
update public.room_players set coins = 0 where role = 'runner' and coins <> 0;

create table if not exists public.game_events (
  id bigint generated always as identity primary key,
  room_id uuid not null references public.rooms(id) on delete cascade,
  message text not null,
  event_type text not null default 'system' check (event_type in ('system', 'roll', 'settlement_rule')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.game_events add column if not exists event_type text not null default 'system';
alter table public.game_events add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.game_events drop constraint if exists game_events_event_type_check;
alter table public.game_events add constraint game_events_event_type_check
  check (event_type in ('system', 'roll', 'settlement_rule'));

create table if not exists public.room_settlement_rules (
  id bigint generated always as identity primary key,
  room_id uuid not null references public.rooms(id) on delete cascade,
  sequence_number integer not null check (sequence_number > 0),
  base_text text not null,
  suffix text not null default '' check (char_length(suffix) <= 200),
  created_at timestamptz not null default now(),
  unique (room_id, sequence_number)
);

alter table public.game_events add column if not exists settlement_rule_id bigint;
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'game_events_settlement_rule_id_fkey'
  ) then
    alter table public.game_events
      add constraint game_events_settlement_rule_id_fkey
      foreign key (settlement_rule_id) references public.room_settlement_rules(id) on delete set null;
  end if;
end $$;

create table if not exists public.app_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.tile_rule_templates (
  id bigint generated always as identity primary key,
  round_number integer not null check (round_number between 1 and 3),
  rule_group text not null check (rule_group in ('empty', 'contract', 'movement', 'turn', 'dice', 'advance_chance', 'advance', 'finish')),
  name text not null,
  short_name text not null,
  tile_type text not null check (tile_type in ('shared', 'boss', 'runner', 'empty', 'move', 'chance')),
  detail text not null,
  effect_type text not null check (effect_type in ('none', 'guarantee_add', 'guarantee_subtract', 'guarantee_multiply', 'guarantee_divide', 'move', 'skip', 'extra_roll', 'lose_roll', 'advance_chance', 'advance_round', 'finish')),
  effect_value numeric not null default 0,
  enabled boolean not null default true,
  unique (round_number, name)
);

create table if not exists public.room_tiles (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  template_id bigint references public.tile_rule_templates(id) on delete set null,
  round_number integer not null check (round_number between 1 and 3),
  position integer not null check (position between 0 and 23),
  name text not null,
  short_name text not null,
  tile_type text not null check (tile_type in ('shared', 'boss', 'runner', 'empty', 'move', 'chance')),
  detail text not null,
  effect_type text not null check (effect_type in ('none', 'guarantee_add', 'guarantee_subtract', 'guarantee_multiply', 'guarantee_divide', 'move', 'skip', 'extra_roll', 'lose_roll', 'advance_chance', 'advance_round', 'finish')),
  effect_value numeric not null default 0,
  created_at timestamptz not null default now(),
  unique (room_id, round_number, position)
);

-- 保底乘除允许小数倍数，旧整数数据会无损转换。
alter table public.tile_rule_templates alter column effect_value type numeric using effect_value::numeric;
alter table public.room_tiles alter column effect_value type numeric using effect_value::numeric;

-- 升级旧项目的规则约束，允许概率晋级作为独立效果。
alter table public.tile_rule_templates drop constraint if exists tile_rule_templates_rule_group_check;
alter table public.tile_rule_templates add constraint tile_rule_templates_rule_group_check
  check (rule_group in ('empty', 'contract', 'movement', 'turn', 'dice', 'advance_chance', 'advance', 'finish'));
alter table public.tile_rule_templates drop constraint if exists tile_rule_templates_effect_type_check;
update public.tile_rule_templates
set effect_type = case when effect_value < 0 then 'guarantee_subtract' when effect_value > 0 then 'guarantee_add' else 'none' end,
    effect_value = abs(effect_value)
where effect_type = 'coins';
alter table public.tile_rule_templates add constraint tile_rule_templates_effect_type_check
  check (effect_type in ('none', 'guarantee_add', 'guarantee_subtract', 'guarantee_multiply', 'guarantee_divide', 'move', 'skip', 'extra_roll', 'lose_roll', 'advance_chance', 'advance_round', 'finish'));
alter table public.room_tiles drop constraint if exists room_tiles_effect_type_check;
update public.room_tiles
set effect_type = case when effect_value < 0 then 'guarantee_subtract' when effect_value > 0 then 'guarantee_add' else 'none' end,
    effect_value = abs(effect_value)
where effect_type = 'coins';
alter table public.room_tiles add constraint room_tiles_effect_type_check
  check (effect_type in ('none', 'guarantee_add', 'guarantee_subtract', 'guarantee_multiply', 'guarantee_divide', 'move', 'skip', 'extra_roll', 'lose_roll', 'advance_chance', 'advance_round', 'finish'));

-- 每轮拥有独立规则池；创建房间时只会从对应轮次抽取。
insert into public.tile_rule_templates
  (round_number, rule_group, name, short_name, tile_type, detail, effect_type, effect_value)
values
  (1,'empty','空格','空格','empty','平安经过，本格不触发额外效果','none',0),
  (1,'contract','基础保底','基础保底','boss','老板保底增加 20 万','guarantee_add',20),
  (1,'contract','轻装试跑','轻装试跑','runner','下一局采用轻装稳健路线','none',0),
  (1,'contract','物资口令','物资口令','boss','老板指定一类优先搜索物资','none',0),
  (1,'contract','全队整备','全队整备','shared','确认预算和禁用项，老板保底增加 5 万','guarantee_add',5),
  (1,'contract','补给优惠','补给优惠','runner','基础装备预算获得补贴，老板保底增加 10 万','guarantee_add',10),
  (1,'contract','风险加注','风险加注','boss','本轮提高任务要求，老板保底减少 10 万','guarantee_subtract',10),
  (1,'contract','双倍补贴','保底 ×2','chance','老板当前保底乘以 2','guarantee_multiply',2),
  (1,'contract','费用折算','保底 ÷2','chance','老板当前保底除以 2，小数向下取整','guarantee_divide',2),
  (1,'movement','抢占先机','前进 1 格','move','抢先完成准备，立即前进 1 格','move',1),
  (1,'movement','安全捷径','前进 2 格','move','发现安全捷径，立即前进 2 格','move',2),
  (1,'movement','路口折返','后退 1 格','chance','路线判断失误，立即后退 1 格','move',-1),
  (1,'movement','情报误导','后退 2 格','chance','遭遇错误情报，立即后退 2 格','move',-2),
  (1,'turn','烟雾封路','暂停 1 次','chance','前路被封锁，跳过下一次行动','skip',1),
  (1,'turn','临时整备','整备 1 次','shared','留在原地完成整备，跳过下一次行动','skip',1),
  (1,'dice','乘胜追击','额外 1 次','chance','骰子库存立即增加 1 个，之后仍按顺序轮换','extra_roll',1),
  (1,'dice','弹药清点','少摇 1 次','chance','下个自己的回合减少 1 次掷骰','lose_roll',1),
  (1,'advance','快速通关','直达二轮','chance','触发快速通关，队伍直接进入第二轮','advance_round',0),
  (1,'advance_chance','紧急转场','进入二轮','shared','到达本格后，队伍进入第二轮','advance_chance',0),

  (2,'empty','空格','空格','empty','平安经过，本格不触发额外效果','none',0),
  (2,'contract','红品加码','红品加码','boss','带出红色物资时老板保底增加 30 万','guarantee_add',30),
  (2,'contract','携行保障','携行保障','boss','为老板预留携行空间，老板保底增加 15 万','guarantee_add',15),
  (2,'contract','稳健打法','稳健打法','runner','本局不主动追击非任务目标','none',0),
  (2,'contract','遭遇绕行','遭遇绕行','runner','允许避开一次高风险交战','none',0),
  (2,'contract','路线改判','路线改判','shared','全队可改判一次已确定的路线','none',0),
  (2,'contract','超时补偿','超时补偿','runner','行动超时后老板保底增加 15 万','guarantee_add',15),
  (2,'contract','交战限制','交战限制','runner','禁用一种高风险打法','none',0),
  (2,'contract','预算升级','预算升级','boss','装备预算升级，老板保底增加 25 万','guarantee_add',25),
  (2,'contract','价值翻倍','保底 ×2','boss','老板当前保底乘以 2','guarantee_multiply',2),
  (2,'contract','损耗均摊','保底 ÷2','shared','老板当前保底除以 2，小数向下取整','guarantee_divide',2),
  (2,'movement','线索捷径','前进 1 格','move','发现可靠线索，立即前进 1 格','move',1),
  (2,'movement','快速搜点','前进 2 格','move','搜索效率提升，立即前进 2 格','move',2),
  (2,'movement','秘密通道','前进 3 格','move','发现秘密通道，立即前进 3 格','move',3),
  (2,'movement','临时返仓','后退 1 格','chance','装备不足需要返仓，立即后退 1 格','move',-1),
  (2,'movement','路线封锁','后退 2 格','chance','主路线被封锁，立即后退 2 格','move',-2),
  (2,'movement','遭遇伏击','后退 3 格','chance','遭遇伏击被迫撤回，立即后退 3 格','move',-3),
  (2,'turn','等待情报','暂停 1 次','chance','等待情报确认，跳过下一次行动','skip',1),
  (2,'turn','受伤治疗','暂停 2 次','chance','需要治疗整备，跳过接下来 2 次行动','skip',2),
  (2,'turn','隐蔽观察','隐蔽 1 次','shared','原地观察敌情，跳过下一次行动','skip',1),
  (2,'dice','连续推进','额外 1 次','chance','骰子库存立即增加 1 个，之后仍按顺序轮换','extra_roll',1),
  (2,'dice','双线行动','额外 2 次','chance','骰子库存立即增加 2 个，之后仍按顺序轮换','extra_roll',2),
  (2,'dice','负重整理','少摇 1 次','chance','下个自己的回合减少 1 次掷骰','lose_roll',1),
  (2,'dice','通讯干扰','少摇 2 次','chance','下个自己的回合减少 2 次掷骰','lose_roll',2),
  (2,'advance_chance','核心情报','进入三轮','chance','到达本格后，队伍进入第三轮','advance_chance',0),
  (2,'advance','提前撤转','提前晋级','shared','满足撤转条件，队伍直接进入第三轮','advance_round',0),
  (2,'advance','任务跳级','任务跳级','boss','完成隐藏目标，队伍直接进入第三轮','advance_round',0),

  (3,'empty','空格','空格','empty','平安经过，本格不触发额外效果','none',0),
  (3,'contract','终局保底','终局保底','boss','最终阶段老板保底增加 40 万','guarantee_add',40),
  (3,'contract','安全撤离','安全撤离','boss','老板安全撤离时保底增加 25 万','guarantee_add',25),
  (3,'contract','核心搜索','核心搜索','boss','完成两个核心区域搜索点','none',0),
  (3,'contract','物资优先','物资优先','boss','目标物资优先完成交付','none',0),
  (3,'contract','战术改判','战术改判','runner','打手可改判一次路线或打法','none',0),
  (3,'contract','连败补偿','连败补偿','runner','连续失败后老板保底增加 30 万','guarantee_add',30),
  (3,'contract','强制撤离','强制撤离','shared','出现安全窗口后全队必须转点撤离','none',0),
  (3,'contract','禁用清单','禁用清单','shared','本局追加一项高风险行为禁令','none',0),
  (3,'contract','高额悬赏','高额悬赏','boss','完成追加目标，老板保底增加 50 万','guarantee_add',50),
  (3,'contract','装备损耗','装备损耗','chance','装备损耗导致老板保底减少 20 万','guarantee_subtract',20),
  (3,'contract','保险生效','保险生效','shared','护航保险生效，老板保底增加 20 万','guarantee_add',20),
  (3,'contract','成果倍增','保底 ×3','chance','老板当前保底乘以 3','guarantee_multiply',3),
  (3,'contract','终局均摊','保底 ÷3','chance','老板当前保底除以 3，小数向下取整','guarantee_divide',3),
  (3,'movement','近路突进','前进 1 格','move','抓住空档，立即前进 1 格','move',1),
  (3,'movement','载具接应','前进 2 格','move','获得载具接应，立即前进 2 格','move',2),
  (3,'movement','密道穿行','前进 3 格','move','穿过密道，立即前进 3 格','move',3),
  (3,'movement','空投指引','前进 4 格','move','空投标记出安全路线，立即前进 4 格','move',4),
  (3,'movement','极限突围','前进 5 格','move','完成极限突围，立即前进 5 格','move',5),
  (3,'movement','回收装备','后退 1 格','chance','返回回收装备，立即后退 1 格','move',-1),
  (3,'movement','撤回掩体','后退 2 格','chance','火力压制下撤回掩体，立即后退 2 格','move',-2),
  (3,'movement','封锁回撤','后退 3 格','chance','撤离点封锁，立即后退 3 格','move',-3),
  (3,'movement','重伤撤退','后退 4 格','chance','队员重伤，立即后退 4 格','move',-4),
  (3,'movement','任务失败','后退 5 格','chance','关键任务失败，立即后退 5 格','move',-5),
  (3,'turn','静默等待','暂停 1 次','chance','进入静默状态，跳过下一次行动','skip',1),
  (3,'turn','重整队形','暂停 2 次','shared','重整队形，跳过接下来 2 次行动','skip',2),
  (3,'turn','撤离点关闭','暂停 2 次','chance','等待撤离点重开，跳过接下来 2 次行动','skip',2),
  (3,'dice','补给空投','额外 1 次','chance','获得补给空投，骰子库存立即增加 1 个','extra_roll',1),
  (3,'dice','战术连携','额外 2 次','shared','触发战术连携，骰子库存立即增加 2 个','extra_roll',2),
  (3,'dice','信号延迟','少摇 1 次','chance','下个自己的回合减少 1 次掷骰','lose_roll',1),
  (3,'dice','装备超重','少摇 2 次','chance','下个自己的回合减少 2 次掷骰','lose_roll',2),
  (3,'dice','最后冲刺','额外 1 次','move','进入最后冲刺，骰子库存立即增加 1 个','extra_roll',1),
  (3,'finish','协议结算','协议结算','shared','本房间规则全部结算，本局结束','finish',0),
  (3,'finish','成功撤离','成功撤离','boss','完成最终撤离，本局结束','finish',0),
  (3,'finish','任务完成','任务完成','runner','护航任务全部完成，本局结束','finish',0)
on conflict (round_number, name) do update set
  rule_group = excluded.rule_group,
  short_name = excluded.short_name,
  tile_type = excluded.tile_type,
  detail = excluded.detail,
  effect_type = excluded.effect_type,
  effect_value = excluded.effect_value,
  enabled = true;

-- 统一旧房间中保底格的显示用语，不改变自定义数值或实际效果。
update public.room_tiles
set detail = replace(detail, '保障值', '老板保底') || case when detail like '%万%' then '' else ' 万' end
where effect_type in ('guarantee_add', 'guarantee_subtract', 'guarantee_multiply', 'guarantee_divide') and detail like '%保障值%';

-- 未开局房间跟随规则池升级；进行中的房间保持已生成棋盘不变。
update public.room_tiles rt
set short_name = t.short_name, detail = t.detail, effect_type = t.effect_type, effect_value = t.effect_value
from public.tile_rule_templates t, public.rooms r
where rt.template_id = t.id
  and rt.room_id = r.id
  and r.status = 'lobby'
  and t.effect_type = 'advance_chance';

create index if not exists room_players_room_id_idx on public.room_players(room_id);
create index if not exists game_events_room_id_created_at_idx on public.game_events(room_id, created_at desc);
create index if not exists game_events_unsettled_roll_idx on public.game_events(room_id, id) where event_type = 'roll' and settlement_rule_id is null;
create index if not exists room_settlement_rules_room_sequence_idx on public.room_settlement_rules(room_id, sequence_number);
create index if not exists room_tiles_room_round_idx on public.room_tiles(room_id, round_number, position);

alter table public.rooms enable row level security;
alter table public.room_players enable row level security;
alter table public.game_events enable row level security;
alter table public.room_settlement_rules enable row level security;
alter table public.app_admins enable row level security;
alter table public.tile_rule_templates enable row level security;
alter table public.room_tiles enable row level security;

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.app_admins where user_id = auth.uid()); $$;

create or replace function public.is_room_member(p_room_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.room_players where room_id = p_room_id and user_id = auth.uid()
  );
$$;

revoke all on function public.is_admin() from public;
revoke all on function public.is_room_member(uuid) from public;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_room_member(uuid) to authenticated;

drop policy if exists "room members can read rooms" on public.rooms;
create policy "room members can read rooms" on public.rooms for select to authenticated using (public.is_room_member(id));
drop policy if exists "admins can read rooms" on public.rooms;
create policy "admins can read rooms" on public.rooms for select to authenticated using (public.is_admin());

drop policy if exists "room members can read players" on public.room_players;
create policy "room members can read players" on public.room_players for select to authenticated using (public.is_room_member(room_id));
drop policy if exists "admins can read players" on public.room_players;
create policy "admins can read players" on public.room_players for select to authenticated using (public.is_admin());

drop policy if exists "room members can read events" on public.game_events;
create policy "room members can read events" on public.game_events for select to authenticated using (public.is_room_member(room_id));
drop policy if exists "admins can read events" on public.game_events;
create policy "admins can read events" on public.game_events for select to authenticated using (public.is_admin());

drop policy if exists "room members can read settlement rules" on public.room_settlement_rules;
create policy "room members can read settlement rules" on public.room_settlement_rules for select to authenticated using (public.is_room_member(room_id));
drop policy if exists "admins can read settlement rules" on public.room_settlement_rules;
create policy "admins can read settlement rules" on public.room_settlement_rules for select to authenticated using (public.is_admin());

drop policy if exists "room members can read tiles" on public.room_tiles;
create policy "room members can read tiles" on public.room_tiles for select to authenticated using (public.is_room_member(room_id));
drop policy if exists "admins can read tiles" on public.room_tiles;
create policy "admins can read tiles" on public.room_tiles for select to authenticated using (public.is_admin());

drop policy if exists "admins can read templates" on public.tile_rule_templates;
create policy "admins can read templates" on public.tile_rule_templates for select to authenticated using (public.is_admin());
drop policy if exists "admins can read own grant" on public.app_admins;
create policy "admins can read own grant" on public.app_admins for select to authenticated using (user_id = auth.uid());

create or replace function public.generate_room_board_internal(p_room_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_round integer;
  v_position integer;
  v_group text;
  v_group_index integer;
  v_groups text[];
  v_board_size integer;
  v_advance_start integer;
  v_template public.tile_rule_templates%rowtype;
begin
  delete from public.room_tiles where room_id = p_room_id;

  for v_round in 1..3 loop
    v_groups := case v_round
      when 1 then array['empty','contract','movement','movement','turn','dice']
      when 2 then array['empty','empty','contract','contract','movement','movement','turn','turn','dice','dice']
      else array['empty','empty','empty','empty','contract','contract','contract','contract','contract','movement','movement','movement','movement','movement','movement','turn','turn','turn','dice','dice','dice','dice','dice']
    end;
    v_board_size := case v_round when 1 then 8 when 2 then 12 else 24 end;
    v_advance_start := case when v_round < 3 then floor(random() * (v_board_size / 2))::integer else null end;
    v_position := 0;

    while v_position < case when v_round < 3 then v_board_size else 23 end loop
      if v_round < 3 and v_position = v_advance_start then
        v_group := 'advance_chance';
      elsif v_round < 3 and v_position = v_advance_start + (v_board_size / 2) then
        v_group := 'advance';
      else
        select item, ordinal::integer into v_group, v_group_index
        from unnest(v_groups) with ordinality as shuffled(item, ordinal)
        order by random() limit 1;
        v_groups := coalesce(v_groups[1:v_group_index - 1], '{}'::text[])
          || coalesce(v_groups[v_group_index + 1:array_length(v_groups, 1)], '{}'::text[]);
      end if;

      select * into v_template
      from public.tile_rule_templates t
      where t.round_number = v_round
        and t.rule_group = v_group
        and t.enabled
        and (
          v_group = 'empty'
          or not exists (
            select 1 from public.room_tiles rt
            where rt.room_id = p_room_id and rt.round_number = v_round and rt.template_id = t.id
          )
        )
      order by random() limit 1;

      if not found then raise exception '第 % 轮的 % 规则池数量不足', v_round, v_group; end if;

      insert into public.room_tiles(
        room_id, template_id, round_number, position, name, short_name,
        tile_type, detail, effect_type, effect_value
      ) values (
        p_room_id, v_template.id, v_round, v_position, v_template.name, v_template.short_name,
        v_template.tile_type, v_template.detail, v_template.effect_type, v_template.effect_value
      );
      v_position := v_position + 1;
    end loop;

    if v_round = 3 then
      select * into v_template from public.tile_rule_templates
      where round_number = 3 and rule_group = 'finish' and enabled
      order by random() limit 1;
      if not found then raise exception '第三轮缺少结束规则'; end if;
      insert into public.room_tiles(
        room_id, template_id, round_number, position, name, short_name,
        tile_type, detail, effect_type, effect_value
      ) values (
        p_room_id, v_template.id, 3, v_position, v_template.name, v_template.short_name,
        v_template.tile_type, v_template.detail, v_template.effect_type, v_template.effect_value
      );
    end if;
  end loop;
end;
$$;

revoke all on function public.generate_room_board_internal(uuid) from public;

-- 给升级前创建的房间补充独立棋盘。
do $$
declare v_room record;
begin
  for v_room in select id from public.rooms where not exists (
    select 1 from public.room_tiles where room_id = rooms.id
  ) loop
    perform public.generate_room_board_internal(v_room.id);
  end loop;
end $$;

drop function if exists public.create_room(text, text);
drop function if exists public.start_game(uuid);

-- 保留旧签名作为禁用入口，避免升级时删除函数造成缓存冲突。
create or replace function public.admin_create_room()
returns table(room_id uuid, room_code text)
language plpgsql security definer set search_path = public
as $$
begin
  raise exception '请先输入房间名称';
end;
$$;

create or replace function public.admin_create_room(p_room_name text)
returns table(room_id uuid, room_code text)
language plpgsql security definer set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_room_id uuid;
  v_code text;
begin
  if v_user_id is null or not public.is_admin() then raise exception '只有管理员可以创建房间'; end if;
  if p_room_name is null or char_length(trim(p_room_name)) not between 1 and 24 then
    raise exception '房间名需要 1 到 24 个字符';
  end if;
  loop
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    exit when not exists (select 1 from public.rooms where code = v_code);
  end loop;
  insert into public.rooms(name, code, host_user_id, board_size, target_laps, current_round)
  values (trim(p_room_name), v_code, v_user_id, 8, 3, 1) returning id into v_room_id;
  perform public.generate_room_board_internal(v_room_id);
  insert into public.game_events(room_id, message)
  values (v_room_id, '管理员创建「' || trim(p_room_name) || '」并生成了三轮随机棋盘');
  return query select v_room_id, v_code;
end;
$$;

create or replace function public.admin_randomize_room_board(p_room_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception '只有管理员可以重新生成棋盘'; end if;
  perform 1 from public.rooms where id = p_room_id and status = 'lobby' for update;
  if not found then raise exception '只能在开局前重新生成棋盘'; end if;
  perform public.generate_room_board_internal(p_room_id);
  insert into public.game_events(room_id, message) values (p_room_id, '管理员重新随机生成了三轮棋盘');
end;
$$;

create or replace function public.admin_import_room_config(p_room_id uuid, p_config jsonb)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_room public.rooms%rowtype;
  v_settings jsonb;
  v_tiles jsonb;
  v_tile jsonb;
  v_name text;
  v_round1_chance integer;
  v_round2_chance integer;
  v_rolls_per_turn integer;
  v_base_guarantee integer;
  v_round integer;
  v_position integer;
  v_tile_name text;
  v_short_name text;
  v_tile_type text;
  v_detail text;
  v_effect_type text;
  v_effect_value numeric;
  v_move_limit integer;
  v_skip_limit integer;
begin
  if not public.is_admin() then raise exception '只有管理员可以导入房间设置'; end if;
  select * into v_room from public.rooms where id = p_room_id for update;
  if not found or v_room.status <> 'lobby' then raise exception '只能向等待中的房间导入设置'; end if;
  if jsonb_typeof(p_config) <> 'object'
    or p_config ->> 'format' <> 'jingxu-delta-monopoly-room'
    or (p_config ->> 'version')::integer <> 1
  then raise exception '房间设置文件格式或版本无效'; end if;

  v_settings := p_config -> 'settings';
  v_tiles := p_config -> 'tiles';
  if jsonb_typeof(v_settings) <> 'object' or jsonb_typeof(v_tiles) <> 'array' or jsonb_array_length(v_tiles) <> 44 then
    raise exception '房间设置文件必须包含完整设置和 44 个棋盘格';
  end if;

  v_name := trim(v_settings ->> 'name');
  v_round1_chance := (v_settings ->> 'round1_advance_chance')::integer;
  v_round2_chance := (v_settings ->> 'round2_advance_chance')::integer;
  v_rolls_per_turn := (v_settings ->> 'rolls_per_turn')::integer;
  v_base_guarantee := (v_settings ->> 'base_guarantee')::integer;
  if char_length(v_name) not between 1 and 24 then raise exception '导入的房间名需要 1 到 24 个字符'; end if;
  if v_round1_chance not between 0 and 100 or v_round2_chance not between 0 and 100 then raise exception '导入的晋级概率必须在 0 到 100 之间'; end if;
  if v_rolls_per_turn not between 1 and 5 then raise exception '导入的初始骰子数量必须在 1 到 5 之间'; end if;
  if v_base_guarantee not between 0 and 10000 then raise exception '导入的基础保底必须在 0 到 10000 万之间'; end if;

  delete from public.room_tiles where room_id = p_room_id;
  for v_tile in select value from jsonb_array_elements(v_tiles) loop
    if jsonb_typeof(v_tile) <> 'object' then raise exception '棋盘格数据无效'; end if;
    v_round := (v_tile ->> 'round_number')::integer;
    v_position := (v_tile ->> 'position')::integer;
    v_tile_name := trim(v_tile ->> 'name');
    v_short_name := trim(v_tile ->> 'short_name');
    v_tile_type := v_tile ->> 'tile_type';
    v_detail := trim(v_tile ->> 'detail');
    v_effect_type := v_tile ->> 'effect_type';
    v_effect_value := (v_tile ->> 'effect_value')::numeric;

    if v_round not between 1 and 3 then raise exception '棋盘轮次无效'; end if;
    if v_position not between 0 and (case v_round when 1 then 7 when 2 then 11 else 23 end) then raise exception '棋盘格位置无效'; end if;
    if char_length(v_tile_name) not between 1 and 40 then raise exception '格子完整名称需要 1 到 40 个字符'; end if;
    if char_length(v_short_name) not between 1 and 16 then raise exception '格子短名需要 1 到 16 个字符'; end if;
    if char_length(v_detail) not between 1 and 160 then raise exception '格子说明需要 1 到 160 个字符'; end if;
    if v_tile_type not in ('shared','boss','runner','empty','move','chance') then raise exception '格子分类无效'; end if;
    if v_effect_type not in ('none','guarantee_add','guarantee_subtract','guarantee_multiply','guarantee_divide','move','skip','extra_roll','lose_roll','advance_chance','advance_round','finish') then raise exception '格子效果无效'; end if;
    if v_tile_type = 'empty' and (v_effect_type <> 'none' or v_effect_value <> 0) then raise exception '空格不能附带效果'; end if;
    if v_effect_type in ('none','advance_chance','advance_round','finish') and v_effect_value <> 0 then raise exception '该效果的数值必须为 0'; end if;
    if v_effect_type not in ('guarantee_multiply','guarantee_divide') and v_effect_value <> trunc(v_effect_value) then raise exception '该效果数值必须是整数'; end if;
    if v_effect_type in ('advance_chance','advance_round') and v_round = 3 then raise exception '第三轮不能配置晋级效果'; end if;
    if v_effect_type = 'finish' and v_round <> 3 then raise exception '结束格只能配置在第三轮'; end if;
    v_move_limit := case v_round when 1 then 2 when 2 then 3 else 5 end;
    v_skip_limit := case v_round when 1 then 1 else 2 end;
    if v_effect_type = 'move' and (v_effect_value = 0 or abs(v_effect_value) > v_move_limit) then raise exception '本轮移动格数超出允许范围'; end if;
    if v_effect_type = 'skip' and v_effect_value not between 1 and v_skip_limit then raise exception '本轮暂停次数超出允许范围'; end if;
    if v_effect_type in ('extra_roll','lose_roll') and v_effect_value not between 1 and 2 then raise exception '骰子数量效果必须在 1 到 2 之间'; end if;
    if v_effect_type in ('guarantee_add','guarantee_subtract') and v_effect_value not between 1 and 100000 then raise exception '老板保底加减必须在 1 到 100000 万之间'; end if;
    if v_effect_type in ('guarantee_multiply','guarantee_divide') and v_effect_value not between 0 and 10 then raise exception '老板保底乘除倍数必须在 0 到 10 之间'; end if;

    insert into public.room_tiles(
      room_id, template_id, round_number, position, name, short_name, tile_type, detail, effect_type, effect_value
    ) values (
      p_room_id, null, v_round, v_position, v_tile_name, v_short_name, v_tile_type, v_detail, v_effect_type, v_effect_value
    );
  end loop;

  if (select count(*) from public.room_tiles where room_id = p_room_id and round_number = 1) <> 8
    or (select count(*) from public.room_tiles where room_id = p_room_id and round_number = 2) <> 12
    or (select count(*) from public.room_tiles where room_id = p_room_id and round_number = 3) <> 24
  then raise exception '导入棋盘必须包含 8、12、24 个三轮格子'; end if;
  if exists (
    select 1 from (values (1),(2),(3)) as rounds(round_number)
    where not exists (
      select 1 from public.room_tiles t where t.room_id = p_room_id and t.round_number = rounds.round_number and t.tile_type = 'empty'
    )
  ) then raise exception '导入棋盘每轮至少需要一个空格'; end if;
  if not exists (select 1 from public.room_tiles where room_id = p_room_id and round_number = 3 and effect_type = 'finish') then
    raise exception '导入棋盘第三轮至少需要一个结束格';
  end if;
  if exists (
    select 1
    from (values (1, 8), (2, 12)) as rounds(round_number, board_size)
    cross join lateral generate_series(0, rounds.board_size - 1) as positions(position)
    where not exists (
      select 1 from public.room_tiles t
      where t.room_id = p_room_id and t.round_number = rounds.round_number
        and t.effect_type in ('advance_chance', 'advance_round')
        and mod(t.position - positions.position + rounds.board_size, rounds.board_size) between 1 and 6
    ) or not exists (
      select 1 from public.room_tiles t
      where t.room_id = p_room_id and t.round_number = rounds.round_number
        and t.effect_type not in ('advance_chance', 'advance_round')
        and mod(t.position - positions.position + rounds.board_size, rounds.board_size) between 1 and 6
    )
  ) then raise exception '导入棋盘的晋级格布局无效'; end if;

  update public.rooms set
    name = v_name,
    round1_advance_chance = v_round1_chance,
    round2_advance_chance = v_round2_chance,
    rolls_per_turn = v_rolls_per_turn,
    rolls_remaining = v_rolls_per_turn,
    base_guarantee = v_base_guarantee,
    current_round = 1,
    board_size = 8
  where id = p_room_id;
  update public.room_players set
    dice_count = v_rolls_per_turn,
    coins = case when role = 'boss' then v_base_guarantee else 0 end,
    is_ready = false
  where room_id = p_room_id;
  insert into public.game_events(room_id, message)
  values (p_room_id, '管理员导入房间设置并完整替换三轮棋盘');
end;
$$;

create or replace function public.admin_update_settlement_rule_suffix(p_rule_id bigint, p_suffix text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_rule public.room_settlement_rules%rowtype;
  v_suffix text := trim(coalesce(p_suffix, ''));
begin
  if not public.is_admin() then raise exception '只有管理员可以修改规则后缀'; end if;
  if char_length(v_suffix) > 200 then raise exception '规则后缀最多 200 个字符'; end if;
  select * into v_rule from public.room_settlement_rules where id = p_rule_id for update;
  if not found then raise exception '归零规则不存在'; end if;
  update public.room_settlement_rules set suffix = v_suffix where id = p_rule_id;
  update public.game_events set message = v_rule.base_text || case when v_suffix = '' then '' else ' ' || v_suffix end
  where settlement_rule_id = p_rule_id and event_type = 'settlement_rule';
end;
$$;

create or replace function public.join_room(p_code text, p_nickname text, p_role text)
returns table(room_id uuid, room_code text)
language plpgsql security definer set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_room public.rooms%rowtype;
  v_existing public.room_players%rowtype;
  v_previous_user_id uuid;
  v_match_count integer;
  v_turn_order integer;
begin
  if v_user_id is null then raise exception '请先建立玩家身份'; end if;
  if char_length(trim(p_nickname)) not between 2 and 12 then raise exception '昵称需要 2 到 12 个字符'; end if;
  if p_role not in ('boss', 'runner') then raise exception '玩家身份无效'; end if;
  select * into v_room from public.rooms where code = upper(trim(p_code)) for update;
  if not found then raise exception '房间不存在，请检查房间码'; end if;
  if v_room.is_paused then raise exception '本局已被管理员暂停，暂时无法进入'; end if;

  -- The current browser may already own a seat. Require its original codename
  -- instead of allowing the seat identity to be renamed during reconnection.
  select * into v_existing from public.room_players rp
  where rp.room_id = v_room.id and rp.user_id = v_user_id;
  if v_existing.id is not null then
    if lower(v_existing.nickname) <> lower(trim(p_nickname)) then
      raise exception '行动代号不正确，请输入该席位原来的行动代号';
    end if;
    return query select v_room.id, v_room.code;
    return;
  end if;

  select count(*) into v_match_count from public.room_players rp
  where rp.room_id = v_room.id and lower(rp.nickname) = lower(trim(p_nickname));
  if v_match_count > 1 then raise exception '房间内存在重复行动代号，请联系管理员处理'; end if;

  -- A matching codename reclaims the original seat even after the game starts.
  if v_match_count = 1 then
    select * into v_existing from public.room_players rp
    where rp.room_id = v_room.id and lower(rp.nickname) = lower(trim(p_nickname));
    v_previous_user_id := v_existing.user_id;
    update public.room_players set user_id = v_user_id where id = v_existing.id;
    update public.rooms set
      current_turn = case when current_turn = v_previous_user_id then v_user_id else current_turn end,
      starting_player_id = case when starting_player_id = v_previous_user_id then v_user_id else starting_player_id end,
      winner_id = case when winner_id = v_previous_user_id then v_user_id else winner_id end
    where id = v_room.id;
    insert into public.game_events(room_id, message)
    values (v_room.id, v_existing.nickname || ' 通过原行动代号重新进入房间');
    return query select v_room.id, v_room.code;
    return;
  end if;

  if v_room.status <> 'lobby' then raise exception '行动代号不正确，进行中的房间只能由原玩家重新进入'; end if;
  if (select count(*) from public.room_players rp where rp.room_id = v_room.id) >= 3 then raise exception '房间人数已满'; end if;
  if p_role = 'boss' and exists (
    select 1 from public.room_players rp where rp.room_id = v_room.id and rp.role = 'boss'
  ) then raise exception '老板席已经有人了'; end if;
  if p_role = 'runner' and (
    select count(*) from public.room_players rp where rp.room_id = v_room.id and rp.role = 'runner'
  ) >= 2 then raise exception '两个打手席已经满了'; end if;
  select coalesce(max(rp.turn_order), -1) + 1 into v_turn_order
  from public.room_players rp where rp.room_id = v_room.id;
  insert into public.room_players(room_id, user_id, nickname, role, turn_order, coins, dice_count)
  values (
    v_room.id, v_user_id, trim(p_nickname), p_role, v_turn_order,
    case when p_role = 'boss' then v_room.base_guarantee else 0 end,
    v_room.rolls_per_turn
  );
  insert into public.game_events(room_id, message)
  values (v_room.id, trim(p_nickname) || ' 以' || case when p_role = 'boss' then '老板' else '打手' end || '身份加入房间');
  return query select v_room.id, v_room.code;
end;
$$;

create or replace function public.set_ready(p_room_id uuid, p_ready boolean)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (select 1 from public.rooms where id = p_room_id and status = 'lobby' and not is_paused) then raise exception '当前不能修改准备状态'; end if;
  update public.room_players set is_ready = p_ready where room_id = p_room_id and user_id = auth.uid();
  if not found then raise exception '你不在该房间中'; end if;
end;
$$;

create or replace function public.update_lobby_player(p_room_id uuid, p_nickname text, p_role text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_room public.rooms%rowtype;
  v_player public.room_players%rowtype;
  v_replacement public.room_players%rowtype;
begin
  if auth.uid() is null then raise exception '请先建立玩家身份'; end if;
  if char_length(trim(p_nickname)) not between 2 and 12 then raise exception '行动代号需要 2 到 12 个字符'; end if;
  if p_role not in ('boss', 'runner') then raise exception '玩家身份无效'; end if;

  select * into v_room from public.rooms where id = p_room_id for update;
  if not found or v_room.status <> 'lobby' or v_room.is_paused then raise exception '只能在开始房间前修改玩家信息'; end if;
  select * into v_player from public.room_players
  where room_id = p_room_id and user_id = auth.uid() for update;
  if not found then raise exception '你不在该房间中'; end if;
  if exists (
    select 1 from public.room_players
    where room_id = p_room_id and id <> v_player.id and lower(nickname) = lower(trim(p_nickname))
  ) then raise exception '该行动代号已被使用'; end if;

  if p_role = 'boss' then
    update public.room_players set role = 'runner', coins = 0, is_ready = false
    where room_id = p_room_id and id <> v_player.id and role = 'boss';
  elsif v_player.role = 'boss' and (
    select count(*) from public.room_players where room_id = p_room_id and id <> v_player.id and role = 'runner'
  ) >= 2 then
    select * into v_replacement from public.room_players
    where room_id = p_room_id and id <> v_player.id and role = 'runner'
    order by turn_order limit 1 for update;
    update public.room_players set role = 'boss', coins = v_room.base_guarantee, is_ready = false
    where id = v_replacement.id;
  end if;
  update public.room_players set
    nickname = trim(p_nickname),
    role = p_role,
    coins = case when p_role = 'boss' then v_room.base_guarantee else 0 end,
    is_ready = false
  where id = v_player.id;
  insert into public.game_events(room_id, message)
  values (
    p_room_id,
    v_player.nickname || '将行动代号改为 ' || trim(p_nickname) || '，并切换为' || case when p_role = 'boss' then '老板' else '打手' end
  );
end;
$$;

create or replace function public.create_zero_dice_rule_internal(p_room_id uuid)
returns bigint
language plpgsql security definer set search_path = public
as $$
declare
  v_room public.rooms%rowtype;
  v_sequence integer;
  v_runner_rules text;
  v_boss_guarantee integer;
  v_base_text text;
  v_rule_id bigint;
begin
  select * into v_room from public.rooms where id = p_room_id for update;
  if not found or v_room.status <> 'playing' then return null; end if;
  if exists (select 1 from public.room_players where room_id = p_room_id and dice_count > 0) then return null; end if;
  if not exists (
    select 1 from public.game_events
    where room_id = p_room_id and event_type = 'roll' and settlement_rule_id is null
  ) then return null; end if;

  select coalesce(max(sequence_number), 0) + 1 into v_sequence
  from public.room_settlement_rules where room_id = p_room_id;
  select coalesce(coins, 0) into v_boss_guarantee
  from public.room_players where room_id = p_room_id and role = 'boss' limit 1;
  v_boss_guarantee := coalesce(v_boss_guarantee, 0);

  select string_agg('「' || rule_name || '」：' || rule_detail, '；' order by first_event_id)
  into v_runner_rules
  from (
    select
      metadata ->> 'tile_name' as rule_name,
      metadata ->> 'tile_detail' as rule_detail,
      min(id) as first_event_id
    from public.game_events
    where room_id = p_room_id
      and event_type = 'roll'
      and metadata ->> 'role' = 'runner'
      and metadata ->> 'effect_type' = 'none'
      and metadata ->> 'tile_type' <> 'empty'
    group by metadata ->> 'tile_name', metadata ->> 'tile_detail'
  ) as runner_rules;

  v_base_text := '第 ' || v_sequence || ' 次全员骰子归零：' ||
    case when v_runner_rules is null
      then '本批次打手未触发新的持续遵守规则'
      else '截至本次，打手需遵守 ' || v_runner_rules
    end || '；老板当前保底 ' || v_boss_guarantee || ' 万。';

  insert into public.room_settlement_rules(room_id, sequence_number, base_text)
  values (p_room_id, v_sequence, v_base_text)
  returning id into v_rule_id;

  update public.game_events set settlement_rule_id = v_rule_id
  where room_id = p_room_id and event_type = 'roll' and settlement_rule_id is null;
  insert into public.game_events(room_id, message, event_type, settlement_rule_id, metadata)
  values (
    p_room_id, v_base_text, 'settlement_rule', v_rule_id,
    jsonb_build_object('sequence_number', v_sequence)
  );
  return v_rule_id;
end;
$$;

revoke all on function public.create_zero_dice_rule_internal(uuid) from public;
revoke all on function public.create_zero_dice_rule_internal(uuid) from authenticated;

create or replace function public.advance_room_turn_internal(p_room_id uuid, p_after_order integer)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_room public.rooms%rowtype;
  v_candidate public.room_players%rowtype;
  v_player_count integer;
  v_order integer := coalesce(p_after_order, -1);
  v_step integer;
  v_next_rolls integer;
begin
  select * into v_room from public.rooms where id = p_room_id for update;
  if not found or v_room.status <> 'playing' then raise exception '当前没有进行中的行动'; end if;
  select count(*) into v_player_count from public.room_players where room_id = p_room_id;
  if v_player_count = 0 then raise exception '房间内没有玩家'; end if;

  for v_step in 1..greatest(v_player_count * 6, 6) loop
    select * into v_candidate from public.room_players
    where room_id = p_room_id and turn_order > v_order order by turn_order limit 1;
    if not found then
      select * into v_candidate from public.room_players where room_id = p_room_id order by turn_order limit 1;
    end if;
    if v_candidate.id is null then exit; end if;

    if v_candidate.skip_turns > 0 then
      update public.room_players set skip_turns = skip_turns - 1 where id = v_candidate.id;
      insert into public.game_events(room_id, message) values (p_room_id, v_candidate.nickname || ' 跳过 1 次行动');
      v_order := v_candidate.turn_order;
    else
      v_next_rolls := greatest(0, least(20, v_candidate.dice_count + v_candidate.next_roll_modifier));
      update public.room_players set next_roll_modifier = 0, dice_count = v_next_rolls where id = v_candidate.id;
      if v_next_rolls = 0 then
        insert into public.game_events(room_id, message)
        values (p_room_id, v_candidate.nickname || ' 没有可用骰子，自动跳过本回合');
        v_order := v_candidate.turn_order;
      else
        update public.rooms set current_turn = v_candidate.user_id, rolls_remaining = v_next_rolls where id = p_room_id;
        return;
      end if;
    end if;

    if mod(v_step, v_player_count) = 0 and not exists (
      select 1 from public.room_players where room_id = p_room_id and dice_count > 0
    ) then
      update public.rooms set current_turn = null, rolls_remaining = 0 where id = p_room_id;
      perform public.create_zero_dice_rule_internal(p_room_id);
      insert into public.game_events(room_id, message)
      values (p_room_id, '所有玩家都没有可用骰子，等待管理员补充');
      return;
    end if;
  end loop;

  update public.rooms set current_turn = null, rolls_remaining = 0 where id = p_room_id;
  if not exists (select 1 from public.room_players where room_id = p_room_id and dice_count > 0) then
    perform public.create_zero_dice_rule_internal(p_room_id);
  end if;
  insert into public.game_events(room_id, message)
  values (p_room_id, '当前没有可行动玩家，等待管理员处理');
end;
$$;

revoke all on function public.advance_room_turn_internal(uuid, integer) from public;
revoke all on function public.advance_room_turn_internal(uuid, integer) from authenticated;

create or replace function public.admin_clear_cache()
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception '只有管理员可以清理缓存'; end if;
  perform pg_notify('pgrst', 'reload schema');
end;
$$;

create or replace function public.admin_update_round_chances(
  p_room_id uuid, p_round1_chance integer, p_round2_chance integer
)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception '只有管理员可以修改推进概率'; end if;
  if p_round1_chance not between 0 and 100 or p_round2_chance not between 0 and 100 then raise exception '推进概率必须在 0 到 100 之间'; end if;
  update public.rooms set round1_advance_chance = p_round1_chance, round2_advance_chance = p_round2_chance
  where id = p_room_id and status = 'lobby';
  if not found then raise exception '只能在开局前修改推进概率'; end if;
  insert into public.game_events(room_id, message) values (p_room_id, '管理员更新了三轮推进设置');
end;
$$;

drop function if exists public.admin_update_room_settings(uuid, uuid, integer);

create or replace function public.admin_update_room_settings(
  p_room_id uuid, p_starting_player_id uuid, p_rolls_per_turn integer, p_base_guarantee integer
)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception '只有管理员可以修改回合设置'; end if;
  if p_rolls_per_turn not between 1 and 5 then raise exception '初始骰子数量必须在 1 到 5 之间'; end if;
  if p_base_guarantee not between 0 and 10000 then raise exception '基础保底必须在 0 到 10000 万之间'; end if;
  if p_starting_player_id is not null and not exists (
    select 1 from public.room_players where room_id = p_room_id and user_id = p_starting_player_id
  ) then raise exception '首位玩家不在当前房间'; end if;
  update public.rooms set starting_player_id = p_starting_player_id, rolls_per_turn = p_rolls_per_turn,
    rolls_remaining = p_rolls_per_turn, base_guarantee = p_base_guarantee
  where id = p_room_id and status = 'lobby';
  if not found then raise exception '只能在开局前修改回合设置'; end if;
  update public.room_players set
    dice_count = p_rolls_per_turn,
    coins = case when role = 'boss' then p_base_guarantee else 0 end
  where room_id = p_room_id;
  insert into public.game_events(room_id, message)
  values (p_room_id, '管理员更新了首位玩家、初始骰子和老板基础保底 ' || p_base_guarantee || ' 万');
end;
$$;

create or replace function public.admin_adjust_player_dice(p_room_id uuid, p_player_id uuid, p_delta integer)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_room public.rooms%rowtype;
  v_player public.room_players%rowtype;
  v_next_count integer;
begin
  if not public.is_admin() then raise exception '只有管理员可以调整玩家骰子'; end if;
  if p_delta not in (-1, 1) then raise exception '每次只能增加或减少 1 个骰子'; end if;
  select * into v_room from public.rooms where id = p_room_id for update;
  if not found or v_room.status = 'finished' then raise exception '当前房间不能调整骰子'; end if;
  select * into v_player from public.room_players where id = p_player_id and room_id = p_room_id for update;
  if not found then raise exception '玩家不在当前房间'; end if;
  v_next_count := v_player.dice_count + p_delta;
  if v_next_count not between 0 and 20 then raise exception '玩家骰子数量必须在 0 到 20 之间'; end if;
  update public.room_players set dice_count = v_next_count where id = v_player.id;
  insert into public.game_events(room_id, message)
  values (p_room_id, '管理员为 ' || v_player.nickname || case when p_delta > 0 then ' 增加 1 个骰子' else ' 减少 1 个骰子' end || '，当前 ' || v_next_count || ' 个');
  if v_room.status = 'playing' and v_room.current_turn = v_player.user_id then
    if v_next_count = 0 then
      insert into public.game_events(room_id, message)
      values (p_room_id, v_player.nickname || ' 没有可用骰子，自动跳过本回合');
      perform public.advance_room_turn_internal(p_room_id, v_player.turn_order);
    else
      update public.rooms set rolls_remaining = v_next_count where id = p_room_id;
    end if;
  elsif v_room.status = 'playing' and v_room.current_turn is null and v_next_count > 0 then
    perform public.advance_room_turn_internal(p_room_id, v_player.turn_order - 1);
  end if;
end;
$$;

create or replace function public.admin_set_player_dice(p_room_id uuid, p_player_id uuid, p_dice_count integer)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_room public.rooms%rowtype;
  v_player public.room_players%rowtype;
begin
  if not public.is_admin() then raise exception '只有管理员可以调整玩家骰子'; end if;
  if p_dice_count not between 0 and 20 then raise exception '玩家骰子数量必须在 0 到 20 之间'; end if;
  select * into v_room from public.rooms where id = p_room_id for update;
  if not found or v_room.status = 'finished' then raise exception '当前房间不能调整骰子'; end if;
  select * into v_player from public.room_players where id = p_player_id and room_id = p_room_id for update;
  if not found then raise exception '玩家不在当前房间'; end if;

  update public.room_players set dice_count = p_dice_count where id = v_player.id;
  insert into public.game_events(room_id, message)
  values (p_room_id, '管理员将 ' || v_player.nickname || ' 的骰子设为 ' || p_dice_count || ' 个');
  if v_room.status = 'playing' and v_room.current_turn = v_player.user_id then
    if p_dice_count = 0 then
      insert into public.game_events(room_id, message)
      values (p_room_id, v_player.nickname || ' 没有可用骰子，自动跳过本回合');
      perform public.advance_room_turn_internal(p_room_id, v_player.turn_order);
    else
      update public.rooms set rolls_remaining = p_dice_count where id = p_room_id;
    end if;
  elsif v_room.status = 'playing' and v_room.current_turn is null and p_dice_count > 0 then
    perform public.advance_room_turn_internal(p_room_id, v_player.turn_order - 1);
  end if;
end;
$$;

create or replace function public.admin_update_player_role(p_room_id uuid, p_player_id uuid, p_role text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_room public.rooms%rowtype;
  v_player public.room_players%rowtype;
  v_existing_boss public.room_players%rowtype;
  v_replacement public.room_players%rowtype;
  v_guarantee integer;
begin
  if not public.is_admin() then raise exception '只有管理员可以修改玩家身份'; end if;
  if p_role not in ('boss', 'runner') then raise exception '玩家身份无效'; end if;
  select * into v_room from public.rooms where id = p_room_id for update;
  if not found or v_room.status = 'finished' then raise exception '已结束的房间不能修改玩家身份'; end if;
  select * into v_player from public.room_players where id = p_player_id and room_id = p_room_id for update;
  if not found then raise exception '玩家不在当前房间'; end if;
  if v_player.role = p_role then return; end if;

  if p_role = 'boss' then
    select * into v_existing_boss from public.room_players
    where room_id = p_room_id and id <> v_player.id and role = 'boss'
    limit 1 for update;
    v_guarantee := case
      when v_room.status = 'lobby' then v_room.base_guarantee
      else coalesce(v_existing_boss.coins, v_room.base_guarantee)
    end;
    update public.room_players set
      role = 'runner', coins = 0,
      is_ready = case when v_room.status = 'lobby' then false else is_ready end
    where room_id = p_room_id and id <> v_player.id and role = 'boss';
  elsif v_player.role = 'boss' and (
    v_room.status = 'playing' or (
      select count(*) from public.room_players where room_id = p_room_id and id <> v_player.id and role = 'runner'
    ) >= 2
  ) then
    select * into v_replacement from public.room_players
    where room_id = p_room_id and id <> v_player.id and role = 'runner'
    order by turn_order limit 1 for update;
    if not found then raise exception '当前房间没有可接替的打手'; end if;
    update public.room_players set
      role = 'boss',
      coins = case when v_room.status = 'lobby' then v_room.base_guarantee else v_player.coins end,
      round_roll_count = 0,
      is_ready = case when v_room.status = 'lobby' then false else is_ready end
    where id = v_replacement.id;
  end if;
  update public.room_players set
    role = p_role,
    coins = case when p_role = 'boss' then v_guarantee else 0 end,
    round_roll_count = case when p_role = 'boss' then 0 else round_roll_count end,
    is_ready = case when v_room.status = 'lobby' then false else is_ready end
  where id = v_player.id;
  insert into public.game_events(room_id, message)
  values (p_room_id, '管理员将 ' || v_player.nickname || ' 设为' || case when p_role = 'boss' then '老板' else '打手' end);
end;
$$;

create or replace function public.admin_adjust_boss_guarantee(p_room_id uuid, p_delta integer)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_room public.rooms%rowtype;
  v_boss public.room_players%rowtype;
  v_limit integer;
  v_next_guarantee integer;
  v_actual_change integer;
begin
  if not public.is_admin() then raise exception '只有管理员可以调整老板保底'; end if;
  if p_delta not in (-10, 10) then raise exception '每次只能增加或减少 10 万保底'; end if;

  select * into v_room from public.rooms where id = p_room_id for update;
  if not found or v_room.status = 'finished' then raise exception '当前房间不能调整保底'; end if;
  select * into v_boss from public.room_players
  where room_id = p_room_id and role = 'boss' for update;
  if not found then raise exception '当前房间还没有老板'; end if;

  v_limit := case when v_room.status = 'lobby' then 10000 else 1000000 end;
  v_next_guarantee := least(v_limit, greatest(0, v_boss.coins + p_delta));
  v_actual_change := v_next_guarantee - v_boss.coins;
  update public.room_players set coins = v_next_guarantee where id = v_boss.id;
  if v_room.status = 'lobby' then
    update public.rooms set base_guarantee = v_next_guarantee where id = p_room_id;
  end if;

  insert into public.game_events(room_id, message)
  values (
    p_room_id,
    '管理员为老板保底' || case when v_actual_change >= 0 then '增加 ' else '减少 ' end
      || abs(v_actual_change) || ' 万，当前 ' || v_next_guarantee || ' 万'
  );
end;
$$;

create or replace function public.admin_set_boss_guarantee(p_room_id uuid, p_guarantee integer)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_room public.rooms%rowtype;
  v_boss public.room_players%rowtype;
  v_limit integer;
begin
  if not public.is_admin() then raise exception '只有管理员可以调整老板保底'; end if;
  select * into v_room from public.rooms where id = p_room_id for update;
  if not found or v_room.status = 'finished' then raise exception '当前房间不能调整保底'; end if;
  v_limit := case when v_room.status = 'lobby' then 10000 else 1000000 end;
  if p_guarantee not between 0 and v_limit then
    raise exception '老板保底必须在 0 到 % 万之间', v_limit;
  end if;
  select * into v_boss from public.room_players
  where room_id = p_room_id and role = 'boss' for update;
  if not found then raise exception '当前房间还没有老板'; end if;

  update public.room_players set coins = p_guarantee where id = v_boss.id;
  if v_room.status = 'lobby' then
    update public.rooms set base_guarantee = p_guarantee where id = p_room_id;
  end if;
  insert into public.game_events(room_id, message)
  values (p_room_id, '管理员将老板保底从 ' || v_boss.coins || ' 万设为 ' || p_guarantee || ' 万');
end;
$$;

drop function if exists public.admin_update_room_tile(uuid, text, text, text, text, text, integer);

create or replace function public.admin_update_room_tile(
  p_tile_id uuid, p_name text, p_short_name text, p_tile_type text,
  p_detail text, p_effect_type text, p_effect_value numeric
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_tile public.room_tiles%rowtype;
  v_move_limit integer;
  v_skip_limit integer;
  v_board_size integer;
begin
  if not public.is_admin() then raise exception '只有管理员可以编辑棋盘'; end if;
  select rt.* into v_tile from public.room_tiles rt join public.rooms r on r.id = rt.room_id
  where rt.id = p_tile_id and r.status = 'lobby' for update of rt;
  if not found then raise exception '格子不存在，或房间已经开始'; end if;
  if char_length(trim(p_name)) not between 1 and 40 then raise exception '完整名称需要 1 到 40 个字符'; end if;
  if char_length(trim(p_short_name)) not between 1 and 16 then raise exception '棋盘短名需要 1 到 16 个字符'; end if;
  if char_length(trim(p_detail)) not between 1 and 160 then raise exception '落格说明需要 1 到 160 个字符'; end if;
  if p_tile_type not in ('shared','boss','runner','empty','move','chance') then raise exception '格子分类无效'; end if;
  if p_effect_type not in ('none','guarantee_add','guarantee_subtract','guarantee_multiply','guarantee_divide','move','skip','extra_roll','lose_roll','advance_chance','advance_round','finish') then raise exception '格子效果无效'; end if;
  if p_tile_type = 'empty' and (p_effect_type <> 'none' or p_effect_value <> 0) then raise exception '空格不能附带效果'; end if;
  if p_effect_type in ('none','advance_chance','advance_round','finish') and p_effect_value <> 0 then raise exception '该效果的数值必须为 0'; end if;
  if p_effect_type not in ('guarantee_multiply','guarantee_divide') and p_effect_value <> trunc(p_effect_value) then raise exception '该效果数值必须是整数'; end if;
  if p_effect_type in ('advance_chance','advance_round') and v_tile.round_number = 3 then raise exception '第三轮不能配置晋级效果'; end if;
  if p_effect_type = 'finish' and v_tile.round_number <> 3 then raise exception '结束本局只能配置在第三轮'; end if;
  v_move_limit := case v_tile.round_number when 1 then 2 when 2 then 3 else 5 end;
  v_skip_limit := case v_tile.round_number when 1 then 1 else 2 end;
  if p_effect_type = 'move' and (p_effect_value = 0 or abs(p_effect_value) > v_move_limit) then raise exception '本轮移动格数超出允许范围'; end if;
  if p_effect_type = 'skip' and p_effect_value not between 1 and v_skip_limit then raise exception '本轮暂停次数超出允许范围'; end if;
  if p_effect_type in ('extra_roll','lose_roll') and p_effect_value not between 1 and 2 then raise exception '掷骰次数效果必须在 1 到 2 之间'; end if;
  if p_effect_type in ('guarantee_add','guarantee_subtract') and p_effect_value not between 1 and 100000 then raise exception '老板保底加减必须在 1 到 100000 万之间'; end if;
  if p_effect_type in ('guarantee_multiply','guarantee_divide') and p_effect_value not between 0 and 10 then raise exception '老板保底乘除倍数必须在 0 到 10 之间'; end if;
  if v_tile.tile_type = 'empty' and p_tile_type <> 'empty' and (
    select count(*) from public.room_tiles where room_id = v_tile.room_id and round_number = v_tile.round_number and tile_type = 'empty'
  ) <= 1 then raise exception '每轮至少保留一个空格'; end if;
  if v_tile.effect_type = 'finish' and p_effect_type <> 'finish' and (
    select count(*) from public.room_tiles where room_id = v_tile.room_id and round_number = 3 and effect_type = 'finish'
  ) <= 1 then raise exception '第三轮至少保留一个结束格'; end if;

  update public.room_tiles set template_id = null, name = trim(p_name), short_name = trim(p_short_name),
    tile_type = p_tile_type, detail = trim(p_detail), effect_type = p_effect_type, effect_value = p_effect_value
  where id = p_tile_id;
  if v_tile.round_number < 3 then
    v_board_size := case when v_tile.round_number = 1 then 8 else 12 end;
    if exists (
      select 1 from generate_series(0, v_board_size - 1) as positions(position)
      where not exists (
        select 1 from public.room_tiles rt
        where rt.room_id = v_tile.room_id and rt.round_number = v_tile.round_number
          and rt.effect_type in ('advance_chance', 'advance_round')
          and mod(rt.position - positions.position + v_board_size, v_board_size) between 1 and 6
      )
    ) or exists (
      select 1 from generate_series(0, v_board_size - 1) as positions(position)
      where not exists (
        select 1 from public.room_tiles rt
        where rt.room_id = v_tile.room_id and rt.round_number = v_tile.round_number
          and rt.effect_type not in ('advance_chance', 'advance_round')
          and mod(rt.position - positions.position + v_board_size, v_board_size) between 1 and 6
      )
    ) then raise exception '晋级格布局无效：任意位置的 1 到 6 点都必须同时存在晋级和非晋级落点'; end if;
  end if;
  insert into public.game_events(room_id, message)
  values (v_tile.room_id, '管理员修改了第' || v_tile.round_number || '轮第 ' || (v_tile.position + 1) || ' 格');
end;
$$;

create or replace function public.admin_start_game(p_room_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_first_user uuid;
  v_first_name text;
  v_first_order integer;
  v_rolls integer;
begin
  if not public.is_admin() then raise exception '只有管理员可以开始房间'; end if;
  perform 1 from public.rooms where id = p_room_id and status = 'lobby' for update;
  if not found then raise exception '房间不存在或已经开始'; end if;
  if exists (select 1 from public.room_players where room_id = p_room_id and not is_ready) then raise exception '还有玩家没有准备'; end if;
  if (select count(*) from public.room_players where room_id = p_room_id) not between 2 and 3
    or (select count(*) from public.room_players where room_id = p_room_id and role = 'boss') <> 1
    or (select count(*) from public.room_players where room_id = p_room_id and role = 'runner') not between 1 and 2
  then raise exception '需要 1 名老板和 1 至 2 名打手才能开始'; end if;
  if (select count(*) from public.room_tiles where room_id = p_room_id and round_number = 1) <> 8
    or (select count(*) from public.room_tiles where room_id = p_room_id and round_number = 2) <> 12
    or (select count(*) from public.room_tiles where room_id = p_room_id and round_number = 3) <> 24
  then raise exception '三轮棋盘格数量不完整，请重新随机生成'; end if;
  if exists (
    select 1 from (values (1),(2),(3)) as rounds(round_number)
    where not exists (
      select 1 from public.room_tiles t where t.room_id = p_room_id and t.round_number = rounds.round_number and t.tile_type = 'empty'
    )
  ) then raise exception '每轮至少需要一个空格'; end if;
  if not exists (select 1 from public.room_tiles where room_id = p_room_id and round_number = 3 and effect_type = 'finish') then
    raise exception '第三轮至少需要一个结束格';
  end if;
  if exists (
    select 1
    from (values (1, 8), (2, 12)) as rounds(round_number, board_size)
    cross join lateral generate_series(0, rounds.board_size - 1) as positions(position)
    where not exists (
      select 1 from public.room_tiles t
      where t.room_id = p_room_id and t.round_number = rounds.round_number
        and t.effect_type in ('advance_chance', 'advance_round')
        and mod(t.position - positions.position + rounds.board_size, rounds.board_size) between 1 and 6
    ) or not exists (
      select 1 from public.room_tiles t
      where t.room_id = p_room_id and t.round_number = rounds.round_number
        and t.effect_type not in ('advance_chance', 'advance_round')
        and mod(t.position - positions.position + rounds.board_size, rounds.board_size) between 1 and 6
    )
  ) then raise exception '第一轮或第二轮的晋级格布局无效，请重新随机全部三轮'; end if;

  select p.user_id, p.nickname, p.turn_order into v_first_user, v_first_name, v_first_order
  from public.room_players p join public.rooms r on r.id = p.room_id
  where p.room_id = p_room_id and p.user_id = r.starting_player_id limit 1;
  if v_first_user is null then
    select user_id, nickname, turn_order into v_first_user, v_first_name, v_first_order from public.room_players
    where room_id = p_room_id order by turn_order limit 1;
  end if;
  update public.rooms set status = 'playing', is_paused = false, current_turn = null, current_round = 1,
    board_size = 8, winner_id = null, rolls_remaining = 0 where id = p_room_id;
  update public.room_players p set position = 0, distance = 0,
    coins = case when p.role = 'boss' then r.base_guarantee else 0 end,
    skip_turns = 0, next_roll_modifier = 0, round_roll_count = 0
  from public.rooms r where p.room_id = p_room_id and r.id = p_room_id;
  perform public.advance_room_turn_internal(p_room_id, v_first_order - 1);
  select p.user_id, p.nickname, r.rolls_remaining into v_first_user, v_first_name, v_rolls
  from public.rooms r join public.room_players p on p.room_id = r.id and p.user_id = r.current_turn
  where r.id = p_room_id;
  insert into public.game_events(room_id, message)
  values (p_room_id, '本局开始，' || v_first_name || ' 先行动，当前有 ' || v_rolls || ' 个骰子');
end;
$$;

create or replace function public.admin_finish_room(p_room_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception '只有管理员可以结束房间'; end if;
  update public.rooms set status = 'finished', is_paused = false, current_turn = null, rolls_remaining = 0
  where id = p_room_id and status = 'playing';
  if not found then raise exception '该房间当前不在进行中'; end if;
  insert into public.game_events(room_id, message) values (p_room_id, '管理员手动结束了本局');
end;
$$;

create or replace function public.admin_set_room_paused(p_room_id uuid, p_paused boolean)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_room public.rooms%rowtype;
begin
  if not public.is_admin() then raise exception '只有管理员可以暂停或继续本局'; end if;
  if p_paused is null then raise exception '暂停状态无效'; end if;
  select * into v_room from public.rooms where id = p_room_id for update;
  if not found or v_room.status <> 'playing' then raise exception '只有进行中的房间可以暂停或继续'; end if;
  if v_room.is_paused = p_paused then return; end if;
  update public.rooms set is_paused = p_paused where id = p_room_id;
  insert into public.game_events(room_id, message)
  values (p_room_id, case when p_paused then '管理员暂停了本局，所有行动已锁定' else '管理员继续了本局，行动恢复' end);
end;
$$;

create or replace function public.admin_delete_room(p_room_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception '只有管理员可以删除房间'; end if;

  -- 显式清理房间的所有业务数据，不仅依赖外键的级联删除。
  perform 1 from public.rooms where id = p_room_id for update;
  if not found then raise exception '房间不存在或已被删除'; end if;

  delete from public.game_events where room_id = p_room_id;
  delete from public.room_settlement_rules where room_id = p_room_id;
  delete from public.room_tiles where room_id = p_room_id;
  delete from public.room_players where room_id = p_room_id;
  delete from public.rooms where id = p_room_id;
end;
$$;

create or replace function public.leave_room(p_room_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_nickname text;
begin
  select nickname into v_nickname from public.room_players
  where room_id = p_room_id and user_id = auth.uid();
  if v_nickname is null then return; end if;
  insert into public.game_events(room_id, message)
  values (p_room_id, v_nickname || ' 暂时离开了房间，席位已保留');
end;
$$;

create or replace function public.roll_dice(p_room_id uuid)
returns table(dice_value integer, landed_position integer, coin_change integer, winner boolean)
language plpgsql security definer set search_path = public
as $$
declare
  v_room public.rooms%rowtype;
  v_player public.room_players%rowtype;
  v_tile public.room_tiles%rowtype;
  v_dice integer;
  v_landed integer;
  v_position integer;
  v_distance integer;
  v_change integer := 0;
  v_remaining integer;
  v_skip integer;
  v_modifier integer;
  v_chance integer;
  v_candidate_dice integer[];
  v_should_advance boolean;
  v_advanced boolean := false;
  v_finished boolean := false;
  v_next_round integer;
  v_next_size integer;
  v_guarantee_before integer;
  v_guarantee integer;
begin
  select * into v_room from public.rooms where id = p_room_id for update;
  if not found or v_room.status <> 'playing' then raise exception '当前没有进行中的行动'; end if;
  if v_room.is_paused then raise exception '本局已被管理员暂停，暂时不能掷骰'; end if;
  if v_room.current_turn <> auth.uid() then raise exception '还没有轮到你'; end if;
  select * into v_player from public.room_players where room_id = p_room_id and user_id = auth.uid() for update;
  if not found then raise exception '你不在该房间中'; end if;
  if v_player.dice_count <= 0 then raise exception '当前没有可用骰子'; end if;

  if v_room.current_round < 3 then
    v_chance := case when v_room.current_round = 1 then v_room.round1_advance_chance else v_room.round2_advance_chance end;
    v_should_advance := v_player.role = 'boss'
      and v_player.round_roll_count >= 2
      and floor(random() * 100)::integer < v_chance;
    select array_agg(candidate.dice order by candidate.dice) into v_candidate_dice
    from generate_series(1, 6) as candidate(dice)
    join public.room_tiles rt on rt.room_id = p_room_id
      and rt.round_number = v_room.current_round
      and rt.position = mod(v_player.position + candidate.dice, v_room.board_size)
    where (rt.effect_type in ('advance_chance', 'advance_round')) = v_should_advance;
    if coalesce(array_length(v_candidate_dice, 1), 0) = 0 then
      raise exception '当前棋盘的晋级格布局无效，请管理员重新随机全部三轮';
    end if;
    v_dice := v_candidate_dice[1 + floor(random() * array_length(v_candidate_dice, 1))::integer];
  else
    v_dice := floor(random() * 6 + 1)::integer;
  end if;
  v_landed := mod(v_player.position + v_dice, v_room.board_size);
  v_position := v_landed;
  v_distance := v_player.distance + v_dice;
  v_remaining := greatest(0, v_player.dice_count - 1);
  v_skip := v_player.skip_turns;
  v_modifier := v_player.next_roll_modifier;
  select * into v_tile from public.room_tiles
  where room_id = p_room_id and round_number = v_room.current_round and position = v_landed;
  if not found then raise exception '当前棋盘配置不完整'; end if;

  case v_tile.effect_type
    when 'guarantee_add' then
      null;
    when 'guarantee_subtract' then
      null;
    when 'guarantee_multiply' then
      null;
    when 'guarantee_divide' then
      null;
    when 'move' then
      v_position := mod(mod(v_position + v_tile.effect_value::integer, v_room.board_size) + v_room.board_size, v_room.board_size);
      v_distance := greatest(0, v_distance + v_tile.effect_value::integer);
    when 'skip' then
      v_skip := least(3, v_skip + v_tile.effect_value::integer);
    when 'extra_roll' then
      v_remaining := least(20, v_remaining + v_tile.effect_value::integer);
    when 'lose_roll' then
      v_modifier := greatest(-4, v_modifier - v_tile.effect_value::integer);
    when 'advance_chance' then
      v_advanced := v_room.current_round < 3
        and v_player.role = 'boss'
        and v_player.round_roll_count >= 2;
    when 'advance_round' then
      v_advanced := v_room.current_round < 3
        and v_player.role = 'boss'
        and v_player.round_roll_count >= 2;
    when 'finish' then
      v_finished := v_room.current_round = 3;
    else
      null;
  end case;

  update public.room_players set position = v_position, distance = v_distance,
    skip_turns = v_skip, next_roll_modifier = v_modifier, dice_count = v_remaining,
    round_roll_count = round_roll_count + 1
  where id = v_player.id;
  insert into public.game_events(room_id, message, event_type, metadata)
  values (
    p_room_id,
    v_player.nickname || ' 掷出 ' || v_dice || '，落到「' || v_tile.name || '」：' || v_tile.detail,
    'roll',
    jsonb_build_object(
      'player_id', v_player.id,
      'player_name', v_player.nickname,
      'role', v_player.role,
      'round', v_room.current_round,
      'dice', v_dice,
      'landed_position', v_landed,
      'tile_name', v_tile.name,
      'tile_detail', v_tile.detail,
      'tile_type', v_tile.tile_type,
      'effect_type', v_tile.effect_type,
      'effect_value', v_tile.effect_value
    )
  );
  if v_tile.effect_type in ('guarantee_add','guarantee_subtract','guarantee_multiply','guarantee_divide') then
    select coins into v_guarantee_before from public.room_players
    where room_id = p_room_id and role = 'boss' for update;
    if not found then raise exception '当前房间没有老板，无法结算保底'; end if;

    v_guarantee := case v_tile.effect_type
      when 'guarantee_add' then least(1000000::numeric, v_guarantee_before::numeric + v_tile.effect_value)::integer
      when 'guarantee_subtract' then greatest(0, v_guarantee_before - v_tile.effect_value)
      when 'guarantee_multiply' then round(least(1000000::numeric, v_guarantee_before::numeric * v_tile.effect_value))::integer
      when 'guarantee_divide' then case when v_tile.effect_value = 0 then 0 else round(v_guarantee_before::numeric / v_tile.effect_value)::integer end
    end;
    v_change := v_guarantee - v_guarantee_before;
    update public.room_players set coins = v_guarantee
    where room_id = p_room_id and role = 'boss';
    insert into public.game_events(room_id, message)
    values (
      p_room_id,
      '老板保底' || case v_tile.effect_type
        when 'guarantee_add' then '增加 ' || v_tile.effect_value || ' 万'
        when 'guarantee_subtract' then '减少 ' || v_tile.effect_value || ' 万'
        when 'guarantee_multiply' then '乘以 ' || v_tile.effect_value
        else '除以 ' || v_tile.effect_value
      end || '：' || v_guarantee_before || ' 万 → ' || v_guarantee || ' 万'
    );
  end if;
  if v_tile.effect_type = 'move' then
    insert into public.game_events(room_id, message)
    values (p_room_id, v_player.nickname || case when v_tile.effect_value > 0 then ' 前进 ' else ' 后退 ' end || abs(v_tile.effect_value) || ' 格，到达第 ' || (v_position + 1) || ' 格');
  end if;
  if v_finished then
    if not exists (select 1 from public.room_players where room_id = p_room_id and dice_count > 0) then
      perform public.create_zero_dice_rule_internal(p_room_id);
    end if;
    update public.rooms set status = 'finished', is_paused = false, winner_id = auth.uid(), current_turn = null, rolls_remaining = 0 where id = p_room_id;
    insert into public.game_events(room_id, message) values (p_room_id, v_player.nickname || ' 完成最终结算，本局结束');
  else
    if v_advanced then
      v_next_round := v_room.current_round + 1;
      v_next_size := case when v_next_round = 2 then 12 else 24 end;
      update public.rooms set current_round = v_next_round, board_size = v_next_size where id = p_room_id;
      update public.room_players set position = 0, round_roll_count = 0 where room_id = p_room_id;
      insert into public.game_events(room_id, message)
      values (p_room_id, '队伍进入第' || case when v_next_round = 2 then '二' else '三' end || '轮 ' || v_next_size || ' 格棋盘');
    end if;

    -- One die is one action. Always rotate after a roll. The helper skips
    -- players who have no dice or who must miss their next action.
    perform public.advance_room_turn_internal(p_room_id, v_player.turn_order);
  end if;

  return query select v_dice, v_position, v_change, v_finished;
end;
$$;

revoke all on function public.admin_create_room() from public;
revoke all on function public.admin_create_room() from authenticated;
revoke all on function public.admin_create_room(text) from public;
revoke all on function public.admin_clear_cache() from public;
revoke all on function public.admin_randomize_room_board(uuid) from public;
revoke all on function public.admin_import_room_config(uuid, jsonb) from public;
revoke all on function public.admin_update_settlement_rule_suffix(bigint, text) from public;
revoke all on function public.join_room(text, text, text) from public;
revoke all on function public.set_ready(uuid, boolean) from public;
revoke all on function public.update_lobby_player(uuid, text, text) from public;
revoke all on function public.admin_update_round_chances(uuid, integer, integer) from public;
revoke all on function public.admin_update_room_settings(uuid, uuid, integer, integer) from public;
revoke all on function public.admin_adjust_player_dice(uuid, uuid, integer) from public;
revoke all on function public.admin_set_player_dice(uuid, uuid, integer) from public;
revoke all on function public.admin_update_player_role(uuid, uuid, text) from public;
revoke all on function public.admin_adjust_boss_guarantee(uuid, integer) from public;
revoke all on function public.admin_set_boss_guarantee(uuid, integer) from public;
revoke all on function public.admin_update_room_tile(uuid, text, text, text, text, text, numeric) from public;
revoke all on function public.admin_start_game(uuid) from public;
revoke all on function public.admin_finish_room(uuid) from public;
revoke all on function public.admin_set_room_paused(uuid, boolean) from public;
revoke all on function public.admin_delete_room(uuid) from public;
revoke all on function public.leave_room(uuid) from public;
revoke all on function public.roll_dice(uuid) from public;

grant execute on function public.admin_create_room(text) to authenticated;
grant execute on function public.admin_clear_cache() to authenticated;
grant execute on function public.admin_randomize_room_board(uuid) to authenticated;
grant execute on function public.admin_import_room_config(uuid, jsonb) to authenticated;
grant execute on function public.admin_update_settlement_rule_suffix(bigint, text) to authenticated;
grant execute on function public.join_room(text, text, text) to authenticated;
grant execute on function public.set_ready(uuid, boolean) to authenticated;
grant execute on function public.update_lobby_player(uuid, text, text) to authenticated;
grant execute on function public.admin_update_round_chances(uuid, integer, integer) to authenticated;
grant execute on function public.admin_update_room_settings(uuid, uuid, integer, integer) to authenticated;
grant execute on function public.admin_adjust_player_dice(uuid, uuid, integer) to authenticated;
grant execute on function public.admin_set_player_dice(uuid, uuid, integer) to authenticated;
grant execute on function public.admin_update_player_role(uuid, uuid, text) to authenticated;
grant execute on function public.admin_adjust_boss_guarantee(uuid, integer) to authenticated;
grant execute on function public.admin_set_boss_guarantee(uuid, integer) to authenticated;
grant execute on function public.admin_update_room_tile(uuid, text, text, text, text, text, numeric) to authenticated;
grant execute on function public.admin_start_game(uuid) to authenticated;
grant execute on function public.admin_finish_room(uuid) to authenticated;
grant execute on function public.admin_set_room_paused(uuid, boolean) to authenticated;
grant execute on function public.admin_delete_room(uuid) to authenticated;
grant execute on function public.leave_room(uuid) to authenticated;
grant execute on function public.roll_dice(uuid) to authenticated;

grant select on public.rooms to authenticated;
grant select on public.room_players to authenticated;
grant select on public.game_events to authenticated;
grant select on public.room_settlement_rules to authenticated;
grant select on public.app_admins to authenticated;
grant select on public.room_tiles to authenticated;
grant select on public.tile_rule_templates to authenticated;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'rooms') then
    alter publication supabase_realtime add table public.rooms;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'room_players') then
    alter publication supabase_realtime add table public.room_players;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'game_events') then
    alter publication supabase_realtime add table public.game_events;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'room_tiles') then
    alter publication supabase_realtime add table public.room_tiles;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'room_settlement_rules') then
    alter publication supabase_realtime add table public.room_settlement_rules;
  end if;
end $$;

select pg_notify('pgrst', 'reload schema');

-- 双余额保底申请：room_players.coins 是现有保底，rooms.base_guarantee_balance 是基础保底余额。
alter table public.rooms add column if not exists base_guarantee_balance bigint;
update public.rooms set base_guarantee_balance = base_guarantee where base_guarantee_balance is null;
alter table public.rooms alter column base_guarantee_balance set default 100;
alter table public.rooms alter column base_guarantee_balance set not null;
alter table public.rooms drop constraint if exists rooms_base_guarantee_balance_check;
alter table public.rooms add constraint rooms_base_guarantee_balance_check check (base_guarantee_balance >= 0);

create or replace function public.sync_room_base_guarantee_balance()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.base_guarantee_balance := new.base_guarantee;
  elsif new.status = 'lobby' and new.base_guarantee is distinct from old.base_guarantee then
    new.base_guarantee_balance := new.base_guarantee;
  end if;
  return new;
end;
$$;
drop trigger if exists rooms_sync_base_guarantee_balance on public.rooms;
create trigger rooms_sync_base_guarantee_balance
before insert or update of base_guarantee on public.rooms
for each row execute function public.sync_room_base_guarantee_balance();

create table if not exists public.guarantee_requests (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  requester_player_id uuid not null references public.room_players(id) on delete cascade,
  requester_user_id uuid not null,
  requester_nickname text not null,
  operation text not null check (operation in ('add', 'subtract')),
  target text not null check (target in ('current', 'base', 'auto')),
  amount bigint not null check (amount > 0),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  current_guarantee_before bigint not null default 0,
  base_guarantee_before bigint not null default 0,
  current_guarantee_delta bigint not null default 0,
  base_guarantee_delta bigint not null default 0,
  current_guarantee_after bigint not null default 0,
  base_guarantee_after bigint not null default 0,
  reviewer_user_id uuid,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now()
);
alter table public.guarantee_requests enable row level security;
create index if not exists guarantee_requests_room_created_idx on public.guarantee_requests(room_id, created_at desc);
drop policy if exists "room members can read guarantee requests" on public.guarantee_requests;
create policy "room members can read guarantee requests" on public.guarantee_requests for select to authenticated using (public.is_room_member(room_id));
drop policy if exists "admins can read guarantee requests" on public.guarantee_requests;
create policy "admins can read guarantee requests" on public.guarantee_requests for select to authenticated using (public.is_admin());
grant select on public.guarantee_requests to authenticated;

create or replace function public.create_guarantee_request(
  p_room_id uuid, p_operation text, p_target text, p_amount bigint
)
returns public.guarantee_requests
language plpgsql security definer set search_path = public
as $$
declare
  v_player public.room_players%rowtype;
  v_boss public.room_players%rowtype;
  v_room public.rooms%rowtype;
  v_request public.guarantee_requests%rowtype;
  v_current bigint;
  v_base bigint;
  v_current_delta bigint := 0;
  v_base_delta bigint := 0;
begin
  if auth.uid() is null then raise exception '请先进入房间'; end if;
  if p_operation not in ('add', 'subtract') or p_target not in ('current', 'base', 'auto') then raise exception '保底申请类型无效'; end if;
  if p_amount is null or p_amount <= 0 then raise exception '申请数额必须是正整数'; end if;
  if p_amount > 1000000000 then raise exception '单次申请最多 10 亿'; end if;
  select * into v_room from public.rooms where id = p_room_id for update;
  if not found or v_room.status = 'finished' then raise exception '当前房间不能提交保底申请'; end if;
  select * into v_player from public.room_players where room_id = p_room_id and user_id = auth.uid() for update;
  if not found or v_player.role <> 'runner' then raise exception '只有打手可以提交保底申请'; end if;
  select * into v_boss from public.room_players where room_id = p_room_id and role = 'boss' for update;
  if not found then raise exception '当前房间还没有老板'; end if;
  v_current := greatest(0, v_boss.coins::bigint);
  v_base := greatest(0, coalesce(v_room.base_guarantee_balance, 0)::bigint);
  if p_operation = 'add' then
    if p_target = 'base' then v_base_delta := p_amount; else v_current_delta := p_amount; end if;
  else
    if p_target = 'current' then
      if p_amount > v_current then raise exception '现有保底不足，请选择自动扣减'; end if;
      v_current_delta := -p_amount;
    elsif p_target = 'base' then
      if p_amount > v_base then raise exception '基础保底不足'; end if;
      v_base_delta := -p_amount;
    else
      v_current_delta := -least(p_amount, v_current);
      v_base_delta := -(p_amount - least(p_amount, v_current));
      if p_amount > v_current + v_base then raise exception '现有保底和基础保底合计不足'; end if;
    end if;
  end if;
  insert into public.guarantee_requests(
    room_id, requester_player_id, requester_user_id, requester_nickname, operation, target, amount,
    current_guarantee_before, base_guarantee_before, current_guarantee_delta, base_guarantee_delta,
    current_guarantee_after, base_guarantee_after
  ) values (
    p_room_id, v_player.id, auth.uid(), v_player.nickname, p_operation, p_target, p_amount,
    v_current, v_base, v_current_delta, v_base_delta, v_current + v_current_delta, v_base + v_base_delta
  ) returning * into v_request;
  insert into public.game_events(room_id, message, event_type, metadata)
  values (p_room_id,
    v_player.nickname || ' 提交保底' || case when p_operation = 'add' then '增加' else '扣减' end || '申请 ' || p_amount || ' 万，等待老板确认',
    'system', jsonb_build_object('request_id', v_request.id, 'player_id', v_player.id, 'player_name', v_player.nickname,
      'operation', p_operation, 'target', p_target, 'amount', p_amount, 'current_before', v_current,
      'base_before', v_base, 'current_delta', v_current_delta, 'base_delta', v_base_delta,
      'current_after', v_current + v_current_delta, 'base_after', v_base + v_base_delta));
  return v_request;
end;
$$;

create or replace function public.approve_guarantee_request(p_request_id uuid)
returns public.guarantee_requests
language plpgsql security definer set search_path = public
as $$
declare
  v_request public.guarantee_requests%rowtype;
  v_room public.rooms%rowtype;
  v_boss public.room_players%rowtype;
  v_current bigint;
  v_base bigint;
  v_current_delta bigint;
  v_base_delta bigint;
begin
  select * into v_request from public.guarantee_requests where id = p_request_id for update;
  if not found or v_request.status <> 'pending' then raise exception '这条保底申请已处理'; end if;
  select * into v_room from public.rooms where id = v_request.room_id for update;
  if v_room.status = 'finished' then raise exception '本局已结束，不能确认申请'; end if;
  select * into v_boss from public.room_players where room_id = v_request.room_id and role = 'boss' for update;
  if not found or v_boss.user_id <> auth.uid() then raise exception '只有当前老板可以确认申请'; end if;
  v_current := greatest(0, v_boss.coins::bigint);
  v_base := greatest(0, coalesce(v_room.base_guarantee_balance, 0)::bigint);
  if v_request.operation = 'add' then
    v_current_delta := case when v_request.target = 'base' then 0 else v_request.amount end;
    v_base_delta := case when v_request.target = 'base' then v_request.amount else 0 end;
  elsif v_request.target = 'current' then
    if v_request.amount > v_current then raise exception '现有保底已变化且余额不足'; end if;
    v_current_delta := -v_request.amount; v_base_delta := 0;
  elsif v_request.target = 'base' then
    if v_request.amount > v_base then raise exception '基础保底已变化且余额不足'; end if;
    v_current_delta := 0; v_base_delta := -v_request.amount;
  else
    if v_request.amount > v_current + v_base then raise exception '现有保底和基础保底合计不足'; end if;
    v_current_delta := -least(v_request.amount, v_current);
    v_base_delta := -(v_request.amount - least(v_request.amount, v_current));
  end if;
  update public.room_players set coins = v_current + v_current_delta where id = v_boss.id;
  update public.rooms set base_guarantee_balance = v_base + v_base_delta where id = v_room.id;
  update public.guarantee_requests set status = 'approved', reviewer_user_id = auth.uid(), reviewed_at = now(),
    current_guarantee_before = v_current, base_guarantee_before = v_base,
    current_guarantee_delta = v_current_delta, base_guarantee_delta = v_base_delta,
    current_guarantee_after = v_current + v_current_delta, base_guarantee_after = v_base + v_base_delta
  where id = v_request.id returning * into v_request;
  insert into public.game_events(room_id, message, event_type, metadata)
  values (v_room.id, '老板同意 ' || v_request.requester_nickname || ' 的保底申请：现有保底 ' || v_current || ' → ' || (v_current + v_current_delta) || ' 万，基础保底 ' || v_base || ' → ' || (v_base + v_base_delta) || ' 万',
    'system', jsonb_build_object('request_id', v_request.id, 'operation', v_request.operation, 'target', v_request.target,
      'amount', v_request.amount, 'current_before', v_current, 'base_before', v_base, 'current_delta', v_current_delta,
      'base_delta', v_base_delta, 'current_after', v_current + v_current_delta, 'base_after', v_base + v_base_delta));
  return v_request;
end;
$$;

create or replace function public.reject_guarantee_request(p_request_id uuid, p_note text default null)
returns public.guarantee_requests
language plpgsql security definer set search_path = public
as $$
declare v_request public.guarantee_requests%rowtype; v_boss public.room_players%rowtype;
begin
  select * into v_request from public.guarantee_requests where id = p_request_id and status = 'pending' for update;
  if not found then raise exception '这条保底申请已处理'; end if;
  select * into v_boss from public.room_players where room_id = v_request.room_id and role = 'boss';
  if not found or v_boss.user_id <> auth.uid() then raise exception '只有当前老板可以拒绝申请'; end if;
  update public.guarantee_requests set status = 'rejected', reviewer_user_id = auth.uid(), reviewed_at = now(), review_note = nullif(trim(coalesce(p_note, '')), '') where id = v_request.id returning * into v_request;
  insert into public.game_events(room_id, message, event_type, metadata)
  values (v_request.room_id, '老板拒绝了 ' || v_request.requester_nickname || ' 的保底申请' || case when coalesce(trim(p_note), '') = '' then '' else '：' || trim(p_note) end,
    'system', jsonb_build_object('request_id', v_request.id, 'operation', v_request.operation, 'target', v_request.target, 'amount', v_request.amount));
  return v_request;
end;
$$;

create or replace function public.admin_set_boss_guarantees(p_room_id uuid, p_current bigint, p_base bigint)
returns void language plpgsql security definer set search_path = public as $$
declare v_boss public.room_players%rowtype; v_room public.rooms%rowtype;
begin
  if not public.is_admin() then raise exception '只有管理员可以调整老板保底'; end if;
  if p_current < 0 or p_base < 0 or p_current > 1000000000 or p_base > 1000000000 then raise exception '保底必须是 0 到 10 亿的整数'; end if;
  select * into v_room from public.rooms where id = p_room_id for update;
  if not found or v_room.status = 'finished' then raise exception '当前房间不能调整保底'; end if;
  select * into v_boss from public.room_players where room_id = p_room_id and role = 'boss' for update;
  if not found then raise exception '当前房间还没有老板'; end if;
  update public.room_players set coins = p_current where id = v_boss.id;
  update public.rooms set base_guarantee_balance = p_base where id = p_room_id;
  insert into public.game_events(room_id, message, event_type, metadata)
  values (p_room_id, '管理员调整老板双保底：现有保底 ' || v_boss.coins || ' → ' || p_current || ' 万，基础保底 ' || coalesce(v_room.base_guarantee_balance, 0) || ' → ' || p_base || ' 万', 'system',
    jsonb_build_object('operation', 'admin_set', 'current_before', v_boss.coins, 'base_before', coalesce(v_room.base_guarantee_balance, 0), 'current_after', p_current, 'base_after', p_base));
end;
$$;

revoke all on function public.create_guarantee_request(uuid, text, text, bigint) from public;
revoke all on function public.approve_guarantee_request(uuid) from public;
revoke all on function public.reject_guarantee_request(uuid, text) from public;
revoke all on function public.admin_set_boss_guarantees(uuid, bigint, bigint) from public;
grant execute on function public.create_guarantee_request(uuid, text, text, bigint) to authenticated;
grant execute on function public.approve_guarantee_request(uuid) to authenticated;
grant execute on function public.reject_guarantee_request(uuid, text) to authenticated;
grant execute on function public.admin_set_boss_guarantees(uuid, bigint, bigint) to authenticated;
do $$ begin
  begin alter publication supabase_realtime add table public.guarantee_requests; exception when duplicate_object then null; end;
end $$;

-- Advanced graph board: free tile placement, directed routes, and player route choice.
alter table public.room_tiles add column if not exists grid_x integer;
alter table public.room_tiles add column if not exists grid_y integer;
alter table public.room_tiles add column if not exists layout_x numeric;
alter table public.room_tiles add column if not exists layout_y numeric;
alter table public.room_tiles drop constraint if exists room_tiles_grid_x_check;
alter table public.room_tiles add constraint room_tiles_grid_x_check check (grid_x is null or grid_x between 0 and 200);
alter table public.room_tiles drop constraint if exists room_tiles_grid_y_check;
alter table public.room_tiles add constraint room_tiles_grid_y_check check (grid_y is null or grid_y between 0 and 200);

alter table public.rooms add column if not exists pending_dice integer;
alter table public.rooms add column if not exists pending_player_id uuid;
alter table public.rooms add column if not exists pending_route_options jsonb not null default '[]'::jsonb;

create table if not exists public.room_tile_edges (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  round_number integer not null check (round_number between 1 and 10),
  from_tile_id uuid not null references public.room_tiles(id) on delete cascade,
  to_tile_id uuid not null references public.room_tiles(id) on delete cascade,
  is_bidirectional boolean not null default false,
  created_at timestamptz not null default now(),
  check (from_tile_id <> to_tile_id),
  unique (from_tile_id, to_tile_id)
);

create index if not exists room_tile_edges_room_round_idx on public.room_tile_edges(room_id, round_number);
create index if not exists room_tile_edges_from_idx on public.room_tile_edges(from_tile_id);
create index if not exists room_tile_edges_to_idx on public.room_tile_edges(to_tile_id);

alter table public.room_tile_edges enable row level security;
drop policy if exists "room members can read tile edges" on public.room_tile_edges;
create policy "room members can read tile edges" on public.room_tile_edges for select to authenticated
  using (public.is_room_member(room_id));
drop policy if exists "admins can read tile edges" on public.room_tile_edges;
create policy "admins can read tile edges" on public.room_tile_edges for select to authenticated
  using (public.is_admin());

create or replace function public.ensure_room_edges_internal(p_room_id uuid, p_round integer)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if exists (select 1 from public.room_tile_edges where room_id = p_room_id and round_number = p_round) then return; end if;
  insert into public.room_tile_edges(room_id, round_number, from_tile_id, to_tile_id, is_bidirectional)
  select p_room_id, p_round, current_tile.id, next_tile.id, false
  from public.room_tiles current_tile
  join public.room_tiles next_tile on next_tile.room_id = current_tile.room_id
    and next_tile.round_number = current_tile.round_number
    and next_tile.position = mod(current_tile.position + 1, (
      select count(*) from public.room_tiles size_tiles
      where size_tiles.room_id = p_room_id and size_tiles.round_number = p_round
    ))
  where current_tile.room_id = p_room_id and current_tile.round_number = p_round
  on conflict (from_tile_id, to_tile_id) do nothing;
end;
$$;

do $$
declare v_board record;
begin
  for v_board in select distinct room_id, round_number from public.room_tiles loop
    perform public.ensure_room_edges_internal(v_board.room_id, v_board.round_number);
  end loop;
end $$;

create or replace function public.admin_update_tile_layout(p_tile_id uuid, p_grid_x integer, p_grid_y integer)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_tile public.room_tiles%rowtype;
begin
  if not public.is_admin() then raise exception '只有管理员可以移动格子'; end if;
  if p_grid_x not between 0 and 200 or p_grid_y not between 0 and 200 then raise exception '格子坐标必须在 0 到 200 之间'; end if;
  select rt.* into v_tile from public.room_tiles rt join public.rooms r on r.id = rt.room_id
  where rt.id = p_tile_id and r.status = 'lobby' for update of rt;
  if not found then raise exception '格子不存在，或房间已经开始'; end if;
  if exists (select 1 from public.room_tiles where room_id = v_tile.room_id and round_number = v_tile.round_number
    and id <> p_tile_id and grid_x = p_grid_x and grid_y = p_grid_y) then raise exception '该位置已经有格子'; end if;
  update public.room_tiles set grid_x = p_grid_x, grid_y = p_grid_y where id = p_tile_id;
end;
$$;

create or replace function public.admin_add_room_tiles(p_room_id uuid, p_round integer)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_room public.rooms%rowtype;
  v_size integer;
  v_start uuid;
  v_previous uuid;
  v_first uuid;
  v_second uuid;
begin
  if not public.is_admin() then raise exception '只有管理员可以添加格子'; end if;
  select * into v_room from public.rooms where id = p_room_id and status = 'lobby' for update;
  if not found then raise exception '只能在开局前添加格子'; end if;
  if p_round not between 1 and v_room.total_rounds then raise exception '轮次无效'; end if;
  v_size := (v_room.round_board_sizes ->> (p_round - 1))::integer;
  if v_size > 98 then raise exception '每轮最多 100 格'; end if;
  perform public.ensure_room_edges_internal(p_room_id, p_round);
  select id into v_start from public.room_tiles where room_id = p_room_id and round_number = p_round and position = 0;
  select id into v_previous from public.room_tiles where room_id = p_room_id and round_number = p_round and position = v_size - 1;
  insert into public.room_tiles(room_id, round_number, position, name, short_name, tile_type, detail, effect_type, effect_value, is_randomized)
  values (p_room_id, p_round, v_size, '空格', '空格', 'empty', '平安经过，本格不触发额外效果', 'none', 0, true)
  returning id into v_first;
  insert into public.room_tiles(room_id, round_number, position, name, short_name, tile_type, detail, effect_type, effect_value, is_randomized)
  values (p_room_id, p_round, v_size + 1, '空格', '空格', 'empty', '平安经过，本格不触发额外效果', 'none', 0, true)
  returning id into v_second;
  delete from public.room_tile_edges where from_tile_id = v_previous and to_tile_id = v_start and not is_bidirectional;
  insert into public.room_tile_edges(room_id, round_number, from_tile_id, to_tile_id)
  values (p_room_id, p_round, v_previous, v_first), (p_room_id, p_round, v_first, v_second), (p_room_id, p_round, v_second, v_start)
  on conflict (from_tile_id, to_tile_id) do nothing;
  update public.rooms set
    round_board_sizes = jsonb_set(round_board_sizes, array[(p_round - 1)::text], to_jsonb(v_size + 2)),
    round1_board_size = case when p_round = 1 then v_size + 2 else round1_board_size end,
    round2_board_size = case when p_round = 2 then v_size + 2 else round2_board_size end,
    round3_board_size = case when p_round = 3 then v_size + 2 else round3_board_size end,
    board_size = case when p_round = 1 then v_size + 2 else board_size end
  where id = p_room_id;
  insert into public.game_events(room_id, message) values (p_room_id, '管理员在第' || p_round || '轮添加了 2 个格子');
end;
$$;

create or replace function public.admin_delete_room_tile_pair(p_tile_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_tile public.room_tiles%rowtype;
  v_room public.rooms%rowtype;
  v_size integer;
  v_partner uuid;
  v_item record;
  v_position integer := 0;
begin
  if not public.is_admin() then raise exception '只有管理员可以删除格子'; end if;
  select rt.* into v_tile from public.room_tiles rt join public.rooms r on r.id = rt.room_id
  where rt.id = p_tile_id and r.status = 'lobby' for update of rt;
  if not found then raise exception '格子不存在，或房间已经开始'; end if;
  if v_tile.position = 0 then raise exception '起点格不能删除'; end if;
  select * into v_room from public.rooms where id = v_tile.room_id for update;
  v_size := (v_room.round_board_sizes ->> (v_tile.round_number - 1))::integer;
  if v_size <= 2 then raise exception '每轮至少保留 2 格'; end if;
  select id into v_partner from public.room_tiles where room_id = v_tile.room_id and round_number = v_tile.round_number
    and position > 0 and id <> p_tile_id order by position desc limit 1;
  delete from public.room_tiles where id in (p_tile_id, v_partner);
  update public.room_tiles set position = position + 1000
  where room_id = v_tile.room_id and round_number = v_tile.round_number;
  for v_item in select id from public.room_tiles where room_id = v_tile.room_id and round_number = v_tile.round_number order by position loop
    update public.room_tiles set position = v_position where id = v_item.id;
    v_position := v_position + 1;
  end loop;
  update public.rooms set
    round_board_sizes = jsonb_set(round_board_sizes, array[(v_tile.round_number - 1)::text], to_jsonb(v_size - 2)),
    round1_board_size = case when v_tile.round_number = 1 then v_size - 2 else round1_board_size end,
    round2_board_size = case when v_tile.round_number = 2 then v_size - 2 else round2_board_size end,
    round3_board_size = case when v_tile.round_number = 3 then v_size - 2 else round3_board_size end,
    board_size = case when v_tile.round_number = 1 then v_size - 2 else board_size end
  where id = v_tile.room_id;
  insert into public.game_events(room_id, message) values (v_tile.room_id, '管理员在第' || v_tile.round_number || '轮删除了 2 个格子');
end;
$$;

create or replace function public.admin_upsert_tile_edge(p_from_tile_id uuid, p_to_tile_id uuid, p_is_bidirectional boolean)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_from public.room_tiles%rowtype; v_to public.room_tiles%rowtype;
begin
  if not public.is_admin() then raise exception '只有管理员可以编辑路线'; end if;
  select * into v_from from public.room_tiles where id = p_from_tile_id;
  select * into v_to from public.room_tiles where id = p_to_tile_id;
  if v_from.id is null or v_to.id is null or v_from.room_id <> v_to.room_id or v_from.round_number <> v_to.round_number or v_from.id = v_to.id then
    raise exception '路线两端必须是同一轮的两个不同格子';
  end if;
  if not exists (select 1 from public.rooms where id = v_from.room_id and status = 'lobby') then raise exception '只能在开局前编辑路线'; end if;
  if not exists (select 1 from public.room_tile_edges where from_tile_id = p_from_tile_id and to_tile_id = p_to_tile_id)
    and (select count(*) from public.room_tile_edges where from_tile_id = p_from_tile_id or (is_bidirectional and to_tile_id = p_from_tile_id)) >= 4
  then raise exception '每个格子最多设置 4 个出口'; end if;
  if p_is_bidirectional and not exists (select 1 from public.room_tile_edges where from_tile_id = p_from_tile_id and to_tile_id = p_to_tile_id and is_bidirectional)
    and (select count(*) from public.room_tile_edges where from_tile_id = p_to_tile_id or (is_bidirectional and to_tile_id = p_to_tile_id)) >= 4
  then raise exception '双向路线的终点已有 4 个出口'; end if;
  if p_is_bidirectional then delete from public.room_tile_edges where from_tile_id = p_to_tile_id and to_tile_id = p_from_tile_id; end if;
  insert into public.room_tile_edges(room_id, round_number, from_tile_id, to_tile_id, is_bidirectional)
  values (v_from.room_id, v_from.round_number, p_from_tile_id, p_to_tile_id, p_is_bidirectional)
  on conflict (from_tile_id, to_tile_id) do update set is_bidirectional = excluded.is_bidirectional;
end;
$$;

create or replace function public.admin_delete_tile_edge(p_edge_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception '只有管理员可以删除路线'; end if;
  delete from public.room_tile_edges edge using public.rooms room
  where edge.id = p_edge_id and room.id = edge.room_id and room.status = 'lobby';
  if not found then raise exception '路线不存在，或房间已经开始'; end if;
end;
$$;

create or replace function public.get_room_route_options_internal(p_room_id uuid, p_round integer, p_start_tile_id uuid, p_steps integer)
returns jsonb
language sql security definer set search_path = public
as $$
  with recursive adjacency(from_id, to_id) as (
    select from_tile_id, to_tile_id from public.room_tile_edges where room_id = p_room_id and round_number = p_round
    union
    select to_tile_id, from_tile_id from public.room_tile_edges where room_id = p_room_id and round_number = p_round and is_bidirectional
  ), walk(step, tile_id, path) as (
    select 0, p_start_tile_id, array[p_start_tile_id]::uuid[]
    union all
    select walk.step + 1, next_edge.to_id, walk.path || next_edge.to_id
    from walk cross join lateral (
      select adjacency.to_id from adjacency where adjacency.from_id = walk.tile_id order by adjacency.to_id limit 4
    ) next_edge
    where walk.step < p_steps
  ), options as (
    select walk.tile_id, tile.position, walk.path
    from walk join public.room_tiles tile on tile.id = walk.tile_id
    where walk.step = p_steps
    order by tile.position, walk.path::text
    limit 64
  )
  select coalesce(jsonb_agg(jsonb_build_object('tile_id', tile_id, 'position', position, 'path', to_jsonb(path))), '[]'::jsonb) from options;
$$;

create or replace function public.resolve_room_landing_internal(p_room_id uuid, p_player_id uuid, p_dice integer, p_tile_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_room public.rooms%rowtype;
  v_player public.room_players%rowtype;
  v_tile public.room_tiles%rowtype;
  v_position integer;
  v_distance integer;
  v_remaining integer;
  v_skip integer;
  v_modifier integer;
  v_change integer := 0;
  v_advanced boolean := false;
  v_finished boolean := false;
  v_next_round integer;
  v_next_size integer;
  v_guarantee_before integer;
  v_guarantee integer;
begin
  select * into v_room from public.rooms where id = p_room_id for update;
  select * into v_player from public.room_players where id = p_player_id and room_id = p_room_id for update;
  select * into v_tile from public.room_tiles where id = p_tile_id and room_id = p_room_id and round_number = v_room.current_round;
  if v_player.id is null or v_tile.id is null then raise exception '路线终点无效'; end if;
  v_position := v_tile.position;
  v_distance := v_player.distance + p_dice;
  v_remaining := v_player.dice_count;
  v_skip := v_player.skip_turns;
  v_modifier := v_player.next_roll_modifier;
  case v_tile.effect_type
    when 'move' then
      v_position := mod(mod(v_position + v_tile.effect_value::integer, v_room.board_size) + v_room.board_size, v_room.board_size);
      v_distance := greatest(0, v_distance + v_tile.effect_value::integer);
    when 'skip' then v_skip := least(3, v_skip + v_tile.effect_value::integer);
    when 'extra_roll' then v_remaining := least(20, v_remaining + v_tile.effect_value::integer);
    when 'lose_roll' then v_modifier := greatest(-4, v_modifier - v_tile.effect_value::integer);
    when 'advance_chance' then v_advanced := v_room.current_round < v_room.total_rounds and v_player.role = 'boss' and v_player.round_roll_count > 2;
    when 'advance_round' then v_advanced := v_room.current_round < v_room.total_rounds and v_player.role = 'boss' and v_player.round_roll_count > 2;
    when 'finish' then v_finished := v_room.current_round = v_room.total_rounds;
    else null;
  end case;
  update public.room_players set position = v_position, distance = v_distance, skip_turns = v_skip,
    next_roll_modifier = v_modifier, dice_count = v_remaining where id = v_player.id;
  insert into public.game_events(room_id, message, event_type, metadata) values (
    p_room_id, v_player.nickname || ' 掷出 ' || p_dice || '，沿所选路线落到「' || v_tile.name || '」：' || v_tile.detail,
    'roll', jsonb_build_object('player_id', v_player.id, 'player_name', v_player.nickname, 'role', v_player.role,
      'round', v_room.current_round, 'dice', p_dice, 'landed_position', v_tile.position, 'tile_name', v_tile.name,
      'tile_detail', v_tile.detail, 'tile_type', v_tile.tile_type, 'effect_type', v_tile.effect_type, 'effect_value', v_tile.effect_value)
  );
  if v_tile.effect_type in ('guarantee_add','guarantee_subtract','guarantee_multiply','guarantee_divide') then
    select coins into v_guarantee_before from public.room_players where room_id = p_room_id and role = 'boss' for update;
    if not found then raise exception '当前房间没有老板，无法结算保底'; end if;
    v_guarantee := case v_tile.effect_type
      when 'guarantee_add' then least(1000000::numeric, v_guarantee_before::numeric + v_tile.effect_value)::integer
      when 'guarantee_subtract' then greatest(0, v_guarantee_before - v_tile.effect_value)::integer
      when 'guarantee_multiply' then round(least(1000000::numeric, v_guarantee_before::numeric * v_tile.effect_value))::integer
      when 'guarantee_divide' then case when v_tile.effect_value = 0 then 0 else round(v_guarantee_before::numeric / v_tile.effect_value)::integer end
    end;
    v_change := v_guarantee - v_guarantee_before;
    update public.room_players set coins = v_guarantee where room_id = p_room_id and role = 'boss';
    insert into public.game_events(room_id, message) values (p_room_id, '老板保底变化：' || v_guarantee_before || ' 万 → ' || v_guarantee || ' 万');
  end if;
  if v_tile.effect_type = 'move' then
    insert into public.game_events(room_id, message) values (p_room_id, v_player.nickname || case when v_tile.effect_value > 0 then ' 前进 ' else ' 后退 ' end || abs(v_tile.effect_value) || ' 格，到达第 ' || (v_position + 1) || ' 格');
  end if;
  if v_finished then
    if not exists (select 1 from public.room_players where room_id = p_room_id and dice_count > 0) then perform public.create_zero_dice_rule_internal(p_room_id); end if;
    update public.rooms set status = 'finished', is_paused = false, winner_id = v_player.user_id, current_turn = null,
      rolls_remaining = 0, pending_dice = null, pending_player_id = null, pending_route_options = '[]'::jsonb where id = p_room_id;
    insert into public.game_events(room_id, message) values (p_room_id, v_player.nickname || ' 完成最终结算，本局结束');
  else
    if v_advanced then
      v_next_round := v_room.current_round + 1;
      v_next_size := (v_room.round_board_sizes ->> (v_next_round - 1))::integer;
      update public.rooms set current_round = v_next_round, board_size = v_next_size where id = p_room_id;
      update public.room_players set position = 0, round_roll_count = 0 where room_id = p_room_id;
      insert into public.game_events(room_id, message) values (p_room_id, '队伍进入第 ' || v_next_round || ' 轮 ' || v_next_size || ' 格棋盘');
    end if;
    perform public.advance_room_turn_internal(p_room_id, v_player.turn_order);
  end if;
end;
$$;

drop function if exists public.roll_dice(uuid);
create function public.roll_dice(p_room_id uuid)
returns table(dice_value integer, landed_position integer, coin_change integer, winner boolean)
language plpgsql security definer set search_path = public
as $$
declare
  v_room public.rooms%rowtype;
  v_player public.room_players%rowtype;
  v_start_tile uuid;
  v_dice integer;
  v_options jsonb;
  v_option jsonb;
  v_landed uuid;
  v_remaining integer;
  v_chance integer;
  v_should_advance boolean := false;
  v_candidate integer;
  v_candidate_options jsonb;
  v_candidate_dice integer[] := array[]::integer[];
begin
  select * into v_room from public.rooms where id = p_room_id for update;
  if not found or v_room.status <> 'playing' then raise exception '当前没有进行中的行动'; end if;
  if v_room.is_paused then raise exception '本局已被管理员暂停，暂时不能掷骰'; end if;
  if v_room.pending_player_id is not null then raise exception '请先完成当前路线选择'; end if;
  if v_room.current_turn <> auth.uid() then raise exception '还没有轮到你'; end if;
  select * into v_player from public.room_players where room_id = p_room_id and user_id = auth.uid() for update;
  if not found or v_player.dice_count <= 0 then raise exception '当前没有可用骰子'; end if;
  perform public.ensure_room_edges_internal(p_room_id, v_room.current_round);
  select id into v_start_tile from public.room_tiles where room_id = p_room_id and round_number = v_room.current_round and position = v_player.position;
  if v_room.current_round < v_room.total_rounds then
    v_chance := (v_room.round_advance_chances ->> (v_room.current_round - 1))::integer;
    v_should_advance := v_player.role = 'boss' and v_player.round_roll_count >= 2
      and floor(random() * 100)::integer < v_chance;
    for v_candidate in 1..6 loop
      v_candidate_options := public.get_room_route_options_internal(p_room_id, v_room.current_round, v_start_tile, v_candidate);
      if exists (
        select 1 from jsonb_array_elements(v_candidate_options) option(value)
        join public.room_tiles tile on tile.id = (option.value ->> 'tile_id')::uuid
        where (tile.effect_type in ('advance_chance', 'advance_round')) = v_should_advance
      ) then v_candidate_dice := array_append(v_candidate_dice, v_candidate); end if;
    end loop;
  end if;
  if coalesce(array_length(v_candidate_dice, 1), 0) > 0 then
    v_dice := v_candidate_dice[1 + floor(random() * array_length(v_candidate_dice, 1))::integer];
  else
    v_dice := floor(random() * 6 + 1)::integer;
  end if;
  v_options := public.get_room_route_options_internal(p_room_id, v_room.current_round, v_start_tile, v_dice);
  if v_room.current_round < v_room.total_rounds then
    select coalesce(jsonb_agg(option.value), '[]'::jsonb) into v_candidate_options
    from jsonb_array_elements(v_options) option(value)
    join public.room_tiles tile on tile.id = (option.value ->> 'tile_id')::uuid
    where (tile.effect_type in ('advance_chance', 'advance_round')) = v_should_advance;
    if jsonb_array_length(v_candidate_options) > 0 then v_options := v_candidate_options; end if;
  end if;
  if jsonb_array_length(v_options) = 0 then raise exception '当前格子在 % 步内没有完整路线，请管理员检查箭头连接', v_dice; end if;
  v_remaining := greatest(0, v_player.dice_count - 1);
  update public.room_players set dice_count = v_remaining, round_roll_count = round_roll_count + 1 where id = v_player.id;
  if jsonb_array_length(v_options) > 1 then
    update public.rooms set pending_dice = v_dice, pending_player_id = v_player.user_id,
      pending_route_options = v_options, rolls_remaining = v_remaining where id = p_room_id;
    insert into public.game_events(room_id, message) values (p_room_id, v_player.nickname || ' 掷出 ' || v_dice || '，遇到分叉路线，等待选择走向');
    return query select v_dice, -1, 0, false;
    return;
  end if;
  v_option := v_options -> 0;
  v_landed := (v_option ->> 'tile_id')::uuid;
  perform public.resolve_room_landing_internal(p_room_id, v_player.id, v_dice, v_landed);
  return query select v_dice, (v_option ->> 'position')::integer, 0, false;
end;
$$;

create or replace function public.choose_route(p_room_id uuid, p_path jsonb)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_room public.rooms%rowtype; v_player public.room_players%rowtype; v_option jsonb; v_landed uuid; v_dice integer;
begin
  select * into v_room from public.rooms where id = p_room_id for update;
  if not found or v_room.status <> 'playing' or v_room.pending_player_id is null then raise exception '当前没有待选择的路线'; end if;
  if v_room.pending_player_id <> auth.uid() or v_room.current_turn <> auth.uid() then raise exception '这不是你的路线选择'; end if;
  select value into v_option from jsonb_array_elements(v_room.pending_route_options) option(value) where value -> 'path' = p_path limit 1;
  if v_option is null then raise exception '所选路线已失效，请刷新后重试'; end if;
  select * into v_player from public.room_players where room_id = p_room_id and user_id = auth.uid() for update;
  v_landed := (v_option ->> 'tile_id')::uuid;
  v_dice := v_room.pending_dice;
  update public.rooms set pending_dice = null, pending_player_id = null, pending_route_options = '[]'::jsonb where id = p_room_id;
  perform public.resolve_room_landing_internal(p_room_id, v_player.id, v_dice, v_landed);
end;
$$;

create or replace function public.validate_graph_before_start()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare v_round integer; v_tile record;
begin
  if old.status = 'lobby' and new.status = 'playing' then
    for v_round in 1..new.total_rounds loop
      perform public.ensure_room_edges_internal(new.id, v_round);
      for v_tile in select id, position from public.room_tiles where room_id = new.id and round_number = v_round loop
        if not exists (
          select 1 from public.room_tile_edges edge where edge.room_id = new.id and edge.round_number = v_round
            and (edge.from_tile_id = v_tile.id or (edge.is_bidirectional and edge.to_tile_id = v_tile.id))
        ) then raise exception '第 % 轮第 % 格没有出口路线', v_round, v_tile.position + 1; end if;
      end loop;
    end loop;
    new.pending_dice := null; new.pending_player_id := null; new.pending_route_options := '[]'::jsonb;
  end if;
  return new;
end;
$$;

drop trigger if exists validate_graph_before_start_trigger on public.rooms;
create trigger validate_graph_before_start_trigger before update of status on public.rooms
for each row execute function public.validate_graph_before_start();

revoke all on function public.ensure_room_edges_internal(uuid, integer) from public;
revoke all on function public.get_room_route_options_internal(uuid, integer, uuid, integer) from public;
revoke all on function public.resolve_room_landing_internal(uuid, uuid, integer, uuid) from public;
revoke all on function public.admin_update_tile_layout(uuid, integer, integer) from public;
revoke all on function public.admin_add_room_tiles(uuid, integer) from public;
revoke all on function public.admin_delete_room_tile_pair(uuid) from public;
revoke all on function public.admin_upsert_tile_edge(uuid, uuid, boolean) from public;
revoke all on function public.admin_delete_tile_edge(uuid) from public;
revoke all on function public.roll_dice(uuid) from public;
revoke all on function public.choose_route(uuid, jsonb) from public;
grant execute on function public.admin_update_tile_layout(uuid, integer, integer) to authenticated;
grant execute on function public.admin_add_room_tiles(uuid, integer) to authenticated;
grant execute on function public.admin_delete_room_tile_pair(uuid) to authenticated;
grant execute on function public.admin_upsert_tile_edge(uuid, uuid, boolean) to authenticated;
grant execute on function public.admin_delete_tile_edge(uuid) to authenticated;
grant execute on function public.roll_dice(uuid) to authenticated;
grant execute on function public.choose_route(uuid, jsonb) to authenticated;

do $$
begin
  begin
    alter publication supabase_realtime add table public.room_tile_edges;
  exception when duplicate_object then null;
  end;
end $$;

select pg_notify('pgrst', 'reload schema');

-- 2026-10: scale configurable boards to 10 rounds and 100 cells.
alter table public.rooms add column if not exists total_rounds integer not null default 3;
alter table public.rooms add column if not exists round1_board_size integer not null default 8;
alter table public.rooms add column if not exists round2_board_size integer not null default 12;
alter table public.rooms add column if not exists round3_board_size integer not null default 24;
alter table public.rooms add column if not exists imported_config boolean not null default false;
alter table public.room_tiles add column if not exists tile_color text;
alter table public.room_tiles add column if not exists is_randomized boolean not null default true;
alter table public.rooms add column if not exists round_board_sizes jsonb;
alter table public.rooms add column if not exists round_advance_chances jsonb;

update public.rooms set round_board_sizes = jsonb_build_array(
  least(100, greatest(2, round1_board_size) + mod(greatest(2, round1_board_size), 2)),
  least(100, greatest(2, round2_board_size) + mod(greatest(2, round2_board_size), 2)),
  least(100, greatest(2, round3_board_size) + mod(greatest(2, round3_board_size), 2)),
  24, 24, 24, 24, 24, 24, 24
) where round_board_sizes is null or jsonb_typeof(round_board_sizes) <> 'array' or jsonb_array_length(round_board_sizes) <> 10;
update public.rooms set round_advance_chances = jsonb_build_array(
  round1_advance_chance, round2_advance_chance, 30, 30, 30, 30, 30, 30, 30
) where round_advance_chances is null or jsonb_typeof(round_advance_chances) <> 'array' or jsonb_array_length(round_advance_chances) <> 9;

alter table public.rooms alter column round_board_sizes set default '[8,12,24,24,24,24,24,24,24,24]'::jsonb;
alter table public.rooms alter column round_board_sizes set not null;
alter table public.rooms alter column round_advance_chances set default '[35,30,30,30,30,30,30,30,30]'::jsonb;
alter table public.rooms alter column round_advance_chances set not null;

update public.rooms set
  round1_board_size = (round_board_sizes ->> 0)::integer,
  round2_board_size = (round_board_sizes ->> 1)::integer,
  round3_board_size = (round_board_sizes ->> 2)::integer,
  round1_advance_chance = (round_advance_chances ->> 0)::integer,
  round2_advance_chance = (round_advance_chances ->> 1)::integer;

alter table public.rooms drop constraint if exists rooms_total_rounds_check;
alter table public.rooms add constraint rooms_total_rounds_check check (total_rounds between 1 and 10);
alter table public.rooms drop constraint if exists rooms_current_round_check;
alter table public.rooms add constraint rooms_current_round_check check (current_round between 1 and 10);
alter table public.rooms drop constraint if exists rooms_round1_board_size_check;
alter table public.rooms add constraint rooms_round1_board_size_check check (round1_board_size between 2 and 100 and mod(round1_board_size, 2) = 0);
alter table public.rooms drop constraint if exists rooms_round2_board_size_check;
alter table public.rooms add constraint rooms_round2_board_size_check check (round2_board_size between 2 and 100 and mod(round2_board_size, 2) = 0);
alter table public.rooms drop constraint if exists rooms_round3_board_size_check;
alter table public.rooms add constraint rooms_round3_board_size_check check (round3_board_size between 2 and 100 and mod(round3_board_size, 2) = 0);
alter table public.rooms drop constraint if exists rooms_round_board_sizes_check;
alter table public.rooms add constraint rooms_round_board_sizes_check
  check (jsonb_typeof(round_board_sizes) = 'array' and jsonb_array_length(round_board_sizes) = 10);
alter table public.rooms drop constraint if exists rooms_round_advance_chances_check;
alter table public.rooms add constraint rooms_round_advance_chances_check
  check (jsonb_typeof(round_advance_chances) = 'array' and jsonb_array_length(round_advance_chances) = 9);

alter table public.room_tiles drop constraint if exists room_tiles_round_number_check;
alter table public.room_tiles add constraint room_tiles_round_number_check check (round_number between 1 and 10);
alter table public.room_tiles drop constraint if exists room_tiles_position_check;
alter table public.room_tiles add constraint room_tiles_position_check check (position between 0 and 99);

create or replace function public.generate_room_round_internal(
  p_room_id uuid, p_round integer, p_board_size integer, p_is_final boolean
)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if p_round not between 1 and 10 then raise exception '轮次必须在 1 到 10 之间'; end if;
  if p_board_size not between 2 and 100 or mod(p_board_size, 2) <> 0 then
    raise exception '每轮格子数必须是 2 到 100 之间的偶数';
  end if;

  delete from public.room_tiles where room_id = p_room_id and round_number = p_round;
  insert into public.room_tiles(
    room_id, template_id, round_number, position, name, short_name,
    tile_type, detail, effect_type, effect_value, tile_color, is_randomized
  ) values (
    p_room_id, null, p_round, 0, '起点', '起点', 'start',
    '本轮行动从这里开始', 'none', 0, null, false
  );

  with positions as (
    select position,
      case
        when p_is_final and position = p_board_size - 1 then 'finish'
        when not p_is_final and position = 1 then 'advance_chance'
        when not p_is_final and p_board_size > 2 and position = p_board_size / 2 then 'advance'
        when p_board_size > 2 and position = 2 then 'empty'
        else (array['empty','contract','contract','movement','movement','turn','dice'])[1 + floor(random() * 7)::integer]
      end as rule_group
    from generate_series(1, p_board_size - 1) as generated(position)
  ), choices as (
    select positions.position, template.*
    from positions
    cross join lateral (
      select source.* from public.tile_rule_templates source
      where source.round_number = case
          when positions.rule_group = 'finish' then 3
          when positions.rule_group in ('advance_chance', 'advance') then least(p_round, 2)
          else least(p_round, 3)
        end
        and source.rule_group = positions.rule_group
        and source.enabled
      order by random()
      limit 1
    ) template
  )
  insert into public.room_tiles(
    room_id, template_id, round_number, position, name, short_name,
    tile_type, detail, effect_type, effect_value, tile_color, is_randomized
  )
  select p_room_id, id, p_round, position, name, short_name,
    tile_type, detail, effect_type, effect_value, null, true
  from choices;

  if (select count(*) from public.room_tiles where room_id = p_room_id and round_number = p_round) <> p_board_size then
    raise exception '第 % 轮规则池不完整，无法生成棋盘', p_round;
  end if;
end;
$$;

create or replace function public.generate_room_board_internal(p_room_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_room public.rooms%rowtype;
  v_round integer;
  v_size integer;
begin
  select * into v_room from public.rooms where id = p_room_id;
  if not found then raise exception '房间不存在'; end if;
  delete from public.room_tiles where room_id = p_room_id;
  for v_round in 1..v_room.total_rounds loop
    v_size := (v_room.round_board_sizes ->> (v_round - 1))::integer;
    perform public.generate_room_round_internal(p_room_id, v_round, v_size, v_round = v_room.total_rounds);
  end loop;
end;
$$;

create or replace function public.admin_randomize_room_board(p_room_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_room public.rooms%rowtype;
begin
  if not public.is_admin() then raise exception '只有管理员可以重新生成棋盘'; end if;
  select * into v_room from public.rooms where id = p_room_id and status = 'lobby' for update;
  if not found then raise exception '只能在开局前重新生成棋盘'; end if;

  with targets as (
    select rt.id,
      case
        when rt.effect_type = 'finish' then 'finish'
        when rt.effect_type = 'advance_chance' then 'advance_chance'
        when rt.effect_type = 'advance_round' then 'advance'
        else (array['empty','contract','contract','movement','movement','turn','dice'])[1 + floor(random() * 7)::integer]
      end as rule_group,
      case
        when rt.effect_type = 'finish' then 3
        when rt.effect_type in ('advance_chance', 'advance_round') then least(rt.round_number, 2)
        else least(rt.round_number, 3)
      end as source_round
    from public.room_tiles rt
    where rt.room_id = p_room_id and rt.tile_type <> 'start'
      and (not v_room.imported_config or rt.is_randomized)
  ), replacements as (
    select targets.id as tile_id, template.*
    from targets
    cross join lateral (
      select source.* from public.tile_rule_templates source
      where source.round_number = targets.source_round
        and source.rule_group = targets.rule_group
        and source.enabled
      order by random()
      limit 1
    ) template
  )
  update public.room_tiles tile set
    template_id = replacement.id,
    name = replacement.name,
    short_name = replacement.short_name,
    tile_type = replacement.tile_type,
    detail = replacement.detail,
    effect_type = replacement.effect_type,
    effect_value = replacement.effect_value
  from replacements replacement
  where tile.id = replacement.tile_id;

  insert into public.game_events(room_id, message) values (
    p_room_id,
    case when v_room.imported_config
      then '管理员重新随机了导入设置中允许随机的格子'
      else '管理员重新随机生成了全部棋盘格'
    end
  );
end;
$$;

create or replace function public.admin_update_board_structure(
  p_room_id uuid, p_total_rounds integer, p_round_sizes jsonb
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_room public.rooms%rowtype;
  v_sizes integer[];
  v_round integer;
  v_old_size integer;
begin
  if not public.is_admin() then raise exception '只有管理员可以修改棋盘结构'; end if;
  select * into v_room from public.rooms where id = p_room_id and status = 'lobby' for update;
  if not found then raise exception '只能在开局前修改棋盘结构'; end if;
  if p_total_rounds not between 1 and 10 then raise exception '轮数必须在 1 到 10 之间'; end if;
  if jsonb_typeof(p_round_sizes) <> 'array' or jsonb_array_length(p_round_sizes) <> 10 then
    raise exception '需要提供十轮的格子数';
  end if;
  select array_agg(value::integer order by ordinal) into v_sizes
  from jsonb_array_elements_text(p_round_sizes) with ordinality as sizes(value, ordinal);
  if exists (
    select 1 from unnest(v_sizes[1:p_total_rounds]) as sizes(value)
    where value not between 2 and 100 or mod(value, 2) <> 0
  ) then raise exception '每轮格子数必须是 2 到 100 之间的偶数'; end if;

  update public.rooms set
    total_rounds = p_total_rounds,
    round_board_sizes = p_round_sizes,
    round1_board_size = v_sizes[1], round2_board_size = v_sizes[2], round3_board_size = v_sizes[3],
    board_size = v_sizes[1],
    imported_config = case when total_rounds <> p_total_rounds then false else imported_config end
  where id = p_room_id;

  if v_room.total_rounds <> p_total_rounds then
    perform public.generate_room_board_internal(p_room_id);
  else
    delete from public.room_tiles where room_id = p_room_id and round_number > p_total_rounds;
    for v_round in 1..p_total_rounds loop
      v_old_size := (v_room.round_board_sizes ->> (v_round - 1))::integer;
      if v_old_size <> v_sizes[v_round] then
        perform public.generate_room_round_internal(p_room_id, v_round, v_sizes[v_round], v_round = p_total_rounds);
      end if;
    end loop;
  end if;
  insert into public.game_events(room_id, message)
  values (p_room_id, '管理员将棋盘设为 ' || p_total_rounds || ' 轮，各轮格子数为 ' || array_to_string(v_sizes[1:p_total_rounds], '/'));
end;
$$;

create or replace function public.admin_update_round_chances_v2(p_room_id uuid, p_round_chances jsonb)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_chances integer[];
begin
  if not public.is_admin() then raise exception '只有管理员可以修改晋级概率'; end if;
  if not exists (select 1 from public.rooms where id = p_room_id and status = 'lobby' for update) then
    raise exception '只能在开局前修改晋级概率';
  end if;
  if jsonb_typeof(p_round_chances) <> 'array' or jsonb_array_length(p_round_chances) <> 9 then
    raise exception '需要提供九个晋级概率';
  end if;
  select array_agg(value::integer order by ordinal) into v_chances
  from jsonb_array_elements_text(p_round_chances) with ordinality as chances(value, ordinal);
  if exists (select 1 from unnest(v_chances) as chances(value) where value not between 0 and 100) then
    raise exception '晋级概率必须是 0 到 100 之间的整数';
  end if;
  update public.rooms set
    round_advance_chances = p_round_chances,
    round1_advance_chance = v_chances[1],
    round2_advance_chance = v_chances[2]
  where id = p_room_id;
  insert into public.game_events(room_id, message) values (p_room_id, '管理员更新了各轮晋级概率');
end;
$$;

revoke all on function public.admin_update_round_chances_v2(uuid, jsonb) from public;
grant execute on function public.admin_update_round_chances_v2(uuid, jsonb) to authenticated;

select pg_notify('pgrst', 'reload schema');
-- 创建管理员：先在 Authentication > Users 创建邮箱账号，再把邮箱替换为真实值执行。
-- insert into public.app_admins(user_id)
-- select id from auth.users where email = 'admin@example.com'
-- on conflict (user_id) do nothing;

-- 2026-10: configurable board structure, per-tile colors and import-safe randomization.
alter table public.rooms add column if not exists total_rounds integer not null default 3;
alter table public.rooms add column if not exists round1_board_size integer not null default 8;
alter table public.rooms add column if not exists round2_board_size integer not null default 12;
alter table public.rooms add column if not exists round3_board_size integer not null default 24;
alter table public.rooms add column if not exists imported_config boolean not null default false;

alter table public.rooms drop constraint if exists rooms_total_rounds_check;
alter table public.rooms add constraint rooms_total_rounds_check check (total_rounds between 1 and 10);
alter table public.rooms drop constraint if exists rooms_round1_board_size_check;
alter table public.rooms add constraint rooms_round1_board_size_check check (round1_board_size between 2 and 100 and mod(round1_board_size, 2) = 0);
alter table public.rooms drop constraint if exists rooms_round2_board_size_check;
alter table public.rooms add constraint rooms_round2_board_size_check check (round2_board_size between 2 and 100 and mod(round2_board_size, 2) = 0);
alter table public.rooms drop constraint if exists rooms_round3_board_size_check;
alter table public.rooms add constraint rooms_round3_board_size_check check (round3_board_size between 2 and 100 and mod(round3_board_size, 2) = 0);

alter table public.room_tiles add column if not exists tile_color text;
alter table public.room_tiles add column if not exists is_randomized boolean not null default true;
alter table public.room_tiles drop constraint if exists room_tiles_tile_type_check;
alter table public.room_tiles add constraint room_tiles_tile_type_check
  check (tile_type in ('start','shared','boss','runner','empty','move','chance'));
alter table public.room_tiles drop constraint if exists room_tiles_tile_color_check;
alter table public.room_tiles add constraint room_tiles_tile_color_check
  check (tile_color is null or tile_color ~ '^#[0-9A-Fa-f]{6}$');

update public.room_tiles set
  template_id = null,
  name = '起点',
  short_name = '起点',
  tile_type = 'start',
  detail = '本轮行动从这里开始',
  effect_type = 'none',
  effect_value = 0,
  is_randomized = false
where position = 0;

create or replace function public.generate_room_round_internal(
  p_room_id uuid, p_round integer, p_board_size integer, p_is_final boolean
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_position integer;
  v_group text;
  v_source_round integer;
  v_template public.tile_rule_templates%rowtype;
  v_first_advance integer := 1;
  v_second_advance integer := greatest(2, 1 + floor((p_board_size - 1) / 2.0)::integer);
begin
  delete from public.room_tiles where room_id = p_room_id and round_number = p_round;
  insert into public.room_tiles(
    room_id, template_id, round_number, position, name, short_name,
    tile_type, detail, effect_type, effect_value, tile_color, is_randomized
  ) values (
    p_room_id, null, p_round, 0, '起点', '起点', 'start',
    '本轮行动从这里开始', 'none', 0, null, false
  );

  for v_position in 1..p_board_size - 1 loop
    if p_is_final and v_position = p_board_size - 1 then
      v_group := 'finish';
      v_source_round := 3;
    elsif not p_is_final and v_position = v_first_advance then
      v_group := 'advance_chance';
      v_source_round := least(p_round, 2);
    elsif not p_is_final and v_position = v_second_advance then
      v_group := 'advance';
      v_source_round := least(p_round, 2);
    elsif v_position = 2 then
      v_group := 'empty';
      v_source_round := least(p_round, 3);
    else
      v_group := (array['empty','contract','contract','movement','movement','turn','dice'])[1 + floor(random() * 7)::integer];
      v_source_round := least(p_round, 3);
    end if;

    select * into v_template from public.tile_rule_templates
    where round_number = v_source_round and rule_group = v_group and enabled
    order by random() limit 1;
    if not found then raise exception '第 % 轮的 % 规则池不可用', p_round, v_group; end if;

    insert into public.room_tiles(
      room_id, template_id, round_number, position, name, short_name,
      tile_type, detail, effect_type, effect_value, tile_color, is_randomized
    ) values (
      p_room_id, v_template.id, p_round, v_position, v_template.name, v_template.short_name,
      v_template.tile_type, v_template.detail, v_template.effect_type, v_template.effect_value, null, true
    );
  end loop;
end;
$$;

create or replace function public.generate_room_board_internal(p_room_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_room public.rooms%rowtype;
  v_round integer;
  v_size integer;
begin
  select * into v_room from public.rooms where id = p_room_id;
  if not found then raise exception '房间不存在'; end if;
  delete from public.room_tiles where room_id = p_room_id;
  for v_round in 1..v_room.total_rounds loop
    v_size := (v_room.round_board_sizes ->> (v_round - 1))::integer;
    perform public.generate_room_round_internal(p_room_id, v_round, v_size, v_round = v_room.total_rounds);
  end loop;
end;
$$;

create or replace function public.randomize_room_tile_internal(p_tile_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_tile public.room_tiles%rowtype;
  v_group text;
  v_source_round integer;
  v_template public.tile_rule_templates%rowtype;
begin
  select * into v_tile from public.room_tiles where id = p_tile_id for update;
  if not found or v_tile.tile_type = 'start' then return; end if;
  if v_tile.effect_type = 'finish' then
    v_group := 'finish'; v_source_round := 3;
  elsif v_tile.effect_type = 'advance_chance' then
    v_group := 'advance_chance'; v_source_round := least(v_tile.round_number, 2);
  elsif v_tile.effect_type = 'advance_round' then
    v_group := 'advance'; v_source_round := least(v_tile.round_number, 2);
  else
    v_group := (array['empty','contract','contract','movement','movement','turn','dice'])[1 + floor(random() * 7)::integer];
    v_source_round := least(v_tile.round_number, 3);
  end if;
  select * into v_template from public.tile_rule_templates
  where round_number = v_source_round and rule_group = v_group and enabled
  order by random() limit 1;
  if not found then raise exception '随机规则池不可用'; end if;
  update public.room_tiles set
    template_id = v_template.id, name = v_template.name, short_name = v_template.short_name,
    tile_type = v_template.tile_type, detail = v_template.detail,
    effect_type = v_template.effect_type, effect_value = v_template.effect_value
  where id = p_tile_id;
end;
$$;

create or replace function public.admin_randomize_room_board(p_room_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_room public.rooms%rowtype;
begin
  if not public.is_admin() then raise exception '只有管理员可以重新生成棋盘'; end if;
  select * into v_room from public.rooms where id = p_room_id and status = 'lobby' for update;
  if not found then raise exception '只能在开局前重新生成棋盘'; end if;
  with targets as (
    select rt.id,
      case
        when rt.effect_type = 'finish' then 'finish'
        when rt.effect_type = 'advance_chance' then 'advance_chance'
        when rt.effect_type = 'advance_round' then 'advance'
        else (array['empty','contract','contract','movement','movement','turn','dice'])[1 + floor(random() * 7)::integer]
      end as rule_group,
      case
        when rt.effect_type = 'finish' then 3
        when rt.effect_type in ('advance_chance', 'advance_round') then least(rt.round_number, 2)
        else least(rt.round_number, 3)
      end as source_round
    from public.room_tiles rt
    where rt.room_id = p_room_id and rt.tile_type <> 'start'
      and (not v_room.imported_config or rt.is_randomized)
  ), replacements as (
    select targets.id as tile_id, template.*
    from targets
    cross join lateral (
      select source.* from public.tile_rule_templates source
      where source.round_number = targets.source_round
        and source.rule_group = targets.rule_group and source.enabled
      order by random() limit 1
    ) template
  )
  update public.room_tiles tile set
    template_id = replacement.id, name = replacement.name, short_name = replacement.short_name,
    tile_type = replacement.tile_type, detail = replacement.detail,
    effect_type = replacement.effect_type, effect_value = replacement.effect_value
  from replacements replacement where tile.id = replacement.tile_id;
  insert into public.game_events(room_id, message) values (
    p_room_id,
    case when v_room.imported_config
      then '管理员重新随机了导入设置中允许随机的格子'
      else '管理员重新随机生成了全部棋盘格'
    end
  );
end;
$$;

create or replace function public.admin_update_board_structure(
  p_room_id uuid, p_total_rounds integer, p_round_sizes jsonb
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_room public.rooms%rowtype;
  v_sizes integer[];
  v_round integer;
  v_old_size integer;
begin
  if not public.is_admin() then raise exception '只有管理员可以修改棋盘结构'; end if;
  select * into v_room from public.rooms where id = p_room_id and status = 'lobby' for update;
  if not found then raise exception '只能在开局前修改棋盘结构'; end if;
  if p_total_rounds not between 1 and 10 then raise exception '轮数必须在 1 到 10 之间'; end if;
  if jsonb_typeof(p_round_sizes) <> 'array' or jsonb_array_length(p_round_sizes) <> 10 then
    raise exception '需要提供十轮的格子数';
  end if;
  select array_agg(value::integer order by ordinal) into v_sizes
  from jsonb_array_elements_text(p_round_sizes) with ordinality as sizes(value, ordinal);
  if exists (select 1 from unnest(v_sizes[1:p_total_rounds]) as sizes(value) where value not between 2 and 100 or mod(value, 2) <> 0) then
    raise exception '每轮格子数必须是 2 到 100 之间的偶数';
  end if;

  update public.rooms set
    total_rounds = p_total_rounds,
    round_board_sizes = p_round_sizes,
    round1_board_size = v_sizes[1], round2_board_size = v_sizes[2], round3_board_size = v_sizes[3],
    board_size = v_sizes[1], imported_config = case when total_rounds <> p_total_rounds then false else imported_config end
  where id = p_room_id;

  if v_room.total_rounds <> p_total_rounds then
    perform public.generate_room_board_internal(p_room_id);
  else
    delete from public.room_tiles where room_id = p_room_id and round_number > p_total_rounds;
    for v_round in 1..p_total_rounds loop
      v_old_size := (v_room.round_board_sizes ->> (v_round - 1))::integer;
      if v_old_size <> v_sizes[v_round] then
        perform public.generate_room_round_internal(p_room_id, v_round, v_sizes[v_round], v_round = p_total_rounds);
      end if;
    end loop;
  end if;
  insert into public.game_events(room_id, message)
  values (p_room_id, '管理员将棋盘设为 ' || p_total_rounds || ' 轮，各轮格子数为 ' || array_to_string(v_sizes[1:p_total_rounds], '/'));
end;
$$;

create or replace function public.admin_import_room_config(p_room_id uuid, p_config jsonb)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_room public.rooms%rowtype;
  v_settings jsonb;
  v_tiles jsonb;
  v_tile jsonb;
  v_version integer;
  v_name text;
  v_round1_chance integer;
  v_round2_chance integer;
  v_rolls_per_turn integer;
  v_base_guarantee integer;
  v_total_rounds integer;
  v_sizes integer[];
  v_chances integer[];
  v_round integer;
  v_position integer;
  v_tile_name text;
  v_short_name text;
  v_tile_type text;
  v_detail text;
  v_effect_type text;
  v_effect_value numeric;
  v_tile_color text;
  v_is_randomized boolean;
  v_expected integer := 0;
begin
  if not public.is_admin() then raise exception '只有管理员可以导入房间设置'; end if;
  select * into v_room from public.rooms where id = p_room_id for update;
  if not found or v_room.status <> 'lobby' then raise exception '只能向等待中的房间导入设置'; end if;
  v_version := (p_config ->> 'version')::integer;
  if jsonb_typeof(p_config) <> 'object'
    or p_config ->> 'format' <> 'jingxu-delta-monopoly-room'
    or v_version not in (1, 2, 3, 4, 5, 6)
  then raise exception '房间设置文件格式或版本无效'; end if;

  v_settings := p_config -> 'settings';
  v_tiles := p_config -> 'tiles';
  if jsonb_typeof(v_settings) <> 'object' or jsonb_typeof(v_tiles) <> 'array' then
    raise exception '房间设置文件缺少设置或棋盘格';
  end if;
  v_name := trim(v_settings ->> 'name');
  v_round1_chance := (v_settings ->> 'round1_advance_chance')::integer;
  v_round2_chance := (v_settings ->> 'round2_advance_chance')::integer;
  v_rolls_per_turn := (v_settings ->> 'rolls_per_turn')::integer;
  v_base_guarantee := (v_settings ->> 'base_guarantee')::integer;
  if v_version = 1 then
    v_total_rounds := 3;
    v_sizes := array[8, 12, 24, 24, 24, 24, 24, 24, 24, 24];
    v_chances := array[v_round1_chance, v_round2_chance, 30, 30, 30, 30, 30, 30, 30];
  elsif v_version = 2 then
    v_total_rounds := (v_settings ->> 'total_rounds')::integer;
    if jsonb_typeof(v_settings -> 'round_sizes') <> 'array' or jsonb_array_length(v_settings -> 'round_sizes') <> 3 then
      raise exception '导入设置缺少三轮格子数';
    end if;
    v_sizes := array[
      (v_settings -> 'round_sizes' ->> 0)::integer,
      (v_settings -> 'round_sizes' ->> 1)::integer,
      (v_settings -> 'round_sizes' ->> 2)::integer,
      24, 24, 24, 24, 24, 24, 24
    ];
    v_chances := array[v_round1_chance, v_round2_chance, 30, 30, 30, 30, 30, 30, 30];
  else
    v_total_rounds := (v_settings ->> 'total_rounds')::integer;
    if jsonb_typeof(v_settings -> 'round_sizes') <> 'array' or jsonb_array_length(v_settings -> 'round_sizes') <> 10
      or jsonb_typeof(v_settings -> 'round_advance_chances') <> 'array' or jsonb_array_length(v_settings -> 'round_advance_chances') <> 9
    then raise exception '导入设置需要十轮格子数和九个晋级概率'; end if;
    select array_agg(value::integer order by ordinal) into v_sizes
    from jsonb_array_elements_text(v_settings -> 'round_sizes') with ordinality as sizes(value, ordinal);
    select array_agg(value::integer order by ordinal) into v_chances
    from jsonb_array_elements_text(v_settings -> 'round_advance_chances') with ordinality as chances(value, ordinal);
  end if;
  if char_length(v_name) not between 1 and 24 then raise exception '导入的房间名需要 1 到 24 个字符'; end if;
  if exists (select 1 from unnest(v_chances) as chances(value) where value not between 0 and 100) then raise exception '导入的晋级概率必须在 0 到 100 之间'; end if;
  if v_rolls_per_turn not between 1 and 5 then raise exception '导入的初始骰子数量必须在 1 到 5 之间'; end if;
  if v_base_guarantee not between 0 and 10000 then raise exception '导入的基础保底必须在 0 到 10000 万之间'; end if;
  if v_total_rounds not between 1 and 10 then raise exception '导入的轮数必须在 1 到 10 之间'; end if;
  if exists (select 1 from unnest(v_sizes[1:v_total_rounds]) as sizes(value) where value not between 2 and 100 or mod(value, 2) <> 0) then
    raise exception '导入的每轮格子数必须是 2 到 100 之间的偶数';
  end if;
  select sum(value) into v_expected from unnest(v_sizes[1:v_total_rounds]) as sizes(value);
  if jsonb_array_length(v_tiles) <> v_expected then raise exception '导入棋盘格数与轮次设置不一致'; end if;

  delete from public.room_tiles where room_id = p_room_id;
  for v_tile in select value from jsonb_array_elements(v_tiles) loop
    v_round := (v_tile ->> 'round_number')::integer;
    v_position := (v_tile ->> 'position')::integer;
    if v_round not between 1 and v_total_rounds or v_position not between 0 and v_sizes[v_round] - 1 then
      raise exception '导入棋盘格的轮次或位置无效';
    end if;
    if v_position = 0 then
      v_tile_name := '起点'; v_short_name := '起点'; v_tile_type := 'start';
      v_detail := '本轮行动从这里开始'; v_effect_type := 'none'; v_effect_value := 0;
      v_is_randomized := false;
    else
      v_tile_name := trim(v_tile ->> 'name');
      v_short_name := trim(v_tile ->> 'short_name');
      v_tile_type := v_tile ->> 'tile_type';
      v_detail := trim(v_tile ->> 'detail');
      v_effect_type := v_tile ->> 'effect_type';
      v_effect_value := (v_tile ->> 'effect_value')::numeric;
      v_is_randomized := case when v_version = 1 then false else coalesce((v_tile ->> 'is_randomized')::boolean, false) end;
    end if;
    v_tile_color := nullif(v_tile ->> 'tile_color', '');
    if char_length(v_tile_name) not between 1 and 40 or char_length(v_short_name) not between 1 and 16
      or char_length(v_detail) not between 1 and 160 then raise exception '导入棋盘格的文本长度无效'; end if;
    if v_tile_type not in ('start','shared','boss','runner','empty','move','chance') then raise exception '导入棋盘格分类无效'; end if;
    if v_position > 0 and v_tile_type = 'start' then raise exception '每轮只能在第 1 格设置起点'; end if;
    if v_effect_type not in ('none','guarantee_add','guarantee_subtract','guarantee_multiply','guarantee_divide','move','skip','extra_roll','lose_roll','advance_chance','advance_round','finish') then raise exception '导入棋盘格效果无效'; end if;
    if v_tile_type in ('start','empty') and (v_effect_type <> 'none' or v_effect_value <> 0) then raise exception '起点和空格不能附带效果'; end if;
    if v_effect_type in ('none','advance_chance','advance_round','finish') and v_effect_value <> 0 then raise exception '该效果的数值必须为 0'; end if;
    if v_effect_type in ('advance_chance','advance_round') and v_round = v_total_rounds then raise exception '最终轮不能配置晋级效果'; end if;
    if v_effect_type = 'finish' and v_round <> v_total_rounds then raise exception '结束格只能配置在最终轮'; end if;
    if v_effect_type not in ('guarantee_multiply','guarantee_divide') and v_effect_value <> trunc(v_effect_value) then raise exception '该效果数值必须是整数'; end if;
    if v_effect_type = 'move' and (v_effect_value = 0 or abs(v_effect_value) > 5) then raise exception '移动格数必须在 -5 到 5 之间且不能为 0'; end if;
    if v_effect_type = 'skip' and v_effect_value not between 1 and 2 then raise exception '暂停次数必须在 1 到 2 之间'; end if;
    if v_effect_type in ('extra_roll','lose_roll') and v_effect_value not between 1 and 2 then raise exception '骰子数量效果必须在 1 到 2 之间'; end if;
    if v_effect_type in ('guarantee_add','guarantee_subtract') and v_effect_value not between 1 and 100000 then raise exception '老板保底加减必须在 1 到 100000 万之间'; end if;
    if v_effect_type in ('guarantee_multiply','guarantee_divide') and v_effect_value not between 0 and 10 then raise exception '老板保底乘除倍数必须在 0 到 10 之间'; end if;
    if v_tile_color is not null and v_tile_color !~ '^#[0-9A-Fa-f]{6}$' then raise exception '格子颜色必须是 #RRGGBB 格式'; end if;
    insert into public.room_tiles(
      room_id, template_id, round_number, position, name, short_name, tile_type,
      detail, effect_type, effect_value, tile_color, is_randomized
    ) values (
      p_room_id, null, v_round, v_position, v_tile_name, v_short_name, v_tile_type,
      v_detail, v_effect_type, v_effect_value, v_tile_color, v_is_randomized
    );
  end loop;

  for v_round in 1..v_total_rounds loop
    if (select count(*) from public.room_tiles where room_id = p_room_id and round_number = v_round) <> v_sizes[v_round]
      or not exists (select 1 from public.room_tiles where room_id = p_room_id and round_number = v_round and position = 0 and tile_type = 'start')
    then raise exception '导入棋盘格位置不连续或缺少起点'; end if;
    if v_round < v_total_rounds and not exists (
      select 1 from public.room_tiles where room_id = p_room_id and round_number = v_round and effect_type in ('advance_chance','advance_round')
    ) then raise exception '导入棋盘的非最终轮至少需要一个晋级格'; end if;
  end loop;
  if not exists (select 1 from public.room_tiles where room_id = p_room_id and round_number = v_total_rounds and effect_type = 'finish') then
    raise exception '导入棋盘的最终轮至少需要一个结束格';
  end if;

  update public.rooms set
    name = v_name, round1_advance_chance = v_chances[1], round2_advance_chance = v_chances[2],
    round_advance_chances = to_jsonb(v_chances), round_board_sizes = to_jsonb(v_sizes),
    rolls_per_turn = v_rolls_per_turn, rolls_remaining = v_rolls_per_turn, base_guarantee = v_base_guarantee,
    total_rounds = v_total_rounds, round1_board_size = v_sizes[1], round2_board_size = v_sizes[2], round3_board_size = v_sizes[3],
    current_round = 1, board_size = v_sizes[1], imported_config = true
  where id = p_room_id;
  update public.room_players set
    dice_count = v_rolls_per_turn, coins = case when role = 'boss' then v_base_guarantee else 0 end, is_ready = false
  where room_id = p_room_id;
  insert into public.game_events(room_id, message)
  values (p_room_id, '管理员导入房间设置；后续随机仅替换文件中允许随机的格子');
end;
$$;

drop function if exists public.admin_update_room_tile(uuid, text, text, text, text, text, numeric);

create or replace function public.admin_update_room_tile(
  p_tile_id uuid, p_name text, p_short_name text, p_tile_type text,
  p_detail text, p_effect_type text, p_effect_value numeric,
  p_tile_color text, p_is_randomized boolean
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_tile public.room_tiles%rowtype;
  v_room public.rooms%rowtype;
begin
  if not public.is_admin() then raise exception '只有管理员可以编辑棋盘'; end if;
  select rt.* into v_tile from public.room_tiles rt join public.rooms r on r.id = rt.room_id
  where rt.id = p_tile_id and r.status = 'lobby' for update of rt;
  if not found then raise exception '格子不存在，或房间已经开始'; end if;
  select * into v_room from public.rooms where id = v_tile.room_id;
  if v_tile.tile_type = 'start' then
    update public.room_tiles set tile_color = nullif(p_tile_color, ''), is_randomized = false where id = p_tile_id;
    return;
  end if;
  if char_length(trim(p_name)) not between 1 and 40 or char_length(trim(p_short_name)) not between 1 and 16
    or char_length(trim(p_detail)) not between 1 and 160 then raise exception '格子文本长度无效'; end if;
  if p_tile_type not in ('shared','boss','runner','empty','move','chance') then raise exception '格子分类无效'; end if;
  if p_effect_type not in ('none','guarantee_add','guarantee_subtract','guarantee_multiply','guarantee_divide','move','skip','extra_roll','lose_roll','advance_chance','advance_round','finish') then raise exception '格子效果无效'; end if;
  if p_tile_type = 'empty' and (p_effect_type <> 'none' or p_effect_value <> 0) then raise exception '空格不能附带效果'; end if;
  if p_effect_type in ('none','advance_chance','advance_round','finish') and p_effect_value <> 0 then raise exception '该效果的数值必须为 0'; end if;
  if p_effect_type not in ('guarantee_multiply','guarantee_divide') and p_effect_value <> trunc(p_effect_value) then raise exception '该效果数值必须是整数'; end if;
  if p_effect_type in ('advance_chance','advance_round') and v_tile.round_number = v_room.total_rounds then raise exception '最终轮不能配置晋级效果'; end if;
  if p_effect_type = 'finish' and v_tile.round_number <> v_room.total_rounds then raise exception '结束本局只能配置在最终轮'; end if;
  if p_effect_type = 'move' and (p_effect_value = 0 or abs(p_effect_value) > 5) then raise exception '移动格数必须在 -5 到 5 之间且不能为 0'; end if;
  if p_effect_type = 'skip' and p_effect_value not between 1 and 2 then raise exception '暂停次数必须在 1 到 2 之间'; end if;
  if p_effect_type in ('extra_roll','lose_roll') and p_effect_value not between 1 and 2 then raise exception '骰子数量效果必须在 1 到 2 之间'; end if;
  if p_effect_type in ('guarantee_add','guarantee_subtract') and p_effect_value not between 1 and 100000 then raise exception '老板保底加减必须在 1 到 100000 万之间'; end if;
  if p_effect_type in ('guarantee_multiply','guarantee_divide') and p_effect_value not between 0 and 10 then raise exception '老板保底乘除倍数必须在 0 到 10 之间'; end if;
  if nullif(p_tile_color, '') is not null and p_tile_color !~ '^#[0-9A-Fa-f]{6}$' then raise exception '格子颜色必须是 #RRGGBB 格式'; end if;
  if v_tile.effect_type in ('advance_chance','advance_round') and p_effect_type not in ('advance_chance','advance_round') and (
    select count(*) from public.room_tiles where room_id = v_tile.room_id and round_number = v_tile.round_number and effect_type in ('advance_chance','advance_round')
  ) <= 1 then raise exception '非最终轮至少保留一个晋级格'; end if;
  if v_tile.effect_type = 'finish' and p_effect_type <> 'finish' and (
    select count(*) from public.room_tiles where room_id = v_tile.room_id and round_number = v_room.total_rounds and effect_type = 'finish'
  ) <= 1 then raise exception '最终轮至少保留一个结束格'; end if;
  update public.room_tiles set
    template_id = null, name = trim(p_name), short_name = trim(p_short_name), tile_type = p_tile_type,
    detail = trim(p_detail), effect_type = p_effect_type, effect_value = p_effect_value,
    tile_color = nullif(p_tile_color, ''), is_randomized = p_is_randomized
  where id = p_tile_id;
  insert into public.game_events(room_id, message)
  values (v_tile.room_id, '管理员修改了第' || v_tile.round_number || '轮第 ' || (v_tile.position + 1) || ' 格');
end;
$$;

create or replace function public.admin_start_game(p_room_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_room public.rooms%rowtype;
  v_first_user uuid;
  v_first_name text;
  v_first_order integer;
  v_rolls integer;
  v_round integer;
  v_size integer;
begin
  if not public.is_admin() then raise exception '只有管理员可以开始房间'; end if;
  select * into v_room from public.rooms where id = p_room_id and status = 'lobby' for update;
  if not found then raise exception '房间不存在或已经开始'; end if;
  if exists (select 1 from public.room_players where room_id = p_room_id and not is_ready) then raise exception '还有玩家没有准备'; end if;
  if (select count(*) from public.room_players where room_id = p_room_id) not between 2 and 3
    or (select count(*) from public.room_players where room_id = p_room_id and role = 'boss') <> 1
    or (select count(*) from public.room_players where room_id = p_room_id and role = 'runner') not between 1 and 2
  then raise exception '需要 1 名老板和 1 至 2 名打手才能开始'; end if;
  for v_round in 1..v_room.total_rounds loop
    v_size := (v_room.round_board_sizes ->> (v_round - 1))::integer;
    if (select count(*) from public.room_tiles where room_id = p_room_id and round_number = v_round) <> v_size
      or not exists (select 1 from public.room_tiles where room_id = p_room_id and round_number = v_round and position = 0 and tile_type = 'start')
    then raise exception '第 % 轮棋盘不完整或缺少起点', v_round; end if;
    if v_round < v_room.total_rounds and not exists (
      select 1 from public.room_tiles where room_id = p_room_id and round_number = v_round and effect_type in ('advance_chance','advance_round')
    ) then raise exception '第 % 轮至少需要一个晋级格', v_round; end if;
  end loop;
  if not exists (
    select 1 from public.room_tiles where room_id = p_room_id and round_number = v_room.total_rounds and effect_type = 'finish'
  ) then raise exception '最终轮至少需要一个结束格'; end if;

  select p.user_id, p.nickname, p.turn_order into v_first_user, v_first_name, v_first_order
  from public.room_players p join public.rooms r on r.id = p.room_id
  where p.room_id = p_room_id and p.user_id = r.starting_player_id limit 1;
  if v_first_user is null then
    select user_id, nickname, turn_order into v_first_user, v_first_name, v_first_order
    from public.room_players where room_id = p_room_id order by turn_order limit 1;
  end if;
  update public.rooms set status = 'playing', is_paused = false, current_turn = null, current_round = 1,
    board_size = (round_board_sizes ->> 0)::integer, winner_id = null, rolls_remaining = 0 where id = p_room_id;
  update public.room_players p set position = 0, distance = 0,
    coins = case when p.role = 'boss' then r.base_guarantee else 0 end,
    skip_turns = 0, next_roll_modifier = 0, round_roll_count = 0
  from public.rooms r where p.room_id = p_room_id and r.id = p_room_id;
  perform public.advance_room_turn_internal(p_room_id, v_first_order - 1);
  select p.user_id, p.nickname, r.rolls_remaining into v_first_user, v_first_name, v_rolls
  from public.rooms r join public.room_players p on p.room_id = r.id and p.user_id = r.current_turn
  where r.id = p_room_id;
  insert into public.game_events(room_id, message)
  values (p_room_id, '本局开始，' || v_first_name || ' 先行动，当前有 ' || v_rolls || ' 个骰子');
end;
$$;

create or replace function public.roll_dice(p_room_id uuid)
returns table(dice_value integer, landed_position integer, coin_change integer, winner boolean)
language plpgsql security definer set search_path = public
as $$
declare
  v_room public.rooms%rowtype;
  v_player public.room_players%rowtype;
  v_tile public.room_tiles%rowtype;
  v_dice integer;
  v_landed integer;
  v_position integer;
  v_distance integer;
  v_change integer := 0;
  v_remaining integer;
  v_skip integer;
  v_modifier integer;
  v_chance integer;
  v_candidate_dice integer[];
  v_should_advance boolean;
  v_advanced boolean := false;
  v_finished boolean := false;
  v_next_round integer;
  v_next_size integer;
  v_guarantee_before integer;
  v_guarantee integer;
begin
  select * into v_room from public.rooms where id = p_room_id for update;
  if not found or v_room.status <> 'playing' then raise exception '当前没有进行中的行动'; end if;
  if v_room.is_paused then raise exception '本局已被管理员暂停，暂时不能掷骰'; end if;
  if v_room.current_turn <> auth.uid() then raise exception '还没有轮到你'; end if;
  select * into v_player from public.room_players where room_id = p_room_id and user_id = auth.uid() for update;
  if not found then raise exception '你不在该房间中'; end if;
  if v_player.dice_count <= 0 then raise exception '当前没有可用骰子'; end if;

  if v_room.current_round < v_room.total_rounds then
    v_chance := (v_room.round_advance_chances ->> (v_room.current_round - 1))::integer;
    v_should_advance := v_player.role = 'boss' and v_player.round_roll_count >= 2
      and floor(random() * 100)::integer < v_chance;
    select array_agg(candidate.dice order by candidate.dice) into v_candidate_dice
    from generate_series(1, 6) as candidate(dice)
    join public.room_tiles rt on rt.room_id = p_room_id
      and rt.round_number = v_room.current_round
      and rt.position = mod(v_player.position + candidate.dice, v_room.board_size)
    where (rt.effect_type in ('advance_chance', 'advance_round')) = v_should_advance;
    -- Custom board sizes can make one outcome unavailable within six steps.
    -- Fall back to a normal roll instead of blocking the room.
    if coalesce(array_length(v_candidate_dice, 1), 0) = 0 then
      v_dice := floor(random() * 6 + 1)::integer;
    else
      v_dice := v_candidate_dice[1 + floor(random() * array_length(v_candidate_dice, 1))::integer];
    end if;
  else
    v_dice := floor(random() * 6 + 1)::integer;
  end if;
  v_landed := mod(v_player.position + v_dice, v_room.board_size);
  v_position := v_landed;
  v_distance := v_player.distance + v_dice;
  v_remaining := greatest(0, v_player.dice_count - 1);
  v_skip := v_player.skip_turns;
  v_modifier := v_player.next_roll_modifier;
  select * into v_tile from public.room_tiles
  where room_id = p_room_id and round_number = v_room.current_round and position = v_landed;
  if not found then raise exception '当前棋盘配置不完整'; end if;

  case v_tile.effect_type
    when 'move' then
      v_position := mod(mod(v_position + v_tile.effect_value::integer, v_room.board_size) + v_room.board_size, v_room.board_size);
      v_distance := greatest(0, v_distance + v_tile.effect_value::integer);
    when 'skip' then v_skip := least(3, v_skip + v_tile.effect_value::integer);
    when 'extra_roll' then v_remaining := least(20, v_remaining + v_tile.effect_value::integer);
    when 'lose_roll' then v_modifier := greatest(-4, v_modifier - v_tile.effect_value::integer);
    when 'advance_chance' then
      v_advanced := v_room.current_round < v_room.total_rounds and v_player.role = 'boss' and v_player.round_roll_count >= 2;
    when 'advance_round' then
      v_advanced := v_room.current_round < v_room.total_rounds and v_player.role = 'boss' and v_player.round_roll_count >= 2;
    when 'finish' then v_finished := v_room.current_round = v_room.total_rounds;
    else null;
  end case;

  update public.room_players set position = v_position, distance = v_distance,
    skip_turns = v_skip, next_roll_modifier = v_modifier, dice_count = v_remaining,
    round_roll_count = round_roll_count + 1 where id = v_player.id;
  insert into public.game_events(room_id, message, event_type, metadata)
  values (
    p_room_id,
    v_player.nickname || ' 掷出 ' || v_dice || '，落到「' || v_tile.name || '」：' || v_tile.detail,
    'roll',
    jsonb_build_object(
      'player_id', v_player.id, 'player_name', v_player.nickname, 'role', v_player.role,
      'round', v_room.current_round, 'dice', v_dice, 'landed_position', v_landed,
      'tile_name', v_tile.name, 'tile_detail', v_tile.detail, 'tile_type', v_tile.tile_type,
      'effect_type', v_tile.effect_type, 'effect_value', v_tile.effect_value
    )
  );
  if v_tile.effect_type in ('guarantee_add','guarantee_subtract','guarantee_multiply','guarantee_divide') then
    select coins into v_guarantee_before from public.room_players where room_id = p_room_id and role = 'boss' for update;
    if not found then raise exception '当前房间没有老板，无法结算保底'; end if;
    v_guarantee := case v_tile.effect_type
      when 'guarantee_add' then least(1000000::numeric, v_guarantee_before::numeric + v_tile.effect_value)::integer
      when 'guarantee_subtract' then greatest(0, v_guarantee_before - v_tile.effect_value)
      when 'guarantee_multiply' then round(least(1000000::numeric, v_guarantee_before::numeric * v_tile.effect_value))::integer
      when 'guarantee_divide' then case when v_tile.effect_value = 0 then 0 else round(v_guarantee_before::numeric / v_tile.effect_value)::integer end
    end;
    v_change := v_guarantee - v_guarantee_before;
    update public.room_players set coins = v_guarantee where room_id = p_room_id and role = 'boss';
    insert into public.game_events(room_id, message)
    values (
      p_room_id,
      '老板保底' || case v_tile.effect_type
        when 'guarantee_add' then '增加 ' || v_tile.effect_value || ' 万'
        when 'guarantee_subtract' then '减少 ' || v_tile.effect_value || ' 万'
        when 'guarantee_multiply' then '乘以 ' || v_tile.effect_value
        else '除以 ' || v_tile.effect_value
      end || '：' || v_guarantee_before || ' 万 → ' || v_guarantee || ' 万'
    );
  end if;
  if v_tile.effect_type = 'move' then
    insert into public.game_events(room_id, message)
    values (p_room_id, v_player.nickname || case when v_tile.effect_value > 0 then ' 前进 ' else ' 后退 ' end || abs(v_tile.effect_value) || ' 格，到达第 ' || (v_position + 1) || ' 格');
  end if;

  if v_finished then
    if not exists (select 1 from public.room_players where room_id = p_room_id and dice_count > 0) then
      perform public.create_zero_dice_rule_internal(p_room_id);
    end if;
    update public.rooms set status = 'finished', is_paused = false, winner_id = auth.uid(), current_turn = null, rolls_remaining = 0 where id = p_room_id;
    insert into public.game_events(room_id, message) values (p_room_id, v_player.nickname || ' 完成最终结算，本局结束');
  else
    if v_advanced then
      v_next_round := v_room.current_round + 1;
      v_next_size := (v_room.round_board_sizes ->> (v_next_round - 1))::integer;
      update public.rooms set current_round = v_next_round, board_size = v_next_size where id = p_room_id;
      update public.room_players set position = 0, round_roll_count = 0 where room_id = p_room_id;
      insert into public.game_events(room_id, message)
      values (p_room_id, '队伍进入第 ' || v_next_round || ' 轮 ' || v_next_size || ' 格棋盘');
    end if;
    perform public.advance_room_turn_internal(p_room_id, v_player.turn_order);
  end if;
  return query select v_dice, v_position, v_change, v_finished;
end;
$$;

revoke all on function public.generate_room_round_internal(uuid, integer, integer, boolean) from public;
revoke all on function public.randomize_room_tile_internal(uuid) from public;
revoke all on function public.admin_update_board_structure(uuid, integer, jsonb) from public;
revoke all on function public.admin_update_room_tile(uuid, text, text, text, text, text, numeric, text, boolean) from public;
grant execute on function public.admin_update_board_structure(uuid, integer, jsonb) to authenticated;
grant execute on function public.admin_update_room_tile(uuid, text, text, text, text, text, numeric, text, boolean) to authenticated;

-- Keep these graph-aware overrides last: this schema intentionally contains upgrade layers above.
create or replace function public.admin_import_room_graph(p_room_id uuid, p_config jsonb)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_tile jsonb;
  v_edge jsonb;
  v_from uuid;
  v_to uuid;
  v_round integer;
  v_version integer;
  v_image_id uuid;
  v_image_url text;
begin
  if not public.is_admin() then raise exception '只有管理员可以导入棋盘路线'; end if;
  if not exists (select 1 from public.rooms where id = p_room_id and status = 'lobby') then raise exception '只能向等待中的房间导入路线'; end if;
  v_version := coalesce((p_config ->> 'version')::integer, 0);
  if v_version >= 4 then
    for v_tile in select value from jsonb_array_elements(p_config -> 'tiles') loop
      v_image_id := null;
      v_image_url := null;
      if v_version >= 6 and nullif(v_tile ->> 'image_id', '') is not null then
        begin
          v_image_id := (v_tile ->> 'image_id')::uuid;
        exception when invalid_text_representation then
          raise exception '导入配置包含无效图片标识';
        end;
        select image.public_url into v_image_url from public.room_tile_images image where image.id = v_image_id;
        if not found then raise exception '导入配置引用的公共图片不存在'; end if;
      end if;
      update public.room_tiles set grid_x = case when v_tile ? 'grid_x' and v_tile ->> 'grid_x' is not null then (v_tile ->> 'grid_x')::integer else null end,
        grid_y = case when v_tile ? 'grid_y' and v_tile ->> 'grid_y' is not null then (v_tile ->> 'grid_y')::integer else null end,
        layout_x = case when v_version >= 5 and v_tile ? 'layout_x' and v_tile ->> 'layout_x' is not null then (v_tile ->> 'layout_x')::numeric else null end,
        layout_y = case when v_version >= 5 and v_tile ? 'layout_y' and v_tile ->> 'layout_y' is not null then (v_tile ->> 'layout_y')::numeric else null end,
        image_id = case when v_version >= 6 then v_image_id else image_id end,
        image_url = case when v_version >= 6 then v_image_url else image_url end
      where room_id = p_room_id and round_number = (v_tile ->> 'round_number')::integer and position = (v_tile ->> 'position')::integer;
    end loop;
  end if;
  delete from public.room_tile_edges where room_id = p_room_id;
  if v_version >= 4 and jsonb_typeof(p_config -> 'edges') = 'array' then
    for v_edge in select value from jsonb_array_elements(p_config -> 'edges') loop
      v_round := (v_edge ->> 'round_number')::integer;
      select id into v_from from public.room_tiles where room_id = p_room_id and round_number = v_round and position = (v_edge ->> 'from_position')::integer;
      select id into v_to from public.room_tiles where room_id = p_room_id and round_number = v_round and position = (v_edge ->> 'to_position')::integer;
      if v_from is null or v_to is null or v_from = v_to then raise exception '导入路线包含无效格子'; end if;
      insert into public.room_tile_edges(room_id, round_number, from_tile_id, to_tile_id, is_bidirectional)
      values (p_room_id, v_round, v_from, v_to, coalesce((v_edge ->> 'is_bidirectional')::boolean, false))
      on conflict (from_tile_id, to_tile_id) do update set is_bidirectional = excluded.is_bidirectional;
    end loop;
  end if;
  if exists (
    with exits as (
      select from_tile_id as tile_id from public.room_tile_edges where room_id = p_room_id
      union all
      select to_tile_id from public.room_tile_edges where room_id = p_room_id and is_bidirectional
    ) select 1 from exits group by tile_id having count(*) > 4
  ) then raise exception '导入棋盘中每个格子最多只能有 4 个出口'; end if;
  for v_round in 1..(select total_rounds from public.rooms where id = p_room_id) loop
    perform public.ensure_room_edges_internal(p_room_id, v_round);
  end loop;
end;
$$;

create or replace function public.roll_dice(p_room_id uuid)
returns table(dice_value integer, landed_position integer, coin_change integer, winner boolean)
language plpgsql security definer set search_path = public
as $$
declare
  v_room public.rooms%rowtype;
  v_player public.room_players%rowtype;
  v_start_tile uuid;
  v_dice integer;
  v_options jsonb;
  v_option jsonb;
  v_landed uuid;
  v_remaining integer;
  v_chance integer;
  v_should_advance boolean := false;
  v_candidate integer;
  v_candidate_options jsonb;
  v_candidate_dice integer[] := array[]::integer[];
begin
  select * into v_room from public.rooms where id = p_room_id for update;
  if not found or v_room.status <> 'playing' then raise exception '当前没有进行中的行动'; end if;
  if v_room.is_paused then raise exception '本局已被管理员暂停，暂时不能掷骰'; end if;
  if v_room.pending_player_id is not null then raise exception '请先完成当前路线选择'; end if;
  if v_room.current_turn <> auth.uid() then raise exception '还没有轮到你'; end if;
  select * into v_player from public.room_players where room_id = p_room_id and user_id = auth.uid() for update;
  if not found or v_player.dice_count <= 0 then raise exception '当前没有可用骰子'; end if;
  perform public.ensure_room_edges_internal(p_room_id, v_room.current_round);
  select id into v_start_tile from public.room_tiles where room_id = p_room_id and round_number = v_room.current_round and position = v_player.position;
  if v_room.current_round < v_room.total_rounds then
    v_chance := (v_room.round_advance_chances ->> (v_room.current_round - 1))::integer;
    v_should_advance := v_player.role = 'boss' and v_player.round_roll_count >= 2
      and floor(random() * 100)::integer < v_chance;
    for v_candidate in 1..6 loop
      v_candidate_options := public.get_room_route_options_internal(p_room_id, v_room.current_round, v_start_tile, v_candidate);
      if exists (
        select 1 from jsonb_array_elements(v_candidate_options) option(value)
        join public.room_tiles tile on tile.id = (option.value ->> 'tile_id')::uuid
        where (tile.effect_type in ('advance_chance', 'advance_round')) = v_should_advance
      ) then v_candidate_dice := array_append(v_candidate_dice, v_candidate); end if;
    end loop;
  end if;
  if coalesce(array_length(v_candidate_dice, 1), 0) > 0 then
    v_dice := v_candidate_dice[1 + floor(random() * array_length(v_candidate_dice, 1))::integer];
  else
    v_dice := floor(random() * 6 + 1)::integer;
  end if;
  v_options := public.get_room_route_options_internal(p_room_id, v_room.current_round, v_start_tile, v_dice);
  if v_room.current_round < v_room.total_rounds then
    select coalesce(jsonb_agg(option.value), '[]'::jsonb) into v_candidate_options
    from jsonb_array_elements(v_options) option(value)
    join public.room_tiles tile on tile.id = (option.value ->> 'tile_id')::uuid
    where (tile.effect_type in ('advance_chance', 'advance_round')) = v_should_advance;
    if jsonb_array_length(v_candidate_options) > 0 then v_options := v_candidate_options; end if;
  end if;
  if jsonb_array_length(v_options) = 0 then raise exception '当前格子在 % 步内没有完整路线，请管理员检查箭头连接', v_dice; end if;
  v_remaining := greatest(0, v_player.dice_count - 1);
  update public.room_players set dice_count = v_remaining, round_roll_count = round_roll_count + 1 where id = v_player.id;
  if jsonb_array_length(v_options) > 1 then
    update public.rooms set pending_dice = v_dice, pending_player_id = v_player.user_id,
      pending_route_options = v_options, rolls_remaining = v_remaining where id = p_room_id;
    insert into public.game_events(room_id, message) values (p_room_id, v_player.nickname || ' 掷出 ' || v_dice || '，遇到分叉路线，等待选择走向');
    return query select v_dice, -1, 0, false;
    return;
  end if;
  v_option := v_options -> 0;
  v_landed := (v_option ->> 'tile_id')::uuid;
  perform public.resolve_room_landing_internal(p_room_id, v_player.id, v_dice, v_landed);
  return query select v_dice, (v_option ->> 'position')::integer, 0, false;
end;
$$;

revoke all on function public.admin_import_room_graph(uuid, jsonb) from public;
revoke all on function public.roll_dice(uuid) from public;
grant execute on function public.admin_import_room_graph(uuid, jsonb) to authenticated;
grant execute on function public.roll_dice(uuid) to authenticated;

create or replace function public.admin_ensure_room_edges(p_room_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_room public.rooms%rowtype; v_round integer;
begin
  if not public.is_admin() then raise exception '只有管理员可以初始化棋盘路线'; end if;
  select * into v_room from public.rooms where id = p_room_id;
  if not found then raise exception '房间不存在'; end if;
  for v_round in 1..v_room.total_rounds loop perform public.ensure_room_edges_internal(p_room_id, v_round); end loop;
end;
$$;
revoke all on function public.admin_ensure_room_edges(uuid) from public;
grant execute on function public.admin_ensure_room_edges(uuid) to authenticated;

create or replace function public.admin_apply_board_layout(p_room_id uuid, p_round integer, p_positions jsonb)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_tile_count integer;
  v_layout_count integer;
  v_unique_positions integer;
  v_invalid_count integer;
  v_min_position integer;
  v_max_position integer;
begin
  if not public.is_admin() then raise exception '只有管理员可以应用地图预设'; end if;
  perform 1 from public.rooms where id = p_room_id and status = 'lobby' for update;
  if not found then raise exception '房间不存在，或房间已经开始'; end if;
  if p_round not between 1 and 10 then raise exception '轮次无效'; end if;
  if jsonb_typeof(p_positions) <> 'array' then raise exception '地图坐标格式无效'; end if;

  select count(*) into v_tile_count from public.room_tiles
  where room_id = p_room_id and round_number = p_round;

  select count(*), count(distinct layout.position),
    count(*) filter (where layout.position is null or layout.layout_x is null or layout.layout_y is null
      or layout.layout_x not between -100000 and 100000 or layout.layout_y not between -100000 and 100000),
    min(layout.position), max(layout.position)
  into v_layout_count, v_unique_positions, v_invalid_count, v_min_position, v_max_position
  from jsonb_to_recordset(p_positions) as layout(position integer, layout_x numeric, layout_y numeric);

  if v_layout_count <> v_tile_count or v_unique_positions <> v_tile_count
    or v_invalid_count > 0
    or v_min_position <> 0 or v_max_position <> v_tile_count - 1 then
    raise exception '地图预设必须为本轮每个格子提供唯一且有效的坐标';
  end if;

  with layout as (
    select * from jsonb_to_recordset(p_positions) as item(position integer, layout_x numeric, layout_y numeric)
  )
  update public.room_tiles as tile
  set layout_x = layout.layout_x, layout_y = layout.layout_y
  from layout
  where tile.room_id = p_room_id and tile.round_number = p_round and tile.position = layout.position;
end;
$$;
revoke all on function public.admin_apply_board_layout(uuid, integer, jsonb) from public;
grant execute on function public.admin_apply_board_layout(uuid, integer, jsonb) to authenticated;

-- Infinite canvas positions and reusable, aggressively compressed tile images.
alter table public.room_tiles drop constraint if exists room_tiles_layout_x_check;
alter table public.room_tiles add constraint room_tiles_layout_x_check check (layout_x is null or layout_x between -100000 and 100000);
alter table public.room_tiles drop constraint if exists room_tiles_layout_y_check;
alter table public.room_tiles add constraint room_tiles_layout_y_check check (layout_y is null or layout_y between -100000 and 100000);

create table if not exists public.room_tile_images (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references public.rooms(id) on delete set null,
  name text not null check (char_length(name) between 1 and 60),
  storage_path text not null unique,
  public_url text not null,
  width integer not null check (width between 1 and 2000),
  height integer not null check (height between 1 and 2000),
  byte_size integer not null check (byte_size between 1 and 15360),
  mime_type text not null check (mime_type = 'image/webp'),
  created_at timestamptz not null default now()
);

create index if not exists room_tile_images_room_idx on public.room_tile_images(room_id, created_at desc);
alter table public.room_tile_images drop constraint if exists room_tile_images_room_id_fkey;
alter table public.room_tile_images alter column room_id drop not null;
alter table public.room_tile_images add constraint room_tile_images_room_id_fkey foreign key (room_id) references public.rooms(id) on delete set null;
alter table public.room_tile_images drop constraint if exists room_tile_images_byte_size_check;
alter table public.room_tile_images add constraint room_tile_images_byte_size_check check (byte_size between 1 and 15360) not valid;
alter table public.room_tile_images enable row level security;
drop policy if exists "room members can read tile images" on public.room_tile_images;
drop policy if exists "admins can read tile images" on public.room_tile_images;
create policy "admins can read tile images" on public.room_tile_images for select to authenticated using (public.is_admin());

alter table public.room_tiles add column if not exists image_id uuid;
alter table public.room_tiles add column if not exists image_url text;
alter table public.room_tiles drop constraint if exists room_tiles_image_id_fkey;
alter table public.room_tiles add constraint room_tiles_image_id_fkey foreign key (image_id) references public.room_tile_images(id) on delete set null;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('tile-images', 'tile-images', true, 15360, array['image/webp'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "admins upload tile images" on storage.objects;
create policy "admins upload tile images" on storage.objects for insert to authenticated
  with check (bucket_id = 'tile-images' and public.is_admin());
drop policy if exists "admins update tile images" on storage.objects;
create policy "admins update tile images" on storage.objects for update to authenticated
  using (bucket_id = 'tile-images' and public.is_admin()) with check (bucket_id = 'tile-images' and public.is_admin());
drop policy if exists "admins delete tile images" on storage.objects;
create policy "admins delete tile images" on storage.objects for delete to authenticated
  using (bucket_id = 'tile-images' and public.is_admin());

create or replace function public.admin_update_tile_position(p_tile_id uuid, p_layout_x numeric, p_layout_y numeric)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception '只有管理员可以移动格子'; end if;
  if p_layout_x not between -100000 and 100000 or p_layout_y not between -100000 and 100000 then
    raise exception '格子坐标超出无限画布的安全范围';
  end if;
  update public.room_tiles tile set layout_x = p_layout_x, layout_y = p_layout_y
  from public.rooms room where tile.id = p_tile_id and room.id = tile.room_id and room.status = 'lobby';
  if not found then raise exception '格子不存在，或房间已经开始'; end if;
end;
$$;

create or replace function public.admin_add_room_tiles_around(p_tile_id uuid, p_anchor_x numeric, p_anchor_y numeric)
returns void language plpgsql security definer set search_path = public
as $$
declare
  v_tile public.room_tiles%rowtype;
  v_room public.rooms%rowtype;
  v_room_id uuid;
  v_size integer;
  v_position integer;
  v_old_next uuid;
  v_first uuid;
  v_second uuid;
begin
  if not public.is_admin() then raise exception '只有管理员可以添加格子'; end if;
  if p_anchor_x not between -100000 and 100000 or p_anchor_y not between -100000 and 100000 then raise exception '格子坐标无效'; end if;
  select room_id into v_room_id from public.room_tiles where id = p_tile_id;
  select * into v_room from public.rooms where id = v_room_id and status = 'lobby' for update;
  if not found then raise exception '格子不存在，或房间已经开始'; end if;
  select * into v_tile from public.room_tiles where id = p_tile_id for update;
  v_size := (v_room.round_board_sizes ->> (v_tile.round_number - 1))::integer;
  if v_size > 98 then raise exception '每轮最多 100 格'; end if;
  perform public.ensure_room_edges_internal(v_tile.room_id, v_tile.round_number);
  select id into v_old_next from public.room_tiles where room_id = v_tile.room_id and round_number = v_tile.round_number
    and position = case when v_tile.position = v_size - 1 then 0 else v_tile.position + 1 end;

  for v_position in reverse (v_size - 1)..(v_tile.position + 1) loop
    update public.room_tiles set position = v_position + 2
    where room_id = v_tile.room_id and round_number = v_tile.round_number and position = v_position;
  end loop;
  update public.room_tiles set layout_x = p_anchor_x, layout_y = p_anchor_y where id = p_tile_id;
  insert into public.room_tiles(room_id, round_number, position, name, short_name, tile_type, detail, effect_type, effect_value, is_randomized, layout_x, layout_y)
  values (v_tile.room_id, v_tile.round_number, v_tile.position + 1, '空格', '空格', 'empty', '平安经过，本格不触发额外效果', 'none', 0, true, p_anchor_x + 150, p_anchor_y - 122)
  returning id into v_first;
  insert into public.room_tiles(room_id, round_number, position, name, short_name, tile_type, detail, effect_type, effect_value, is_randomized, layout_x, layout_y)
  values (v_tile.room_id, v_tile.round_number, v_tile.position + 2, '空格', '空格', 'empty', '平安经过，本格不触发额外效果', 'none', 0, true, p_anchor_x + 150, p_anchor_y + 122)
  returning id into v_second;

  delete from public.room_tile_edges where from_tile_id = p_tile_id and to_tile_id = v_old_next and not is_bidirectional;
  insert into public.room_tile_edges(room_id, round_number, from_tile_id, to_tile_id)
  values (v_tile.room_id, v_tile.round_number, p_tile_id, v_first),
    (v_tile.room_id, v_tile.round_number, v_first, v_second),
    (v_tile.room_id, v_tile.round_number, v_second, v_old_next)
  on conflict (from_tile_id, to_tile_id) do update set is_bidirectional = false;

  update public.rooms set
    round_board_sizes = jsonb_set(round_board_sizes, array[(v_tile.round_number - 1)::text], to_jsonb(v_size + 2)),
    round1_board_size = case when v_tile.round_number = 1 then v_size + 2 else round1_board_size end,
    round2_board_size = case when v_tile.round_number = 2 then v_size + 2 else round2_board_size end,
    round3_board_size = case when v_tile.round_number = 3 then v_size + 2 else round3_board_size end,
    board_size = case when v_tile.round_number = 1 then v_size + 2 else board_size end
  where id = v_tile.room_id;
  insert into public.game_events(room_id, message) values (v_tile.room_id, '管理员围绕第' || (v_tile.position + 1) || '格添加了 2 个格子');
end;
$$;

create or replace function public.admin_create_tile_image(
  p_room_id uuid, p_name text, p_storage_path text, p_public_url text,
  p_width integer, p_height integer, p_byte_size integer, p_mime_type text
) returns uuid language plpgsql security definer set search_path = public
as $$
declare v_id uuid;
begin
  if not public.is_admin() then raise exception '只有管理员可以添加图片'; end if;
  if not exists (select 1 from public.rooms where id = p_room_id and status = 'lobby') then raise exception '只能在开局前添加图片'; end if;
  if p_byte_size not between 1 and 15360 or p_mime_type <> 'image/webp' then raise exception '图片必须是 15 KB 以内的 WebP'; end if;
  if p_storage_path not like (p_room_id::text || '/%') then raise exception '图片存储路径无效'; end if;
  insert into public.room_tile_images(room_id, name, storage_path, public_url, width, height, byte_size, mime_type)
  values (p_room_id, left(trim(p_name), 60), p_storage_path, p_public_url, p_width, p_height, p_byte_size, p_mime_type)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.admin_set_tile_image(p_tile_id uuid, p_image_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare v_url text;
begin
  if not public.is_admin() then raise exception '只有管理员可以设置格子图片'; end if;
  if p_image_id is not null then
    select image.public_url into v_url from public.room_tile_images image where image.id = p_image_id;
    if not found then raise exception '公共图片不存在'; end if;
  end if;
  update public.room_tiles tile set image_id = p_image_id, image_url = v_url
  from public.rooms room where tile.id = p_tile_id and room.id = tile.room_id and room.status = 'lobby';
  if not found then raise exception '格子不存在，或房间已经开始'; end if;
end;
$$;

create or replace function public.admin_delete_tile_image(p_image_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception '只有管理员可以删除图片'; end if;
  perform 1 from public.room_tile_images where id = p_image_id for update;
  if not found then raise exception '公共图片不存在'; end if;
  update public.room_tiles set image_id = null, image_url = null where image_id = p_image_id;
  delete from public.room_tile_images where id = p_image_id;
end;
$$;

revoke all on function public.admin_update_tile_position(uuid, numeric, numeric) from public;
revoke all on function public.admin_add_room_tiles_around(uuid, numeric, numeric) from public;
revoke all on function public.admin_create_tile_image(uuid, text, text, text, integer, integer, integer, text) from public;
revoke all on function public.admin_set_tile_image(uuid, uuid) from public;
revoke all on function public.admin_delete_tile_image(uuid) from public;
grant execute on function public.admin_update_tile_position(uuid, numeric, numeric) to authenticated;
grant execute on function public.admin_add_room_tiles_around(uuid, numeric, numeric) to authenticated;
grant execute on function public.admin_create_tile_image(uuid, text, text, text, integer, integer, integer, text) to authenticated;
grant execute on function public.admin_set_tile_image(uuid, uuid) to authenticated;
grant execute on function public.admin_delete_tile_image(uuid) to authenticated;

do $$
begin
  begin alter publication supabase_realtime add table public.room_tile_images;
  exception when duplicate_object then null;
  end;
end $$;

-- Complete room configuration bundles and administrator-owned reusable favorites.
create table if not exists public.room_config_favorites (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  config jsonb not null check (jsonb_typeof(config) = 'object'),
  created_at timestamptz not null default now()
);

create index if not exists room_config_favorites_owner_created_idx
  on public.room_config_favorites(owner_user_id, created_at desc);

alter table public.room_config_favorites enable row level security;
drop policy if exists "admins read own room config favorites" on public.room_config_favorites;
create policy "admins read own room config favorites" on public.room_config_favorites
  for select to authenticated using (owner_user_id = auth.uid() and public.is_admin());
drop policy if exists "admins create own room config favorites" on public.room_config_favorites;
create policy "admins create own room config favorites" on public.room_config_favorites
  for insert to authenticated with check (owner_user_id = auth.uid() and public.is_admin());
drop policy if exists "admins delete own room config favorites" on public.room_config_favorites;
create policy "admins delete own room config favorites" on public.room_config_favorites
  for delete to authenticated using (owner_user_id = auth.uid() and public.is_admin());

revoke all on table public.room_config_favorites from public;
grant select, insert, delete on table public.room_config_favorites to authenticated;

create or replace function public.admin_import_complete_room_config(p_room_id uuid, p_config jsonb)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception '只有管理员可以导入完整房间配置'; end if;
  perform public.admin_import_room_config(p_room_id, p_config);
  perform public.admin_import_room_graph(p_room_id, p_config);
end;
$$;

revoke all on function public.admin_import_complete_room_config(uuid, jsonb) from public;
grant execute on function public.admin_import_complete_room_config(uuid, jsonb) to authenticated;

-- Global player-entry hero copy, editable by administrators and readable by all visitors.
create table if not exists public.site_content (
  id text primary key check (id = 'global'),
  hero_eyebrow text not null default '趣味单 01 · 大富翁',
  hero_title_primary text not null default '大富翁',
  hero_title_accent text not null default '护航协议局。',
  hero_subtitle text not null default '多轮随机棋盘逐步扩张，每个房间都有不同的移动、回合和护航规则。',
  stat_rounds_value text not null default '3',
  stat_rounds_label text not null default '轮推演',
  stat_board_value text not null default '8/12/24',
  stat_board_label text not null default '格棋盘',
  stat_players_value text not null default '3',
  stat_players_label text not null default '人上限',
  updated_at timestamptz not null default now()
);

insert into public.site_content (id)
values ('global')
on conflict (id) do nothing;

alter table public.site_content enable row level security;
drop policy if exists "any visitor can read global site content" on public.site_content;
create policy "any visitor can read global site content" on public.site_content
  for select to anon, authenticated using (id = 'global');

revoke all on table public.site_content from public;
grant select on table public.site_content to anon, authenticated;

create or replace function public.admin_update_site_content(p_content jsonb)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception '只有管理员可以修改首页文案'; end if;
  if jsonb_typeof(p_content) <> 'object' then raise exception '首页文案格式无效'; end if;

  insert into public.site_content (
    id, hero_eyebrow, hero_title_primary, hero_title_accent, hero_subtitle,
    stat_rounds_value, stat_rounds_label, stat_board_value, stat_board_label,
    stat_players_value, stat_players_label, updated_at
  ) values (
    'global',
    left(coalesce(p_content ->> 'hero_eyebrow', ''), 80),
    left(coalesce(p_content ->> 'hero_title_primary', ''), 80),
    left(coalesce(p_content ->> 'hero_title_accent', ''), 80),
    left(coalesce(p_content ->> 'hero_subtitle', ''), 80),
    left(coalesce(p_content ->> 'stat_rounds_value', ''), 80),
    left(coalesce(p_content ->> 'stat_rounds_label', ''), 80),
    left(coalesce(p_content ->> 'stat_board_value', ''), 80),
    left(coalesce(p_content ->> 'stat_board_label', ''), 80),
    left(coalesce(p_content ->> 'stat_players_value', ''), 80),
    left(coalesce(p_content ->> 'stat_players_label', ''), 80),
    now()
  )
  on conflict (id) do update set
    hero_eyebrow = excluded.hero_eyebrow,
    hero_title_primary = excluded.hero_title_primary,
    hero_title_accent = excluded.hero_title_accent,
    hero_subtitle = excluded.hero_subtitle,
    stat_rounds_value = excluded.stat_rounds_value,
    stat_rounds_label = excluded.stat_rounds_label,
    stat_board_value = excluded.stat_board_value,
    stat_board_label = excluded.stat_board_label,
    stat_players_value = excluded.stat_players_value,
    stat_players_label = excluded.stat_players_label,
    updated_at = now();
end;
$$;

revoke all on function public.admin_update_site_content(jsonb) from public;
grant execute on function public.admin_update_site_content(jsonb) to authenticated;

do $$
begin
  begin alter publication supabase_realtime add table public.site_content;
  exception when duplicate_object then null;
  end;
end $$;

select pg_notify('pgrst', 'reload schema');
