-- Personal ratings (my_rating) move from whole numbers to one decimal
-- place (e.g. 7.3), matching the new rating slider (1-10, step 0.1) and
-- the range Plex's own userRating API already uses.
alter table public.movies
    alter column my_rating type numeric using my_rating::numeric;

alter table public.tv_shows
    alter column my_rating type numeric using my_rating::numeric;

alter table public.movies
    add constraint movies_my_rating_range
    check (my_rating is null or (
        my_rating >= 1 and my_rating <= 10
        and my_rating = round(my_rating, 1)
    ));

alter table public.tv_shows
    add constraint tv_shows_my_rating_range
    check (my_rating is null or (
        my_rating >= 1 and my_rating <= 10
        and my_rating = round(my_rating, 1)
    ));
