# CLAUDE.md

## StellazHQ development guide

StellazHQ is a working **multi-user** web app. Preserve existing behavior unless a requested change explicitly replaces it. Multiple contributors may be working at the same time, so always inspect the latest `main` before editing.

## Workflow

- Start from current `main`.
- Use a focused feature/fix branch and open a PR.
- Keep changes scoped to the requested feature.
- Do not rewrite unrelated working code just for cleanup.
- Prefer existing patterns over introducing a second architecture.
- Check current code before assuming an older implementation is still present.
- Validate syntax and obvious regressions before opening the PR.
- If Firebase Functions changed, state exactly which functions need deployment.
- If frontend-only, explicitly say no Firebase deploy is needed.
- If Supabase schema changes, add a migration under `supabase/migrations/`.

## Architecture

### Frontend
Plain HTML/CSS/JavaScript.

Important paths:
- `index.html`, `index.js`, `indexStyles.css` — login
- `lobby_page/` — dashboard
- `entertainment_page/` — Movies, TV, Anime, Manga/Manhwa, recommendations, connected services
- `firebase/profile_widget.js` — shared profile menu, themes, notifications, friends
- `firebase/profile_widget.css` — shared widget/theme/friends styles
- `firebase/firebase_config.js` — client Firebase setup

There is no frontend framework. Match the existing DOM/event-listener style.

### Firebase
`functions/index.js` contains callable and scheduled backend functions.

Use Firebase Functions for anything that:
- needs secrets,
- reads/writes another user's data,
- accesses protected third-party APIs,
- performs trusted authorization checks.

Never expose Firebase secrets, Plex tokens, Seerr credentials, Supabase service-role credentials, or other private tokens to browser JavaScript.

### Supabase
Supabase stores entertainment libraries/progress. Important tables include:
- `movies`
- `tv_shows`
- `tv_episode_progress`
- `tv_season_progress`
- `anime`
- `manga_library`

Rows are user-scoped. Do not weaken user isolation or RLS to make a feature easier.

For authorized cross-user reads, verify permission server-side first, then query Supabase from a trusted Firebase Function using the existing protected secret pattern.

### Firestore
Firestore stores account/profile/integration state, including:
- `users/{uid}`
- Plex/TMDB/MAL/AniList/Kitsu/Seerr connection state
- entertainment notifications
- username index
- friend requests and friendships

Never hardcode one person's UID, email, username, Plex server, Seerr server, or credentials.

## Multi-user rules

Assume every feature is multi-user:
- different users have different libraries,
- different users may connect different services,
- one user's credentials/data must not leak to another,
- client-provided UIDs are not authorization.

Authorization for cross-account operations must be checked server-side.

For friend-only features, verify an accepted friendship before returning the friend's private library data.

## Usernames and friends

Stellaz usernames are used for the friend system and should remain unique/case-insensitive.

Current flow:
- send request by username,
- recipient accepts or declines,
- accepted users appear in Friends.

Friend-related cross-account actions belong in Firebase Functions, not direct browser queries to another user's Firestore/Supabase data.

Return only fields needed by the UI (for example username/avatar/library display data). Do not return email addresses or connected-service credentials.

## Entertainment integrations

Current integrations include Plex, TMDB, MyAnimeList, AniList, Kitsu and Seerr.

General rule: an external account should not be required just to use the Stellaz library manually where practical.

### Plex
Plex is user-specific. Do not import titles into a user's Stellaz library merely because another person sharing the Plex account watched them.

### TMDB
Prefer TMDB IDs over title matching whenever available.

### MAL / AniList / Kitsu
These import anime/manga data. Do not make these services mandatory for manual Anime/Manga usage.

### Seerr
Keep Seerr/Plex authentication server-side. Do not expose Seerr API keys or Plex tokens in the browser. Preserve SSRF/public-HTTPS protections for external server URLs. Requests should respect the real Seerr user's permissions/quotas.

## Security

Never:
- commit secrets,
- place secret values in frontend files,
- log tokens/API keys/passwords,
- return protected credentials from callables,
- hardcode privileged keys,
- expose a Supabase service-role key client-side,
- trust a client UID without server authorization,
- weaken security/RLS just to make a feature work.

Use Firebase Secret Manager / existing `defineSecret(...)` patterns for backend secrets.

## UI behavior

Keep Stellaz visually and behaviorally consistent.

Important:
- preserve Movie/TV **Show all / Show less** state across re-renders,
- do not collapse a library merely because an item was rated/deleted/updated,
- keep overlays/dialogs consistent with the existing Movie/TV design,
- preserve all themes,
- shared profile-widget changes must work on every page that loads the widget,
- if a JS/CSS URL uses `?v=N`, bump it when modifying that asset so users do not receive stale cached code,
- do not create/replace image assets unless explicitly requested.

## Themes

Theme-specific changes should remain scoped under the relevant `html[data-theme="..."]` selector. Do not make a small change to one theme alter the default theme or other themes.

## Database changes

When changing Supabase schema:
1. Inspect current/live schema first.
2. Add a migration under `supabase/migrations/`.
3. Prefer additive/backward-compatible changes.
4. Do not drop tables/columns or rewrite user data unless explicitly requested.
5. Preserve RLS/user isolation.
6. If a migration was applied live, still commit the matching migration file.

## Deploy instructions

For Firebase Function changes, give the exact post-merge deploy command, ideally only for affected functions:

```powershell
git pull
firebase deploy --only functions:functionName
```

For multiple functions:

```powershell
firebase deploy --only functions:functionOne,functions:functionTwo
```

If a new Firebase Secret is required, document the one-time secret setup separately and never put the value in GitHub.

For frontend-only changes:

```powershell
git pull
```

Then hard refresh with Ctrl+F5.

## Collaboration

Justin and Rémy may both be changing Stellaz. Before editing:
- check current `main`,
- check recent PRs touching the same code,
- avoid stale branches,
- never overwrite another contributor's newer feature.

If a branch conflicts with recent work, reconcile with current `main`; do not solve it by reverting newer functionality.

## Preferred implementation sequence

1. Find the existing code path.
2. Identify the root cause / smallest architecture change.
3. Make the smallest reliable change.
4. Preserve multi-user and security behavior.
5. Validate the result.
6. Open a focused PR.
7. Provide exact post-merge/deploy steps.

The goal is not just to make a demo work. Changes should fit the existing Stellaz architecture and remain safe for multiple users.
