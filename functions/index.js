/**
 * Import function triggers from their respective submodules:
 *
 * const {onCall} = require("firebase-functions/v2/https");
 * const {onDocumentWritten} = require("firebase-functions/v2/firestore");
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

const {setGlobalOptions} = require("firebase-functions");
const {defineSecret, defineString} = require("firebase-functions/params");
const {onRequest, onCall, HttpsError} = require("firebase-functions/https");
const {onSchedule} = require("firebase-functions/v2/scheduler");
const logger = require("firebase-functions/logger");
const dns = require("dns");
const https = require("https");
const net = require("net");
const {createHash} = require("node:crypto");


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
//* ----- Public Account Signup -
//? ------------------------------
//#region
// Kept under the existing callable name so the deployed endpoint can be
// updated in place without leaving a second signup function behind.
exports.createInvitedAccount = onCall(async (request) => {
    const email = String(request.data?.email || "").trim().toLowerCase();
    const password = String(request.data?.password || "");

    if (!email || !email.includes("@") || password.length < 6) {
        throw new HttpsError(
            "invalid-argument",
            "A valid email and password are required."
        );
    }

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
    } catch (error) {
        // If claim setup fails after Auth creation, do not leave a partially
        // provisioned account that cannot access the Supabase-backed site.
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

        if (error.code === "auth/invalid-email") {
            throw new HttpsError(
                "invalid-argument",
                "Enter a valid email address."
            );
        }

        if (error.code === "auth/invalid-password" ||
            error.code === "auth/weak-password") {
            throw new HttpsError(
                "invalid-argument",
                "Password must be at least 6 characters."
            );
        }

        throw new HttpsError(
            "invalid-argument",
            "The account could not be created."
        );
    }

    return {success: true};
});
//#endregion


//? ---------------------------------
//* ----- Notifications -------------
//? ---------------------------------
//#region
exports.getEntertainmentNotifications = onCall(async (request) => {
    if (!request.auth) {
        throw new HttpsError(
            "unauthenticated",
            "You must be logged in."
        );
    }

    const snapshot = await db
        .collection("users")
        .doc(request.auth.uid)
        .collection("notifications")
        .where("deliver_at", "<=", new Date())
        .orderBy("deliver_at", "desc")
        .limit(40)
        .get();

    const notifications = snapshot.docs.map((doc_snapshot) => {
        const data = doc_snapshot.data();
        return {
            id: doc_snapshot.id,
            type: data.type || "release",
            title: data.title || "New release",
            message: data.message || "",
            library: data.library || null,
            source: data.source || null,
            read: data.read === true,
            deliver_at:
                data.deliver_at?.toDate?.().toISOString?.() ||
                null,
        };
    });

    return {
        notifications,
        unread_count:
            notifications.filter((item) => !item.read).length,
    };
});

exports.markEntertainmentNotificationRead = onCall(async (request) => {
    if (!request.auth) {
        throw new HttpsError(
            "unauthenticated",
            "You must be logged in."
        );
    }

    const notification_id =
        String(request.data?.notification_id || "").trim();

    if (!notification_id ||
        notification_id.length > 220 ||
        notification_id.includes("/")) {
        throw new HttpsError(
            "invalid-argument",
            "Invalid notification."
        );
    }

    await db
        .collection("users")
        .doc(request.auth.uid)
        .collection("notifications")
        .doc(notification_id)
        .set({
            read: true,
            read_at: new Date(),
        }, {merge: true});

    return {success: true};
});

exports.markAllEntertainmentNotificationsRead = onCall(async (request) => {
    if (!request.auth) {
        throw new HttpsError(
            "unauthenticated",
            "You must be logged in."
        );
    }

    const ref = db
        .collection("users")
        .doc(request.auth.uid)
        .collection("notifications");

    const snapshot = await ref
        .where("read", "==", false)
        .limit(250)
        .get();

    if (snapshot.empty) {
        return {success: true, updated: 0};
    }

    const batch = db.batch();
    const read_at = new Date();

    snapshot.docs.forEach((doc_snapshot) => {
        batch.set(
            doc_snapshot.ref,
            {read: true, read_at},
            {merge: true}
        );
    });

    await batch.commit();

    return {
        success: true,
        updated: snapshot.size,
    };
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

exports.getAniListMangaRecommendations =
    onCall(async (request) => {
        if (!request.auth) {
            throw new HttpsError(
                "unauthenticated",
                "You must be logged in."
            );
        }

        const seeds =
            Array.isArray(request.data?.seeds) ?
                request.data.seeds
                    .filter(
                        (item) =>
                            item &&
                            String(
                                item.title || ""
                            ).trim()
                    )
                    .slice(0, 8) :
                [];

        if (!seeds.length) {
            return {
                recommendations: [],
            };
        }

        const library_ids =
            new Set(
                Array.isArray(
                    request.data?.library_ids
                ) ?
                    request.data.library_ids
                        .map(Number)
                        .filter(
                            (id) =>
                                Number.isInteger(id) &&
                                id > 0
                        ) :
                    []
            );

        const library_titles =
            new Set(
                Array.isArray(
                    request.data?.library_titles
                ) ?
                    request.data.library_titles
                        .map(
                            (title) =>
                                notification_normalize_title(
                                    title
                                )
                        )
                        .filter(Boolean) :
                    []
            );

        const candidates =
            new Map();

        const query = [
            "query ($id: Int, $search: String) {",
            "  Media(",
            "    id: $id,",
            "    search: $search,",
            "    type: MANGA",
            "  ) {"
            "    id",
            "    title { english romaji native userPreferred }",
            "    recommendations(",
            "      page: 1,",
            "      perPage: 20,",
            "      sort: RATING_DESC",
            "    ) {",
            "      nodes {",
            "        rating",
            "        mediaRecommendation {",
            "          id",
            "          isAdult",
            "          title { english romaji native userPreferred }",
            "          synonyms",
            "          countryOfOrigin",
            "          format",
            "          status",
            "          chapters",
            "          volumes",
            "          averageScore",
            "          description(asHtml: false)",
            "          genres",
            "          siteUrl",
            "          coverImage { extraLarge large }",
            "          bannerImage",
            "          startDate { year month day }",
            "          endDate { year month day }",
            "        }",
            "      }",
            "    }",
            "  }",
            "}",
        ].join("\n");

        for (const seed of seeds) {
            const seed_id =
                Number(seed.anilist_id || 0);
            const seed_title =
                String(
                    seed.title || ""
                ).trim();

            let data;
            try {
                data =
                    await anilist_graphql_public(
                        query,
                        {
                            id:
                                Number.isInteger(
                                    seed_id
                                ) &&
                                seed_id > 0 ?
                                    seed_id :
                                    null,
                            search:
                                Number.isInteger(
                                    seed_id
                                ) &&
                                seed_id > 0 ?
                                    null :
                                    seed_title,
                        }
                    );
            } catch (error) {
                logger.warn(
                    "AniList manga recommendation seed failed.",
                    {
                        seed:
                            seed_title,
                        error:
                            error.message,
                    }
                );
                continue;
            }

            const resolved_seed_title =
                data?.Media?.title?.english ||
                data?.Media?.title
                    ?.userPreferred ||
                data?.Media?.title?.romaji ||
                seed_title;

            for (const node of
                data?.Media?.recommendations
                    ?.nodes || []) {
                const media =
                    node?.mediaRecommendation;

                if (!media?.id ||
                    media.isAdult === true ||
                    media.format === "NOVEL") {
                    continue;
                }

                const anilist_id =
                    Number(media.id);

                const title =
                    media.title?.english ||
                    media.title
                        ?.userPreferred ||
                    media.title?.romaji ||
                    media.title?.native ||
                    "Untitled";

                if (library_ids.has(
                    anilist_id
                ) ||
                    library_titles.has(
                        notification_normalize_title(
                            title
                        )
                    )) {
                    continue;
                }

                const existing =
                    candidates.get(
                        anilist_id
                    ) || {
                        anilist_id,
                        title,
                        title_romaji:
                            media.title
                                ?.romaji ||
                            null,
                        title_native:
                            media.title
                                ?.native ||
                            null,
                        synonyms:
                            Array.isArray(
                                media.synonyms
                            ) ?
                                media.synonyms
                                    .filter(Boolean)
                                    .slice(0, 20) :
                                [],
                        country_of_origin:
                            media.countryOfOrigin ||
                            null,
                        media_kind:
                            anilist_media_kind(
                                media.countryOfOrigin
                            ),
                        format:
                            media.format || null,
                        publication_status:
                            media.status || null,
                        total_chapters:
                            Number(
                                media.chapters ||
                                0
                            ) || null,
                        total_volumes:
                            Number(
                                media.volumes ||
                                0
                            ) || null,
                        anilist_score:
                            Number(
                                media.averageScore ||
                                0
                            ) || null,
                        poster_url:
                            media.coverImage
                                ?.extraLarge ||
                            media.coverImage
                                ?.large ||
                            null,
                        banner_url:
                            media.bannerImage ||
                            null,
                        description:
                            clean_anilist_description(
                                media.description
                            ),
                        genres:
                            Array.isArray(
                                media.genres
                            ) ?
                                media.genres :
                                [],
                        site_url:
                            media.siteUrl ||
                            null,
                        start_date:
                            anilist_date_to_iso(
                                media.startDate
                            ),
                        end_date:
                            anilist_date_to_iso(
                                media.endDate
                            ),
                        recommendation_strength:
                            0,
                        because_of: [],
                    };

                const seed_weight =
                    Number(
                        seed.my_rating || 0
                    );

                existing
                    .recommendation_strength +=
                    Math.max(
                        1,
                        Number(
                            node.rating || 0
                        )
                    ) +
                    seed_weight;

                if (!existing
                    .because_of
                    .includes(
                        resolved_seed_title
                    )) {
                    existing
                        .because_of
                        .push(
                            resolved_seed_title
                        );
                }

                candidates.set(
                    anilist_id,
                    existing
                );
            }
        }

        const recommendations =
            [...candidates.values()]
                .sort(
                    (a, b) =>
                        b.recommendation_strength -
                        a.recommendation_strength
                )
                .slice(0, 18)
                .map((item) => ({
                    ...item,
                    because_of:
                        item.because_of
                            .slice(0, 2),
                }));

        return {
            recommendations,
        };
    });


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

function normalize_mal_manga_date(value) {
    const date = String(value || "").trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
    if (/^\d{4}-\d{2}$/.test(date)) return date + "-01";
    if (/^\d{4}$/.test(date)) return date + "-01-01";
    return null;
}

function mal_manga_media_kind(media_type) {
    if (media_type === "manhwa") return "Manhwa";
    if (media_type === "manhua") return "Manhua";
    if (["manga", "one_shot", "doujinshi"].includes(media_type)) {
        return "Manga";
    }
    return "Other";
}

exports.syncMALMangaList = onCall(
    {secrets: [mal_client_id, mal_client_secret], timeoutSeconds: 120},
    async (request) => {
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "You must be logged in.");
        }

        const access_token =
            await get_valid_mal_access_token(request.auth.uid);
        const fields = [
            "list_status",
            "main_picture",
            "alternative_titles",
            "start_date",
            "end_date",
            "synopsis",
            "mean",
            "genres",
            "media_type",
            "status",
            "num_volumes",
            "num_chapters",
        ].join(",");

        let url = new URL(
            "https://api.myanimelist.net/v2/users/@me/mangalist"
        );
        url.searchParams.set("limit", "1000");
        url.searchParams.set("sort", "list_updated_at");
        url.searchParams.set("fields", fields);

        const manga = [];

        while (url) {
            const response = await fetch(url, {
                headers: {Authorization: "Bearer " + access_token},
            });

            if (!response.ok) {
                logger.error("MAL manga list request failed.", {
                    status: response.status,
                });
                throw new HttpsError(
                    "internal",
                    "MyAnimeList manga sync failed."
                );
            }

            const data = await response.json();

            for (const item of data.data || []) {
                const node = item.node || {};
                const list_status = item.list_status || {};
                const media_type = String(node.media_type || "unknown");

                // Stellaz's Manga / Manhwa library intentionally excludes
                // novels/light novels. Those can get their own library later.
                if (media_type === "novel" ||
                    media_type === "light_novel") {
                    continue;
                }

                const alternative_titles =
                    node.alternative_titles || {};
                const synonyms = [
                    alternative_titles.en,
                    ...(alternative_titles.synonyms || []),
                ].filter(Boolean);

                manga.push({
                    mal_id: Number(node.id),
                    anilist_id: null,
                    title:
                        alternative_titles.en ||
                        node.title ||
                        "Untitled",
                    title_romaji: node.title || null,
                    title_native: alternative_titles.ja || null,
                    synonyms,
                    country_of_origin:
                        media_type === "manhwa" ? "KR" :
                            media_type === "manhua" ? "CN" :
                                media_type === "manga" ? "JP" : null,
                    media_kind:
                        mal_manga_media_kind(media_type),
                    format: media_type || null,
                    publication_status: node.status || null,
                    user_status:
                        list_status.status || "plan_to_read",
                    chapters_read:
                        Number(list_status.num_chapters_read || 0),
                    total_chapters:
                        Number(node.num_chapters || 0) || null,
                    volumes_read:
                        Number(list_status.num_volumes_read || 0),
                    total_volumes:
                        Number(node.num_volumes || 0) || null,
                    my_rating:
                        Number(list_status.score || 0) || null,
                    mal_score:
                        Number(node.mean || 0) || null,
                    anilist_score: null,
                    poster_url:
                        node.main_picture?.large ||
                        node.main_picture?.medium ||
                        null,
                    banner_url: null,
                    description: node.synopsis || null,
                    genres: (node.genres || [])
                        .map((genre) => genre.name)
                        .filter(Boolean),
                    site_url: node.id ?
                        "https://myanimelist.net/manga/" +
                            Number(node.id) :
                        null,
                    start_date:
                        normalize_mal_manga_date(node.start_date),
                    end_date:
                        normalize_mal_manga_date(node.end_date),
                    updated_at: new Date().toISOString(),
                });
            }

            url = data.paging?.next ?
                new URL(data.paging.next) :
                null;
        }

        return {manga, count: manga.length};
    }
);
//#endregion


//? ------------------------------
//* ----- Kitsu Import ----------
//? ------------------------------
//#region
const kitsu_api_base = "https://kitsu.app/api/edge";

function kitsu_headers() {
    return {
        "Accept": "application/vnd.api+json",
        "Content-Type": "application/vnd.api+json",
    };
}

function normalize_kitsu_username(value) {
    let username = String(value || "").trim();

    try {
        if (/^https?:\/\//i.test(username)) {
            const parsed = new URL(username);
            const parts = parsed.pathname.split("/").filter(Boolean);
            username = parts[parts.length - 1] || "";
        }
    } catch (_) {}

    return username.replace(/^@/, "").trim();
}

async function kitsu_find_user(username) {
    const candidates = [
        ["slug", username],
        ["name", username],
    ];

    for (const [field, value] of candidates) {
        const url = new URL(kitsu_api_base + "/users");
        url.searchParams.set("filter[" + field + "]", value);
        url.searchParams.set("page[limit]", "5");

        const response = await fetch(url, {
            headers: kitsu_headers(),
        });

        if (!response.ok) continue;

        const payload = await response.json();
        const match = (payload.data || []).find((item) => {
            const attrs = item.attributes || {};
            return [
                attrs.slug,
                attrs.name,
                attrs.about,
            ].filter(Boolean).some(
                (candidate) =>
                    String(candidate).toLowerCase() ===
                    String(value).toLowerCase()
            );
        }) || (payload.data || [])[0];

        if (match?.id) return match;
    }

    return null;
}

exports.connectKitsuProfile = onCall(async (request) => {
    if (!request.auth) {
        throw new HttpsError(
            "unauthenticated",
            "You must be logged in."
        );
    }

    const username = normalize_kitsu_username(
        request.data?.username
    );

    if (!username || username.length > 80) {
        throw new HttpsError(
            "invalid-argument",
            "Enter a valid Kitsu username."
        );
    }

    const user = await kitsu_find_user(username);
    if (!user?.id) {
        throw new HttpsError(
            "not-found",
            "No public Kitsu profile was found with that username."
        );
    }

    const attrs = user.attributes || {};
    const stored_username =
        attrs.slug || attrs.name || username;

    await db.collection("kitsu_connections")
        .doc(request.auth.uid)
        .set({
            kitsu_user_id: String(user.id),
            username: stored_username,
            display_name: attrs.name || stored_username,
            connected_at: new Date(),
        }, {merge: true});

    return {
        connected: true,
        username: stored_username,
    };
});

exports.getKitsuConnectionStatus = onCall(async (request) => {
    if (!request.auth) {
        throw new HttpsError(
            "unauthenticated",
            "You must be logged in."
        );
    }

    const snapshot = await db.collection("kitsu_connections")
        .doc(request.auth.uid)
        .get();

    if (!snapshot.exists) {
        return {connected: false};
    }

    const data = snapshot.data();
    return {
        connected: Boolean(data.kitsu_user_id),
        username: data.username || data.display_name || null,
    };
});

function kitsu_entry_rating(attributes) {
    const rating_twenty = Number(attributes?.ratingTwenty || 0);
    if (rating_twenty > 0) return rating_twenty / 2;

    const legacy_rating = Number(attributes?.rating || 0);
    if (legacy_rating > 0) return legacy_rating * 2;

    return null;
}

function kitsu_status_to_anime(status) {
    return ({
        current: "watching",
        completed: "completed",
        planned: "plan_to_watch",
        on_hold: "on_hold",
        dropped: "dropped",
    })[status] || "plan_to_watch";
}

function kitsu_status_to_manga(status) {
    return ({
        current: "reading",
        completed: "completed",
        planned: "plan_to_read",
        on_hold: "on_hold",
        dropped: "dropped",
    })[status] || "plan_to_read";
}

function kitsu_manga_kind(attributes) {
    const kind = String(
        attributes?.mangaType ||
        attributes?.subtype ||
        ""
    ).toLowerCase();

    if (kind === "manhwa") return "Manhwa";
    if (kind === "manhua") return "Manhua";
    if (kind) return "Manga";
    return "Other";
}

function kitsu_media_title(attributes) {
    const titles = attributes?.titles || {};
    return titles.en ||
        attributes?.canonicalTitle ||
        titles.en_jp ||
        titles.ja_jp ||
        "Untitled";
}

function kitsu_aliases(attributes) {
    const titles = attributes?.titles || {};
    return [
        titles.en,
        titles.en_jp,
        titles.ja_jp,
        attributes?.canonicalTitle,
        ...(attributes?.abbreviatedTitles || []),
    ].filter(Boolean);
}

function kitsu_image(image) {
    return image?.original ||
        image?.large ||
        image?.medium ||
        image?.small ||
        null;
}

async function get_kitsu_library(uid) {
    const connection = await db.collection("kitsu_connections")
        .doc(uid)
        .get();

    if (!connection.exists ||
        !connection.data()?.kitsu_user_id) {
        throw new HttpsError(
            "failed-precondition",
            "Connect a Kitsu profile before importing."
        );
    }

    const user_id = String(
        connection.data().kitsu_user_id
    );
    const entries = [];
    const included = new Map();

    let url = new URL(kitsu_api_base + "/library-entries");
    url.searchParams.set("filter[userId]", user_id);
    url.searchParams.set("include", "anime,manga");
    url.searchParams.set("page[limit]", "20");

    let pages = 0;

    while (url && pages < 250) {
        const response = await fetch(url, {
            headers: kitsu_headers(),
        });

        if (!response.ok) {
            logger.error("Kitsu library request failed.", {
                status: response.status,
            });
            throw new HttpsError(
                "internal",
                "Kitsu library import failed."
            );
        }

        const payload = await response.json();

        for (const item of payload.data || []) {
            entries.push(item);
        }

        for (const media of payload.included || []) {
            if (!media?.id || !media?.type) continue;
            included.set(
                String(media.type) + ":" + String(media.id),
                media
            );
        }

        const next = payload.links?.next;
        url = next ? new URL(next) : null;
        pages += 1;
    }

    return {
        entries,
        included,
        username:
            connection.data().username || null,
    };
}

exports.syncKitsuAnimeList = onCall(
    {timeoutSeconds: 120},
    async (request) => {
        if (!request.auth) {
            throw new HttpsError(
                "unauthenticated",
                "You must be logged in."
            );
        }

        const library =
            await get_kitsu_library(request.auth.uid);
        const anime = [];

        for (const entry of library.entries) {
            const relation =
                entry.relationships?.anime?.data;
            if (!relation?.id) continue;

            const media = library.included.get(
                "anime:" + String(relation.id)
            );
            if (!media) continue;

            const attrs = media.attributes || {};
            const list = entry.attributes || {};

            anime.push({
                kitsu_id: Number(media.id),
                mal_id: null,
                anilist_id: null,
                title: kitsu_media_title(attrs),
                title_romaji:
                    attrs.titles?.en_jp || null,
                title_native:
                    attrs.titles?.ja_jp || null,
                synonyms: kitsu_aliases(attrs),
                status:
                    kitsu_status_to_anime(list.status),
                episodes_watched:
                    Math.max(0, Number(list.progress || 0)),
                total_episodes:
                    Number(attrs.episodeCount || 0) || null,
                my_rating:
                    kitsu_entry_rating(list),
                poster_url:
                    kitsu_image(attrs.posterImage),
                media_type:
                    String(attrs.subtype || "")
                        .toLowerCase() || null,
                start_date: attrs.startDate || null,
                finish_date: attrs.endDate || null,
                average_episode_duration_ms:
                    Number(attrs.episodeLength || 0) > 0 ?
                        Number(attrs.episodeLength) * 60 :
                        null,
                mal_score: null,
                anilist_score: null,
                kitsu_score:
                    Number(attrs.averageRating || 0) || null,
                description:
                    attrs.synopsis ||
                    attrs.description ||
                    null,
                genres: [],
                site_url:
                    "https://kitsu.app/anime/" +
                    (attrs.slug || String(media.id)),
                synced_at: new Date().toISOString(),
            });
        }

        return {
            username: library.username,
            anime,
            count: anime.length,
        };
    }
);

exports.syncKitsuMangaList = onCall(
    {timeoutSeconds: 120},
    async (request) => {
        if (!request.auth) {
            throw new HttpsError(
                "unauthenticated",
                "You must be logged in."
            );
        }

        const library =
            await get_kitsu_library(request.auth.uid);
        const manga = [];

        for (const entry of library.entries) {
            const relation =
                entry.relationships?.manga?.data;
            if (!relation?.id) continue;

            const media = library.included.get(
                "manga:" + String(relation.id)
            );
            if (!media) continue;

            const attrs = media.attributes || {};
            const list = entry.attributes || {};

            const kind = kitsu_manga_kind(attrs);
            const manga_type = String(
                attrs.mangaType ||
                attrs.subtype ||
                ""
            ).toLowerCase();

            if (manga_type === "novel") continue;

            manga.push({
                kitsu_id: Number(media.id),
                mal_id: null,
                anilist_id: null,
                title: kitsu_media_title(attrs),
                title_romaji:
                    attrs.titles?.en_jp || null,
                title_native:
                    attrs.titles?.ja_jp || null,
                synonyms: kitsu_aliases(attrs),
                country_of_origin:
                    kind === "Manhwa" ? "KR" :
                        kind === "Manhua" ? "CN" :
                            kind === "Manga" ? "JP" :
                                null,
                media_kind: kind,
                format:
                    attrs.mangaType ||
                    attrs.subtype ||
                    null,
                publication_status:
                    attrs.status || null,
                user_status:
                    kitsu_status_to_manga(list.status),
                chapters_read:
                    Math.max(0, Number(list.progress || 0)),
                total_chapters:
                    Number(attrs.chapterCount || 0) || null,
                volumes_read: 0,
                total_volumes:
                    Number(attrs.volumeCount || 0) || null,
                my_rating:
                    kitsu_entry_rating(list),
                anilist_score: null,
                mal_score: null,
                kitsu_score:
                    Number(attrs.averageRating || 0) || null,
                poster_url:
                    kitsu_image(attrs.posterImage),
                banner_url:
                    kitsu_image(attrs.coverImage),
                description:
                    attrs.synopsis ||
                    attrs.description ||
                    null,
                genres: [],
                site_url:
                    "https://kitsu.app/manga/" +
                    (attrs.slug || String(media.id)),
                start_date: attrs.startDate || null,
                end_date: attrs.endDate || null,
                updated_at: new Date().toISOString(),
            });
        }

        return {
            username: library.username,
            manga,
            count: manga.length,
        };
    }
);
//#endregion


//? ------------------------------
//* ----- TMDB Movie Data -------
//? ------------------------------
//#region
const tmdb_read_access_token = defineSecret("TMDB_READ_ACCESS_TOKEN");

const tmdb_account_redirect_uri =
    "https://stellaz.org/entertainment_page/Entertainment.html?oauth=tmdb";

function tmdb_account_headers() {
    return {
        Authorization:
            "Bearer " + tmdb_read_access_token.value(),
        accept: "application/json",
        "Content-Type": "application/json",
    };
}

async function tmdb_account_request(
    url,
    {
        method = "GET",
        body = null,
        uid = null,
    } = {}
) {
    const response = await fetch(url, {
        method,
        headers: tmdb_account_headers(),
        ...(body !== null
            ? {body: JSON.stringify(body)}
            : {}),
    });

    const payload =
        await response.json().catch(() => ({}));

    if (!response.ok || payload.success === false) {
        logger.error("TMDB account request failed.", {
            status: response.status,
            status_message:
                payload.status_message || null,
        });

        if (uid &&
            (response.status === 401 ||
             response.status === 403)) {
            await db.collection("tmdb_connections")
                .doc(uid)
                .set({
                    needs_reconnect: true,
                    updated_at: new Date(),
                }, {merge: true});
        }

        const error = new Error(
            payload.status_message ||
            "TMDB account request failed."
        );
        error.status = response.status;
        throw error;
    }

    return payload;
}

exports.getTMDBAuthorizationUrl = onCall(
    {secrets: [tmdb_read_access_token]},
    async (request) => {
        if (!request.auth) {
            throw new HttpsError(
                "unauthenticated",
                "You must be logged in."
            );
        }

        let token;
        try {
            token = await tmdb_account_request(
                "https://api.themoviedb.org/3/authentication/token/new"
            );
        } catch (error) {
            throw new HttpsError(
                "internal",
                "Unable to start TMDB authorization."
            );
        }

        if (!token.request_token) {
            throw new HttpsError(
                "internal",
                "TMDB did not return a request token."
            );
        }

        await db.collection("tmdb_connection_attempts")
            .doc(request.auth.uid)
            .set({
                request_token: token.request_token,
                expires_at: token.expires_at || null,
                created_at: new Date(),
            });

        const authorization_url = new URL(
            "https://www.themoviedb.org/authenticate/" +
            encodeURIComponent(token.request_token)
        );
        authorization_url.searchParams.set(
            "redirect_to",
            tmdb_account_redirect_uri
        );

        return {
            authorization_url:
                authorization_url.toString(),
        };
    }
);

exports.completeTMDBConnection = onCall(
    {secrets: [tmdb_read_access_token]},
    async (request) => {
        if (!request.auth) {
            throw new HttpsError(
                "unauthenticated",
                "You must be logged in."
            );
        }

        const attempt_ref =
            db.collection("tmdb_connection_attempts")
                .doc(request.auth.uid);
        const attempt = await attempt_ref.get();

        if (!attempt.exists ||
            !attempt.data()?.request_token) {
            throw new HttpsError(
                "failed-precondition",
                "Start the TMDB connection from Stellaz first."
            );
        }

        const created_at =
            attempt.data()?.created_at?.toMillis?.() || 0;

        if (!created_at ||
            Date.now() - created_at > 60 * 60 * 1000) {
            await attempt_ref.delete().catch(() => {});
            throw new HttpsError(
                "deadline-exceeded",
                "The TMDB authorization request expired."
            );
        }

        let session;
        try {
            session = await tmdb_account_request(
                "https://api.themoviedb.org/3/authentication/session/new",
                {
                    method: "POST",
                    body: {
                        request_token:
                            attempt.data().request_token,
                    },
                }
            );
        } catch (error) {
            throw new HttpsError(
                "failed-precondition",
                "Approve Stellaz on TMDB, then try connecting again."
            );
        }

        if (!session.session_id) {
            throw new HttpsError(
                "internal",
                "TMDB did not return a session."
            );
        }

        const account_url = new URL(
            "https://api.themoviedb.org/3/account"
        );
        account_url.searchParams.set(
            "session_id",
            session.session_id
        );

        let account;
        try {
            account = await tmdb_account_request(
                account_url
            );
        } catch (error) {
            throw new HttpsError(
                "internal",
                "TMDB account verification failed."
            );
        }

        await db.collection("tmdb_connections")
            .doc(request.auth.uid)
            .set({
                session_id: session.session_id,
                account_id: Number(account.id),
                username:
                    account.username ||
                    account.name ||
                    null,
                name: account.name || null,
                needs_reconnect: false,
                connected_at: new Date(),
                updated_at: new Date(),
            }, {merge: true});

        await attempt_ref.delete();

        return {
            connected: true,
            username:
                account.username ||
                account.name ||
                null,
        };
    }
);

exports.getTMDBConnectionStatus = onCall(
    async (request) => {
        if (!request.auth) {
            throw new HttpsError(
                "unauthenticated",
                "You must be logged in."
            );
        }

        const snapshot =
            await db.collection("tmdb_connections")
                .doc(request.auth.uid)
                .get();

        if (!snapshot.exists) {
            return {
                connected: false,
                needs_reconnect: false,
            };
        }

        const data = snapshot.data();

        return {
            connected:
                Boolean(
                    data.session_id &&
                    data.account_id
                ) &&
                data.needs_reconnect !== true,
            needs_reconnect:
                data.needs_reconnect === true ||
                !data.session_id ||
                !data.account_id,
            username: data.username || null,
        };
    }
);

async function get_tmdb_connection(uid) {
    const ref =
        db.collection("tmdb_connections").doc(uid);
    const snapshot = await ref.get();

    if (!snapshot.exists) {
        throw new HttpsError(
            "failed-precondition",
            "Connect TMDB before importing."
        );
    }

    const data = snapshot.data();

    if (!data.session_id ||
        !data.account_id ||
        data.needs_reconnect === true) {
        throw new HttpsError(
            "failed-precondition",
            "Reconnect TMDB before importing."
        );
    }

    return data;
}

async function tmdb_account_pages(
    uid,
    connection,
    pathname
) {
    const items = [];
    let page = 1;
    let total_pages = 1;

    while (page <= total_pages &&
           page <= 500) {
        const url = new URL(
            "https://api.themoviedb.org/3" +
            pathname
        );
        url.searchParams.set(
            "session_id",
            connection.session_id
        );
        url.searchParams.set(
            "language",
            "en-US"
        );
        url.searchParams.set(
            "page",
            String(page)
        );
        url.searchParams.set(
            "sort_by",
            "created_at.desc"
        );

        let payload;
        try {
            payload = await tmdb_account_request(
                url,
                {uid}
            );
        } catch (error) {
            if (error.status === 401 ||
                error.status === 403) {
                throw new HttpsError(
                    "failed-precondition",
                    "Your TMDB session is no longer valid. Reconnect TMDB."
                );
            }

            throw new HttpsError(
                "internal",
                "TMDB import failed."
            );
        }

        items.push(
            ...(Array.isArray(payload.results)
                ? payload.results
                : [])
        );

        total_pages = Math.max(
            1,
            Number(payload.total_pages || 1)
        );
        page += 1;
    }

    return items;
}

function tmdb_movie_import_row(
    movie,
    status,
    rating = null
) {
    return {
        tmdb_id: Number(movie.id),
        title: movie.title || null,
        year: movie.release_date
            ? Number(
                movie.release_date.slice(0, 4)
            ) || null
            : null,
        status,
        my_rating:
            rating !== null &&
            rating !== undefined
                ? Number(rating)
                : null,
        tmdb_rating:
            movie.vote_average !== null &&
            movie.vote_average !== undefined
                ? Number(movie.vote_average)
                : null,
        poster_url: movie.poster_path
            ? "https://image.tmdb.org/t/p/w500" +
                movie.poster_path
            : null,
    };
}

function tmdb_show_import_row(
    show,
    status,
    rating = null
) {
    return {
        tmdb_id: Number(show.id),
        title: show.name || null,
        year: show.first_air_date
            ? Number(
                show.first_air_date.slice(0, 4)
            ) || null
            : null,
        status,
        my_rating:
            rating !== null &&
            rating !== undefined
                ? Number(rating)
                : null,
        tmdb_rating:
            show.vote_average !== null &&
            show.vote_average !== undefined
                ? Number(show.vote_average)
                : null,
        poster_url: show.poster_path
            ? "https://image.tmdb.org/t/p/w500" +
                show.poster_path
            : null,
    };
}

exports.syncTMDBMovies = onCall(
    {
        secrets: [tmdb_read_access_token],
        timeoutSeconds: 120,
    },
    async (request) => {
        if (!request.auth) {
            throw new HttpsError(
                "unauthenticated",
                "You must be logged in."
            );
        }

        const connection =
            await get_tmdb_connection(
                request.auth.uid
            );
        const account_id =
            Number(connection.account_id);

        const [rated, watchlist] =
            await Promise.all([
                tmdb_account_pages(
                    request.auth.uid,
                    connection,
                    "/account/" +
                    account_id +
                    "/rated/movies"
                ),
                tmdb_account_pages(
                    request.auth.uid,
                    connection,
                    "/account/" +
                    account_id +
                    "/watchlist/movies"
                ),
            ]);

        const by_id = new Map();

        for (const movie of watchlist) {
            if (!movie?.id) continue;
            by_id.set(
                Number(movie.id),
                tmdb_movie_import_row(
                    movie,
                    "watch_later"
                )
            );
        }

        for (const movie of rated) {
            if (!movie?.id) continue;
            by_id.set(
                Number(movie.id),
                tmdb_movie_import_row(
                    movie,
                    "watched",
                    movie.rating
                )
            );
        }

        const movies = [...by_id.values()]
            .filter((item) =>
                item.title &&
                item.year &&
                item.tmdb_id
            );

        return {
            movies,
            count: movies.length,
            rated_count: rated.length,
            watchlist_count: watchlist.length,
        };
    }
);

exports.syncTMDBShows = onCall(
    {
        secrets: [tmdb_read_access_token],
        timeoutSeconds: 120,
    },
    async (request) => {
        if (!request.auth) {
            throw new HttpsError(
                "unauthenticated",
                "You must be logged in."
            );
        }

        const connection =
            await get_tmdb_connection(
                request.auth.uid
            );
        const account_id =
            Number(connection.account_id);

        const [rated, watchlist] =
            await Promise.all([
                tmdb_account_pages(
                    request.auth.uid,
                    connection,
                    "/account/" +
                    account_id +
                    "/rated/tv"
                ),
                tmdb_account_pages(
                    request.auth.uid,
                    connection,
                    "/account/" +
                    account_id +
                    "/watchlist/tv"
                ),
            ]);

        const by_id = new Map();

        for (const show of watchlist) {
            if (!show?.id) continue;
            by_id.set(
                Number(show.id),
                tmdb_show_import_row(
                    show,
                    "watch_later"
                )
            );
        }

        for (const show of rated) {
            if (!show?.id) continue;
            by_id.set(
                Number(show.id),
                tmdb_show_import_row(
                    show,
                    "watched",
                    show.rating
                )
            );
        }

        const shows = [...by_id.values()]
            .filter((item) =>
                item.title &&
                item.year &&
                item.tmdb_id
            );

        return {
            shows,
            count: shows.length,
            rated_count: rated.length,
            watchlist_count: watchlist.length,
        };
    }
);



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

        if (type === "manga") {
            const now = new Date();
            const today =
                Number(
                    now.toISOString()
                        .slice(0, 10)
                        .replaceAll("-", "")
                );
            const recent_start =
                new Date(
                    now.getTime() -
                    120 * 24 * 60 * 60 * 1000
                );
            const recent_start_value =
                Number(
                    recent_start.toISOString()
                        .slice(0, 10)
                        .replaceAll("-", "")
                );
            const future_end =
                new Date(
                    now.getTime() +
                    365 * 24 * 60 * 60 * 1000
                );
            const future_end_value =
                Number(
                    future_end.toISOString()
                        .slice(0, 10)
                        .replaceAll("-", "")
                );

            const manga_fields = [
                "id",
                "title { romaji english native userPreferred }",
                "countryOfOrigin",
                "format",
                "status",
                "chapters",
                "volumes",
                "averageScore",
                "description(asHtml: false)",
                "genres",
                "siteUrl",
                "coverImage { extraLarge large }",
                "bannerImage",
                "startDate { year month day }",
                "endDate { year month day }",
            ].join("\n");

            const query = [
                "query {",
                "  recent: Page(page: 1, perPage: 24) {",
                "    media(",
                "      type: MANGA,",
                "      isAdult: false,",
                "      format_not: NOVEL,",
                "      startDate_greater: " +
                    recent_start_value + ",",
                "      startDate_lesser: " +
                    today + ",",
                "      sort: START_DATE_DESC",
                "    ) {",
                manga_fields,
                "    }",
                "  }",
                "  upcoming: Page(page: 1, perPage: 24) {",
                "    media(",
                "      type: MANGA,",
                "      isAdult: false,",
                "      format_not: NOVEL,",
                "      startDate_greater: " +
                    today + ",",
                "      startDate_lesser: " +
                    future_end_value + ",",
                "      sort: START_DATE",
                "    ) {",
                manga_fields,
                "    }",
                "  }",
                "}",
            ].join("\n");

            let data;
            try {
                data =
                    await anilist_graphql_public(
                        query
                    );
            } catch (error) {
                logger.error(
                    "AniList manga release lookup failed.",
                    {error: error.message}
                );
                throw new HttpsError(
                    "internal",
                    "Manga release lookup failed."
                );
            }

            const map_manga =
                (item) => ({
                    anilist_id:
                        Number(item.id),
                    title:
                        item.title?.english ||
                        item.title?.userPreferred ||
                        item.title?.romaji ||
                        item.title?.native ||
                        "Untitled",
                    title_romaji:
                        item.title?.romaji || null,
                    title_native:
                        item.title?.native || null,
                    country_of_origin:
                        item.countryOfOrigin || null,
                    media_kind:
                        anilist_media_kind(
                            item.countryOfOrigin
                        ),
                    format:
                        item.format || null,
                    publication_status:
                        item.status || null,
                    total_chapters:
                        Number(
                            item.chapters || 0
                        ) || null,
                    total_volumes:
                        Number(
                            item.volumes || 0
                        ) || null,
                    anilist_score:
                        Number(
                            item.averageScore || 0
                        ) || null,
                    rating:
                        Number(
                            item.averageScore || 0
                        ) > 0 ?
                            Number(
                                item.averageScore
                            ) / 10 :
                            null,
                    poster_url:
                        item.coverImage
                            ?.extraLarge ||
                        item.coverImage
                            ?.large ||
                        null,
                    banner_url:
                        item.bannerImage || null,
                    description:
                        clean_anilist_description(
                            item.description
                        ),
                    genres:
                        Array.isArray(
                            item.genres
                        ) ?
                            item.genres :
                            [],
                    site_url:
                        item.siteUrl || null,
                    start_date:
                        anilist_date_to_iso(
                            item.startDate
                        ),
                    end_date:
                        anilist_date_to_iso(
                            item.endDate
                        ),
                    release_date:
                        anilist_date_to_iso(
                            item.startDate
                        ),
                });

            const unique_by_id =
                (items) => [
                    ...new Map(
                        items
                            .filter(
                                (item) =>
                                    item?.id
                            )
                            .map(
                                (item) => [
                                    Number(item.id),
                                    item,
                                ]
                            )
                    ).values(),
                ];

            const newly_released =
                unique_by_id(
                    data?.recent?.media || []
                )
                    .map(map_manga)
                    .slice(0, 7);

            const upcoming =
                unique_by_id(
                    data?.upcoming?.media || []
                )
                    .map(map_manga)
                    .slice(0, 7);

            return {
                newly_released,
                upcoming,
            };
        }

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

function supabase_service_headers() {
    const key = String(
        supabase_secret_key.value() || ""
    ).trim();

    const headers = {
        apikey: key,
        Accept: "application/json",
    };

    // Modern Supabase sb_secret_* keys are opaque API keys, not JWTs.
    // Sending them as a Bearer token makes PostgREST reject the request.
    // Legacy service_role keys are JWTs and still use Authorization.
    if (!key.startsWith("sb_secret_")) {
        headers.Authorization =
            "Bearer " + key;
    }

    return headers;
}

async function notification_supabase_select(table, select_fields) {
    const endpoint = new URL(
        supabase_url + "/rest/v1/" + table
    );
    endpoint.searchParams.set("select", select_fields);

    const response = await fetch(endpoint, {
        headers: supabase_service_headers(),
    });

    if (!response.ok) {
        const error_text = await response.text();
        logger.error("Release checker Supabase read failed.", {
            table,
            status: response.status,
            error: error_text,
        });
        throw new Error(
            "Unable to load " + table + " for release checking."
        );
    }

    return await response.json();
}

async function friend_library_supabase_select(
    table,
    select_fields,
    friend_uid
) {
    const endpoint = new URL(
        supabase_url + "/rest/v1/" + table
    );
    endpoint.searchParams.set(
        "select",
        select_fields
    );
    endpoint.searchParams.set(
        "user_id",
        "eq." + friend_uid
    );
    endpoint.searchParams.set(
        "order",
        "title.asc"
    );

    let response;

    try {
        response = await fetch(endpoint, {
            headers: supabase_service_headers(),
        });
    } catch (error) {
        console.error(
            "[friend-library] Supabase fetch threw",
            table,
            String(error?.message || error)
        );
        throw new HttpsError(
            "internal",
            "Unable to load that friend's library."
        );
    }

    if (!response.ok) {
        const error_text =
            await response.text();

        console.error(
            "[friend-library] Supabase returned",
            table,
            response.status,
            error_text
        );

        throw new HttpsError(
            "internal",
            "Unable to load that friend's library."
        );
    }

    let rows;

    try {
        rows = await response.json();
    } catch (error) {
        console.error(
            "[friend-library] Invalid Supabase JSON",
            table,
            String(error?.message || error)
        );
        throw new HttpsError(
            "internal",
            "Unable to load that friend's library."
        );
    }

    console.log(
        "[friend-library] Loaded",
        table,
        Array.isArray(rows) ? rows.length : "non-array"
    );

    return Array.isArray(rows) ? rows : [];
}

exports.getFriendEntertainmentLibrary =
    onCall(
        {
            secrets: [
                supabase_secret_key,
            ],
        },
        async (request) => {
            if (!request.auth) {
                throw new HttpsError(
                    "unauthenticated",
                    "You must be logged in."
                );
            }

            const viewer_uid =
                request.auth.uid;
            const friend_uid =
                String(
                    request.data?.friend_uid || ""
                ).trim();

            if (!friend_uid ||
                friend_uid === viewer_uid) {
                throw new HttpsError(
                    "invalid-argument",
                    "Choose a friend to view."
                );
            }

            const friendship_id =
                friend_pair_id(
                    viewer_uid,
                    friend_uid
                );
            console.log(
                "[friend-library] Looking up friendship"
            );

            const friendship_snapshot =
                await db
                    .collection("friendships")
                    .doc(friendship_id)
                    .get();

            console.log(
                "[friend-library] Friendship lookup complete",
                friendship_snapshot.exists
            );

            const members =
                friendship_snapshot.exists
                    ? friendship_snapshot
                        .data()?.members || []
                    : [];

            if (!friendship_snapshot.exists ||
                !members.includes(viewer_uid) ||
                !members.includes(friend_uid)) {
                throw new HttpsError(
                    "permission-denied",
                    "You can only view the library of an accepted friend."
                );
            }

            const profile_snapshot =
                await db
                    .collection("users")
                    .doc(friend_uid)
                    .get();
            const profile =
                public_friend_profile(
                    friend_uid,
                    profile_snapshot.exists
                        ? profile_snapshot.data()
                        : {}
                );

            console.log(
                "[friend-library] Starting Supabase reads"
            );

            const [
                movies,
                shows,
                anime,
                manga,
            ] = await Promise.all([
                friend_library_supabase_select(
                    "movies",
                    "id,title,year,status,my_rating,poster_url,tmdb_rating",
                    friend_uid
                ),
                friend_library_supabase_select(
                    "tv_shows",
                    "id,title,year,status,my_rating,poster_url,tmdb_rating",
                    friend_uid
                ),
                friend_library_supabase_select(
                    "anime",
                    "id,title,status,episodes_watched,total_episodes,my_rating,poster_url,media_type,anilist_score,mal_score,kitsu_score",
                    friend_uid
                ),
                friend_library_supabase_select(
                    "manga_library",
                    "id,title,user_status,chapters_read,total_chapters,my_rating,poster_url,media_kind,anilist_score,mal_score,kitsu_score",
                    friend_uid
                ),
            ]);

            console.log(
                "[friend-library] Supabase reads complete",
                {
                    movies: movies.length,
                    shows: shows.length,
                    anime: anime.length,
                    manga: manga.length,
                }
            );

            return {
                friend: profile,
                movies,
                shows,
                anime,
                manga,
            };
        }
    );


exports.submitFeedback =
    onCall(async (request) => {
        if (!request.auth) {
            throw new HttpsError(
                "unauthenticated",
                "You must be logged in."
            );
        }

        const message =
            String(request.data?.message || "")
                .trim();
        const page =
            String(request.data?.page || "")
                .trim()
                .slice(0, 200);

        if (message.length < 5) {
            throw new HttpsError(
                "invalid-argument",
                "Please write a little more detail."
            );
        }

        if (message.length > 2000) {
            throw new HttpsError(
                "invalid-argument",
                "Feedback must be 2,000 characters or less."
            );
        }

        const profile_snapshot =
            await db
                .collection("users")
                .doc(request.auth.uid)
                .get();
        const profile =
            profile_snapshot.exists
                ? profile_snapshot.data()
                : {};

        await db
            .collection("developer_feedback")
            .add({
                user_uid: request.auth.uid,
                username:
                    profile.display_name ||
                    "Stellaz user",
                message,
                page: page || null,
                status: "new",
                created_at: new Date(),
            });

        return {submitted: true};
    });

async function friend_recent_activity_supabase(
    friend_uids
) {
    const endpoint = new URL(
        supabase_url +
        "/rest/v1/rpc/get_friend_recent_activity"
    );

    const response = await fetch(endpoint, {
        method: "POST",
        headers: {
            ...supabase_service_headers(),
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            friend_ids: friend_uids,
        }),
    });

    if (!response.ok) {
        const error_text =
            await response.text();

        logger.error(
            "Friend recent activity Supabase read failed.",
            {
                status: response.status,
                error: error_text,
            }
        );

        throw new HttpsError(
            "internal",
            "Unable to load recent friend activity."
        );
    }

    const rows = await response.json();
    return Array.isArray(rows) ? rows : [];
}

exports.getFriendRecentActivity =
    onCall(
        {
            secrets: [
                supabase_secret_key,
            ],
        },
        async (request) => {
            if (!request.auth) {
                throw new HttpsError(
                    "unauthenticated",
                    "You must be logged in."
                );
            }

            const viewer_uid =
                request.auth.uid;
            const friendship_snapshot =
                await db
                    .collection("friendships")
                    .where(
                        "members",
                        "array-contains",
                        viewer_uid
                    )
                    .get();

            const friend_uids =
                [...new Set(
                    friendship_snapshot.docs
                        .flatMap(
                            (snapshot) =>
                                snapshot.data()
                                    ?.members || []
                        )
                        .filter(
                            (member_uid) =>
                                member_uid &&
                                member_uid !==
                                    viewer_uid
                        )
                )];

            if (!friend_uids.length) {
                return {
                    friend_count: 0,
                    items: [],
                };
            }

            const profile_refs =
                friend_uids.map(
                    (friend_uid) =>
                        db.collection("users")
                            .doc(friend_uid)
                );
            const profile_snapshots =
                await db.getAll(
                    ...profile_refs
                );
            const profiles =
                new Map(
                    profile_snapshots.map(
                        (snapshot) => [
                            snapshot.id,
                            public_friend_profile(
                                snapshot.id,
                                snapshot.exists
                                    ? snapshot.data()
                                    : {}
                            ),
                        ]
                    )
                );

            const activity =
                await friend_recent_activity_supabase(
                    friend_uids
                );

            const items =
                activity
                    .map((item) => {
                        const friend =
                            profiles.get(
                                item.friend_uid
                            ) ||
                            public_friend_profile(
                                item.friend_uid
                            );

                        return {
                            media_type:
                                item.media_type,
                            media_id:
                                item.media_id,
                            title:
                                item.title,
                            year:
                                item.year,
                            poster_url:
                                item.poster_url,
                            activity_at:
                                item.activity_at,
                            detail:
                                item.detail,
                            friend,
                        };
                    })
                    .slice(0, 18);

            return {
                friend_count:
                    friend_uids.length,
                items,
            };
        }
    );

function notification_normalize_title(value) {
    return String(value || "")
        .normalize("NFKD")
        .toLowerCase()
        .replace(/&/g, " and ")
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
}

function notification_safe_id(value) {
    return String(value || "")
        .replace(/[^a-zA-Z0-9_.-]+/g, "_")
        .slice(0, 180);
}

async function create_release_notification(
    uid,
    notification_id,
    data
) {
    const ref = db
        .collection("users")
        .doc(uid)
        .collection("notifications")
        .doc(notification_safe_id(notification_id));

    try {
        await ref.create({
            ...data,
            read: false,
            created_at: new Date(),
        });
        return true;
    } catch (error) {
        if (error?.code === 6 ||
            String(error?.code) === "6" ||
            String(error?.message || "")
                .includes("ALREADY_EXISTS")) {
            return false;
        }

        throw error;
    }
}

async function anilist_graphql_public(query, variables = {}) {
    const response = await fetch(
        "https://graphql.anilist.co",
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
            },
            body: JSON.stringify({query, variables}),
        }
    );

    const payload =
        await response.json().catch(() => ({}));

    if (!response.ok ||
        (Array.isArray(payload.errors) &&
         payload.errors.length)) {
        throw new Error(
            payload.errors?.[0]?.message ||
            "AniList release lookup failed."
        );
    }

    return payload.data;
}

async function resolve_anilist_ids_for_anime(anime_rows) {
    const resolved = new Map();

    for (const item of anime_rows) {
        if (Number(item.anilist_id || 0) > 0) {
            resolved.set(
                String(item.id),
                Number(item.anilist_id)
            );
        }
    }

    const mal_rows = anime_rows.filter((item) =>
        !resolved.has(String(item.id)) &&
        Number(item.mal_id || 0) > 0
    );

    for (let start = 0; start < mal_rows.length; start += 35) {
        const chunk = mal_rows.slice(start, start + 35);
        const fields = chunk.map((item, index) =>
            "m" + index +
            ": Media(idMal: " +
            Number(item.mal_id) +
            ", type: ANIME) { id }"
        );

        let data;
        try {
            data = await anilist_graphql_public(
                "query { " + fields.join("\n") + " }"
            );
        } catch (error) {
            logger.warn("Unable to resolve MAL IDs through AniList.", {
                error: error.message,
            });
            continue;
        }

        chunk.forEach((item, index) => {
            const anilist_id =
                Number(data?.["m" + index]?.id || 0);
            if (anilist_id) {
                resolved.set(
                    String(item.id),
                    anilist_id
                );
            }
        });
    }

    return resolved;
}

async function schedule_anime_release_notifications(anime_rows) {
    const active = anime_rows.filter((item) =>
        !["completed", "dropped"].includes(
            String(item.status || "")
        )
    );

    if (!active.length) return 0;

    const resolved =
        await resolve_anilist_ids_for_anime(active);
    const media_ids = [
        ...new Set([...resolved.values()]),
    ];

    if (!media_ids.length) return 0;

    const now_seconds =
        Math.floor(Date.now() / 1000);
    const before_seconds =
        now_seconds + 24 * 60 * 60;

    const query = [
        "query ($ids: [Int], $after: Int, $before: Int, $page: Int) {",
        "  Page(page: $page, perPage: 50) {",
        "    pageInfo { hasNextPage }",
        "    airingSchedules(",
        "      mediaId_in: $ids,",
        "      airingAt_greater: $after,",
        "      airingAt_lesser: $before,",
        "      sort: TIME",
        "    ) {",
        "      mediaId episode airingAt",
        "      media { title { english romaji userPreferred } }",
        "    }",
        "  }",
        "}",
    ].join("\n");

    const schedules = [];
    let page = 1;
    let has_next_page = true;

    while (has_next_page && page <= 20) {
        const data = await anilist_graphql_public(
            query,
            {
                ids: media_ids,
                after: now_seconds - 60,
                before: before_seconds,
                page,
            }
        );

        schedules.push(
            ...(data?.Page?.airingSchedules || [])
        );

        has_next_page =
            data?.Page?.pageInfo?.hasNextPage === true;
        page += 1;
    }

    const rows_by_anilist = new Map();

    for (const item of active) {
        const anilist_id =
            resolved.get(String(item.id));
        if (!anilist_id) continue;

        if (!rows_by_anilist.has(anilist_id)) {
            rows_by_anilist.set(anilist_id, []);
        }
        rows_by_anilist.get(anilist_id).push(item);
    }

    let created = 0;

    for (const schedule of schedules) {
        const media_id = Number(schedule.mediaId || 0);
        const episode = Number(schedule.episode || 0);
        const airing_at =
            Number(schedule.airingAt || 0);
        if (!media_id || !episode || !airing_at) continue;

        const library_rows =
            rows_by_anilist.get(media_id) || [];

        for (const item of library_rows) {
            if (episode <=
                Number(item.episodes_watched || 0)) {
                continue;
            }

            const title =
                item.title ||
                schedule.media?.title?.english ||
                schedule.media?.title?.userPreferred ||
                schedule.media?.title?.romaji ||
                "Anime";

            const did_create =
                await create_release_notification(
                    item.user_id,
                    "anime_" + media_id +
                        "_episode_" + episode,
                    {
                        type: "anime_episode",
                        library: "Anime",
                        source: "AniList",
                        title: "New episode · " + title,
                        message:
                            "Episode " + episode +
                            " is now available.",
                        deliver_at:
                            new Date(airing_at * 1000),
                        media_title: title,
                        episode,
                        anilist_id: media_id,
                    }
                );

            if (did_create) created += 1;
        }
    }

    return created;
}

function manga_release_key(item) {
    if (Number(item.anilist_id || 0) > 0) {
        return "al_" + Number(item.anilist_id);
    }
    if (Number(item.mal_id || 0) > 0) {
        return "mal_" + Number(item.mal_id);
    }
    if (Number(item.kitsu_id || 0) > 0) {
        return "kitsu_" + Number(item.kitsu_id);
    }

    return "title_" +
        notification_safe_id(
            notification_normalize_title(item.title)
        );
}

function manga_target_aliases(item) {
    return [
        item.title,
        item.title_romaji,
        item.title_native,
        ...(Array.isArray(item.synonyms)
            ? item.synonyms
            : []),
    ]
        .map(notification_normalize_title)
        .filter(Boolean);
}

function mangadex_candidate_aliases(candidate) {
    const attrs = candidate?.attributes || {};
    const titles = Object.values(attrs.title || {});
    const alt_titles = (attrs.altTitles || [])
        .flatMap((entry) => Object.values(entry || {}));

    return [
        ...titles,
        ...alt_titles,
    ]
        .map(notification_normalize_title)
        .filter(Boolean);
}

function choose_mangadex_match(item, candidates) {
    const anilist_id =
        Number(item.anilist_id || 0);
    const mal_id =
        Number(item.mal_id || 0);
    const aliases =
        new Set(manga_target_aliases(item));
    const start_year = item.start_date
        ? Number(String(item.start_date).slice(0, 4))
        : null;

    let best = null;
    let best_score = -1;

    for (const candidate of candidates) {
        const attrs = candidate.attributes || {};
        const links = attrs.links || {};
        let score = 0;

        if (anilist_id &&
            Number(links.al || 0) === anilist_id) {
            score += 100;
        }
        if (mal_id &&
            Number(links.mal || 0) === mal_id) {
            score += 100;
        }

        const candidate_aliases =
            mangadex_candidate_aliases(candidate);

        if (candidate_aliases.some(
            (alias) => aliases.has(alias)
        )) {
            score += 40;
        }

        if (start_year &&
            Number(attrs.year || 0) === start_year) {
            score += 10;
        }

        if (score > best_score) {
            best = candidate;
            best_score = score;
        }
    }

    return best_score >= 40 ? best : null;
}

async function resolve_mangadex_mapping(item) {
    const key = manga_release_key(item);
    const ref = db
        .collection("release_source_maps")
        .doc("manga_" + key);
    const existing = await ref.get();

    if (existing.exists) {
        const data = existing.data();

        if (data.mangadex_id) {
            return {
                key,
                mangadex_id: data.mangadex_id,
                tracked_from:
                    data.tracked_from?.toDate?.() ||
                    new Date(0),
            };
        }

        const checked_at =
            data.checked_at?.toDate?.();
        if (checked_at &&
            Date.now() - checked_at.getTime() <
                7 * 24 * 60 * 60 * 1000) {
            return null;
        }
    }

    const search_title =
        item.title_romaji ||
        item.title ||
        item.title_native;
    if (!search_title) return null;

    const url = new URL(
        "https://api.mangadex.org/manga"
    );
    url.searchParams.set("title", search_title);
    url.searchParams.set("limit", "10");
    ["safe", "suggestive", "erotica"].forEach(
        (rating) =>
            url.searchParams.append(
                "contentRating[]",
                rating
            )
    );

    let payload;
    try {
        const response = await fetch(url, {
            headers: {
                Accept: "application/json",
                "User-Agent":
                    "StellazHQ/1.0 (https://stellaz.org)",
            },
        });

        if (!response.ok) {
            throw new Error(
                "MangaDex search failed (" +
                response.status + ")."
            );
        }

        payload = await response.json();
    } catch (error) {
        logger.warn("MangaDex title lookup failed.", {
            title: item.title,
            error: error.message,
        });
        return null;
    }

    const match = choose_mangadex_match(
        item,
        payload.data || []
    );

    if (!match?.id) {
        await ref.set({
            status: "not_found",
            checked_at: new Date(),
            title: item.title || null,
        }, {merge: true});
        return null;
    }

    const tracked_from = new Date();

    await ref.set({
        status: "matched",
        mangadex_id: String(match.id),
        title: item.title || null,
        tracked_from,
        checked_at: tracked_from,
    }, {merge: true});

    return {
        key,
        mangadex_id: String(match.id),
        tracked_from,
    };
}

async function map_manga_release_sources(manga_rows) {
    const active = manga_rows.filter((item) =>
        !["completed", "dropped"].includes(
            String(item.user_status || "")
        )
    );

    const by_key = new Map();
    for (const item of active) {
        const key = manga_release_key(item);
        if (!by_key.has(key)) {
            by_key.set(key, item);
        }
    }

    const mappings = new Map();
    const entries = [...by_key.entries()];

    // Limit new source lookups per run so a newly deployed public site
    // cannot create a large burst against MangaDex.
    for (let index = 0;
        index < entries.length;
        index += 1) {
        const [key, item] = entries[index];

        const ref = db
            .collection("release_source_maps")
            .doc("manga_" + key);
        const snap = await ref.get();

        if (!snap.exists && index >= 35) {
            continue;
        }

        const mapping =
            await resolve_mangadex_mapping(item);
        if (mapping?.mangadex_id) {
            mappings.set(key, mapping);
        }
    }

    return {active, mappings};
}

async function mangadex_recent_chapters(
    manga_ids,
    publish_since
) {
    const chapters = [];

    for (let start = 0;
        start < manga_ids.length;
        start += 50) {
        const chunk = manga_ids.slice(start, start + 50);
        let offset = 0;

        while (offset < 1000) {
            const url = new URL(
                "https://api.mangadex.org/chapter"
            );

            chunk.forEach((id) =>
                url.searchParams.append("manga[]", id)
            );
            url.searchParams.append(
                "translatedLanguage[]",
                "en"
            );
            url.searchParams.set(
                "publishAtSince",
                publish_since.toISOString()
            );
            url.searchParams.set(
                "order[publishAt]",
                "asc"
            );
            url.searchParams.set("limit", "100");
            url.searchParams.set(
                "offset",
                String(offset)
            );
            url.searchParams.set(
                "includeFuturePublishAt",
                "0"
            );
            url.searchParams.set(
                "includeExternalUrl",
                "1"
            );

            const response = await fetch(url, {
                headers: {
                    Accept: "application/json",
                    "User-Agent":
                        "StellazHQ/1.0 (https://stellaz.org)",
                },
            });

            if (!response.ok) {
                throw new Error(
                    "MangaDex chapter lookup failed (" +
                    response.status + ")."
                );
            }

            const payload = await response.json();
            const data =
                Array.isArray(payload.data)
                    ? payload.data
                    : [];
            chapters.push(...data);

            if (data.length < 100) break;
            offset += 100;
        }
    }

    return chapters;
}

async function create_manga_release_notifications(manga_rows) {
    const {active, mappings} =
        await map_manga_release_sources(manga_rows);

    if (!mappings.size) return 0;

    const state_ref = db
        .collection("release_checker_state")
        .doc("manga");
    const state_snap = await state_ref.get();

    const now = new Date();
    const previous =
        state_snap.data()?.last_success_at?.toDate?.();

    const publish_since = previous
        ? new Date(
            Math.max(
                previous.getTime() - 10 * 60 * 1000,
                now.getTime() - 48 * 60 * 60 * 1000
            )
        )
        : new Date(now.getTime() - 5 * 60 * 1000);

    const manga_ids = [
        ...new Set(
            [...mappings.values()]
                .map((item) => item.mangadex_id)
        ),
    ];

    let chapters;
    try {
        chapters = await mangadex_recent_chapters(
            manga_ids,
            publish_since
        );
    } catch (error) {
        logger.error("MangaDex release check failed.", {
            error: error.message,
        });
        return 0;
    }

    const users_by_mangadex = new Map();

    for (const item of active) {
        const mapping =
            mappings.get(manga_release_key(item));
        if (!mapping) continue;

        if (!users_by_mangadex.has(mapping.mangadex_id)) {
            users_by_mangadex.set(
                mapping.mangadex_id,
                []
            );
        }

        users_by_mangadex
            .get(mapping.mangadex_id)
            .push({
                item,
                tracked_from:
                    mapping.tracked_from,
            });
    }

    let created = 0;
    const seen_chapters = new Set();

    for (const chapter of chapters) {
        const attrs = chapter.attributes || {};
        const manga_relation =
            (chapter.relationships || []).find(
                (relation) =>
                    relation.type === "manga"
            );
        const mangadex_id =
            manga_relation?.id;
        if (!mangadex_id) continue;

        const chapter_number =
            String(attrs.chapter || "").trim();
        const numeric_chapter =
            Number.parseFloat(chapter_number);
        const publish_at =
            attrs.publishAt
                ? new Date(attrs.publishAt)
                : now;

        const dedupe_key =
            mangadex_id + ":" +
            (chapter_number ||
             String(chapter.id));
        if (seen_chapters.has(dedupe_key)) continue;
        seen_chapters.add(dedupe_key);

        const targets =
            users_by_mangadex.get(mangadex_id) || [];

        for (const target of targets) {
            const {item, tracked_from} = target;

            if (tracked_from &&
                publish_at <= tracked_from) {
                continue;
            }

            if (Number.isFinite(numeric_chapter) &&
                numeric_chapter <=
                    Number(item.chapters_read || 0)) {
                continue;
            }

            const title = item.title || "Manga";
            const chapter_label =
                chapter_number
                    ? "Chapter " + chapter_number
                    : "A new chapter";

            const did_create =
                await create_release_notification(
                    item.user_id,
                    "manga_" +
                        notification_safe_id(mangadex_id) +
                        "_chapter_" +
                        notification_safe_id(
                            chapter_number ||
                            chapter.id
                        ),
                    {
                        type: "manga_chapter",
                        library: "Manga / Manhwa",
                        source: "MangaDex",
                        title: "New chapter · " + title,
                        message:
                            chapter_label +
                            " is now available in English.",
                        deliver_at: publish_at,
                        media_title: title,
                        chapter:
                            chapter_number || null,
                        mangadex_id,
                    }
                );

            if (did_create) created += 1;
        }
    }

    await state_ref.set({
        last_success_at: now,
        updated_at: now,
    }, {merge: true});

    return created;
}

exports.checkEntertainmentReleases = onSchedule(
    {
        schedule: "every 30 minutes",
        timeoutSeconds: 540,
        secrets: [supabase_secret_key],
    },
    async () => {
        const [anime_rows, manga_rows] =
            await Promise.all([
                notification_supabase_select(
                    "anime",
                    [
                        "id",
                        "user_id",
                        "title",
                        "anilist_id",
                        "mal_id",
                        "kitsu_id",
                        "status",
                        "episodes_watched",
                        "start_date",
                    ].join(",")
                ),
                notification_supabase_select(
                    "manga_library",
                    [
                        "id",
                        "user_id",
                        "title",
                        "title_romaji",
                        "title_native",
                        "synonyms",
                        "anilist_id",
                        "mal_id",
                        "kitsu_id",
                        "user_status",
                        "chapters_read",
                        "start_date",
                    ].join(",")
                ),
            ]);

        const [anime_created, manga_created] =
            await Promise.all([
                schedule_anime_release_notifications(
                    anime_rows
                ),
                create_manga_release_notifications(
                    manga_rows
                ),
            ]);

        logger.info("Entertainment release check complete.", {
            anime_notifications_created:
                anime_created,
            manga_notifications_created:
                manga_created,
        });
    }
);



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
//* ----- AniList Connection -----
//? ------------------------------
//#region
const anilist_client_id = defineSecret("ANILIST_CLIENT_ID");
const anilist_client_secret = defineSecret("ANILIST_CLIENT_SECRET");
const anilist_redirect_uri =
    "https://stellaz.org/entertainment_page/Entertainment.html?oauth=anilist";

async function anilist_graphql(access_token, query, variables = {}) {
    const response = await fetch("https://graphql.anilist.co", {
        method: "POST",
        headers: {
            "Authorization": "Bearer " + access_token,
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        body: JSON.stringify({query, variables}),
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok || (Array.isArray(payload.errors) && payload.errors.length)) {
        const message = payload.errors?.[0]?.message ||
            "AniList request failed.";
        const error = new Error(message);
        error.status = response.status;
        throw error;
    }

    return payload.data;
}

exports.getAniListAuthorizationUrl = onCall(
    {secrets: [anilist_client_id]},
    async (request) => {
        if (!request.auth) {
            throw new HttpsError(
                "unauthenticated",
                "You must be logged in."
            );
        }

        await db.collection("anilist_connection_attempts")
            .doc(request.auth.uid)
            .set({
                created_at: new Date(),
                redirect_uri: anilist_redirect_uri,
            });

        const url = new URL(
            "https://anilist.co/api/v2/oauth/authorize"
        );
        url.searchParams.set("client_id", anilist_client_id.value());
        url.searchParams.set("redirect_uri", anilist_redirect_uri);
        url.searchParams.set("response_type", "code");

        return {authorization_url: url.toString()};
    }
);

exports.exchangeAniListAuthorizationCode = onCall(
    {secrets: [anilist_client_id, anilist_client_secret]},
    async (request) => {
        if (!request.auth) {
            throw new HttpsError(
                "unauthenticated",
                "You must be logged in."
            );
        }

        const code = String(request.data?.code || "").trim();
        if (!code || code.length > 1000) {
            throw new HttpsError(
                "invalid-argument",
                "Invalid AniList authorization code."
            );
        }

        const attempt_ref = db.collection("anilist_connection_attempts")
            .doc(request.auth.uid);
        const attempt = await attempt_ref.get();

        if (!attempt.exists) {
            throw new HttpsError(
                "failed-precondition",
                "Start the AniList connection from Stellaz first."
            );
        }

        const created_at = attempt.data()?.created_at?.toMillis?.() || 0;
        if (!created_at || Date.now() - created_at > 15 * 60 * 1000) {
            await attempt_ref.delete().catch(() => {});
            throw new HttpsError(
                "deadline-exceeded",
                "The AniList connection request expired. Please try again."
            );
        }

        const token_response = await fetch(
            "https://anilist.co/api/v2/oauth/token",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                },
                body: JSON.stringify({
                    grant_type: "authorization_code",
                    client_id: anilist_client_id.value(),
                    client_secret: anilist_client_secret.value(),
                    redirect_uri: anilist_redirect_uri,
                    code,
                }),
            }
        );

        if (!token_response.ok) {
            const error_text = await token_response.text();
            logger.error("AniList token exchange failed.", {
                status: token_response.status,
                error: error_text,
            });
            throw new HttpsError(
                "internal",
                "AniList authorization could not be completed."
            );
        }

        const tokens = await token_response.json();
        const access_token = String(tokens.access_token || "");
        if (!access_token) {
            throw new HttpsError(
                "internal",
                "AniList did not return an access token."
            );
        }

        let viewer;
        try {
            const data = await anilist_graphql(
                access_token,
                "query { Viewer { id name } }"
            );
            viewer = data?.Viewer;
        } catch (error) {
            logger.error("AniList Viewer lookup failed.", {
                status: error.status || null,
                error: error.message,
            });
            throw new HttpsError(
                "internal",
                "AniList account verification failed."
            );
        }

        if (!viewer?.id) {
            throw new HttpsError(
                "internal",
                "AniList account verification failed."
            );
        }

        const expires_in = Number(tokens.expires_in || 31536000);
        const expires_at = Date.now() + expires_in * 1000;

        await db.collection("anilist_connections")
            .doc(request.auth.uid)
            .set({
                access_token,
                token_type: tokens.token_type || "Bearer",
                expires_at,
                anilist_user_id: Number(viewer.id),
                username: viewer.name || "",
                connected_at: new Date(),
            }, {merge: true});

        await attempt_ref.delete();

        return {
            success: true,
            username: viewer.name || "AniList",
        };
    }
);

exports.getAniListConnectionStatus = onCall(async (request) => {
    if (!request.auth) {
        throw new HttpsError(
            "unauthenticated",
            "You must be logged in."
        );
    }

    const snapshot = await db.collection("anilist_connections")
        .doc(request.auth.uid)
        .get();

    if (!snapshot.exists) {
        return {connected: false, needs_reconnect: false};
    }

    const data = snapshot.data();
    const expires_at = Number(data.expires_at || 0);

    if (!data.access_token || !data.anilist_user_id ||
        (expires_at && expires_at <= Date.now())) {
        return {
            connected: false,
            needs_reconnect: true,
            username: data.username || null,
        };
    }

    return {
        connected: true,
        needs_reconnect: false,
        username: data.username || null,
    };
});

function anilist_list_status_to_stellaz(status) {
    return ({
        CURRENT: "reading",
        COMPLETED: "completed",
        PAUSED: "on_hold",
        DROPPED: "dropped",
        PLANNING: "plan_to_read",
        REPEATING: "reading",
    })[status] || "reading";
}

function anilist_anime_status_to_stellaz(status) {
    return ({
        CURRENT: "watching",
        COMPLETED: "completed",
        PAUSED: "on_hold",
        DROPPED: "dropped",
        PLANNING: "plan_to_watch",
        REPEATING: "watching",
    })[status] || "plan_to_watch";
}

exports.syncAniListAnimeList = onCall(async (request) => {
    if (!request.auth) {
        throw new HttpsError(
            "unauthenticated",
            "You must be logged in."
        );
    }

    const snapshot = await db.collection("anilist_connections")
        .doc(request.auth.uid)
        .get();

    if (!snapshot.exists) {
        throw new HttpsError(
            "failed-precondition",
            "Connect AniList before importing your anime list."
        );
    }

    const connection = snapshot.data();
    if (!connection.access_token ||
        (Number(connection.expires_at || 0) &&
         Number(connection.expires_at) <= Date.now())) {
        throw new HttpsError(
            "failed-precondition",
            "Your AniList authorization expired. Reconnect AniList."
        );
    }

    const query = [
        "query ($userId: Int!, $page: Int!) {",
        "  Page(page: $page, perPage: 50) {",
        "    pageInfo { currentPage hasNextPage }",
        "    mediaList(userId: $userId, type: ANIME, sort: UPDATED_TIME_DESC) {",
        "      id",
        "      status",
        "      score(format: POINT_10_DECIMAL)",
        "      progress",
        "      updatedAt",
        "      media {",
        "        id",
        "        title { romaji english native userPreferred }",
        "        synonyms",
        "        format",
        "        status",
        "        episodes",
        "        duration",
        "        averageScore",
        "        description(asHtml: false)",
        "        genres",
        "        siteUrl",
        "        coverImage { extraLarge large }",
        "        startDate { year month day }",
        "        endDate { year month day }",
        "      }",
        "    }",
        "  }",
        "}"
    ].join("\n");

    const imported = [];
    let page = 1;
    let has_next_page = true;

    try {
        while (has_next_page && page <= 220) {
            const data = await anilist_graphql(
                connection.access_token,
                query,
                {
                    userId: Number(connection.anilist_user_id),
                    page,
                }
            );

            const page_data = data?.Page;
            const entries = page_data?.mediaList || [];

            for (const entry of entries) {
                const media = entry.media;
                if (!media?.id) continue;

                const total_episodes =
                    Number(media.episodes || 0) || null;
                let episodes_watched =
                    Math.max(0, Number(entry.progress || 0));

                if (entry.status === "COMPLETED" &&
                    total_episodes !== null) {
                    episodes_watched = Math.max(
                        episodes_watched,
                        total_episodes
                    );
                }

                imported.push({
                    anilist_id: Number(media.id),
                    title: media.title?.english ||
                        media.title?.userPreferred ||
                        media.title?.romaji ||
                        media.title?.native ||
                        "Untitled",
                    title_romaji: media.title?.romaji || null,
                    title_native: media.title?.native || null,
                    synonyms: Array.isArray(media.synonyms) ?
                        media.synonyms.filter(Boolean).slice(0, 20) : [],
                    status:
                        anilist_anime_status_to_stellaz(entry.status),
                    episodes_watched,
                    total_episodes,
                    my_rating:
                        Number(entry.score || 0) > 0 ?
                            Number(entry.score) : null,
                    poster_url:
                        media.coverImage?.extraLarge ||
                        media.coverImage?.large ||
                        null,
                    media_type:
                        String(media.format || "")
                            .toLowerCase() || null,
                    start_date:
                        anilist_date_to_iso(media.startDate),
                    finish_date:
                        anilist_date_to_iso(media.endDate),
                    average_episode_duration_ms:
                        Number(media.duration || 0) > 0 ?
                            Number(media.duration) * 60 :
                            null,
                    anilist_score:
                        Number(media.averageScore || 0) || null,
                    description:
                        clean_anilist_description(media.description),
                    genres: Array.isArray(media.genres) ?
                        media.genres : [],
                    site_url: media.siteUrl || null,
                });
            }

            has_next_page =
                page_data?.pageInfo?.hasNextPage === true;
            page += 1;
        }
    } catch (error) {
        logger.error("AniList anime import failed.", {
            status: error.status || null,
            error: error.message,
        });

        if (error.status === 401) {
            throw new HttpsError(
                "failed-precondition",
                "Your AniList authorization is no longer valid. Reconnect AniList."
            );
        }

        throw new HttpsError(
            "internal",
            "AniList anime import failed."
        );
    }

    return {
        username: connection.username || null,
        anime: imported,
        count: imported.length,
    };
});


exports.syncAniListMangaList = onCall(async (request) => {
    if (!request.auth) {
        throw new HttpsError(
            "unauthenticated",
            "You must be logged in."
        );
    }

    const snapshot = await db.collection("anilist_connections")
        .doc(request.auth.uid)
        .get();

    if (!snapshot.exists) {
        throw new HttpsError(
            "failed-precondition",
            "Connect AniList before importing your manga list."
        );
    }

    const connection = snapshot.data();
    if (!connection.access_token ||
        (Number(connection.expires_at || 0) &&
         Number(connection.expires_at) <= Date.now())) {
        throw new HttpsError(
            "failed-precondition",
            "Your AniList authorization expired. Reconnect AniList."
        );
    }

    const query = [
        "query ($userId: Int!, $page: Int!) {",
        "  Page(page: $page, perPage: 50) {",
        "    pageInfo { currentPage hasNextPage }",
        "    mediaList(userId: $userId, type: MANGA, sort: UPDATED_TIME_DESC) {",
        "      id",
        "      status",
        "      score(format: POINT_10_DECIMAL)",
        "      progress",
        "      progressVolumes",
        "      updatedAt",
        "      media {",
        "        id",
        "        title { romaji english native userPreferred }",
        "        synonyms",
        "        countryOfOrigin",
        "        format",
        "        status",
        "        chapters",
        "        volumes",
        "        averageScore",
        "        description(asHtml: false)",
        "        genres",
        "        siteUrl",
        "        coverImage { extraLarge large }",
        "        bannerImage",
        "        startDate { year month day }",
        "        endDate { year month day }",
        "      }",
        "    }",
        "  }",
        "}"
    ].join("\n");

    const imported = [];
    let page = 1;
    let has_next_page = true;

    try {
        while (has_next_page && page <= 220) {
            const data = await anilist_graphql(
                connection.access_token,
                query,
                {
                    userId: Number(connection.anilist_user_id),
                    page,
                }
            );

            const page_data = data?.Page;
            const entries = page_data?.mediaList || [];

            for (const entry of entries) {
                const media = entry.media;
                if (!media?.id || media.format === "NOVEL") continue;

                const total_chapters =
                    Number(media.chapters || 0) || null;
                let chapters_read =
                    Math.max(0, Number(entry.progress || 0));

                if (entry.status === "COMPLETED" &&
                    total_chapters !== null) {
                    chapters_read = Math.max(
                        chapters_read,
                        total_chapters
                    );
                }

                imported.push({
                    anilist_id: Number(media.id),
                    title: media.title?.english ||
                        media.title?.userPreferred ||
                        media.title?.romaji ||
                        media.title?.native ||
                        "Untitled",
                    title_romaji: media.title?.romaji || null,
                    title_native: media.title?.native || null,
                    synonyms: Array.isArray(media.synonyms) ?
                        media.synonyms.filter(Boolean).slice(0, 20) : [],
                    country_of_origin:
                        media.countryOfOrigin || null,
                    media_kind:
                        anilist_media_kind(media.countryOfOrigin),
                    format: media.format || null,
                    publication_status: media.status || null,
                    user_status:
                        anilist_list_status_to_stellaz(entry.status),
                    chapters_read,
                    total_chapters,
                    volumes_read:
                        Math.max(0, Number(entry.progressVolumes || 0)),
                    total_volumes:
                        Number(media.volumes || 0) || null,
                    my_rating:
                        Number(entry.score || 0) > 0 ?
                            Number(entry.score) : null,
                    anilist_score:
                        Number(media.averageScore || 0) || null,
                    poster_url:
                        media.coverImage?.extraLarge ||
                        media.coverImage?.large ||
                        null,
                    banner_url: media.bannerImage || null,
                    description:
                        clean_anilist_description(media.description),
                    genres: Array.isArray(media.genres) ?
                        media.genres : [],
                    site_url: media.siteUrl || null,
                    start_date:
                        anilist_date_to_iso(media.startDate),
                    end_date:
                        anilist_date_to_iso(media.endDate),
                });
            }

            has_next_page =
                page_data?.pageInfo?.hasNextPage === true;
            page += 1;
        }
    } catch (error) {
        logger.error("AniList manga import failed.", {
            status: error.status || null,
            error: error.message,
        });

        if (error.status === 401) {
            throw new HttpsError(
                "failed-precondition",
                "Your AniList authorization is no longer valid. Reconnect AniList."
            );
        }

        throw new HttpsError(
            "internal",
            "AniList manga import failed."
        );
    }

    return {
        username: connection.username || null,
        manga: imported,
        count: imported.length,
    };
});
//#endregion


//? ------------------------------
//* ----- AniList Manga Search ---
//? ------------------------------
//#region
function anilist_date_to_iso(date) {
    if (!date || !Number(date.year)) return null;
    const month = String(Number(date.month) || 1).padStart(2, "0");
    const day = String(Number(date.day) || 1).padStart(2, "0");
    return String(date.year) + "-" + month + "-" + day;
}

function anilist_media_kind(country_code) {
    if (country_code === "KR") return "Manhwa";
    if (country_code === "CN" || country_code === "TW") return "Manhua";
    if (country_code === "JP") return "Manga";
    return "Other";
}

function clean_anilist_description(value) {
    return String(value || "")
        .replace(/<br\s*\/?\s*>/gi, "\n")
        .replace(/<[^>]*>/g, "")
        .replace(/~!/g, "")
        .replace(/!~/g, "")
        .trim();
}

exports.searchAniListAnime = onCall(async (request) => {
    if (!request.auth) {
        throw new HttpsError(
            "unauthenticated",
            "You must be logged in."
        );
    }

    const search =
        String(request.data?.query || "").trim();

    if (search.length < 2) {
        return {results: []};
    }

    if (search.length > 120) {
        throw new HttpsError(
            "invalid-argument",
            "Search is too long."
        );
    }

    const query_text = [
        "query ($search: String!, $perPage: Int!) {",
        "  Page(page: 1, perPage: $perPage) {",
        "    media(search: $search, type: ANIME, isAdult: false) {",
        "      id",
        "      title { romaji english native userPreferred }",
        "      synonyms",
        "      format",
        "      status",
        "      episodes",
        "      duration",
        "      averageScore",
        "      description(asHtml: false)",
        "      genres",
        "      siteUrl",
        "      coverImage { extraLarge large }",
        "      startDate { year month day }",
        "      endDate { year month day }",
        "    }",
        "  }",
        "}",
    ].join("\n");

    const response = await fetch(
        "https://graphql.anilist.co",
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
            },
            body: JSON.stringify({
                query: query_text,
                variables: {
                    search,
                    perPage: 12,
                },
            }),
        }
    );

    if (!response.ok) {
        logger.error("AniList anime search failed.", {
            status: response.status,
        });
        throw new HttpsError(
            "internal",
            "Anime search failed."
        );
    }

    const payload = await response.json();

    if (Array.isArray(payload.errors) &&
        payload.errors.length) {
        logger.error("AniList anime GraphQL search failed.", {
            errors: payload.errors.map(
                (error) => error.message
            ),
        });
        throw new HttpsError(
            "internal",
            "Anime search failed."
        );
    }

    const media =
        payload.data?.Page?.media || [];

    return {
        results: media.map((item) => ({
            anilist_id: Number(item.id),
            title:
                item.title?.english ||
                item.title?.userPreferred ||
                item.title?.romaji ||
                item.title?.native ||
                "Untitled",
            title_romaji:
                item.title?.romaji || null,
            title_native:
                item.title?.native || null,
            synonyms:
                Array.isArray(item.synonyms)
                    ? item.synonyms
                        .filter(Boolean)
                        .slice(0, 20)
                    : [],
            media_type:
                String(item.format || "")
                    .toLowerCase() || null,
            total_episodes:
                Number(item.episodes || 0) || null,
            average_episode_duration_seconds:
                Number(item.duration || 0) > 0
                    ? Number(item.duration) * 60
                    : null,
            anilist_score:
                Number(item.averageScore || 0) || null,
            poster_url:
                item.coverImage?.extraLarge ||
                item.coverImage?.large ||
                null,
            description:
                clean_anilist_description(
                    item.description
                ),
            genres:
                Array.isArray(item.genres)
                    ? item.genres
                    : [],
            site_url:
                item.siteUrl || null,
            start_date:
                anilist_date_to_iso(
                    item.startDate
                ),
            finish_date:
                anilist_date_to_iso(
                    item.endDate
                ),
        })),
    };
});


exports.searchAniListManga = onCall(async (request) => {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "You must be logged in.");
    }

    const search = String(request.data?.query || "").trim();
    if (search.length < 2) return {results: []};
    if (search.length > 120) {
        throw new HttpsError("invalid-argument", "Search is too long.");
    }

    const query_text = [
        "query ($search: String!, $perPage: Int!) {",
        "  Page(page: 1, perPage: $perPage) {",
        "    media(search: $search, type: MANGA, isAdult: false) {",
        "      id",
        "      title { romaji english native userPreferred }",
        "      synonyms",
        "      countryOfOrigin",
        "      format",
        "      status",
        "      chapters",
        "      volumes",
        "      averageScore",
        "      description(asHtml: false)",
        "      genres",
        "      siteUrl",
        "      coverImage { extraLarge large }",
        "      bannerImage",
        "      startDate { year month day }",
        "      endDate { year month day }",
        "    }",
        "  }",
        "}"
    ].join("\n");

    const response = await fetch("https://graphql.anilist.co", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        body: JSON.stringify({
            query: query_text,
            variables: {search, perPage: 12},
        }),
    });

    if (!response.ok) {
        logger.error("AniList manga search failed.", {
            status: response.status,
        });
        throw new HttpsError("internal", "AniList search failed.");
    }

    const payload = await response.json();
    if (Array.isArray(payload.errors) && payload.errors.length) {
        logger.error("AniList GraphQL search failed.", {
            errors: payload.errors.map((error) => error.message),
        });
        throw new HttpsError("internal", "AniList search failed.");
    }

    const media = payload.data?.Page?.media || [];

    return {
        results: media
            .filter((item) => item.format !== "NOVEL")
            .map((item) => ({
                anilist_id: Number(item.id),
                title: item.title?.english ||
                    item.title?.userPreferred ||
                    item.title?.romaji ||
                    item.title?.native ||
                    "Untitled",
                title_romaji: item.title?.romaji || null,
                title_native: item.title?.native || null,
                synonyms: Array.isArray(item.synonyms) ?
                    item.synonyms.filter(Boolean).slice(0, 20) : [],
                country_of_origin: item.countryOfOrigin || null,
                media_kind: anilist_media_kind(item.countryOfOrigin),
                format: item.format || null,
                publication_status: item.status || null,
                total_chapters: Number(item.chapters || 0) || null,
                total_volumes: Number(item.volumes || 0) || null,
                anilist_score: Number(item.averageScore || 0) || null,
                poster_url: item.coverImage?.extraLarge ||
                    item.coverImage?.large || null,
                banner_url: item.bannerImage || null,
                description: clean_anilist_description(item.description),
                genres: Array.isArray(item.genres) ? item.genres : [],
                site_url: item.siteUrl || null,
                start_date: anilist_date_to_iso(item.startDate),
                end_date: anilist_date_to_iso(item.endDate),
            })),
    };
});
//#endregion



//? ------------------------------
//* ----- Stellaz Friends -------
//? ------------------------------
//#region
function normalize_stellaz_username(value) {
    const display_name = String(value || "")
        .normalize("NFKC")
        .trim()
        .replace(/\s+/g, " ");

    if (display_name.length < 2 ||
        display_name.length > 24) {
        throw new HttpsError(
            "invalid-argument",
            "Username must be between 2 and 24 characters."
        );
    }

    if (!/^[\p{L}\p{N}_. -]+$/u.test(display_name)) {
        throw new HttpsError(
            "invalid-argument",
            "Username can use letters, numbers, spaces, periods, underscores, and hyphens."
        );
    }

    const username_key =
        display_name.toLocaleLowerCase("en-US");

    return {
        display_name,
        username_key,
        index_id: createHash("sha256")
            .update(username_key)
            .digest("hex"),
    };
}

function friend_pair_id(uid_a, uid_b) {
    return createHash("sha256")
        .update(
            [String(uid_a), String(uid_b)]
                .sort()
                .join(":")
        )
        .digest("hex");
}

function public_friend_profile(uid, data = {}) {
    return {
        uid,
        username:
            data.display_name || "Stellaz user",
        profile_avatar:
            data.profile_avatar || null,
    };
}

async function reserve_stellaz_username(
    uid,
    username,
    profile_patch = {}
) {
    const normalized =
        normalize_stellaz_username(username);
    const user_ref =
        db.collection("users").doc(uid);
    const index_ref =
        db.collection("usernames")
            .doc(normalized.index_id);

    await db.runTransaction(async (transaction) => {
        const user_snapshot =
            await transaction.get(user_ref);
        const user_data =
            user_snapshot.exists
                ? user_snapshot.data()
                : {};

        const old_index_id =
            user_data.username_index_id || null;
        const new_index_snapshot =
            await transaction.get(index_ref);

        let old_index_ref = null;
        let old_index_snapshot = null;

        if (old_index_id &&
            old_index_id !== normalized.index_id) {
            old_index_ref =
                db.collection("usernames")
                    .doc(old_index_id);
            old_index_snapshot =
                await transaction.get(
                    old_index_ref
                );
        }

        if (new_index_snapshot.exists &&
            new_index_snapshot.data()?.uid !== uid) {
            throw new HttpsError(
                "already-exists",
                "That username is already taken."
            );
        }

        transaction.set(
            index_ref,
            {
                uid,
                display_name:
                    normalized.display_name,
                username_key:
                    normalized.username_key,
                updated_at:
                    new Date(),
            },
            {merge: true}
        );

        if (old_index_ref &&
            old_index_snapshot?.exists &&
            old_index_snapshot.data()?.uid === uid) {
            transaction.delete(old_index_ref);
        }

        transaction.set(
            user_ref,
            {
                display_name:
                    normalized.display_name,
                username_key:
                    normalized.username_key,
                username_index_id:
                    normalized.index_id,
                ...profile_patch,
                profile_updated_at:
                    new Date(),
            },
            {merge: true}
        );
    });

    return normalized;
}

exports.saveStellazProfile =
    onCall(async (request) => {
        if (!request.auth) {
            throw new HttpsError(
                "unauthenticated",
                "You must be logged in."
            );
        }

        const profile_avatar =
            String(
                request.data?.profile_avatar || ""
            ).trim()
                .slice(0, 300) || null;

        const normalized =
            await reserve_stellaz_username(
                request.auth.uid,
                request.data?.username,
                {profile_avatar}
            );

        return {
            username:
                normalized.display_name,
            profile_avatar,
        };
    });

exports.ensureStellazUsernameIndex =
    onCall(async (request) => {
        if (!request.auth) {
            throw new HttpsError(
                "unauthenticated",
                "You must be logged in."
            );
        }

        const user_ref =
            db.collection("users")
                .doc(request.auth.uid);
        const snapshot =
            await user_ref.get();
        const data =
            snapshot.exists
                ? snapshot.data()
                : {};

        const email =
            String(
                request.auth.token?.email || ""
            );
        const fallback =
            email.includes("@")
                ? email.split("@")[0]
                : "";

        const candidate =
            data.display_name || fallback;

        if (!candidate) {
            return {
                indexed: false,
                needs_username: true,
            };
        }

        try {
            const normalized =
                await reserve_stellaz_username(
                    request.auth.uid,
                    candidate
                );

            return {
                indexed: true,
                username:
                    normalized.display_name,
            };
        } catch (error) {
            if (error instanceof HttpsError &&
                error.code ===
                    "already-exists") {
                return {
                    indexed: false,
                    needs_username_change: true,
                    username:
                        String(candidate),
                };
            }

            throw error;
        }
    });

async function find_stellaz_user_by_username(
    username
) {
    const normalized =
        normalize_stellaz_username(username);
    const index_ref =
        db.collection("usernames")
            .doc(normalized.index_id);
    const index_snapshot =
        await index_ref.get();

    if (index_snapshot.exists &&
        index_snapshot.data()?.uid) {
        return {
            uid: index_snapshot.data().uid,
            username:
                index_snapshot.data()
                    .display_name ||
                normalized.display_name,
        };
    }

    // Temporary compatibility path for profiles created before the
    // username index existed. It self-heals the match into the index.
    const legacy_snapshot =
        await db.collection("users")
            .limit(500)
            .get();

    const matches =
        legacy_snapshot.docs.filter((doc_snapshot) => {
            const existing =
                doc_snapshot.data()
                    ?.display_name;
            if (!existing) return false;

            try {
                return normalize_stellaz_username(
                    existing
                ).username_key ===
                    normalized.username_key;
            } catch (_) {
                return false;
            }
        });

    if (matches.length > 1) {
        throw new HttpsError(
            "failed-precondition",
            "More than one older account uses that username. The other person needs to choose a unique username first."
        );
    }

    if (matches.length === 1) {
        const target =
            matches[0];
        const target_name =
            target.data().display_name;

        try {
            await reserve_stellaz_username(
                target.id,
                target_name
            );
        } catch (_) {
            // Another request may have indexed it first.
        }

        return {
            uid: target.id,
            username: target_name,
        };
    }

    throw new HttpsError(
        "not-found",
        "No Stellaz account was found with that username."
    );
}

exports.sendFriendRequest =
    onCall(async (request) => {
        if (!request.auth) {
            throw new HttpsError(
                "unauthenticated",
                "You must be logged in."
            );
        }

        const sender_uid =
            request.auth.uid;
        const target =
            await find_stellaz_user_by_username(
                request.data?.username
            );
        const receiver_uid =
            target.uid;

        if (receiver_uid === sender_uid) {
            throw new HttpsError(
                "invalid-argument",
                "You cannot send a friend request to yourself."
            );
        }

        const request_id =
            friend_pair_id(
                sender_uid,
                receiver_uid
            );
        const request_ref =
            db.collection("friend_requests")
                .doc(request_id);
        const friendship_ref =
            db.collection("friendships")
                .doc(request_id);

        await db.runTransaction(async (transaction) => {
            const [
                friendship_snapshot,
                request_snapshot,
            ] = await Promise.all([
                transaction.get(
                    friendship_ref
                ),
                transaction.get(
                    request_ref
                ),
            ]);

            if (friendship_snapshot.exists) {
                throw new HttpsError(
                    "already-exists",
                    "You are already friends."
                );
            }

            if (request_snapshot.exists &&
                request_snapshot.data()
                    ?.status === "pending") {
                const existing =
                    request_snapshot.data();

                if (existing.receiver_uid ===
                    sender_uid) {
                    throw new HttpsError(
                        "failed-precondition",
                        "That person already sent you a friend request. Open Friends to accept it."
                    );
                }

                throw new HttpsError(
                    "already-exists",
                    "Friend request already sent."
                );
            }

            transaction.set(
                request_ref,
                {
                    sender_uid,
                    receiver_uid,
                    status: "pending",
                    created_at:
                        new Date(),
                    updated_at:
                        new Date(),
                }
            );
        });

        return {
            sent: true,
            request_id,
            username:
                target.username,
        };
    });

exports.respondToFriendRequest =
    onCall(async (request) => {
        if (!request.auth) {
            throw new HttpsError(
                "unauthenticated",
                "You must be logged in."
            );
        }

        const request_id =
            String(
                request.data?.request_id || ""
            );
        const action =
            String(
                request.data?.action || ""
            );

        if (!/^[a-f0-9]{64}$/.test(
            request_id
        ) ||
            !["accept", "decline"].includes(
                action
            )) {
            throw new HttpsError(
                "invalid-argument",
                "A valid friend request action is required."
            );
        }

        const request_ref =
            db.collection("friend_requests")
                .doc(request_id);
        const friendship_ref =
            db.collection("friendships")
                .doc(request_id);

        await db.runTransaction(async (transaction) => {
            const request_snapshot =
                await transaction.get(
                    request_ref
                );

            if (!request_snapshot.exists) {
                throw new HttpsError(
                    "not-found",
                    "Friend request not found."
                );
            }

            const data =
                request_snapshot.data();

            if (data.receiver_uid !==
                request.auth.uid) {
                throw new HttpsError(
                    "permission-denied",
                    "That friend request does not belong to you."
                );
            }

            if (data.status !== "pending") {
                throw new HttpsError(
                    "failed-precondition",
                    "That friend request has already been answered."
                );
            }

            if (action === "decline") {
                transaction.update(
                    request_ref,
                    {
                        status: "declined",
                        responded_at:
                            new Date(),
                        updated_at:
                            new Date(),
                    }
                );
                return;
            }

            transaction.set(
                friendship_ref,
                {
                    members: [
                        data.sender_uid,
                        data.receiver_uid,
                    ].sort(),
                    created_at:
                        new Date(),
                    accepted_request_id:
                        request_id,
                }
            );

            transaction.update(
                request_ref,
                {
                    status: "accepted",
                    responded_at:
                        new Date(),
                    updated_at:
                        new Date(),
                }
            );
        });

        return {
            accepted:
                action === "accept",
        };
    });

exports.getFriendOverview =
    onCall(async (request) => {
        if (!request.auth) {
            throw new HttpsError(
                "unauthenticated",
                "You must be logged in."
            );
        }

        const uid =
            request.auth.uid;

        const [
            friendship_snapshot,
            incoming_snapshot,
            outgoing_snapshot,
        ] = await Promise.all([
            db.collection("friendships")
                .where(
                    "members",
                    "array-contains",
                    uid
                )
                .get(),
            db.collection("friend_requests")
                .where(
                    "receiver_uid",
                    "==",
                    uid
                )
                .get(),
            db.collection("friend_requests")
                .where(
                    "sender_uid",
                    "==",
                    uid
                )
                .get(),
        ]);

        const friendships =
            friendship_snapshot.docs
                .map((doc_snapshot) => ({
                    id: doc_snapshot.id,
                    ...doc_snapshot.data(),
                }));

        const incoming =
            incoming_snapshot.docs
                .map((doc_snapshot) => ({
                    id: doc_snapshot.id,
                    ...doc_snapshot.data(),
                }))
                .filter((item) =>
                    item.status === "pending"
                );

        const outgoing =
            outgoing_snapshot.docs
                .map((doc_snapshot) => ({
                    id: doc_snapshot.id,
                    ...doc_snapshot.data(),
                }))
                .filter((item) =>
                    item.status === "pending"
                );

        const profile_uids =
            new Set();

        friendships.forEach((item) => {
            (item.members || [])
                .filter((member_uid) =>
                    member_uid !== uid
                )
                .forEach((member_uid) =>
                    profile_uids.add(
                        member_uid
                    )
                );
        });

        incoming.forEach((item) =>
            profile_uids.add(
                item.sender_uid
            )
        );
        outgoing.forEach((item) =>
            profile_uids.add(
                item.receiver_uid
            )
        );

        const profile_refs =
            [...profile_uids].map(
                (profile_uid) =>
                    db.collection("users")
                        .doc(profile_uid)
            );

        const profile_snapshots =
            profile_refs.length
                ? await db.getAll(
                    ...profile_refs
                )
                : [];

        const profiles =
            new Map(
                profile_snapshots.map(
                    (snapshot) => [
                        snapshot.id,
                        public_friend_profile(
                            snapshot.id,
                            snapshot.exists
                                ? snapshot.data()
                                : {}
                        ),
                    ]
                )
            );

        const fallback_profile =
            (profile_uid) =>
                profiles.get(profile_uid) ||
                public_friend_profile(
                    profile_uid
                );

        const friends =
            friendships.map((item) => {
                const friend_uid =
                    (item.members || [])
                        .find(
                            (member_uid) =>
                                member_uid !== uid
                        );

                return {
                    friendship_id:
                        item.id,
                    ...fallback_profile(
                        friend_uid
                    ),
                };
            });

        const incoming_requests =
            incoming.map((item) => ({
                request_id:
                    item.id,
                ...fallback_profile(
                    item.sender_uid
                ),
            }));

        const outgoing_requests =
            outgoing.map((item) => ({
                request_id:
                    item.id,
                ...fallback_profile(
                    item.receiver_uid
                ),
            }));

        const by_username =
            (a, b) =>
                String(a.username)
                    .localeCompare(
                        String(b.username)
                    );

        friends.sort(by_username);
        incoming_requests.sort(
            by_username
        );
        outgoing_requests.sort(
            by_username
        );

        return {
            friends,
            incoming:
                incoming_requests,
            outgoing:
                outgoing_requests,
        };
    });
//#endregion



//? ------------------------------
//* ----- Stellaz Guilds --------
//? ------------------------------
//#region
function normalize_guild_name(value) {
    const name = String(value || "")
        .normalize("NFKC")
        .trim()
        .replace(/\s+/g, " ");

    if (name.length < 2 || name.length > 40) {
        throw new HttpsError(
            "invalid-argument",
            "Guild name must be between 2 and 40 characters."
        );
    }

    if ([...name].some((character) => {
        const code = character.charCodeAt(0);
        return code < 32 || code === 127;
    })) {
        throw new HttpsError(
            "invalid-argument",
            "Guild name contains unsupported characters."
        );
    }

    return name;
}

function guild_invite_id(guild_id, receiver_uid) {
    return createHash("sha256")
        .update(
            String(guild_id) +
            ":" +
            String(receiver_uid)
        )
        .digest("hex");
}

async function guild_profiles(member_uids) {
    const unique_uids =
        [...new Set(
            (member_uids || [])
                .filter(Boolean)
        )];

    if (!unique_uids.length) {
        return new Map();
    }

    const snapshots =
        await db.getAll(
            ...unique_uids.map(
                (uid) =>
                    db.collection("users")
                        .doc(uid)
            )
        );

    return new Map(
        snapshots.map(
            (snapshot) => [
                snapshot.id,
                public_friend_profile(
                    snapshot.id,
                    snapshot.exists
                        ? snapshot.data()
                        : {}
                ),
            ]
        )
    );
}

exports.createGuild =
    onCall(async (request) => {
        if (!request.auth) {
            throw new HttpsError(
                "unauthenticated",
                "You must be logged in."
            );
        }

        const uid = request.auth.uid;
        const name =
            normalize_guild_name(
                request.data?.name
            );
        const membership_ref =
            db.collection("guild_memberships")
                .doc(uid);
        const guild_ref =
            db.collection("guilds")
                .doc();

        await db.runTransaction(
            async (transaction) => {
                const membership_snapshot =
                    await transaction.get(
                        membership_ref
                    );

                if (membership_snapshot.exists) {
                    throw new HttpsError(
                        "failed-precondition",
                        "You are already in a guild."
                    );
                }

                const now = new Date();

                transaction.set(
                    guild_ref,
                    {
                        name,
                        owner_uid: uid,
                        members: [uid],
                        created_at: now,
                        updated_at: now,
                    }
                );

                transaction.set(
                    membership_ref,
                    {
                        guild_id: guild_ref.id,
                        role: "owner",
                        joined_at: now,
                    }
                );
            }
        );

        return {
            created: true,
            guild_id: guild_ref.id,
            name,
        };
    });

exports.inviteFriendToGuild =
    onCall(async (request) => {
        if (!request.auth) {
            throw new HttpsError(
                "unauthenticated",
                "You must be logged in."
            );
        }

        const sender_uid =
            request.auth.uid;
        const friend_uid =
            String(
                request.data?.friend_uid || ""
            ).trim();

        if (!friend_uid ||
            friend_uid === sender_uid) {
            throw new HttpsError(
                "invalid-argument",
                "Choose a friend to invite."
            );
        }

        const sender_membership_ref =
            db.collection("guild_memberships")
                .doc(sender_uid);
        const target_membership_ref =
            db.collection("guild_memberships")
                .doc(friend_uid);
        const friendship_ref =
            db.collection("friendships")
                .doc(
                    friend_pair_id(
                        sender_uid,
                        friend_uid
                    )
                );

        let guild_id = "";

        await db.runTransaction(
            async (transaction) => {
                const [
                    sender_membership_snapshot,
                    target_membership_snapshot,
                    friendship_snapshot,
                ] = await Promise.all([
                    transaction.get(
                        sender_membership_ref
                    ),
                    transaction.get(
                        target_membership_ref
                    ),
                    transaction.get(
                        friendship_ref
                    ),
                ]);

                if (!sender_membership_snapshot.exists) {
                    throw new HttpsError(
                        "failed-precondition",
                        "Join or create a guild first."
                    );
                }

                if (!friendship_snapshot.exists) {
                    throw new HttpsError(
                        "permission-denied",
                        "You can only invite an accepted friend."
                    );
                }

                const friendship_members =
                    friendship_snapshot.data()
                        ?.members || [];

                if (!friendship_members.includes(
                    sender_uid
                ) ||
                    !friendship_members.includes(
                        friend_uid
                    )) {
                    throw new HttpsError(
                        "permission-denied",
                        "You can only invite an accepted friend."
                    );
                }

                if (target_membership_snapshot.exists) {
                    throw new HttpsError(
                        "failed-precondition",
                        "That friend is already in a guild."
                    );
                }

                guild_id =
                    String(
                        sender_membership_snapshot
                            .data()?.guild_id || ""
                    );

                if (!guild_id) {
                    throw new HttpsError(
                        "internal",
                        "Your guild membership is invalid."
                    );
                }

                const guild_ref =
                    db.collection("guilds")
                        .doc(guild_id);
                const guild_snapshot =
                    await transaction.get(
                        guild_ref
                    );

                if (!guild_snapshot.exists ||
                    !(guild_snapshot.data()
                        ?.members || [])
                        .includes(sender_uid)) {
                    throw new HttpsError(
                        "failed-precondition",
                        "Your guild could not be found."
                    );
                }

                const invite_ref =
                    db.collection("guild_invites")
                        .doc(
                            guild_invite_id(
                                guild_id,
                                friend_uid
                            )
                        );
                const invite_snapshot =
                    await transaction.get(
                        invite_ref
                    );

                if (invite_snapshot.exists &&
                    invite_snapshot.data()
                        ?.status === "pending") {
                    throw new HttpsError(
                        "already-exists",
                        "That friend already has a pending guild invitation."
                    );
                }

                const now = new Date();

                transaction.set(
                    invite_ref,
                    {
                        guild_id,
                        sender_uid,
                        receiver_uid:
                            friend_uid,
                        status: "pending",
                        created_at: now,
                        updated_at: now,
                    }
                );
            }
        );

        return {
            invited: true,
            guild_id,
            friend_uid,
        };
    });

exports.respondGuildInvite =
    onCall(async (request) => {
        if (!request.auth) {
            throw new HttpsError(
                "unauthenticated",
                "You must be logged in."
            );
        }

        const uid =
            request.auth.uid;
        const invite_id =
            String(
                request.data?.invite_id || ""
            ).trim();
        const action =
            String(
                request.data?.action || ""
            ).trim();

        if (!/^[a-f0-9]{64}$/.test(
            invite_id
        ) ||
            !["accept", "decline"].includes(
                action
            )) {
            throw new HttpsError(
                "invalid-argument",
                "A valid guild invitation action is required."
            );
        }

        const invite_ref =
            db.collection("guild_invites")
                .doc(invite_id);
        const membership_ref =
            db.collection("guild_memberships")
                .doc(uid);

        await db.runTransaction(
            async (transaction) => {
                const [
                    invite_snapshot,
                    membership_snapshot,
                ] = await Promise.all([
                    transaction.get(
                        invite_ref
                    ),
                    transaction.get(
                        membership_ref
                    ),
                ]);

                if (!invite_snapshot.exists) {
                    throw new HttpsError(
                        "not-found",
                        "Guild invitation not found."
                    );
                }

                const invite =
                    invite_snapshot.data();

                if (invite.receiver_uid !== uid) {
                    throw new HttpsError(
                        "permission-denied",
                        "That guild invitation does not belong to you."
                    );
                }

                if (invite.status !== "pending") {
                    throw new HttpsError(
                        "failed-precondition",
                        "That guild invitation has already been answered."
                    );
                }

                if (action === "decline") {
                    transaction.update(
                        invite_ref,
                        {
                            status: "declined",
                            responded_at:
                                new Date(),
                            updated_at:
                                new Date(),
                        }
                    );
                    return;
                }

                if (membership_snapshot.exists) {
                    throw new HttpsError(
                        "failed-precondition",
                        "You are already in a guild."
                    );
                }

                const guild_ref =
                    db.collection("guilds")
                        .doc(invite.guild_id);
                const guild_snapshot =
                    await transaction.get(
                        guild_ref
                    );

                if (!guild_snapshot.exists) {
                    throw new HttpsError(
                        "not-found",
                        "That guild no longer exists."
                    );
                }

                const guild =
                    guild_snapshot.data();
                const members =
                    [...new Set([
                        ...(guild.members || []),
                        uid,
                    ])];
                const now = new Date();

                transaction.update(
                    guild_ref,
                    {
                        members,
                        updated_at: now,
                    }
                );

                transaction.set(
                    membership_ref,
                    {
                        guild_id:
                            invite.guild_id,
                        role: "member",
                        joined_at: now,
                    }
                );

                transaction.update(
                    invite_ref,
                    {
                        status: "accepted",
                        responded_at: now,
                        updated_at: now,
                    }
                );
            }
        );

        return {
            accepted:
                action === "accept",
        };
    });

exports.leaveGuild =
    onCall(async (request) => {
        if (!request.auth) {
            throw new HttpsError(
                "unauthenticated",
                "You must be logged in."
            );
        }

        const uid =
            request.auth.uid;
        const membership_ref =
            db.collection("guild_memberships")
                .doc(uid);
        let guild_id = "";
        let guild_deleted = false;

        await db.runTransaction(
            async (transaction) => {
                const membership_snapshot =
                    await transaction.get(
                        membership_ref
                    );

                if (!membership_snapshot.exists) {
                    throw new HttpsError(
                        "failed-precondition",
                        "You are not in a guild."
                    );
                }

                guild_id =
                    String(
                        membership_snapshot
                            .data()?.guild_id || ""
                    );

                const guild_ref =
                    db.collection("guilds")
                        .doc(guild_id);
                const guild_snapshot =
                    await transaction.get(
                        guild_ref
                    );

                if (!guild_snapshot.exists) {
                    transaction.delete(
                        membership_ref
                    );
                    guild_deleted = true;
                    return;
                }

                const guild =
                    guild_snapshot.data();
                const remaining_members =
                    (guild.members || [])
                        .filter(
                            (member_uid) =>
                                member_uid !== uid
                        );

                transaction.delete(
                    membership_ref
                );

                if (!remaining_members.length) {
                    transaction.delete(
                        guild_ref
                    );
                    guild_deleted = true;
                    return;
                }

                const next_owner_uid =
                    guild.owner_uid === uid
                        ? remaining_members[0]
                        : guild.owner_uid;

                transaction.update(
                    guild_ref,
                    {
                        members:
                            remaining_members,
                        owner_uid:
                            next_owner_uid,
                        updated_at:
                            new Date(),
                    }
                );

                if (guild.owner_uid === uid) {
                    transaction.set(
                        db.collection(
                            "guild_memberships"
                        ).doc(next_owner_uid),
                        {
                            guild_id,
                            role: "owner",
                        },
                        {merge: true}
                    );
                }
            }
        );

        if (guild_deleted && guild_id) {
            const invite_snapshot =
                await db.collection(
                    "guild_invites"
                )
                    .where(
                        "guild_id",
                        "==",
                        guild_id
                    )
                    .get();

            if (!invite_snapshot.empty) {
                const batch =
                    db.batch();

                invite_snapshot.docs
                    .forEach(
                        (snapshot) =>
                            batch.delete(
                                snapshot.ref
                            )
                    );

                await batch.commit();
            }
        }

        return {
            left: true,
            guild_deleted,
        };
    });

exports.getGuildOverview =
    onCall(async (request) => {
        if (!request.auth) {
            throw new HttpsError(
                "unauthenticated",
                "You must be logged in."
            );
        }

        const uid =
            request.auth.uid;
        const membership_ref =
            db.collection("guild_memberships")
                .doc(uid);

        const [
            membership_snapshot,
            incoming_snapshot,
            friendship_snapshot,
        ] = await Promise.all([
            membership_ref.get(),
            db.collection("guild_invites")
                .where(
                    "receiver_uid",
                    "==",
                    uid
                )
                .get(),
            db.collection("friendships")
                .where(
                    "members",
                    "array-contains",
                    uid
                )
                .get(),
        ]);

        const pending_incoming =
            incoming_snapshot.docs
                .map(
                    (snapshot) => ({
                        id: snapshot.id,
                        ...snapshot.data(),
                    })
                )
                .filter(
                    (invite) =>
                        invite.status ===
                            "pending"
                );

        const incoming_guild_ids =
            [...new Set(
                pending_incoming
                    .map(
                        (invite) =>
                            invite.guild_id
                    )
                    .filter(Boolean)
            )];

        const incoming_guild_snapshots =
            incoming_guild_ids.length
                ? await db.getAll(
                    ...incoming_guild_ids.map(
                        (guild_id) =>
                            db.collection(
                                "guilds"
                            ).doc(guild_id)
                    )
                )
                : [];

        const incoming_guilds =
            new Map(
                incoming_guild_snapshots
                    .filter(
                        (snapshot) =>
                            snapshot.exists
                    )
                    .map(
                        (snapshot) => [
                            snapshot.id,
                            snapshot.data(),
                        ]
                    )
            );

        const sender_profiles =
            await guild_profiles(
                pending_incoming.map(
                    (invite) =>
                        invite.sender_uid
                )
            );

        const incoming_invites =
            pending_incoming
                .filter(
                    (invite) =>
                        incoming_guilds.has(
                            invite.guild_id
                        )
                )
                .map((invite) => ({
                    invite_id:
                        invite.id,
                    guild_id:
                        invite.guild_id,
                    guild_name:
                        incoming_guilds.get(
                            invite.guild_id
                        )?.name ||
                        "Guild",
                    sender:
                        sender_profiles.get(
                            invite.sender_uid
                        ) ||
                        public_friend_profile(
                            invite.sender_uid
                        ),
                }));

        if (!membership_snapshot.exists) {
            return {
                guild: null,
                incoming_invites,
                inviteable_friends: [],
                pending_invites: [],
            };
        }

        const guild_id =
            String(
                membership_snapshot
                    .data()?.guild_id || ""
            );
        const guild_snapshot =
            await db.collection("guilds")
                .doc(guild_id)
                .get();

        if (!guild_snapshot.exists) {
            await membership_ref.delete();
            return {
                guild: null,
                incoming_invites,
                inviteable_friends: [],
                pending_invites: [],
            };
        }

        const guild =
            guild_snapshot.data();
        const member_uids =
            guild.members || [];
        const member_profiles =
            await guild_profiles(
                member_uids
            );

        const members =
            member_uids.map(
                (member_uid) => ({
                    ...(
                        member_profiles.get(
                            member_uid
                        ) ||
                        public_friend_profile(
                            member_uid
                        )
                    ),
                    role:
                        member_uid ===
                            guild.owner_uid
                            ? "owner"
                            : "member",
                })
            );

        const guild_invites_snapshot =
            await db.collection(
                "guild_invites"
            )
                .where(
                    "guild_id",
                    "==",
                    guild_id
                )
                .get();
        const pending_guild_invites =
            guild_invites_snapshot.docs
                .map(
                    (snapshot) => ({
                        id: snapshot.id,
                        ...snapshot.data(),
                    })
                )
                .filter(
                    (invite) =>
                        invite.status ===
                            "pending"
                );
        const invited_uids =
            new Set(
                pending_guild_invites.map(
                    (invite) =>
                        invite.receiver_uid
                )
            );

        const friend_uids =
            [...new Set(
                friendship_snapshot.docs
                    .flatMap(
                        (snapshot) =>
                            snapshot.data()
                                ?.members || []
                    )
                    .filter(
                        (friend_uid) =>
                            friend_uid &&
                            friend_uid !== uid &&
                            !member_uids.includes(
                                friend_uid
                            )
                    )
            )];

        const friend_memberships =
            friend_uids.length
                ? await db.getAll(
                    ...friend_uids.map(
                        (friend_uid) =>
                            db.collection(
                                "guild_memberships"
                            ).doc(friend_uid)
                    )
                )
                : [];
        const unavailable_friend_uids =
            new Set(
                friend_memberships
                    .filter(
                        (snapshot) =>
                            snapshot.exists
                    )
                    .map(
                        (snapshot) =>
                            snapshot.id
                    )
            );
        const friend_profiles =
            await guild_profiles(
                friend_uids
            );

        const inviteable_friends =
            friend_uids
                .filter(
                    (friend_uid) =>
                        !unavailable_friend_uids
                            .has(friend_uid) &&
                        !invited_uids
                            .has(friend_uid)
                )
                .map(
                    (friend_uid) =>
                        friend_profiles.get(
                            friend_uid
                        ) ||
                        public_friend_profile(
                            friend_uid
                        )
                )
                .sort(
                    (a, b) =>
                        String(a.username)
                            .localeCompare(
                                String(
                                    b.username
                                )
                            )
                );

        const invited_profiles =
            await guild_profiles(
                [...invited_uids]
            );
        const pending_invites =
            pending_guild_invites
                .map((invite) => ({
                    invite_id:
                        invite.id,
                    ...(
                        invited_profiles.get(
                            invite.receiver_uid
                        ) ||
                        public_friend_profile(
                            invite.receiver_uid
                        )
                    ),
                }))
                .sort(
                    (a, b) =>
                        String(a.username)
                            .localeCompare(
                                String(
                                    b.username
                                )
                            )
                );

        return {
            guild: {
                id: guild_id,
                name:
                    guild.name || "Guild",
                owner_uid:
                    guild.owner_uid,
                is_owner:
                    guild.owner_uid === uid,
                members,
            },
            incoming_invites: [],
            inviteable_friends,
            pending_invites,
        };
    });
//#endregion



//? ------------------------------
//* ----- Seerr (via Plex) -------
//? ------------------------------
//#region
// Every Seerr user on this server signs in with their Plex account, so
// Stellaz reuses the Plex account token it already has (from the Plex
// connection above) to authenticate to Seerr directly — POST
// /api/v1/auth/plex, the same endpoint Seerr's own "Sign in with Plex"
// button uses. There is no separate Seerr URL/API key for a user to
// find and paste in: no Plex connection means no Seerr features, full
// stop, and there is exactly one Seerr server for the whole app,
// configured once via the SEERR_BASE_URL parameter, not per user.
//
// This also means every request Stellaz sends to Seerr is correctly
// attributed to whichever real person clicked the button, instead of
// always looking like it came from a single shared account.
const seerr_base_url_param = defineString("SEERR_BASE_URL");

function seerr_is_private_ipv4(address) {
    const parts = address
        .split(".")
        .map((value) => Number(value));

    if (parts.length !== 4 ||
        parts.some((value) =>
            !Number.isInteger(value) ||
            value < 0 ||
            value > 255
        )) {
        return true;
    }

    const [a, b] = parts;

    return (
        a === 0 ||
        a === 10 ||
        a === 127 ||
        (a === 100 && b >= 64 && b <= 127) ||
        (a === 169 && b === 254) ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 0) ||
        (a === 192 && b === 168) ||
        (a === 198 && (b === 18 || b === 19)) ||
        a >= 224
    );
}

function seerr_is_private_ip(address) {
    const family = net.isIP(address);

    if (family === 4) {
        return seerr_is_private_ipv4(address);
    }

    if (family !== 6) {
        return true;
    }

    const normalized =
        address.toLowerCase();

    if (normalized === "::1" ||
        normalized === "::" ||
        normalized.startsWith("fc") ||
        normalized.startsWith("fd") ||
        normalized.startsWith("fe8") ||
        normalized.startsWith("fe9") ||
        normalized.startsWith("fea") ||
        normalized.startsWith("feb")) {
        return true;
    }

    // IPv4-mapped IPv6 addresses.
    const mapped =
        normalized.match(
            /::ffff:(\d+\.\d+\.\d+\.\d+)$/
        );
    if (mapped) {
        return seerr_is_private_ipv4(mapped[1]);
    }

    return false;
}

async function seerr_resolve_public_host(hostname) {
    const lower = String(hostname || "")
        .toLowerCase()
        .replace(/\.$/, "");

    if (!lower ||
        lower === "localhost" ||
        lower.endsWith(".localhost") ||
        lower.endsWith(".local") ||
        lower.endsWith(".internal")) {
        throw new HttpsError(
            "invalid-argument",
            "Seerr must use an internet-reachable HTTPS hostname."
        );
    }

    if (net.isIP(lower)) {
        if (seerr_is_private_ip(lower)) {
            throw new HttpsError(
                "invalid-argument",
                "Private or local Seerr addresses are not allowed."
            );
        }

        return [{
            address: lower,
            family: net.isIP(lower),
        }];
    }

    let addresses;
    try {
        addresses = await dns.promises.lookup(
            lower,
            {
                all: true,
                verbatim: true,
            }
        );
    } catch (_) {
        throw new HttpsError(
            "failed-precondition",
            "That Seerr hostname could not be resolved."
        );
    }

    if (!addresses.length ||
        addresses.some((entry) =>
            seerr_is_private_ip(entry.address)
        )) {
        throw new HttpsError(
            "invalid-argument",
            "That Seerr hostname does not resolve to a public internet address."
        );
    }

    return addresses;
}

function normalize_seerr_base_url(value) {
    let parsed;
    try {
        parsed = new URL(
            String(value || "").trim()
        );
    } catch (_) {
        throw new HttpsError(
            "failed-precondition",
            "SEERR_BASE_URL is not a valid URL."
        );
    }

    if (parsed.protocol !== "https:") {
        throw new HttpsError(
            "failed-precondition",
            "SEERR_BASE_URL must use HTTPS."
        );
    }

    parsed.pathname =
        parsed.pathname.replace(/\/+$/, "");

    return parsed.toString().replace(/\/$/, "");
}

function get_seerr_base_url() {
    return normalize_seerr_base_url(seerr_base_url_param.value());
}

// SSRF-safe HTTPS request: resolves the hostname server-side and pins the
// connection to the resolved IP (so a later DNS change mid-request can't
// redirect it), rejects private/LAN addresses, and never follows
// redirects. SEERR_BASE_URL is a fixed, admin-configured value rather
// than per-request user input, but keeping this hardening costs nothing
// and still guards against e.g. a misconfigured or later-repointed DNS
// record silently pointing Seerr traffic somewhere it shouldn't go.
async function seerr_https_json(endpoint, request_options = {}) {
    const method =
        request_options.method || "GET";
    const request_body =
        request_options.body != null
            ? Buffer.from(
                JSON.stringify(request_options.body)
            )
            : null;

    const parsed = new URL(endpoint);
    const addresses =
        await seerr_resolve_public_host(
            parsed.hostname
        );
    // Prefer IPv4 when both families are available because Cloud Functions
    // deployments do not always have outbound IPv6 routing.
    const target =
        addresses.find((entry) => entry.family === 4) ||
        addresses[0];

    return await new Promise((resolve, reject) => {
        const request = https.request(
            {
                protocol: "https:",
                hostname: parsed.hostname,
                port: parsed.port || 443,
                path:
                    parsed.pathname +
                    parsed.search,
                method,
                servername: parsed.hostname,
                rejectUnauthorized: true,
                headers: {
                    Accept: "application/json",
                    "User-Agent":
                        "StellazHQ/1.0",
                    ...(request_options.headers || {}),
                    ...(request_body ? {
                        "Content-Type": "application/json",
                        "Content-Length": request_body.length,
                    } : {}),
                },
                timeout: 12000,
                // Node's Happy Eyeballs (dual-stack) connection logic calls
                // a custom `lookup` with `options.all: true` and expects an
                // *array* of addresses back in that case — the older
                // single (address, family) callback form below is only for
                // the non-Happy-Eyeballs path. Handling only the old form
                // made every request here fail with a cryptic
                // "Invalid IP address: undefined" once Node actually took
                // the dual-stack path, which it does by default.
                lookup:
                    (_hostname, options, callback) =>
                        options.all
                            ? callback(null, [{
                                address: target.address,
                                family: target.family,
                            }])
                            : callback(
                                null,
                                target.address,
                                target.family
                            ),
            },
            (response) => {
                let body = "";

                response.setEncoding("utf8");

                response.on("data", (chunk) => {
                    body += chunk;

                    if (body.length >
                        1024 * 1024) {
                        request.destroy(
                            new Error(
                                "Seerr response was too large."
                            )
                        );
                    }
                });

                response.on("end", () => {
                    let payload = {};
                    try {
                        payload =
                            body
                                ? JSON.parse(body)
                                : {};
                    } catch (_) {}

                    resolve({
                        status:
                            Number(
                                response.statusCode || 0
                            ),
                        payload,
                        set_cookie:
                            response.headers["set-cookie"] || null,
                    });
                });
            }
        );

        request.on("timeout", () => {
            request.destroy(
                new Error(
                    "Seerr connection timed out."
                )
            );
        });

        request.on("error", reject);
        if (request_body) request.write(request_body);
        request.end();
    });
}

// Logs a Plex account into Seerr (server-wide, single-instance) and
// returns the resulting session cookie, or null if this Plex account
// isn't recognized/allowed on that Seerr instance (Seerr answers 403 for
// a Plex user without server access, same as its own login page would).
async function seerr_login_with_plex(base_url, plex_token) {
    const result = await seerr_https_json(
        `${base_url}/api/v1/auth/plex`,
        {method: "POST", body: {authToken: plex_token}}
    );

    if (result.status < 200 || result.status >= 300) {
        logger.info(
            "Seerr /auth/plex login rejected.",
            {base_url, status: result.status}
        );
        return null;
    }

    const cookies = result.set_cookie || [];
    if (!cookies.length) {
        logger.warn(
            "Seerr /auth/plex login succeeded but returned no session cookie.",
            {base_url, status: result.status}
        );
        return null;
    }

    return cookies
        .map((entry) => entry.split(";")[0])
        .join("; ");
}

// Resolves a Stellaz user straight to a logged-in Seerr session, using
// whatever Plex account they already connected to Stellaz. Returns null
// (never throws) whenever Seerr isn't usable for this user yet — no Plex
// connection, or Plex connected but not recognized by Seerr — so callers
// can degrade gracefully instead of surfacing a raw error. Logs *why*
// either way, since "not usable yet" would otherwise look identical for
// two very different underlying reasons in the logs.
async function seerr_session_for_uid(uid) {
    const plex_snapshot = await db
        .collection("plex_connections")
        .doc(uid)
        .get();
    const plex_token = plex_snapshot.data()?.access_token;
    if (!plex_token) {
        logger.info("Seerr session skipped: Plex not connected.", {uid});
        return null;
    }

    const base_url = get_seerr_base_url();
    const cookie = await seerr_login_with_plex(base_url, plex_token);
    if (!cookie) {
        logger.warn(
            "Seerr login with this Plex account failed.",
            {uid, base_url}
        );
        return null;
    }

    return {base_url, cookie};
}

// Seerr's GET /api/v1/movie|tv/{id} embeds a `mediaInfo` object once
// anything has happened with that title (requested, downloading, or
// already in the library) — null/absent means Stellaz has never touched
// it. `mediaInfo.mediaUrl` is a ready-made Plex web-app link that Seerr
// itself computes from its own configured Plex server, so it's both the
// "is this on Plex" signal and the destination for a Watch button in one
// field — see the `setPlexUrls()` hook in Seerr's Media entity.
// Fetches Seerr's GET /api/v1/movie|tv/{id}, which is also a plain TMDB
// details proxy — its `genres`/`originalLanguage` fields double as the
// input to the French-audio and anime detection below, so no separate
// TMDB lookup is needed just to make that call.
async function seerr_fetch_media_info(base_url, cookie, media_type, tmdb_id) {
    const result = await seerr_https_json(
        `${base_url}/api/v1/${media_type}/${tmdb_id}`,
        {headers: {Cookie: cookie}}
    );

    if (result.status < 200 || result.status >= 300) {
        return {
            status_code: 1,
            watch_url: null,
            genres: [],
            original_language: null,
        };
    }

    const media_info = result.payload?.mediaInfo || null;
    return {
        status_code: Number(media_info?.status || 1),
        watch_url: media_info?.mediaUrl || null,
        genres: result.payload?.genres || [],
        original_language: result.payload?.originalLanguage || null,
    };
}

// Maps Seerr's numeric MediaStatus (1 UNKNOWN, 2 PENDING, 3 PROCESSING,
// 4 PARTIALLY_AVAILABLE, 5 AVAILABLE, 6 BLOCKLISTED, 7 DELETED) down to
// the handful of states Stellaz's UI actually distinguishes. `watch_url`
// wins outright when present — Seerr only sets it once the title exists
// in the Plex library, regardless of the exact status code.
function seerr_status_label(status_code, watch_url) {
    if (watch_url) return "available";
    if (status_code === 3) return "processing";
    if (status_code === 2) return "requested";
    return "idle";
}

// TMDB genre id 16 is "Animation" — same id this codebase already keys
// off of in Entertainment.js's own movie/show genre maps.
const seerr_animation_genre_id = 16;

function seerr_media_is_french(media_details) {
    return media_details?.original_language === "fr";
}

function seerr_media_is_anime(media_details) {
    const has_animation_genre = (media_details?.genres || []).some(
        (genre) => genre.id === seerr_animation_genre_id
    );
    return has_animation_genre &&
        media_details?.original_language === "ja";
}

// Resolves a quality profile by name to the (serverId, profileId) pair
// Seerr's request API actually needs, by searching every configured
// Radarr/Sonarr server's own profile list for a match. Rémy's rules
// below are written against profile *names* (matching what he sees in
// Seerr's own settings page) rather than hardcoded numeric ids, which
// would silently break if a server were ever removed and re-added.
// This also doubles as how an anime title ends up routed to a
// dedicated Anime Sonarr server: whichever server actually has the
// requested anime profile name is the one that gets used, with no
// separate "which server is the anime one" flag needed anywhere.
async function seerr_find_profile(base_url, cookie, service, profile_name) {
    const list_result = await seerr_https_json(
        `${base_url}/api/v1/service/${service}`,
        {headers: {Cookie: cookie}}
    );
    const servers = Array.isArray(list_result.payload)
        ? list_result.payload : [];

    for (const server of servers) {
        if (server?.id == null) continue;

        const detail_result = await seerr_https_json(
            `${base_url}/api/v1/service/${service}/${server.id}`,
            {headers: {Cookie: cookie}}
        );
        const profiles = detail_result.payload?.profiles || [];
        const profile = profiles.find((p) => p.name === profile_name);

        if (profile) {
            return {serverId: server.id, profileId: profile.id};
        }
    }

    return null;
}

// Rémy's actual rules, in profile *names* as they appear in Seerr's own
// settings page:
// - Movies: French-language titles get a choice (dual FR/EN track or
//   the plain default); everything else just gets the default.
// - TV: anime (Animation genre + Japanese original language) is routed
//   to whichever Sonarr server has the anime profiles, with a Dub/Sub
//   choice; anything else gets the regular default.
const seerr_movie_default_profile = "1080p";
const seerr_movie_french_profile = "1080p FR/EN";
const seerr_tv_default_profile = "1080p";
const seerr_anime_dub_profile = "HD - 720p/1080p DUAL";
const seerr_anime_sub_profile = "HD - 1080p SUB";

// Picks the profile name for this request given what was detected about
// the title and (for French movies / anime) the choice the user made in
// the frontend's prompt. Recomputes is_french/is_anime itself rather
// than trusting a client-supplied flag, same reasoning as re-checking
// availability before requesting.
function seerr_resolve_profile_name(media_type, media_details, choice) {
    if (media_type === "tv") {
        if (seerr_media_is_anime(media_details)) {
            return choice === "dub"
                ? seerr_anime_dub_profile
                : seerr_anime_sub_profile;
        }
        return seerr_tv_default_profile;
    }

    if (seerr_media_is_french(media_details) && choice === "fr") {
        return seerr_movie_french_profile;
    }
    return seerr_movie_default_profile;
}

exports.getSeerrMediaStatus = onCall(
    {timeoutSeconds: 30},
    async (request) => {
        if (!request.auth) {
            throw new HttpsError(
                "unauthenticated",
                "You must be logged in."
            );
        }

        const media_type =
            request.data?.media_type === "tv"
                ? "tv" : "movie";
        const tmdb_id =
            Number(request.data?.tmdb_id);

        if (!tmdb_id) {
            throw new HttpsError(
                "invalid-argument",
                "A TMDB ID is required to check its status."
            );
        }

        try {
            const session = await seerr_session_for_uid(request.auth.uid);
            if (!session) {
                return {
                    connected: false,
                    status: "idle",
                    watch_url: null,
                    is_french: false,
                    is_anime: false,
                };
            }

            const media_details = await seerr_fetch_media_info(
                session.base_url,
                session.cookie,
                media_type,
                tmdb_id
            );

            return {
                connected: true,
                status: seerr_status_label(
                    media_details.status_code, media_details.watch_url
                ),
                watch_url: media_details.watch_url,
                // Only meaningful for the frontend to act on when the
                // status above is "idle" (nothing requested/available
                // yet) — surfaced either way for simplicity.
                is_french: media_type === "movie" &&
                    seerr_media_is_french(media_details),
                is_anime: media_type === "tv" &&
                    seerr_media_is_anime(media_details),
            };
        } catch (error) {
            // A failed status check shouldn't block the details dialog from
            // opening — fall back to "idle" so the Request button still
            // renders, same as if nothing had ever been checked.
            logger.warn(
                "Unable to check Seerr media status.",
                {
                    uid: request.auth.uid,
                    tmdb_id,
                    media_type,
                    error:
                        error?.message ||
                        "Connection failed",
                }
            );

            return {
                connected: true,
                status: "idle",
                watch_url: null,
                is_french: false,
                is_anime: false,
            };
        }
    }
);

exports.requestMediaOnSeerr = onCall(
    {timeoutSeconds: 30},
    async (request) => {
        if (!request.auth) {
            throw new HttpsError(
                "unauthenticated",
                "You must be logged in."
            );
        }

        const media_type =
            request.data?.media_type === "tv"
                ? "tv" : "movie";
        const tmdb_id =
            Number(request.data?.tmdb_id);

        if (!tmdb_id) {
            throw new HttpsError(
                "invalid-argument",
                "A TMDB ID is required to request this title."
            );
        }

        const plex_snapshot = await db
            .collection("plex_connections")
            .doc(request.auth.uid)
            .get();
        const plex_token = plex_snapshot.data()?.access_token;

        if (!plex_token) {
            throw new HttpsError(
                "failed-precondition",
                "Connect your Plex account first."
            );
        }

        // Everything from here on talks to Seerr over the network — wrap
        // the whole thing so an unexpected failure (DNS hiccup, timeout,
        // TLS error, etc.) surfaces as a clear message instead of leaking
        // out as a raw error, which Cloud Functions sanitizes down to an
        // opaque "internal"/"INTERNAL" with no detail on the client side.
        try {
            const base_url = get_seerr_base_url();
            const cookie = await seerr_login_with_plex(base_url, plex_token);

            if (!cookie) {
                throw new HttpsError(
                    "failed-precondition",
                    "Your Plex account doesn't have access to Seerr."
                );
            }

            // Defense in depth: the frontend already hides Request once
            // something's on Plex, but the dialog could have been open a
            // while — re-check right before requesting rather than trust
            // a possibly-stale render. Also doubles as the genre/language
            // lookup for profile selection below, so this isn't an extra
            // network round trip on top of what was already happening.
            const media_details = await seerr_fetch_media_info(
                base_url, cookie, media_type, tmdb_id
            );
            if (media_details.watch_url) {
                throw new HttpsError(
                    "failed-precondition",
                    "This is already on your Plex server."
                );
            }

            const request_body = {
                mediaType: media_type,
                mediaId: tmdb_id,
            };
            // Seerr accepts the literal string "all" here to request
            // every season of a show in one call.
            if (media_type === "tv") {
                request_body.seasons = "all";
            }

            // choice is the frontend's answer to the French-audio prompt
            // ("fr"/"default") or the Dub/Sub prompt ("dub"/"sub") —
            // whichever one applies. Re-derives is_french/is_anime itself
            // from media_details rather than trusting a client-supplied
            // flag for which prompt this answers.
            const choice = String(request.data?.choice || "");
            const service = media_type === "tv" ? "sonarr" : "radarr";
            const profile_name = seerr_resolve_profile_name(
                media_type, media_details, choice
            );
            const profile_match = await seerr_find_profile(
                base_url, cookie, service, profile_name
            );

            if (profile_match) {
                request_body.serverId = profile_match.serverId;
                request_body.profileId = profile_match.profileId;
            } else {
                // Don't block the request over a missing/renamed profile —
                // fall through to Seerr's own configured default instead,
                // just log it so a renamed profile doesn't fail silently.
                logger.warn(
                    "Seerr profile not found by name; using Seerr's default.",
                    {uid: request.auth.uid, tmdb_id, media_type, profile_name}
                );
            }

            const result = await seerr_https_json(
                `${base_url}/api/v1/request`,
                {method: "POST", body: request_body, headers: {Cookie: cookie}}
            );

            // A 409 means this title has already been requested — treat
            // that as a successful outcome from the user's side, not an
            // error.
            if (result.status === 409) {
                return {requested: true, already_requested: true};
            }

            if (result.status < 200 || result.status >= 300) {
                logger.warn(
                    "Seerr request failed.",
                    {
                        uid: request.auth.uid,
                        tmdb_id,
                        media_type,
                        status: result.status,
                    }
                );

                throw new HttpsError(
                    "internal",
                    "Stellaz could not send that request to your Seerr server."
                );
            }

            return {requested: true};
        } catch (error) {
            if (error instanceof HttpsError) throw error;

            logger.warn(
                "Unable to complete a Seerr request.",
                {
                    uid: request.auth.uid,
                    tmdb_id,
                    media_type,
                    error:
                        error?.message ||
                        String(error),
                }
            );

            throw new HttpsError(
                "internal",
                "Stellaz could not securely reach your Seerr server."
            );
        }
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

// Same signal as the Seerr anime routing above (Animation genre + Japanese
// origin) so a Plex show classifies the same way whether it's being
// imported or requested. Country isn't persisted on existing library rows,
// so this only runs against live Plex metadata at import time.
function plex_show_is_anime(item) {
    const genres = (item.Genre || [])
        .map((genre) => String(genre.tag || "").toLowerCase());
    const countries = (item.Country || [])
        .map((country) => String(country.tag || "").toLowerCase());
    return genres.includes("animation") && countries.includes("japan");
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
        const connections = [...(server.connections || [])].sort((a, b) => {
            const score = (item) => (item.protocol === "https" ? 4 : 0) +
                (!item.relay ? 2 : 0) + (!item.local ? 1 : 0);
            return score(b) - score(a);
        });
        for (const connection_item of connections) {
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
            } catch (error) {
                logger.warn("Plex metadata fallback connection failed.", {
                    server: server.name || null,
                    uri: connection_item.uri,
                    error: error?.message || String(error)
                });
            }
        }
    }
    throw new HttpsError("not-found",
        "That title was not found on any reachable Plex Media Server.");
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

    // Use the same reachable-server selection strategy as the successful
    // Plex metadata scan. Previously poster loading tried raw connections in
    // Plex's returned order, which could spend the whole callable timeout on
    // unreachable addresses before reaching the working server.
    for (const server of servers) {
        const token = server.accessToken || account_token;
        const candidates = [...(server.connections || [])].sort((a, b) => {
            const score = (item) => (item.protocol === "https" ? 4 : 0) +
                (!item.relay ? 2 : 0) + (!item.local ? 1 : 0);
            return score(b) - score(a);
        });
        for (const candidate of candidates) {
            if (!candidate.uri) continue;
            const base = candidate.uri.replace(/\/$/, "");
            try {
                // Verify this connection first, exactly like getPlexImportPreview.
                await plex_json(base + "/", token);
                const response = await fetch(base + thumb, {
                    headers: {
                        "X-Plex-Token": token,
                        "Accept": "image/*",
                        "X-Plex-Product": "Stellaz HQ",
                        "X-Plex-Client-Identifier": plex_client_identifier,
                    },
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

exports.getPlexRatedTitles = onCall(async (request) => {
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
                await plex_json(candidate_connection.uri + "/",
                    candidate.accessToken || account_token);
                server = candidate;
                base_url = candidate_connection.uri.replace(/\/$/, "");
                break;
            } catch (_) {}
        }
        if (server) break;
    }
    if (!server || !base_url) {
        throw new HttpsError("unavailable", "Stellaz could not reach your Plex Media Server.");
    }

    const server_token = server.accessToken || account_token;
    const sections_data = await plex_json(base_url + "/library/sections", server_token);
    const sections = sections_data.MediaContainer?.Directory || [];
    const movies = [];
    const shows = [];

    for (const section of sections) {
        if (section.type !== "movie" && section.type !== "show") continue;
        const plex_type = section.type === "movie" ? 1 : 2;
        const section_url =
            base_url + "/library/sections/" + encodeURIComponent(section.key) + "/all";
        const rated = await plex_json(
            section_url +
                "?type=" + plex_type +
                "&includeGuids=1&includeUserState=1" +
                "&sort=lastRatedAt%3Adesc&userRating%3E%3E=0",
            server_token
        );

        for (const item of (rated.MediaContainer?.Metadata || [])) {
            const rating = item.userRating == null ? null : Number(item.userRating);
            if (!(rating > 0)) continue;
            const row = {
                title: item.title,
                year: plex_year(item),
                rating,
                guids: plex_guids(item),
                tmdb_id: (() => {
                    const guid = plex_guids(item).find((id) => id.startsWith("tmdb://"));
                    return guid ? Number(guid.slice(7)) || null : null;
                })(),
                plex_thumb: item.thumb || null,
                genres: (item.Genre || []).map((genre) => genre.tag).filter(Boolean),
            };
            if (section.type === "movie") {
                row.runtime_minutes =
                    item.duration ? Math.round(Number(item.duration) / 60000) : null;
                movies.push(row);
            } else {
                row.average_episode_runtime_minutes =
                    item.duration ? Math.round(Number(item.duration) / 60000) : null;
                shows.push(row);
            }
        }
    }

    return {movies, shows};
});

exports.getPlexWatchedEpisodes = onCall(async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "You must be logged in.");

    const requested_shows = Array.isArray(request.data?.shows) ? request.data.shows : [];
    if (!requested_shows.length) return {episodes: []};

    const wanted = new Map(requested_shows
        .filter((show) => show?.title)
        .map((show) => [
            String(show.title).trim().toLowerCase(),
            {title: String(show.title), year: Number(show.year) || null}
        ]));

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
                await plex_json(candidate_connection.uri + "/",
                    candidate.accessToken || account_token);
                server = candidate;
                base_url = candidate_connection.uri.replace(/\/$/, "");
                break;
            } catch (_) {}
        }
        if (server) break;
    }
    if (!server || !base_url) {
        throw new HttpsError("unavailable", "Stellaz could not reach your Plex Media Server.");
    }

    const server_token = server.accessToken || account_token;
    const sections_data = await plex_json(base_url + "/library/sections", server_token);
    const sections = sections_data.MediaContainer?.Directory || [];
    const episodes = [];

    for (const section of sections) {
        if (section.type !== "show") continue;
        const section_url =
            base_url + "/library/sections/" + encodeURIComponent(section.key) + "/all";
        const watched = await plex_json(
            section_url + "?type=4&includeUserState=1",
            server_token
        );

        for (const episode of (watched.MediaContainer?.Metadata || [])) {
            if (Number(episode.viewCount || 0) <= 0) continue;
            const title = String(episode.grandparentTitle || "").trim();
            const match = wanted.get(title.toLowerCase());
            if (!match) continue;
            const plex_year = Number(episode.grandparentYear) || null;
            if (match.year && plex_year && match.year !== plex_year) continue;
            const season = Number(episode.parentIndex || 0);
            const number = Number(episode.index || 0);
            if (season <= 0 || number <= 0) continue;
            episodes.push({show_title: title, season, episode: number});
        }
    }

    return {episodes};
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
        // Keep the normal library listing for watched-state/manual import,
        // but fetch ratings with Plex's rating filter as a separate query.
        // Plex's own clients and rating-sync tools use this filtered form;
        // it reliably materializes userRating/lastRatedAt in the response.
        const section_url =
            base_url + "/library/sections/" + encodeURIComponent(section.key) + "/all";
        const all = await plex_json(
            section_url + "?includeGuids=1&includeUserState=1",
            server_token
        );
        const plex_type = section.type === "movie" ? 1 : 2;
        const rated = await plex_json(
            section_url +
                "?type=" + plex_type +
                "&includeGuids=1&includeUserState=1" +
                "&sort=lastRatedAt%3Adesc&userRating%3E%3E=0",
            server_token
        );
        const rated_items = rated.MediaContainer?.Metadata || [];
        const ratings_by_key = new Map(
            rated_items
                .filter((item) => item.ratingKey != null && item.userRating != null)
                .map((item) => [String(item.ratingKey), Number(item.userRating)])
        );
        const ratings_by_guid = new Map(
            rated_items
                .filter((item) => item.guid && item.userRating != null)
                .map((item) => [String(item.guid), Number(item.userRating)])
        );
        const items = (all.MediaContainer?.Metadata || []).map((item) => {
            const rating = ratings_by_key.get(String(item.ratingKey)) ??
                ratings_by_guid.get(String(item.guid || ""));
            return rating == null ? item : {...item, userRating: rating};
        });
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
                    is_anime: plex_show_is_anime(item),
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
