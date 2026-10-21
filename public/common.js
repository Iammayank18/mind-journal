/*
 * Mind Journal — shared code for every page (styles live in theme.css).
 *
 * Everything is stored in this browser's localStorage. Nothing is sent
 * anywhere, so each person who opens the site gets their own private space.
 *
 *   MJ.getName() / MJ.displayName() / MJ.withName("Hi {name}")
 *   MJ.orb({ mood: 'calm', size: 64 })   — a little mood character (SVG string)
 *   MJ.MOODS                             — mood → label, colour, face
 *   MJ.sound.toggle() / MJ.chime('done') — calm sound + soft chimes
 *   MJ.openSettings(), MJ.openLetter(), MJ.checkMilestones(), MJ.toast(msg)
 *   MJ.journalDay(iso), MJ.plannerDoneOn(iso), MJ.localISO(date) …
 *
 * Load it in <head> (not deferred) so the colour theme applies before paint.
 */
(function () {
  "use strict";

  var KEYS = {
    name: "mindjournal_userName",
    nameAsked: "mindjournal_nameAsked",
    theme: "mindjournal_theme",
    prefs: "mindjournal_prefs",
    milestones: "mindjournal_milestones",
    letterSeen: "mindjournal_letterSeen",
    lastBackup: "mindjournal_lastBackup",
    dateFix: "mindjournal_dateKeysV2",
    sound: "mindjournal_sound",
    persistAsked: "mindjournal_persistAsked",
    iosHintSeen: "mindjournal_iosHintSeen",
    helloDay: "mindjournal_helloDay",
    lastVisit: "mindjournal_lastVisit",
    planner: "plannerData_v2",
    meditate: "mindjournal_meditate"
  };
  var JOURNAL_KEY_RE = /^mj_(\d{4}-\d{2}-\d{2})_([a-z]+)$/;
  var SECTIONS = ["checkin", "braindump", "worry", "reframe", "gratitude", "evening"];

  // ---------- storage (never throws: private mode / blocked storage) ----------
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) { } }
  function lsJSON(k, fallback) {
    var raw = lsGet(k);
    if (!raw) return fallback;
    try { return JSON.parse(raw); } catch (e) { return fallback; }
  }
  function lsKeys() {
    var out = [];
    try { for (var i = 0; i < localStorage.length; i++) out.push(localStorage.key(i)); } catch (e) { }
    return out;
  }
  function ssGet(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
  function ssSet(k, v) { try { sessionStorage.setItem(k, v); } catch (e) { } }
  function isAppKey(k) {
    return k === KEYS.planner || k.indexOf("mj_") === 0 || k.indexOf("mindjournal_") === 0;
  }

  // ---------- dates (always the *local* calendar day) ----------
  function localISO(d) {
    d = d || new Date();
    var tz = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - tz).toISOString().slice(0, 10);
  }
  function addDaysISO(iso, n) {
    var d = new Date(iso + "T12:00:00");
    d.setDate(d.getDate() + n);
    return localISO(d);
  }
  function weekStartISO(iso) { // Monday
    var d = new Date((iso || localISO()) + "T12:00:00");
    var dow = (d.getDay() + 6) % 7;
    return addDaysISO(localISO(d), -dow);
  }
  function prettyDate(iso, opts) {
    return new Date(iso + "T12:00:00").toLocaleDateString("en-IN", opts || { weekday: "short", day: "numeric", month: "short" });
  }

  // ---------- one-time fix: journal entries were keyed by UTC date ----------
  // Older versions saved entries under the UTC date of *local* midnight. East of
  // UTC (e.g. India, UTC+5:30) that is the previous calendar day, so every entry
  // sat one day early. Shift them onto their real local date, newest first so
  // each target slot is already free.
  function migrateJournalDateKeys() {
    if (lsGet(KEYS.dateFix)) return;
    var eastOfUTC = new Date().getTimezoneOffset() < 0;
    if (eastOfUTC) {
      var keys = lsKeys().filter(function (k) { return JOURNAL_KEY_RE.test(k); });
      keys.sort().reverse();
      keys.forEach(function (k) {
        var m = k.match(JOURNAL_KEY_RE);
        var target = "mj_" + addDaysISO(m[1], 1) + "_" + m[2];
        if (lsGet(target) === null) {
          var v = lsGet(k);
          if (lsSet(target, v)) lsDel(k);
        }
      });
    }
    lsSet(KEYS.dateFix, "1");
  }
  migrateJournalDateKeys();

  // ---------- theme ----------
  function getTheme() { return lsGet(KEYS.theme) || "auto"; }
  function applyTheme() {
    var t = getTheme();
    if (t === "light" || t === "dark") document.documentElement.setAttribute("data-theme", t);
    else document.documentElement.removeAttribute("data-theme");
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      var dark = t === "dark" || (t === "auto" && window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches);
      meta.setAttribute("content", dark ? "#191714" : "#FFF6EA");
    }
  }
  function setTheme(t) { lsSet(KEYS.theme, t); applyTheme(); }
  applyTheme();

  // ---------- prefs ----------
  function prefs() { return lsJSON(KEYS.prefs, {}); }
  // Interview Reps is opt-in. Existing users who already practised keep it on.
  function showReps() {
    var p = prefs();
    if (p.showReps === true || p.showReps === false) return p.showReps;
    var d = lsJSON(KEYS.planner, null);
    var r = d && d.reps;
    return !!(r && ((r.cards && r.cards.length) || (r.states && Object.keys(r.states).length)));
  }
  function setPref(k, v) { var p = prefs(); p[k] = v; lsSet(KEYS.prefs, JSON.stringify(p)); emit("prefs"); }

  // ---------- name ----------
  function getName() { return (lsGet(KEYS.name) || "").trim(); }
  function displayName() { return getName() || "friend"; }
  function withName(str) { return String(str).replace(/\{name\}/g, displayName()); }
  function greetingWord() {
    var h = new Date().getHours();
    if (h < 5) return "Still up";
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  }

  // ---------- tiny event bus ----------
  var listeners = { name: [], prefs: [], data: [] };
  function on(evt, fn) { (listeners[evt] = listeners[evt] || []).push(fn); }
  function emit(evt) { (listeners[evt] || []).forEach(function (fn) { try { fn(); } catch (e) { console.error(e); } }); }
  window.addEventListener("storage", function (e) {
    if (e.key === KEYS.name) { emit("name"); refreshAvatar(); }
    else if (e.key === KEYS.theme) applyTheme();
    else if (e.key === KEYS.prefs) emit("prefs");
  });

  // ---------- mood orbs: little round characters ----------
  var MOODS = {
    heavy:    { label: "Heavy",    color: "var(--sky)",      face: "sad" },
    anxious:  { label: "Anxious",  color: "var(--coral)",    face: "worried" },
    flat:     { label: "Flat",     color: "var(--lavender)", face: "flat" },
    restless: { label: "Restless", color: "var(--peach)",    face: "wavy" },
    okay:     { label: "Okay",     color: "var(--yolk)",     face: "smile" },
    calm:     { label: "Calm",     color: "var(--mint)",     face: "calm" },
    good:     { label: "Good",     color: "var(--brand)",    face: "happy" },
    light:    { label: "Light",    color: "var(--rose)",     face: "joy" }
  };
  var INK = 'style="stroke:var(--orb-ink)" fill="none" stroke-width="5" stroke-linecap="round"';
  var EYES = {
    dots: '<g class="orb-eyes" style="fill:var(--orb-ink)"><ellipse cx="45" cy="56" rx="5" ry="7"/><ellipse cx="75" cy="56" rx="5" ry="7"/></g>',
    round: '<g class="orb-eyes" style="fill:var(--orb-ink)"><circle cx="46" cy="56" r="6"/><circle cx="74" cy="56" r="6"/></g>',
    wide: '<g class="orb-eyes" style="fill:var(--orb-ink)"><ellipse cx="45" cy="55" rx="6" ry="8.5"/><ellipse cx="75" cy="55" rx="6" ry="8.5"/></g>',
    closed: '<path d="M36 58 Q44 65 52 58" ' + INK + '/><path d="M68 58 Q76 65 84 58" ' + INK + '/>',
    happy: '<path d="M37 61 Q45 51 53 61" ' + INK + '/><path d="M67 61 Q75 51 83 61" ' + INK + '/>'
  };
  var MOUTH = {
    smile: '<path d="M48 76 Q60 86 72 76" ' + INK + '/>',
    happy: '<path d="M44 73 Q60 91 76 73" ' + INK + '/>',
    sad: '<path d="M48 85 Q60 75 72 85" ' + INK + '/>',
    flat: '<path d="M48 80 L72 80" ' + INK + '/>',
    wavy: '<path d="M45 82 Q52.5 76 60 82 Q67.5 88 75 82" ' + INK + '/>',
    o: '<ellipse cx="60" cy="80" rx="6.5" ry="7.5" style="fill:var(--orb-ink)"/>',
    soft: '<path d="M52 78 Q60 83 68 78" ' + INK + '/>'
  };
  var FACES = {
    smile:   ["round", "smile", true],
    happy:   ["dots", "happy", true],
    joy:     ["happy", "happy", true],
    calm:    ["closed", "smile", false],
    sleepy:  ["closed", "soft", false],
    sad:     ["round", "sad", false],
    worried: ["wide", "wavy", false],
    flat:    ["round", "flat", false],
    wavy:    ["dots", "wavy", false],
    o:       ["round", "o", false]
  };
  var blinkSeed = 0;
  function orb(o) {
    o = o || {};
    var m = o.mood && MOODS[o.mood];
    var color = o.color || (m ? m.color : "var(--brand)");
    var f = FACES[o.face || (m ? m.face : "smile")] || FACES.smile;
    var size = o.size || 48;
    blinkSeed = (blinkSeed + 1.37) % 6;
    var cheeks = f[2] ? '<circle cx="33" cy="70" r="7" style="fill:var(--coral)" opacity=".38"/><circle cx="87" cy="70" r="7" style="fill:var(--coral)" opacity=".38"/>' : "";
    return '<span class="orb ' + (o.cls || "") + '" style="width:' + size + 'px;height:' + size + 'px;--blink-delay:' + blinkSeed.toFixed(2) + 's;--float-delay:-' + (blinkSeed * 1.3).toFixed(2) + 's"' +
      (o.label ? ' role="img" aria-label="' + esc(o.label) + '"' : ' aria-hidden="true"') + '>' +
      '<svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="56" style="fill:' + color + '"/>' +
      cheeks + EYES[f[0]] + MOUTH[f[1]] + '</svg></span>';
  }

  // ---------- cross-app data ----------
  function journalDay(iso) {
    var out = {};
    SECTIONS.forEach(function (s) { var v = lsJSON("mj_" + iso + "_" + s, null); if (v) out[s] = v; });
    return out;
  }
  function journalDates() {
    var set = {};
    lsKeys().forEach(function (k) { var m = k && k.match(JOURNAL_KEY_RE); if (m) set[m[1]] = true; });
    return Object.keys(set).sort();
  }
  function journalStreak() {
    var dates = {};
    journalDates().forEach(function (d) { dates[d] = true; });
    var n = 0, d = localISO();
    while (dates[d]) { n++; d = addDaysISO(d, -1); }
    return n;
  }
  function plannerData() { return lsJSON(KEYS.planner, null); }
  function plannerDoneOn(iso) {
    var data = plannerData();
    if (!data || !data.log || !data.log[iso]) return [];
    return data.log[iso].map(function (e) {
      var t = (data.tasks || []).filter(function (x) { return x.id === e.taskId; })[0];
      var s = (data.sections || []).filter(function (x) { return x.id === e.sectionId; })[0];
      return { text: t ? t.text : "", section: s ? s.name : "" };
    }).filter(function (x) { return x.text; });
  }
  function plannerTotals() {
    var data = plannerData();
    var log = (data && data.log) || {};
    var total = 0;
    Object.keys(log).forEach(function (d) { total += log[d].length; });
    var n = 0, d = localISO();
    if (!(log[d] && log[d].length)) d = addDaysISO(d, -1); // today not started yet doesn't break a streak
    while (log[d] && log[d].length) { n++; d = addDaysISO(d, -1); }
    return { total: total, streak: n };
  }

  // ---------- meditation (sessions saved by meditate.html) ----------
  // A sit before 3am counts for the day before — late-night meditators keep their streak.
  function medDay(d) { return localISO(new Date(d.getTime() - 3 * 3600000)); }
  function meditateData() {
    var d = lsJSON(KEYS.meditate, null) || {};
    d.sessions = d.sessions || [];
    d.progress = d.progress || {};
    d.favs = d.favs || [];
    d.prefs = d.prefs || {};
    return d;
  }
  function meditateTotals() {
    var d = meditateData();
    var days = {}, mins = 0;
    d.sessions.forEach(function (s) { days[s.day] = (days[s.day] || 0) + (s.secs || 0); mins += (s.secs || 0) / 60; });
    var today = medDay(new Date());
    var n = 0, cur = today;
    if (!days[cur]) cur = addDaysISO(cur, -1);
    while (days[cur]) { n++; cur = addDaysISO(cur, -1); }
    var sorted = Object.keys(days).sort(), best = 0, run = 0, prev = null;
    sorted.forEach(function (x) { run = prev && addDaysISO(prev, 1) === x ? run + 1 : 1; best = Math.max(best, run); prev = x; });
    return { streak: n, longest: best, minutes: Math.round(mins), sessions: d.sessions.length, days: days, today: today, didToday: !!days[today] };
  }
  function meditatedOn(iso) {
    return meditateData().sessions.filter(function (s) { return s.day === iso; });
  }

  // ---------- helpers ----------
  function el(tag, attrs, html) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    if (html != null) n.innerHTML = html;
    return n;
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function reducedMotion() {
    return window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  }
  function toast(msg, ms) {
    var t = document.getElementById("toast");
    if (!t) { t = el("div", { id: "toast", "class": "toast", role: "status", "aria-live": "polite" }); document.body.appendChild(t); }
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.classList.remove("show"); }, ms || 2600);
  }

  var ICON = {
    sun: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    cal: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="4"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
    jar: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3h8M9 3v3c-2 1-4 3-4 7v5a3 3 0 0 0 3 3h8a3 3 0 0 0 3-3v-5c0-4-2-6-4-7V3"/><path d="M12 11l1 2 2 .3-1.5 1.4.4 2.1-1.9-1-1.9 1 .4-2.1L9 13.3l2-.3z"/></svg>',
    lotus: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20c-4 0-8-2-9-6 3 0 5 1 6 2"/><path d="M12 20c4 0 8-2 9-6-3 0-5 1-6 2"/><path d="M12 20c-2-2-3-4.5-3-7.5S10.5 6 12 4c1.5 2 3 5.5 3 8.5S14 18 12 20z"/></svg>',
    you: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>',
    close: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>'
  };

  // ---------- modal (one at a time) ----------
  var overlay, dialog, lastFocus;
  function openModal(html, opts) {
    opts = opts || {};
    lastFocus = document.activeElement;
    overlay.className = "mj-overlay" + (opts.sheet ? " sheet" : "");
    dialog.className = "mj-dialog" + (opts.center ? " center" : "");
    dialog.innerHTML = html;
    dialog.setAttribute("aria-label", opts.label || "Dialog");
    // force reflow so the open transition always plays
    void overlay.offsetWidth;
    overlay.classList.add("show");
    overlay._onClose = opts.onClose || null;
    setTimeout(function () {
      var f = dialog.querySelector("[autofocus]") || dialog.querySelector("input,button");
      if (f) { f.focus({ preventScroll: true }); if (f.select && f.tagName === "INPUT") f.select(); }
    }, 60);
  }
  function closeModal() {
    if (!overlay.classList.contains("show")) return;
    overlay.classList.remove("show");
    var cb = overlay._onClose; overlay._onClose = null;
    if (cb) cb();
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }

  // ---------- name dialog ----------
  function openNameDialog(first) {
    openModal(
      orb({ mood: first ? "good" : "okay", size: 96, cls: "orb-float" }) +
      '<h2>' + (first ? "Lovely start. What should I call you?" : "What should I call you?") + '</h2>' +
      '<p>' + (first
        ? "This little space is yours. Your name makes it feel that way — it stays on this device, never sent anywhere."
        : "Change it any time. The Planner and the Journal both use it.") + '</p>' +
      '<input class="input input-pill" id="mj-name-input" maxlength="30" placeholder="Your first name" autocomplete="given-name" autofocus value="' + esc(getName()) + '">' +
      '<div class="mj-actions">' +
      '<button type="button" class="btn btn-quiet" data-mj-close>' + (first ? "Maybe later" : "Cancel") + '</button>' +
      '<button type="button" class="btn btn-primary" id="mj-name-save">' + (first ? "Let's begin" : "Save") + '</button>' +
      '</div>',
      { center: true, label: "Your name", onClose: function () { lsSet(KEYS.nameAsked, "1"); } }
    );
    var input = document.getElementById("mj-name-input");
    function commit() {
      var n = input.value.replace(/\s+/g, " ").trim().slice(0, 30);
      var had = getName();
      if (n) lsSet(KEYS.name, n); else lsDel(KEYS.name);
      closeModal();
      emit("name");
      refreshAvatar();
      if (n && n !== had) { toast((had ? "Got it — hi, " : "Lovely to meet you, ") + n + " 🌿", 2800); chime("soft"); }
      else if (!n && had) toast("Name cleared");
    }
    document.getElementById("mj-name-save").onclick = commit;
    input.addEventListener("keydown", function (e) { if (e.key === "Enter") commit(); });
  }

  // ---------- calm sound (generated live, no audio files) ----------
  var SCAPES = {
    waves: { label: "Waves", mood: "calm", color: "var(--sky)" },
    rain: { label: "Rain", mood: "flat", color: "var(--lavender)", face: "sleepy" },
    hum: { label: "Warm hum", mood: "okay", color: "var(--yolk)", face: "calm" }
  };
  var ac = null, master = null, scapeNodes = null, playing = false, dripTimer = 0, suspendTimer = 0;
  function soundState() { return lsJSON(KEYS.sound, { scape: "waves", vol: 0.7 }); }
  function saveSoundState(s) { lsSet(KEYS.sound, JSON.stringify(s)); }
  function audio() {
    if (!ac) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ac = new AC();
    }
    if (ac.state === "suspended") ac.resume();
    return ac;
  }
  function noiseBuffer(kind, secs) {
    var len = ac.sampleRate * secs;
    var buf = ac.createBuffer(1, len, ac.sampleRate);
    var d = buf.getChannelData(0);
    var last = 0;
    for (var i = 0; i < len; i++) {
      var w = Math.random() * 2 - 1;
      if (kind === "brown") { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
      else d[i] = w * 0.5;
    }
    if (kind === "brown") { // loop without a click
      var drift = d[len - 1] - d[0];
      for (var j = 0; j < len; j++) d[j] -= drift * (j / len);
    }
    return buf;
  }
  function buildScape(name) {
    var nodes = [];
    var out = ac.createGain();
    out.gain.value = 1;
    out.connect(master);
    function keep(n) { nodes.push(n); return n; }
    if (name === "waves" || name === "hum") {
      var src = keep(ac.createBufferSource());
      src.buffer = noiseBuffer("brown", 8); src.loop = true;
      var lp = ac.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = name === "waves" ? 480 : 300;
      var g = ac.createGain(); g.gain.value = name === "waves" ? 0.34 : 0.1;
      if (name === "waves") {
        var tide = keep(ac.createOscillator()); tide.frequency.value = 0.085;
        var ta = ac.createGain(); ta.gain.value = 0.24;
        var tf = ac.createGain(); tf.gain.value = 260;
        tide.connect(ta).connect(g.gain); tide.connect(tf).connect(lp.frequency); tide.start();
      }
      src.connect(lp).connect(g).connect(out); src.start();
    }
    if (name === "hum") {
      var pad = ac.createGain(); pad.gain.value = 0.05;
      var plp = ac.createBiquadFilter(); plp.type = "lowpass"; plp.frequency.value = 900;
      [110, 164.81, 246.94, 329.63, 493.88].forEach(function (f, i) {
        var o = keep(ac.createOscillator()); o.type = "sine"; o.frequency.value = f; o.detune.value = i % 2 ? 5 : -5;
        var og = ac.createGain(); og.gain.value = i === 4 ? 0.12 : 0.25;
        var l = keep(ac.createOscillator()); l.frequency.value = 0.04 + i * 0.021;
        var lg = ac.createGain(); lg.gain.value = 0.18;
        l.connect(lg).connect(og.gain); o.connect(og).connect(plp); o.start(); l.start();
      });
      plp.connect(pad).connect(out);
    }
    if (name === "rain") {
      var r = keep(ac.createBufferSource()); r.buffer = noiseBuffer("white", 3); r.loop = true;
      var hp = ac.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 600;
      var rl = ac.createBiquadFilter(); rl.type = "lowpass"; rl.frequency.value = 5200;
      var rg = ac.createGain(); rg.gain.value = 0.16;
      var sway = keep(ac.createOscillator()); sway.frequency.value = 0.05;
      var sg = ac.createGain(); sg.gain.value = 0.05; sway.connect(sg).connect(rg.gain); sway.start();
      r.connect(hp).connect(rl).connect(rg).connect(out); r.start();
      var bed = keep(ac.createBufferSource()); bed.buffer = noiseBuffer("brown", 8); bed.loop = true;
      var bg = ac.createGain(); bg.gain.value = 0.12; bed.connect(bg).connect(out); bed.start();
      var drip = function () {
        if (!playing) return;
        var t = ac.currentTime;
        var o = ac.createOscillator(); o.type = "sine";
        o.frequency.setValueAtTime(1400 + Math.random() * 1400, t);
        o.frequency.exponentialRampToValueAtTime(700 + Math.random() * 300, t + 0.08);
        var dg = ac.createGain(); dg.gain.setValueAtTime(0, t);
        dg.gain.linearRampToValueAtTime(0.012 + Math.random() * 0.012, t + 0.005);
        dg.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
        o.connect(dg).connect(out); o.start(t); o.stop(t + 0.14);
        dripTimer = setTimeout(drip, 90 + Math.random() * 420);
      };
      dripTimer = setTimeout(drip, 200);
    }
    return { out: out, nodes: nodes };
  }
  function stopScape() {
    clearTimeout(dripTimer);
    if (!scapeNodes) return;
    var s = scapeNodes; scapeNodes = null;
    var t = ac.currentTime;
    s.out.gain.setTargetAtTime(0, t, 0.4);
    setTimeout(function () {
      s.nodes.forEach(function (n) { try { n.stop(); } catch (e) { } });
      try { s.out.disconnect(); } catch (e) { }
    }, 2200);
  }
  function startSound() {
    if (!audio()) return false;
    clearTimeout(suspendTimer);
    if (!master) { master = ac.createGain(); master.gain.value = 0; master.connect(ac.destination); }
    var st = soundState();
    playing = true;
    stopScape();
    scapeNodes = buildScape(st.scape);
    master.gain.cancelScheduledValues(ac.currentTime);
    master.gain.setTargetAtTime(0.9 * st.vol, ac.currentTime, 1.6); // slow, gentle fade in
    ssSet("mj_sound_on", "1");
    refreshSoundBtn();
    return true;
  }
  function stopSound() {
    playing = false;
    ssSet("mj_sound_on", "");
    if (ac && master) {
      master.gain.cancelScheduledValues(ac.currentTime);
      master.gain.setTargetAtTime(0, ac.currentTime, 0.6);
      suspendTimer = setTimeout(function () { stopScape(); }, 2600);
    }
    refreshSoundBtn();
  }
  // lower the background sound while a voice is speaking, then bring it back
  function duck(on) {
    if (!ac || !master || !playing) return;
    master.gain.cancelScheduledValues(ac.currentTime);
    master.gain.setTargetAtTime((on ? 0.4 : 0.9) * soundState().vol, ac.currentTime, on ? 0.25 : 0.8);
  }
  function setScape(name) {
    var st = soundState(); st.scape = name; saveSoundState(st);
    if (playing) startSound(); else refreshSoundBtn();
  }
  function setVolume(v) {
    var st = soundState(); st.vol = v; saveSoundState(st);
    if (playing && master) master.gain.setTargetAtTime(0.9 * v, ac.currentTime, 0.2);
  }
  function refreshSoundBtn() {
    var b = document.getElementById("mj-sound");
    if (!b) return;
    b.setAttribute("aria-pressed", String(playing));
    b.title = (playing ? "Pause calm sound (" : "Play calm sound (") + SCAPES[soundState().scape].label + ")";
  }

  // soft chimes for finished things (only ever after a tap)
  function chime(kind) {
    if (prefs().chimes === false) return;
    var a = audio();
    if (!a) return;
    var notes = kind === "celebrate" ? [523.25, 659.25, 783.99, 1046.5] : kind === "soft" ? [659.25] : [783.99, 1046.5];
    var t0 = a.currentTime + 0.02;
    notes.forEach(function (f, i) {
      var t = t0 + i * (kind === "celebrate" ? 0.13 : 0.11);
      [["sine", 1], ["triangle", 0.25]].forEach(function (layer) {
        var o = a.createOscillator(); o.type = layer[0]; o.frequency.value = f * (layer[0] === "triangle" ? 2 : 1);
        var g = a.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.055 * layer[1], t + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
        o.connect(g).connect(a.destination);
        o.start(t); o.stop(t + 1.5);
      });
    });
  }

  // a singing-bowl bell, made live (no audio files): start, interval or end
  function bell(kind) {
    var a = audio();
    if (!a) return;
    var strikes = kind === "end" ? 3 : 1;
    var vol = kind === "interval" ? 0.05 : 0.085;
    var f0 = kind === "interval" ? 293.66 : 220;
    for (var s = 0; s < strikes; s++) {
      var t = a.currentTime + 0.05 + s * 2.8;
      [[1, 1], [2.01, 0.42], [2.76, 0.3], [5.4, 0.12], [8.93, 0.05]].forEach(function (p, i) {
        [0, i === 0 ? 1.6 : 0].forEach(function (detune, k) {
          if (k && !detune) return;
          var o = a.createOscillator(); o.type = "sine"; o.frequency.value = f0 * p[0] + detune;
          var g = a.createGain();
          var len = 7 / Math.pow(p[0], 0.35);
          g.gain.setValueAtTime(0, t);
          g.gain.linearRampToValueAtTime(vol * p[1] * (k ? 0.6 : 1), t + 0.012);
          g.gain.exponentialRampToValueAtTime(0.0001, t + len);
          o.connect(g).connect(a.destination);
          o.start(t); o.stop(t + len + 0.1);
        });
      });
    }
  }

  // ---------- backup ----------
  function exportBackup() {
    var data = {};
    lsKeys().forEach(function (k) { if (k && isAppKey(k)) data[k] = lsGet(k); });
    var payload = { app: "mind-journal", version: 1, exportedAt: new Date().toISOString(), data: data };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    var a = el("a", { href: URL.createObjectURL(blob), download: "mind-journal-backup-" + localISO() + ".json" });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
    lsSet(KEYS.lastBackup, new Date().toISOString());
    refreshNudge();
    toast("Backup saved — keep it somewhere safe", 3000);
  }
  // A readable copy of everything — your journal is yours, in a format any app can open.
  function exportMarkdown() {
    var out = ["# Mind Journal — " + displayName(), "", "_Exported " + new Date().toLocaleString() + "_", ""];
    var dset = {};
    journalDates().forEach(function (x) { dset[x] = 1; });
    meditateData().sessions.forEach(function (x) { dset[x.day] = 1; });
    var dates = Object.keys(dset).sort().reverse();
    function para(label, txt) { if (txt && String(txt).trim()) out.push("**" + label + ":** " + String(txt).trim()); }
    dates.forEach(function (iso) {
      var d = journalDay(iso);
      out.push("## " + prettyDate(iso, { weekday: "long", day: "numeric", month: "long", year: "numeric" }), "");
      if (d.checkin) { var m = MOODS[d.checkin.mood]; para("Mood", (m ? m.label : (d.checkin.moodLabel || "")) + (d.checkin.energy ? " · energy " + d.checkin.energy + "/10" : "")); para("On my mind", d.checkin.heaviest); }
      if (d.braindump && d.braindump.text && d.braindump.text.trim()) out.push("", "### Brain dump", "", d.braindump.text.trim());
      if (d.worry && d.worry.worries && d.worry.worries.length) { out.push("", "### Worries parked", ""); d.worry.worries.forEach(function (w) { out.push("- " + (w.parked ? "[parked] " : "") + w.text); }); }
      if (d.reframe) { out.push("", "### Reframe", ""); para("The thought", d.reframe.r1); para("Fact or feeling", d.reframe.r2); para("What I'd tell a friend", d.reframe.r3); para("A truer thought", d.reframe.r4); }
      if (d.gratitude) { out.push("", "### Gratitude & wins", ""); [d.gratitude.g1, d.gratitude.g2, d.gratitude.g3].forEach(function (g) { if (g && g.trim()) out.push("- " + g.trim()); }); para("A win", d.gratitude.win); para("Kind words", d.gratitude.kind); }
      if (d.evening) { out.push("", "### Evening", ""); para("How the day felt", d.evening.day); para("Letting go of", d.evening.release); para("Intention for tomorrow", d.evening.intention); }
      var med = meditatedOn(iso);
      if (med.length) { out.push("", "### Meditation", ""); med.forEach(function (m) { out.push("- " + (m.title || "Timer") + " · " + Math.max(1, Math.round((m.secs || 0) / 60)) + " min" + (m.note ? " — " + m.note : "")); }); }
      var done = plannerDoneOn(iso);
      if (done.length) { out.push("", "### Done in the planner", ""); done.forEach(function (t) { out.push("- " + t.text + (t.section ? " (" + t.section + ")" : "")); }); }
      out.push("");
    });
    if (!dates.length) out.push("Nothing written yet.");
    var blob = new Blob([out.join("\n")], { type: "text/markdown" });
    var a = el("a", { href: URL.createObjectURL(blob), download: "mind-journal-" + localISO() + ".md" });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
    toast("Your journal, as a text file");
  }

  // Ask the browser not to clear our storage (Safari can wipe sites unused for 7 days).
  function requestPersist() {
    try {
      if (navigator.storage && navigator.storage.persist && !lsGet(KEYS.persistAsked)) {
        lsSet(KEYS.persistAsked, "1");
        navigator.storage.persisted().then(function (p) { if (!p) navigator.storage.persist(); }).catch(function () { });
      }
    } catch (e) { }
  }

  // Called after anything is saved on purpose: the first time, we ask for a name
  // (the user has now seen what the app is for) and protect their storage.
  function afterSave() {
    requestPersist();
    if (!getName() && !lsGet(KEYS.nameAsked)) setTimeout(function () { openNameDialog(true); }, 1400);
  }

  function isIOS() { return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1); }
  // iPhone Safari may clear data of websites not opened for a week; installed apps are safe.
  function shouldShowIOSHint() {
    return isIOS() && !isStandalone() && hasAnyData() && !lsGet(KEYS.iosHintSeen) && /^https?:/.test(location.protocol);
  }
  function dismissIOSHint() { lsSet(KEYS.iosHintSeen, "1"); }

  var SUPPORT_HTML =
    '<div class="mj-support">' +
    '<p><b>If things feel like too much, you don\'t have to carry it alone.</b> Talking to someone can help — a friend, a doctor, or a helpline.</p>' +
    '<ul>' +
    '<li><b>India:</b> Tele-MANAS — call <a href="tel:14416">14416</a> or <a href="tel:18008914416">1-800-891-4416</a> (free, 24×7, many languages)</li>' +
    '<li><b>Anywhere:</b> <a href="https://findahelpline.com" target="_blank" rel="noopener">findahelpline.com</a> lists free, confidential helplines in your country</li>' +
    '<li>If you\'re in danger right now, call your local emergency number.</li>' +
    '</ul>' +
    '<p class="hint">Mind Journal is a self-care tool, not a substitute for professional care.</p>' +
    '</div>';
  function openSupport() {
    openModal(
      '<div class="mj-sheet-head"><h2>Find support</h2><button type="button" class="btn btn-icon btn-quiet" data-mj-close aria-label="Close">' + ICON.close + '</button></div>' +
      SUPPORT_HTML,
      { sheet: true, label: "Find support" }
    );
  }

  function importBackup(file) {
    var reader = new FileReader();
    reader.onload = function () {
      var parsed;
      try { parsed = JSON.parse(reader.result); } catch (e) { parsed = null; }
      if (!parsed || parsed.app !== "mind-journal" || !parsed.data || typeof parsed.data !== "object") {
        toast("That file doesn't look like a Mind Journal backup.", 3200);
        return;
      }
      var keys = Object.keys(parsed.data).filter(isAppKey);
      if (!window.confirm("Restore this backup from " + new Date(parsed.exportedAt).toLocaleString() +
        "?\n\nIt replaces the planner and journal data currently in this browser.")) return;
      lsKeys().forEach(function (k) { if (k && isAppKey(k)) lsDel(k); });
      keys.forEach(function (k) { if (typeof parsed.data[k] === "string") lsSet(k, parsed.data[k]); });
      // a backup from an older version still needs the date-key fix
      if (!parsed.data[KEYS.dateFix]) lsDel(KEYS.dateFix);
      lsSet(KEYS.lastBackup, new Date().toISOString());
      location.reload();
    };
    reader.readAsText(file);
  }
  function hasAnyData() { return !!plannerData() || journalDates().length > 0 || meditateData().sessions.length > 0; }
  function backupAgeDays() {
    var t = lsGet(KEYS.lastBackup);
    return t ? Math.floor((Date.now() - new Date(t).getTime()) / 86400000) : null;
  }
  function backupStatus() {
    var d = backupAgeDays();
    if (d === null) return "You haven't made a backup yet.";
    if (d === 0) return "Last backup: today.";
    return "Last backup: " + d + (d === 1 ? " day" : " days") + " ago.";
  }
  function refreshNudge() {
    var g = document.getElementById("mj-you");
    if (!g) return;
    var d = backupAgeDays();
    g.classList.toggle("nudge", hasAnyData() && (d === null || d >= 7));
  }

  // ---------- share + install ----------
  function siteURL() {
    if (!/^https?:/.test(location.protocol)) return null;
    return location.origin + location.pathname.replace(/[^/]*$/, "");
  }
  function shareWithFriend() {
    var url = siteURL();
    var text = "I've been using this little journal + day planner — it's private (everything stays on your own device). Thought you might like it 🌿";
    if (!url) { toast("Deploy the site first — then you can share its link.", 3200); return; }
    if (navigator.share) {
      navigator.share({ title: "Mind Journal", text: text, url: url }).catch(function () { });
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(text + "\n" + url).then(function () { toast("Link copied — paste it to your friend", 3000); });
    } else {
      window.prompt("Copy this link:", url);
    }
  }
  var installEvt = null;
  window.addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); installEvt = e; });
  function isStandalone() {
    return (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || window.navigator.standalone === true;
  }
  function installHelp() {
    if (isStandalone()) return "You're using the installed app.";
    if (installEvt) return "";
    if (/iphone|ipad|ipod/i.test(navigator.userAgent)) return "On iPhone: tap Share, then “Add to Home Screen”.";
    if (!/^https?:/.test(location.protocol)) return "Install works once the site is deployed.";
    return "Use your browser menu → “Install app” or “Add to Home screen”.";
  }

  // ---------- settings sheet ----------
  function openSettings() {
    var p = prefs();
    var theme = getTheme();
    var st = soundState();
    var isPlanner = document.body.getAttribute("data-mj-page") === "planner";
    openModal(
      '<div class="mj-sheet-head"><h2>You</h2><button type="button" class="btn btn-icon btn-quiet" data-mj-close aria-label="Close">' + ICON.close + '</button></div>' +

      '<div class="mj-set"><h3>Your name</h3><div class="mj-profile">' + orb({ mood: "good", size: 52, cls: "orb-breathe" }) +
      '<input class="input input-pill" id="mj-set-name" maxlength="30" placeholder="Your first name" value="' + esc(getName()) + '">' +
      '<button type="button" class="btn btn-primary btn-sm" id="mj-set-name-save">Save</button></div></div>' +

      '<div class="mj-set"><h3>Calm sound</h3><div class="mj-sound-opts">' +
      Object.keys(SCAPES).map(function (k) {
        var s = SCAPES[k];
        return '<button type="button" class="mj-sound-opt" data-scape="' + k + '" aria-pressed="' + (st.scape === k) + '">' +
          orb({ color: s.color, face: s.face || MOODS[s.mood].face, size: 40 }) + s.label + '</button>';
      }).join("") + '</div>' +
      '<div class="row" style="margin-top:14px;--gap:14px"><button type="button" class="btn btn-sm ' + (playing ? "btn-dark" : "btn-soft") + '" id="mj-sound-play">' + (playing ? "Pause" : "Play") + '</button>' +
      '<input type="range" class="range" id="mj-vol" min="0.1" max="1" step="0.05" value="' + st.vol + '" aria-label="Volume" style="--fill:' + Math.round((st.vol - 0.1) / 0.9 * 100) + '%"></div>' +
      '<label class="mj-switch" style="margin-top:10px">Soft chime when you finish something<input type="checkbox" id="mj-chimes"' + (p.chimes === false ? "" : " checked") + '></label></div>' +

      '<div class="mj-set"><h3>Appearance</h3><div class="segmented" role="group" aria-label="Theme">' +
      ["auto", "light", "dark"].map(function (t) {
        return '<button type="button" data-theme-opt="' + t + '" aria-pressed="' + (theme === t) + '">' +
          (t === "auto" ? "Auto" : t === "light" ? "Light" : "Dark") + '</button>';
      }).join("") + '</div></div>' +

      '<div class="mj-set"><h3>Backup</h3><div class="row row-wrap">' +
      '<button type="button" class="btn btn-primary btn-sm" id="mj-export">Download backup</button>' +
      '<button type="button" class="btn btn-soft btn-sm" id="mj-import-btn">Restore from file</button>' +
      '<button type="button" class="btn btn-quiet btn-sm" id="mj-export-md">Download as text</button>' +
      '<input type="file" id="mj-import" accept="application/json,.json" hidden></div>' +
      '<p class="hint">Your data lives only in this browser. ' + esc(backupStatus()) +
      ' A backup also moves everything to a new phone or laptop.</p></div>' +

      '<div class="mj-set"><h3>Share &amp; install</h3><div class="row row-wrap">' +
      '<button type="button" class="btn btn-primary btn-sm" id="mj-share">Share with a friend</button>' +
      '<button type="button" class="btn btn-soft btn-sm" id="mj-install"' + (installEvt && !isStandalone() ? "" : " hidden") + '>Install app</button></div>' +
      '<p class="hint">Friends get their own private space — nobody can see anyone else\'s entries. ' + esc(installHelp()) + '</p></div>' +

      '<div class="mj-set"><h3>A little extra</h3>' +
      '<div class="row row-wrap"><button type="button" class="btn btn-soft btn-sm" id="mj-letter-btn">Read this week\'s letter</button>' +
      '<button type="button" class="btn btn-quiet btn-sm" id="mj-support-btn">Find support</button></div>' +
      (isPlanner ? '<label class="mj-switch" style="margin-top:12px"><span>Interview Reps<span class="hint" style="display:block;margin:0;font-weight:500">Flashcards for job-interview prep, in the Planner</span></span><input type="checkbox" id="mj-reps"' + (showReps() ? " checked" : "") + '></label>' : "") +
      '</div>',
      { sheet: true, label: "Settings" }
    );

    var nameIn = document.getElementById("mj-set-name");
    function saveName() {
      var n = nameIn.value.replace(/\s+/g, " ").trim().slice(0, 30);
      if (n) lsSet(KEYS.name, n); else lsDel(KEYS.name);
      emit("name"); refreshAvatar();
      toast(n ? "Saved — hi, " + n : "Name cleared");
    }
    document.getElementById("mj-set-name-save").onclick = saveName;
    nameIn.addEventListener("keydown", function (e) { if (e.key === "Enter") saveName(); });

    dialog.querySelectorAll("[data-scape]").forEach(function (b) {
      b.onclick = function () {
        dialog.querySelectorAll("[data-scape]").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
        setScape(b.getAttribute("data-scape"));
        if (!playing) startSound();
        var pb = document.getElementById("mj-sound-play");
        pb.textContent = "Pause"; pb.className = "btn btn-sm btn-dark";
      };
    });
    var playBtn = document.getElementById("mj-sound-play");
    playBtn.onclick = function () {
      if (playing) stopSound(); else startSound();
      playBtn.textContent = playing ? "Pause" : "Play";
      playBtn.className = "btn btn-sm " + (playing ? "btn-dark" : "btn-soft");
    };
    var vol = document.getElementById("mj-vol");
    vol.oninput = function () {
      vol.style.setProperty("--fill", Math.round((vol.value - 0.1) / 0.9 * 100) + "%");
      setVolume(+vol.value);
    };
    document.getElementById("mj-chimes").onchange = function () { setPref("chimes", this.checked); if (this.checked) chime("soft"); };

    dialog.querySelectorAll("[data-theme-opt]").forEach(function (b) {
      b.onclick = function () {
        setTheme(b.getAttribute("data-theme-opt"));
        dialog.querySelectorAll("[data-theme-opt]").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
      };
    });
    document.getElementById("mj-export").onclick = function () { exportBackup(); openSettings(); };
    document.getElementById("mj-export-md").onclick = exportMarkdown;
    document.getElementById("mj-support-btn").onclick = openSupport;
    var fileIn = document.getElementById("mj-import");
    document.getElementById("mj-import-btn").onclick = function () { fileIn.click(); };
    fileIn.onchange = function () { if (fileIn.files[0]) importBackup(fileIn.files[0]); };
    document.getElementById("mj-share").onclick = shareWithFriend;
    var inst = document.getElementById("mj-install");
    inst.onclick = function () {
      if (!installEvt) return;
      installEvt.prompt();
      installEvt.userChoice.finally(function () { installEvt = null; inst.hidden = true; });
    };
    document.getElementById("mj-letter-btn").onclick = function () { openLetter(); };
    var reps = document.getElementById("mj-reps");
    if (reps) reps.onchange = function () { setPref("showReps", reps.checked); };
  }

  // ---------- celebrations ----------
  function confetti() {
    if (reducedMotion()) return;
    var c = el("canvas", { id: "mj-confetti" });
    document.body.appendChild(c);
    var ctx = c.getContext("2d");
    var W = c.width = innerWidth, H = c.height = innerHeight;
    var cs = getComputedStyle(document.documentElement);
    var colors = ["--brand", "--mint", "--sky", "--lavender", "--coral", "--yolk", "--rose"].map(function (v) { return cs.getPropertyValue(v).trim() || "#FFA62B"; });
    var bits = [];
    for (var i = 0; i < 90; i++) {
      bits.push({
        x: W / 2 + (Math.random() - 0.5) * 160, y: H * 0.42,
        vx: (Math.random() - 0.5) * 10, vy: -5 - Math.random() * 8,
        r: 5 + Math.random() * 7, c: colors[i % colors.length]
      });
    }
    var start = performance.now();
    (function frame(t) {
      ctx.clearRect(0, 0, W, H);
      var k = Math.min(1, (t - start) / 3200);
      bits.forEach(function (b) {
        b.vy += 0.16; b.vx *= 0.985; b.x += b.vx; b.y += b.vy;
        ctx.globalAlpha = 1 - k;
        ctx.fillStyle = b.c;
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 6.283); ctx.fill();
      });
      if (k < 1) requestAnimationFrame(frame); else c.remove();
    })(start);
  }
  function celebrate(m) {
    openModal(
      orb({ mood: m.mood || "good", size: 110, cls: "orb-bounce" }) +
      '<h2>' + esc(withName(m.title)) + '</h2>' +
      '<p>' + esc(withName(m.message)) + '</p>' +
      '<div class="mj-actions"><button type="button" class="btn btn-primary btn-lg" data-mj-close autofocus>Thank you</button></div>',
      { center: true, label: m.title }
    );
    confetti();
    chime("celebrate");
  }

  var MILESTONES = [
    { kind: "tasks", at: [10, 25, 50, 100, 250, 500, 1000, 2000], mood: "good",
      title: function (n) { return n + " tasks done!"; },
      message: function (n) { return "That's " + n + " times you did something you said you'd do, {name}. Promises kept to yourself add up — this is what that looks like."; } },
    { kind: "pstreak", at: [3, 7, 14, 30, 60, 100, 200, 365], mood: "joy",
      title: function (n) { return n + "-day planner streak"; },
      message: function (n) { return n + " days in a row of getting things done. That's not luck, {name} — that's you, showing up."; } },
    { kind: "jstreak", at: [3, 7, 14, 21, 30, 60, 100, 200, 365], mood: "calm",
      title: function (n) { return n + " days of showing up for yourself"; },
      message: function (n) { return n + " days in a row you made space for your mind, {name}. Be really proud of that."; } },
    { kind: "mstreak", at: [3, 7, 14, 30, 60, 100, 200, 365], mood: "calm",
      title: function (n) { return n + " days of sitting in a row"; },
      message: function (n) { return "You've made a little stillness " + n + " days in a row, {name}. That quiet is yours now."; } },
    { kind: "mmins", at: [60, 300, 600, 1000, 2000, 5000], mood: "light",
      title: function (n) { return n + " minutes of stillness"; },
      message: function (n) { return n + " minutes spent simply being with yourself, {name}. Every one of them counted."; } },
    { kind: "jdays", at: [10, 25, 50, 100, 200, 365], mood: "light",
      title: function (n) { return n + " journal days"; },
      message: function (n) { return "You've written on " + n + " different days, {name}. That's a whole story of you looking after yourself."; } }
  ];
  function checkMilestones() {
    var p = plannerTotals();
    var mt = meditateTotals();
    var values = { tasks: p.total, pstreak: p.streak, jstreak: journalStreak(), jdays: journalDates().length, mstreak: mt.streak, mmins: mt.minutes };
    var seen = lsJSON(KEYS.milestones, null);
    var baseline = seen === null;
    seen = seen || {};
    var fresh = [];
    MILESTONES.forEach(function (m) {
      m.at.forEach(function (n) {
        var id = m.kind + "-" + n;
        if (values[m.kind] >= n && !seen[id]) { seen[id] = localISO(); fresh.push({ m: m, n: n }); }
      });
    });
    lsSet(KEYS.milestones, JSON.stringify(seen));
    // first run with existing data: remember what's already achieved quietly
    if (baseline || !fresh.length) return false;
    var best = fresh[fresh.length - 1];
    setTimeout(function () {
      celebrate({ mood: best.m.mood, title: best.m.title(best.n), message: best.m.message(best.n) });
    }, 900);
    return true;
  }

  // ---------- weekly letter ----------
  function weekStats(start) {
    var days = [];
    for (var i = 0; i < 7; i++) days.push(addDaysISO(start, i));
    var pdata = plannerData();
    var log = (pdata && pdata.log) || {};
    var tasks = 0, busiest = null, busiestN = 0, jdays = 0, moods = {}, energy = [], wins = [], medMins = 0, medN = 0;
    days.forEach(function (d) {
      var n = (log[d] || []).length;
      tasks += n;
      if (n > busiestN) { busiestN = n; busiest = d; }
      var j = journalDay(d);
      if (Object.keys(j).length) jdays++;
      if (j.checkin && j.checkin.mood) moods[j.checkin.mood] = (moods[j.checkin.mood] || 0) + 1;
      if (j.checkin && j.checkin.energy) energy.push(+j.checkin.energy);
      if (j.gratitude && j.gratitude.win && j.gratitude.win.trim()) wins.push(j.gratitude.win.trim());
      meditatedOn(d).forEach(function (s) { medN++; medMins += (s.secs || 0) / 60; });
    });
    var ranked = Object.keys(moods).sort(function (a, b) { return moods[b] - moods[a]; });
    // only say "mostly felt X" when X clearly came up most
    var topMood = ranked.length && moods[ranked[0]] >= 2 && (ranked.length === 1 || moods[ranked[0]] > moods[ranked[1]]) ? ranked[0] : null;
    var avgE = energy.length ? Math.round(energy.reduce(function (a, b) { return a + b; }, 0) / energy.length * 10) / 10 : null;
    return { start: start, days: days, tasks: tasks, busiest: busiest, busiestN: busiestN, jdays: jdays, topMood: topMood, avgEnergy: avgE, wins: wins, medMins: Math.round(medMins), medN: medN };
  }
  function letterHTML(s) {
    var parts = [];
    parts.push("<p>Dear " + esc(displayName()) + ",</p>");
    if (s.tasks > 0) {
      parts.push("<p>This week you finished <b>" + s.tasks + (s.tasks === 1 ? " task" : " tasks") + "</b>" +
        (s.busiestN > 1 ? ", with " + new Date(s.busiest + "T12:00:00").toLocaleDateString("en-IN", { weekday: "long" }) + " your biggest day (" + s.busiestN + " done)" : "") +
        ". Every one of those was a small promise you kept.</p>");
    } else {
      parts.push("<p>This week was quieter on the to-do front — and that's okay. Rest is part of the work too.</p>");
    }
    if (s.jdays > 0) {
      parts.push("<p>You made time for your mind on <b>" + s.jdays + " of 7 days</b>" +
        (s.topMood ? ", and you mostly felt <b>" + MOODS[s.topMood].label.toLowerCase() + "</b>" : "") +
        (s.avgEnergy ? (s.topMood ? " with" : ", with") + " an average energy of " + s.avgEnergy + "/10" : "") + ".</p>");
    } else {
      parts.push("<p>You didn't journal this week, and that's fine — the page will be here whenever you need it.</p>");
    }
    if (s.medN) {
      parts.push("<p>You sat in stillness <b>" + s.medN + (s.medN === 1 ? " time" : " times") + "</b> — <b>" + s.medMins + " minutes</b> of simply being. That's a real gift to yourself.</p>");
    }
    if (s.wins.length) {
      parts.push("<p>Some things you were quietly proud of:</p><ul>" +
        s.wins.slice(-3).map(function (w) { return "<li>" + esc(w) + "</li>"; }).join("") + "</ul>");
    }
    parts.push("<p>Whatever this week held, you showed up for it. I'm proud of you.</p>");
    parts.push('<p class="sign">— your journal</p>');
    return parts.join("");
  }
  function openLetter() {
    var start = weekStartISO();
    var s = weekStats(start);
    lsSet(KEYS.letterSeen, start);
    openModal(
      '<div class="mj-sheet-head"><span class="eyebrow">Your week · ' + prettyDate(start, { day: "numeric", month: "short" }) + ' – ' +
      prettyDate(addDaysISO(start, 6), { day: "numeric", month: "short" }) + '</span>' +
      '<button type="button" class="btn btn-icon btn-quiet" data-mj-close aria-label="Close">' + ICON.close + '</button></div>' +
      orb({ mood: "light", size: 64, cls: "orb-float" }) +
      '<div class="mj-letter" style="margin-top:16px">' + letterHTML(s) + '</div>',
      { sheet: true, label: "This week's letter" }
    );
  }
  function maybeAutoLetter() {
    // Sunday from 5pm: one gentle letter per week, if there was any activity.
    var now = new Date();
    if (now.getDay() !== 0 || now.getHours() < 17) return false;
    var start = weekStartISO();
    if (lsGet(KEYS.letterSeen) === start) return false;
    var s = weekStats(start);
    if (!s.tasks && !s.jdays && !s.medN) return false;
    setTimeout(openLetter, 1200);
    return true;
  }

  // ---------- a warm hello, once a day ----------
  // Picks the most personal true thing it can say (a comeback, a streak, yesterday's wins,
  // something from the Wins Jar), else a gentle line for the time of day.
  function helloMessage(gapDays) {
    var name = displayName();
    var hasName = !!getName();
    var nm = hasName ? ", " + name : "";
    var h = new Date().getHours();
    var today = localISO(), yesterday = addDaysISO(today, -1);
    var jToday = Object.keys(journalDay(today)).length > 0;
    var js = journalStreak() || (Object.keys(journalDay(yesterday)).length ? (function () { var n = 0, d = yesterday; while (Object.keys(journalDay(d)).length) { n++; d = addDaysISO(d, -1); } return n; })() : 0);
    var pt = plannerTotals();
    var mt = meditateTotals();
    var doneY = plannerDoneOn(yesterday).length;
    var wins = [];
    journalDates().forEach(function (d) { var g = journalDay(d).gratitude; if (g && g.win && g.win.trim()) wins.push({ text: g.win.trim(), d: d }); });
    var checkIn = { label: "Check in · 2 min", href: "journal.html#checkin" };
    var plan = { label: "Plan my day", href: "planner.html" };
    var sit = { label: "Sit for 3 minutes", href: "meditate.html" };
    var cta = !jToday ? checkIn : (pt.streak === 0 ? plan : sit);

    if (!hasAnyData()) {
      return { emoji: "🌱", mood: "good", title: "Welcome to your quiet corner" + nm + "!",
        text: "Start tiny — tell us how you feel today. It takes two minutes and there are no wrong answers.", cta: checkIn };
    }
    if (gapDays >= 3) {
      return { emoji: "👋", mood: "light", title: "Welcome back" + nm + "!",
        text: "No catching up, no guilt — today is a fresh page. Even one small check-in is a lovely restart. 🌿", cta: checkIn };
    }
    var personal = [];
    if (js >= 2) personal.push({ emoji: "🔥", mood: "joy", title: jToday ? js + "-day streak" + nm + "!" : "Day " + (js + 1) + " is waiting",
      text: jToday ? "You've shown up for yourself " + js + " days running" + nm + ". That's real, quiet strength." : "You've shown up " + js + " days running. Keep the little flame going today? 🕯️", cta: jToday ? sit : checkIn });
    if (mt.streak >= 2) personal.push({ emoji: "🧘", mood: "calm", title: mt.streak + " days of stillness",
      text: "You've sat " + mt.streak + " days in a row" + nm + ". Your calm is becoming a habit. ✨", cta: mt.didToday ? cta : sit });
    if (doneY >= 2) personal.push({ emoji: "✅", mood: "good", title: "Yesterday you finished " + doneY + " things",
      text: "That's " + doneY + " promises kept to yourself. Today's you is already ahead. 💪", cta: plan });
    if (wins.length >= 2) {
      var w = wins[(new Date().getDate()) % wins.length];
      personal.push({ emoji: "🫙", mood: "light", title: "A note from your Wins Jar",
        text: "“" + w.text + "” — you did that on " + prettyDate(w.d, { day: "numeric", month: "short" }) + ". Never forget it. 💛", cta: { label: "Open Wins Jar", href: "journal.html#wins" } });
    }
    if (pt.total >= 10 && pt.total % 10 < 3) personal.push({ emoji: "🏆", mood: "joy", title: pt.total + " tasks done so far",
      text: "Every one of them was something you said you'd do — and did. Proud of you" + nm + ". 🌟", cta: plan });

    var dow = new Date().getDay();
    var pool = [
      h < 12 ? { emoji: "☀️", title: "Good morning" + nm + "!", text: "One small, kind thing today is enough. The rest is a bonus. 🌼" }
        : h < 17 ? { emoji: "🌤️", title: "Hey" + nm + "!", text: "Halfway through the day — a two-minute pause can reset the whole afternoon. 🍵" }
          : { emoji: "🌙", title: "Good evening" + nm + "!", text: "Whatever today held, you made it here. Let's close the day gently. ✨" },
      dow === 1 ? { emoji: "🌱", title: "Happy Monday" + nm + "!", text: "A new week, a gentle start. No need to do it all — just the next small thing." } : null,
      dow === 5 ? { emoji: "🎉", title: "It's Friday" + nm + "!", text: "You carried a whole week. Notice one thing that went okay. 💛" } : null,
      dow === 0 || dow === 6 ? { emoji: "🛋️", title: "Weekend mode" + nm, text: "Rest is productive too. Your mind deserves a slow day. 🌿" } : null,
      { emoji: "🧠", title: "Little brain fact", text: "Naming a feeling — even just “anxious” — can make it a little quieter. Want to try? 🙂" },
      { emoji: "🐢", title: "Slow is still progress", text: "You don't have to be fast. You just have to keep coming back. And here you are. 🌿" },
      { emoji: "🌈", title: "Hi" + nm + "!", text: "Small steps, every day, add up to a whole different life. Let's take one. ✨" },
      { emoji: "💧", title: "Quick check", text: "Had some water? Taken a breath? Okay — now you're ready for anything. 😌" }
    ].filter(Boolean);

    var dayN = Math.floor(Date.now() / 86400000);
    // something true about *you* always beats a general line
    var pick = personal.length ? personal[dayN % personal.length] : pool[dayN % pool.length];
    pick.mood = pick.mood || ["good", "calm", "light", "okay"][dayN % 4];
    pick.cta = pick.cta || cta;
    return pick;
  }

  function showHello(m) {
    var old = document.getElementById("mj-hello");
    if (old) old.remove();
    var here = location.pathname.split("/").pop() || "index.html";
    var ctaHere = m.cta && m.cta.href.split("#")[0] === here && !m.cta.href.split("#")[1];
    var box = el("div", { id: "mj-hello", "class": "mj-hello", role: "status", "aria-live": "polite" },
      '<div class="mj-hello-orb">' + orb({ mood: m.mood, size: 52, cls: "orb-bounce" }) + '<span class="mj-hello-emoji" aria-hidden="true">' + m.emoji + '</span></div>' +
      '<div class="mj-hello-body"><b>' + esc(m.title) + '</b><p>' + esc(m.text) + '</p>' +
      (m.cta && !ctaHere ? '<a class="btn btn-primary btn-sm" href="' + m.cta.href + '">' + esc(m.cta.label) + '</a>' : '') + '</div>' +
      '<button type="button" class="mj-hello-x" aria-label="Close">' + ICON.close + '</button>' +
      '<span class="mj-hello-bar" aria-hidden="true"></span>');
    document.body.appendChild(box);
    var timer, left = 9000, started = Date.now();
    function hide() { clearTimeout(timer); box.classList.remove("show"); setTimeout(function () { box.remove(); }, 600); }
    function arm() { started = Date.now(); timer = setTimeout(hide, left); box.classList.remove("hold"); }
    box.querySelector(".mj-hello-x").onclick = hide;
    var a = box.querySelector("a"); if (a) a.addEventListener("click", hide);
    // hovering or touching it pauses the timer
    ["mouseenter", "focusin", "touchstart"].forEach(function (ev) { box.addEventListener(ev, function () { clearTimeout(timer); left -= Date.now() - started; box.classList.add("hold"); }, { passive: true }); });
    box.addEventListener("mouseleave", function () { if (left > 1500) arm(); else hide(); });
    requestAnimationFrame(function () { requestAnimationFrame(function () { box.classList.add("show"); }); });
    arm();
  }

  function maybeHello() {
    var today = localISO();
    var last = lsGet(KEYS.lastVisit);
    var gap = last ? Math.round((new Date(today + "T12:00:00") - new Date(last + "T12:00:00")) / 86400000) : 0;
    lsSet(KEYS.lastVisit, today);
    if (lsGet(KEYS.helloDay) === today) return false;
    var h = location.hash.slice(1);
    if (h && ["today", "home", "wins"].indexOf(h) === -1) return false; // deep link: they're on their way somewhere
    lsSet(KEYS.helloDay, today);
    setTimeout(function () { showHello(helloMessage(gap)); }, 900);
    return true;
  }

  // ---------- app shell ----------
  var NAV = [
    { id: "today", label: "Today", href: "journal.html#today", icon: ICON.sun },
    { id: "planner", label: "Planner", href: "planner.html", icon: ICON.cal },
    { id: "meditate", label: "Meditate", href: "meditate.html", icon: ICON.lotus },
    { id: "wins", label: "Wins Jar", href: "journal.html#wins", icon: ICON.jar }
  ];
  var activeNav = null;
  function setActiveNav(id) {
    activeNav = id;
    document.querySelectorAll("[data-nav]").forEach(function (a) {
      if (a.getAttribute("data-nav") === id) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
  }
  function avatarText() {
    var n = getName();
    return n ? esc(n.charAt(0).toUpperCase()) : ICON.you;
  }
  function refreshAvatar() {
    var a = document.getElementById("mj-you");
    if (a) a.innerHTML = avatarText() + '<span class="mj-dot"></span>';
    refreshNudge();
  }
  function buildShell() {
    var page = document.body.getAttribute("data-mj-page");
    var bar = el("header", { "class": "mj-appbar" },
      '<div class="mj-appbar-inner">' +
      '<a class="mj-brand" href="index.html">' + orb({ mood: "good", size: 34 }) + '<span>mind journal</span></a>' +
      '<nav class="mj-nav" aria-label="Main">' +
      NAV.map(function (n) { return '<a href="' + n.href + '" data-nav="' + n.id + '">' + n.label + '</a>'; }).join("") +
      '</nav>' +
      '<div class="mj-tools">' +
      '<button type="button" class="mj-tool" id="mj-sound" aria-pressed="false"><svg class="mj-wave" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/></svg><span class="mj-bars" aria-hidden="true"><i></i><i></i><i></i></span><span class="sr-only" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)">Calm sound</span></button>' +
      '<button type="button" class="mj-tool mj-avatar" id="mj-you" data-mj-settings aria-label="You and settings"></button>' +
      '</div></div>');
    document.body.insertBefore(bar, document.body.firstChild);

    var tabs = el("nav", { "class": "mj-tabbar", "aria-label": "Main" },
      NAV.map(function (n) {
        return '<a href="' + n.href + '" data-nav="' + n.id + '">' + n.icon + '<span class="tab-label">' + n.label + '</span></a>';
      }).join("") +
      '<button type="button" data-mj-settings>' + ICON.you + '<span class="tab-label">You</span></button>');
    document.body.appendChild(tabs);
    document.body.classList.add("has-tabbar");

    setActiveNav(page === "planner" || page === "meditate" ? page : (location.hash === "#wins" ? "wins" : "today"));
    refreshAvatar();
    refreshSoundBtn();
    document.getElementById("mj-sound").addEventListener("click", function () {
      if (playing) stopSound(); else startSound();
    });
    // keep the calm going between pages: resume on the first tap if it was playing
    if (ssGet("mj_sound_on") === "1") {
      var resume = function () {
        document.removeEventListener("pointerdown", resume, true);
        document.removeEventListener("keydown", resume, true);
        if (!playing) startSound();
      };
      document.addEventListener("pointerdown", resume, true);
      document.addEventListener("keydown", resume, true);
      var b = document.getElementById("mj-sound");
      b.title = "Tap anywhere to continue your calm sound";
    }
  }

  function boot() {
    if (!document.getElementById("toast")) document.body.appendChild(el("div", { id: "toast", "class": "toast", role: "status", "aria-live": "polite" }));
    if (document.body.hasAttribute("data-mj-page")) buildShell();

    overlay = el("div", { "class": "mj-overlay" });
    dialog = el("div", { "class": "mj-dialog", role: "dialog", "aria-modal": "true" });
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay || e.target.closest("[data-mj-close]")) closeModal();
    });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeModal(); });
    document.addEventListener("click", function (e) {
      if (e.target.closest("[data-mj-settings]")) openSettings();
      else if (e.target.closest("[data-mj-name]")) openNameDialog(false);
      else if (e.target.closest("[data-mj-letter]")) openLetter();
      else if (e.target.closest("[data-mj-support]")) { e.preventDefault(); openSupport(); }
    });

    if (window.matchMedia) {
      var mq = matchMedia("(prefers-color-scheme: dark)");
      if (mq.addEventListener) mq.addEventListener("change", applyTheme);
    }

    // offline support (skipped on the Vite dev server so it never caches dev files)
    if ("serviceWorker" in navigator && /^https?:/.test(location.protocol) && location.port !== "5173") {
      navigator.serviceWorker.register("sw.js").then(function (reg) {
        // An installed app (especially on iPhone) is resumed, not reloaded — so check
        // for a new version whenever it comes back to the screen.
        document.addEventListener("visibilitychange", function () {
          if (document.visibilityState === "visible") reg.update().catch(function () { });
        });
      }).catch(function () { });
      // A new version took over: reload once so the page and shared code match —
      // but never while someone is typing.
      var hadController = !!navigator.serviceWorker.controller, reloaded = false;
      navigator.serviceWorker.addEventListener("controllerchange", function () {
        if (!hadController || reloaded) { hadController = true; return; }
        var reload = function () {
          var a = document.activeElement;
          if (a && (a.tagName === "TEXTAREA" || a.tagName === "INPUT") && a.value) { setTimeout(reload, 4000); return; }
          if (document.querySelector(".mj-overlay.show")) { setTimeout(reload, 4000); return; }
          reloaded = true;
          location.reload();
        };
        reload();
      });
    }

    if (!document.body.hasAttribute("data-mj-page")) return;
    // first visit: say hello; otherwise maybe a milestone / Sunday letter
    if (!checkMilestones() && !maybeAutoLetter()) maybeHello();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  window.MJ = {
    keys: KEYS,
    localISO: localISO, addDaysISO: addDaysISO, weekStartISO: weekStartISO, prettyDate: prettyDate,
    getName: getName, displayName: displayName, withName: withName, greetingWord: greetingWord,
    onNameChange: function (fn) { on("name", fn); },
    onPrefsChange: function (fn) { on("prefs", fn); },
    prefs: prefs, setPref: setPref,
    MOODS: MOODS, orb: orb, icon: ICON,
    sound: {
      start: startSound, stop: stopSound, toggle: function () { if (playing) stopSound(); else startSound(); }, isPlaying: function () { return playing; },
      setScape: setScape, scape: function () { return soundState().scape; }, scapes: SCAPES, duck: duck
    },
    bell: bell,
    meditateKey: KEYS.meditate, meditateData: meditateData, meditateTotals: meditateTotals, meditatedOn: meditatedOn, medDay: medDay,
    chime: chime,
    setActiveNav: setActiveNav,
    openNameDialog: openNameDialog, openSettings: openSettings, openLetter: openLetter,
    toast: toast, celebrate: celebrate, checkMilestones: checkMilestones,
    journalDay: journalDay, journalDates: journalDates, journalStreak: journalStreak,
    plannerData: plannerData, plannerDoneOn: plannerDoneOn, plannerTotals: plannerTotals,
    weekStats: weekStats, esc: esc,
    openModal: function (h, o) { openModal(h, o); }, closeModal: function () { closeModal(); },
    afterSave: afterSave, openSupport: openSupport, supportHTML: SUPPORT_HTML,
    showReps: showReps, exportMarkdown: exportMarkdown,
    hello: function () { showHello(helloMessage(0)); },
    shouldShowIOSHint: shouldShowIOSHint, dismissIOSHint: dismissIOSHint,
    hasAnyData: hasAnyData, ls: { get: lsGet, set: lsSet, json: lsJSON },
    getTheme: getTheme, setTheme: setTheme,
    installHelp: installHelp,
    install: function () {
      if (!installEvt || isStandalone()) return false;
      installEvt.prompt();
      installEvt.userChoice.finally(function () { installEvt = null; });
      return true;
    }
  };
})();
