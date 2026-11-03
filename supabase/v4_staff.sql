-- ==========================================================
-- 덕질역 v4: 운영 도구 + 내 노선도
--  · 감사 로그 (운영진이 남의 글·댓글을 지우거나, 정지·권한·신고 처리를 하면 자동으로 기록)
--  · 회원 정지 (며칠 동안 글·댓글·쪽지·장터 글쓰기 막기)
--  · 내 노선도 (타 본 노선, 가 본 역·버스 기록)
-- Supabase 대시보드 > SQL Editor 에 통째로 붙여 넣고 Run 하세요. (v3_legal.sql 을 먼저 돌린 뒤, 여러 번 돌려도 돼요)
-- ==========================================================

create or replace function public.role_rank(r text) returns int language sql immutable as $$
  select case r when 'admin' then 3 when 'manager' then 2 when 'subadmin' then 1 else 0 end $$;

-- 1) 감사 로그 --------------------------------------------------
create table if not exists public.audit_logs (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  actor_id    uuid,
  actor_nick  text not null default '',
  action      text not null,
  target_kind text not null default '',
  target_id   text not null default '',
  label       text not null default '',
  reason      text not null default ''
);
create index if not exists audit_logs_created_idx on public.audit_logs (created_at desc);
alter table public.audit_logs enable row level security;
drop policy if exists "audit_logs: 관리자 읽기" on public.audit_logs;
create policy "audit_logs: 관리자 읽기" on public.audit_logs for select using (public.is_manager());
-- insert/update/delete 정책은 일부러 없음 → 브라우저에서는 쓰거나 고칠 수 없고, 아래 함수·트리거만 기록해요.
grant select on public.audit_logs to authenticated;

create or replace function public.audit_add(a text, k text, tid text, lbl text, why text default '') returns void
language plpgsql security definer set search_path = public as $$
declare nk text;
begin
  select nick into nk from public.profiles where id = auth.uid();
  insert into public.audit_logs (actor_id, actor_nick, action, target_kind, target_id, label, reason)
  values (auth.uid(), coalesce(nk, ''), a, coalesce(k, ''), coalesce(tid, ''), left(coalesce(lbl, ''), 120), left(coalesce(why, ''), 300));
end $$;
revoke all on function public.audit_add(text, text, text, text, text) from public, anon, authenticated;

-- 운영진이 남의 글·댓글을 지우면 자동 기록 (내가 쓴 글을 내가 지우거나, 글이 지워지며 딸려 지워지는 댓글은 제외)
create or replace function public.audit_content_delete() returns trigger
language plpgsql security definer set search_path = public as $$
declare k text := tg_argv[0]; owner uuid; ttl text;
begin
  if auth.uid() is null or pg_trigger_depth() > 1 or not public.is_staff() then return old; end if;
  if k = 'post' then owner := old.author_id; ttl := old.title || ' · ' || coalesce(old.author_nick, '');
  else owner := old.user_id; ttl := left(old.body, 40) || ' · ' || coalesce(old.nick, ''); end if;
  if owner is not distinct from auth.uid() then return old; end if;
  perform public.audit_add(k || '_delete', k, old.id::text, ttl, coalesce(current_setting('deokjil.reason', true), ''));
  return old;
end $$;
drop trigger if exists posts_audit_del_trg on public.posts;
create trigger posts_audit_del_trg before delete on public.posts
  for each row execute function public.audit_content_delete('post');
drop trigger if exists comments_audit_del_trg on public.comments;
create trigger comments_audit_del_trg before delete on public.comments
  for each row execute function public.audit_content_delete('comment');

