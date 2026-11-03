-- ==========================================================
-- 덕질역 v3: 법령 대응 (개인정보 보호법 · 정보통신망법 · 저작권법)
--  · 가입 동의 기록 (수집·이용 동의 / 만 14세 미만 보호자 동의)
--  · 글·댓글 신고 + 권리침해 신고 시 임시 숨김(임시조치) + 운영진 처리
--  · 회원이 직접 탈퇴 (내 글을 지울지 남길지 선택)
-- Supabase 대시보드 > SQL Editor 에 통째로 붙여 넣고 Run 하세요. (v2_community.sql 을 먼저 돌린 뒤, 여러 번 돌려도 돼요)
-- ==========================================================

-- 1) 동의 기록 --------------------------------------------------
alter table public.profiles add column if not exists consent_at  timestamptz;
alter table public.profiles add column if not exists consent_ver text;
alter table public.profiles add column if not exists under14     boolean not null default false;
alter table public.profiles add column if not exists guardian_ok boolean not null default false;

-- 동의 기록은 서버 함수로만 바뀌게 (사용자가 직접 고치지 못해요)
create or replace function public.profiles_consent_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('deokjil.sys', true), '') <> '1' then
    new.consent_at := old.consent_at; new.consent_ver := old.consent_ver;
    new.under14 := old.under14; new.guardian_ok := old.guardian_ok;
  end if;
  return new;
end $$;
drop trigger if exists profiles_consent_guard_trg on public.profiles;
create trigger profiles_consent_guard_trg before update on public.profiles
  for each row execute function public.profiles_consent_guard();

-- 가입할 때 동의가 없으면 계정을 만들지 않아요 (사이트를 거치지 않고 직접 가입해도 마찬가지)
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
        u14 boolean := coalesce(m->>'under14', '') = 'true';
begin
  perform pg_advisory_xact_lock(7001);
  if coalesce(m->>'agree', '') <> 'true' then
    raise exception '개인정보 수집·이용에 동의해야 가입할 수 있어요';
  end if;
  if u14 and coalesce(m->>'guardian', '') <> 'true' then
    raise exception '만 14세 미만은 보호자의 동의가 필요해요';
  end if;
  insert into public.profiles (id, nick, role, consent_at, consent_ver, under14, guardian_ok)
  values (new.id, m->>'nick',
          case when exists (select 1 from public.profiles) then 'user' else 'admin' end,
          now(), left(coalesce(m->>'ver', ''), 20), u14, u14);
  return new;
end $$;

-- 예전에 가입한 회원이 나중에 동의할 때
create or replace function public.record_consent(p_under14 boolean, p_guardian boolean, p_ver text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception '로그인이 필요해요'; end if;
  if coalesce(p_under14, false) and not coalesce(p_guardian, false) then
    raise exception '만 14세 미만은 보호자의 동의가 필요해요';
  end if;
  perform set_config('deokjil.sys', '1', true);
  update public.profiles set consent_at = now(), consent_ver = left(coalesce(p_ver, ''), 20),
         under14 = coalesce(p_under14, false), guardian_ok = coalesce(p_under14, false) and coalesce(p_guardian, false)
   where id = auth.uid();
end $$;
grant execute on function public.record_consent(boolean, boolean, text) to authenticated;

-- 2) 신고 · 임시 숨김 -------------------------------------------------
alter table public.posts    add column if not exists held boolean not null default false;
alter table public.posts    add column if not exists held_why text not null default '';
alter table public.comments add column if not exists held boolean not null default false;
alter table public.comments add column if not exists held_why text not null default '';

-- 숨김 상태는 신고·운영진 함수로만 바뀌어요 (글쓴이가 직접 풀지 못해요)
create or replace function public.held_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.held := false; new.held_why := '';
  elsif coalesce(current_setting('deokjil.held', true), '') <> '1' then
    new.held := old.held; new.held_why := old.held_why;
  end if;
  return new;
end $$;
drop trigger if exists posts_held_guard_trg on public.posts;
create trigger posts_held_guard_trg before insert or update on public.posts
  for each row execute function public.held_guard();
drop trigger if exists comments_held_guard_trg on public.comments;
create trigger comments_held_guard_trg before insert or update on public.comments
  for each row execute function public.held_guard();

-- 숨겨진 글·댓글은 글쓴이와 운영진에게만 보여요
drop policy if exists "posts: 공개+내 것+운영진" on public.posts;
create policy "posts: 공개+내 것+운영진" on public.posts for select
  using ((status = 'ok' and not held) or author_id = auth.uid() or public.is_staff());
drop policy if exists "comments: 공개+내 것+운영진" on public.comments;
create policy "comments: 공개+내 것+운영진" on public.comments for select
  using ((status = 'ok' and not held) or user_id = auth.uid() or public.is_staff());

create table if not exists public.content_reports (
  id          bigint generated always as identity primary key,
  kind        text not null check (kind in ('post','comment')),
  target_id   uuid not null,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reason      text not null check (reason in ('defame','privacy','illegal','copyright','abuse','spam','etc')),
  note        text not null default '' check (char_length(note) <= 500),
  dismissed   boolean not null default false,
  created_at  timestamptz not null default now(),
  unique (kind, target_id, reporter_id)
);
create index if not exists content_reports_target_idx on public.content_reports (kind, target_id);
alter table public.content_reports enable row level security;
drop policy if exists "content_reports: 운영진 읽기" on public.content_reports;
create policy "content_reports: 운영진 읽기" on public.content_reports for select using (public.is_staff());
grant select on public.content_reports to authenticated;

