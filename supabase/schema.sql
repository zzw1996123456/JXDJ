-- 景序电竞三角洲趣味：随机规则三轮大富翁
-- 在 Supabase Dashboard > SQL Editor 中完整执行本文件。

create extension if not exists pgcrypto;

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (char_length(code) = 6),
  host_user_id uuid not null,
  status text not null default 'lobby' check (status in ('lobby', 'playing', 'finished')),
  current_turn uuid,
  winner_id uuid,
  board_size integer not null default 8,
  target_laps integer not null default 3,
  current_round integer not null default 1 check (current_round between 1 and 3),
  round1_advance_chance integer not null default 35 check (round1_advance_chance between 0 and 100),
  round2_advance_chance integer not null default 30 check (round2_advance_chance between 0 and 100),
  starting_player_id uuid,
  rolls_per_turn integer not null default 1 check (rolls_per_turn between 1 and 5),
  rolls_remaining integer not null default 1 check (rolls_remaining between 0 and 6),
  created_at timestamptz not null default now()
);

alter table public.rooms add column if not exists current_round integer not null default 1;
alter table public.rooms add column if not exists round1_advance_chance integer not null default 35;
alter table public.rooms add column if not exists round2_advance_chance integer not null default 30;
alter table public.rooms add column if not exists starting_player_id uuid;
alter table public.rooms add column if not exists rolls_per_turn integer not null default 1;
alter table public.rooms add column if not exists rolls_remaining integer not null default 1;
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
  coins integer not null default 100,
  is_ready boolean not null default false,
  turn_order integer not null,
  skip_turns integer not null default 0,
  next_roll_modifier integer not null default 0,
  created_at timestamptz not null default now(),
  unique (room_id, user_id),
  unique (room_id, turn_order)
);

alter table public.room_players add column if not exists skip_turns integer not null default 0;
alter table public.room_players add column if not exists next_roll_modifier integer not null default 0;
alter table public.room_players alter column coins set default 100;

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
  rule_group text not null check (rule_group in ('empty', 'contract', 'movement', 'turn', 'dice', 'advance', 'finish')),
  name text not null,
  short_name text not null,
  tile_type text not null check (tile_type in ('shared', 'boss', 'runner', 'empty', 'move', 'chance')),
  detail text not null,
  effect_type text not null check (effect_type in ('none', 'coins', 'move', 'skip', 'extra_roll', 'lose_roll', 'advance_round', 'finish')),
  effect_value integer not null default 0,
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
  effect_type text not null check (effect_type in ('none', 'coins', 'move', 'skip', 'extra_roll', 'lose_roll', 'advance_round', 'finish')),
  effect_value integer not null default 0,
  created_at timestamptz not null default now(),
  unique (room_id, round_number, position)
);

-- 每轮拥有独立规则池；创建房间时只会从对应轮次抽取。
insert into public.tile_rule_templates
  (round_number, rule_group, name, short_name, tile_type, detail, effect_type, effect_value)
