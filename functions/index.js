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
//#endregion
