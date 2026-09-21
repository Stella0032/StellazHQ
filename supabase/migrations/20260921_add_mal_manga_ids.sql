alter table public.manga_library
    alter column anilist_id drop not null;

alter table public.manga_library
    add column if not exists mal_id integer,
    add column if not exists mal_score numeric
        check (mal_score is null or (mal_score >= 0 and mal_score <= 10));

create unique index if not exists manga_library_user_mal_unique
    on public.manga_library (user_id, mal_id)
    where mal_id is not null;
