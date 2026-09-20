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

exports.getMALAnimeRecommendations = onCall(
    {secrets: [mal_client_id, mal_client_secret]},
    async (request) => {
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "You must be logged in.");
        }

        const seed_ids = Array.isArray(request.data?.seed_ids)
            ? request.data.seed_ids.map(Number).filter((id) => Number.isInteger(id) && id > 0).slice(0, 8)
            : [];
        const library_ids = new Set(
            Array.isArray(request.data?.library_ids)
                ? request.data.library_ids.map(Number)
                : []
        );

        if (seed_ids.length === 0) {
            return {recommendations: []};
        }

        const access_token = await get_valid_mal_access_token(request.auth.uid);
        const candidates = new Map();

        for (const seed_id of seed_ids) {
            const response = await fetch(
                `https://api.myanimelist.net/v2/anime/${seed_id}?fields=recommendations{limit:20}`,
                {headers: {Authorization: `Bearer ${access_token}`}}
            );

            if (!response.ok) {
                logger.warn("MAL recommendations request failed.", {
                    seed_id,
                    status: response.status,
                });
                continue;
            }

            const payload = await response.json();

            for (const item of payload.recommendations || []) {
                const node = item.node || {};
                const mal_id = Number(node.id);

                if (!mal_id || library_ids.has(mal_id)) {
                    continue;
                }

                const existing = candidates.get(mal_id) || {
                    mal_id,
                    title: node.title,
                    poster_url: node.main_picture?.large ||
                        node.main_picture?.medium || "",
                    recommendation_strength: 0,
                    because_of: [],
                };

                existing.recommendation_strength +=
                    Number(item.num_recommendations || 1);

                if (!existing.because_of.includes(String(seed_id))) {
                    existing.because_of.push(String(seed_id));
                }

                candidates.set(mal_id, existing);
            }
        }

        const recommendations = [...candidates.values()]
            .sort((a, b) =>
                b.recommendation_strength - a.recommendation_strength
            )
            .slice(0, 18);

        return {recommendations};
    }
);

exports.searchMALAnime = onCall(
    {secrets: [mal_client_id]},
    async (request) => {
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "You must be logged in.");
        }

        const query = String(request.data?.query || "").trim();
        if (query.length < 2) return {results: []};

        const url = new URL("https://api.myanimelist.net/v2/anime");
        url.searchParams.set("q", query);
        url.searchParams.set("limit", "8");
        url.searchParams.set(
            "fields",
            "id,title,main_picture,start_date,mean,num_episodes,media_type"
        );

        const response = await fetch(url, {
            headers: {"X-MAL-CLIENT-ID": mal_client_id.value()},
        });

        if (!response.ok) {
            logger.error("MAL anime search failed.", {
                status: response.status,
            });
            throw new HttpsError(
                "internal",
                "MyAnimeList search failed."
            );
        }

        const data = await response.json();
        return {
            results: (data.data || []).map(({node}) => ({
                mal_id: Number(node.id),
                title: node.title,
                poster_url: node.main_picture?.large ||
                    node.main_picture?.medium || null,
                start_date: node.start_date || null,
                mal_score: Number(node.mean || 0) || null,
                total_episodes: Number(node.num_episodes || 0),
                media_type: node.media_type || null,
            })),
        };
    }
);


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

