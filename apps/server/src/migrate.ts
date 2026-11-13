/**
 * Apply any migration files that have not run yet.
 *
 *   npm run migrate -w @wbac/server
 *
 * Runs automatically on server start too, so a fresh checkout needs no separate step.
 */

import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { pool, query, withTransaction } from './db.js'

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url))

export async function migrate(log: (message: string) => void = console.log): Promise<void> {
  await query(`
    create table if not exists _migrations (
      name       text primary key,
      applied_at timestamptz not null default now()
    )
  `)

  const applied = new Set(
    (await query<{ name: string }>('select name from _migrations')).map((row) => row.name),
  )
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .sort()

  let ran = 0
  for (const file of files) {
    if (applied.has(file)) continue
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8')
    // Each migration and its bookkeeping row commit together, so a failure half way
    // through cannot leave the schema ahead of what _migrations records.
    await withTransaction(async (client) => {
      await client.query(sql)
      await client.query('insert into _migrations (name) values ($1)', [file])
    })
    log(`migrated ${file}`)
    ran += 1
  }

  if (ran === 0) log('schema up to date')
}

const isEntrypoint = process.argv[1] === fileURLToPath(import.meta.url)
if (isEntrypoint) {
  migrate()
    .then(() => pool.end())
    .catch((error: unknown) => {
      console.error(error)
      process.exit(1)
    })
}
