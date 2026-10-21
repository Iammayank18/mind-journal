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
    planner: "plannerData_v2"
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
      '<h2>' + (first ? "Hi there. What should I call you?" : "What should I call you?") + '</h2>' +
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
  function hasAnyData() { return !!plannerData() || journalDates().length > 0; }
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
    g.classList.toggle("nudge", hasAnyData() && (d === null || d >= 14));
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
      '<input type="file" id="mj-import" accept="application/json,.json" hidden></div>' +
      '<p class="hint">Your data lives only in this browser. ' + esc(backupStatus()) +
      ' A backup also moves everything to a new phone or laptop.</p></div>' +

      '<div class="mj-set"><h3>Share &amp; install</h3><div class="row row-wrap">' +
      '<button type="button" class="btn btn-primary btn-sm" id="mj-share">Share with a friend</button>' +
      '<button type="button" class="btn btn-soft btn-sm" id="mj-install"' + (installEvt && !isStandalone() ? "" : " hidden") + '>Install app</button></div>' +
      '<p class="hint">Friends get their own private space — nobody can see anyone else\'s entries. ' + esc(installHelp()) + '</p></div>' +

      '<div class="mj-set"><h3>A little extra</h3>' +
      '<button type="button" class="btn btn-soft btn-sm" id="mj-letter-btn">Read this week\'s letter</button>' +
      (isPlanner ? '<label class="mj-switch" style="margin-top:12px">Show the Interview Reps tab<input type="checkbox" id="mj-reps"' + (p.showReps === false ? "" : " checked") + '></label>' : "") +
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
    { kind: "jdays", at: [10, 25, 50, 100, 200, 365], mood: "light",
      title: function (n) { return n + " journal days"; },
      message: function (n) { return "You've written on " + n + " different days, {name}. That's a whole story of you looking after yourself."; } }
  ];
  function checkMilestones() {
    var p = plannerTotals();
    var values = { tasks: p.total, pstreak: p.streak, jstreak: journalStreak(), jdays: journalDates().length };
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
    var tasks = 0, busiest = null, busiestN = 0, jdays = 0, moods = {}, energy = [], wins = [];
    days.forEach(function (d) {
      var n = (log[d] || []).length;
      tasks += n;
      if (n > busiestN) { busiestN = n; busiest = d; }
      var j = journalDay(d);
      if (Object.keys(j).length) jdays++;
      if (j.checkin && j.checkin.mood) moods[j.checkin.mood] = (moods[j.checkin.mood] || 0) + 1;
      if (j.checkin && j.checkin.energy) energy.push(+j.checkin.energy);
      if (j.gratitude && j.gratitude.win && j.gratitude.win.trim()) wins.push(j.gratitude.win.trim());
    });
    var ranked = Object.keys(moods).sort(function (a, b) { return moods[b] - moods[a]; });
    // only say "mostly felt X" when X clearly came up most
    var topMood = ranked.length && moods[ranked[0]] >= 2 && (ranked.length === 1 || moods[ranked[0]] > moods[ranked[1]]) ? ranked[0] : null;
    var avgE = energy.length ? Math.round(energy.reduce(function (a, b) { return a + b; }, 0) / energy.length * 10) / 10 : null;
    return { start: start, days: days, tasks: tasks, busiest: busiest, busiestN: busiestN, jdays: jdays, topMood: topMood, avgEnergy: avgE, wins: wins };
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
    if (!s.tasks && !s.jdays) return false;
    setTimeout(openLetter, 1200);
    return true;
  }

  // ---------- app shell ----------
  var NAV = [
    { id: "today", label: "Today", href: "journal.html#today", icon: ICON.sun },
    { id: "planner", label: "Planner", href: "planner.html", icon: ICON.cal },
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
        return '<a href="' + n.href + '" data-nav="' + n.id + '">' + n.icon + '<span class="tab-label">' + n.label.replace(" Jar", "") + '</span></a>';
      }).join("") +
      '<button type="button" data-mj-settings>' + ICON.you + '<span class="tab-label">You</span></button>');
    document.body.appendChild(tabs);
    document.body.classList.add("has-tabbar");

    setActiveNav(page === "planner" ? "planner" : (location.hash === "#wins" ? "wins" : "today"));
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
    });

    if (window.matchMedia) {
      var mq = matchMedia("(prefers-color-scheme: dark)");
      if (mq.addEventListener) mq.addEventListener("change", applyTheme);
    }

    // offline support (skipped on the Vite dev server so it never caches dev files)
    if ("serviceWorker" in navigator && /^https?:/.test(location.protocol) && location.port !== "5173") {
      navigator.serviceWorker.register("sw.js").catch(function () { });
    }

    if (!document.body.hasAttribute("data-mj-page")) return;
    // first visit: say hello; otherwise maybe a milestone / Sunday letter
    if (!getName() && !lsGet(KEYS.nameAsked)) setTimeout(function () { openNameDialog(true); }, 600);
    else if (!checkMilestones()) maybeAutoLetter();
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
    sound: { start: startSound, stop: stopSound, toggle: function () { if (playing) stopSound(); else startSound(); }, isPlaying: function () { return playing; } },
    chime: chime,
    setActiveNav: setActiveNav,
    openNameDialog: openNameDialog, openSettings: openSettings, openLetter: openLetter,
    toast: toast, celebrate: celebrate, checkMilestones: checkMilestones,
    journalDay: journalDay, journalDates: journalDates, journalStreak: journalStreak,
    plannerData: plannerData, plannerDoneOn: plannerDoneOn, plannerTotals: plannerTotals,
    weekStats: weekStats, esc: esc,
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
