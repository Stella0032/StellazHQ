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
const crypto = require("crypto");


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

//? ------------------------------
//* ----- Invite-only Signup ----
//? ------------------------------
//#region
exports.createInvitedAccount = onCall(async (request) => {
    const email = String(request.data?.email || "").trim().toLowerCase();
    const password = String(request.data?.password || "");
    const invite_key = String(request.data?.invite_key || "").trim();

    if (!email || !email.includes("@") || password.length < 6 || !invite_key) {
        throw new HttpsError(
            "invalid-argument",
            "A valid email, password, and invite key are required."
        );
    }

    const key_hash = crypto
        .createHash("sha256")
        .update(invite_key)
        .digest("hex");

    const invite_ref = db.collection("invite_keys").doc(key_hash);
    const reservation_id = crypto.randomUUID();

    // Reserve one use first. Firestore transactions can retry, so no
    // Firebase Auth side effects happen inside this callback.
    await db.runTransaction(async (transaction) => {
        const invite_doc = await transaction.get(invite_ref);
        const invite = invite_doc.data();

        if (!invite_doc.exists ||
            invite?.is_active !== true ||
            Number(invite?.uses || 0) >= Number(invite?.max_uses || 1) ||
            (invite?.expires_at &&
                invite.expires_at.toDate() <= new Date())) {
            throw new HttpsError(
                "permission-denied",
                "That invite key is invalid, expired, or already used."
            );
        }

        transaction.update(invite_ref, {
            uses: Number(invite.uses || 0) + 1,
            pending_reservation: reservation_id,
            pending_email: email,
            reserved_at: new Date(),
        });
    });

    let user_record;

    try {
        user_record = await getAuth().createUser({
            email,
            password,
            emailVerified: false,
        });

        await getAuth().setCustomUserClaims(user_record.uid, {
            role: "authenticated",
        });

        await invite_ref.update({
            used_by: user_record.uid,
            used_at: new Date(),
            pending_reservation: FieldValue.delete(),
            pending_email: FieldValue.delete(),
            reserved_at: FieldValue.delete(),
        });
    } catch (error) {
        // Release this reservation if account creation or claim setup fails.
        await db.runTransaction(async (transaction) => {
            const invite_doc = await transaction.get(invite_ref);
            const invite = invite_doc.data();

            if (invite_doc.exists &&
                invite?.pending_reservation === reservation_id) {
                transaction.update(invite_ref, {
                    uses: Math.max(Number(invite.uses || 1) - 1, 0),
                    pending_reservation: FieldValue.delete(),
                    pending_email: FieldValue.delete(),
                    reserved_at: FieldValue.delete(),
                });
            }
        });

        if (user_record?.uid) {
            try {
                await getAuth().deleteUser(user_record.uid);
            } catch (cleanup_error) {
                console.error(
                    "Unable to clean up partially created user:",
                    cleanup_error
                );
            }
        }

        if (error.code === "auth/email-already-exists") {
            throw new HttpsError(
                "already-exists",
                "An account already exists for that email."
            );
        }

        if (error instanceof HttpsError) {
            throw error;
        }

        throw new HttpsError(
            "invalid-argument",
            "The account could not be created."
        );
    }

    return {success: true};
});
//#endregion


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

//? ---------------------------------
//* ----- MyAnimeList Connection ----
//? ---------------------------------
//#region
const mal_client_id = defineSecret("MAL_CLIENT_ID");
const mal_client_secret = defineSecret("MAL_CLIENT_SECRET");
const mal_redirect_uri =
    "https://stellaz.org/entertainment_page/Entertainment.html";

exports.getMALAuthorizationUrl = onCall(
    {secrets: [mal_client_id]},
    async (request) => {
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "You must be logged in.");
        }

        const state = String(request.data?.state || "");
        const code_verifier = String(request.data?.code_verifier || "");

        if (state.length < 32 ||
            code_verifier.length < 43 ||
            code_verifier.length > 128) {
            throw new HttpsError(
                "invalid-argument",
                "Invalid MyAnimeList authorization request."
            );
        }

        const url = new URL("https://myanimelist.net/v1/oauth2/authorize");
        url.searchParams.set("response_type", "code");
        url.searchParams.set("client_id", mal_client_id.value());
        url.searchParams.set("state", state);
        url.searchParams.set("redirect_uri", mal_redirect_uri);
        url.searchParams.set("code_challenge", code_verifier);
        url.searchParams.set("code_challenge_method", "plain");

        return {authorization_url: url.toString()};
    }
);