exports.getMALAnimeDetails = onCall(
    {secrets: [mal_client_id, mal_client_secret]},
    async (request) => {
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "You must be logged in.");
        }

        const anime_id = Number(request.data?.anime_id);
        if (!Number.isInteger(anime_id) || anime_id <= 0) {
            throw new HttpsError("invalid-argument", "Anime ID is required.");
        }

        const access_token =
            await get_valid_mal_access_token(request.auth.uid);
        const url = new URL(
            `https://api.myanimelist.net/v2/anime/${anime_id}`
        );
        url.searchParams.set("fields", [
            "id", "title", "main_picture", "alternative_titles",
            "start_date", "end_date", "synopsis", "mean", "rank",
            "popularity", "num_list_users", "num_scoring_users",
            "nsfw", "genres", "media_type", "status", "num_episodes",
            "start_season", "broadcast", "source",
            "average_episode_duration", "rating", "studios",
        ].join(","));

        const response = await fetch(url, {
            headers: {Authorization: `Bearer ${access_token}`},
        });

        if (!response.ok) {
            logger.error("MAL anime details request failed.", {
                anime_id,
                status: response.status,
            });
            throw new HttpsError(
                "internal",
                "MyAnimeList could not load this anime."
            );
        }

        const data = await response.json();
        return {
            ...data,
            genres: (data.genres || []).map((genre) => genre.name),
            studios: (data.studios || []).map((studio) => studio.name),
        };
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
            "mean",
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

                let mal_score = Number(node.mean || 0) || null;

                // MAL's user-list response does not reliably include the
                // community mean score even when "mean" is requested.
                // Fetch the anime details only when that value is missing.
                if (!mal_score && node.id) {
                    const details_url = new URL(
                        `https://api.myanimelist.net/v2/anime/${node.id}`
                    );
                    details_url.searchParams.set("fields", "mean");

                    const details_response = await fetch(details_url, {
                        headers: {Authorization: `Bearer ${access_token}`},
                    });

                    if (details_response.ok) {
                        const details = await details_response.json();
                        mal_score = Number(details.mean || 0) || null;
                    } else {
                        logger.warn("MAL score lookup failed.", {
                            anime_id: node.id,
                            status: details_response.status,
                        });
                    }
                }

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
                    mal_score,
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


exports.getAnimeBackdrop = onCall(
    {secrets: [tmdb_read_access_token]},
    async (request) => {
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "You must be logged in.");
        }

        const title = String(request.data?.title || "").trim();
        if (!title) {
            throw new HttpsError("invalid-argument", "Anime title is required.");
        }

        const search_url = new URL("https://api.themoviedb.org/3/search/tv");
        search_url.searchParams.set("query", title);
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
            throw new HttpsError("internal", "TMDB anime search failed.");
        }

        const data = await response.json();
        const normalized = title.toLowerCase();
        const candidates = (data.results || []).filter((item) =>
            item.backdrop_path
        );
        const match = candidates.find((item) =>
            String(item.name || "").toLowerCase() === normalized ||
            String(item.original_name || "").toLowerCase() === normalized
        ) || candidates[0];

        return {
            backdrop_url: match?.backdrop_path ?
                `https://image.tmdb.org/t/p/original${match.backdrop_path}` :
                null,
        };
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


