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
4. **LeetCode username sync** — user saves their LeetCode username; a "Sync" button imports
   their recent accepted submissions (public data, no login) as Solved problems with the
   correct solve date. Skips problems already tracked. Requests are throttled.
5. **Spaced repetition** — review scheduling (1/3/7/14/30/60 days) in one place, due-review queue, dashboard cards.
6. **Analytics** — topic breakdown, solve velocity, company readiness, charts.
7. **Agents** — one at a time, each logged to AgentLog, each with **per-user daily limits**
   (protects the Gemini bill):
   a. Post-Mortem Analyzer (structured JSON output)
   b. Socratic Tutor (hint-only chat)
   c. Weekly Planner (tool-calling loop)
8. **Agent Logs page** — list + full trace view.
9. **Browser extension** — on an "Accepted" LeetCode submission, sends the code, language,
   runtime and problem to the tracker (creates or updates the problem). Uses the user's own
   browser session on LeetCode; the server never sees or stores LeetCode credentials.
   The extension authenticates to the tracker with a per-user, revocable API token.
10. **Go live**
    - Hosting: MongoDB Atlas (DB), Render or Railway (server), Vercel or Netlify (client)
    - Rotate dev credentials before launch: a dedicated MongoDB user for this app (not shared
      with other projects) and a new Gemini API key; set a new JWT_SECRET in production
    - `app.set("trust proxy", 1)` behind the host's proxy so rate limiting sees real client IPs
    - Password reset by email; optional email verification
    - Security headers (helmet), CORS locked to the real domain, general API rate limiting
    - Privacy policy; "delete my account and data" in settings
    - Error monitoring and basic usage metrics
    - Publish the extension to the Chrome Web Store

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
- Review mode: "did you remember it?" button that adjusts the next interval.
- Firefox version of the extension.