exports.exchangeMALAuthorizationCode = onCall(
    {secrets: [mal_client_id, mal_client_secret]},
    async (request) => {
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "You must be logged in.");
        }

        const code = String(request.data?.code || "");
        const code_verifier = String(request.data?.code_verifier || "");

        if (!code || code_verifier.length < 43 || code_verifier.length > 128) {
            throw new HttpsError(
                "invalid-argument",
                "Invalid MyAnimeList authorization response."
            );
        }

        const body = new URLSearchParams({
            client_id: mal_client_id.value(),
            client_secret: mal_client_secret.value(),
            grant_type: "authorization_code",
            code,
            redirect_uri: mal_redirect_uri,
            code_verifier,
        });

        const response = await fetch(
            "https://myanimelist.net/v1/oauth2/token",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                body,
            }
        );

        if (!response.ok) {
            logger.error("MAL token exchange failed.", {
                status: response.status,
            });
            throw new HttpsError(
                "internal",
                "MyAnimeList authorization could not be completed."
            );
        }

        const tokens = await response.json();
        const expires_at = Date.now() + Number(tokens.expires_in || 0) * 1000;

        // Kept outside /users so the website's user Firestore rules cannot
        // read OAuth tokens. Only trusted Admin SDK code accesses this data.
        await db.collection("mal_connections").doc(request.auth.uid).set({
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token,
            token_type: tokens.token_type || "Bearer",
            expires_at,
            connected_at: new Date(),
        }, {merge: true});

        return {success: true};
    }
);

exports.getMALConnectionStatus = onCall(async (request) => {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "You must be logged in.");
    }

    const connection = await db
        .collection("mal_connections")
        .doc(request.auth.uid)
        .get();

    return {connected: connection.exists};
});


async function get_valid_mal_access_token(uid) {
    const ref = db.collection("mal_connections").doc(uid);
    const snapshot = await ref.get();

    if (!snapshot.exists) {
        throw new HttpsError(
            "failed-precondition",
            "Connect MyAnimeList before syncing."
        );
    }

    const connection = snapshot.data();

    if (Number(connection.expires_at || 0) > Date.now() + 60000) {
        return connection.access_token;
    }

    const body = new URLSearchParams({
        client_id: mal_client_id.value(),
        client_secret: mal_client_secret.value(),
        grant_type: "refresh_token",
        refresh_token: connection.refresh_token,
    });

    const response = await fetch(
        "https://myanimelist.net/v1/oauth2/token",
        {
            method: "POST",
            headers: {"Content-Type": "application/x-www-form-urlencoded"},
            body,
        }
    );

    if (!response.ok) {
        throw new HttpsError(
            "unauthenticated",
            "Your MyAnimeList connection needs to be renewed."
        );
    }

    const tokens = await response.json();
    const expires_at = Date.now() + Number(tokens.expires_in || 0) * 1000;

    await ref.set({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token || connection.refresh_token,
        token_type: tokens.token_type || "Bearer",
        expires_at,
        refreshed_at: new Date(),
    }, {merge: true});

    return tokens.access_token;
}

