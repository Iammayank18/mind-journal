import { resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite'

// Absolute site URL for link previews (og:image must be absolute for WhatsApp, X, LinkedIn…).
// Set SITE_URL yourself, or let Vercel provide its production domain automatically.
const SITE_URL = (
  process.env.SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : '')
).replace(/\/$/, '')

function siteUrl(): Plugin {
  return {
    name: 'site-url',
    transformIndexHtml: (html) => html.replaceAll('%SITE_URL%', SITE_URL),
  }
}

// Plain HTML/CSS/JS, built as a multi-page site.
// Shared files that must keep their exact names (common.js, sw.js, manifest, icons, fonts) live in public/.
export default defineConfig({
  plugins: [siteUrl()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        planner: resolve(import.meta.dirname, 'planner.html'),
        journal: resolve(import.meta.dirname, 'journal.html'),
        meditate: resolve(import.meta.dirname, 'meditate.html'),
      },
    },
  },
})