exports.getEntertainmentReleases = onCall(
    {secrets: [tmdb_read_access_token, mal_client_id, mal_client_secret]},
    async (request) => {
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "You must be logged in.");
        }

        const type = String(request.data?.type || "movie");
        const headers = {
            Authorization: `Bearer ${tmdb_read_access_token.value()}`,
            accept: "application/json",
        };

        if (type === "anime") {
            const access_token =
                await get_valid_mal_access_token(request.auth.uid);
            const mal_headers = {Authorization: `Bearer ${access_token}`};
            const now = new Date();
            const month = now.getUTCMonth() + 1;
            const season = month <= 3 ? "winter" :
                month <= 6 ? "spring" :
                    month <= 9 ? "summer" : "fall";
            const year = now.getUTCFullYear();
            const today = now.toISOString().slice(0, 10);

            const season_url = new URL(
                `https://api.myanimelist.net/v2/anime/season/${year}/${season}`
            );
            season_url.searchParams.set("limit", "100");
            season_url.searchParams.set(
                "fields",
                "start_date,mean,main_picture"
            );

            const upcoming_url = new URL(
                "https://api.myanimelist.net/v2/anime/ranking"
            );
            upcoming_url.searchParams.set("ranking_type", "upcoming");
            upcoming_url.searchParams.set("limit", "20");
            upcoming_url.searchParams.set(
                "fields",
                "start_date,mean,main_picture"
            );

            const [season_response, upcoming_response] = await Promise.all([
                fetch(season_url, {headers: mal_headers}),
                fetch(upcoming_url, {headers: mal_headers}),
            ]);

            const season_data = season_response.ok ?
                await season_response.json() : {data: []};
            const upcoming_data = upcoming_response.ok ?
                await upcoming_response.json() : {data: []};

            const map_anime = (item) => {
                const node = item.node || {};
                return {
                    mal_id: node.id,
                    title: node.title,
                    release_date: node.start_date || null,
                    poster_url: node.main_picture?.large ||
                        node.main_picture?.medium || "",
                    rating: node.mean ?? null,
                };
            };

            const newly_released = (season_data.data || [])
                .map(map_anime)
                .filter((item) =>
                    item.release_date && item.release_date <= today
                )
                .sort((a, b) =>
                    String(b.release_date).localeCompare(a.release_date)
                )
                .slice(0, 7);

            const upcoming = (upcoming_data.data || [])
                .map(map_anime)
                .filter((item) =>
                    !item.release_date || item.release_date > today
                )
                .slice(0, 7);

            return {newly_released, upcoming};
        }

        const media_type = type === "show" ? "tv" : "movie";
        const new_endpoint = media_type === "movie" ?
            "now_playing" : "on_the_air";
        const upcoming_endpoint = media_type === "movie" ?
            "upcoming" : "airing_today";

        const fetch_tmdb = async (endpoint) => {
            const url = new URL(
                `https://api.themoviedb.org/3/${media_type}/${endpoint}`
            );
            url.searchParams.set("language", "en-US");
            url.searchParams.set("page", "1");
            const response = await fetch(url, {headers});
            if (!response.ok) return [];
            const data = await response.json();
            return (data.results || [])
                .filter((item) => item.poster_path)
                .slice(0, 7)
                .map((item) => ({
                    tmdb_id: item.id,
                    title: media_type === "tv" ? item.name : item.title,
                    release_date: media_type === "tv" ?
                        item.first_air_date : item.release_date,
                    poster_url:
                        `https://image.tmdb.org/t/p/w500${item.poster_path}`,
                    rating: item.vote_average ?? null,
                }));
        };

        const [newly_released, upcoming] = await Promise.all([
            fetch_tmdb(new_endpoint),
            fetch_tmdb(upcoming_endpoint),
        ]);

        return {newly_released, upcoming};
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
                        genre_ids: movie.genre_ids || [],
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
        const requested_tmdb_id = Number(request.data?.tmdb_id) || null;

        if ((!title || typeof title !== "string") && !requested_tmdb_id) {
            throw new HttpsError("invalid-argument", "TV show title or TMDB ID is required.");
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

        let tmdb_id = requested_tmdb_id;
        if (!tmdb_id) {
            const search_response = await fetch(search_url, {headers});
            if (!search_response.ok) {
                throw new HttpsError("internal", "TMDB TV search failed.");
            }
            const search_data = await search_response.json();
            const match = search_data.results?.[0];
            if (!match) {
                throw new HttpsError("not-found", "No matching TV show was found on TMDB.");
            }
            tmdb_id = match.id;
        }

        const details_url =
            `https://api.themoviedb.org/3/tv/${tmdb_id}?language=en-US`;
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
            tmdb_vote_count: show.vote_count ?? null,
            overview: show.overview || null,
            backdrop_url: show.backdrop_path ?
                `https://image.tmdb.org/t/p/w1280${show.backdrop_path}` :
                null,
            release_date: show.first_air_date || null,
            status: show.status || null,
            number_of_seasons: show.number_of_seasons ?? null,
            number_of_episodes: show.number_of_episodes ?? null,
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
                        genre_ids: show.genre_ids || [],
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


//? -------------------------
//* ----- Stellaz AI -------
//? -------------------------
//#region
const openai_api_key = defineSecret("OPENAI_API_KEY");
const supabase_secret_key = defineSecret("SUPABASE_SECRET_KEY");
const supabase_url = "https://xmycfxwapejnbpareaxc.supabase.co";

/**
 * Resolve one movie through TMDB and return the fields used by Stellaz.
 * The year is optional because the AI may know the title but not its date.
 */
async function resolve_ai_movie(title, year) {
    const search_url = new URL("https://api.themoviedb.org/3/search/movie");
    search_url.searchParams.set("query", title);
    search_url.searchParams.set("include_adult", "false");
    search_url.searchParams.set("language", "en-US");

    if (Number.isInteger(year)) {
        search_url.searchParams.set("year", String(year));
    }

    const headers = {
        Authorization: `Bearer ${tmdb_read_access_token.value()}`,
        accept: "application/json",
    };

    const search_response = await fetch(search_url, {headers});

    if (!search_response.ok) {
        throw new Error(`TMDB search failed for ${title}.`);
    }

    const search_data = await search_response.json();
    const match = search_data.results?.[0];

    if (!match) {
        return null;
    }

    const details_response = await fetch(
        `https://api.themoviedb.org/3/movie/${match.id}?language=en-US`,
        {headers}
    );

    if (!details_response.ok) {
        throw new Error(`TMDB details failed for ${title}.`);
    }

    const movie = await details_response.json();
    const release_year = movie.release_date ?
        Number(movie.release_date.slice(0, 4)) :
        null;

    if (!release_year) {
        return null;
    }

    return {
        title: movie.title,
        year: release_year,
        franchise: movie.belongs_to_collection?.name || null,
        production_company: movie.production_companies?.[0]?.name || null,
        genres: (movie.genres || []).map((genre) => genre.name),
        status: "watched",
        tmdb_rating: movie.vote_average ?? null,
        poster_url: movie.poster_path ?
            `https://image.tmdb.org/t/p/w500${movie.poster_path}` :
            null,
        runtime_minutes: movie.runtime || null,
    };
}

/**
 * Upsert movies for the Firebase-authenticated user only.
 * The UID always comes from request.auth and never from the AI/browser.
 */
async function save_ai_movies(uid, movies) {
    const endpoint = new URL(`${supabase_url}/rest/v1/movies`);
    endpoint.searchParams.set("on_conflict", "user_id,title,year");

    const rows = movies.map((movie) => ({
        user_id: uid,
        ...movie,
    }));

    const response = await fetch(endpoint, {
        method: "POST",
        headers: {
            apikey: supabase_secret_key.value(),
            Authorization: `Bearer ${supabase_secret_key.value()}`,
            "Content-Type": "application/json",
            Prefer: "resolution=merge-duplicates,return=representation",
        },
        body: JSON.stringify(rows),
    });

    if (!response.ok) {
        const error_text = await response.text();
        logger.error("Stellaz AI Supabase write failed.", {
            status: response.status,
            error: error_text,
        });
        throw new Error("The movie library could not be updated.");
    }

    return response.json();
}

exports.stellazAI = onCall(
    {
        secrets: [
            openai_api_key,
            supabase_secret_key,
            tmdb_read_access_token,
        ],
    },
    async (request) => {
        if (!request.auth) {
            throw new HttpsError(
                "unauthenticated",
                "You must be logged in to use Stellaz AI."
            );
        }

        const message = String(request.data?.message || "").trim();

        if (!message || message.length > 1000) {
            throw new HttpsError(
                "invalid-argument",
                "Send a message between 1 and 1000 characters."
            );
        }

        const ai_response = await fetch(
            "https://api.openai.com/v1/chat/completions",
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${openai_api_key.value()}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    model: "gpt-5.6-luna",
                    reasoning_effort: "low",
                    messages: [
                        {
                            role: "system",
                            content:
                                "You are Stellaz AI. For this first version, " +
                                "you only interpret requests to add watched " +
                                "movies. Extract every movie the user clearly " +
                                "asked to add, including all films when they " +
                                "name a franchise. Respect exclusions. Do not " +
                                "include TV series, anime series, unreleased " +
                                "films, or titles the user did not request. " +
                                "Use the canonical English title and release " +
                                "year when known. If the request is not an " +
                                "add-movie request, return an empty movies list.",
                        },
                        {
                            role: "user",
                            content: message,
                        },
                    ],
                    response_format: {
                        type: "json_schema",
                        json_schema: {
                            name: "stellaz_movie_request",
                            strict: true,
                            schema: {
                                type: "object",
                                properties: {
                                    movies: {
                                        type: "array",
                                        maxItems: 50,
                                        items: {
                                            type: "object",
                                            properties: {
                                                title: {type: "string"},
                                                year: {
                                                    type: ["integer", "null"],
                                                },
                                            },
                                            required: ["title", "year"],
                                            additionalProperties: false,
                                        },
                                    },
                                },
                                required: ["movies"],
                                additionalProperties: false,
                            },
                        },
                    },
                }),
            }
        );

        if (!ai_response.ok) {
            const error_text = await ai_response.text();
            logger.error("Stellaz AI OpenAI request failed.", {
                status: ai_response.status,
                error: error_text,
            });
            throw new HttpsError(
                "internal",
                "Stellaz AI could not understand that request."
            );
        }

        const ai_data = await ai_response.json();
        const content = ai_data.choices?.[0]?.message?.content;

        if (!content) {
            throw new HttpsError(
                "internal",
                "Stellaz AI returned an empty response."
            );
        }

        const parsed = JSON.parse(content);
        const requested_movies = Array.isArray(parsed.movies) ?
            parsed.movies.slice(0, 50) :
            [];

        if (requested_movies.length === 0) {
            return {
                success: false,
                message:
                    "For now, Stellaz AI can add movies to your watched list.",
                added: [],
            };
        }

        const resolved = [];

        for (const movie of requested_movies) {
            const match = await resolve_ai_movie(
                String(movie.title || "").trim(),
                Number.isInteger(movie.year) ? movie.year : null
            );

            if (match) {
                resolved.push(match);
            }
        }

        if (resolved.length === 0) {
            return {
                success: false,
                message: "I couldn't find those movies on TMDB.",
                added: [],
            };
        }

        const saved = await save_ai_movies(request.auth.uid, resolved);
        const added = saved.map((movie) => ({
            title: movie.title,
            year: movie.year,
        }));

        return {
            success: true,
            message:
                `Added ${added.length} movie${added.length === 1 ? "" : "s"} ` +
                "to your watched list.",
            added,
        };
    }
);
//#endregion

