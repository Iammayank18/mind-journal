#!/usr/bin/env node
/*
 * Mind Journal — record the guided-meditation voice, once.
 *
 * Reads every line in public/meditate-content.js, asks Google Cloud Text-to-Speech
 * to speak it in a soft, slow voice, and saves one small MP3 per line to
 * public/audio/voice/ plus a manifest.json the app reads. Users never call Google:
 * the files ship with the app and work offline.
 *
 * Only new or changed lines are generated; everything else is reused. Changing the
 * voice/speed/pitch regenerates everything (new file names, so no stale caches).
 *
 *   export GOOGLE_TTS_API_KEY=...            # never commit this
 *   yarn voice --list en-IN                  # see available voices for a language
 *   yarn voice --samples                     # a few voices reading one line → scripts/voice-samples/
 *   yarn voice                               # generate everything with the voice below
 *   yarn voice --voice en-US-Chirp3-HD-Aoede --rate 0.85
 *   yarn voice --clean                       # also delete files no line uses any more
 *   yarn voice --dry                         # show what would happen, call nothing
 */
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile, readdir, unlink } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

// read GOOGLE_TTS_API_KEY (and TTS_* settings) from a local .env file if there is one
try {
  const env = await readFile(join(ROOT, '.env'), 'utf8')
  env.split(/\r?\n/).forEach((l) => {
    const m = l.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2')
  })
} catch { }

const OUT = join(ROOT, 'public', 'audio', 'voice')
const SAMPLES = join(ROOT, 'scripts', 'voice-samples')
const API = process.env.TTS_ENDPOINT || 'https://texttospeech.googleapis.com/v1'

// ── the voice (override with flags or env) ───────────────────────────────
const DEFAULTS = {
  voice: process.env.TTS_VOICE || 'en-US-Chirp3-HD-Aoede', // soft, warm female voice
  rate: Number(process.env.TTS_RATE || 0.86), // a little slower than normal speech
  pitch: Number(process.env.TTS_PITCH || -2), // semitones; ignored by Chirp 3 HD voices
}
// voices tried by --samples (edit freely; --list shows everything available)
const SAMPLE_VOICES = [
  'en-US-Chirp3-HD-Aoede', 'en-US-Chirp3-HD-Sulafat', 'en-US-Chirp3-HD-Achird',
  'en-IN-Chirp3-HD-Aoede', 'en-IN-Neural2-A', 'en-GB-Neural2-C', 'en-US-Neural2-F', 'en-US-Neural2-J',
]

// ── args ─────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2)
const flag = (n) => argv.includes('--' + n)
const opt = (n, d) => { const i = argv.indexOf('--' + n); return i !== -1 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d }
const cfg = {
  voice: opt('voice', DEFAULTS.voice),
  rate: Number(opt('rate', DEFAULTS.rate)),
  pitch: Number(opt('pitch', DEFAULTS.pitch)),
}
const KEY = process.env.GOOGLE_TTS_API_KEY
const DRY = flag('dry')

const isChirp = (v) => /Chirp/i.test(v)
const langOf = (v) => v.split('-').slice(0, 2).join('-')

function die(msg) { console.error('\n✗ ' + msg + '\n'); process.exit(1) }
function needKey() {
  if (!KEY && !DRY) die('Set GOOGLE_TTS_API_KEY first (Google Cloud → APIs & Services → Credentials → API key, restricted to the Text-to-Speech API).')
}

// ── load the library exactly as the app does ─────────────────────────────
async function library() {
  const src = await readFile(join(ROOT, 'public', 'meditate-content.js'), 'utf8')
  const sandbox = { window: {} }
  vm.runInNewContext(src, sandbox)
  const lib = sandbox.window.MEDITATE_LIBRARY
  if (!lib || !lib.allTexts) die('Could not read MEDITATE_LIBRARY from public/meditate-content.js')
  return lib
}

// ── text → speech ────────────────────────────────────────────────────────
const escXml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
function ssml(text, c) {
  // a gentle breath at commas/dashes/ellipses, a longer pause between sentences
  const body = escXml(text)
    .replace(/…\s*/g, '<break time="900ms"/>')
    .replace(/\s+—\s+/g, ' <break time="500ms"/> ')
    .replace(/([.?!])\s+/g, '$1 <break time="700ms"/> ')
  return `<speak><prosody rate="${Math.round(c.rate * 100)}%" pitch="${c.pitch}st">${body}</prosody><break time="400ms"/></speak>`
}

function request(text, c) {
  const chirp = isChirp(c.voice)
  return {
    // Chirp 3 HD voices take plain text (they pause naturally on punctuation)
    input: chirp ? { text: text.replace(/…/g, '... ') } : { ssml: ssml(text, c) },
    voice: { languageCode: langOf(c.voice), name: c.voice },
    audioConfig: Object.assign(
      { audioEncoding: 'MP3', sampleRateHertz: 24000, volumeGainDb: 0, effectsProfileId: ['headphone-class-device'] },
      chirp && !c.noRate ? { speakingRate: c.rate } : {} // rate/pitch for other voices live in the SSML
    ),
  }
}