values
  (1,'empty','空格','空格','empty','平安经过，本格不触发额外效果','none',0),
  (1,'contract','基础保底','基础保底','boss','本单保障值增加 20','coins',20),
  (1,'contract','轻装试跑','轻装试跑','runner','下一局采用轻装稳健路线','none',0),
  (1,'contract','物资口令','物资口令','boss','老板指定一类优先搜索物资','none',0),
  (1,'contract','全队整备','全队整备','shared','确认预算和禁用项，保障值增加 5','coins',5),
  (1,'contract','补给优惠','补给优惠','runner','基础装备预算获得补贴，保障值增加 10','coins',10),
  (1,'contract','风险加注','风险加注','boss','本轮提高任务要求，保障值减少 10','coins',-10),
  (1,'movement','抢占先机','前进 1 格','move','抢先完成准备，立即前进 1 格','move',1),
  (1,'movement','安全捷径','前进 2 格','move','发现安全捷径，立即前进 2 格','move',2),
  (1,'movement','路口折返','后退 1 格','chance','路线判断失误，立即后退 1 格','move',-1),
  (1,'movement','情报误导','后退 2 格','chance','遭遇错误情报，立即后退 2 格','move',-2),
  (1,'turn','烟雾封路','暂停 1 次','chance','前路被封锁，跳过下一次行动','skip',1),
  (1,'turn','临时整备','整备 1 次','shared','留在原地完成整备，跳过下一次行动','skip',1),
  (1,'dice','乘胜追击','额外 1 次','chance','本回合立即增加 1 次掷骰机会','extra_roll',1),
  (1,'dice','弹药清点','少摇 1 次','chance','下个自己的回合减少 1 次掷骰','lose_roll',1),
  (1,'advance','快速通关','直达二轮','chance','触发快速通关，队伍直接进入第二轮','advance_round',0),
  (1,'advance','紧急转场','紧急晋级','shared','收到紧急转场指令，队伍直接进入第二轮','advance_round',0),

  (2,'empty','空格','空格','empty','平安经过，本格不触发额外效果','none',0),
  (2,'contract','红品加码','红品加码','boss','带出红色物资时保障值增加 30','coins',30),
  (2,'contract','携行保障','携行保障','boss','为老板预留携行空间，保障值增加 15','coins',15),
  (2,'contract','稳健打法','稳健打法','runner','本局不主动追击非任务目标','none',0),
  (2,'contract','遭遇绕行','遭遇绕行','runner','允许避开一次高风险交战','none',0),
  (2,'contract','路线改判','路线改判','shared','全队可改判一次已确定的路线','none',0),
  (2,'contract','超时补偿','超时补偿','runner','行动超时后保障值增加 15','coins',15),
  (2,'contract','交战限制','交战限制','runner','禁用一种高风险打法','none',0),
  (2,'contract','预算升级','预算升级','boss','装备预算升级，保障值增加 25','coins',25),
  (2,'movement','线索捷径','前进 1 格','move','发现可靠线索，立即前进 1 格','move',1),
  (2,'movement','快速搜点','前进 2 格','move','搜索效率提升，立即前进 2 格','move',2),
  (2,'movement','秘密通道','前进 3 格','move','发现秘密通道，立即前进 3 格','move',3),
  (2,'movement','临时返仓','后退 1 格','chance','装备不足需要返仓，立即后退 1 格','move',-1),
  (2,'movement','路线封锁','后退 2 格','chance','主路线被封锁，立即后退 2 格','move',-2),
  (2,'movement','遭遇伏击','后退 3 格','chance','遭遇伏击被迫撤回，立即后退 3 格','move',-3),
  (2,'turn','等待情报','暂停 1 次','chance','等待情报确认，跳过下一次行动','skip',1),
  (2,'turn','受伤治疗','暂停 2 次','chance','需要治疗整备，跳过接下来 2 次行动','skip',2),
  (2,'turn','隐蔽观察','隐蔽 1 次','shared','原地观察敌情，跳过下一次行动','skip',1),
  (2,'dice','连续推进','额外 1 次','chance','本回合立即增加 1 次掷骰机会','extra_roll',1),
  (2,'dice','双线行动','额外 2 次','chance','本回合立即增加 2 次掷骰机会','extra_roll',2),
  (2,'dice','负重整理','少摇 1 次','chance','下个自己的回合减少 1 次掷骰','lose_roll',1),
  (2,'dice','通讯干扰','少摇 2 次','chance','下个自己的回合减少 2 次掷骰','lose_roll',2),
  (2,'advance','核心情报','直达三轮','chance','取得核心情报，队伍直接进入第三轮','advance_round',0),
  (2,'advance','提前撤转','提前晋级','shared','满足撤转条件，队伍直接进入第三轮','advance_round',0),
  (2,'advance','任务跳级','任务跳级','boss','完成隐藏目标，队伍直接进入第三轮','advance_round',0),

  (3,'empty','空格','空格','empty','平安经过，本格不触发额外效果','none',0),
  (3,'contract','终局保底','终局保底','boss','最终阶段保障值增加 40','coins',40),
  (3,'contract','安全撤离','安全撤离','boss','老板安全撤离时保障值增加 25','coins',25),
  (3,'contract','核心搜索','核心搜索','boss','完成两个核心区域搜索点','none',0),
  (3,'contract','物资优先','物资优先','boss','目标物资优先完成交付','none',0),
  (3,'contract','战术改判','战术改判','runner','打手可改判一次路线或打法','none',0),
  (3,'contract','连败补偿','连败补偿','runner','连续失败后保障值增加 30','coins',30),
  (3,'contract','强制撤离','强制撤离','shared','出现安全窗口后全队必须转点撤离','none',0),
  (3,'contract','禁用清单','禁用清单','shared','本局追加一项高风险行为禁令','none',0),
  (3,'contract','高额悬赏','高额悬赏','boss','完成追加目标，保障值增加 50','coins',50),
  (3,'contract','装备损耗','装备损耗','chance','装备损耗导致保障值减少 20','coins',-20),
  (3,'contract','保险生效','保险生效','shared','护航保险生效，保障值增加 20','coins',20),
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
  (3,'dice','补给空投','额外 1 次','chance','获得补给空投，本回合增加 1 次掷骰','extra_roll',1),
  (3,'dice','战术连携','额外 2 次','shared','触发战术连携，本回合增加 2 次掷骰','extra_roll',2),
  (3,'dice','信号延迟','少摇 1 次','chance','下个自己的回合减少 1 次掷骰','lose_roll',1),
  (3,'dice','装备超重','少摇 2 次','chance','下个自己的回合减少 2 次掷骰','lose_roll',2),
  (3,'dice','最后冲刺','额外 1 次','move','进入最后冲刺，本回合增加 1 次掷骰','extra_roll',1),
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
  v_groups text[];
  v_template public.tile_rule_templates%rowtype;
