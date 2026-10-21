# Mind Journal 🌿

A gentle daily **journal** and **day planner** that celebrate your progress —
warm, playful and unhurried, with little mood characters and optional calm sounds.
Plain HTML/CSS/JS, built with Vite as a multi-page site. No backend, no account.

```
index.html          home page
journal.html        check-in, brain dump, worry parking, reframe, gratitude,
                    evening wind-down, breathing, Wins Jar, history
planner.html        sections & tasks, live timeline, focus timer, interview reps, analytics
public/fonts/       Figtree, self-hosted (no Google Fonts request, works offline)
public/og.png       1200×630 link-preview image
public/theme.css    the "Sunny" design system: colours, type (Figtree), buttons, cards,
                    mood orbs, motion, app shell, light + dark
public/common.js    shared: app shell + tab bar, mood-orb characters, calm sounds & chimes,
                    your name, settings, backup/restore, milestones, weekly letter
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

Everything is stored in the browser's `localStorage`. Nothing is sent to a server — fonts are self-hosted,
so not even Google sees a request. After the first save the app asks the browser to keep its storage
(`navigator.storage.persist()`), and iPhone users get a one-time hint to add it to the Home Screen
(Safari can clear websites that aren't opened for 7 days).
Each person who opens the site gets their own private space, so it's safe to share the link with friends.

Because data lives in one browser, use **⚙ Settings → Download backup** now and then (the avatar shows a
small dot after 7 days without one). **Download as text** gives a readable Markdown copy of the journal.
The same file restores everything on another phone or laptop.

## Deploy to Vercel

Vercel detects Vite automatically (build: `vite build`, output: `dist`).

```bash
npm i -g vercel
vercel --prod
```

Or push to GitHub and import the repo at vercel.com/new.

Link previews: `og:image` is made absolute at build time. On Vercel this happens automatically
(`VERCEL_PROJECT_PRODUCTION_URL`); elsewhere set `SITE_URL=https://your-domain` before `yarn build`.

## Moving your existing data to the deployed site

Data you saved while opening the HTML files directly (`file://…`) stays in that browser and doesn't
move to the new web address by itself.

1. Run `yarn build`, then double-click `dist/journal.html` so it opens in the browser you've been
   using (built files work straight from disk; the source files need the dev server).
2. ⚙ Settings → **Download backup**.
3. Open your deployed site → ⚙ Settings → **Restore from file**.

## Updating

When you change `common.js` or `theme.css`, bump the `?v=` number in all three HTML files and in `public/sw.js` (plus `VERSION`). Installed apps check for updates when reopened and reload once by themselves. Pages, `common.js`
and `theme.css` are fetched network-first, so a deploy never mixes a new page with old shared code.

## Product notes

- **Support:** the check-in shows helpline info when someone feels Heavy or Anxious; "Find support" is also in
  Settings, the Journal sidebar and the landing footer. Mind Journal is self-care, not a substitute for care.
- **Interview Reps** (flashcards) is opt-in under Settings → A little extra. It stays on for anyone who already used it.
- **Planner quick add** understands `gym 7am 30m daily #health` (time, length, repeat, list).
