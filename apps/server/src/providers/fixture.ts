import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Segment, SegmentedText, TextMeta, TextProvider } from '@wbac/shared'
import { config } from '../config.js'

/**
 * Reads segmented JSON from a local directory.
 *
 * For development only, until the WeBuddhist content API exists. The directory is
 * gitignored, so fixtures never enter version control; drop the output of the
 * tibetan-segmenter pipeline into `texts/` to work against a real text.
 */
export class FixtureTextProvider implements TextProvider {
  constructor(private readonly dir: string = config.textsDir) {}

  async listTexts(): Promise<TextMeta[]> {
    if (!existsSync(this.dir)) return []
    return readdirSync(this.dir)
      .filter((name) => name.endsWith('.json'))
      .map((name) => this.read(name.replace(/\.json$/, '')).meta)
  }

  async getText(slug: string): Promise<SegmentedText> {
    return this.read(slug)
  }

  private read(slug: string): SegmentedText {
    const path = join(this.dir, `${slug}.json`)
    if (!existsSync(path)) {
      throw new Error(
        `No fixture for "${slug}" at ${path}. Run the tibetan-segmenter pipeline and ` +
          'copy its output into this directory.',
      )
    }

    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'))
    const text = parsed as SegmentedText

    // Fixtures are hand-placed files, so fail loudly and specifically rather than
    // letting a malformed one surface as a confusing database error during a class.
    if (!text?.meta || !Array.isArray(text.segments)) {
      throw new Error(`${path} is not a segmented text: expected { meta, segments }.`)
    }
    if (text.segments.length === 0) {
      throw new Error(`${path} contains no segments.`)
    }
    const bad = text.segments.find(
      (segment: Segment) => !segment?.id || typeof segment.idx !== 'number' || !segment.bo,
    )
    if (bad) {
      throw new Error(`${path} has a segment missing id, idx or bo: ${JSON.stringify(bad)}`)
    }

    return {
      ...text,
      meta: { ...text.meta, slug, id: text.meta.id ?? slug, source: 'fixture' },
    }
  }
}
