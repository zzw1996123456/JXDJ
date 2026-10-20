-- 三角洲趣味单大富翁：Supabase 初始化脚本
-- 在 Supabase Dashboard > SQL Editor 中完整执行本文件。

create extension if not exists pgcrypto;

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (char_length(code) = 6),
  host_user_id uuid not null,
  status text not null default 'lobby' check (status in ('lobby', 'playing', 'finished')),
  current_turn uuid,
  winner_id uuid,
  board_size integer not null default 24,
  target_laps integer not null default 2,
  created_at timestamptz not null default now()
);

create table if not exists public.room_players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null,
  nickname text not null check (char_length(nickname) between 2 and 12),
  role text not null check (role in ('boss', 'runner')),
  position integer not null default 0,
  distance integer not null default 0,
  coins integer not null default 500,
  is_ready boolean not null default false,
  turn_order integer not null,
  created_at timestamptz not null default now(),
  unique (room_id, user_id),
  unique (room_id, turn_order)
);

create table if not exists public.game_events (
  id bigint generated always as identity primary key,
  room_id uuid not null references public.rooms(id) on delete cascade,
  message text not null,
  created_at timestamptz not null default now()
);

create index if not exists room_players_room_id_idx on public.room_players(room_id);
create index if not exists game_events_room_id_created_at_idx on public.game_events(room_id, created_at desc);

alter table public.rooms enable row level security;
alter table public.room_players enable row level security;
alter table public.game_events enable row level security;

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

revoke all on function public.is_room_member(uuid) from public;
grant execute on function public.is_room_member(uuid) to authenticated;

drop policy if exists "room members can read rooms" on public.rooms;
create policy "room members can read rooms"
on public.rooms for select
to authenticated
using (public.is_room_member(id));

drop policy if exists "room members can read players" on public.room_players;
create policy "room members can read players"
on public.room_players for select
to authenticated
using (public.is_room_member(room_id));

drop policy if exists "room members can read events" on public.game_events;
create policy "room members can read events"
on public.game_events for select
to authenticated
using (public.is_room_member(room_id));

create or replace function public.create_room(p_nickname text, p_role text)
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
  if v_user_id is null then
    raise exception '请先建立玩家身份';
  end if;
  if char_length(trim(p_nickname)) not between 2 and 12 then
    raise exception '昵称需要 2 到 12 个字符';
  end if;
  if p_role not in ('boss', 'runner') then
    raise exception '玩家身份无效';
  end if;

  loop
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    exit when not exists (select 1 from public.rooms where code = v_code);
  end loop;

  insert into public.rooms(code, host_user_id)
  values (v_code, v_user_id)
  returning id into v_room_id;

  insert into public.room_players(room_id, user_id, nickname, role, turn_order)
  values (v_room_id, v_user_id, trim(p_nickname), p_role, 0);

  insert into public.game_events(room_id, message)
  values (v_room_id, trim(p_nickname) || ' 创建了行动房间');

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
  if v_user_id is null then
    raise exception '请先建立玩家身份';
  end if;
  if char_length(trim(p_nickname)) not between 2 and 12 then
    raise exception '昵称需要 2 到 12 个字符';
  end if;
  if p_role not in ('boss', 'runner') then
    raise exception '玩家身份无效';
  end if;

  select * into v_room
  from public.rooms
  where code = upper(trim(p_code))
  for update;

  if not found then
    raise exception '房间不存在，请检查房间码';
  end if;
  if v_room.status <> 'lobby' then
    raise exception '该房间已经开始行动';
  end if;

  if exists (
    select 1 from public.room_players
    where room_id = v_room.id and user_id = v_user_id
  ) then
    update public.room_players
    set nickname = trim(p_nickname), role = p_role
    where room_id = v_room.id and user_id = v_user_id;
  else
    if (select count(*) from public.room_players where room_id = v_room.id) >= 6 then
      raise exception '房间人数已满';
    end if;

    select coalesce(max(turn_order), -1) + 1 into v_turn_order
    from public.room_players where room_id = v_room.id;

    insert into public.room_players(room_id, user_id, nickname, role, turn_order)
    values (v_room.id, v_user_id, trim(p_nickname), p_role, v_turn_order);

    insert into public.game_events(room_id, message)
    values (v_room.id, trim(p_nickname) || ' 加入了行动');
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
  if not exists (
    select 1 from public.rooms
    where id = p_room_id and status = 'lobby'
  ) then
    raise exception '当前不能修改准备状态';
  end if;

  update public.room_players
  set is_ready = p_ready
  where room_id = p_room_id and user_id = auth.uid();

  if not found then
    raise exception '你不在该房间中';
  end if;
end;
$$;