async function synth(text, c, attempt = 1) {
  const res = await fetch(`${API}/text:synthesize?key=${encodeURIComponent(KEY)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request(text, c)),
  })
  if (res.status === 429 || res.status >= 500) {
    if (attempt > 5) throw new Error(`HTTP ${res.status} after retries`)
    await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt))
    return synth(text, c, attempt + 1)
  }
  const body = await res.json().catch(() => ({}))
  if (!res.ok && res.status === 400 && isChirp(c.voice) && !c.noRate && /rate|pace|speaking/i.test(body.error?.message || '')) {
    // some voices don't accept a speed setting — record at their natural pace instead
    if (!synth.warned) { synth.warned = true; console.log(`\n  (note: ${c.voice} ignores the speed setting — using its natural pace)`) }
    return synth(text, { ...c, noRate: true }, attempt)
  }
  if (!res.ok) {
    const err = new Error(body.error ? `${body.error.code} ${body.error.message}` : `HTTP ${res.status}`)
    // a bad/blocked key or a wrong voice name will fail every line — stop at once
    err.fatal = res.status === 401 || res.status === 403 || /API key|not found|does not exist|invalid voice/i.test(body.error?.message || '')
    throw err
  }
  return Buffer.from(body.audioContent, 'base64')
}

async function pool(items, n, fn) {
  let i = 0
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; await fn(items[k], k) }
  }))
}

// ── commands ─────────────────────────────────────────────────────────────
async function listVoices() {
  needKey()
  const lang = opt('list', 'en-IN')
  const res = await fetch(`${API}/voices?languageCode=${encodeURIComponent(lang)}&key=${encodeURIComponent(KEY)}`)
  const body = await res.json()
  if (!res.ok) die(body.error ? body.error.message : 'HTTP ' + res.status)
  const voices = (body.voices || []).sort((a, b) => a.name.localeCompare(b.name))
  console.log(`\n${voices.length} voices for ${lang}:\n`)
  voices.forEach((v) => console.log(`  ${v.name.padEnd(30)} ${v.ssmlGender.toLowerCase()}`))
  console.log('\nTry one:  yarn voice --samples   or   yarn voice --voice <name>\n')
}

async function samples() {
  needKey()
  const line = 'Take one deeper breath in… and a long, slow breath out. There\'s nothing you need to do right now.'
  await mkdir(SAMPLES, { recursive: true })
  for (const v of SAMPLE_VOICES) {
    const c = { ...cfg, voice: v }
    try {
      const mp3 = await synth(line, c)
      const file = join(SAMPLES, `${v}.mp3`)
      await writeFile(file, mp3)
      console.log('  ♪ ' + file.replace(ROOT + '/', ''))
    } catch (e) { console.log(`  – ${v}: ${e.message}`) }
  }
  console.log('\nListen, pick one, then:  yarn voice --voice <name>\n')
}

async function generate() {
  if (!DRY) needKey()
  const lib = await library()
  const texts = lib.allTexts()
  const sig = createHash('sha1').update(JSON.stringify({ v: cfg.voice, r: cfg.rate, p: isChirp(cfg.voice) ? 0 : cfg.pitch })).digest('hex').slice(0, 8)
  const fileFor = (t) => createHash('sha1').update(sig + '\n' + t).digest('hex').slice(0, 16) + '.mp3'

  await mkdir(OUT, { recursive: true })
  const manifestPath = join(OUT, 'manifest.json')
  const files = {}
  const todo = []
  for (const t of texts) {
    const f = fileFor(t)
    files[t] = f
    if (!existsSync(join(OUT, f))) todo.push(t)
  }

  console.log(`\nVoice: ${cfg.voice} · rate ${cfg.rate}${isChirp(cfg.voice) ? '' : ' · pitch ' + cfg.pitch + 'st'}`)
  console.log(`${texts.length} lines · ${texts.length - todo.length} already recorded · ${todo.length} to record (${todo.join('').length} characters)\n`)
  if (DRY) return

  let done = 0, failed = 0, fatal = null
  await pool(todo, 4, async (t) => {
    if (fatal) { delete files[t]; return }
    try {
      const mp3 = await synth(t, cfg)
      await writeFile(join(OUT, files[t]), mp3)
      done++
      if (process.stdout.isTTY) process.stdout.write(`\r  recorded ${done}/${todo.length}`)
      else if (done % 25 === 0 || done === todo.length) console.log(`  recorded ${done}/${todo.length}`)
    } catch (e) {
      failed++
      delete files[t]
      if (e.fatal) { fatal = fatal || e; return }
      console.log(`\n  ✗ "${t.slice(0, 50)}…" — ${e.message}`)
    }
  })
  if (todo.length && process.stdout.isTTY) console.log('')
  if (fatal) die(`Google said: ${fatal.message}\n  Nothing was changed. Check the API key (Text-to-Speech API enabled, billing on) and the voice name (yarn voice --list en-US).`)

  const manifest = { voice: cfg.voice, rate: cfg.rate, pitch: isChirp(cfg.voice) ? null : cfg.pitch, sig, generatedAt: new Date().toISOString(), files }
  await writeFile(manifestPath, JSON.stringify(manifest, null, 1) + '\n')

  if (flag('clean')) {
    const keep = new Set(Object.values(files))
    let removed = 0
    for (const f of await readdir(OUT)) if (f.endsWith('.mp3') && !keep.has(f)) { await unlink(join(OUT, f)); removed++ }
    if (removed) console.log(`  removed ${removed} unused file${removed === 1 ? '' : 's'}`)
  }

  console.log(`\n✓ ${Object.keys(files).length} lines ready in public/audio/voice/${failed ? ` (${failed} failed — run again to retry)` : ''}`)
  console.log('  Commit public/audio/voice/ and deploy. The app uses these automatically.\n')
}

if (flag('list')) await listVoices()
else if (flag('samples')) await samples()
else await generate()
