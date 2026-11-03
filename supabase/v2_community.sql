-- ==========================================================
-- 덕질역 v2 — 커뮤니티 개편
--   · 누구나 글쓰기 (금칙어 글은 검토 대기)
--   · 역할: 총관리자(admin) / 관리자(manager) / 부관리자(subadmin) / 회원(user)
--   · 글 라이선스(CC 등), 운영진의 포인트·등급 조정, 사용자 문서(프로필 소개 문서)
--   · 포인트(글·댓글·공감 적립) + 상점(테마·프로필 스킨·칭호)
--   · 등급 자동 승급: 광역철도 → 무궁화호 → 새마을호 → KTX(관리자 승인)
--
-- schema.sql 을 이미 실행한 DB 위에서 SQL Editor 에 통째로 붙여 넣고 Run 하세요.
-- 여러 번 실행해도 안전해요. (이미 있는 상품 가격·규칙은 덮어쓰지 않아요)
-- ==========================================================

-- 1) 역할 ------------------------------------------------------
alter table public.profiles drop constraint if exists profiles_role_check;
update public.profiles set role = 'subadmin' where role = 'author';   -- 기존 공동 글쓴이 → 부관리자
alter table public.profiles add constraint profiles_role_check check (role in ('user','subadmin','manager','admin'));

alter table public.profiles
  add column if not exists points int      not null default 0 check (points >= 0),
  add column if not exists grade  smallint not null default 1 check (grade between 1 and 4),
  add column if not exists theme  text     not null default 'station',
  add column if not exists skin   text     not null default 'basic',
  add column if not exists title  text     not null default '',
  add column if not exists grade_lock boolean not null default false,   -- true 면 운영진이 정한 등급 (자동 승급 안 함)
  add column if not exists bio text not null default '' check (char_length(bio) <= 10000),   -- 사용자 문서 (마크다운)
  add column if not exists bio_updated_at timestamptz,
  add column if not exists avatar text not null default '' check (avatar = '' or (avatar like 'data:image/jpeg;base64,%' and char_length(avatar) <= 60000));   -- 프로필 사진(작은 JPEG)

alter table public.posts
  add column if not exists status text not null default 'ok' check (status in ('ok','pending'));
alter table public.posts
  add column if not exists license text not null default 'cc-by';
alter table public.posts drop constraint if exists posts_license_check;
alter table public.posts add constraint posts_license_check
  check (license in ('arr','cc-by','cc-by-sa','cc-by-nc','cc-by-nd','cc-by-nc-sa','cc-by-nc-nd','cc0'));

-- 2) 규칙·상점 테이블 -------------------------------------------
create table if not exists public.grade_rules (
  level         smallint primary key,
  key           text not null unique,
  name          text not null,
  icon          text not null default '🚉',
  min_weeks     int  not null default 0,
  min_posts     int  not null default 0,
  min_comments  int  not null default 0,
  min_likes     int  not null default 0,
  need_approval boolean not null default false
);
insert into public.grade_rules (level, key, name, icon, min_weeks, min_posts, min_comments, min_likes, need_approval) values
  (1, 'metro',     '광역철도', '🚇', 0, 0,  0,  0,   false),
  (2, 'mugunghwa', '무궁화호', '🚃', 1, 5,  10, 10,  false),
  (3, 'saemaeul',  '새마을호', '🚆', 3, 20, 50, 60,  false),
  (4, 'ktx',       'KTX',      '🚄', 8, 50, 70, 100, true)
on conflict (level) do nothing;

create table if not exists public.point_rules (
  key       text primary key,
  amount    int  not null default 0,
  daily_cap int  not null default 0,      -- 하루에 포인트를 받을 수 있는 횟수
  min_len   int  not null default 0,      -- 이 글자 수 이상일 때만 적립
  label     text not null default ''
);
insert into public.point_rules (key, amount, daily_cap, min_len, label) values
  ('post',    20, 3,  30, '글 작성'),
  ('comment',  5, 10, 5,  '댓글 작성'),
  ('like',     1, 20, 0,  '공감 누르기')
on conflict (key) do nothing;

create table if not exists public.point_log (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  delta      int  not null,
  reason     text not null,
  ref        text,
  created_at timestamptz not null default now()
);
create index if not exists point_log_user_idx on public.point_log (user_id, created_at desc);

create table if not exists public.shop_items (
  id          text primary key,
  kind        text not null check (kind in ('theme','skin','title')),
  name        text not null,
  description text not null default '',
  price       int  not null default 0 check (price >= 0),
  active      boolean not null default true,
  sort        int  not null default 0
);
insert into public.shop_items (id, kind, name, description, price, sort) values
  ('station',     'theme', '기차역 (기본)', '밝은 역사 안내판 느낌의 기본 테마',                0,   1),
  ('mono',        'theme', '모노 화이트',   '군더더기 없는 흑백 미니멀',                       0,   2),
  ('ios-dark',    'theme', '야간 승강장',   '눈이 편한 어두운 테마',                           0,   3),
  ('midnight',    'theme', '미드나잇',      '깊은 남색 밤하늘 테마',                           600, 4),
  ('line1',       'theme', '1호선 블루',    '시원한 감청색 테마',                              400, 5),
  ('line2',       'theme', '2호선 그린',    '순환선의 초록빛 테마',                            400, 6),
  ('line3',       'theme', '3호선 오렌지',  '따뜻한 주황빛 테마',                              400, 7),
  ('line4',       'theme', '4호선 스카이',  '맑은 하늘색 테마',                                400, 8),
  ('line5',       'theme', '5호선 퍼플',    '차분한 보랏빛 테마',                              400, 9),
  ('line6',       'theme', '6호선 브라운',  '차분한 황갈색 테마',                              400, 10),
  ('line7',       'theme', '7호선 올리브',  '산뜻한 올리브 테마',                              400, 11),
  ('line8',       'theme', '8호선 핑크',    '화사한 분홍빛 테마',                              400, 12),
  ('line9',       'theme', '9호선 골드',    '은은한 금빛 테마',                                500, 13),
  ('ktx',         'theme', 'KTX 블루',      '고속열차의 선명한 파랑',                          500, 14),
  ('airport',     'theme', '공항철도',      '청량한 하늘·파랑 테마',                           450, 15),
  ('sand',        'theme', '샌드 라운지',   '따뜻한 베이지 대합실 테마',                       400, 16),
  ('night-bus',   'theme', '심야버스',      '한밤의 네온빛이 도는 어두운 테마',                700, 17),
  ('basic',       'skin',  '기본 스킨',     '깔끔한 기본 프로필',                              0,   1),
  ('sunrise',     'skin',  '첫차의 새벽',   '새벽 하늘색 그라데이션',                          200, 2),
  ('blueprint',   'skin',  '노선 도면',     '청사진 격자무늬',                                 300, 3),
  ('rail-night',  'skin',  '야간열차',      '어두운 하늘과 철길',                              300, 4),
  ('led-board',   'skin',  'LED 전광판',    '역 전광판처럼 반짝이는 주황 글씨',                500, 5),
  ('gold-ticket', 'skin',  '황금 승차권',   '반짝이는 금빛 승차권',                            800, 6),
  ('first-train', 'title', '첫차 탑승객',   '닉네임 옆에 붙는 칭호',                           100, 1),
  ('last-train',  'title', '막차 승객',     '닉네임 옆에 붙는 칭호',                           100, 2),
  ('terminus',    'title', '종점 순례자',   '닉네임 옆에 붙는 칭호',                           150, 3),
  ('photographer','title', '출사 장인',     '닉네임 옆에 붙는 칭호',                           200, 4),
  ('route-master','title', '노선 박사',     '닉네임 옆에 붙는 칭호',                           300, 5)
on conflict (id) do nothing;
-- 테마 개편(기차역 스타일): 이름·가격은 새 값으로 맞추고, 옛 컴퓨터풍 테마는 정리해요
update public.shop_items set name = '야간 승강장', description = '눈이 편한 어두운 테마', price = 0 where id = 'ios-dark';
do $mig$
begin
  perform set_config('deokjil.sys', '1', true);
  update public.profiles set theme = 'station' where theme in ('ios', 'win98');
  perform set_config('deokjil.sys', '', true);
end $mig$;
alter table public.profiles alter column theme set default 'station';
do $mig2$
begin
  if to_regclass('public.inventory') is not null then
    delete from public.inventory where item_id in ('ios', 'win98');
  end if;
  delete from public.shop_items where id in ('ios', 'win98');
end $mig2$;

create table if not exists public.inventory (
  user_id     uuid not null references auth.users(id) on delete cascade,
  item_id     text not null references public.shop_items(id) on delete cascade,
  acquired_at timestamptz not null default now(),
  primary key (user_id, item_id)
);

-- 3) 권한 판별 함수 ---------------------------------------------
create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('admin','manager','subadmin'));
$$;

-- 관리자급(총관리자 + 관리자)
create or replace function public.is_manager() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('admin','manager'));
$$;
grant execute on function public.is_manager() to anon, authenticated;
-- 역할 서열: 회원 0 < 부관리자 1 < 관리자 2 < 총관리자 3
create or replace function public.role_rank(r text) returns int
language sql immutable as $$
  select case r when 'admin' then 3 when 'manager' then 2 when 'subadmin' then 1 else 0 end;
$$;

-- is_writer = "가입한 회원이면 누구나" (v1 에서는 글쓴이만이었어요)
create or replace function public.is_writer() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid());
$$;
grant execute on function public.is_staff() to anon, authenticated;
grant execute on function public.is_writer() to anon, authenticated;

create or replace function public.norm_text(t text) returns text
language sql immutable as $$
  select regexp_replace(lower(coalesce(t, '')), '[\s[:punct:][:digit:]]+', '', 'g');
$$;

create or replace function public.is_bad_text(t text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.banned_words w
    where length(public.norm_text(w.word)) > 0
      and public.norm_text(t) like '%' || public.norm_text(w.word) || '%'
  );
$$;

-- 4) 활동 통계 · 등급 계산 --------------------------------------
create or replace function public.member_stats(uid uuid) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'weeks',    greatest(0, floor(extract(epoch from (now() - p.created_at)) / 604800))::int,
    'posts',    (select count(*) from public.posts x where x.author_id = p.id and x.status = 'ok' and x.board <> 'upgrade'),
    'comments', (select count(*) from public.comments c where c.user_id = p.id and c.status = 'ok'),
    'likes',    (select count(*) from public.post_likes l where l.user_id = p.id))
  from public.profiles p where p.id = uid;
$$;
grant execute on function public.member_stats(uuid) to anon, authenticated;

create or replace function public.meets_rule(s json, r public.grade_rules) returns boolean
language sql immutable as $$
  select (s->>'weeks')::int    >= r.min_weeks
     and (s->>'posts')::int    >= r.min_posts
     and (s->>'comments')::int >= r.min_comments
     and (s->>'likes')::int    >= r.min_likes;
