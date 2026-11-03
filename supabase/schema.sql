-- ==========================================================
-- 덕질역 Supabase 스키마
-- Supabase 대시보드 > SQL Editor 에 통째로 붙여 넣고 Run 하세요. (한 번만)
-- ==========================================================

-- 1) 테이블 ----------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nick text not null check (nick ~ '^[가-힣a-zA-Z0-9_]{2,10}$'),
  role text not null default 'user' check (role in ('user','author','admin')),
  created_at timestamptz not null default now()
);
create unique index profiles_nick_lower on public.profiles (lower(nick));

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  board text not null,
  title text not null check (char_length(title) between 1 and 100),
  body text not null,
  tags text[] not null default '{}',
  pinned boolean not null default false,
  author_id uuid references auth.users(id) on delete set null,
  author_nick text not null default '',
  views int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table public.post_likes (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key (post_id, user_id)
);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  target text not null,                                   -- 글 id 또는 'guestbook'
  parent_id uuid references public.comments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  nick text not null,
  body text not null check (char_length(body) between 1 and 500),
  status text not null default 'ok' check (status in ('ok','pending')),
  created_at timestamptz not null default now()
);
create index comments_target_idx on public.comments (target);

create table public.banned_words (word text primary key);
create table public.site_settings (id int primary key default 1 check (id = 1), data jsonb not null default '{}');
create table public.visits (day date primary key, count int not null default 0);

insert into public.banned_words (word) values
 ('시발'),('씨발'),('씨빨'),('시팔'),('씨팔'),('ㅅㅂ'),('ㅆㅂ'),('병신'),('ㅂㅅ'),
 ('좆'),('좇같'),('지랄'),('ㅈㄹ'),('개새끼'),('씹새끼'),('썅'),('쌍놈'),('쌍년'),
 ('미친놈'),('미친년'),('느금'),('니애미'),('애미뒤'),('엿먹어'),('한남충'),('김치녀'),
 ('맘충'),('틀딱'),('fuck'),('shit'),('bitch')
on conflict do nothing;

-- 2) 관리자 판별 -------------------------------------------------
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.is_writer() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('admin','author'));
$$;

-- 3) 가입 시 프로필 자동 생성 — "가장 먼저 가입한 계정"이 관리자 ----------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(7001);
  insert into public.profiles (id, nick, role)
  values (new.id, new.raw_user_meta_data->>'nick',
          case when exists (select 1 from public.profiles) then 'user' else 'admin' end);
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- 4) 댓글 서버 검사: 작성자·닉네임 고정 + 금칙어면 'pending' --------------
create or replace function public.comments_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare n text;
begin
  new.user_id := auth.uid();
  select nick into new.nick from public.profiles where id = new.user_id;
  if new.nick is null then raise exception '로그인이 필요해요'; end if;
  new.created_at := now();
  n := regexp_replace(lower(new.body), '[\s[:punct:][:digit:]]+', '', 'g');
  if public.is_admin() then
    new.status := 'ok';
  elsif exists (
    select 1 from public.banned_words w
    where length(regexp_replace(lower(w.word), '[\s[:punct:][:digit:]]+', '', 'g')) > 0
      and n like '%' || regexp_replace(lower(w.word), '[\s[:punct:][:digit:]]+', '', 'g') || '%'
  ) then
    new.status := 'pending';
  else
    new.status := 'ok';
  end if;
  return new;
end $$;
create trigger comments_guard_trg before insert on public.comments
  for each row execute function public.comments_guard();

-- 4-2) 글 서버 검사: 글쓴이 고정, 조회수 조작 방지, 공지는 관리자만, 고정은 관리자만 -----
create or replace function public.posts_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare adm boolean := public.is_admin();
begin
  if coalesce(current_setting('deokjil.bump', true), '') = '1' then
    return new;                                   -- 조회수 증가 함수에서 온 수정
  end if;
  if tg_op = 'INSERT' then
    new.author_id := auth.uid();
    select nick into new.author_nick from public.profiles where id = auth.uid();
    new.views := 0;
    new.created_at := now();
    if not adm then new.pinned := false; end if;
  else
    new.author_id := old.author_id;
    new.author_nick := old.author_nick;
    new.views := old.views;
    new.created_at := old.created_at;
    if not adm then new.pinned := old.pinned; end if;
  end if;
  if new.board = 'notice' and not adm then
    raise exception '공지사항은 관리자만 쓸 수 있어요';
  end if;
  return new;
