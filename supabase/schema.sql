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
  created_at timestamptz not null default now()
);

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
create index if not exists room_tiles_room_round_idx on public.room_tiles(room_id, round_number, position);

alter table public.rooms enable row level security;
alter table public.room_players enable row level security;
alter table public.game_events enable row level security;
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
      insert into public.game_events(room_id, message)
      values (p_room_id, '所有玩家都没有可用骰子，等待管理员补充');
      return;
    end if;
  end loop;

  update public.rooms set current_turn = null, rolls_remaining = 0 where id = p_room_id;
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
  insert into public.game_events(room_id, message)
  values (p_room_id, v_player.nickname || ' 掷出 ' || v_dice || '，落到「' || v_tile.name || '」：' || v_tile.detail);
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
end $$;

-- 创建管理员：先在 Authentication > Users 创建邮箱账号，再把邮箱替换为真实值执行。
-- insert into public.app_admins(user_id)
-- select id from auth.users where email = 'admin@example.com'
-- on conflict (user_id) do nothing;