$$;

-- KTX 등업신청 조건을 채웠는지
create or replace function public.ktx_eligible(uid uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare r public.grade_rules;
begin
  select * into r from public.grade_rules where need_approval order by level limit 1;
  if not found then return false; end if;
  return public.meets_rule(public.member_stats(uid), r);
end $$;
grant execute on function public.ktx_eligible(uuid) to anon, authenticated;

-- 자동 승급 (승인이 필요 없는 등급까지만, 내려가지는 않아요)
create or replace function public.recalc_grade(uid uuid) returns smallint
language plpgsql security definer set search_path = public as $$
declare g smallint; ng smallint; s json; r public.grade_rules; lk boolean;
begin
  select grade, grade_lock into g, lk from public.profiles where id = uid;
  if g is null then return null; end if;
  if lk then return g; end if;                  -- 운영진이 정한 등급은 자동으로 바꾸지 않아요
  ng := g; s := public.member_stats(uid);
  for r in select * from public.grade_rules where not need_approval and level > g order by level loop
    if public.meets_rule(s, r) then ng := r.level; else exit; end if;
  end loop;
  if ng <> g then
    perform set_config('deokjil.sys', '1', true);
    update public.profiles set grade = ng where id = uid;
    perform set_config('deokjil.sys', '', true);
  end if;
  return ng;
end $$;

-- 5) 포인트 적립 -------------------------------------------------
create or replace function public.award(uid uuid, rule text, rref text, len int default 0) returns int
language plpgsql security definer set search_path = public as $$
declare
  r public.point_rules; n int;
  d timestamptz := date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul';
begin
  select * into r from public.point_rules where key = rule;
  if not found or r.amount <= 0 then return 0; end if;
  if len < r.min_len then return 0; end if;
  select count(*) into n from public.point_log where user_id = uid and reason = rule and delta > 0 and created_at >= d;
  if n >= r.daily_cap then return 0; end if;
  if rref is not null and exists (select 1 from public.point_log where user_id = uid and reason = rule and ref = rref) then return 0; end if;
  insert into public.point_log (user_id, delta, reason, ref) values (uid, r.amount, rule, rref);
  perform set_config('deokjil.sys', '1', true);
  update public.profiles set points = points + r.amount where id = uid;
  perform set_config('deokjil.sys', '', true);
  return r.amount;
end $$;

-- 클라이언트가 직접 부르면 안 되는 내부 함수
revoke all on function public.award(uuid, text, text, int) from public, anon, authenticated;
revoke all on function public.recalc_grade(uuid)           from public, anon, authenticated;

-- 6) 트리거 ------------------------------------------------------
-- 6-1) 글: 서버 검사 (글쓴이 고정, 공지·고정은 운영진만, 등업신청 조건, 금칙어 → 보류, 하루 20개 제한)
create or replace function public.posts_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  staff boolean := public.is_staff();
  adm boolean := public.is_manager();
begin
  if coalesce(current_setting('deokjil.bump', true), '') = '1' then
    return new;                                   -- 조회수 증가 함수에서 온 수정
  end if;
  if tg_op = 'INSERT' then
    if uid is null or not exists (select 1 from public.profiles where id = uid) then
      raise exception '로그인이 필요해요';
    end if;
    new.author_id := uid;
    select nick into new.author_nick from public.profiles where id = uid;
    new.views := 0;
    new.created_at := now();
    if not staff then
      new.pinned := false;
      if (select count(*) from public.posts where author_id = uid and created_at > now() - interval '1 day') >= 20 then
        raise exception '하루에 올릴 수 있는 글 수(20개)를 넘었어요';
      end if;
    end if;
  else
    new.author_id := old.author_id;
    new.author_nick := old.author_nick;
    new.views := old.views;
    new.created_at := old.created_at;
    if not staff then new.pinned := old.pinned; end if;
    if uid is distinct from old.author_id then new.license := old.license; end if;
    if uid is distinct from old.author_id and not adm then
      -- 부관리자가 남의 글에 할 수 있는 건 고정/승인뿐
      new.board := old.board; new.title := old.title; new.body := old.body; new.tags := old.tags;
    end if;
  end if;
  if new.license is null or new.license not in ('arr','cc-by','cc-by-sa','cc-by-nc','cc-by-nd','cc-by-nc-sa','cc-by-nc-nd','cc0') then new.license := 'cc-by'; end if;
  if new.board = 'notice' and not staff then
    raise exception '공지사항은 운영진만 쓸 수 있어요';
  end if;
  if new.board = 'upgrade' and not staff and not public.ktx_eligible(uid) then
    raise exception 'KTX 등업 조건을 모두 채운 뒤에 신청할 수 있어요';
  end if;
  -- 금칙어: 운영진 글은 바로 공개, 그 밖의 글은 걸리면 검토 대기
  if not staff then
    if public.is_bad_text(new.title || ' ' || new.body || ' ' || array_to_string(new.tags, ' ')) then
      new.status := 'pending';
    else
      new.status := 'ok';
    end if;
  elsif tg_op = 'INSERT' then
    new.status := 'ok';
  end if;
  return new;
end $$;

-- 6-2) 글 작성/승인 후: 포인트 + 등급
create or replace function public.posts_after() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.author_id is null then return new; end if;
  if tg_op = 'UPDATE' and old.status is not distinct from new.status then return new; end if;
  if new.status = 'ok' and new.board <> 'upgrade' then
    perform public.award(new.author_id, 'post', new.id::text, char_length(new.body));
  end if;
  perform public.recalc_grade(new.author_id);
  return new;
end $$;
drop trigger if exists posts_after_trg on public.posts;
create trigger posts_after_trg after insert or update on public.posts
  for each row execute function public.posts_after();

-- 6-3) 댓글: 운영진 댓글은 바로 공개 / 작성·승인 후 포인트 + 등급
create or replace function public.comments_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.user_id := auth.uid();
  select nick into new.nick from public.profiles where id = new.user_id;
  if new.nick is null then raise exception '로그인이 필요해요'; end if;
  new.created_at := now();
  if public.is_staff() then
    new.status := 'ok';
  elsif public.is_bad_text(new.body) then
    new.status := 'pending';
  else
    new.status := 'ok';
  end if;
  return new;
end $$;

create or replace function public.comments_after() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and old.status is not distinct from new.status then return new; end if;
  if new.status = 'ok' then
    perform public.award(new.user_id, 'comment', new.id::text, char_length(new.body));
    perform public.notify_comment(new);
  end if;
  perform public.recalc_grade(new.user_id);
  return new;
end $$;
drop trigger if exists comments_after_trg on public.comments;
create trigger comments_after_trg after insert or update on public.comments
  for each row execute function public.comments_after();

-- 6-4) 공감 후: 포인트(남의 글, 같은 글은 한 번만) + 등급
create or replace function public.likes_after() returns trigger
language plpgsql security definer set search_path = public as $$
declare a uuid;
begin
  select author_id into a from public.posts where id = new.post_id;
  if a is distinct from new.user_id then
    perform public.award(new.user_id, 'like', new.post_id::text);
    perform public.notify_like(new.user_id, new.post_id);
  end if;
  perform public.recalc_grade(new.user_id);
  return new;
end $$;
drop trigger if exists likes_after_trg on public.post_likes;
create trigger likes_after_trg after insert on public.post_likes
  for each row execute function public.likes_after();

-- 6-5) 회원 정보 보호: 포인트·등급·꾸미기는 서버 함수로만 바뀌고, 권한은 관리자가 user/subadmin 만 지정
create or replace function public.profiles_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare ar text;
begin
  new.id := old.id; new.nick := old.nick; new.created_at := old.created_at;
  if coalesce(current_setting('deokjil.sys', true), '') <> '1' then
    -- 사용자 문서: 본인만 쓰고(관리자급은 정리용으로 수정 가능), 금칙어가 들어 있으면 거절
    if new.bio is distinct from old.bio then
      if old.id is distinct from auth.uid() and not public.is_manager() then
        new.bio := old.bio;
      else
        if old.id = auth.uid() and not public.is_staff() and public.is_bad_text(new.bio) then
          raise exception '문서에 사용할 수 없는 표현이 들어 있어요';
        end if;
        new.bio_updated_at := now();
      end if;
    else
      new.bio_updated_at := old.bio_updated_at;
    end if;
    -- 프로필 사진: 본인만 바꾸고, 관리자급은 부적절한 사진을 지우는 용도로만
    if new.avatar is distinct from old.avatar and old.id is distinct from auth.uid() and not (public.is_manager() and new.avatar = '') then
      new.avatar := old.avatar;
    end if;
    new.points := old.points; new.grade := old.grade;
    new.theme := old.theme;   new.skin := old.skin;   new.title := old.title;
    new.grade_lock := old.grade_lock;
    if new.role is distinct from old.role then
      select role into ar from public.profiles where id = auth.uid();
      -- 총관리자: 총관리자를 뺀 누구든 관리자/부관리자/회원으로 / 관리자: 회원↔부관리자만
      if old.id = auth.uid() or old.role = 'admin' then new.role := old.role;
      elsif ar = 'admin' and new.role in ('user','subadmin','manager') then null;
      elsif ar = 'manager' and old.role in ('user','subadmin') and new.role in ('user','subadmin') then null;
      else new.role := old.role; end if;
    end if;
  end if;
  return new;
end $$;

-- 7) 사용자가 부르는 함수 (RPC) ----------------------------------
create or replace function public.refresh_grade() returns smallint
language sql security definer set search_path = public as $$
  select public.recalc_grade(auth.uid());
$$;

create or replace function public.buy_item(item text) returns json
language plpgsql security definer set search_path = public as $$
declare it public.shop_items; uid uuid := auth.uid(); bal int;
begin
  if uid is null then raise exception '로그인이 필요해요'; end if;
  select * into it from public.shop_items where id = item and active;
  if not found then raise exception '판매하지 않는 상품이에요'; end if;
  if it.price = 0 then raise exception '무료 상품이라 구매할 필요가 없어요'; end if;
  if exists (select 1 from public.inventory where user_id = uid and item_id = item) then
    raise exception '이미 가지고 있는 상품이에요';
  end if;
  select points into bal from public.profiles where id = uid for update;
  if bal is null then raise exception '회원 정보를 찾을 수 없어요'; end if;
  if bal < it.price then
    raise exception '포인트가 부족해요 (필요 %P, 보유 %P)', it.price, bal;
  end if;
  perform set_config('deokjil.sys', '1', true);
  update public.profiles set points = points - it.price where id = uid;
  perform set_config('deokjil.sys', '', true);
  insert into public.inventory (user_id, item_id) values (uid, item);
  insert into public.point_log (user_id, delta, reason, ref) values (uid, -it.price, 'buy', item);
  return json_build_object('points', bal - it.price);
end $$;

