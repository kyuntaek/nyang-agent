-- 앨범에서 고른 홈(등)용 대표 사진 URL (cats.avatar_url과 별도)
alter table public.cats add column if not exists representative_photo_url text;

comment on column public.cats.representative_photo_url is '앨범에서 지정한 대표 사진 공개 URL. 없으면 avatar_url 등 폴백';
