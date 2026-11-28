-- 덕질역 사진 보관함(post-images) 권한 설정
-- Supabase → SQL Editor 에서 한 번 실행. 여러 번 실행해도 괜찮아요.
-- 글쓴이(서울교덕·지철덕)는 올리기·삭제, 보기는 누구나.

insert into storage.buckets (id, name, public, file_size_limit)
values ('post-images', 'post-images', true, 5242880)
on conflict (id) do update set public = true, file_size_limit = 5242880;

drop policy if exists "post_images_read" on storage.objects;
create policy "post_images_read" on storage.objects for select
  using (bucket_id = 'post-images');

drop policy if exists "post_images_insert" on storage.objects;
create policy "post_images_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'post-images' and public.is_writer());

drop policy if exists "post_images_update" on storage.objects;
create policy "post_images_update" on storage.objects for update to authenticated
  using (bucket_id = 'post-images' and public.is_writer());

drop policy if exists "post_images_delete" on storage.objects;
create policy "post_images_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'post-images' and public.is_writer());