exports.updateMALAnimeStatus = onCall(
    {secrets: [mal_client_id, mal_client_secret]},
    async (request) => {
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "You must be logged in.");
        }

        const anime_id = Number(request.data?.anime_id);
        const allowed_statuses = [
            "watching",
            "completed",
            "on_hold",
            "dropped",
            "plan_to_watch",
        ];
        const status = String(request.data?.status || "");
        let episodes_watched = Number(request.data?.episodes_watched || 0);
        const total_episodes = Number(request.data?.total_episodes || 0);
        const score = request.data?.score === null ||
            request.data?.score === undefined ||
            request.data?.score === "" ?
            0 : Number(request.data.score);

        if (!Number.isInteger(anime_id) || anime_id <= 0 ||
            !allowed_statuses.includes(status) ||
            !Number.isInteger(episodes_watched) || episodes_watched < 0 ||
            !Number.isInteger(score) || score < 0 || score > 10) {
            throw new HttpsError(
                "invalid-argument",
                "Invalid MyAnimeList update."
            );
        }

        if (status === "completed" && total_episodes > 0) {
            episodes_watched = total_episodes;
        }

        if (total_episodes > 0) {
            episodes_watched = Math.min(episodes_watched, total_episodes);
        }

        const access_token =
            await get_valid_mal_access_token(request.auth.uid);
        const body = new URLSearchParams({
            status,
            num_watched_episodes: String(episodes_watched),
            score: String(score),
        });

        const response = await fetch(
            `https://api.myanimelist.net/v2/anime/${anime_id}/my_list_status`,
            {
                method: "PATCH",
                headers: {
                    Authorization: `Bearer ${access_token}`,
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                body,
            }
        );

        if (!response.ok) {
            logger.error("MAL anime status update failed.", {
                status: response.status,
            });
            throw new HttpsError(
                "internal",
                "MyAnimeList could not update this anime."
            );
        }

        return await response.json();
    }
);

exports.syncMALAnimeList = onCall(
    {secrets: [mal_client_id, mal_client_secret], timeoutSeconds: 120},
    async (request) => {
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "You must be logged in.");
        }

        const access_token =
            await get_valid_mal_access_token(request.auth.uid);
        const fields = [
            "list_status",
            "num_episodes",
            "media_type",
            "start_date",
            "end_date",
            "average_episode_duration",
        ].join(",");

        let url = new URL("https://api.myanimelist.net/v2/users/@me/animelist");
        url.searchParams.set("limit", "1000");
        url.searchParams.set("fields", fields);

        const anime = [];

        while (url) {
            const response = await fetch(url, {
                headers: {Authorization: `Bearer ${access_token}`},
            });

            if (!response.ok) {
                logger.error("MAL anime list request failed.", {
                    status: response.status,
                });
                throw new HttpsError(
                    "internal",
                    "MyAnimeList anime sync failed."
                );
            }

            const data = await response.json();

            for (const item of data.data || []) {
                const node = item.node || {};
                const status = item.list_status || {};

                anime.push({
                    mal_id: node.id,
                    title: node.title,
                    status: status.status || "plan_to_watch",
                    episodes_watched: Number(status.num_episodes_watched || 0),
                    total_episodes: Number(node.num_episodes || 0),
                    my_rating: Number(status.score || 0) || null,
                    poster_url:
                        node.main_picture?.large ||
                        node.main_picture?.medium ||
                        null,
                    media_type: node.media_type || null,
                    start_date: status.start_date || null,
                    finish_date: status.finish_date || null,
                    mal_updated_at: status.updated_at || null,
                    average_episode_duration_ms:
                        Number(node.average_episode_duration || 0),
                });
            }

            url = data.paging?.next ? new URL(data.paging.next) : null;
        }

        return {anime, count: anime.length};
    }
);
//#endregion


//? ------------------------------
//* ----- TMDB Movie Data -------
//? ------------------------------
//#region
const tmdb_read_access_token = defineSecret("TMDB_READ_ACCESS_TOKEN");

