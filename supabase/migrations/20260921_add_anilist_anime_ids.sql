alter table public.anime
    alter column mal_id drop not null;

alter table public.anime
    add column if not exists anilist_id integer,
    add column if not exists title_romaji text,
    add column if not exists title_native text,
    add column if not exists synonyms text[] not null default '{}',
    add column if not exists anilist_score integer
        check (anilist_score is null or (anilist_score >= 0 and anilist_score <= 100)),
    add column if not exists description text,
    add column if not exists genres text[] not null default '{}',
    add column if not exists site_url text;

create unique index if not exists anime_user_anilist_unique
    on public.anime (user_id, anilist_id)
    where anilist_id is not null;