begin
  delete from public.room_tiles where room_id = p_room_id;

  for v_round in 1..3 loop
    v_groups := case v_round
      when 1 then array['empty','empty','contract','movement','movement','turn','dice','advance']
      when 2 then array['empty','empty','contract','contract','movement','movement','movement','turn','turn','dice','dice','advance']
      else array['empty','empty','empty','empty','contract','contract','contract','contract','contract','movement','movement','movement','movement','movement','movement','turn','turn','turn','dice','dice','dice','dice','dice']
    end;
    v_position := 0;

    for v_group in select item from unnest(v_groups) as item order by random() loop
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

create or replace function public.admin_create_room()
returns table(room_id uuid, room_code text)
language plpgsql security definer set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_room_id uuid;
  v_code text;
begin
  if v_user_id is null or not public.is_admin() then raise exception '只有管理员可以创建房间'; end if;
  loop
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    exit when not exists (select 1 from public.rooms where code = v_code);
  end loop;
  insert into public.rooms(code, host_user_id, board_size, target_laps, current_round)
  values (v_code, v_user_id, 8, 3, 1) returning id into v_room_id;
  perform public.generate_room_board_internal(v_room_id);
  insert into public.game_events(room_id, message) values (v_room_id, '管理员创建房间并生成了三轮随机棋盘');
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
  v_turn_order integer;
