alter table public.anime
    add column if not exists added_at timestamptz;

update public.anime
set added_at = coalesce(
    added_at,
    synced_at,
    activity_at,
    mal_updated_at,
    finish_date::timestamptz,
    now()
)
where added_at is null;

alter table public.anime
    alter column added_at set default now();

alter table public.anime
    alter column added_at set not null;
