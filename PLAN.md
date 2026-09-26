# LeetCode Tracker v2 — Remake Plan

Rebuild of the original Antigravity project (github.com/ktripathi2281/LeetCode-Tracker)
with the same features, fixed bugs, TypeScript, and tests. Built to go live as a
public, multi-user app.

## Stack
- **Client:** React + Vite + TypeScript, React Router, Recharts, Axios
- **Server:** Express + TypeScript, Mongoose (MongoDB), JWT + bcrypt, Zod for request validation
- **AI:** Google Gemini (`@google/genai`) for the three agents
- **Extension:** Chrome extension (Manifest V3, TypeScript) for importing solution code
- **Tests:** Vitest (client + server), Supertest + mongodb-memory-server for API tests
- **Monorepo:** npm workspaces — `client/`, `server/`, `extension/`, `shared/` (types shared by all)

## Stages (each one works end-to-end before moving on)
1. ✅ **Scaffold** — workspaces, TS config, lint, `.env.example`, `npm run dev` runs both apps, health check.
2. ✅ **Auth** — register / login / me, protected routes, token handling on the client.
   Public-ready from the start: login rate limiting, stronger password rules (min 8 chars).
3. ✅ **Problem log** — CRUD, filters, search, pagination, Add/Edit/Detail pages.
   Includes **LeetCode URL auto-fill**: paste a problem link, server fetches title, number,
   difficulty and tags. Problem metadata is cached in a shared collection (it never changes),
   so each problem is fetched from LeetCode at most once across all users.
4. ✅ **LeetCode username sync** — user saves their LeetCode username; a "Sync" button imports
   their recent accepted submissions (public data, no login) as Solved problems with the
   correct solve date. Skips problems already tracked. Requests are throttled.
   - Only solves from the **last 3 months** (by LeetCode solve date) are imported.
   - LeetCode's public data shows only the **20 most recent** accepted solves, so the app
     **auto-syncs** when opened if the last sync was over 12 hours ago, and says so in the UI.
   - Already-tracked problems aren't duplicated: Todo/Attempted become Solved, and the
     last-solved date is updated.
5. ✅ **Spaced repetition** — review scheduling (1/3/7/14/30/60 days) in one place, due-review queue, dashboard cards.
   - Review session: "I solved it again" advances the interval; "I needed help" resets to 1 day.
     Passing the 60-day review marks a problem Mastered.
   - Re-solving a due problem on LeetCode (seen by sync) counts as a successful review.
   - "Due today" follows the user's time zone (sent by the browser).
6. ✅ **Analytics** — topic breakdown, solve velocity, company readiness, charts.
   - An activity log records every solve and review (history is rebuilt approximately for
     older data), so activity charts and streaks survive re-solves.
   - Weekly solves/reviews and streaks follow the user's time zone; topics show mastered /
     practising / unsolved and "needed help" reviews; chart colors validated for both themes.
7. ✅ **Agents** — one at a time, each logged to AgentLog, each with **per-user daily limits**
   (protects the Gemini bill):
   a. Post-Mortem Analyzer (structured JSON output)
   b. Socratic Tutor (hint-only chat)
   c. Weekly Planner (tool-calling loop)
   - Pinned model `gemini-3.8-flash` with `gemini-3.5-flash` fallback; retries on overload,
     2-minute budget per call. (`gemini-2.5-flash`, used by v1, is closed to new API keys.)
   - Daily limits per user (UTC): 20 post-mortems, 60 tutor messages, 5 plans; atomic counters;
     failed calls don't count. Plus a 10-per-minute burst limit.
   - The planner's tools are read-only and scoped to the signed-in user; its plan is checked:
     tracked problems must be the user's, new LeetCode problems must exist (invented ones dropped).
8. ✅ **Agent Logs page** — list + full trace view.
   - "AI activity" page (linked from Settings): 30-day totals per agent, filters, and each run's
     request, tool calls, response or error, model, tokens and time.
   - Runs are deleted automatically after 90 days (MongoDB TTL index).
9. ✅ **Browser extension** — on an "Accepted" LeetCode submission, sends the code, language,
   runtime and problem to the tracker (creates or updates the problem). Uses the user's own
   browser session on LeetCode; the server never sees or stores LeetCode credentials.
   The extension authenticates to the tracker with a per-user, revocable API token.
   - Tokens are stored hashed, work only on the extension endpoints, and are managed in Settings.
   - Same solve rules as sync (shared lib/solves.ts); resends are ignored by submission id.
   - Submissions that can't be sent (tracker or LeetCode down) are queued and retried.
   - **Known issue (parked):** on live LeetCode the extension doesn't yet detect accepted
     submissions (the page shows the expected submit/ and check/ requests, but nothing reaches
     the tracker). Console diagnostics (`[LeetCode Tracker] …`) and server-side logging of
     rejected requests are in place for when we pick this up. Idea for then: also fill in code
     for synced problems via LeetCode's submission details, from the user's own browser.
10. **Go live** (code done; deployment steps in DEPLOY.md)
    - ✅ Hosting config: `render.yaml` (API on Render), `client/vercel.json` (site on Vercel, SPA
      routing, CSP and security headers); "waking up the server" notice for Render's free plan
    - Hosting: MongoDB Atlas (DB), Render or Railway (server), Vercel or Netlify (client)
    - Rotate dev credentials before launch: a dedicated MongoDB user for this app (not shared
      with other projects) and a new Gemini API key; set a new JWT_SECRET in production
    - `app.set("trust proxy", 1)` behind the host's proxy so rate limiting sees real client IPs
    - ✅ Password reset by email (Resend; one-time hashed links, 30 min), change password,
      "sign out everywhere" (session versions), data export
    - Password reset by email; optional email verification
    - ✅ Security headers (helmet), CORS locked to the real domain, general API rate limiting
    - ✅ Privacy policy; "delete my account and data" in settings
    - Error monitoring and basic usage metrics
    - Publish the extension to the Chrome Web Store (later; ✅ icons done)

## Decisions
- **No LeetCode session cookies.** Storing users' LeetCode cookies means holding their
  account credentials. Code import goes through the browser extension instead.
- LeetCode has no official API; auto-fill and sync use its unofficial GraphQL endpoint.
  If it changes, those features fail gracefully and manual entry still works.

## Fixes from v1 to build in from the start
- Convert user IDs to `ObjectId` in aggregation `$match` (v1 planner tools returned empty data).
- Update endpoint uses a field allowlist (v1 let clients overwrite `user` and other fields).
- Escape search input before using it in `$regex`; allowlist `sort` values.
- API base URL from `VITE_API_URL`, not hardcoded localhost.
- Render agent output as Markdown.
- Log agent failures consistently for all three agents.
- Group solve velocity by the user's timezone rather than UTC.

## Nice-to-have (later)
- Firefox version of the extension.
