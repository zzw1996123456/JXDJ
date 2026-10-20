-- 景序电竞三角洲趣味：三轮护航大富翁
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
  created_at timestamptz not null default now()
);

-- Existing projects can rerun this file without recreating their tables.
alter table public.rooms add column if not exists current_round integer not null default 1;
alter table public.rooms add column if not exists round1_advance_chance integer not null default 35;
alter table public.rooms add column if not exists round2_advance_chance integer not null default 30;
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
  created_at timestamptz not null default now(),
  unique (room_id, user_id),
  unique (room_id, turn_order)
);

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

-- Create the administrator in Authentication > Users first, then run this once
-- with the real email address:
-- insert into public.app_admins(user_id)
-- select id from auth.users where email = 'admin@example.com'
-- on conflict (user_id) do nothing;

create index if not exists room_players_room_id_idx on public.room_players(room_id);
create index if not exists game_events_room_id_created_at_idx on public.game_events(room_id, created_at desc);

alter table public.rooms enable row level security;
alter table public.room_players enable row level security;
alter table public.game_events enable row level security;
alter table public.app_admins enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.app_admins where user_id = auth.uid()
  );
$$;

create or replace function public.is_room_member(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.room_players
    where room_id = p_room_id and user_id = auth.uid()
  );
$$;

revoke all on function public.is_admin() from public;
revoke all on function public.is_room_member(uuid) from public;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_room_member(uuid) to authenticated;

drop policy if exists "room members can read rooms" on public.rooms;
create policy "room members can read rooms"
on public.rooms for select to authenticated
using (public.is_room_member(id));

drop policy if exists "admins can read rooms" on public.rooms;
create policy "admins can read rooms"
on public.rooms for select to authenticated
using (public.is_admin());

drop policy if exists "room members can read players" on public.room_players;
create policy "room members can read players"
on public.room_players for select to authenticated
using (public.is_room_member(room_id));

drop policy if exists "admins can read players" on public.room_players;
create policy "admins can read players"
on public.room_players for select to authenticated
using (public.is_admin());

drop policy if exists "room members can read events" on public.game_events;
create policy "room members can read events"
on public.game_events for select to authenticated
using (public.is_room_member(room_id));

drop policy if exists "admins can read events" on public.game_events;
create policy "admins can read events"
on public.game_events for select to authenticated
using (public.is_admin());

drop policy if exists "admins can read own grant" on public.app_admins;
create policy "admins can read own grant"
on public.app_admins for select to authenticated
using (user_id = auth.uid());

-- Remove the old player-facing room creation and start functions.
drop function if exists public.create_room(text, text);
drop function if exists public.start_game(uuid);

