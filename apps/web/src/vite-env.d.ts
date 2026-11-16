/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Absolute API origin for development, where client and server are on different
   * ports. Built as an empty string for production, where Caddy serves the client and
   * proxies the API on the same origin.
   */
  readonly VITE_API_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