create or replace function public.equip_item(item text) returns void
language plpgsql security definer set search_path = public as $$
declare it public.shop_items; uid uuid := auth.uid();
begin
  if uid is null then raise exception '로그인이 필요해요'; end if;
  select * into it from public.shop_items where id = item;
  if not found then raise exception '없는 상품이에요'; end if;
  if it.price > 0 and not exists (select 1 from public.inventory where user_id = uid and item_id = item) then
    raise exception '구매한 상품만 사용할 수 있어요';
  end if;
  perform set_config('deokjil.sys', '1', true);
  update public.profiles set
    theme = case when it.kind = 'theme' then it.id else theme end,
    skin  = case when it.kind = 'skin'  then it.id else skin  end,
    title = case when it.kind = 'title' then it.id else title end
  where id = uid;
  perform set_config('deokjil.sys', '', true);
end $$;

create or replace function public.clear_title() returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception '로그인이 필요해요'; end if;
  perform set_config('deokjil.sys', '1', true);
  update public.profiles set title = '' where id = auth.uid();
  perform set_config('deokjil.sys', '', true);
end $$;

-- 운영진: KTX 승급
create or replace function public.approve_ktx(target uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception '운영진만 할 수 있어요'; end if;
  if not exists (select 1 from public.profiles where id = target) then raise exception '회원을 찾을 수 없어요'; end if;
  if not public.ktx_eligible(target) then raise exception 'KTX 조건을 아직 채우지 못한 회원이에요'; end if;
  perform set_config('deokjil.sys', '1', true);
  update public.profiles set grade = 4 where id = target;
  perform set_config('deokjil.sys', '', true);
end $$;

-- 운영진(부관리자 이상): 회원 포인트 조정. 자기보다 낮은 역할의 회원에게만 (총관리자는 누구에게나)
--   mode 'add' = 증가/감소(음수 가능), 'set' = 정확한 값으로 지정
create or replace function public.staff_adjust_points(target uuid, mode text, amount int, note text default '') returns int
language plpgsql security definer set search_path = public as $$
declare ar text; tr text; old_p int; new_p int;
begin
  select role into ar from public.profiles where id = auth.uid();
  if ar is null or ar = 'user' then raise exception '운영진만 할 수 있어요'; end if;
  select role, points into tr, old_p from public.profiles where id = target;
  if tr is null then raise exception '회원을 찾을 수 없어요'; end if;
  if ar <> 'admin' and public.role_rank(tr) >= public.role_rank(ar) then raise exception '나보다 높거나 같은 역할의 포인트는 바꿀 수 없어요'; end if;
  if mode = 'set' then
    if amount < 0 then raise exception '포인트는 0 이상으로 지정해 주세요'; end if;
    new_p := amount;
  elsif mode = 'add' then
    new_p := greatest(0, old_p + amount);
  else raise exception '알 수 없는 방식이에요'; end if;
  if new_p = old_p then return old_p; end if;
  perform set_config('deokjil.sys', '1', true);
  update public.profiles set points = new_p where id = target;
  perform set_config('deokjil.sys', '', true);
  insert into public.point_log (user_id, delta, reason, ref) values (target, new_p - old_p, 'admin', left(coalesce(note, ''), 60));
  return new_p;
end $$;

-- 운영진: 등급 지정. lvl 1~4 = 그 등급으로 고정, 0 = 자동(활동 조건대로) 으로 되돌리기
create or replace function public.staff_set_grade(target uuid, lvl int) returns smallint
language plpgsql security definer set search_path = public as $$
declare ar text; tr text; res smallint;
begin
  select role into ar from public.profiles where id = auth.uid();
  if ar is null or ar = 'user' then raise exception '운영진만 할 수 있어요'; end if;
  select role into tr from public.profiles where id = target;
  if tr is null then raise exception '회원을 찾을 수 없어요'; end if;
  if ar <> 'admin' and public.role_rank(tr) >= public.role_rank(ar) then raise exception '나보다 높거나 같은 역할의 등급은 바꿀 수 없어요'; end if;
  if lvl not between 0 and 4 then raise exception '등급은 1~4 사이로 정해 주세요'; end if;
  perform set_config('deokjil.sys', '1', true);
  if lvl = 0 then
    -- 자동으로 되돌리기: 활동 조건으로 다시 계산 (KTX 는 승인제라 3 까지)
    update public.profiles set grade_lock = false, grade = 1 where id = target;
    perform public.recalc_grade(target);
  else
    update public.profiles set grade = lvl, grade_lock = true where id = target;
  end if;
  perform set_config('deokjil.sys', '', true);
  select grade into res from public.profiles where id = target;
  return res;
end $$;

-- (예전 이름 호환)
create or replace function public.admin_grant_points(target uuid, amount int, note text default '') returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.staff_adjust_points(target, 'add', amount, note);
end $$;

grant execute on function public.refresh_grade()                 to authenticated;
grant execute on function public.buy_item(text)                  to authenticated;
grant execute on function public.equip_item(text)                to authenticated;
grant execute on function public.clear_title()                   to authenticated;
grant execute on function public.approve_ktx(uuid)               to authenticated;
grant execute on function public.admin_grant_points(uuid, int, text) to authenticated;
grant execute on function public.staff_adjust_points(uuid, text, int, text) to authenticated;
grant execute on function public.staff_set_grade(uuid, int) to authenticated;

-- 8) 보안 정책 (RLS) ---------------------------------------------
alter table public.grade_rules enable row level security;
alter table public.point_rules enable row level security;
alter table public.point_log   enable row level security;
alter table public.shop_items  enable row level security;
alter table public.inventory   enable row level security;

drop policy if exists "grade_rules: 모두 읽기" on public.grade_rules;
create policy "grade_rules: 모두 읽기" on public.grade_rules for select using (true);
drop policy if exists "grade_rules: 관리자 수정" on public.grade_rules;
create policy "grade_rules: 관리자 수정" on public.grade_rules for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists "point_rules: 모두 읽기" on public.point_rules;
create policy "point_rules: 모두 읽기" on public.point_rules for select using (true);
drop policy if exists "point_rules: 관리자 수정" on public.point_rules;
create policy "point_rules: 관리자 수정" on public.point_rules for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists "point_log: 내 것/운영진" on public.point_log;
create policy "point_log: 내 것/운영진" on public.point_log for select using (user_id = auth.uid() or public.is_staff());

drop policy if exists "shop: 모두 읽기" on public.shop_items;
create policy "shop: 모두 읽기" on public.shop_items for select using (true);
drop policy if exists "shop: 관리자 추가" on public.shop_items;
create policy "shop: 관리자 추가" on public.shop_items for insert with check (public.is_manager());
drop policy if exists "shop: 관리자 수정" on public.shop_items;
create policy "shop: 관리자 수정" on public.shop_items for update using (public.is_manager()) with check (public.is_manager());
drop policy if exists "shop: 관리자 삭제" on public.shop_items;
create policy "shop: 관리자 삭제" on public.shop_items for delete using (public.is_manager());

drop policy if exists "inventory: 내 것" on public.inventory;
create policy "inventory: 내 것" on public.inventory for select using (user_id = auth.uid() or public.is_manager());

-- 내 정보(사용자 문서) 수정: 본인 행만 (바꿀 수 있는 칸은 profiles_guard 가 제한해요)
drop policy if exists "profiles: 내 문서 수정" on public.profiles;
create policy "profiles: 내 문서 수정" on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

-- 회원 권한 지정: 관리자급 (세부 규칙은 profiles_guard 가 지켜요)
drop policy if exists "profiles: 관리자가 권한 지정" on public.profiles;
drop policy if exists "profiles: 관리자급이 권한 지정" on public.profiles;
create policy "profiles: 관리자급이 권한 지정" on public.profiles for update
  using (public.is_manager()) with check (public.is_manager());

-- 글
drop policy if exists "posts: 모두 읽기"        on public.posts;
drop policy if exists "posts: 글쓴이가 쓰기"    on public.posts;
drop policy if exists "posts: 내 글/관리자 수정" on public.posts;
drop policy if exists "posts: 내 글/관리자 삭제" on public.posts;
drop policy if exists "posts: 공개+내 것+운영진" on public.posts;
drop policy if exists "posts: 회원이 쓰기"      on public.posts;
drop policy if exists "posts: 내 글/운영진 수정" on public.posts;
drop policy if exists "posts: 내 글/운영진 삭제" on public.posts;
create policy "posts: 공개+내 것+운영진" on public.posts for select
  using (status = 'ok' or author_id = auth.uid() or public.is_staff());
create policy "posts: 회원이 쓰기" on public.posts for insert with check (public.is_writer());
create policy "posts: 내 글/운영진 수정" on public.posts for update
  using (public.is_staff() or author_id = auth.uid())
  with check (public.is_staff() or author_id = auth.uid());
create policy "posts: 내 글/운영진 삭제" on public.posts for delete
  using (public.is_staff() or author_id = auth.uid());

-- 댓글: 검토·삭제는 운영진도 가능
drop policy if exists "comments: 공개+내 것+관리자" on public.comments;
drop policy if exists "comments: 내 것/관리자 삭제" on public.comments;
drop policy if exists "comments: 관리자 승인"       on public.comments;
drop policy if exists "comments: 공개+내 것+운영진" on public.comments;
drop policy if exists "comments: 내 것/운영진 삭제" on public.comments;
drop policy if exists "comments: 운영진 승인"       on public.comments;
create policy "comments: 공개+내 것+운영진" on public.comments for select
  using (status = 'ok' or user_id = auth.uid() or public.is_staff());
create policy "comments: 내 것/운영진 삭제" on public.comments for delete
  using (user_id = auth.uid() or public.is_staff());
create policy "comments: 운영진 승인" on public.comments for update
  using (public.is_staff()) with check (public.is_staff());



-- ==========================================================
-- 운영진 채팅 (부관리자 이상만 읽고 쓰기 / 역할이 내려가면 바로 못 봐요)
-- ==========================================================
create table if not exists public.staff_chat (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  nick       text not null default '',
  body       text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);
create index if not exists staff_chat_created_idx on public.staff_chat (created_at desc);
alter table public.staff_chat enable row level security;

create or replace function public.staff_chat_before() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.user_id := auth.uid();
  new.body := btrim(new.body);
  select nick into new.nick from public.profiles where id = auth.uid();
  new.created_at := now();
  return new;
end $$;
drop trigger if exists staff_chat_before_trg on public.staff_chat;
create trigger staff_chat_before_trg before insert on public.staff_chat
  for each row execute function public.staff_chat_before();

create or replace function public.staff_chat_after() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from public.staff_chat where created_at < now() - interval '30 days';   -- 30일 지난 대화는 정리
  return null;
end $$;
drop trigger if exists staff_chat_after_trg on public.staff_chat;
create trigger staff_chat_after_trg after insert on public.staff_chat
  for each statement execute function public.staff_chat_after();