create or replace function public.admin_create_room()
returns table(room_id uuid, room_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_room_id uuid;
  v_code text;
begin
  if v_user_id is null or not public.is_admin() then
    raise exception '只有管理员可以创建房间';
  end if;

  loop
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    exit when not exists (select 1 from public.rooms where code = v_code);
  end loop;

  insert into public.rooms(code, host_user_id, board_size, target_laps, current_round)
  values (v_code, v_user_id, 8, 3, 1)
  returning id into v_room_id;

  insert into public.game_events(room_id, message)
  values (v_room_id, '管理员创建了房间，等待玩家加入');

  return query select v_room_id, v_code;
end;
$$;

create or replace function public.join_room(p_code text, p_nickname text, p_role text)
returns table(room_id uuid, room_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_room public.rooms%rowtype;
  v_turn_order integer;
begin
  if v_user_id is null then raise exception '请先建立玩家身份'; end if;
  if char_length(trim(p_nickname)) not between 2 and 12 then raise exception '昵称需要 2 到 12 个字符'; end if;
  if p_role not in ('boss', 'runner') then raise exception '玩家身份无效'; end if;

  select * into v_room from public.rooms
  where code = upper(trim(p_code)) for update;

  if not found then raise exception '房间不存在，请检查房间码'; end if;
  if v_room.status <> 'lobby' then raise exception '该房间已经开始行动'; end if;

  if exists (select 1 from public.room_players where room_id = v_room.id and user_id = v_user_id) then
    if p_role = 'boss' and exists (
      select 1 from public.room_players
      where room_id = v_room.id and role = 'boss' and user_id <> v_user_id
    ) then raise exception '老板席已经有人了'; end if;
    if p_role = 'runner' and (
      select count(*) from public.room_players
      where room_id = v_room.id and role = 'runner' and user_id <> v_user_id
    ) >= 2 then raise exception '两个打手席已经满了'; end if;

    update public.room_players
    set nickname = trim(p_nickname), role = p_role
    where room_id = v_room.id and user_id = v_user_id;
  else
    if (select count(*) from public.room_players where room_id = v_room.id) >= 3 then
      raise exception '房间人数已满';
    end if;
    if p_role = 'boss' and exists (
      select 1 from public.room_players where room_id = v_room.id and role = 'boss'
    ) then raise exception '老板席已经有人了'; end if;
    if p_role = 'runner' and (
      select count(*) from public.room_players where room_id = v_room.id and role = 'runner'
    ) >= 2 then raise exception '两个打手席已经满了'; end if;

    select coalesce(max(turn_order), -1) + 1 into v_turn_order
    from public.room_players where room_id = v_room.id;

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
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.rooms where id = p_room_id and status = 'lobby') then
    raise exception '当前不能修改准备状态';
  end if;

  update public.room_players set is_ready = p_ready
  where room_id = p_room_id and user_id = auth.uid();

  if not found then raise exception '你不在该房间中'; end if;
end;
$$;

create or replace function public.admin_update_round_chances(
  p_room_id uuid,
  p_round1_chance integer,
  p_round2_chance integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception '只有管理员可以修改晋级概率'; end if;
  if p_round1_chance not between 0 and 100 or p_round2_chance not between 0 and 100 then
    raise exception '晋级概率必须在 0 到 100 之间';
  end if;

  update public.rooms
  set round1_advance_chance = p_round1_chance,
      round2_advance_chance = p_round2_chance
  where id = p_room_id;

  if not found then raise exception '房间不存在'; end if;

  insert into public.game_events(room_id, message)
  values (p_room_id, '管理员将晋级概率设为：第一轮 ' || p_round1_chance || '%，第二轮 ' || p_round2_chance || '%');
end;
$$;

create or replace function public.admin_start_game(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_first_user uuid;
begin
  if not public.is_admin() then raise exception '只有管理员可以开始房间'; end if;

  perform 1 from public.rooms where id = p_room_id and status = 'lobby' for update;
  if not found then raise exception '房间不存在或已经开始'; end if;
  if exists (select 1 from public.room_players where room_id = p_room_id and not is_ready) then
    raise exception '还有玩家没有准备';
  end if;
  if (select count(*) from public.room_players where room_id = p_room_id) not between 2 and 3
    or (select count(*) from public.room_players where room_id = p_room_id and role = 'boss') <> 1
    or (select count(*) from public.room_players where room_id = p_room_id and role = 'runner') not between 1 and 2 then
    raise exception '需要 1 名老板和 1 至 2 名打手才能开始';
  end if;

  select user_id into v_first_user from public.room_players
  where room_id = p_room_id order by turn_order limit 1;

  update public.rooms
  set status = 'playing', current_turn = v_first_user, current_round = 1,
      board_size = 8, winner_id = null
  where id = p_room_id;

  update public.room_players set position = 0, distance = 0, coins = 100
  where room_id = p_room_id;

  insert into public.game_events(room_id, message)
  values (p_room_id, '管理员开始本局，进入第一轮 8 格棋盘');
end;
$$;

create or replace function public.admin_finish_room(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception '只有管理员可以结束房间'; end if;

  update public.rooms set status = 'finished', current_turn = null
  where id = p_room_id and status = 'playing';

  if not found then raise exception '该房间当前不在进行中'; end if;

  insert into public.game_events(room_id, message)
  values (p_room_id, '管理员手动结束了本局');
end;
$$;

create or replace function public.leave_room(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms%rowtype;
  v_player public.room_players%rowtype;
  v_next_user uuid;
begin
  select * into v_room from public.rooms where id = p_room_id for update;
  if not found then return; end if;

  select * into v_player from public.room_players
  where room_id = p_room_id and user_id = auth.uid();
  if not found then return; end if;

  delete from public.room_players where id = v_player.id;

  if v_room.status = 'playing' and v_room.current_turn = auth.uid() then
    select user_id into v_next_user from public.room_players
    where room_id = p_room_id and turn_order > v_player.turn_order
    order by turn_order limit 1;

    if v_next_user is null then
      select user_id into v_next_user from public.room_players
      where room_id = p_room_id order by turn_order limit 1;
    end if;

    update public.rooms set current_turn = v_next_user where id = p_room_id;
  end if;

  insert into public.game_events(room_id, message)
  values (p_room_id, v_player.nickname || ' 离开了房间');
end;
$$;

create or replace function public.roll_dice(p_room_id uuid)
returns table(dice_value integer, landed_position integer, coin_change integer, winner boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms%rowtype;
  v_player public.room_players%rowtype;
  v_dice integer;
  v_position integer;
  v_distance integer;
  v_change integer := 0;
  v_next_user uuid;
  v_tile_name text;
  v_tile_detail text;
  v_round_label text;
  v_chance integer;
  v_advanced boolean := false;
  v_finished boolean := false;
  v_next_round integer;
  v_next_size integer;
begin
  select * into v_room from public.rooms where id = p_room_id for update;
  if not found or v_room.status <> 'playing' then raise exception '当前没有进行中的行动'; end if;
  if v_room.current_turn <> auth.uid() then raise exception '还没有轮到你'; end if;

  select * into v_player from public.room_players
  where room_id = p_room_id and user_id = auth.uid() for update;
  if not found then raise exception '你不在该房间中'; end if;

  v_dice := floor(random() * 6 + 1)::integer;
  v_position := mod(v_player.position + v_dice, v_room.board_size);
  v_distance := v_player.distance + v_dice;
  v_round_label := case v_room.current_round when 1 then '第一轮' when 2 then '第二轮' else '第三轮' end;

  if v_room.current_round = 1 then
    v_tile_name := (array['空格','基础保底','装备档位','空格','行动地图','首次免赔','全队整备','空格'])[v_position + 1];
    v_tile_detail := (array['本次不增加条款','本单保障 +20','打手选择装备档位','本次不增加条款','老板选择行动地图','首次失败不扣保障','确认预算与禁用项','本次不增加条款'])[v_position + 1];
    v_change := (array[0,20,5,0,0,15,0,0])[v_position + 1];
  elsif v_room.current_round = 2 then
    v_tile_name := (array['空格','行动路线','稳健打法','空格','红装加码','遭遇绕行','中场复盘','空格','携行保障','超时补偿','撤离方式','空格'])[v_position + 1];
    v_tile_detail := (array['本次不增加条款','老板二选一行动路线','不追非任务目标','本次不增加条款','带出红品保障 +30','可避开 1 次高危交战','可调整 1 次已定规则','本次不增加条款','为老板预留 2 格','超时后保障 +15','常规或条件撤离','本次不增加条款'])[v_position + 1];
    v_change := (array[0,0,10,0,30,10,0,0,15,15,10,0])[v_position + 1];
  else
    v_tile_name := (array['空格','保底加码','装备档位','空格','指定路线','首次免赔','战前规则','撤离优先','稳健打法','红装加码','空格','携行保障','中场复盘','核心搜索','战术改判','空格','超时补偿','撤离方式','物资优先','交战限制','空格','连败补偿','安全撤离','协议结算'])[v_position + 1];
    v_tile_detail := (array['本次不增加条款','基础保障 +20','打手选择装备档位','本次不增加条款','老板二选一行动路线','首次失败不扣保障','确认预算与禁用项','有撤离窗口立即转点','不追非任务目标','带出红品保障 +30','本次不增加条款','为老板预留 2 格','可调整 1 次已定规则','完成 2 个核心搜索点','打手改判 1 次路线','本次不增加条款','超时后保障 +15','常规或条件撤离','目标物资优先归老板','禁用 1 种高风险打法','本次不增加条款','下局保障 +20','老板安全撤离保障 +25','落到此格完成本局'])[v_position + 1];
    v_change := (array[0,20,5,0,0,15,0,10,10,30,0,15,0,20,10,0,15,10,15,10,0,20,25,0])[v_position + 1];
  end if;

  update public.room_players
  set distance = v_distance, position = v_position, coins = greatest(0, coins + v_change)
  where id = v_player.id;

  insert into public.game_events(room_id, message)
  values (
    p_room_id,
    v_player.nickname || ' 在' || v_round_label || '掷出 ' || v_dice ||
    '，触发「' || v_tile_name || '」：' || v_tile_detail ||
    case when v_change = 0 then '' else '，保障值 +' || v_change end
  );

  if v_room.current_round = 3 and v_position = 23 then
    v_finished := true;
    update public.rooms
    set status = 'finished', winner_id = auth.uid(), current_turn = null
    where id = p_room_id;

    insert into public.game_events(room_id, message)
    values (p_room_id, v_player.nickname || ' 摇到协议结算格，本局结束');
  else
    if v_room.current_round < 3 then
      v_chance := case when v_room.current_round = 1 then v_room.round1_advance_chance else v_room.round2_advance_chance end;
      v_advanced := floor(random() * 100)::integer < v_chance;
    end if;

    if v_advanced then
      v_next_round := v_room.current_round + 1;
      v_next_size := case when v_next_round = 2 then 12 else 24 end;

      update public.rooms set current_round = v_next_round, board_size = v_next_size
      where id = p_room_id;
      update public.room_players set position = 0 where room_id = p_room_id;

      insert into public.game_events(room_id, message)
      values (p_room_id, '晋级判定成功，进入第' || case when v_next_round = 2 then '二' else '三' end || '轮 ' || v_next_size || ' 格棋盘');
    end if;

    select user_id into v_next_user from public.room_players
    where room_id = p_room_id and turn_order > v_player.turn_order
    order by turn_order limit 1;

    if v_next_user is null then
      select user_id into v_next_user from public.room_players
      where room_id = p_room_id order by turn_order limit 1;
    end if;

    update public.rooms set current_turn = v_next_user where id = p_room_id;
  end if;

  return query select v_dice, v_position, v_change, v_finished;
end;
$$;

revoke all on function public.admin_create_room() from public;
revoke all on function public.join_room(text, text, text) from public;
revoke all on function public.set_ready(uuid, boolean) from public;
revoke all on function public.admin_update_round_chances(uuid, integer, integer) from public;
revoke all on function public.admin_start_game(uuid) from public;
revoke all on function public.admin_finish_room(uuid) from public;
revoke all on function public.leave_room(uuid) from public;
revoke all on function public.roll_dice(uuid) from public;

grant execute on function public.admin_create_room() to authenticated;
grant execute on function public.join_room(text, text, text) to authenticated;
grant execute on function public.set_ready(uuid, boolean) to authenticated;
grant execute on function public.admin_update_round_chances(uuid, integer, integer) to authenticated;
grant execute on function public.admin_start_game(uuid) to authenticated;
grant execute on function public.admin_finish_room(uuid) to authenticated;
grant execute on function public.leave_room(uuid) to authenticated;
grant execute on function public.roll_dice(uuid) to authenticated;

grant select on public.rooms to authenticated;
grant select on public.room_players to authenticated;
grant select on public.game_events to authenticated;
grant select on public.app_admins to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'rooms'
  ) then alter publication supabase_realtime add table public.rooms; end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'room_players'
  ) then alter publication supabase_realtime add table public.room_players; end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'game_events'
  ) then alter publication supabase_realtime add table public.game_events; end if;
end $$;
