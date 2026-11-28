-- 덕질역 사진자랑 (인스타그램처럼 사진을 올리는 피드)
-- Supabase → SQL Editor 에서 한 번 실행. 여러 번 실행해도 괜찮아요.
-- 사진 파일은 기존 post-images 보관함에 올라가요. 올리기는 글쓴이(서울교덕·지철덕)만, 보기·공감은 누구나.

create table if not exists public.showcase_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid references auth.users(id) on delete set null default auth.uid(),
  author_nick text not null default '',
  caption text not null default '' check (char_length(caption) <= 500),
  images text[] not null check (array_length(images, 1) between 1 and 10),
  likes int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists showcase_posts_idx on public.showcase_posts (created_at desc);
alter table public.showcase_posts enable row level security;

drop policy if exists showcase_read on public.showcase_posts;
create policy showcase_read on public.showcase_posts for select using (true);
drop policy if exists showcase_insert on public.showcase_posts;
create policy showcase_insert on public.showcase_posts for insert to authenticated
  with check (public.is_writer() and author_id = auth.uid());
drop policy if exists showcase_delete on public.showcase_posts;
create policy showcase_delete on public.showcase_posts for delete to authenticated
  using (public.is_writer());
grant select on public.showcase_posts to anon, authenticated;
grant insert, delete on public.showcase_posts to authenticated;

-- 올릴 때 글쓴이 닉네임을 프로필에서 자동으로 채움 (직접 속일 수 없게)
create or replace function public.showcase_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.author_id := auth.uid();
  new.author_nick := coalesce((select nick from public.profiles where id = auth.uid()), '');
  new.likes := 0;
  return new;
end $$;
drop trigger if exists showcase_before_insert_trg on public.showcase_posts;
create trigger showcase_before_insert_trg before insert on public.showcase_posts
  for each row execute function public.showcase_before_insert();

-- 공감 (누구나, 로그인 없이). 한 기기에서 중복은 화면에서 막아요.
create or replace function public.showcase_like(pid uuid, up boolean) returns void
language sql security definer set search_path = public as $$
  update public.showcase_posts set likes = greatest(0, likes + case when up then 1 else -1 end) where id = pid;
$$;
grant execute on function public.showcase_like(uuid, boolean) to anon, authenticated;
