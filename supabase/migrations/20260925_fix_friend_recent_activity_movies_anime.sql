alter table public.anime
    add column if not exists activity_at timestamptz;

update public.anime
set activity_at = coalesce(
    mal_updated_at,
    synced_at,
    finish_date::timestamptz
)
where activity_at is null
  and status in ('watching', 'completed');

create or replace function public.get_friend_recent_activity(friend_ids text[])
returns table(
    friend_uid text,
    media_type text,
    media_id text,
    title text,
    year integer,
    poster_url text,
    activity_at timestamptz,
    detail text
)
language sql
stable
set search_path = public
as $function$
    with movie_activity as (
        select
            m.user_id as friend_uid,
            'movie'::text as media_type,
            m.id::text as media_id,
            m.title,
            m.year,
            m.poster_url,
            coalesce(
                m.watched_at,
                m.added_at
            ) as activity_at,
            case
                when m.watched_at is not null
                    then 'Watched'
                else 'Added as watched'
            end::text as detail
        from public.movies m
        where m.user_id = any(friend_ids)
          and m.status = 'watched'
    ),
    show_activity as (
        select
            p.user_id as friend_uid,
            'show'::text as media_type,
            s.id::text as media_id,
            s.title,
            s.year,
            s.poster_url,
            max(p.updated_at) as activity_at,
            'Watched an episode'::text as detail
        from public.tv_episode_progress p
        join public.tv_shows s
          on s.id = p.tv_show_id
         and s.user_id = p.user_id
        where p.user_id = any(friend_ids)
          and p.watched = true
        group by
            p.user_id,
            s.id,
            s.title,
            s.year,
            s.poster_url
    ),
    anime_activity as (
        select
            a.user_id as friend_uid,
            'anime'::text as media_type,
            a.id::text as media_id,
            a.title,
            null::integer as year,
            a.poster_url,
            coalesce(
                a.activity_at,
                a.mal_updated_at,
                a.finish_date::timestamptz
            ) as activity_at,
            case
                when a.status = 'completed'
                    then 'Completed anime'
                else 'Updated anime progress'
            end::text as detail
        from public.anime a
        where a.user_id = any(friend_ids)
          and a.status in ('completed', 'watching')
    ),
    manga_activity as (
        select
            m.user_id as friend_uid,
            'manga'::text as media_type,
            m.id::text as media_id,
            m.title,
            null::integer as year,
            m.poster_url,
            m.updated_at as activity_at,
            case
                when m.user_status = 'completed'
                    then 'Completed reading'
                else 'Updated reading progress'
            end::text as detail
        from public.manga_library m
        where m.user_id = any(friend_ids)
          and m.user_status in ('reading', 'completed')
          and m.updated_at is not null
    ),
    ranked as (
        select
            activity.*,
            row_number() over (
                partition by activity.media_type
                order by
                    activity.activity_at desc,
                    activity.friend_uid,
                    activity.media_id
            ) as media_rank
        from (
            select * from movie_activity
            union all
            select * from show_activity
            union all
            select * from anime_activity
            union all
            select * from manga_activity
        ) activity
        where activity.activity_at is not null
    )
    select
        friend_uid,
        media_type,
        media_id,
        title,
        year,
        poster_url,
        activity_at,
        detail
    from ranked
    where media_rank <= 16
    order by activity_at desc;
$function$;

revoke all on function public.get_friend_recent_activity(text[]) from public;
grant execute on function public.get_friend_recent_activity(text[]) to service_role;