//? ------------------------------
//* ----- Plex Connection --------
//? ------------------------------
//#region
const plex_client_identifier = "stellaz-hq-web";

exports.beginPlexConnection = onCall(async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "You must be logged in.");
    const forward_url = String(request.data?.forward_url || "");
    if (!/^https:\/\/(?:[^/]+\.)?stellaz\.org(?:\/|$)/i.test(forward_url) &&
        !/^http:\/\/localhost(?::\d+)?(?:\/|$)/i.test(forward_url)) {
        throw new HttpsError("invalid-argument", "Invalid Plex return URL.");
    }
    const response = await fetch("https://plex.tv/api/v2/pins?strong=true", {
        method: "POST",
        headers: {"Accept": "application/json", "X-Plex-Product": "Stellaz HQ",
            "X-Plex-Client-Identifier": plex_client_identifier},
    });
    if (!response.ok) throw new HttpsError("internal", "Plex connection could not start.");
    const pin = await response.json();
    await db.collection("plex_connection_attempts").doc(request.auth.uid).set({
        pin_id: Number(pin.id), created_at: new Date(),
    });
    const params = new URLSearchParams({
        clientID: plex_client_identifier, code: pin.code, forwardUrl: forward_url,
        "context[device][product]": "Stellaz HQ",
    });
    return {authorization_url: "https://app.plex.tv/auth#?" + params.toString()};
});

