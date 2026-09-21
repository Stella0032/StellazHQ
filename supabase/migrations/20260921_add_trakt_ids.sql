alter table public.movies
    add column if not exists trakt_id integer,
    add column if not exists tmdb_id integer;

create unique index if not exists movies_user_trakt_unique
    on public.movies (user_id, trakt_id)
    where trakt_id is not null;

create unique index if not exists movies_user_tmdb_unique
    on public.movies (user_id, tmdb_id)
    where tmdb_id is not null;

alter table public.tv_shows
    add column if not exists trakt_id integer,
    add column if not exists tmdb_id integer;

create unique index if not exists tv_shows_user_trakt_unique
    on public.tv_shows (user_id, trakt_id)
    where trakt_id is not null;

create unique index if not exists tv_shows_user_tmdb_unique
    on public.tv_shows (user_id, tmdb_id)
    where tmdb_id is not null;