begin
  if v_user_id is null then raise exception '请先建立玩家身份'; end if;
  if char_length(trim(p_nickname)) not between 2 and 12 then raise exception '昵称需要 2 到 12 个字符'; end if;
  if p_role not in ('boss', 'runner') then raise exception '玩家身份无效'; end if;
  select * into v_room from public.rooms where code = upper(trim(p_code)) for update;
  if not found then raise exception '房间不存在，请检查房间码'; end if;
  if v_room.status <> 'lobby' then raise exception '该房间已经开始行动'; end if;

  if exists (select 1 from public.room_players where room_id = v_room.id and user_id = v_user_id) then
    if p_role = 'boss' and exists (
      select 1 from public.room_players where room_id = v_room.id and role = 'boss' and user_id <> v_user_id
    ) then raise exception '老板席已经有人了'; end if;
    if p_role = 'runner' and (
      select count(*) from public.room_players where room_id = v_room.id and role = 'runner' and user_id <> v_user_id
    ) >= 2 then raise exception '两个打手席已经满了'; end if;
    update public.room_players set nickname = trim(p_nickname), role = p_role
    where room_id = v_room.id and user_id = v_user_id;
  else
    if (select count(*) from public.room_players where room_id = v_room.id) >= 3 then raise exception '房间人数已满'; end if;
    if p_role = 'boss' and exists (
      select 1 from public.room_players where room_id = v_room.id and role = 'boss'
    ) then raise exception '老板席已经有人了'; end if;
    if p_role = 'runner' and (
      select count(*) from public.room_players where room_id = v_room.id and role = 'runner'
    ) >= 2 then raise exception '两个打手席已经满了'; end if;
    select coalesce(max(turn_order), -1) + 1 into v_turn_order from public.room_players where room_id = v_room.id;
    insert into public.room_players(room_id, user_id, nickname, role, turn_order, coins)
    values (v_room.id, v_user_id, trim(p_nickname), p_role, v_turn_order, 100);
    insert into public.game_events(room_id, message)
    values (v_room.id, trim(p_nickname) || ' 以' || case when p_role = 'boss' then '老板' else '打手' end || '身份加入房间');
  end if;
  return query select v_room.id, v_room.code;
end;
$$;

create or replace function public.set_ready(p_room_id uuid, p_ready boolean)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (select 1 from public.rooms where id = p_room_id and status = 'lobby') then raise exception '当前不能修改准备状态'; end if;
  update public.room_players set is_ready = p_ready where room_id = p_room_id and user_id = auth.uid();
  if not found then raise exception '你不在该房间中'; end if;
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

create or replace function public.admin_update_room_settings(
  p_room_id uuid, p_starting_player_id uuid, p_rolls_per_turn integer
)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception '只有管理员可以修改回合设置'; end if;
  if p_rolls_per_turn not between 1 and 5 then raise exception '每回合掷骰次数必须在 1 到 5 之间'; end if;
  if p_starting_player_id is not null and not exists (
    select 1 from public.room_players where room_id = p_room_id and user_id = p_starting_player_id
  ) then raise exception '首位玩家不在当前房间'; end if;
  update public.rooms set starting_player_id = p_starting_player_id, rolls_per_turn = p_rolls_per_turn,
    rolls_remaining = p_rolls_per_turn
  where id = p_room_id and status = 'lobby';
  if not found then raise exception '只能在开局前修改回合设置'; end if;
  insert into public.game_events(room_id, message) values (p_room_id, '管理员更新了首位玩家和每回合掷骰次数');
end;
$$;