end $$;
create trigger posts_guard_trg before insert or update on public.posts
  for each row execute function public.posts_guard();

-- 4-3) 회원 권한 변경 검사: 닉네임 고정, 관리자/내 권한은 못 바꿈 -------------
create or replace function public.profiles_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.id := old.id; new.nick := old.nick; new.created_at := old.created_at;
  if old.id = auth.uid() or old.role = 'admin' then new.role := old.role; end if;
  return new;
end $$;
create trigger profiles_guard_trg before update on public.profiles
  for each row execute function public.profiles_guard();

-- 5) 방문자/조회수 함수 (누구나 호출 가능, 값만 올림) ---------------------
create or replace function public.hit_visit(do_count boolean default true) returns json
language plpgsql security definer set search_path = public as $$
declare d date := (now() at time zone 'Asia/Seoul')::date; t int; tt int;
begin
  if do_count then
    insert into public.visits (day, count) values (d, 1)
    on conflict (day) do update set count = public.visits.count + 1;
  end if;
  select coalesce(count, 0) into t from public.visits where day = d;
  select coalesce(sum(count), 0) into tt from public.visits;
  return json_build_object('today', coalesce(t, 0), 'total', tt);
end $$;

create or replace function public.bump_view(pid uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform set_config('deokjil.bump', '1', true);   -- posts_guard 가 조회수 증가는 통과시키도록 표시
  update public.posts set views = views + 1 where id = pid;
end $$;

grant execute on function public.hit_visit(boolean) to anon, authenticated;
grant execute on function public.bump_view(uuid) to anon, authenticated;
grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.is_writer() to anon, authenticated;

-- 6) 보안 정책 (RLS) — "글은 글쓴이만, 댓글은 로그인한 사람만" ---------------
alter table public.profiles      enable row level security;
alter table public.posts         enable row level security;
alter table public.post_likes    enable row level security;
alter table public.comments      enable row level security;
alter table public.banned_words  enable row level security;
alter table public.site_settings enable row level security;
alter table public.visits        enable row level security;

create policy "profiles: 닉네임 공개"   on public.profiles for select using (true);
create policy "profiles: 관리자가 권한 지정" on public.profiles for update
  using (public.is_admin()) with check (public.is_admin());

create policy "posts: 모두 읽기"        on public.posts for select using (true);
create policy "posts: 글쓴이가 쓰기"    on public.posts for insert with check (public.is_writer());
create policy "posts: 내 글/관리자 수정" on public.posts for update
  using (public.is_admin() or (public.is_writer() and author_id = auth.uid()))
  with check (public.is_admin() or (public.is_writer() and author_id = auth.uid()));
create policy "posts: 내 글/관리자 삭제" on public.posts for delete
  using (public.is_admin() or (public.is_writer() and author_id = auth.uid()));


create policy "likes: 모두 읽기"        on public.post_likes for select using (true);
create policy "likes: 내 공감만 추가"   on public.post_likes for insert with check (auth.uid() = user_id);
create policy "likes: 내 공감만 삭제"   on public.post_likes for delete using (auth.uid() = user_id);

create policy "comments: 공개+내 것+관리자" on public.comments for select
  using (status = 'ok' or user_id = auth.uid() or public.is_admin());
create policy "comments: 로그인 시 작성"    on public.comments for insert with check (auth.uid() is not null);
create policy "comments: 내 것/관리자 삭제" on public.comments for delete
  using (user_id = auth.uid() or public.is_admin());
create policy "comments: 관리자 승인"       on public.comments for update
  using (public.is_admin()) with check (public.is_admin());

create policy "banned: 관리자만 보기"   on public.banned_words for select using (public.is_admin());
create policy "banned: 관리자만 추가"   on public.banned_words for insert with check (public.is_admin());
create policy "banned: 관리자만 삭제"   on public.banned_words for delete using (public.is_admin());

create policy "settings: 모두 읽기"     on public.site_settings for select using (true);
create policy "settings: 관리자 추가"   on public.site_settings for insert with check (public.is_admin());
create policy "settings: 관리자 수정"   on public.site_settings for update using (public.is_admin()) with check (public.is_admin());

create policy "visits: 모두 읽기"       on public.visits for select using (true);