exports.searchEntertainmentTitles = onCall(
    {secrets: [tmdb_read_access_token]},
    async (request) => {
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "You must be logged in.");
        }

        const query = String(request.data?.query || "").trim();
        const type = request.data?.type === "show" ? "tv" : "movie";

        if (query.length < 2) {
            return {results: []};
        }

        const search_url = new URL(
            `https://api.themoviedb.org/3/search/${type}`
        );
        search_url.searchParams.set("query", query);
        search_url.searchParams.set("include_adult", "false");
        search_url.searchParams.set("language", "en-US");
        search_url.searchParams.set("page", "1");

        const response = await fetch(search_url, {
            headers: {
                Authorization: `Bearer ${tmdb_read_access_token.value()}`,
                accept: "application/json",
            },
        });

        if (!response.ok) {
            throw new HttpsError("internal", "TMDB title search failed.");
        }

        const data = await response.json();
        const results = (data.results || []).slice(0, 8).map((item) => {
            const title = type === "tv" ? item.name : item.title;
            const date = type === "tv" ?
                item.first_air_date :
                item.release_date;

            return {
                tmdb_id: item.id,
                title,
                year: date ? Number(date.slice(0, 4)) : null,
                poster_url: item.poster_path ?
                    `https://image.tmdb.org/t/p/w185${item.poster_path}` :
                    null,
            };
        }).filter((item) => item.title && item.year);

        return {results};
    }
);


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
            average_episode_runtime_minutes: (() => {
                const runtimes = Array.isArray(show.episode_run_time) ?
                    show.episode_run_time.filter(
                        (runtime) => Number(runtime) > 0
                    ) :
                    [];

                if (runtimes.length > 0) {
                    return Math.round(
                        runtimes.reduce(
                            (total, runtime) => total + Number(runtime),
                            0
                        ) / runtimes.length
                    );
                }

                const recent_runtime =
                    Number(show.last_episode_to_air?.runtime) ||
                    Number(show.next_episode_to_air?.runtime);

                return recent_runtime > 0 ? recent_runtime : null;
            })(),
        };
    }
);



exports.getTVShowSeasons = onCall(
    {secrets: [tmdb_read_access_token]},
    async (request) => {
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "You must be logged in.");
        }

        const title = String(request.data?.title || "").trim();
        const year = Number(request.data?.year);

        if (!title) {
            throw new HttpsError("invalid-argument", "TV show title is required.");
        }

        const headers = {
            Authorization: `Bearer ${tmdb_read_access_token.value()}`,
            accept: "application/json",
        };
        const search_url = new URL("https://api.themoviedb.org/3/search/tv");
        search_url.searchParams.set("query", title);
        search_url.searchParams.set("language", "en-US");
        if (year) {
            search_url.searchParams.set("first_air_date_year", String(year));
        }

        const search_response = await fetch(search_url, {headers});
        if (!search_response.ok) {
            throw new HttpsError("internal", "TMDB TV search failed.");
        }

        const search_data = await search_response.json();
        const match = search_data.results?.[0];
        if (!match) {
            throw new HttpsError("not-found", "TV show not found.");
        }

        const details_response = await fetch(
            `https://api.themoviedb.org/3/tv/${match.id}?language=en-US`,
            {headers}
        );
        if (!details_response.ok) {
            throw new HttpsError("internal", "TMDB TV details request failed.");
        }

        const show = await details_response.json();
        const seasons = (show.seasons || [])
            .filter((season) => season.season_number > 0)
            .map((season) => ({
                season_number: season.season_number,
                name: season.name,
                episode_count: season.episode_count,
                air_date: season.air_date || null,
                poster_url: season.poster_path ?
                    `https://image.tmdb.org/t/p/w500${season.poster_path}` :
                    null,
            }));

        return {
            tmdb_id: show.id,
            title: show.name,
            seasons,
        };
    }
);

exports.getTVSeasonEpisodes = onCall(
    {secrets: [tmdb_read_access_token]},
    async (request) => {
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "You must be logged in.");
        }

        const tmdb_id = Number(request.data?.tmdb_id);
        const season_number = Number(request.data?.season_number);

        if (!Number.isInteger(tmdb_id) || !Number.isInteger(season_number)) {
            throw new HttpsError("invalid-argument", "Show and season are required.");
        }

        const response = await fetch(
            `https://api.themoviedb.org/3/tv/${tmdb_id}/season/${season_number}?language=en-US`,
            {
                headers: {
                    Authorization: `Bearer ${tmdb_read_access_token.value()}`,
                    accept: "application/json",
                },
            }
        );

        if (!response.ok) {
            throw new HttpsError("internal", "TMDB season request failed.");
        }

        const season = await response.json();

        return {
            name: season.name,
            season_number: season.season_number,
            episodes: (season.episodes || []).map((episode) => ({
                episode_number: episode.episode_number,
                name: episode.name,
                air_date: episode.air_date || null,
                runtime_minutes: episode.runtime || null,
                tmdb_rating: episode.vote_average ?? null,
                overview: episode.overview || "",
                still_url: episode.still_path ?
                    `https://image.tmdb.org/t/p/w500${episode.still_path}` :
                    null,
            })),
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
