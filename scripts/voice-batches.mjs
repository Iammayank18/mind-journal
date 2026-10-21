#!/usr/bin/env node
/*
 * Mind Journal — record the meditation voice by hand (Gemini / AI Studio, or any TTS),
 * then turn those recordings into the per-line clips the app plays.
 *
 *   node scripts/voice-batches.mjs script
 *       → writes scripts/voice-script.md: the style prompt + one batch of lines per session.
 *         Paste each batch into Gemini speech generation, download the audio and save it in
 *         scripts/voice-batches/ named exactly like the batch (e.g. 01-learn-1.wav).
 *
 *   node scripts/voice-batches.mjs import --voice gemini-Achernar
 *       → splits every batch recording on its pauses, checks the number of lines matches,
 *         saves one MP3 per line in public/audio/voice/ and updates manifest.json.
 *         Needs ffmpeg (Mac: brew install ffmpeg).
 *
 * Re-run `import` any time: batches that already match are simply redone; a batch whose
 * line count doesn't match is skipped and reported (re-generate just that one).
 */
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile, readdir, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { dirname, join, extname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import vm from 'node:vm'

const run = promisify(execFile)
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'public', 'audio', 'voice')
const IN = join(ROOT, 'scripts', 'voice-batches')
const SCRIPT_MD = join(ROOT, 'scripts', 'voice-script.md')

const argv = process.argv.slice(2)
const cmd = argv[0]
const opt = (n, d) => { const i = argv.indexOf('--' + n); return i !== -1 && argv[i + 1] ? argv[i + 1] : d }
const die = (m) => { console.error('\n✗ ' + m + '\n'); process.exit(1) }

async function library() {
  const src = await readFile(join(ROOT, 'public', 'meditate-content.js'), 'utf8')
  const box = { window: {} }
  vm.runInNewContext(src, box)
  return box.window.MEDITATE_LIBRARY
}

// One batch per session; a line used by several sessions lives in the first one only.
async function batches() {
  const lib = await library()
  const seen = new Set(), out = []
  let n = 0
  lib.courses.forEach((c) => c.sessions.forEach((s) => {
    const lines = lib.textsFor(s).filter((t) => !seen.has(t))
    lines.forEach((t) => seen.add(t))
    if (!lines.length) return
    n++
    out.push({ id: String(n).padStart(2, '0') + '-' + s.id, title: `${c.title} — ${s.title}`, lines })
  }))
  return out
}

const STYLE = `Read these lines as an experienced, kind meditation teacher guiding one person.
Voice: warm and grounded, from the chest — a natural, slightly low pitch for this voice. Soft but clearly audible, not whispered.
Tone: gentle and reassuring, with a faint smile in the voice. Calm, never cheerful, dramatic or salesy. No vocal fry.
Pace: slow and even — about 100 to 120 words per minute. Let sentences settle downward at the end, not rise.
Breathe naturally between phrases; pause briefly at commas and dashes, longer after each sentence.
Keep the volume steady from start to finish.
After each numbered line, stay completely silent for about 3 seconds before the next one.
Do not read the line numbers. Do not add, skip or repeat any words.`

async function writeScript() {
  const bs = await batches()
  const total = bs.reduce((a, b) => a + b.lines.length, 0)
  let md = `# Mind Journal — meditation voice script

${bs.length} batches · ${total} lines. Generate each batch as **one** recording.

## How to record (Google AI Studio → Generate speech)

1. Open **aistudio.google.com → Generate speech** (single speaker).
2. Pick a soft voice and keep it the same for every batch. Good ones to try: **Achernar** (soft),
   **Vindemiatrix** (gentle), **Sulafat** (warm), **Aoede** (breezy); for a male voice, **Enceladus** (breathy).
3. Paste the **style instructions** below into the style / instructions box (or at the top of the text).
4. Paste one batch's lines as the text, generate, listen, and download.
5. Save the file in \`scripts/voice-batches/\` with the batch's name — e.g. \`01-learn-1.wav\` (wav or mp3).
6. When all are saved: \`node scripts/voice-batches.mjs import --voice gemini-<VoiceName>\`

If a batch reads a line twice, skips one, or doesn't leave clear pauses, just regenerate that batch —
the import tells you which ones need it.

## Style instructions (same for every batch)

\`\`\`
${STYLE}
\`\`\`
`
  bs.forEach((b) => {
    md += `\n## ${b.id}  ·  ${b.title}  ·  ${b.lines.length} lines\n\nSave as: \`scripts/voice-batches/${b.id}.wav\`\n\n\`\`\`\n${b.lines.map((t, i) => `${i + 1}. ${t}`).join('\n\n')}\n\`\`\`\n`
  })
  await writeFile(SCRIPT_MD, md)
  await mkdir(IN, { recursive: true })
  console.log(`\n✓ ${SCRIPT_MD.replace(ROOT + '/', '')} — ${bs.length} batches, ${total} lines`)
  console.log(`  Save recordings in scripts/voice-batches/ then run:  node scripts/voice-batches.mjs import --voice gemini-<Name>\n`)
}

// ── splitting ───────────────────────────────────────────────────────────
async function duration(file) {
  const { stdout } = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file])
  return parseFloat(stdout)
}

