/*
 * Mind Journal — shared helpers used by planner.html and journal.html.
 *
 * Everything lives in this browser's localStorage. Nothing is sent anywhere,
 * so each person who opens the site gets their own private space.
 *
 *   MJ.getName() / MJ.displayName() / MJ.withName("Hi {name}")
 *   MJ.onNameChange(fn)        — re-render when the name changes (any tab)
 *   MJ.openSettings()          — name, theme, backup, share, install
 *   MJ.checkMilestones()       — celebrate streaks / totals once each
 *   MJ.openLetter()            — this week's letter
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
      meta.setAttribute("content", dark ? "#1b1a18" : "#f7f5f0");
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
    if (e.key === KEYS.name) emit("name");
    else if (e.key === KEYS.theme) applyTheme();
    else if (e.key === KEYS.prefs) emit("prefs");
  });

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

  // ---------- styles for shared UI ----------
  var CSS = [
    ".mj-topbar{display:flex;align-items:center;gap:6px;padding:0 24px;height:44px;background:var(--surface2);border-bottom:1px solid var(--border);font-family:Georgia,serif;font-size:13px;position:relative;z-index:101}",
    ".mj-topbar a{color:var(--text-soft);text-decoration:none;padding:6px 10px;border-radius:20px;white-space:nowrap}",
    ".mj-topbar a:hover{color:var(--text);background:var(--surface)}",
    ".mj-topbar a.active{color:var(--accent-strong,var(--accent));background:var(--surface);box-shadow:0 0 0 1px var(--border)}",
    ".mj-topbar .mj-home{margin-right:auto;padding-left:0;display:flex;align-items:center;gap:8px;color:var(--text)}",
    ".mj-topbar .mj-home:hover{background:none}",
    ".mj-topbar .mj-home img{width:22px;height:22px;border-radius:6px}",
    ".mj-gear{position:relative;background:none;border:1px solid var(--border);color:var(--text-soft);border-radius:20px;padding:5px 12px;font:inherit;cursor:pointer;margin-left:4px}",
    ".mj-gear:hover,.mj-gear:focus-visible{color:var(--text);border-color:var(--accent);outline:none}",
    ".mj-gear .mj-dot{position:absolute;top:2px;right:2px;width:8px;height:8px;border-radius:50%;background:var(--warm,#c8894a);display:none}",
    ".mj-gear.nudge .mj-dot{display:block}",
    "@media (max-width:600px){.mj-topbar{padding:0 12px}.mj-topbar .mj-home span{display:none}.mj-topbar a{padding:6px 8px}}",
    "@media print{.mj-topbar,.mj-overlay{display:none!important}}",
    ".mj-overlay{position:fixed;inset:0;background:rgba(20,18,16,.5);display:none;align-items:center;justify-content:center;padding:16px;z-index:1000}",
    ".mj-overlay.show{display:flex}",
    ".mj-dialog{background:var(--surface);color:var(--text);border-radius:var(--radius,14px);box-shadow:0 12px 40px rgba(0,0,0,.25);padding:28px;width:100%;max-width:440px;max-height:calc(100vh - 32px);overflow:auto;font-family:Georgia,serif;animation:mjIn .3s ease}",
    "@keyframes mjIn{from{transform:translateY(6px) scale(.98);opacity:.3}to{transform:none;opacity:1}}",
    ".mj-dialog.center{text-align:center}",
    ".mj-dialog h2{font-weight:normal;font-size:22px;margin:8px 0 6px}",
    ".mj-dialog p{color:var(--text-soft);font-size:14px;line-height:1.65;margin-bottom:14px}",
    ".mj-dialog .mj-big{font-size:40px;line-height:1}",
    ".mj-input{width:100%;padding:11px 14px;border:1.5px solid var(--border);border-radius:var(--radius-sm,8px);font:16px Georgia,serif;background:var(--bg);color:var(--text);outline:none}",
    ".mj-input:focus{border-color:var(--accent);background:var(--surface)}",
    ".mj-dialog.center .mj-input{text-align:center}",
    ".mj-actions{display:flex;gap:10px;justify-content:center;margin-top:18px;flex-wrap:wrap}",
    ".mj-btn{padding:10px 20px;border-radius:24px;font:14px Georgia,serif;cursor:pointer;border:1.5px solid var(--border);background:none;color:var(--text-soft);transition:all .2s}",
    ".mj-btn:hover{border-color:var(--accent);color:var(--accent-strong,var(--accent))}",
    ".mj-btn.primary{background:var(--accent);border-color:var(--accent);color:var(--on-accent,#fff)}",
    ".mj-btn.primary:hover{opacity:.9;color:var(--on-accent,#fff)}",
    ".mj-btn.small{padding:7px 14px;font-size:13px}",
    ".mj-set{border-top:1px solid var(--border);padding:16px 0}",
    ".mj-set:first-of-type{border-top:none;padding-top:4px}",
    ".mj-set h3{font-size:11px;letter-spacing:1px;text-transform:uppercase;color:var(--text-muted);font-weight:normal;margin-bottom:10px}",
    ".mj-set .mj-note{font-size:12.5px;color:var(--text-soft);line-height:1.55;margin:8px 0 0}",
    ".mj-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}",
    ".mj-row .mj-input{flex:1;min-width:140px}",
    ".mj-seg{display:inline-flex;border:1.5px solid var(--border);border-radius:24px;overflow:hidden}",
    ".mj-seg button{background:none;border:none;padding:8px 16px;font:13px Georgia,serif;color:var(--text-soft);cursor:pointer}",
    ".mj-seg button[aria-pressed=true]{background:var(--accent);color:var(--on-accent,#fff)}",
    ".mj-switch{display:flex;align-items:center;gap:10px;font-size:14px;color:var(--text);cursor:pointer}",
    ".mj-switch input{width:18px;height:18px;accent-color:var(--accent)}",
    ".mj-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}",
    ".mj-head h2{margin:0}",
    ".mj-x{background:none;border:none;font-size:20px;color:var(--text-muted);cursor:pointer;padding:4px 8px}",
    ".mj-letter{font-size:15px;line-height:1.8;color:var(--text)}",
    ".mj-letter p{color:var(--text);font-size:15px;margin-bottom:12px}",
    ".mj-letter ul{margin:0 0 12px 20px;color:var(--text-soft)}",
    ".mj-letter .sign{font-style:italic;color:var(--text-soft)}",
    "#mj-confetti{position:fixed;inset:0;pointer-events:none;z-index:1001}"
  ].join("\n");

  // ---------- DOM helpers ----------
  function el(tag, attrs, html) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    if (html != null) n.innerHTML = html;
    return n;
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function toast(msg, ms) {
    var t = document.getElementById("toast");
    if (!t) return;
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.classList.remove("show"); }, ms || 2400);
  }

  var overlay, dialog, lastFocus;
  function openModal(html, opts) {
    opts = opts || {};
    lastFocus = document.activeElement;
    dialog.className = "mj-dialog" + (opts.center ? " center" : "");
    dialog.innerHTML = html;
    overlay.classList.add("show");
    overlay._onClose = opts.onClose || null;
    setTimeout(function () {
      var f = dialog.querySelector("[autofocus]") || dialog.querySelector("input,button");
      if (f) { f.focus(); if (f.select) f.select(); }
    }, 30);
  }
  function closeModal() {
    if (!overlay.classList.contains("show")) return;
    overlay.classList.remove("show");
    var cb = overlay._onClose; overlay._onClose = null;
    if (cb) cb();
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  // ---------- name dialog ----------
  function openNameDialog(first) {
    openModal(
      '<div class="mj-big">' + (first ? "🌿" : "✎") + '</div>' +
      '<h2>' + (first ? "Welcome. What should I call you?" : "What should I call you?") + '</h2>' +
      '<p>' + (first
        ? "This space is yours — your name makes it feel that way. It's saved only on this device, never sent anywhere."
        : "Change it any time. It's saved only on this device and used by both the Planner and the Journal.") + '</p>' +
      '<input class="mj-input" id="mj-name-input" maxlength="30" placeholder="Your first name" autocomplete="given-name" autofocus value="' + esc(getName()) + '">' +
      '<div class="mj-actions">' +
      '<button type="button" class="mj-btn" data-mj-close>' + (first ? "Maybe later" : "Cancel") + '</button>' +
      '<button type="button" class="mj-btn primary" id="mj-name-save">' + (first ? "Let's begin" : "Save") + '</button>' +
      '</div>',
      { center: true, onClose: function () { lsSet(KEYS.nameAsked, "1"); } }
    );
    var input = document.getElementById("mj-name-input");
    function commit() {
      var n = input.value.replace(/\s+/g, " ").trim().slice(0, 30);
      var had = getName();
      if (n) lsSet(KEYS.name, n); else lsDel(KEYS.name);
      closeModal();
      emit("name");
      if (n && n !== had) toast((had ? "Got it — hi, " : "Lovely to meet you, ") + n + " 🌿", 2600);
      else if (!n && had) toast("Name cleared");
    }
    document.getElementById("mj-name-save").onclick = commit;
    input.addEventListener("keydown", function (e) { if (e.key === "Enter") commit(); });
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
    toast("Backup downloaded — keep it somewhere safe 💾", 3000);
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
    if (d === 0) return "Last backup: today ✓";
    return "Last backup: " + d + (d === 1 ? " day" : " days") + " ago.";
  }
  function refreshNudge() {
    var g = document.querySelector(".mj-gear");
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
      navigator.clipboard.writeText(text + "\n" + url).then(function () { toast("Link copied — paste it to your friend 💌", 3000); });
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
    if (isStandalone()) return "You're using the installed app ✓";
    if (installEvt) return "";
    if (/iphone|ipad|ipod/i.test(navigator.userAgent)) return "On iPhone: tap Share → “Add to Home Screen”.";
    if (!/^https?:/.test(location.protocol)) return "Install works once the site is deployed.";
    return "Use your browser menu → “Install app” / “Add to Home screen”.";
  }

  // ---------- settings ----------
  function openSettings() {
    var p = prefs();
    var theme = getTheme();
    var isPlanner = document.body.getAttribute("data-mj-page") === "planner";
    openModal(
      '<div class="mj-head"><h2>Settings</h2><button type="button" class="mj-x" data-mj-close aria-label="Close">✕</button></div>' +

      '<div class="mj-set"><h3>Your name</h3><div class="mj-row">' +
      '<input class="mj-input" id="mj-set-name" maxlength="30" placeholder="Your first name" value="' + esc(getName()) + '">' +
      '<button type="button" class="mj-btn small primary" id="mj-set-name-save">Save</button></div></div>' +

      '<div class="mj-set"><h3>Appearance</h3><div class="mj-seg" role="group" aria-label="Theme">' +
      ["auto", "light", "dark"].map(function (t) {
        return '<button type="button" data-theme-opt="' + t + '" aria-pressed="' + (theme === t) + '">' +
          (t === "auto" ? "Auto" : t === "light" ? "☀️ Light" : "🌙 Dark") + '</button>';
      }).join("") + '</div></div>' +

      '<div class="mj-set"><h3>Backup</h3><div class="mj-row">' +
      '<button type="button" class="mj-btn small primary" id="mj-export">Download backup</button>' +
      '<button type="button" class="mj-btn small" id="mj-import-btn">Restore from file</button>' +
      '<input type="file" id="mj-import" accept="application/json,.json" hidden></div>' +
      '<p class="mj-note">Your data lives only in this browser. ' + esc(backupStatus()) +
      ' A backup also lets you move everything to a new phone or laptop.</p></div>' +

      '<div class="mj-set"><h3>Share & install</h3><div class="mj-row">' +
      '<button type="button" class="mj-btn small primary" id="mj-share">💌 Share with a friend</button>' +
      '<button type="button" class="mj-btn small" id="mj-install"' + (installEvt && !isStandalone() ? "" : " hidden") + '>📲 Install app</button></div>' +
      '<p class="mj-note">Friends get their own private copy — nobody can see anyone else\'s entries. ' + esc(installHelp()) + '</p></div>' +

      '<div class="mj-set"><h3>A little extra</h3><div class="mj-row">' +
      '<button type="button" class="mj-btn small" id="mj-letter-btn">💌 This week\'s letter</button></div>' +
      (isPlanner ? '<label class="mj-switch" style="margin-top:12px"><input type="checkbox" id="mj-reps"' + (p.showReps === false ? "" : " checked") + '> Show the Interview Reps tab</label>' : "") +
      '</div>'
    );

    var nameIn = document.getElementById("mj-set-name");
    function saveName() {
      var n = nameIn.value.replace(/\s+/g, " ").trim().slice(0, 30);
      if (n) lsSet(KEYS.name, n); else lsDel(KEYS.name);
      emit("name");
      toast(n ? "Saved — hi, " + n + " 🌿" : "Name cleared");
    }
    document.getElementById("mj-set-name-save").onclick = saveName;
    nameIn.addEventListener("keydown", function (e) { if (e.key === "Enter") saveName(); });

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
    if (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    var c = el("canvas", { id: "mj-confetti" });
    document.body.appendChild(c);
    var ctx = c.getContext("2d");
    var W = c.width = innerWidth, H = c.height = innerHeight;
    var colors = ["#6b8f71", "#e8c98f", "#c8894a", "#8fb795", "#d98c8a", "#7b6fa0"];
    var bits = [];
    for (var i = 0; i < 140; i++) {
      bits.push({
        x: W / 2 + (Math.random() - 0.5) * 120, y: H * 0.35,
        vx: (Math.random() - 0.5) * 12, vy: -4 - Math.random() * 9,
        r: 3 + Math.random() * 4, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3,
        c: colors[i % colors.length]
      });
    }
    var start = performance.now();
    (function frame(t) {
      ctx.clearRect(0, 0, W, H);
      bits.forEach(function (b) {
        b.vy += 0.25; b.vx *= 0.99; b.x += b.vx; b.y += b.vy; b.rot += b.vr;
        ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.rot);
        ctx.fillStyle = b.c; ctx.fillRect(-b.r, -b.r / 2, b.r * 2, b.r);
        ctx.restore();
      });
      if (t - start < 2600) requestAnimationFrame(frame); else c.remove();
    })(start);
  }
  function celebrate(m) {
    openModal(
      '<div class="mj-big">' + m.emoji + '</div><h2>' + esc(withName(m.title)) + '</h2>' +
      '<p>' + esc(withName(m.message)) + '</p>' +
      '<div class="mj-actions"><button type="button" class="mj-btn primary" data-mj-close autofocus>Thank you 💚</button></div>',
      { center: true }
    );
    confetti();
  }

  var MILESTONES = [
    { kind: "tasks", at: [10, 25, 50, 100, 250, 500, 1000, 2000], emoji: "🎯",
      title: function (n) { return n + " tasks done!"; },
      message: function (n) { return "That's " + n + " times you did something you said you'd do, {name}. Promises kept to yourself add up — this is what that looks like."; } },
    { kind: "pstreak", at: [3, 7, 14, 30, 60, 100, 200, 365], emoji: "🔥",
      title: function (n) { return n + "-day planner streak"; },
      message: function (n) { return n + " days in a row of getting things done. That's not luck, {name} — that's you, showing up."; } },
    { kind: "jstreak", at: [3, 7, 14, 21, 30, 60, 100, 200, 365], emoji: "🌿",
      title: function (n) { return n + " days of showing up for yourself"; },
      message: function (n) { return n + " days in a row you made space for your mind, {name}. Be really proud of that."; } },
    { kind: "jdays", at: [10, 25, 50, 100, 200, 365], emoji: "📖",
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
      celebrate({ emoji: best.m.emoji, title: best.m.title(best.n), message: best.m.message(best.n) });
    }, 700);
    return true;
  }

  // ---------- weekly letter ----------
  var MOOD_WORDS = { heavy: "heavy", anxious: "anxious", flat: "flat", restless: "restless", okay: "okay", calm: "calm", good: "good", light: "light" };
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
        (s.topMood ? ", and you mostly felt <b>" + MOOD_WORDS[s.topMood] + "</b>" : "") +
        (s.avgEnergy ? (s.topMood ? " with" : ", with") + " an average energy of " + s.avgEnergy + "/10" : "") + ".</p>");
    } else {
      parts.push("<p>You didn't journal this week, and that's fine — the page will be here whenever you need it.</p>");
    }
    if (s.wins.length) {
      parts.push("<p>Some things you were quietly proud of:</p><ul>" +
        s.wins.slice(-3).map(function (w) { return "<li>" + esc(w) + "</li>"; }).join("") + "</ul>");
    }
    parts.push("<p>Whatever this week held, you showed up for it. I'm proud of you. 💚</p>");
    parts.push('<p class="sign">— your journal</p>');
    return parts.join("");
  }
  function openLetter() {
    var start = weekStartISO();
    var s = weekStats(start);
    lsSet(KEYS.letterSeen, start);
    openModal(
      '<div class="mj-head"><h2>Your week · ' + prettyDate(start, { day: "numeric", month: "short" }) + ' – ' +
      prettyDate(addDaysISO(start, 6), { day: "numeric", month: "short" }) + '</h2>' +
      '<button type="button" class="mj-x" data-mj-close aria-label="Close">✕</button></div>' +
      '<div class="mj-letter">' + letterHTML(s) + '</div>'
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
    setTimeout(openLetter, 900);
    return true;
  }

  // ---------- topbar + boot ----------
  function buildTopbar() {
    var page = document.body.getAttribute("data-mj-page");
    var bar = el("div", { "class": "mj-topbar" },
      '<a class="mj-home" href="index.html" title="Home"><img src="icons/icon-192.png" alt=""><span>mind journal</span></a>' +
      '<a href="planner.html"' + (page === "planner" ? ' class="active" aria-current="page"' : "") + '>Planner</a>' +
      '<a href="journal.html"' + (page === "journal" ? ' class="active" aria-current="page"' : "") + '>Journal</a>' +
      '<button type="button" class="mj-gear" data-mj-settings title="Settings" aria-label="Settings">⚙<span class="mj-dot"></span></button>');
    document.body.insertBefore(bar, document.body.firstChild);
  }

  function boot() {
    var style = el("style", null, CSS);
    document.head.appendChild(style);
    if (document.body.hasAttribute("data-mj-page")) buildTopbar();

    overlay = el("div", { "class": "mj-overlay", role: "dialog", "aria-modal": "true" });
    dialog = el("div", { "class": "mj-dialog" });
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay || e.target.closest("[data-mj-close]")) closeModal();
    });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeModal(); });
    document.addEventListener("click", function (e) {
      if (e.target.closest("[data-mj-settings]")) openSettings();
      if (e.target.closest("[data-mj-name]")) openNameDialog(false);
      if (e.target.closest("[data-mj-letter]")) openLetter();
    });
    refreshNudge();

    if (window.matchMedia) {
      var mq = matchMedia("(prefers-color-scheme: dark)");
      if (mq.addEventListener) mq.addEventListener("change", applyTheme);
    }

    // offline support (skipped on the Vite dev server so it never caches dev files)
    if ("serviceWorker" in navigator && /^https?:/.test(location.protocol) && location.port !== "5173") {
      navigator.serviceWorker.register("sw.js").catch(function () { });
    }

    // first visit: say hello; otherwise maybe a milestone / Sunday letter
    if (!getName() && !lsGet(KEYS.nameAsked)) openNameDialog(true);
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
    openNameDialog: openNameDialog, openSettings: openSettings, openLetter: openLetter,
    toast: toast, celebrate: celebrate, checkMilestones: checkMilestones,
    journalDay: journalDay, journalDates: journalDates, journalStreak: journalStreak,
    plannerData: plannerData, plannerDoneOn: plannerDoneOn, plannerTotals: plannerTotals,
    weekStats: weekStats, esc: esc
  };
})();