create or replace function public.start_game(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_first_user uuid;
begin
  perform 1 from public.rooms
  where id = p_room_id and host_user_id = auth.uid() and status = 'lobby'
  for update;

  if not found then
    raise exception '只有房主可以开始行动';
  end if;
  if exists (
    select 1 from public.room_players
    where room_id = p_room_id and not is_ready
  ) then
    raise exception '还有队员没有准备';
  end if;

  select user_id into v_first_user
  from public.room_players
  where room_id = p_room_id
  order by turn_order
  limit 1;

  if v_first_user is null then
    raise exception '房间内没有玩家';
  end if;

  update public.rooms
  set status = 'playing', current_turn = v_first_user
  where id = p_room_id;

  insert into public.game_events(room_id, message)
  values (p_room_id, '行动开始，率先完成 2 圈即可获胜');
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
  select * into v_room from public.rooms
  where id = p_room_id
  for update;

  if not found then return; end if;

  select * into v_player from public.room_players
  where room_id = p_room_id and user_id = auth.uid();

  if not found then return; end if;

  if v_room.host_user_id = auth.uid() then
    delete from public.rooms where id = p_room_id;
    return;
  end if;

  delete from public.room_players where id = v_player.id;

  if v_room.status = 'playing' and v_room.current_turn = auth.uid() then
    select user_id into v_next_user
    from public.room_players
    where room_id = p_room_id and turn_order > v_player.turn_order
    order by turn_order
    limit 1;

    if v_next_user is null then
      select user_id into v_next_user
      from public.room_players
      where room_id = p_room_id
      order by turn_order
      limit 1;
    end if;

    update public.rooms set current_turn = v_next_user where id = p_room_id;
  end if;

  insert into public.game_events(room_id, message)
  values (p_room_id, v_player.nickname || ' 离开了行动');
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
  v_distance integer;
  v_position integer;
  v_change integer := 0;
  v_next_user uuid;
  v_tile_name text;
  v_winner boolean := false;
begin
  select * into v_room from public.rooms
  where id = p_room_id
  for update;

  if not found or v_room.status <> 'playing' then
    raise exception '当前没有进行中的行动';
  end if;
  if v_room.current_turn <> auth.uid() then
    raise exception '还没有轮到你';
  end if;

  select * into v_player from public.room_players
  where room_id = p_room_id and user_id = auth.uid()
  for update;

  v_dice := floor(random() * 6 + 1)::integer;
  v_distance := v_player.distance + v_dice;
  v_position := mod(v_distance, v_room.board_size);

  if v_position in (2, 10, 20) then v_change := 80;
  elsif v_position in (7, 13, 17, 23) then v_change := 100;
  elsif v_position in (3, 9, 14, 19) then v_change := 120;
  elsif v_position in (5, 11, 16, 21) then v_change := -60;
  end if;

  if (v_distance / v_room.board_size) > (v_player.distance / v_room.board_size) then
    v_change := v_change + 200;
  end if;

  v_tile_name := case v_position
    when 0 then '行动基地' when 1 then '水泥厂' when 2 then '物资箱'
    when 3 then '老板委托' when 4 then '游客中心' when 5 then '遭遇伏击'
    when 6 then '航天基地' when 7 then '空投补给' when 8 then '行政楼'
    when 9 then '撤离委托' when 10 then '维修站' when 11 then '路线封锁'
    when 12 then '零号大坝' when 13 then '战利品箱' when 14 then '组队委托'
    when 15 then '变电站' when 16 then '危险区域' when 17 then '稀有物资'
    when 18 then '巴克什' when 19 then '护送委托' when 20 then '临时补给'
    when 21 then '情报泄露' when 22 then '长弓溪谷' when 23 then '幸运撤离'
    else '未知区域'
  end;

  update public.room_players
  set distance = v_distance,
      position = v_position,
      coins = greatest(0, coins + v_change)
  where id = v_player.id;

  insert into public.game_events(room_id, message)
  values (
    p_room_id,
    v_player.nickname || ' 掷出 ' || v_dice || '，抵达' || v_tile_name ||
      case when v_change = 0 then '' else '，金币 ' || case when v_change > 0 then '+' else '' end || v_change end
  );

  if v_distance >= v_room.board_size * v_room.target_laps then
    v_winner := true;
    update public.rooms
    set status = 'finished', winner_id = auth.uid(), current_turn = null
    where id = p_room_id;

    insert into public.game_events(room_id, message)
    values (p_room_id, v_player.nickname || ' 完成行动，获得本局第一名');
  else
    select user_id into v_next_user
    from public.room_players
    where room_id = p_room_id and turn_order > v_player.turn_order
    order by turn_order
    limit 1;

    if v_next_user is null then
      select user_id into v_next_user
      from public.room_players
      where room_id = p_room_id
      order by turn_order
      limit 1;
    end if;

    update public.rooms set current_turn = v_next_user where id = p_room_id;
  end if;

  return query select v_dice, v_position, v_change, v_winner;
end;
$$;

revoke all on function public.create_room(text, text) from public;
revoke all on function public.join_room(text, text, text) from public;
revoke all on function public.set_ready(uuid, boolean) from public;
revoke all on function public.start_game(uuid) from public;
revoke all on function public.leave_room(uuid) from public;
revoke all on function public.roll_dice(uuid) from public;

grant execute on function public.create_room(text, text) to authenticated;
grant execute on function public.join_room(text, text, text) to authenticated;
grant execute on function public.set_ready(uuid, boolean) to authenticated;
grant execute on function public.start_game(uuid) to authenticated;
grant execute on function public.leave_room(uuid) to authenticated;
grant execute on function public.roll_dice(uuid) to authenticated;

grant select on public.rooms to authenticated;
grant select on public.room_players to authenticated;
grant select on public.game_events to authenticated;

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