exports.finishPlexConnection = onCall(async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "You must be logged in.");
    const attempt_ref = db.collection("plex_connection_attempts").doc(request.auth.uid);
    const attempt = await attempt_ref.get();
    if (!attempt.exists) throw new HttpsError("failed-precondition", "Start Plex connection first.");
    const response = await fetch("https://plex.tv/api/v2/pins/" + Number(attempt.data().pin_id), {
        headers: {"Accept": "application/json", "X-Plex-Client-Identifier": plex_client_identifier},
    });
    if (!response.ok) throw new HttpsError("internal", "Plex connection could not be checked.");
    const pin = await response.json();
    if (!pin.authToken) return {connected: false};
    const account_response = await fetch("https://plex.tv/api/v2/user", {
        headers: {"Accept": "application/json", "X-Plex-Token": pin.authToken,
            "X-Plex-Client-Identifier": plex_client_identifier},
    });
    if (!account_response.ok) throw new HttpsError("internal", "Plex account could not be verified.");
    const account = await account_response.json();
    await db.collection("plex_connections").doc(request.auth.uid).set({
        access_token: pin.authToken, plex_user_id: String(account.id || ""),
        username: account.username || account.title || "", connected_at: new Date(),
    }, {merge: true});
    await attempt_ref.delete();
    return {connected: true, username: account.username || account.title || "Plex"};
});

