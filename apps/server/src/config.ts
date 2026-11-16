import { fileURLToPath } from 'node:url'

const DEFAULT_HOST_PASSWORD = 'change-me'

export const config = {
  isProduction: process.env.NODE_ENV === 'production',
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://localhost:5432/wbac',
  /** Shared secret that permits creating a room. Not a per-user credential. */
  hostPassword: process.env.HOST_PASSWORD ?? DEFAULT_HOST_PASSWORD,
  /**
   * Origins allowed to call the API. The client is served separately, so this is a real
   * cross-origin setup in development and behind Caddy in production.
   *
   * Comma-separated, because a deployment may be reachable by more than one name, and
   * because testing a teacher and a student side by side needs two origins — browsers
   * scope localStorage per origin, and the host token lives there.
   */
  webOrigins: (process.env.WEB_ORIGIN ?? 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  /** Where FixtureTextProvider looks for segmented JSON. Gitignored; local only. */
  textsDir:
    process.env.TEXTS_DIR ?? fileURLToPath(new URL('../../../texts', import.meta.url)),
}

export function warnOnInsecureDefaults(log: (message: string) => void): void {
  if (config.hostPassword === DEFAULT_HOST_PASSWORD) {
    log(
      `HOST_PASSWORD is still "${DEFAULT_HOST_PASSWORD}". Anyone who can reach this ` +
        'server can create a room and drive a class. Set it before deploying.',
    )
  }
}