-- 알림 종류에 '신고' 추가
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('comment','reply','like','inquiry','meeting','market','report'));

-- 신고하기: 권리침해·불법 신고는 바로 임시 숨김, 그 밖의 신고는 서로 다른 3명이 하면 숨김
create or replace function public.content_report(p_kind text, p_id uuid, p_reason text, p_note text default '') returns json
language plpgsql security definer set search_path = public as $$
declare me_id uuid := auth.uid(); owner uuid; ttl text; n int; do_hold boolean; was_held boolean; why text;
begin
  if me_id is null then raise exception '로그인이 필요해요'; end if;
  if p_kind not in ('post','comment') then raise exception '신고할 수 없어요'; end if;
  if p_reason not in ('defame','privacy','illegal','copyright','abuse','spam','etc') then raise exception '신고 사유를 골라 주세요'; end if;
  if p_kind = 'post' then
    select author_id, title, held into owner, ttl, was_held from public.posts where id = p_id;
  else
    select user_id, left(body, 20), held into owner, ttl, was_held from public.comments where id = p_id;
  end if;
  if not found then raise exception '신고할 수 없는 글이에요'; end if;
  if owner = me_id then raise exception '내 글은 신고할 수 없어요'; end if;
  if (select count(*) from public.content_reports where reporter_id = me_id and created_at > now() - interval '1 day') >= 10 then
    raise exception '하루에 신고는 10건까지 할 수 있어요';
  end if;
  begin
    insert into public.content_reports (kind, target_id, reporter_id, reason, note)
    values (p_kind, p_id, me_id, p_reason, left(btrim(coalesce(p_note, '')), 500));
  exception when unique_violation then
    raise exception '이미 신고했어요';
  end;
  select count(*) into n from public.content_reports where kind = p_kind and target_id = p_id and not dismissed;
  do_hold := p_reason in ('defame','privacy','illegal','copyright') or n >= 3;
  if do_hold and not was_held then
    why := case when p_reason in ('defame','privacy','illegal','copyright')
                then '권리침해·불법 신고 접수 — 임시 숨김 (운영진 확인 중)'
                else '신고 ' || n || '건 접수 — 임시 숨김 (운영진 확인 중)' end;
    perform set_config('deokjil.held', '1', true);
    if p_kind = 'post' then update public.posts set held = true, held_why = why where id = p_id;
    else update public.comments set held = true, held_why = why where id = p_id; end if;
    perform public.notify(owner, 'report', '덕질역', '「' || left(coalesce(ttl, ''), 20) || '」이(가) 신고되어 임시로 숨겨졌어요. 운영진이 확인해요', '#/policy');
  end if;
  return json_build_object('reports', n, 'held', do_hold);
end $$;
grant execute on function public.content_report(text, uuid, text, text) to authenticated;

-- 운영진: 신고 처리 (restore = 다시 공개 + 신고 무효 / remove = 삭제)
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
    perform public.notify(owner, 'report', '운영진', '「' || left(coalesce(ttl, ''), 20) || '」을(를) 확인했고 다시 공개했어요', '#/');
  else
    if p_kind = 'post' then delete from public.posts where id = p_id;
    else delete from public.comments where id = p_id or parent_id = p_id; end if;
    update public.content_reports set dismissed = true where kind = p_kind and target_id = p_id;
    perform public.notify(owner, 'report', '운영진', '「' || left(coalesce(ttl, ''), 20) || '」이(가) 운영정책 위반으로 삭제됐어요', '#/policy');
  end if;
end $$;
grant execute on function public.content_review(text, uuid, text) to authenticated;

-- 3) 회원 탈퇴 (본인) --------------------------------------------------
--   댓글은 함께 지워져요. 글은 p_delete_posts 가 true 면 지우고, 아니면 닉네임만 '탈퇴한 회원'으로 바뀌어 남아요.
create or replace function public.delete_my_account(p_delete_posts boolean default false) returns void
language plpgsql security definer set search_path = public as $$
declare me_id uuid := auth.uid();
begin
  if me_id is null then raise exception '로그인이 필요해요'; end if;
  if exists (select 1 from public.profiles where id = me_id and role = 'admin')
     and (select count(*) from public.profiles where role = 'admin') <= 1 then
    raise exception '마지막 총관리자는 탈퇴할 수 없어요. 다른 회원을 총관리자로 지정한 뒤에 해 주세요';
  end if;
  if coalesce(p_delete_posts, false) then
    delete from public.posts where author_id = me_id;
  else
    perform set_config('deokjil.bump', '1', true);      -- posts_guard 가 닉네임 변경을 통과시키도록
    update public.posts set author_nick = '탈퇴한 회원' where author_id = me_id;
  end if;
  delete from auth.users where id = me_id;
end $$;
grant execute on function public.delete_my_account(boolean) to authenticated;
