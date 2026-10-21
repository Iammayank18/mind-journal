# Mind Journal 🌿

A gentle daily **journal** and **day planner** that celebrate your progress.
Plain HTML/CSS/JS, built with Vite as a multi-page site. No backend, no account.

```
index.html          home page
journal.html        check-in, brain dump, worry parking, reframe, gratitude,
                    evening wind-down, breathing, Wins Jar, history
planner.html        sections & tasks, live timeline, focus timer, interview reps, analytics
public/common.js    shared: your name, settings, backup/restore, dark mode, share,
                    milestones, weekly letter, planner <-> journal data
public/sw.js        offline support (+ manifest.webmanifest, icons/ → installable app)
vite.config.ts      lists the three pages as build inputs
vercel.json         redirects from the old file names + headers
```

## Run it

```bash
yarn          # or npm install
yarn dev      # http://localhost:5173  (/, /planner.html, /journal.html)
yarn build    # → dist/
yarn preview  # test the production build, incl. offline + install
```

The service worker is skipped on the dev server (port 5173) so it never caches dev files.
Use `yarn preview` to test offline/install.

## Privacy

Everything is stored in the browser's `localStorage`. Nothing is sent to a server.
Each person who opens the site gets their own private space, so it's safe to share the link with friends.

Because data lives in one browser, use **⚙ Settings → Download backup** now and then.
The same file restores everything on another phone or laptop.

## Deploy to Vercel

Vercel detects Vite automatically (build: `vite build`, output: `dist`).

```bash
npm i -g vercel
vercel --prod
```

Or push to GitHub and import the repo at vercel.com/new.

After the first deploy, change `og:image` in `index.html` to the full URL
(e.g. `https://your-app.vercel.app/icons/icon-512.png`) so link previews show the icon.

## Moving your existing data to the deployed site

Data you saved while opening the HTML files directly (`file://…`) stays in that browser and doesn't
move to the new web address by itself.

1. Run `yarn build`, then double-click `dist/journal.html` so it opens in the browser you've been
   using (built files work straight from disk; the source files need the dev server).
2. ⚙ Settings → **Download backup**.
3. Open your deployed site → ⚙ Settings → **Restore from file**.

## Updating

When you change files, bump `VERSION` in `public/sw.js` (e.g. `mj-v2`) so installed copies pick up the new version.