-- 신고 처리(v3)에도 기록을 남겨요
create or replace function public.content_review(p_kind text, p_id uuid, p_action text) returns void
language plpgsql security definer set search_path = public as $$
declare owner uuid; ttl text;
begin
  if not public.is_staff() then raise exception '운영진만 할 수 있어요'; end if;
  if p_kind not in ('post','comment') or p_action not in ('restore','remove') then raise exception '처리할 수 없어요'; end if;
  if p_kind = 'post' then select author_id, title into owner, ttl from public.posts where id = p_id;
  else select user_id, left(body, 20) into owner, ttl from public.comments where id = p_id; end if;
  if not found then raise exception '글을 찾을 수 없어요'; end if;
  perform set_config('deokjil.held', '1', true);
  if p_action = 'restore' then
    if p_kind = 'post' then update public.posts set held = false, held_why = '' where id = p_id;
    else update public.comments set held = false, held_why = '' where id = p_id; end if;
    update public.content_reports set dismissed = true where kind = p_kind and target_id = p_id;
    perform public.audit_add('report_restore', p_kind, p_id::text, coalesce(ttl, ''), '신고 확인 후 다시 공개');
    perform public.notify(owner, 'report', '운영진', '「' || left(coalesce(ttl, ''), 20) || '」을(를) 확인했고 다시 공개했어요', '#/');
  else
    perform set_config('deokjil.reason', '신고 처리 — 운영정책 위반', true);
    if p_kind = 'post' then delete from public.posts where id = p_id;
    else delete from public.comments where id = p_id or parent_id = p_id; end if;
    update public.content_reports set dismissed = true where kind = p_kind and target_id = p_id;
    perform public.notify(owner, 'report', '운영진', '「' || left(coalesce(ttl, ''), 20) || '」이(가) 운영정책 위반으로 삭제됐어요', '#/policy');
  end if;
end $$;
grant execute on function public.content_review(text, uuid, text) to authenticated;

-- 권한(역할)을 바꾸면 기록 (회원 → 부관리자 등)
create or replace function public.audit_role_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.role is distinct from old.role and auth.uid() is not null and coalesce(current_setting('deokjil.sys', true), '') <> '1' then
    perform public.audit_add('role_change', 'user', new.id::text, new.nick || ' · ' || old.role || ' → ' || new.role, '');
  end if;
  return new;
end $$;
drop trigger if exists profiles_audit_role_trg on public.profiles;
create trigger profiles_audit_role_trg after update of role on public.profiles
  for each row execute function public.audit_role_change();

-- 2) 회원 정지 --------------------------------------------------
alter table public.profiles add column if not exists banned_until timestamptz;
alter table public.profiles add column if not exists ban_reason   text not null default '';

-- 정지 상태는 아래 함수로만 바뀌어요 (본인이 직접 풀 수 없어요)
create or replace function public.profiles_ban_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('deokjil.sys', true), '') <> '1' then
    new.banned_until := old.banned_until; new.ban_reason := old.ban_reason;
  end if;
  return new;
end $$;
drop trigger if exists profiles_ban_guard_trg on public.profiles;
create trigger profiles_ban_guard_trg before update on public.profiles
  for each row execute function public.profiles_ban_guard();