exports.getPlexConnectionStatus = onCall(async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "You must be logged in.");
    const connection = await db.collection("plex_connections").doc(request.auth.uid).get();
    if (!connection.exists) return {connected: false};
    return {connected: true, username: connection.data().username || "Plex"};
});


async function plex_json(url, token) {
    const response = await fetch(url, {
        headers: {
            "Accept": "application/json",
            "X-Plex-Token": token,
            "X-Plex-Product": "Stellaz HQ",
            "X-Plex-Client-Identifier": plex_client_identifier,
        },
    });
    if (!response.ok) {
        throw new Error("Plex request failed (" + response.status + ").");
    }
    return response.json();
}

function plex_year(item) {
    if (Number(item.year)) return Number(item.year);
    const date = item.originallyAvailableAt || "";
    return /^\\d{4}/.test(date) ? Number(date.slice(0, 4)) : null;
}

function plex_guids(item) {
    return (item.Guid || []).map((entry) => entry.id).filter(Boolean);
}

exports.getPlexMetadataFallback = onCall(async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "You must be logged in.");
    const title = String(request.data?.title || "").trim();
    const year = Number(request.data?.year) || null;
    const media_type = request.data?.type === "movie" ? "movie" : "show";
    if (!title) throw new HttpsError("invalid-argument", "Title is required.");

    const connection = await db.collection("plex_connections").doc(request.auth.uid).get();
    if (!connection.exists || !connection.data().access_token) {
        throw new HttpsError("failed-precondition", "Connect Plex first.");
    }
    const account_token = connection.data().access_token;
    const resources = await plex_json(
        "https://clients.plex.tv/api/v2/resources?includeHttps=1&includeRelay=1",
        account_token
    );
    const servers = (resources || []).filter((resource) =>
        String(resource.provides || "").split(",").includes("server")
    );
    const normalize = (value) => String(value || "").trim().toLowerCase();
    for (const server of servers) {
        const token = server.accessToken || account_token;
        for (const connection_item of (server.connections || [])) {
            if (!connection_item.uri) continue;
            const base = connection_item.uri.replace(/\/$/, "");
            try {
                const sections_data = await plex_json(base + "/library/sections", token);
                const sections = sections_data.MediaContainer?.Directory || [];
                for (const section of sections) {
                    if (section.type !== media_type) continue;
                    const data = await plex_json(
                        base + "/library/sections/" + encodeURIComponent(section.key) + "/all",
                        token
                    );
                    const match = (data.MediaContainer?.Metadata || []).find((item) =>
                        normalize(item.title) === normalize(title) &&
                        (!year || !plex_year(item) || Number(plex_year(item)) === year)
                    );
                    if (!match) continue;
                    return {
                        title: match.title,
                        year: plex_year(match),
                        overview: match.summary || null,
                        genres: (match.Genre || []).map((genre) => genre.tag).filter(Boolean),
                        content_rating: match.contentRating || null,
                        studio: match.studio || null,
                        original_title: match.originalTitle || null,
                        release_date: match.originallyAvailableAt || null,
                        runtime_minutes: media_type === "movie" && match.duration ?
                            Math.round(Number(match.duration) / 60000) : null,
                        average_episode_runtime_minutes: media_type === "show" && match.duration ?
                            Math.round(Number(match.duration) / 60000) : null,
                        number_of_episodes: media_type === "show" ? Number(match.leafCount || 0) : null,
                        plex_thumb: match.thumb || null
                    };
                }
            } catch (_) {}
        }
    }
    throw new HttpsError("not-found", "That title was not found in Plex.");
});

