# LeetCode Tracker v2

Track LeetCode problems, review them on a spaced-repetition schedule, and get help from
AI agents (weekly planner, Socratic tutor, solution post-mortem). See [PLAN.md](PLAN.md)
for the roadmap.

## Structure
- `client/` — React + Vite + TypeScript front end (port 5173)
- `server/` — Express + TypeScript API (port 5001)
- `shared/` — types and constants used by both

## Getting started
Requires Node.js 22+.

```bash
npm install
cp server/.env.example server/.env   # then edit values
npm run dev                          # starts server and client together
```

Open http://localhost:5173. In development, the client forwards `/api` requests to the server.

## Scripts (run from the root)
| Command | What it does |
|---|---|
| `npm run dev` | Run server and client with live reload |
| `npm test` | Run all tests |
| `npm run typecheck` | Type-check every package |
| `npm run lint` | Lint with oxlint |
| `npm run build` | Production build (`server/dist`, `client/dist`) |
