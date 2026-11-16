# wb-academy-classroom

A follow-along reader for in-person Tibetan Buddhist text classes. The teacher drives;
every student's device highlights and scrolls to the same line.

Students join a room with a short code the teacher writes on the whiteboard — no
accounts. Because Tibetan prose runs as unbroken syllables with no word spaces, losing
your place is the default experience in these classes; this app removes that.

Design rationale, the phase plan, and the deployment runbooks are kept outside this
repository.

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
Deployment scripts are written but have not yet been run on a server.
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
infra/native/      server install and deploy scripts, systemd unit, Caddy config
scripts/           dev-db.sh — a local Postgres for development
texts/             local-only, gitignored — never committed
```

## Running it

**1. A database.**

```bash
./scripts/dev-db.sh start
```

That creates a Postgres inside the project — port 55432, data in `.pgdata/` — so it
cannot collide with anything already running on your machine, and `destroy` removes it
completely. If you would rather use a Postgres you already have, point `DATABASE_URL` at
it instead. Then:

```bash
cp .env.example .env     # set HOST_PASSWORD to something of your own
```

**2. A text.**

```bash
npm install
npm run import -w @wbac/server -- --all
```

`texts/sample.json` is committed, so that gives you something to run against
immediately. It is synthetic — placeholder syllables, not a real work — and exists to
exercise every kind of segment the reader renders: title, homage, topical outline,
prose, quoted verse with a citation, and colophon.

No real text is committed. To work with one, produce it with the `tibetan-segmenter`
pipeline and drop it into `texts/`, which is gitignored apart from the sample.

**3. The app.**

```bash
./scripts/dev.sh
```

That starts the database if it is not already up, then the API and the client together,
and prints the address once the API is actually answering. Ctrl+C stops both servers;
the database is left running, since it holds your imported texts.

To stop everything, including the database:

```bash
./scripts/stop.sh
```

Useful when Ctrl+C never happened — a closed terminal, a crashed shell — and something
is still holding the ports. `--keep-db` leaves Postgres up. Stopping it loses nothing;
the data stays in `.pgdata/`.

To run them separately instead — useful when you want the two logs apart:

```bash
npm run dev -w @wbac/server
```

```bash
npm run dev -w @wbac/web
```

Open http://localhost:5173. Start a class with your `HOST_PASSWORD`, write the room code
on the board, and students join with it.

For a second participant on the same machine, use a different browser or a private
window — two tabs in one browser share the host token, so both become teachers.

## Deploying

The app runs **directly on one small server** — Node, PostgreSQL and Caddy installed
normally, managed by systemd. Not containers: with one server and one operator, the extra
layer between a symptom and its cause is paid every time something goes wrong, while the
consistency containers buy you only pays off across several machines or several people.

The scripts that do it are in [`infra/native/`](infra/native): a one-time installer, a
deploy script that doubles as the update command, a systemd unit, and a Caddy config
template. Setting it up is a clone and two commands; updating afterwards is `git pull`
and one script.

The step-by-step runbooks are internal notes and are not kept in this repository.

## Authority

Only the room's creator can move the class. The server issues a host token once, at room
creation, and stores only its SHA-256 hash; every `teach:goto` is checked against it in
constant time. The teacher-only controls in the client are a convenience — the server is
what actually enforces this, so a student with devtools open cannot move the room.

The token lives in the teacher's `localStorage`, which browsers scope per origin. A
recovery code is shown once at creation; "Take back control" on the home screen redeems it
on any device, and it is checked against the server before the client acts on it, so a
wrong code fails there rather than as silently refused taps mid-class.

Classes end explicitly. The teacher's **End class** button closes the room: everyone
present is told, and the code stops accepting anyone. Rooms are not left live
indefinitely — a code that still works weeks later is one a stranger can wander into.

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