exports.getPlexPoster = onCall(async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "You must be logged in.");
    const thumb = String(request.data?.thumb || "");
    if (!thumb.startsWith("/")) {
        throw new HttpsError("invalid-argument", "A valid Plex poster path is required.");
    }

    const connection = await db.collection("plex_connections").doc(request.auth.uid).get();
    if (!connection.exists || !connection.data().access_token) {
        throw new HttpsError("failed-precondition", "Connect Plex first.");
    }
    const account_token = connection.data().access_token;
    const resources = await plex_json(
        "https://clients.plex.tv/api/v2/resources?includeHttps=1&includeRelay=1",
        account_token
    );
    const servers = (resources || []).filter((resource) =>
        String(resource.provides || "").split(",").includes("server")
    );
    for (const server of servers) {
        const token = server.accessToken || account_token;
        for (const candidate of (server.connections || [])) {
            if (!candidate.uri) continue;
            try {
                const response = await fetch(candidate.uri.replace(/\/$/, "") + thumb, {
                    headers: {"X-Plex-Token": token}
                });
                if (!response.ok) continue;
                const bytes = Buffer.from(await response.arrayBuffer());
                return {
                    content_type: response.headers.get("content-type") || "image/jpeg",
                    data: bytes.toString("base64")
                };
            } catch (_) {}
        }
    }
    throw new HttpsError("not-found", "Plex poster could not be loaded.");
});

