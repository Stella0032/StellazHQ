alter table public.anime
    add column if not exists kitsu_id integer,
    add column if not exists kitsu_score numeric
        check (kitsu_score is null or (kitsu_score >= 0 and kitsu_score <= 100));

create unique index if not exists anime_user_kitsu_unique
    on public.anime (user_id, kitsu_id)
    where kitsu_id is not null;

alter table public.manga_library
    add column if not exists kitsu_id integer,
    add column if not exists kitsu_score numeric
        check (kitsu_score is null or (kitsu_score >= 0 and kitsu_score <= 100));

create unique index if not exists manga_library_user_kitsu_unique
    on public.manga_library (user_id, kitsu_id)
    where kitsu_id is not null;
