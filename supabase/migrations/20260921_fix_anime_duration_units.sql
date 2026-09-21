-- Normalize rows written by the early AniList/Kitsu import code.
-- This legacy column is named *_ms, but the original MAL integration and
-- Entertainment UI historically store/read episode duration in seconds.
update public.anime
set average_episode_duration_ms =
    round(average_episode_duration_ms / 1000.0)::integer
where average_episode_duration_ms >= 100000;
