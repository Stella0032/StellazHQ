/**
 * Import function triggers from their respective submodules:
 *
 * const {onCall} = require("firebase-functions/v2/https");
 * const {onDocumentWritten} = require("firebase-functions/v2/firestore");
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

const {setGlobalOptions} = require("firebase-functions");
const {defineSecret} = require("firebase-functions/params");
const {onRequest, onCall, HttpsError} = require("firebase-functions/https");
const logger = require("firebase-functions/logger");

const {initializeApp} = require("firebase-admin/app");
const {getFirestore} = require("firebase-admin/firestore");
const {getAuth} = require("firebase-admin/auth");

initializeApp();

const db = getFirestore();

// For cost control, you can set the maximum number of containers that can be
// running at the same time. This helps mitigate the impact of unexpected
// traffic spikes by instead downgrading performance. This limit is a
// per-function limit. You can override the limit for each function using the
// `maxInstances` option in the function's options, e.g.
// `onRequest({ maxInstances: 5 }, (req, res) => { ... })`.
// NOTE: setGlobalOptions does not apply to functions using the v1 API. V1
// functions should each use functions.runWith({ maxInstances: 10 }) instead.
// In the v1 API, each function can only serve one request per container, so
// this will be the maximum concurrent request count.
setGlobalOptions({ maxInstances: 10 });

// Create and deploy your first functions
// https://firebase.google.com/docs/functions/get-started

exports.helloWorld = onRequest((request, response) => {
    logger.info("Hello logs!", {structuredData: true});
    response.send("Hello from Firebase!");
});

exports.testAuth = onCall((request) => {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "You must be logged in.");
    }

    return {
        uid: request.auth.uid,
    };
});

exports.addMovie = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "You must be logged in.");
  }

  const uid = request.auth.uid;
  const movie = request.data;

  if (!movie.title || typeof movie.title !== "string") {
    throw new HttpsError(
        "invalid-argument",
        "Movie title is required."
    );
  }

  if (!movie.year || typeof movie.year !== "number") {
    throw new HttpsError(
        "invalid-argument",
        "Movie year is required."
    );
  }

  const movie_id = `${movie.title}-${movie.year}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

  const movie_data = {
    title: movie.title,
    year: movie.year,
    franchise: movie.franchise ?? null,
    series: movie.series ?? null,
    production_company: movie.production_company ?? null,
    genres: Array.isArray(movie.genres) ? movie.genres : [],
    status: movie.status ?? "watched",
    my_rating: movie.my_rating ?? null,
    audience_rating: movie.audience_rating ?? null,
    tomato_rating: movie.tomato_rating ?? null,
  };

  await db
      .collection("users")
      .doc(uid)
      .collection("movies")
      .doc(movie_id)
      .set(movie_data);

  return {
    success: true,
    movie_id: movie_id,
  };
});

exports.setSupabaseRole = onCall(async (request) => {
    if (!request.auth) {
        throw new HttpsError(
            "unauthenticated",
            "You must be logged in."
        );
    }

    const uid = request.auth.uid;
    const user = await getAuth().getUser(uid);

    await getAuth().setCustomUserClaims(uid, {
        ...user.customClaims,
        role: "authenticated",
    });

    return {
        success: true,
        message: "Supabase authenticated role added.",
    };
});

//? ------------------------------
//* ----- TMDB Movie Data -------
//? ------------------------------
//#region
const tmdb_read_access_token = defineSecret("TMDB_READ_ACCESS_TOKEN");

exports.getMovieMetadata = onCall(
    {secrets: [tmdb_read_access_token]},
    async (request) => {
        if (!request.auth) {
            throw new HttpsError(
                "unauthenticated",
                "You must be logged in."
            );
        }

        const title = request.data?.title;
        const year = request.data?.year;

        if (!title || typeof title !== "string") {
            throw new HttpsError(
                "invalid-argument",
                "Movie title is required."
            );
        }

        if (year !== undefined && year !== null &&
            (!Number.isInteger(year) || year < 1888)) {
            throw new HttpsError(
                "invalid-argument",
                "Movie year must be a valid integer."
            );
        }

        const search_url = new URL(
            "https://api.themoviedb.org/3/search/movie"
        );
        search_url.searchParams.set("query", title);
        search_url.searchParams.set("include_adult", "false");
        search_url.searchParams.set("language", "en-US");

        if (year) {
            search_url.searchParams.set("year", String(year));
        }

        const headers = {
            Authorization: `Bearer ${tmdb_read_access_token.value()}`,
            accept: "application/json",
        };

        const search_response = await fetch(search_url, {headers});

        if (!search_response.ok) {
            logger.error("TMDB search failed.", {
                status: search_response.status,
            });

            throw new HttpsError(
                "internal",
                "TMDB movie search failed."
            );
        }

        const search_data = await search_response.json();
        const match = search_data.results?.[0];

        if (!match) {
            throw new HttpsError(
                "not-found",
                "No matching movie was found on TMDB."
            );
        }

        const details_url =
            `https://api.themoviedb.org/3/movie/${match.id}?language=en-US`;

        const details_response = await fetch(details_url, {headers});

        if (!details_response.ok) {
            logger.error("TMDB details request failed.", {
                status: details_response.status,
                tmdb_id: match.id,
            });

            throw new HttpsError(
                "internal",
                "TMDB movie details request failed."
            );
        }

        const movie = await details_response.json();

        return {
            tmdb_id: movie.id,
            title: movie.title,
            original_title: movie.original_title,
            year: movie.release_date ?
                Number(movie.release_date.slice(0, 4)) :
                null,
            release_date: movie.release_date || null,
            overview: movie.overview || null,
            genres: Array.isArray(movie.genres) ?
                movie.genres.map((genre) => genre.name) :
                [],
            runtime_minutes: movie.runtime || null,
            poster_url: movie.poster_path ?
                `https://image.tmdb.org/t/p/w500${movie.poster_path}` :
                null,
            backdrop_url: movie.backdrop_path ?
                `https://image.tmdb.org/t/p/w1280${movie.backdrop_path}` :
                null,
            tmdb_rating: movie.vote_average ?? null,
            tmdb_vote_count: movie.vote_count ?? null,
        };
    }
);


exports.getMovieRecommendations = onCall(
    {secrets: [tmdb_read_access_token]},
    async (request) => {
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "You must be logged in.");
        }

        const watched_movies = Array.isArray(request.data?.movies)
            ? request.data.movies
            : [];

        if (watched_movies.length === 0) {
            return {recommendations: []};
        }

        const headers = {
            Authorization: `Bearer ${tmdb_read_access_token.value()}`,
            accept: "application/json",
        };

        const watched_keys = new Set(
            watched_movies.map((movie) =>
                `${String(movie.title).toLowerCase()}|${movie.year}`
            )
        );

        const seeds = [...watched_movies]
            .sort((a, b) => {
                const a_score = a.my_rating ?? a.tmdb_rating ?? 0;
                const b_score = b.my_rating ?? b.tmdb_rating ?? 0;
                return b_score - a_score;
            })
            .slice(0, 8);

        const candidates = new Map();

        for (const seed of seeds) {
            const search_url = new URL(
                "https://api.themoviedb.org/3/search/movie"
            );
            search_url.searchParams.set("query", seed.title);
            search_url.searchParams.set("year", String(seed.year));
            search_url.searchParams.set("include_adult", "false");
            search_url.searchParams.set("language", "en-US");

            const search_response = await fetch(search_url, {headers});

            if (!search_response.ok) {
                continue;
            }

            const search_data = await search_response.json();
            const match = search_data.results?.[0];

            if (!match) {
                continue;
            }

            const recommendations_url =
                `https://api.themoviedb.org/3/movie/${match.id}/recommendations?language=en-US&page=1`;

            const recommendations_response = await fetch(
                recommendations_url,
                {headers}
            );

            if (!recommendations_response.ok) {
                continue;
            }

            const recommendations_data =
                await recommendations_response.json();

            for (const movie of recommendations_data.results || []) {
                const year = movie.release_date ?
                    Number(movie.release_date.slice(0, 4)) :
                    null;

                if (!year || !movie.poster_path) {
                    continue;
                }

                const key = `${movie.title.toLowerCase()}|${year}`;

                if (watched_keys.has(key)) {
                    continue;
                }

                const existing = candidates.get(movie.id);
                const seed_weight = seed.my_rating !== null &&
                    seed.my_rating !== undefined ?
                    Number(seed.my_rating) :
                    Number(seed.tmdb_rating || 5);

                const score = seed_weight +
                    Number(movie.vote_average || 0) +
                    Math.min(Number(movie.vote_count || 0) / 1000, 5);

                if (existing) {
                    existing.score += score;
                    existing.matches += 1;
                    existing.because_of.push(seed.title);
                } else {
                    candidates.set(movie.id, {
                        tmdb_id: movie.id,
                        title: movie.title,
                        year,
                        poster_url:
                            `https://image.tmdb.org/t/p/w500${movie.poster_path}`,
                        tmdb_rating: movie.vote_average ?? null,
                        overview: movie.overview || "",
                        score,
                        matches: 1,
                        because_of: [seed.title],
                    });
                }
            }
        }

        const recommendations = [...candidates.values()]
            .sort((a, b) => {
                if (b.matches !== a.matches) {
                    return b.matches - a.matches;
                }

                return b.score - a.score;
            })
            .slice(0, 18)
            .map((movie) => ({
                ...movie,
                because_of: [...new Set(movie.because_of)].slice(0, 2),
            }));

        return {recommendations};
    }
);


exports.getTVShowMetadata = onCall(
    {secrets: [tmdb_read_access_token]},
    async (request) => {
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "You must be logged in.");
        }

        const title = request.data?.title;
        const year = request.data?.year;

        if (!title || typeof title !== "string") {
            throw new HttpsError("invalid-argument", "TV show title is required.");
        }

        const search_url = new URL("https://api.themoviedb.org/3/search/tv");
        search_url.searchParams.set("query", title);
        search_url.searchParams.set("include_adult", "false");
        search_url.searchParams.set("language", "en-US");

        if (year) {
            search_url.searchParams.set("first_air_date_year", String(year));
        }

        const headers = {
            Authorization: `Bearer ${tmdb_read_access_token.value()}`,
            accept: "application/json",
        };

        const search_response = await fetch(search_url, {headers});

        if (!search_response.ok) {
            throw new HttpsError("internal", "TMDB TV search failed.");
        }

        const search_data = await search_response.json();
        const match = search_data.results?.[0];

        if (!match) {
            throw new HttpsError("not-found", "No matching TV show was found on TMDB.");
        }

        const details_url =
            `https://api.themoviedb.org/3/tv/${match.id}?language=en-US`;
        const details_response = await fetch(details_url, {headers});

        if (!details_response.ok) {
            throw new HttpsError("internal", "TMDB TV details request failed.");
        }

        const show = await details_response.json();

        return {
            tmdb_id: show.id,
            title: show.name,
            year: show.first_air_date ?
                Number(show.first_air_date.slice(0, 4)) :
                null,
            genres: Array.isArray(show.genres) ?
                show.genres.map((genre) => genre.name) :
                [],
            poster_url: show.poster_path ?
                `https://image.tmdb.org/t/p/w500${show.poster_path}` :
                null,
            tmdb_rating: show.vote_average ?? null,
        };
    }
);



exports.getTVShowRecommendations = onCall(
    {secrets: [tmdb_read_access_token]},
    async (request) => {
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "You must be logged in.");
        }

        const watched_shows = Array.isArray(request.data?.shows)
            ? request.data.shows
            : [];

        if (watched_shows.length === 0) {
            return {recommendations: []};
        }

        const headers = {
            Authorization: `Bearer ${tmdb_read_access_token.value()}`,
            accept: "application/json",
        };

        const watched_keys = new Set(
            watched_shows.map((show) =>
                `${String(show.title).toLowerCase()}|${show.year}`
            )
        );

        const seeds = [...watched_shows]
            .sort((a, b) =>
                (b.my_rating ?? b.tmdb_rating ?? 0) -
                (a.my_rating ?? a.tmdb_rating ?? 0)
            )
            .slice(0, 8);

        const candidates = new Map();

        for (const seed of seeds) {
            const search_url = new URL(
                "https://api.themoviedb.org/3/search/tv"
            );
            search_url.searchParams.set("query", seed.title);
            search_url.searchParams.set(
                "first_air_date_year",
                String(seed.year)
            );
            search_url.searchParams.set("include_adult", "false");
            search_url.searchParams.set("language", "en-US");

            const search_response = await fetch(search_url, {headers});
            if (!search_response.ok) continue;

            const search_data = await search_response.json();
            const match = search_data.results?.[0];
            if (!match) continue;

            const recommendations_url =
                `https://api.themoviedb.org/3/tv/${match.id}/recommendations?language=en-US&page=1`;
            const response = await fetch(recommendations_url, {headers});
            if (!response.ok) continue;

            const data = await response.json();

            for (const show of data.results || []) {
                const year = show.first_air_date ?
                    Number(show.first_air_date.slice(0, 4)) :
                    null;

                if (!year || !show.poster_path) continue;

                const key = `${show.name.toLowerCase()}|${year}`;
                if (watched_keys.has(key)) continue;

                const existing = candidates.get(show.id);
                const seed_weight = Number(
                    seed.my_rating ?? seed.tmdb_rating ?? 5
                );
                const score = seed_weight +
                    Number(show.vote_average || 0) +
                    Math.min(Number(show.vote_count || 0) / 1000, 5);

                if (existing) {
                    existing.score += score;
                    existing.matches += 1;
                    existing.because_of.push(seed.title);
                } else {
                    candidates.set(show.id, {
                        tmdb_id: show.id,
                        title: show.name,
                        year,
                        poster_url:
                            `https://image.tmdb.org/t/p/w500${show.poster_path}`,
                        tmdb_rating: show.vote_average ?? null,
                        overview: show.overview || "",
                        score,
                        matches: 1,
                        because_of: [seed.title],
                    });
                }
            }
        }

        const recommendations = [...candidates.values()]
            .sort((a, b) => {
                if (b.matches !== a.matches) return b.matches - a.matches;
                return b.score - a.score;
            })
            .slice(0, 18)
            .map((show) => ({
                ...show,
                because_of: [...new Set(show.because_of)].slice(0, 2),
            }));

        return {recommendations};
    }
);

//#endregion
