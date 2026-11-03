-- ==========================================================
-- 덕질역 사진 저장소 (Supabase Storage)
-- SQL Editor 에 붙여 넣고 Run 하세요. (여러 번 실행해도 안전해요)
-- 처음 설치라면 schema.sql → v2_community.sql → 이 파일 순서로 실행하세요.
-- ==========================================================

-- 1) 사진 보관함 (누구나 볼 수 있음, 한 장 5MB 이하, 사진 형식만)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('post-images', 'post-images', true, 5242880,
        array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 2) 권한: 가입한 회원이면 누구나 "내 회원 id 폴더" 안에만 올릴 수 있어요.
--    운영진이 아니면 하루 15장까지만 올릴 수 있어요. (저장 공간 보호)
-- 오늘 올린 사진 수 (storage.objects 는 보안 정책 때문에 직접 세면 0으로 보여서 함수로 셉니다)
create or replace function public.uploads_today(uid uuid) returns int
language sql stable security definer set search_path = public, storage as $$
  select count(*)::int from storage.objects o
  where o.bucket_id = 'post-images'
    and (storage.foldername(o.name))[1] = uid::text
    and o.created_at > now() - interval '1 day';
$$;
grant execute on function public.uploads_today(uuid) to authenticated;

drop policy if exists "post-images: 글쓴이만 업로드" on storage.objects;
drop policy if exists "post-images: 회원 업로드" on storage.objects;
create policy "post-images: 회원 업로드" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'post-images'
    and public.is_writer()
    and (storage.foldername(name))[1] = auth.uid()::text
    and (
      public.is_staff()
      or public.uploads_today(auth.uid()) < 15
    )
  );

drop policy if exists "post-images: 내 사진/관리자 삭제" on storage.objects;
create policy "post-images: 내 사진/관리자 삭제" on storage.objects for delete to authenticated
  using (
    bucket_id = 'post-images'
    and (public.is_staff() or (storage.foldername(name))[1] = auth.uid()::text)
  );

-- 내 사진(또는 운영진은 전부)을 볼 수 있어야 삭제도 할 수 있어요. (사진 주소로 보는 건 이 정책과 상관없이 누구나 가능)
drop policy if exists "post-images: 내 사진 조회" on storage.objects;
create policy "post-images: 내 사진 조회" on storage.objects for select to authenticated
  using (
    bucket_id = 'post-images'
    and (public.is_staff() or (storage.foldername(name))[1] = auth.uid()::text)
  );
