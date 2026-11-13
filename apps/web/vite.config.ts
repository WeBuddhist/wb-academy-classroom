import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Listen on the network so a phone can load the client for real classroom testing.
    host: true,
  },
  // @wbac/shared is a workspace package published as TypeScript source, so it must be
  // compiled by Vite rather than pre-bundled as a dependency.
  optimizeDeps: { exclude: ['@wbac/shared'] },
})
