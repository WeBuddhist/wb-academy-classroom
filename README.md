# wb-academy-classroom

A follow-along reader for in-person Tibetan Buddhist text classes. The teacher drives;
every student's device highlights and scrolls to the same line.

Students join a room with a short code the teacher writes on the whiteboard — no
accounts. Because Tibetan prose runs as unbroken syllables with no word spaces, losing
your place is the default experience in these classes; this app removes that.

Full design rationale and phase plan: [`docs/PLAN.md`](docs/PLAN.md).

## Scope

This repo is **the application only** — the classroom client and its realtime server.

Two things deliberately live outside it:

- **Text processing.** Segmenting raw Tibetan into addressable lines is a content-pipeline
  concern. It lives in `tibetan-segmenter`.
- **Text data.** No corpus, no source files, no segmented output is ever committed here.
  `/texts/` is gitignored. In production the app receives texts from the WeBuddhist
  content API.

## Status

**Phase 1 complete** — rooms, join-by-code, and teacher→student sync.
Phase 2 (offline caching, follow-mode, Tibetan webfont) is next.

## The one rule

The only thing that travels between teacher and student is a **segment id**. Never a DOM
range, never a character offset, never a scroll position. A segment id means the same
line on a phone, a tablet and a projector, at any font size, in any text layer — which is
what makes one teacher's click land correctly on thirty different screens.

Everything else follows from it: late joiners just ask for the current id, reconnects are
idempotent, and translation layers can be added later without touching the protocol.

## Layout

```
packages/shared/   types and the socket contract, imported by both client and server
apps/server/       Fastify + Socket.IO + Postgres
apps/web/          Vite + React client
infra/             docker-compose for the dev database
texts/             local-only, gitignored — never committed
```

## Running it

**1. A database.** Either Docker:

```bash
docker compose -f infra/docker-compose.dev.yml up -d
```

or a Postgres you already have — point `DATABASE_URL` at it. Then:

```bash
cp .env.example .env     # set HOST_PASSWORD to something of your own
```

**2. A text.** `texts/` starts empty because no corpus is committed. Run the
`tibetan-segmenter` pipeline and copy its output in:

```bash
cp ../tibetan-segmenter/texts/<slug>.json texts/
npm install
npm run import -w @wbac/server -- --all
```

**3. The app**, in two terminals:

```bash
npm run dev -w @wbac/server
```

```bash
npm run dev -w @wbac/web
```

Open http://localhost:5173. Start a class with your `HOST_PASSWORD`, write the room code
on the board, and students join with it.

## Authority

Only the room's creator can move the class. The server issues a host token once, at room
creation, and stores only its SHA-256 hash; every `teach:goto` is checked against it in
constant time. The teacher-only controls in the client are a convenience — the server is
what actually enforces this, so a student with devtools open cannot move the room.

The token lives in the teacher's `localStorage`, which browsers scope per origin. A
recovery code is shown once at creation for when that browser forgets.

## Verification

```bash
npm test          # unit tests
npm run typecheck
```

With the server running, the phase 1 acceptance criteria are executable:

```bash
npm run smoke -w @wbac/server
```

It creates a room of its own and asserts that a forged token is rejected, that a move
reaches a student in well under a second, and that a late joiner lands on the line the
class is already on.
