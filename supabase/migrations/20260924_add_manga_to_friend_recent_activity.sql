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
            m.watched_at as activity_at,
            'Watched'::text as detail
        from public.movies m
        where m.user_id = any(friend_ids)
          and m.status = 'watched'
          and m.watched_at is not null
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
        group by p.user_id, s.id, s.title, s.year, s.poster_url
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
                a.mal_updated_at,
                a.finish_date::timestamptz
            ) as activity_at,
            case
                when a.status = 'completed' then 'Completed anime'
                else 'Updated anime progress'
            end::text as detail
        from public.anime a
        where a.user_id = any(friend_ids)
          and a.status in ('completed', 'watching')
          and (
              a.mal_updated_at is not null
              or a.finish_date is not null
          )
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
                when m.user_status = 'completed' then 'Completed reading'
                else 'Updated reading progress'
            end::text as detail
        from public.manga_library m
        where m.user_id = any(friend_ids)
          and m.user_status in ('reading', 'completed')
          and m.updated_at is not null
    )
    select *
    from (
        select * from movie_activity
        union all
        select * from show_activity
        union all
        select * from anime_activity
        union all
        select * from manga_activity
    ) activity
    where activity_at is not null
    order by activity_at desc
    limit 64;
$function$;

revoke all on function public.get_friend_recent_activity(text[]) from public;
grant execute on function public.get_friend_recent_activity(text[]) to service_role;