drop policy if exists "chat: 운영진 읽기"   on public.staff_chat;
drop policy if exists "chat: 운영진 쓰기"   on public.staff_chat;
drop policy if exists "chat: 내 말/관리자 삭제" on public.staff_chat;
create policy "chat: 운영진 읽기" on public.staff_chat for select using (public.is_staff());
create policy "chat: 운영진 쓰기" on public.staff_chat for insert with check (public.is_staff());
create policy "chat: 내 말/관리자 삭제" on public.staff_chat for delete
  using (public.is_staff() and (user_id = auth.uid() or public.is_manager()));

-- 운영진 채팅 읽음 표시 (카톡처럼 "안 읽은 사람 수"를 보여줘요)
create table if not exists public.staff_chat_reads (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  last_id bigint not null default 0
);
alter table public.staff_chat_reads enable row level security;   -- 직접 접근은 막고 아래 함수로만 써요

create or replace function public.chat_mark_read(upto bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception '운영진만 쓸 수 있어요'; end if;
  insert into public.staff_chat_reads (user_id, last_id) values (auth.uid(), greatest(coalesce(upto, 0), 0))
    on conflict (user_id) do update set last_id = greatest(public.staff_chat_reads.last_id, excluded.last_id);
end $$;
grant execute on function public.chat_mark_read(bigint) to authenticated;

create or replace function public.chat_reads() returns table (user_id uuid, last_id bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception '운영진만 볼 수 있어요'; end if;
  return query select p.id, coalesce(r.last_id, 0)::bigint
    from public.profiles p left join public.staff_chat_reads r on r.user_id = p.id
    where p.role in ('admin','manager','subadmin');
end $$;
grant execute on function public.chat_reads() to authenticated;

-- ==========================================================
-- 문의/건의
-- ==========================================================
create table if not exists public.inquiries (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  nick       text not null default '',
  category   text not null default '문의' check (category in ('문의','건의','오류 신고','기타')),
  title      text not null check (char_length(title) between 1 and 60),
  body       text not null check (char_length(body) between 1 and 3000),
  status     text not null default 'open' check (status in ('open','answered','closed')),
  reply      text not null default '' check (char_length(reply) <= 3000),
  replied_by text not null default '',
  replied_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists inquiries_user_idx on public.inquiries (user_id, created_at desc);
alter table public.inquiries enable row level security;

create or replace function public.inquiries_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.user_id := auth.uid(); new.status := 'open'; new.reply := ''; new.replied_by := ''; new.replied_at := null; new.created_at := now();
    new.title := btrim(new.title); new.body := btrim(new.body);
    select nick into new.nick from public.profiles where id = auth.uid();
    if (select count(*) from public.inquiries where user_id = auth.uid() and created_at > now() - interval '1 day') >= 5 then
      raise exception '문의는 하루에 5개까지 보낼 수 있어요';
    end if;
  else
    -- 운영진은 답변·상태만 바꿀 수 있어요
    new.id := old.id; new.user_id := old.user_id; new.nick := old.nick; new.category := old.category;
    new.title := old.title; new.body := old.body; new.created_at := old.created_at;
    if new.reply is distinct from old.reply then
      new.replied_by := (select nick from public.profiles where id = auth.uid());
      new.replied_at := now();
      if btrim(new.reply) <> '' and new.status = 'open' then new.status := 'answered'; end if;
    else
      new.replied_by := old.replied_by; new.replied_at := old.replied_at;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists inquiries_guard_trg on public.inquiries;
create trigger inquiries_guard_trg before insert or update on public.inquiries
  for each row execute function public.inquiries_guard();

drop policy if exists "inq: 내 것/운영진 읽기" on public.inquiries;
drop policy if exists "inq: 회원 쓰기"        on public.inquiries;
drop policy if exists "inq: 운영진 답변"      on public.inquiries;
drop policy if exists "inq: 내 것/관리자 삭제" on public.inquiries;
create policy "inq: 내 것/운영진 읽기" on public.inquiries for select using (user_id = auth.uid() or public.is_staff());
create policy "inq: 회원 쓰기" on public.inquiries for insert with check (public.is_writer());
create policy "inq: 운영진 답변" on public.inquiries for update using (public.is_staff()) with check (public.is_staff());
create policy "inq: 내 것/관리자 삭제" on public.inquiries for delete using (user_id = auth.uid() or public.is_manager());

-- ==========================================================
-- 출석체크 (하루 1번, 연속 출석할수록 포인트가 늘어요: 5P + 연속일 보너스 최대 +6P)
-- ==========================================================
create table if not exists public.checkins (
  user_id uuid not null references public.profiles(id) on delete cascade,
  day     date not null,
  streak  int  not null default 1,
  primary key (user_id, day)
);
alter table public.checkins enable row level security;
drop policy if exists "checkins: 내 것" on public.checkins;
create policy "checkins: 내 것" on public.checkins for select using (user_id = auth.uid() or public.is_staff());

create or replace function public.check_in() returns json
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  today date := (now() at time zone 'Asia/Seoul')::date;
  prev int; st int; amt int;
begin
  if uid is null then raise exception '로그인이 필요해요'; end if;
  select streak into st from public.checkins where user_id = uid and day = today;
  if found then return json_build_object('already', true, 'points', 0, 'streak', st); end if;
  select streak into prev from public.checkins where user_id = uid and day = today - 1;
  st := coalesce(prev, 0) + 1;
  amt := 5 + least(st - 1, 6);
  insert into public.checkins (user_id, day, streak) values (uid, today, st);
  insert into public.point_log (user_id, delta, reason, ref) values (uid, amt, 'checkin', today::text);
  perform set_config('deokjil.sys', '1', true);
  update public.profiles set points = points + amt where id = uid;
  perform set_config('deokjil.sys', '', true);
  return json_build_object('already', false, 'points', amt, 'streak', st);
end $$;
grant execute on function public.check_in() to authenticated;

-- ==========================================================
-- 스크랩 (글 즐겨찾기, 나만 볼 수 있어요)
-- ==========================================================
create table if not exists public.bookmarks (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  post_id    uuid not null references public.posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);
alter table public.bookmarks enable row level security;
drop policy if exists "bookmarks: 내 것 읽기" on public.bookmarks;
drop policy if exists "bookmarks: 내 것 담기" on public.bookmarks;
drop policy if exists "bookmarks: 내 것 빼기" on public.bookmarks;
create policy "bookmarks: 내 것 읽기" on public.bookmarks for select using (user_id = auth.uid());
create policy "bookmarks: 내 것 담기" on public.bookmarks for insert with check (user_id = auth.uid());
create policy "bookmarks: 내 것 빼기" on public.bookmarks for delete using (user_id = auth.uid());

-- ==========================================================
-- 알림 (내 글에 댓글·공감, 내 댓글에 답글, 문의 답변) — 서버가 자동으로 만들어요
-- ==========================================================
create table if not exists public.notifications (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  kind       text not null check (kind in ('comment','reply','like','inquiry','meeting','market')),
  actor_nick text not null default '',
  text       text not null default '',
  link       text not null default '',
  read       boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications (user_id, read, created_at desc);
alter table public.notifications enable row level security;
drop policy if exists "notif: 내 것 읽기" on public.notifications;
drop policy if exists "notif: 내 것 지우기" on public.notifications;
create policy "notif: 내 것 읽기" on public.notifications for select using (user_id = auth.uid());
create policy "notif: 내 것 지우기" on public.notifications for delete using (user_id = auth.uid());

create or replace function public.notify(u uuid, k text, actor text, t text, l text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if u is null then return; end if;
  insert into public.notifications (user_id, kind, actor_nick, text, link) values (u, k, coalesce(actor, ''), left(t, 120), l);
  delete from public.notifications where user_id = u and id in (
    select id from public.notifications where user_id = u order by id desc offset 200);
end $$;
revoke all on function public.notify(uuid, text, text, text, text) from public, anon, authenticated;

create or replace function public.notify_comment(c public.comments) returns void
language plpgsql security definer set search_path = public as $$
declare pa uuid; ptitle text; cu uuid;
begin
  if c.target = 'guestbook' then return; end if;
  begin
    select author_id, title into pa, ptitle from public.posts where id = c.target::uuid;
  exception when others then return;
  end;
  if c.parent_id is not null then
    select user_id into cu from public.comments where id = c.parent_id;
    if cu is not null and cu <> c.user_id then
      perform public.notify(cu, 'reply', c.nick, c.nick || '님이 내 댓글에 답글을 남겼어요: ' || left(c.body, 40), '#/post/' || c.target);
    end if;
  end if;
  if pa is not null and pa <> c.user_id and pa is distinct from cu then
    perform public.notify(pa, 'comment', c.nick, c.nick || '님이 「' || left(ptitle, 20) || '」에 댓글을 남겼어요: ' || left(c.body, 40), '#/post/' || c.target);
  end if;
end $$;
revoke all on function public.notify_comment(public.comments) from public, anon, authenticated;

create or replace function public.notify_like(liker uuid, pid uuid) returns void
language plpgsql security definer set search_path = public as $$
declare pa uuid; ptitle text; lnick text; t text;
begin
  select author_id, title into pa, ptitle from public.posts where id = pid;
  if pa is null or pa = liker then return; end if;
  select nick into lnick from public.profiles where id = liker;
  t := lnick || '님이 「' || left(ptitle, 20) || '」에 공감했어요';
  if exists (select 1 from public.notifications where user_id = pa and kind = 'like' and text = t and link = '#/post/' || pid::text) then return; end if;
  perform public.notify(pa, 'like', lnick, t, '#/post/' || pid::text);
end $$;
revoke all on function public.notify_like(uuid, uuid) from public, anon, authenticated;

create or replace function public.inquiries_notify() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.reply is distinct from old.reply and btrim(new.reply) <> '' then
    perform public.notify(new.user_id, 'inquiry', new.replied_by, '문의에 답변이 달렸어요: ' || left(new.title, 30), '#/inquiry');
  end if;
  return new;
end $$;
drop trigger if exists inquiries_notify_trg on public.inquiries;
create trigger inquiries_notify_trg after update on public.inquiries
  for each row execute function public.inquiries_notify();

create or replace function public.notif_read(ids bigint[] default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception '로그인이 필요해요'; end if;
  update public.notifications set read = true
   where user_id = auth.uid() and not read and (ids is null or id = any(ids));
end $$;
grant execute on function public.notif_read(bigint[]) to authenticated;

-- ==========================================================
-- 쪽지 (회원끼리 1:1, 내용은 보낸 사람·받은 사람만 볼 수 있어요)
-- ==========================================================
create table if not exists public.dms (
  id             bigint generated always as identity primary key,
  sender_id      uuid not null references public.profiles(id) on delete cascade,
  recipient_id   uuid not null references public.profiles(id) on delete cascade,
  sender_nick    text not null,
  recipient_nick text not null,
  body           text not null check (char_length(body) between 1 and 500),
  read           boolean not null default false,
  del_s          boolean not null default false,
  del_r          boolean not null default false,
  created_at     timestamptz not null default now()
);
create index if not exists dms_rcpt_idx on public.dms (recipient_id, read, created_at desc);
create index if not exists dms_send_idx on public.dms (sender_id, created_at desc);
alter table public.dms enable row level security;
drop policy if exists "dms: 내 쪽지만 읽기" on public.dms;
create policy "dms: 내 쪽지만 읽기" on public.dms for select
  using (created_at > now() - interval '30 days'
         and ((sender_id = auth.uid() and not del_s) or (recipient_id = auth.uid() and not del_r)));
create index if not exists dms_created_idx on public.dms (created_at);

-- 쪽지는 30일이 지나면 자동으로 지워져요. (읽기 정책에서 먼저 안 보이게 하고, 이 함수가 실제로 지워요)
create or replace function public.dms_purge() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  delete from public.dms where created_at < now() - interval '30 days';
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.dms_purge() from public, anon, authenticated;
-- 매일 새벽 4시(한국 시간)에 지우는 예약이에요. pg_cron 을 못 쓰는 환경이면 건너뛰고,
-- 그래도 쪽지를 보낼 때마다 함수가 같이 지워 줘요.
do $$ begin
  create extension if not exists pg_cron;
  perform cron.unschedule(jobid) from cron.job where jobname = 'dms-purge';
  perform cron.schedule('dms-purge', '0 19 * * *', 'select public.dms_purge()');
exception when others then
  raise notice 'pg_cron 예약은 건너뛰었어요 (%). 쪽지를 보낼 때 자동으로 지워져요.', sqlerrm;
end $$;

create or replace function public.dm_send(to_nick text, msg text) returns json
language plpgsql security definer set search_path = public as $$
declare me_id uuid := auth.uid(); me_nick text; r public.profiles; m text := btrim(coalesce(msg, '')); new_id bigint;
begin
  if me_id is null then raise exception '로그인이 필요해요'; end if;
  select nick into me_nick from public.profiles where id = me_id;
  if me_nick is null then raise exception '로그인이 필요해요'; end if;
  select * into r from public.profiles where nick = btrim(coalesce(to_nick, ''));
  if r.id is null then raise exception '받는 사람을 찾을 수 없어요'; end if;
  if r.id = me_id then raise exception '나에게는 쪽지를 보낼 수 없어요'; end if;
  if char_length(m) < 1 or char_length(m) > 500 then raise exception '쪽지는 1~500자로 써 주세요'; end if;
  if public.is_bad_text(m) then raise exception '쓸 수 없는 표현이 들어 있어요'; end if;
  perform public.dms_purge();
  insert into public.dms (sender_id, recipient_id, sender_nick, recipient_nick, body)
    values (me_id, r.id, me_nick, r.nick, m) returning id into new_id;
  return json_build_object('id', new_id);
end $$;
grant execute on function public.dm_send(text, text) to authenticated;

create or replace function public.dm_read(with_nick text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception '로그인이 필요해요'; end if;
  update public.dms set read = true where recipient_id = auth.uid() and sender_nick = with_nick and not read;
end $$;
grant execute on function public.dm_read(text) to authenticated;

create or replace function public.dm_delete(ids bigint[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception '로그인이 필요해요'; end if;
  update public.dms set del_s = true where id = any(ids) and sender_id = auth.uid();
  update public.dms set del_r = true where id = any(ids) and recipient_id = auth.uid();
  delete from public.dms where id = any(ids) and del_s and del_r;
end $$;
grant execute on function public.dm_delete(bigint[]) to authenticated;

-- 알림 종류에 '회의' 추가 (이미 만든 DB용)
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in ('comment','reply','like','inquiry','meeting','market'));

-- ==========================================================
-- 운영진 휴게실 (미니게임 기록) — 부관리자 이상만
-- ==========================================================
create table if not exists public.lounge_scores (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  game       text not null check (game in ('memory','reaction','g2048','snake','typing')),
  nick       text not null default '',
  best       numeric not null,
  plays      int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, game)
);
alter table public.lounge_scores enable row level security;
drop policy if exists "lounge: 운영진 읽기" on public.lounge_scores;
create policy "lounge: 운영진 읽기" on public.lounge_scores for select using (public.is_staff());

create or replace function public.lounge_submit(g text, sc numeric) returns json
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); nk text; low boolean; lo numeric; hi numeric; old numeric; nb numeric; isb boolean := false;
begin
  if uid is null or not public.is_staff() then raise exception '운영진만 쓸 수 있어요'; end if;
  case g
    when 'memory'   then low := true;  lo := 8;  hi := 200;
    when 'reaction' then low := true;  lo := 80; hi := 3000;
    when 'g2048'    then low := false; lo := 0;  hi := 2000000;
    when 'snake'    then low := false; lo := 0;  hi := 400;
    when 'typing'   then low := false; lo := 0;  hi := 120;
    else raise exception '없는 게임이에요';
  end case;
  if sc is null or sc < lo or sc > hi then raise exception '기록이 올바르지 않아요'; end if;
  select nick into nk from public.profiles where id = uid;
  select best into old from public.lounge_scores where user_id = uid and game = g;
  if old is null then nb := sc; isb := true;
  elsif (low and sc < old) or (not low and sc > old) then nb := sc; isb := true;
  else nb := old; end if;
  insert into public.lounge_scores (user_id, game, nick, best, plays) values (uid, g, nk, nb, 1)
    on conflict (user_id, game) do update set best = nb, nick = nk, plays = public.lounge_scores.plays + 1, updated_at = now();
  return json_build_object('best', nb, 'isBest', isb);
end $$;
grant execute on function public.lounge_submit(text, numeric) to authenticated;

-- ==========================================================
-- 운영진 회의실 — 일정은 관리자 이상이 만들고, 시간이 되면 입장·채팅·투표를 할 수 있어요
-- ==========================================================
create table if not exists public.meetings (
  id           uuid primary key default gen_random_uuid(),
  title        text not null check (char_length(title) between 1 and 80),
  agenda       text not null default '' check (char_length(agenda) <= 3000),
  minutes      text not null default '' check (char_length(minutes) <= 8000),
  start_at     timestamptz not null,
  end_at       timestamptz not null,
  created_by   uuid references public.profiles(id) on delete set null,
  creator_nick text not null default '',
  created_at   timestamptz not null default now(),
  check (end_at > start_at and end_at <= start_at + interval '12 hours')
);
create index if not exists meetings_start_idx on public.meetings (start_at desc);
alter table public.meetings enable row level security;

create or replace function public.meetings_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid(); new.created_at := now();
    select nick into new.creator_nick from public.profiles where id = auth.uid();
    new.title := btrim(new.title);
  else
    new.id := old.id; new.created_by := old.created_by; new.creator_nick := old.creator_nick; new.created_at := old.created_at;
    new.title := btrim(new.title);
  end if;
  return new;
end $$;
drop trigger if exists meetings_guard_trg on public.meetings;
create trigger meetings_guard_trg before insert or update on public.meetings
  for each row execute function public.meetings_guard();

create or replace function public.meetings_after() returns trigger
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in select id from public.profiles where role in ('subadmin','manager','admin') and id is distinct from new.created_by loop
    perform public.notify(r.id, 'meeting', new.creator_nick,
      '🗓 새 회의: ' || left(new.title, 40) || ' (' || to_char(new.start_at at time zone 'Asia/Seoul', 'MM/DD HH24:MI') || ')',
      'admin.html#/meetings/' || new.id::text);
  end loop;
  return new;
end $$;
drop trigger if exists meetings_after_trg on public.meetings;
create trigger meetings_after_trg after insert on public.meetings
  for each row execute function public.meetings_after();

drop policy if exists "meet: 운영진 읽기" on public.meetings;
drop policy if exists "meet: 관리자 만들기" on public.meetings;
drop policy if exists "meet: 관리자 고치기" on public.meetings;
drop policy if exists "meet: 관리자 지우기" on public.meetings;
create policy "meet: 운영진 읽기" on public.meetings for select using (public.is_staff());
create policy "meet: 관리자 만들기" on public.meetings for insert with check (public.is_manager());
create policy "meet: 관리자 고치기" on public.meetings for update using (public.is_manager()) with check (public.is_manager());
create policy "meet: 관리자 지우기" on public.meetings for delete using (public.is_manager());

-- 참석 응답 · 입장(출석)
create table if not exists public.meeting_members (
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  nick       text not null default '',
  rsvp       text check (rsvp in ('yes','no','maybe')),
  joined_at  timestamptz,
  primary key (meeting_id, user_id)
);
alter table public.meeting_members enable row level security;
drop policy if exists "meetm: 운영진 읽기" on public.meeting_members;
create policy "meetm: 운영진 읽기" on public.meeting_members for select using (public.is_staff());

create or replace function public.meeting_rsvp(mid uuid, st text) returns void
language plpgsql security definer set search_path = public as $$
declare m public.meetings; nk text;
begin
  if auth.uid() is null or not public.is_staff() then raise exception '운영진만 쓸 수 있어요'; end if;
  if st not in ('yes','no','maybe') then raise exception '응답이 올바르지 않아요'; end if;
  select * into m from public.meetings where id = mid;
  if m.id is null then raise exception '회의를 찾을 수 없어요'; end if;
  if now() >= m.end_at then raise exception '이미 끝난 회의예요'; end if;
  select nick into nk from public.profiles where id = auth.uid();
  insert into public.meeting_members (meeting_id, user_id, nick, rsvp) values (mid, auth.uid(), nk, st)
    on conflict (meeting_id, user_id) do update set rsvp = st, nick = nk;
end $$;
grant execute on function public.meeting_rsvp(uuid, text) to authenticated;

create or replace function public.meeting_join(mid uuid) returns void
language plpgsql security definer set search_path = public as $$
declare m public.meetings; nk text;
begin
  if auth.uid() is null or not public.is_staff() then raise exception '운영진만 쓸 수 있어요'; end if;
  select * into m from public.meetings where id = mid;
  if m.id is null then raise exception '회의를 찾을 수 없어요'; end if;
  if now() < m.start_at - interval '10 minutes' or now() > m.end_at then raise exception '지금은 입장할 수 있는 시간이 아니에요'; end if;
  select nick into nk from public.profiles where id = auth.uid();
  insert into public.meeting_members (meeting_id, user_id, nick, joined_at) values (mid, auth.uid(), nk, now())
    on conflict (meeting_id, user_id) do update set joined_at = coalesce(public.meeting_members.joined_at, now()), nick = nk;
end $$;
grant execute on function public.meeting_join(uuid) to authenticated;

-- 회의 채팅
create table if not exists public.meeting_msgs (
  id         bigint generated always as identity primary key,
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  nick       text not null default '',
  body       text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);
create index if not exists meeting_msgs_idx on public.meeting_msgs (meeting_id, id);
alter table public.meeting_msgs enable row level security;

create or replace function public.meeting_msgs_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare m public.meetings;
begin
  select * into m from public.meetings where id = new.meeting_id;
  if m.id is null then raise exception '회의를 찾을 수 없어요'; end if;
  if now() < m.start_at - interval '10 minutes' or now() > m.end_at + interval '60 minutes' then
    raise exception '지금은 채팅할 수 있는 시간이 아니에요';
  end if;
  new.user_id := auth.uid(); new.created_at := now(); new.body := btrim(new.body);
  select nick into new.nick from public.profiles where id = auth.uid();
  if char_length(new.body) < 1 then raise exception '내용을 입력해 주세요'; end if;
  return new;
end $$;
drop trigger if exists meeting_msgs_guard_trg on public.meeting_msgs;
create trigger meeting_msgs_guard_trg before insert on public.meeting_msgs
  for each row execute function public.meeting_msgs_guard();
drop policy if exists "mmsg: 운영진 읽기" on public.meeting_msgs;
drop policy if exists "mmsg: 운영진 쓰기" on public.meeting_msgs;
drop policy if exists "mmsg: 내 것/관리자 지우기" on public.meeting_msgs;
create policy "mmsg: 운영진 읽기" on public.meeting_msgs for select using (public.is_staff());
create policy "mmsg: 운영진 쓰기" on public.meeting_msgs for insert with check (public.is_staff());
create policy "mmsg: 내 것/관리자 지우기" on public.meeting_msgs for delete using (public.is_staff() and (user_id = auth.uid() or public.is_manager()));

-- 투표
create table if not exists public.meeting_polls (
  id         uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  question   text not null check (char_length(question) between 1 and 100),
  options    text[] not null check (array_length(options, 1) between 2 and 6),
  closed     boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.meeting_polls enable row level security;
create or replace function public.meeting_polls_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then new.created_by := auth.uid(); new.created_at := now(); new.closed := false;
  else new.id := old.id; new.meeting_id := old.meeting_id; new.question := old.question; new.options := old.options; new.created_by := old.created_by; new.created_at := old.created_at; end if;
  return new;
end $$;
drop trigger if exists meeting_polls_guard_trg on public.meeting_polls;
create trigger meeting_polls_guard_trg before insert or update on public.meeting_polls
  for each row execute function public.meeting_polls_guard();
drop policy if exists "mpoll: 운영진 읽기" on public.meeting_polls;
drop policy if exists "mpoll: 관리자 만들기" on public.meeting_polls;
drop policy if exists "mpoll: 관리자 고치기" on public.meeting_polls;
drop policy if exists "mpoll: 관리자 지우기" on public.meeting_polls;
create policy "mpoll: 운영진 읽기" on public.meeting_polls for select using (public.is_staff());
create policy "mpoll: 관리자 만들기" on public.meeting_polls for insert with check (public.is_manager());
create policy "mpoll: 관리자 고치기" on public.meeting_polls for update using (public.is_manager()) with check (public.is_manager());
create policy "mpoll: 관리자 지우기" on public.meeting_polls for delete using (public.is_manager());

create table if not exists public.meeting_votes (
  poll_id uuid not null references public.meeting_polls(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  choice  int  not null check (choice between 0 and 5),
  primary key (poll_id, user_id)
);
alter table public.meeting_votes enable row level security;
drop policy if exists "mvote: 운영진 읽기" on public.meeting_votes;
create policy "mvote: 운영진 읽기" on public.meeting_votes for select using (public.is_staff());

create or replace function public.meeting_vote(pid uuid, ch int) returns void
language plpgsql security definer set search_path = public as $$
declare p public.meeting_polls; m public.meetings;
begin
  if auth.uid() is null or not public.is_staff() then raise exception '운영진만 쓸 수 있어요'; end if;
  select * into p from public.meeting_polls where id = pid;
  if p.id is null then raise exception '투표를 찾을 수 없어요'; end if;
  if p.closed then raise exception '마감된 투표예요'; end if;
  if ch < 0 or ch >= array_length(p.options, 1) then raise exception '선택지가 올바르지 않아요'; end if;
  select * into m from public.meetings where id = p.meeting_id;
  if now() > m.end_at + interval '60 minutes' then raise exception '투표 시간이 지났어요'; end if;
  insert into public.meeting_votes (poll_id, user_id, choice) values (pid, auth.uid(), ch)
    on conflict (poll_id, user_id) do update set choice = ch;
end $$;
grant execute on function public.meeting_vote(uuid, int) to authenticated;

-- (삭제됨) 덕질역 메일 주소 기능은 없앴어요. 이미 만들어 둔 DB 에 남은 것만 정리해요.
drop function if exists public.mail_alias_create(text);
drop function if exists public.mail_alias_sync();
drop function if exists public.mail_alias_delete();
drop function if exists public.mail_alias_set_status(uuid, text);
drop function if exists public.mail_alias_remove(uuid);
drop function if exists public.mail_min_grade();
drop table if exists public.mail_aliases;


-- 14) 강제 탈퇴 기록 ------------------------------------------------
-- 탈퇴 처리는 Edge Function(remove-member)이 서버 권한으로 하고, 여기에는 기록만 남겨요. (관리자 이상만 볼 수 있어요)
create table if not exists public.member_removals (
  id         bigint generated always as identity primary key,
  nick       text not null,
  role       text not null default 'user',
  reason     text not null,
  by_id      uuid,
  by_nick    text not null default '',
  mailed     boolean not null default false,
  mail_note  text not null default '',
  created_at timestamptz not null default now()
);
alter table public.member_removals enable row level security;
drop policy if exists "removals: 관리자 보기" on public.member_removals;
create policy "removals: 관리자 보기" on public.member_removals for select using (public.is_manager());
-- insert/update/delete 정책은 일부러 없음 → 브라우저에서는 못 바꾸고, Edge Function(service role)만 기록해요.


-- 15) 서비스 상태 공지 (status.html) ----------------------------------
-- 운영진이 "지금 장애가 있어요 / 고쳤어요" 를 올리는 곳이에요. 누구나 볼 수 있고, 쓰기는 아래 함수로만 돼요.
create table if not exists public.status_incidents (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (char_length(title) between 2 and 100),
  impact      text not null default 'minor' check (impact in ('none','minor','major')),
  components  text[] not null default '{}',
  status      text not null default 'investigating' check (status in ('investigating','identified','monitoring','resolved')),
  created_at  timestamptz not null default now(),
  resolved_at timestamptz,
  created_by  uuid references public.profiles(id) on delete set null,
  by_nick     text not null default ''
);
create table if not exists public.status_updates (
  id          bigint generated always as identity primary key,
  incident_id uuid not null references public.status_incidents(id) on delete cascade,
  status      text not null check (status in ('investigating','identified','monitoring','resolved')),
  body        text not null check (char_length(body) between 1 and 1000),
  created_at  timestamptz not null default now(),
  by_nick     text not null default ''
);
create index if not exists status_incidents_created_idx on public.status_incidents (created_at desc);
create index if not exists status_updates_incident_idx on public.status_updates (incident_id, created_at);
alter table public.status_incidents enable row level security;
alter table public.status_updates   enable row level security;
drop policy if exists "status: 누구나 보기" on public.status_incidents;
create policy "status: 누구나 보기" on public.status_incidents for select using (true);
drop policy if exists "status upd: 누구나 보기" on public.status_updates;
create policy "status upd: 누구나 보기" on public.status_updates for select using (true);
grant select on public.status_incidents, public.status_updates to anon, authenticated;
-- insert/update/delete 정책은 일부러 없음 → 아래 함수(운영진 확인)로만 바꿔요.

create or replace function public.status_post(p_title text, p_impact text, p_components text[], p_status text, p_body text)
returns uuid language plpgsql security definer set search_path = public as $$
declare nick text; nid uuid; comps text[] := coalesce(p_components, '{}');
begin
  if not public.is_staff() then raise exception '운영진만 할 수 있어요'; end if;
  if p_impact not in ('none','minor','major') then raise exception '영향 정도가 올바르지 않아요'; end if;
  if p_status not in ('investigating','identified','monitoring','resolved') then raise exception '진행 상태가 올바르지 않아요'; end if;
  if not (comps <@ array['site','db','auth','server','rail']) then raise exception '알 수 없는 서비스가 들어 있어요'; end if;
  select profiles.nick into nick from public.profiles where id = auth.uid();
  insert into public.status_incidents (title, impact, components, status, resolved_at, created_by, by_nick)
    values (btrim(p_title), p_impact, comps, p_status, case when p_status = 'resolved' then now() end, auth.uid(), coalesce(nick, ''))
    returning id into nid;
  insert into public.status_updates (incident_id, status, body, by_nick) values (nid, p_status, btrim(p_body), coalesce(nick, ''));
  return nid;
end $$;
grant execute on function public.status_post(text, text, text[], text, text) to authenticated;

create or replace function public.status_update(p_id uuid, p_status text, p_body text, p_impact text default null)
returns void language plpgsql security definer set search_path = public as $$
declare nick text;
begin
  if not public.is_staff() then raise exception '운영진만 할 수 있어요'; end if;
  if p_status not in ('investigating','identified','monitoring','resolved') then raise exception '진행 상태가 올바르지 않아요'; end if;
  if p_impact is not null and p_impact not in ('none','minor','major') then raise exception '영향 정도가 올바르지 않아요'; end if;
  if not exists (select 1 from public.status_incidents where id = p_id) then raise exception '공지를 찾을 수 없어요'; end if;
  select profiles.nick into nick from public.profiles where id = auth.uid();
  update public.status_incidents set status = p_status, impact = coalesce(p_impact, impact),
    resolved_at = case when p_status = 'resolved' then coalesce(resolved_at, now()) else null end where id = p_id;
  insert into public.status_updates (incident_id, status, body, by_nick) values (p_id, p_status, btrim(p_body), coalesce(nick, ''));
end $$;
grant execute on function public.status_update(uuid, text, text, text) to authenticated;

create or replace function public.status_delete(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_manager() then raise exception '관리자 이상만 할 수 있어요'; end if;
  delete from public.status_incidents where id = p_id;
end $$;
grant execute on function public.status_delete(uuid) to authenticated;

-- API 스키마 캐시 새로고침 (새 함수가 바로 인식되도록)

-- ==========================================================
-- 16) 중고거래 (철도·버스 덕질 용품 게시판)
--  · 돈은 사이트를 거치지 않아요. 글 올리기 + 쪽지로 연락, 결제·배송은 두 분이 직접.
--  · 누구나 볼 수 있고, 가입 회원이면 누구나 팔 수 있어요 (광역철도 3개 / 무궁화호 이상 10개 동시 판매).
--  · 신고 3명이면 글이 자동으로 숨겨지고, 판매자의 숨김 글이 2개 이상이면 7일간 새 글을 못 써요.
--  · 전화번호·계좌번호 같은 개인정보는 글에 쓸 수 없어요. (쪽지로만)
-- ==========================================================
create table if not exists public.market_items (
  id          uuid primary key default gen_random_uuid(),
  seller_id   uuid not null references public.profiles(id) on delete cascade,
  seller_nick text not null,
  title       text not null check (char_length(title) between 2 and 60),
  category    text not null check (category in ('goods','model','book','ticket','card','photo','clothes','device','etc')),
  price       int  not null check (price between 0 and 10000000),
  cond        text not null default 'used' check (cond in ('new','like','used','worn')),
  method      text not null default 'both' check (method in ('direct','post','both')),
  region      text not null default '' check (char_length(region) <= 20),
  body        text not null check (char_length(body) between 5 and 2000),
  images      text[] not null default '{}',
  status      text not null default 'selling' check (status in ('selling','reserved','sold','hidden','removed')),
  hidden_why  text not null default '',
  buyer_id    uuid references public.profiles(id) on delete set null,
  buyer_nick  text not null default '',
  views       int  not null default 0,
  created_at  timestamptz not null default now(),
  bumped_at   timestamptz not null default now(),
  updated_at  timestamptz
);
create index if not exists market_items_list_idx on public.market_items (status, bumped_at desc);
create index if not exists market_items_seller_idx on public.market_items (seller_id, created_at desc);
alter table public.market_items enable row level security;
drop policy if exists "market: 공개 글 읽기" on public.market_items;
create policy "market: 공개 글 읽기" on public.market_items for select
  using (status in ('selling','reserved','sold') or seller_id = auth.uid() or public.is_staff());
grant select on public.market_items to anon, authenticated;

create table if not exists public.market_reports (
  id          bigint generated always as identity primary key,
  item_id     uuid not null references public.market_items(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reason      text not null check (reason in ('scam','banned','fake','info','etc')),
  note        text not null default '' check (char_length(note) <= 200),
  dismissed   boolean not null default false,
  created_at  timestamptz not null default now(),
  unique (item_id, reporter_id)
);
alter table public.market_reports enable row level security;
drop policy if exists "market_reports: 운영진 읽기" on public.market_reports;
create policy "market_reports: 운영진 읽기" on public.market_reports for select using (public.is_staff());
grant select on public.market_reports to authenticated;

create table if not exists public.market_reviews (
  id            bigint generated always as identity primary key,
  item_id       uuid not null references public.market_items(id) on delete cascade,
  seller_id     uuid not null references public.profiles(id) on delete cascade,
  reviewer_id   uuid not null references public.profiles(id) on delete cascade,
  reviewer_nick text not null,
  rating        smallint not null check (rating between 1 and 3),
  body          text not null default '' check (char_length(body) <= 100),
  created_at    timestamptz not null default now(),
  unique (item_id, reviewer_id)
);
create index if not exists market_reviews_seller_idx on public.market_reviews (seller_id, created_at desc);
alter table public.market_reviews enable row level security;
drop policy if exists "market_reviews: 공개 읽기" on public.market_reviews;
create policy "market_reviews: 공개 읽기" on public.market_reviews for select using (true);
grant select on public.market_reviews to anon, authenticated;

create table if not exists public.market_bans (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  until   timestamptz not null,
  reason  text not null default '',
  created_at timestamptz not null default now()
);
alter table public.market_bans enable row level security;
drop policy if exists "market_bans: 본인·운영진 읽기" on public.market_bans;
create policy "market_bans: 본인·운영진 읽기" on public.market_bans for select using (user_id = auth.uid() or public.is_staff());
grant select on public.market_bans to authenticated;

-- 알림 종류에 '중고거래' 추가
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in ('comment','reply','like','inquiry','meeting','market'));

-- 개인정보(전화번호·계좌번호·주민번호 꼴) 가 들어 있는지
create or replace function public.market_has_pii(t text) returns boolean
language sql immutable as $$
  select coalesce(t, '') ~ '01[016789][\s.\-]*[0-9]{3,4}[\s.\-]*[0-9]{4}'
      or coalesce(t, '') ~ '[0-9]{2,6}-[0-9]{2,6}-[0-9]{3,8}(-[0-9]{1,6})?'
      or coalesce(t, '') ~ '[0-9]{6}[\s\-]?[1-4][0-9]{6}'
      or coalesce(t, '') ~* '[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}';
$$;

create or replace function public.market_ban_active(uid uuid) returns timestamptz
language sql stable security definer set search_path = public as $$
  select until from public.market_bans where user_id = uid and until > now();
$$;

create or replace function public.market_limit(uid uuid) returns int
language sql stable security definer set search_path = public as $$
  select case when p.role in ('admin','manager','subadmin') then 1000 when p.grade >= 2 then 10 else 3 end
  from public.profiles p where p.id = uid;
$$;

-- 글 올리기 / 고치기 공통 검사 ------------------------------------
create or replace function public.market_check(p_title text, p_cat text, p_price int, p_body text, p_region text, p_images text[]) returns void
language plpgsql stable security definer set search_path = public as $$
declare u text;
begin
  if char_length(btrim(coalesce(p_title, ''))) < 2 or char_length(p_title) > 60 then raise exception '제목은 2~60자로 써 주세요'; end if;
  if char_length(btrim(coalesce(p_body, ''))) < 5 or char_length(p_body) > 2000 then raise exception '설명은 5~2000자로 써 주세요'; end if;
  if p_price is null or p_price < 0 or p_price > 10000000 then raise exception '가격은 0~1,000만 원 사이로 적어 주세요'; end if;
  if public.is_bad_text(p_title || ' ' || p_body) then raise exception '쓸 수 없는 표현이 들어 있어요'; end if;
  if public.market_has_pii(p_title || ' ' || p_body || ' ' || coalesce(p_region, '')) then
    raise exception '전화번호·계좌번호·이메일 같은 개인정보는 글에 쓸 수 없어요. 연락은 쪽지로 해 주세요';
  end if;
  if (p_title || ' ' || p_body) ~ '(승차권|정기권|예매권|KTX\s*표|SRT\s*표|기차\s*표)' and (p_title || ' ' || p_body) !~ '(수집|사용\s*완료|사용완료|사용한|기념|소장|지난)' then
    raise exception '유효한 승차권·정기권은 팔 수 없어요 (철도사업법). 사용이 끝난 수집용만 "수집용"이라고 적어서 올려 주세요';
  end if;
  if coalesce(array_length(p_images, 1), 0) > 4 then raise exception '사진은 4장까지 올릴 수 있어요'; end if;
  foreach u in array coalesce(p_images, '{}') loop
    if u !~ '^https://[A-Za-z0-9.\-]+/storage/v1/object/public/post-images/[0-9a-f\-]{36}/[A-Za-z0-9._\-]+$' then raise exception '사진 주소가 올바르지 않아요'; end if;
  end loop;
end $$;

create or replace function public.market_post(p_title text, p_cat text, p_price int, p_cond text, p_method text, p_region text, p_body text, p_images text[], p_agree boolean) returns json
language plpgsql security definer set search_path = public as $$
declare me_id uuid := auth.uid(); me public.profiles; nid uuid; b timestamptz;
begin
  if me_id is null then raise exception '로그인이 필요해요'; end if;
  select * into me from public.profiles where id = me_id;
  if not coalesce(p_agree, false) then raise exception '금지 품목·유의사항을 확인하고 체크해 주세요'; end if;
  b := public.market_ban_active(me_id);
  if b is not null and not public.is_staff() then raise exception '신고가 쌓여 % 까지 새 글을 쓸 수 없어요', to_char(b at time zone 'Asia/Seoul', 'YYYY-MM-DD'); end if;
  if (select count(*) from public.market_items where seller_id = me_id and status in ('selling','reserved')) >= public.market_limit(me_id) then
    raise exception '동시에 올릴 수 있는 글은 %개까지예요 (등급이 오르면 늘어요)', public.market_limit(me_id);
  end if;
  if not public.is_staff() and (select count(*) from public.market_items where seller_id = me_id and created_at > now() - interval '1 day') >= 5 then
    raise exception '하루에 5개까지 올릴 수 있어요';
  end if;
  perform public.market_check(p_title, p_cat, p_price, p_body, p_region, p_images);
  insert into public.market_items (seller_id, seller_nick, title, category, price, cond, method, region, body, images)
    values (me_id, me.nick, btrim(p_title), p_cat, p_price, coalesce(p_cond, 'used'), coalesce(p_method, 'both'), btrim(coalesce(p_region, '')), btrim(p_body), coalesce(p_images, '{}'))
    returning id into nid;
  return json_build_object('id', nid);
end $$;
grant execute on function public.market_post(text, text, int, text, text, text, text, text[], boolean) to authenticated;

create or replace function public.market_edit(p_id uuid, p_title text, p_cat text, p_price int, p_cond text, p_method text, p_region text, p_body text, p_images text[]) returns void
language plpgsql security definer set search_path = public as $$
declare it public.market_items;
begin
  if auth.uid() is null then raise exception '로그인이 필요해요'; end if;
  select * into it from public.market_items where id = p_id;
  if it.id is null or it.seller_id <> auth.uid() then raise exception '내 글만 고칠 수 있어요'; end if;
  if it.status in ('hidden','removed') then raise exception '숨겨진 글은 고칠 수 없어요'; end if;
  perform public.market_check(p_title, p_cat, p_price, p_body, p_region, p_images);
  update public.market_items set title = btrim(p_title), category = p_cat, price = p_price, cond = coalesce(p_cond, cond), method = coalesce(p_method, method),
    region = btrim(coalesce(p_region, '')), body = btrim(p_body), images = coalesce(p_images, '{}'), updated_at = now() where id = p_id;
end $$;
grant execute on function public.market_edit(uuid, text, text, int, text, text, text, text, text[]) to authenticated;

-- 상태 바꾸기 (판매자): 판매중 / 예약중 / 판매완료(+구매자 닉네임)
create or replace function public.market_set_status(p_id uuid, p_status text, p_buyer text default '') returns void
language plpgsql security definer set search_path = public as $$
declare it public.market_items; bu public.profiles; bn text := btrim(coalesce(p_buyer, ''));
begin
  if auth.uid() is null then raise exception '로그인이 필요해요'; end if;
  select * into it from public.market_items where id = p_id;
  if it.id is null or it.seller_id <> auth.uid() then raise exception '내 글만 바꿀 수 있어요'; end if;
  if it.status in ('hidden','removed') then raise exception '숨겨진 글이에요'; end if;
  if p_status not in ('selling','reserved','sold') then raise exception '상태가 올바르지 않아요'; end if;
  if p_status = 'sold' and bn <> '' then
    select * into bu from public.profiles where lower(nick) = lower(bn);
    if bu.id is null then raise exception '"%" 닉네임을 가진 회원이 없어요', bn; end if;
    if bu.id = auth.uid() then raise exception '나에게 판 걸로 할 수 없어요'; end if;
  end if;
  update public.market_items set status = p_status, bumped_at = case when p_status = 'selling' then now() else bumped_at end,
    buyer_id = case when p_status = 'sold' then bu.id else null end,
    buyer_nick = case when p_status = 'sold' then coalesce(bu.nick, '') else '' end, updated_at = now() where id = p_id;
  if p_status = 'sold' and bu.id is not null then
    perform public.notify(bu.id, 'market', it.seller_nick, '「' || left(it.title, 20) || '」 거래가 끝났어요. 판매자에게 후기를 남겨 주세요', '#/market/' || p_id);
  end if;
end $$;
grant execute on function public.market_set_status(uuid, text, text) to authenticated;

create or replace function public.market_bump(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare it public.market_items;
begin
  if auth.uid() is null then raise exception '로그인이 필요해요'; end if;
  select * into it from public.market_items where id = p_id;
  if it.id is null or it.seller_id <> auth.uid() or it.status not in ('selling','reserved') then raise exception '끌어올릴 수 없는 글이에요'; end if;
  if it.bumped_at > now() - interval '24 hours' then raise exception '끌어올리기는 24시간에 한 번만 할 수 있어요'; end if;
  update public.market_items set bumped_at = now() where id = p_id;
end $$;
grant execute on function public.market_bump(uuid) to authenticated;

create or replace function public.market_delete(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare it public.market_items;
begin
  if auth.uid() is null then raise exception '로그인이 필요해요'; end if;
  select * into it from public.market_items where id = p_id;
  if it.id is null then return; end if;
  if it.seller_id <> auth.uid() and not public.is_staff() then raise exception '내 글만 지울 수 있어요'; end if;
  if it.seller_id <> auth.uid() then
    update public.market_items set status = 'removed', hidden_why = '운영진이 삭제', updated_at = now() where id = p_id;
    perform public.notify(it.seller_id, 'market', '운영진', '「' || left(it.title, 20) || '」 글이 운영 정책에 따라 삭제됐어요', '#/market/' || p_id);
  else
    delete from public.market_items where id = p_id and status not in ('hidden');
    if exists (select 1 from public.market_items where id = p_id) then
      update public.market_items set status = 'removed', hidden_why = '판매자가 삭제' where id = p_id;
    end if;
  end if;
end $$;
grant execute on function public.market_delete(uuid) to authenticated;

create or replace function public.market_view(p_id uuid) returns void
language sql security definer set search_path = public as $$
  update public.market_items set views = views + 1 where id = p_id and status in ('selling','reserved','sold');
$$;
grant execute on function public.market_view(uuid) to anon, authenticated;

-- 신고: 같은 글은 한 사람이 한 번, 하루 10건까지. 서로 다른 3명이 신고하면 글이 자동으로 숨겨져요.
create or replace function public.market_report(p_id uuid, p_reason text, p_note text default '') returns json
language plpgsql security definer set search_path = public as $$
declare it public.market_items; n int; hidden_n int; me_id uuid := auth.uid();
begin
  if me_id is null then raise exception '로그인이 필요해요'; end if;
  select * into it from public.market_items where id = p_id;
  if it.id is null or it.status in ('removed') then raise exception '신고할 수 없는 글이에요'; end if;
  if it.seller_id = me_id then raise exception '내 글은 신고할 수 없어요'; end if;
  if p_reason not in ('scam','banned','fake','info','etc') then raise exception '신고 사유를 골라 주세요'; end if;
  if (select count(*) from public.market_reports where reporter_id = me_id and created_at > now() - interval '1 day') >= 10 then
    raise exception '하루에 신고는 10건까지 할 수 있어요';
  end if;
  begin
    insert into public.market_reports (item_id, reporter_id, reason, note) values (p_id, me_id, p_reason, left(btrim(coalesce(p_note, '')), 200));
  exception when unique_violation then raise exception '이미 신고한 글이에요'; end;
  select count(*) into n from public.market_reports where item_id = p_id and not dismissed;
  if n >= 3 and it.status in ('selling','reserved','sold') then
    update public.market_items set status = 'hidden', hidden_why = '신고 ' || n || '건 접수 — 운영진 확인 중' where id = p_id;
    perform public.notify(it.seller_id, 'market', '덕질역', '「' || left(it.title, 20) || '」 글이 신고로 숨겨졌어요. 운영진이 확인해요', '#/market/' || p_id);
    select count(*) into hidden_n from public.market_items i where i.seller_id = it.seller_id and i.status = 'hidden';
    if hidden_n >= 2 then
      insert into public.market_bans (user_id, until, reason) values (it.seller_id, now() + interval '7 days', '신고로 숨겨진 글 ' || hidden_n || '개')
        on conflict (user_id) do update set until = greatest(public.market_bans.until, excluded.until), reason = excluded.reason;
      perform public.notify(it.seller_id, 'market', '덕질역', '신고가 쌓여 7일간 새 판매글을 쓸 수 없어요', '#/market');
    end if;
  end if;
  return json_build_object('reports', n);
end $$;
grant execute on function public.market_report(uuid, text, text) to authenticated;

-- 후기: 판매자가 "판매완료 + 구매자 닉네임" 으로 지정한 구매자만, 글마다 한 번
create or replace function public.market_review(p_id uuid, p_rating int, p_body text default '') returns void
language plpgsql security definer set search_path = public as $$
declare it public.market_items; me public.profiles; b text := btrim(coalesce(p_body, ''));
begin
  if auth.uid() is null then raise exception '로그인이 필요해요'; end if;
  select * into me from public.profiles where id = auth.uid();
  select * into it from public.market_items where id = p_id;
  if it.id is null or it.status <> 'sold' or it.buyer_id is distinct from auth.uid() then raise exception '판매자가 구매자로 지정한 분만 후기를 남길 수 있어요'; end if;
  if p_rating not between 1 and 3 then raise exception '평가를 골라 주세요'; end if;
  if char_length(b) > 100 then raise exception '후기는 100자까지 쓸 수 있어요'; end if;
  if b <> '' and public.is_bad_text(b) then raise exception '쓸 수 없는 표현이 들어 있어요'; end if;
  begin
    insert into public.market_reviews (item_id, seller_id, reviewer_id, reviewer_nick, rating, body) values (p_id, it.seller_id, auth.uid(), me.nick, p_rating, b);
  exception when unique_violation then raise exception '이미 후기를 남겼어요'; end;
  perform public.notify(it.seller_id, 'market', me.nick, me.nick || '님이 「' || left(it.title, 20) || '」 거래 후기를 남겼어요', '#/market/' || p_id);
end $$;
grant execute on function public.market_review(uuid, int, text) to authenticated;

create or replace function public.market_seller_stats(p_nick text) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'sold',  (select count(*) from public.market_items i join public.profiles p on p.id = i.seller_id where lower(p.nick) = lower(p_nick) and i.status = 'sold'),
    'good',  (select count(*) from public.market_reviews r join public.profiles p on p.id = r.seller_id where lower(p.nick) = lower(p_nick) and r.rating = 3),
    'ok',    (select count(*) from public.market_reviews r join public.profiles p on p.id = r.seller_id where lower(p.nick) = lower(p_nick) and r.rating = 2),
    'bad',   (select count(*) from public.market_reviews r join public.profiles p on p.id = r.seller_id where lower(p.nick) = lower(p_nick) and r.rating = 1));
$$;
grant execute on function public.market_seller_stats(text) to anon, authenticated;

-- 운영진: 숨김 풀기 / 삭제 / 정지 해제 -------------------------------
create or replace function public.market_staff(p_id uuid, p_action text, p_note text default '') returns void
language plpgsql security definer set search_path = public as $$
declare it public.market_items;
begin
  if not public.is_staff() then raise exception '운영진만 할 수 있어요'; end if;
  select * into it from public.market_items where id = p_id;
  if it.id is null then raise exception '글을 찾을 수 없어요'; end if;
  if p_action = 'restore' then
    update public.market_reports set dismissed = true where item_id = p_id;
    update public.market_items set status = case when buyer_id is not null then 'sold' else 'selling' end, hidden_why = '' where id = p_id;
    perform public.notify(it.seller_id, 'market', '운영진', '「' || left(it.title, 20) || '」 글을 다시 열었어요', '#/market/' || p_id);
  elsif p_action = 'remove' then
    update public.market_items set status = 'removed', hidden_why = left(coalesce(nullif(btrim(p_note), ''), '운영 정책 위반'), 60) where id = p_id;
    perform public.notify(it.seller_id, 'market', '운영진', '「' || left(it.title, 20) || '」 글이 운영 정책 위반으로 삭제됐어요', '#/market');
  else raise exception '알 수 없는 작업이에요'; end if;
end $$;
grant execute on function public.market_staff(uuid, text, text) to authenticated;

create or replace function public.market_unban(p_uid uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception '운영진만 할 수 있어요'; end if;
  delete from public.market_bans where user_id = p_uid;
end $$;
grant execute on function public.market_unban(uuid) to authenticated;

-- =====================================================================
-- 17. 브라우저 푸시 알림 구독
--   · 구독 정보(endpoint, 키)는 본인만 읽고 지울 수 있어요. 등록·해지는 아래 함수로만 해요.
--   · 실제 발송은 Edge Function `push-notify` 가 해요 (README "푸시 알림" 참고).
-- =====================================================================
create table if not exists public.push_subscriptions (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  ua         text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists push_subs_user_idx on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;
drop policy if exists "push: 내 것 읽기" on public.push_subscriptions;
create policy "push: 내 것 읽기" on public.push_subscriptions for select using (user_id = auth.uid());
revoke insert, update, delete on public.push_subscriptions from anon, authenticated;

create or replace function public.push_subscribe(p_endpoint text, p_p256dh text, p_auth text, p_ua text default '')
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception '로그인이 필요해요'; end if;
  if p_endpoint !~ '^https://' or char_length(p_endpoint) > 1000 or coalesce(p_p256dh, '') = '' or coalesce(p_auth, '') = '' then
    raise exception '알림 정보가 올바르지 않아요';
  end if;
  -- 한 사람당 최대 10개 기기까지 (오래된 것부터 정리)
  delete from public.push_subscriptions where id in (
    select id from public.push_subscriptions where user_id = uid and endpoint <> p_endpoint order by created_at desc offset 9);
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, ua)
  values (uid, p_endpoint, p_p256dh, p_auth, left(coalesce(p_ua, ''), 200))
  on conflict (endpoint) do update set user_id = uid, p256dh = excluded.p256dh, auth = excluded.auth, ua = excluded.ua, created_at = now();
end $$;
grant execute on function public.push_subscribe(text, text, text, text) to authenticated;

create or replace function public.push_unsubscribe(p_endpoint text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception '로그인이 필요해요'; end if;
  delete from public.push_subscriptions where user_id = auth.uid() and endpoint = p_endpoint;
end $$;
grant execute on function public.push_unsubscribe(text) to authenticated;

notify pgrst, 'reload schema';
