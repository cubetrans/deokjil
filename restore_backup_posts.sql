-- 덕질역: 복구 때 남은 옛 글(backup_restore.posts)을 진짜 글(public.posts)로 옮기기
-- Supabase → SQL Editor 에서 한 번 실행. 여러 번 실행해도 중복되지 않아요.
-- 글 보호 트리거(공지는 관리자만 등)가 SQL 실행을 막아서, 옮기는 동안만 잠시 끕니다.
alter table public.posts disable trigger user;

insert into public.posts (id, board, title, body, tags, pinned, author_id, author_nick, views, created_at, updated_at)
select p.id, p.board, p.title, p.body, coalesce(p.tags,'{}'), coalesce(p.pinned,false),
       (select u.id from auth.users u where u.id = p.author_id), coalesce(p.author_nick,''),
       coalesce(p.views,0), p.created_at, p.updated_at
from backup_restore.posts p
on conflict (id) do nothing;

alter table public.posts enable trigger user;

-- 확인: 게시판별 글 수 (게시판 이름이 사이트 게시판 id와 다르면 여기서 보여요)
select board, count(*) from public.posts group by board order by 2 desc;