create or replace function public.admin_update_room_tile(
  p_tile_id uuid, p_name text, p_short_name text, p_tile_type text,
  p_detail text, p_effect_type text, p_effect_value integer
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_tile public.room_tiles%rowtype;
  v_move_limit integer;
  v_skip_limit integer;
begin
  if not public.is_admin() then raise exception '只有管理员可以编辑棋盘'; end if;
  select rt.* into v_tile from public.room_tiles rt join public.rooms r on r.id = rt.room_id
  where rt.id = p_tile_id and r.status = 'lobby' for update of rt;
  if not found then raise exception '格子不存在，或房间已经开始'; end if;
  if char_length(trim(p_name)) not between 1 and 40 then raise exception '完整名称需要 1 到 40 个字符'; end if;
  if char_length(trim(p_short_name)) not between 1 and 16 then raise exception '棋盘短名需要 1 到 16 个字符'; end if;
  if char_length(trim(p_detail)) not between 1 and 160 then raise exception '落格说明需要 1 到 160 个字符'; end if;
  if p_tile_type not in ('shared','boss','runner','empty','move','chance') then raise exception '格子分类无效'; end if;
  if p_effect_type not in ('none','coins','move','skip','extra_roll','lose_roll','advance_round','finish') then raise exception '格子效果无效'; end if;
  if p_tile_type = 'empty' and (p_effect_type <> 'none' or p_effect_value <> 0) then raise exception '空格不能附带效果'; end if;
  if p_effect_type in ('none','advance_round','finish') and p_effect_value <> 0 then raise exception '该效果的数值必须为 0'; end if;
  if p_effect_type = 'advance_round' and v_tile.round_number = 3 then raise exception '第三轮不能配置直接晋级'; end if;
  if p_effect_type = 'finish' and v_tile.round_number <> 3 then raise exception '结束本局只能配置在第三轮'; end if;
  v_move_limit := case v_tile.round_number when 1 then 2 when 2 then 3 else 5 end;
  v_skip_limit := case v_tile.round_number when 1 then 1 else 2 end;
  if p_effect_type = 'move' and (p_effect_value = 0 or abs(p_effect_value) > v_move_limit) then raise exception '本轮移动格数超出允许范围'; end if;
  if p_effect_type = 'skip' and p_effect_value not between 1 and v_skip_limit then raise exception '本轮暂停次数超出允许范围'; end if;
  if p_effect_type in ('extra_roll','lose_roll') and p_effect_value not between 1 and 2 then raise exception '掷骰次数效果必须在 1 到 2 之间'; end if;
  if p_effect_type = 'coins' and p_effect_value not between -100 and 100 then raise exception '保障值变化必须在 -100 到 100 之间'; end if;
  if v_tile.tile_type = 'empty' and p_tile_type <> 'empty' and (
    select count(*) from public.room_tiles where room_id = v_tile.room_id and round_number = v_tile.round_number and tile_type = 'empty'
  ) <= 1 then raise exception '每轮至少保留一个空格'; end if;
  if v_tile.effect_type = 'finish' and p_effect_type <> 'finish' and (
    select count(*) from public.room_tiles where room_id = v_tile.room_id and round_number = 3 and effect_type = 'finish'
  ) <= 1 then raise exception '第三轮至少保留一个结束格'; end if;

  update public.room_tiles set template_id = null, name = trim(p_name), short_name = trim(p_short_name),
    tile_type = p_tile_type, detail = trim(p_detail), effect_type = p_effect_type, effect_value = p_effect_value
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
  v_first_user uuid;
  v_first_name text;
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

  select p.user_id, p.nickname into v_first_user, v_first_name
  from public.room_players p join public.rooms r on r.id = p.room_id
  where p.room_id = p_room_id and p.user_id = r.starting_player_id limit 1;
  if v_first_user is null then
    select user_id, nickname into v_first_user, v_first_name from public.room_players
    where room_id = p_room_id order by turn_order limit 1;
  end if;
  select rolls_per_turn into v_rolls from public.rooms where id = p_room_id;
  update public.rooms set status = 'playing', current_turn = v_first_user, current_round = 1,
    board_size = 8, winner_id = null, rolls_remaining = v_rolls where id = p_room_id;
  update public.room_players set position = 0, distance = 0, coins = 100, skip_turns = 0, next_roll_modifier = 0
  where room_id = p_room_id;
  insert into public.game_events(room_id, message)
  values (p_room_id, '本局开始，' || v_first_name || ' 先行动，每回合可掷 ' || v_rolls || ' 次');
end;
$$;

create or replace function public.admin_finish_room(p_room_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception '只有管理员可以结束房间'; end if;
  update public.rooms set status = 'finished', current_turn = null, rolls_remaining = 0
  where id = p_room_id and status = 'playing';
  if not found then raise exception '该房间当前不在进行中'; end if;
  insert into public.game_events(room_id, message) values (p_room_id, '管理员手动结束了本局');
end;
$$;

create or replace function public.leave_room(p_room_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_room public.rooms%rowtype;
  v_player public.room_players%rowtype;
  v_next public.room_players%rowtype;
  v_next_rolls integer;
begin
  select * into v_room from public.rooms where id = p_room_id for update;
  if not found then return; end if;
  select * into v_player from public.room_players where room_id = p_room_id and user_id = auth.uid();
  if not found then return; end if;
  delete from public.room_players where id = v_player.id;
  if v_room.starting_player_id = v_player.user_id then
    update public.rooms set starting_player_id = null where id = p_room_id;
  end if;
  if v_room.status = 'playing' and v_room.current_turn = auth.uid() then
    select * into v_next from public.room_players where room_id = p_room_id and turn_order > v_player.turn_order order by turn_order limit 1;
    if not found then select * into v_next from public.room_players where room_id = p_room_id order by turn_order limit 1; end if;
    if v_next.id is null then
      update public.rooms set status = 'finished', current_turn = null, rolls_remaining = 0 where id = p_room_id;
    else
      v_next_rolls := greatest(1, least(6, v_room.rolls_per_turn + v_next.next_roll_modifier));
      update public.room_players set next_roll_modifier = 0 where id = v_next.id;
      update public.rooms set current_turn = v_next.user_id, rolls_remaining = v_next_rolls where id = p_room_id;
    end if;
  end if;
  insert into public.game_events(room_id, message) values (p_room_id, v_player.nickname || ' 离开了房间');
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
  v_candidate public.room_players%rowtype;
  v_dice integer;
  v_landed integer;
  v_position integer;
  v_distance integer;
  v_change integer := 0;
  v_remaining integer;
  v_skip integer;
  v_modifier integer;
  v_chance integer;
  v_advanced boolean := false;
  v_finished boolean := false;
  v_next_round integer;
  v_next_size integer;
  v_player_count integer;
  v_order integer;
  v_step integer;
  v_next_rolls integer;
  v_next_found boolean := false;
begin
  select * into v_room from public.rooms where id = p_room_id for update;
  if not found or v_room.status <> 'playing' then raise exception '当前没有进行中的行动'; end if;
  if v_room.current_turn <> auth.uid() then raise exception '还没有轮到你'; end if;
  if v_room.rolls_remaining <= 0 then raise exception '当前没有剩余掷骰次数'; end if;
  select * into v_player from public.room_players where room_id = p_room_id and user_id = auth.uid() for update;
  if not found then raise exception '你不在该房间中'; end if;

  v_dice := floor(random() * 6 + 1)::integer;
  v_landed := mod(v_player.position + v_dice, v_room.board_size);
  v_position := v_landed;
  v_distance := v_player.distance + v_dice;
  v_remaining := greatest(0, v_room.rolls_remaining - 1);
  v_skip := v_player.skip_turns;
  v_modifier := v_player.next_roll_modifier;
  select * into v_tile from public.room_tiles
  where room_id = p_room_id and round_number = v_room.current_round and position = v_landed;
  if not found then raise exception '当前棋盘配置不完整'; end if;

  if v_tile.effect_type = 'coins' then v_change := v_tile.effect_value; end if;
  if v_tile.effect_type = 'move' then
    v_position := mod(mod(v_position + v_tile.effect_value, v_room.board_size) + v_room.board_size, v_room.board_size);
    v_distance := greatest(0, v_distance + v_tile.effect_value);
  end if;
  if v_tile.effect_type = 'skip' then v_skip := least(3, v_skip + v_tile.effect_value); end if;
  if v_tile.effect_type = 'extra_roll' then v_remaining := least(6, v_remaining + v_tile.effect_value); end if;
  if v_tile.effect_type = 'lose_roll' then v_modifier := greatest(-4, v_modifier - v_tile.effect_value); end if;
  if v_tile.effect_type = 'advance_round' and v_room.current_round < 3 then v_advanced := true; end if;
  if v_tile.effect_type = 'finish' and v_room.current_round = 3 then v_finished := true; end if;

  update public.room_players set position = v_position, distance = v_distance,
    coins = greatest(0, coins + v_change), skip_turns = v_skip, next_roll_modifier = v_modifier
  where id = v_player.id;
  insert into public.game_events(room_id, message)
  values (p_room_id, v_player.nickname || ' 掷出 ' || v_dice || '，落到「' || v_tile.name || '」：' || v_tile.detail);
  if v_tile.effect_type = 'move' then
    insert into public.game_events(room_id, message)
    values (p_room_id, v_player.nickname || case when v_tile.effect_value > 0 then ' 前进 ' else ' 后退 ' end || abs(v_tile.effect_value) || ' 格，到达第 ' || (v_position + 1) || ' 格');
  end if;

  if not v_advanced and v_room.current_round < 3 then
    v_chance := case when v_room.current_round = 1 then v_room.round1_advance_chance else v_room.round2_advance_chance end;
    v_advanced := floor(random() * 100)::integer < v_chance;
  end if;

  if v_finished then
    update public.rooms set status = 'finished', winner_id = auth.uid(), current_turn = null, rolls_remaining = 0 where id = p_room_id;
    insert into public.game_events(room_id, message) values (p_room_id, v_player.nickname || ' 完成最终结算，本局结束');
  else
    if v_advanced then
      v_next_round := v_room.current_round + 1;
      v_next_size := case when v_next_round = 2 then 12 else 24 end;
      update public.rooms set current_round = v_next_round, board_size = v_next_size where id = p_room_id;
      update public.room_players set position = 0 where room_id = p_room_id;
      insert into public.game_events(room_id, message)
      values (p_room_id, '队伍进入第' || case when v_next_round = 2 then '二' else '三' end || '轮 ' || v_next_size || ' 格棋盘');
    end if;

    if v_remaining > 0 then
      update public.rooms set rolls_remaining = v_remaining where id = p_room_id;
    else
      select count(*) into v_player_count from public.room_players where room_id = p_room_id;
      v_order := v_player.turn_order;
      for v_step in 1..greatest(v_player_count * 4, 4) loop
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
          v_next_rolls := greatest(1, least(6, v_room.rolls_per_turn + v_candidate.next_roll_modifier));
          update public.room_players set next_roll_modifier = 0 where id = v_candidate.id;
          update public.rooms set current_turn = v_candidate.user_id, rolls_remaining = v_next_rolls where id = p_room_id;
          v_next_found := true;
          exit;
        end if;
      end loop;
      if not v_next_found then raise exception '无法确定下一位行动玩家'; end if;
    end if;
  end if;

  return query select v_dice, v_position, v_change, v_finished;
end;
$$;

revoke all on function public.admin_create_room() from public;
revoke all on function public.admin_randomize_room_board(uuid) from public;
revoke all on function public.join_room(text, text, text) from public;
revoke all on function public.set_ready(uuid, boolean) from public;
revoke all on function public.admin_update_round_chances(uuid, integer, integer) from public;
revoke all on function public.admin_update_room_settings(uuid, uuid, integer) from public;
revoke all on function public.admin_update_room_tile(uuid, text, text, text, text, text, integer) from public;
revoke all on function public.admin_start_game(uuid) from public;
revoke all on function public.admin_finish_room(uuid) from public;
revoke all on function public.leave_room(uuid) from public;
revoke all on function public.roll_dice(uuid) from public;

grant execute on function public.admin_create_room() to authenticated;
grant execute on function public.admin_randomize_room_board(uuid) to authenticated;
grant execute on function public.join_room(text, text, text) to authenticated;
grant execute on function public.set_ready(uuid, boolean) to authenticated;
grant execute on function public.admin_update_round_chances(uuid, integer, integer) to authenticated;
grant execute on function public.admin_update_room_settings(uuid, uuid, integer) to authenticated;
grant execute on function public.admin_update_room_tile(uuid, text, text, text, text, text, integer) to authenticated;
grant execute on function public.admin_start_game(uuid) to authenticated;
grant execute on function public.admin_finish_room(uuid) to authenticated;
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