exports.getPlexImportPreview = onCall(async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "You must be logged in.");

    const connection = await db.collection("plex_connections")
        .doc(request.auth.uid).get();
    if (!connection.exists || !connection.data().access_token) {
        throw new HttpsError("failed-precondition", "Connect Plex first.");
    }

    const account_token = connection.data().access_token;
    const resources = await plex_json(
        "https://clients.plex.tv/api/v2/resources?includeHttps=1&includeRelay=1",
        account_token
    );
    const servers = (resources || []).filter((resource) =>
        resource.provides === "server" ||
        String(resource.provides || "").split(",").includes("server")
    );
    if (!servers.length) {
        throw new HttpsError("not-found", "No Plex Media Server was found on this account.");
    }

    let server = null;
    let base_url = null;
    for (const candidate of servers) {
        const connections = [...(candidate.connections || [])].sort((a, b) => {
            const score = (item) => (item.protocol === "https" ? 4 : 0) +
                (!item.relay ? 2 : 0) + (!item.local ? 1 : 0);
            return score(b) - score(a);
        });
        for (const candidate_connection of connections) {
            if (!candidate_connection.uri) continue;
            try {
                await plex_json(candidate_connection.uri + "/", candidate.accessToken || account_token);
                server = candidate;
                base_url = candidate_connection.uri.replace(/\/$/, "");
                break;
            } catch (_) {}
        }
        if (server) break;
    }
    if (!server || !base_url) {
        throw new HttpsError("unavailable",
            "Stellaz could not reach your Plex Media Server. Make sure Remote Access is available.");
    }

    const server_token = server.accessToken || account_token;
    const sections_data = await plex_json(base_url + "/library/sections", server_token);
    const sections = sections_data.MediaContainer?.Directory || [];
    const movies = [];
    const shows = [];
    const episodes = [];

    for (const section of sections) {
        if (section.type !== "movie" && section.type !== "show") continue;
        const all = await plex_json(
            base_url + "/library/sections/" + encodeURIComponent(section.key) + "/all",
            server_token
        );
        const items = all.MediaContainer?.Metadata || [];
        if (section.type === "movie") {
            for (const item of items) {
                const watched = Number(item.viewCount || 0) > 0;
                const rating = item.userRating == null ? null : Number(item.userRating);
                // A Plex library can contain thousands of unwatched server titles.
                // Import candidates are personal activity only: watched or rated.
                if (!watched && rating == null) continue;
                movies.push({
                    title: item.title,
                    year: plex_year(item),
                    rating,
                    watched,
                    guids: plex_guids(item),
                    tmdb_id: (() => {
                        const guid = plex_guids(item).find((id) => id.startsWith("tmdb://"));
                        return guid ? Number(guid.slice(7)) || null : null;
                    })(),
                    plex_thumb: item.thumb || null,
                    plex_art: item.art || null,
                    overview: item.summary || null,
                    genres: (item.Genre || []).map((genre) => genre.tag).filter(Boolean),
                    content_rating: item.contentRating || null,
                    studio: item.studio || null,
                    original_title: item.originalTitle || null,
                    release_date: item.originallyAvailableAt || null,
                    runtime_minutes: item.duration ? Math.round(Number(item.duration) / 60000) : null,
                });
            }
        } else {
            for (const item of items) {
                const watched_episodes = Number(item.viewedLeafCount || 0);
                const rating = item.userRating == null ? null : Number(item.userRating);
                // Keep shows only when this Plex user watched an episode or rated the show.
                if (watched_episodes <= 0 && rating == null) continue;
                shows.push({
                    title: item.title,
                    year: plex_year(item),
                    rating,
                    watched_episodes,
                    total_episodes: Number(item.leafCount || 0),
                    guids: plex_guids(item),
                    tmdb_id: (() => {
                        const guid = plex_guids(item).find((id) => id.startsWith("tmdb://"));
                        return guid ? Number(guid.slice(7)) || null : null;
                    })(),
                    plex_thumb: item.thumb || null,
                    plex_art: item.art || null,
                    overview: item.summary || null,
                    genres: (item.Genre || []).map((genre) => genre.tag).filter(Boolean),
                    content_rating: item.contentRating || null,
                    studio: item.studio || null,
                    original_title: item.originalTitle || null,
                    release_date: item.originallyAvailableAt || null,
                    average_episode_runtime_minutes: item.duration ? Math.round(Number(item.duration) / 60000) : null,
                });
            }
            const episode_data = await plex_json(
                base_url + "/library/sections/" + encodeURIComponent(section.key) + "/all?type=4",
                server_token
            );
            for (const item of (episode_data.MediaContainer?.Metadata || [])) {
                if (Number(item.viewCount || 0) <= 0) continue;
                episodes.push({
                    show_title: item.grandparentTitle || "",
                    season: Number(item.parentIndex || 0),
                    episode: Number(item.index || 0),
                });
            }
        }
    }

    return {
        server: server.name || "Plex Media Server",
        movies,
        shows,
        watched_episode_count: episodes.length,
        episodes,
    };
});

//#endregion