async function speechSegments(file, noise, minSilence, total) {
  const { stderr } = await run('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', `silencedetect=noise=${noise}dB:d=${minSilence}`, '-f', 'null', '-'], { maxBuffer: 1 << 24 })
  const sil = []
  let start = null
  stderr.split('\n').forEach((l) => {
    const s = l.match(/silence_start: (-?[\d.]+)/); if (s) start = Math.max(0, +s[1])
    const e = l.match(/silence_end: ([\d.]+)/); if (e && start !== null) { sil.push([start, +e[1]]); start = null }
  })
  if (start !== null) sil.push([start, total])
  const segs = []
  let cur = 0
  sil.forEach(([a, b]) => { if (a - cur > 0.35) segs.push([cur, a]); cur = b })
  if (total - cur > 0.35) segs.push([cur, total])
  return segs
}

async function findSplit(file, want) {
  const total = await duration(file)
  for (const noise of [-40, -35, -45, -30, -50]) {
    for (const d of [1.6, 1.3, 2.0, 1.1, 2.4, 0.9, 2.8]) {
      const segs = await speechSegments(file, noise, d, total)
      if (segs.length === want) return { segs, noise, d }
    }
  }
  const segs = await speechSegments(file, -40, 1.6, total)
  return { segs, failed: true }
}

async function importBatches() {
  try { await run('ffmpeg', ['-version']) } catch { die('ffmpeg is needed for import (Mac: brew install ffmpeg).') }
  const voice = opt('voice', null)
  if (!voice) die('Tell me which voice you used, e.g.  --voice gemini-Achernar')
  const bs = await batches()
  const files = existsSync(IN) ? await readdir(IN) : []
  const sig = createHash('sha1').update(JSON.stringify({ v: voice })).digest('hex').slice(0, 8)
  const fileFor = (t) => createHash('sha1').update(sig + '\n' + t).digest('hex').slice(0, 16) + '.mp3'

  await mkdir(OUT, { recursive: true })
  const manifestPath = join(OUT, 'manifest.json')
  let manifest = { files: {} }
  try { manifest = JSON.parse(await readFile(manifestPath, 'utf8')) } catch { }
  manifest.files = manifest.files || {}

  const tmp = join(tmpdir(), 'mj-voice-' + Date.now())
  await mkdir(tmp, { recursive: true })
  let ok = 0, missing = [], bad = []
  for (const b of bs) {
    const f = files.find((x) => basename(x, extname(x)) === b.id && /\.(wav|mp3|m4a|ogg|flac)$/i.test(x))
    if (!f) { missing.push(b.id); continue }
    const src = join(IN, f)
    const { segs, failed } = await findSplit(src, b.lines.length)
    if (failed) { bad.push(`${b.id}: found ${segs.length} spoken parts, expected ${b.lines.length}`); continue }
    for (let i = 0; i < segs.length; i++) {
      const [a, z] = segs[i]
      const from = Math.max(0, a - 0.12), len = z - a + 0.3
      const out = join(OUT, fileFor(b.lines[i]))
      await run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-ss', from.toFixed(3), '-t', len.toFixed(3), '-i', src,
        '-af', `afade=t=in:d=0.04,afade=t=out:st=${Math.max(0, len - 0.12).toFixed(3)}:d=0.12,loudnorm=I=-19:TP=-2:LRA=7`,
        '-ac', '1', '-ar', '24000', '-c:a', 'libmp3lame', '-b:a', '64k', out])
      manifest.files[b.lines[i]] = fileFor(b.lines[i])
    }
    ok++
    console.log(`  ✓ ${b.id} — ${segs.length} lines`)
  }
  await rm(tmp, { recursive: true, force: true })
  if (!ok) {
    if (bad.length) console.log('\nRe-generate these (pauses unclear or a line missed/repeated):\n  ' + bad.join('\n  '))
    die(missing.length === bs.length ? 'No recordings found in scripts/voice-batches/ (name them like 01-learn-1.wav).' : 'No batch could be imported — nothing was changed.')
  }

  // keep only lines that still exist in the library and whose file is on disk
  const valid = new Set(bs.flatMap((b) => b.lines))
  for (const t of Object.keys(manifest.files)) if (!valid.has(t) || !existsSync(join(OUT, manifest.files[t]))) delete manifest.files[t]
  manifest.voice = voice
  manifest.source = 'recorded batches'
  manifest.generatedAt = new Date().toISOString()
  await writeFile(manifestPath, JSON.stringify(manifest, null, 1) + '\n')

  const have = Object.keys(manifest.files).length
  console.log(`\n${ok}/${bs.length} batches imported · ${have}/${valid.size} lines have a recorded voice`)
  if (bad.length) console.log('\nRe-generate these (pauses unclear or a line missed/repeated):\n  ' + bad.join('\n  '))
  if (missing.length) console.log(`\nNot recorded yet: ${missing.join(', ')}`)
  console.log('\nLines without a recording use the device voice, so you can ship partway.\n')
}

if (cmd === 'script') await writeScript()
else if (cmd === 'import') await importBatches()
else console.log('Usage:\n  node scripts/voice-batches.mjs script\n  node scripts/voice-batches.mjs import --voice gemini-<Name>')
