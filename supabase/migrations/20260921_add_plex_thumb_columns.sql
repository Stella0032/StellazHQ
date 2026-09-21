alter table public.movies
    add column if not exists plex_thumb text;

alter table public.tv_shows
    add column if not exists plex_thumb text;
