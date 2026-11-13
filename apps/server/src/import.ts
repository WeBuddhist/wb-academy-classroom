/**
 * Import a text from a provider into Postgres.
 *
 *   npm run import -w @wbac/server -- --slug bden-gnyis
 *   npm run import -w @wbac/server -- --all
 *
 * This is the only path by which text reaches the database. Rooms and sync read from
 * Postgres alone, so nothing a class depends on is ever fetched live from a provider.
 */

import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import type { TextProvider } from '@wbac/shared'
import { pool, withTransaction } from './db.js'
import { FixtureTextProvider } from './providers/fixture.js'

export async function importText(
  provider: TextProvider,
  slug: string,
  log: (message: string) => void = console.log,
): Promise<void> {
  const { meta, segments } = await provider.getText(slug)

  await withTransaction(async (client) => {
    await client.query(
      `insert into texts (id, slug, title_bo, title_en, source)
       values ($1, $2, $3, $4, $5)
       on conflict (id) do update
         set slug = excluded.slug,
             title_bo = excluded.title_bo,
             title_en = excluded.title_en,
             source = excluded.source`,
      [meta.id, meta.slug, meta.titleBo, meta.titleEn ?? null, meta.source],
    )

    // Re-importing an edited text must not strip a room of the segment it is parked on,
    // so segments are upserted and only genuinely vanished ones are removed. Segment
    // ids are stable across re-segmentation, which is what makes this safe.
    for (const segment of segments) {
      await client.query(
        `insert into segments (id, text_id, idx, kind, bo, break_after, cite, wylie, en, note)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         on conflict (text_id, id) do update
           set idx = excluded.idx,
               kind = excluded.kind,
               bo = excluded.bo,
               break_after = excluded.break_after,
               cite = excluded.cite,
               wylie = excluded.wylie,
               en = excluded.en,
               note = excluded.note`,
        [
          segment.id,
          meta.id,
          segment.idx,
          segment.kind,
          segment.bo,
          segment.breakAfter,
          segment.cite ?? null,
          segment.wylie ?? null,
          segment.en ?? null,
          segment.note ?? null,
        ],
      )
    }

    const removed = await client.query(
      `delete from segments
       where text_id = $1 and id <> all($2::text[])
       returning id`,
      [meta.id, segments.map((segment) => segment.id)],
    )
    if (removed.rowCount) log(`  removed ${removed.rowCount} segment(s) no longer in the source`)
  })

  log(`imported ${meta.slug}: ${segments.length} segments`)
}

const isEntrypoint = process.argv[1] === fileURLToPath(import.meta.url)
if (isEntrypoint) {
  const { values } = parseArgs({
    options: { slug: { type: 'string' }, all: { type: 'boolean' } },
  })

  const provider = new FixtureTextProvider()
  const run = async () => {
    const slugs = values.all
      ? (await provider.listTexts()).map((meta) => meta.slug)
      : values.slug
        ? [values.slug]
        : []

    if (slugs.length === 0) {
      console.error('usage: import --slug <slug> | --all')
      process.exit(1)
    }
    for (const slug of slugs) await importText(provider, slug)
  }

  run()
    .then(() => pool.end())
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : error)
      process.exit(1)
    })
}