-- 정지·해제 (운영진, 나보다 낮은 역할의 회원만). p_days = 0 이면 해제
create or replace function public.set_suspension(p_id uuid, p_days int, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare my_role text; t_role text; t_nick text; why text := btrim(coalesce(p_reason, ''));
begin
  if not public.is_staff() then raise exception '운영진만 할 수 있어요'; end if;
  select role into my_role from public.profiles where id = auth.uid();
  select role, nick into t_role, t_nick from public.profiles where id = p_id;
  if not found then raise exception '회원을 찾을 수 없어요'; end if;
  if p_id = auth.uid() then raise exception '나 자신은 정지할 수 없어요'; end if;
  if public.role_rank(t_role) >= public.role_rank(my_role) then raise exception '나와 같거나 높은 역할의 회원은 정지할 수 없어요'; end if;
  if p_days is null or p_days < 0 or p_days > 365 then raise exception '정지 기간은 1~365일이에요'; end if;
  perform set_config('deokjil.sys', '1', true);
  if p_days = 0 then
    update public.profiles set banned_until = null, ban_reason = '' where id = p_id;
    perform public.audit_add('unsuspend', 'user', p_id::text, t_nick, why);
    perform public.notify(p_id, 'report', '운영진', '계정 정지가 풀렸어요. 운영정책을 지켜 주세요', '#/policy');
  else
    if char_length(why) < 5 or char_length(why) > 200 then raise exception '정지 사유를 5~200자로 적어 주세요'; end if;
    update public.profiles set banned_until = now() + (p_days || ' days')::interval, ban_reason = why where id = p_id;
    perform public.audit_add('suspend', 'user', p_id::text, t_nick || ' · ' || p_days || '일', why);
    perform public.notify(p_id, 'report', '운영진', p_days || '일 동안 글쓰기가 제한됐어요 (' || why || ')', '#/policy');
  end if;
end $$;
grant execute on function public.set_suspension(uuid, int, text) to authenticated;

-- 정지 중인 회원(운영진 제외)은 글·댓글·쪽지·장터 글을 쓰거나 고칠 수 없어요
create or replace function public.ban_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare b timestamptz; why text; r text; changed boolean := true;
begin
  if auth.uid() is null then return new; end if;
  if tg_op = 'UPDATE' then      -- 조회수·공감 같은 숫자 변화는 통과, 제목·본문이 바뀔 때만 막아요
    if tg_table_name = 'posts' then changed := new.title is distinct from old.title or new.body is distinct from old.body;
    elsif tg_table_name = 'comments' then changed := new.body is distinct from old.body; end if;
    if not changed then return new; end if;
  end if;
  select banned_until, ban_reason, role into b, why, r from public.profiles where id = auth.uid();
  if b is not null and b > now() and public.role_rank(r) = 0 then
    raise exception '정지 중이라 할 수 없어요 (% 까지) — %', to_char(b at time zone 'Asia/Seoul', 'YYYY.MM.DD HH24:MI'), why;
  end if;
  return new;
end $$;
drop trigger if exists posts_ban_guard_trg on public.posts;
create trigger posts_ban_guard_trg before insert or update on public.posts for each row execute function public.ban_guard();
drop trigger if exists comments_ban_guard_trg on public.comments;
create trigger comments_ban_guard_trg before insert or update on public.comments for each row execute function public.ban_guard();
drop trigger if exists dms_ban_guard_trg on public.dms;
create trigger dms_ban_guard_trg before insert on public.dms for each row execute function public.ban_guard();
drop trigger if exists market_items_ban_guard_trg on public.market_items;
create trigger market_items_ban_guard_trg before insert on public.market_items for each row execute function public.ban_guard();

-- 3) 내 노선도 --------------------------------------------------
create table if not exists public.route_marks (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  kind       text not null check (kind in ('line','station','bus')),
  key        text not null check (char_length(key) between 1 and 40),
  label      text not null check (char_length(label) between 1 and 40),
  status     text not null default 'ridden' check (status in ('ridden','done')),
  note       text not null default '' check (char_length(note) <= 60),
  created_at timestamptz not null default now(),
  primary key (user_id, kind, key)
);
alter table public.route_marks enable row level security;
drop policy if exists "route_marks: 내 것만" on public.route_marks;
create policy "route_marks: 내 것만" on public.route_marks for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update, delete on public.route_marks to authenticated;

-- 한 사람이 너무 많이 쌓지 못하게 (500개)
create or replace function public.route_marks_limit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.route_marks where user_id = new.user_id) >= 500 then
    raise exception '노선도 기록은 500개까지 남길 수 있어요';
  end if;
  return new;
end $$;
drop trigger if exists route_marks_limit_trg on public.route_marks;
create trigger route_marks_limit_trg before insert on public.route_marks
  for each row execute function public.route_marks_limit();

-- 열차 종류별 노선('train')도 기록할 수 있게 종류를 늘려요 (이미 v4를 돌렸어도 다시 실행하면 돼요)
alter table public.route_marks drop constraint if exists route_marks_kind_check;
alter table public.route_marks add constraint route_marks_kind_check check (kind in ('line','station','bus','train'));

-- 이동 기록: 출발역 → 도착역, 어느 노선을 탔는지, 환승 (구간 = legs, 환승은 구간과 구간 사이)
create table if not exists public.route_trips (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  trip_date  date not null default (now() at time zone 'Asia/Seoul')::date,
  legs       jsonb not null check (jsonb_typeof(legs) = 'array' and jsonb_array_length(legs) between 1 and 8 and octet_length(legs::text) <= 3000),
  note       text not null default '' check (char_length(note) <= 60),
  created_at timestamptz not null default now()
);
create index if not exists route_trips_user_idx on public.route_trips (user_id, trip_date desc);
alter table public.route_trips enable row level security;
drop policy if exists "route_trips: 내 것만" on public.route_trips;
create policy "route_trips: 내 것만" on public.route_trips for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update, delete on public.route_trips to authenticated;

create or replace function public.route_trips_limit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.route_trips where user_id = new.user_id) >= 300 then
    raise exception '이동 기록은 300개까지 남길 수 있어요';
  end if;
  return new;
end $$;
drop trigger if exists route_trips_limit_trg on public.route_trips;
create trigger route_trips_limit_trg before insert on public.route_trips
  for each row execute function public.route_trips_limit();
