/**
 * Import function triggers from their respective submodules:
 *
 * const {onCall} = require("firebase-functions/v2/https");
 * const {onDocumentWritten} = require("firebase-functions/v2/firestore");
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

const {setGlobalOptions} = require("firebase-functions");
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