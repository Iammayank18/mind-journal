import { resolve } from 'node:path'
import { defineConfig } from 'vite'

// Plain HTML/CSS/JS, built as a multi-page site.
// Shared files that must keep their exact names (common.js, sw.js, manifest, icons) live in public/.
export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        planner: resolve(import.meta.dirname, 'planner.html'),
        journal: resolve(import.meta.dirname, 'journal.html'),
      },
    },
  },
})
