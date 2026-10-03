/* PaceBand
   All state lives in the URL query string, so a link carries the whole sheet.
   Internally everything is stored in kilometres and seconds per kilometre; the chosen
   unit only changes what is displayed and typed. */
(() => {
  'use strict';

  const KM_PER_MI = 1.609344;
  const DASH = '—';
  const MAX_CHECKPOINTS = 300;
  const HALF = { label: 'Half marathon', km: 21.0975 };
  const FULL = { label: 'Marathon', km: 42.195 };
  const PRESETS_KM = [{ label: '5K', km: 5 }, { label: '10K', km: 10 }, HALF, FULL];
  const PRESETS_MI = [{ label: '5 mi', km: 5 * KM_PER_MI }, { label: '10 mi', km: 10 * KM_PER_MI }, HALF, FULL];
  // Round numbers for each unit: switching units from the defaults lands on these.
  const DEFAULTS = {
    km: { paceSec: 330, intervalKm: 5 },
    mi: { paceSec: 540 / KM_PER_MI, intervalKm: KM_PER_MI }
  };
  const presets = () => (S.unit === 'mi' ? PRESETS_MI : PRESETS_KM);
  const near = (a, b) => Math.abs(a - b) < 1e-6;

  let uid = 1;
  let interacted = false; // the address bar stays clean until the first change

  // Defaults: half marathon, 5:30 /km, 09:00 start, a checkpoint every 5 km.
  // The slow pace is off until the user adds it.
  const S = {
    unit: 'km',
    paceSec: 330,
    paceSec2: null,
    range: false,
    paceOk: true,
    slowFmtOk: true,
    paceOk2: false,
    start: '09:00',
    totalKm: 21.0975,
    intervalKm: 5,
    cps: null,
    live: false // follow the clock of the day; never stored in the URL
  };

  const $ = (id) => document.getElementById(id);
  const pad = (n) => String(n).padStart(2, '0');
  const f = () => (S.unit === 'km' ? 1 : KM_PER_MI);
  const U = () => S.unit;
  const fmtNum = (x, dp) => String(parseFloat(x.toFixed(dp)));
  const round5 = (x) => Math.round(x * 1e5) / 1e5;
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const hms = (s) => Math.floor(s / 3600) + ':' + pad(Math.floor((s % 3600) / 60)) + ':' + pad(s % 60);
  const fmtPace = (sec) => { const r = Math.round(sec); return Math.floor(r / 60) + ':' + pad(r % 60); };
  const autoLabel = (km) => fmtNum(km / f(), 2) + ' ' + U();
  const sortByKm = (a, b) => a.km - b.km;
  const validPace = (sec) => sec >= 60 && sec <= 1800;

  function parseNum(s) {
    s = String(s == null ? '' : s).trim().replace(',', '.');
    if (!/^(\d+(\.\d+)?|\.\d+)$/.test(s)) return NaN;
    return parseFloat(s);
  }
  function parsePace(s) {
    s = String(s == null ? '' : s).trim();
    const m = /^(\d{1,2}):([0-5]?\d)?$/.exec(s); // "5:" is 5:00 while typing
    if (m) return (+m[1]) * 60 + (+(m[2] || 0));
    if (/^\d{1,2}$/.test(s)) return (+s) * 60;
    // Phone number pads have no colon: "530" means 5:30.
    const d = /^(\d{1,2})([0-5]\d)$/.exec(s);
    if (d) return (+d[1]) * 60 + (+d[2]);
    return NaN;
  }
  function startSec() {
    const m = /^(\d\d):(\d\d)$/.exec(S.start);
    return m ? (+m[1]) * 3600 + (+m[2]) * 60 : null;
  }
  function clockHtml(s) {
    const ss = startSec();
    if (ss == null || s == null) return DASH;
    const t = ss + s, d = Math.floor(t / 86400), x = t - d * 86400;
    const o = pad(Math.floor(x / 3600)) + ':' + pad(Math.floor((x % 3600) / 60)) + ':' + pad(x % 60);
    return d > 0 ? o + ' <small>+' + d + 'd</small>' : o;
  }
  const T = (km) => (S.paceOk ? Math.round(km * S.paceSec) : null);
  const T2 = (km) => (S.range && S.paceOk2 ? Math.round(km * S.paceSec2) : null);

  function build() {
    const step = S.intervalKm, out = [];
    for (let i = 1; i * step < S.totalKm - 1e-6 && i <= 200; i++) {
      out.push({ id: uid++, name: null, km: round5(i * step) });
    }
    S.cps = out;
  }

  /* ---------- URL state ---------- */

  function stateQuery() {
    const p = new URLSearchParams();
    p.set('u', S.unit);
    p.set('d', String(round5(S.totalKm)));
    p.set('p', fmtPace(S.paceSec * f()));
    if (S.range && S.paceSec2 != null) p.set('p2', fmtPace(S.paceSec2 * f()));
    p.set('s', S.start ? S.start.replace(':', '') : '');
    p.set('i', String(round5(S.intervalKm)));
    const ord = S.cps.slice().sort(sortByKm);
    if (!ord.length) p.append('c', '');
    ord.forEach((c) => p.append('c', round5(c.km) + (c.name ? '|' + c.name : '')));
    return p.toString().replace(/%3A/g, ':').replace(/%7C/g, '|');
  }
  function shareUrl() {
    return location.href.split(/[?#]/)[0] + '?' + stateQuery();
  }
  let urlTimer = 0;
  function syncUrl() {
    if (!interacted) return;
    clearTimeout(urlTimer);
    urlTimer = setTimeout(() => {
      try { history.replaceState(null, '', location.pathname + '?' + stateQuery()); } catch (e) { /* not allowed here; the share button still works */ }
    }, 250);
  }

  // Everything read from the URL is untrusted: validate it, never trust it as markup.
  function loadFromUrl() {
    let q;
    try { q = new URLSearchParams(location.search); } catch (e) { return; }
    if (q.get('u') === 'mi') S.unit = 'mi';
    const d = parseNum(q.get('d'));
    if (d > 0 && d <= 1000) S.totalKm = d;
    const p = parsePace(q.get('p'));
    if (validPace(p)) S.paceSec = p / f();
    if (q.has('p2')) {
      const b = parsePace(q.get('p2'));
      if (validPace(b)) { S.paceSec2 = b / f(); S.range = true; }
    }
    const s = (q.get('s') || '').replace(':', '');
    if (/^\d{4}$/.test(s) && +s.slice(0, 2) < 24 && +s.slice(2) < 60) S.start = s.slice(0, 2) + ':' + s.slice(2);
    const i = parseNum(q.get('i'));
    if (i > 0 && i <= 1000) S.intervalKm = i;
    if (q.has('c')) {
      S.cps = q.getAll('c').slice(0, MAX_CHECKPOINTS).map((v) => {
        const k = v.indexOf('|');
        const km = parseNum(k < 0 ? v : v.slice(0, k));
        const name = k < 0 ? '' : v.slice(k + 1).trim().slice(0, 40);
        return { id: uid++, name: name || null, km };
      }).filter((c) => c.km > 0 && c.km <= 1000);
    }
  }

  /* ---------- Inputs ---------- */

  function raceName() {
    const all = PRESETS_KM.concat(PRESETS_MI);
    for (let i = 0; i < all.length; i++) if (near(all[i].km, S.totalKm)) return all[i].label;
    return fmtNum(S.totalKm / f(), 2) + ' ' + U();
  }

  function validate() {
    const el = $('pace2-err');
    if (!S.range) { S.paceOk2 = false; el.textContent = ''; $('pace2').classList.remove('bad'); return; }
    let msg = '';
    if (!S.slowFmtOk) msg = 'Use minutes and seconds, for example 7:30 or 730.';
    else if (!(S.paceSec2 > S.paceSec)) msg = 'The slow pace must be slower than the fast pace.';
    S.paceOk2 = !msg;
    el.textContent = msg;
    $('pace2').classList.toggle('bad', !!msg);
  }

  function syncPresets() {
    $('presets').innerHTML = presets().map((p, i) => '<button class="chip" type="button" data-i="' + i + '" aria-pressed="' + near(p.km, S.totalKm) + '">' + p.label + '</button>').join('');
  }

  function syncInputs() {
    $('dist').value = fmtNum(S.totalKm / f(), 4);
    $('pace').value = fmtPace(S.paceSec * f());
    if (S.paceSec2 != null) $('pace2').value = fmtPace(S.paceSec2 * f());
    $('interval').value = fmtNum(S.intervalKm / f(), 2);
    $('start').value = S.start;
    document.querySelectorAll('.unit-lbl').forEach((e) => { e.textContent = U(); });
    document.querySelectorAll('#units button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.unit === S.unit)));
    syncPresets();
    ['dist', 'pace', 'interval'].forEach((id) => $(id).classList.remove('bad'));
    $('dist-err').textContent = '';
    $('pace-err').textContent = '';
    $('int-err').textContent = '';
    S.paceOk = true;
    S.slowFmtOk = true;
    // range-dependent bits
    $('pace-lbl').textContent = S.range ? 'Fast pace' : 'Pace';
    $('pace2-wrap').hidden = !S.range;
    $('range-toggle').textContent = S.range ? 'Use a single pace' : 'Add a slower pace';
    $('range-hint').hidden = S.range;
    $('hb2').hidden = !S.range;
    $('hero').classList.toggle('range', S.range);
    $('sheet').classList.toggle('range', S.range);
    validate();
  }

  /* ---------- Rows ---------- */

  const TIMES =
    '<div class="times">' +
    '<div class="t p-split" data-l="Split" data-lr="Split"></div>' +
    '<div class="t p-race" data-l="Race time" data-lr="Fast"></div>' +
    '<div class="t p-clock" data-l="Time of day" data-lr=""></div>' +
    '<div class="t p-race2" data-l="Slow · race time" data-lr="Slow"></div>' +
    '<div class="t p-clock2" data-l="Slow · time of day" data-lr=""></div>' +
    '</div>';

  function rowStart() {
    return '<div class="row fixed" data-id="start"><div class="static p-dist">Start</div><span class="p-rm"></span>' + TIMES + '</div>';
  }
  function rowFinish() {
    return '<div class="row fixed" data-id="fin"><div class="static p-dist">Finish <span class="u">' + fmtNum(S.totalKm / f(), 2) + ' ' + U() + '</span></div><span class="p-rm"></span>' + TIMES + '</div>';
  }
  function rowCp(c, over) {
    return '<div class="row' + (over ? ' over' : '') + '" data-id="' + c.id + '">' +
      '<div class="c-dist p-dist"><label class="sr" for="d' + c.id + '">Checkpoint distance in ' + U() + '</label>' +
      '<input id="d' + c.id + '" class="ds" type="text" inputmode="decimal" enterkeyhint="done" autocomplete="off" value="' + fmtNum(c.km / f(), 3) + '"><span class="u">' + U() + '</span></div>' +
      '<button class="rm p-rm" type="button" aria-label="Remove checkpoint" title="Remove">&times;</button>' +
      TIMES + '</div>';
  }
  function headHtml() {
    if (S.range) {
      return '<div class="ghead"><span class="g g1" id="g1">Fast</span><span class="g g2" id="g2">Slow</span></div>' +
        '<div class="head"><span class="p-dist">Checkpoint</span>' +
        '<span class="num p-race">Race time</span><span class="num p-clock">Time of day</span>' +
        '<span class="num p-race2">Race time</span><span class="num p-clock2">Time of day</span><span class="p-rm"></span></div>';
    }
    return '<div class="head"><span class="p-dist">Checkpoint</span>' +
      '<span class="num p-split">Split</span><span class="num p-race">Race time</span><span class="num p-clock">Time of day</span><span class="p-rm"></span></div>';
  }

  function domOrder() {
    return {
      ord: S.cps.filter((c) => c.km < S.totalKm - 1e-9).sort(sortByKm),
      over: S.cps.filter((c) => c.km >= S.totalKm - 1e-9).sort(sortByKm)
    };
  }
  function render() {
    const o = domOrder();
    $('head').innerHTML = headHtml();
    $('rows').innerHTML = rowStart() + o.ord.map((c) => rowCp(c, false)).join('') + rowFinish() + o.over.map((c) => rowCp(c, true)).join('');
    update();
  }

  function setT(r, cls, v, isClock) {
    r.querySelector(cls).innerHTML = v == null ? DASH : (isClock ? clockHtml(v) : hms(v));
  }
  function fill(r, sp, ra, ra2) {
    setT(r, '.p-split', sp);
    setT(r, '.p-race', ra);
    setT(r, '.p-clock', ra, true);
    setT(r, '.p-race2', ra2);
    setT(r, '.p-clock2', ra2, true);
  }

  function update() {
    const ord = S.cps.filter((c) => c.km < S.totalKm - 1e-9).sort(sortByKm);
    const prev = new Map();
    let p = 0;
    ord.forEach((c) => { prev.set(c.id, p); p = c.km; });
    const rows = $('rows').children;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i], id = r.dataset.id;
      if (id === 'start') {
        fill(r, null, S.paceOk ? 0 : null, T2(0));
      } else if (id === 'fin') {
        fill(r, S.paceOk ? T(S.totalKm) - T(p) : null, T(S.totalKm), T2(S.totalKm));
      } else {
        const c = S.cps.find((x) => String(x.id) === id);
        if (!c) continue;
        if (prev.has(c.id)) {
          fill(r, S.paceOk ? T(c.km) - T(prev.get(c.id)) : null, T(c.km), T2(c.km));
        } else {
          fill(r, null, null, null);
          r.querySelector('.p-race').innerHTML = '<em>After finish</em>';
        }
      }
    }
    summary();
    strip();
    live();
    syncUrl();
  }

  function heroFill(prefix, paceSec, ok, label) {
    const fin = ok ? Math.round(S.totalKm * paceSec) : null;
    $(prefix + 'race').textContent = label;
    $(prefix + 'time').textContent = ok ? hms(fin) : '–:––:––';
    $(prefix + 'clock').innerHTML = ok ? clockHtml(fin) : DASH;
    $(prefix + 'pace').textContent = ok ? fmtPace(paceSec * f()) + ' /' + U() : DASH;
    $(prefix + 'speed').textContent = ok ? (3600 / (paceSec * f())).toFixed(1) + (S.unit === 'km' ? ' km/h' : ' mph') : DASH;
  }
  function summary() {
    if (S.range) {
      heroFill('h-', S.paceSec, S.paceOk, 'Fast · ' + raceName());
      heroFill('h2-', S.paceSec2, S.paceOk2, 'Slow · ' + raceName());
      const g1 = $('g1'), g2 = $('g2');
      if (g1) g1.textContent = 'Fast' + (S.paceOk ? ' · ' + fmtPace(S.paceSec * f()) + ' /' + U() : '');
      if (g2) g2.textContent = 'Slow' + (S.paceOk2 ? ' · ' + fmtPace(S.paceSec2 * f()) + ' /' + U() : '');
    } else {
      heroFill('h-', S.paceSec, S.paceOk, raceName() + ' · expected finish');
    }
  }

  function strip() {
    const el = $('strip');
    el.textContent = '';
    const add = (cls, x, text) => {
      const s = document.createElement('span');
      s.className = cls;
      s.style.left = x + '%';
      s.dataset.x = x;
      if (text != null) s.textContent = text;
      el.appendChild(s);
    };
    const rail = document.createElement('div');
    rail.className = 'rail';
    el.appendChild(rail);
    add('tick', 0);
    add('tl', 0, 'Start');
    let last = 0;
    S.cps.filter((c) => c.km > 0 && c.km < S.totalKm - 1e-9).sort(sortByKm).forEach((c) => {
      const x = (c.km / S.totalKm) * 100;
      add('tick', x);
      if (x - last >= 9 && 100 - x >= 12) { last = x; add('tl', x, fmtNum(c.km / f(), 2)); }
    });
    add('tick end', 100);
    add('tl', 100, fmtNum(S.totalKm / f(), 2) + ' ' + U());
  }

  /* ---------- Live ---------- */

  // Seconds since the gun, by the device clock. A start more than 12 h ago is read as yesterday's.
  function elapsedNow() {
    const ss = startSec();
    if (ss == null) return null;
    const d = new Date();
    let e = d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds() - ss;
    if (e < -12 * 3600) e += 86400;
    return e;
  }

  function live() {
    const rows = $('rows').children, el = $('strip'), card = $('live-card');
    for (let i = 0; i < rows.length; i++) rows[i].classList.remove('passed', 'passed-fast');
    el.querySelectorAll('.cursor').forEach((n) => n.remove());
    el.querySelectorAll('.tick.done').forEach((n) => n.classList.remove('done'));
    const e = S.live ? elapsedNow() : null;
    card.hidden = e == null;
    if (e == null) return;
    const paces = [{ sec: S.paceSec, ok: S.paceOk, cls: 'cursor' }];
    if (S.range) paces.push({ sec: S.paceSec2, ok: S.paceOk2, cls: 'cursor slow' });
    const ready = paces.filter((p) => p.ok);
    if (!ready.length) return;

    paces.forEach((p) => {
      if (!p.ok) return;
      const x = Math.min(1, Math.max(0, e / (S.totalKm * p.sec))) * 100;
      const c = document.createElement('span');
      c.className = p.cls;
      c.style.left = x + '%';
      el.appendChild(c);
    });
    const slowest = ready[ready.length - 1];
    const passedAt = (km, p) => e >= 0 && e >= Math.round(km * p.sec);
    const mark = (row, km) => {
      const n = ready.filter((p) => passedAt(km, p)).length;
      if (n === ready.length) row.classList.add('passed');
      else if (n > 0) row.classList.add('passed-fast');
    };
    for (let i = 0; i < rows.length; i++) {
      const id = rows[i].dataset.id;
      if (id === 'start') mark(rows[i], 0);
      else if (id === 'fin') mark(rows[i], S.totalKm);
      else {
        const c = S.cps.find((x) => String(x.id) === id);
        if (c && c.km < S.totalKm - 1e-9) mark(rows[i], c.km);
      }
    }
    el.querySelectorAll('.tick').forEach((t) => { if (e >= 0 && e >= Math.round(S.totalKm * (+t.dataset.x / 100) * slowest.sec)) t.classList.add('done'); });

    // Card: elapsed clock on top, then one column per pace with its position and next checkpoint.
    const finishSec = Math.round(S.totalKm * slowest.sec);
    $('lv-el-l').textContent = e < 0 ? 'Starts in' : e >= finishSec ? 'Finished' : 'Elapsed';
    $('lv-el').textContent = hms(Math.abs(e));
    const stops = domOrder().ord.map((c) => c.km).concat([S.totalKm]);
    const col = (id, name, p) => {
      const root = $(id);
      root.hidden = !p || !p.ok;
      if (root.hidden) return;
      const km = Math.min(S.totalKm, Math.max(0, e / p.sec));
      const nx = stops.find((s) => s > km + 1e-9);
      $(id + '-l').textContent = name + ' · ' + fmtPace(p.sec * f()) + ' /' + U();
      $(id + '-pos').textContent = fmtNum(km / f(), 2) + ' ' + U();
      $(id + '-next').innerHTML = nx == null ? 'Finished' :
        'Next <b>' + (nx === S.totalKm ? 'finish ' : '') + fmtNum(nx / f(), 2) + ' ' + U() + '</b> in <b>' + hms(Math.max(0, Math.round(nx * p.sec) - Math.max(0, e))) + '</b>';
    };
    col('lv1', S.range ? 'Fast' : 'Pace', paces[0]);
    col('lv2', 'Slow', S.range ? paces[1] : null);
  }
  let liveTimer = 0;
  $('live').addEventListener('click', function () {
    S.live = !S.live;
    this.setAttribute('aria-pressed', String(S.live));
    clearInterval(liveTimer);
    if (S.live) liveTimer = setInterval(live, 1000);
    live();
  });
  document.addEventListener('visibilitychange', () => { if (S.live) live(); });

  // Stacked cards when the results column is too narrow for the table.
  function layout() {
    const w = $('results').getBoundingClientRect().width;
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    $('sheet').classList.toggle('stacked', w < (S.range ? 47 : 40) * rem);
  }

  function findCp(el) {
    const row = el.closest('.row');
    if (!row) return null;
    return S.cps.find((c) => String(c.id) === row.dataset.id) || null;
  }

  /* ---------- Events ---------- */

  ['input', 'change', 'click'].forEach((ev) => document.addEventListener(ev, () => { interacted = true; }, true));

  $('presets').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    S.totalKm = presets()[+b.dataset.i].km;
    syncInputs(); build(); render();
  });
  $('units').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || b.dataset.unit === S.unit) return;
    const from = S.unit, to = b.dataset.unit;
    // Still on the old unit's defaults? Move to the new unit's round numbers.
    const snap = (list, other) => { const i = list.findIndex((p) => near(p.km, S.totalKm)); if (i >= 0) S.totalKm = other[i].km; };
    snap(from === 'mi' ? PRESETS_MI : PRESETS_KM, to === 'mi' ? PRESETS_MI : PRESETS_KM);
    if (near(S.paceSec, DEFAULTS[from].paceSec)) S.paceSec = DEFAULTS[to].paceSec;
    if (S.paceSec2 != null && near(S.paceSec2, DEFAULTS[from].paceSec + 30 / (from === 'mi' ? KM_PER_MI : 1))) S.paceSec2 = DEFAULTS[to].paceSec + 30 / (to === 'mi' ? KM_PER_MI : 1);
    if (near(S.intervalKm, DEFAULTS[from].intervalKm)) {
      S.intervalKm = DEFAULTS[to].intervalKm;
      build();
    }
    S.unit = to;
    syncInputs(); render();
  });
  $('dist').addEventListener('input', (e) => {
    const el = e.target;
    const v = parseNum(el.value) * f();
    if (!(v > 0 && v <= 1000)) { el.classList.add('bad'); $('dist-err').textContent = 'Enter a distance greater than 0.'; return; }
    el.classList.remove('bad');
    $('dist-err').textContent = '';
    S.totalKm = v;
    syncPresets();
    render();
  });
  // Bank-card style mask: digits in, "m:ss" out, with the colon added as you type.
  // A leading 1 means two-digit minutes (10:00 and up); any other digit is a single minute digit.
  function maskPace(raw, deleting) {
    const d = raw.replace(/\D/g, '').replace(/^0+/, '').slice(0, 4);
    const m = d[0] === '1' ? 2 : 1;
    if (d.length < m) return d;
    if (d.length === m) return deleting ? d : d + ':';
    let sec = d.slice(m);
    if (sec.length === 1 && sec > '5') sec = '0' + sec; // 5:7 can only mean 5:07
    return d.slice(0, m) + ':' + sec;
  }
  ['pace', 'pace2'].forEach((id) => $(id).addEventListener('input', (e) => {
    const el = e.target, v = maskPace(el.value, /^delete/.test(e.inputType || ''));
    if (v !== el.value) el.value = v;
  }));

  $('pace').addEventListener('input', (e) => {
    const sec = parsePace(e.target.value);
    S.paceOk = validPace(sec);
    if (S.paceOk) S.paceSec = sec / f();
    e.target.classList.toggle('bad', !S.paceOk);
    $('pace-err').textContent = S.paceOk ? '' : 'Use minutes and seconds, for example 5:30 or 530.';
    validate();
    update();
  });
  // Tidy "530" into "5:30" once the user leaves the field.
  ['pace', 'pace2'].forEach((id) => $(id).addEventListener('change', (e) => {
    const sec = parsePace(e.target.value);
    if (validPace(sec)) e.target.value = fmtPace(sec);
  }));
  $('pace2').addEventListener('input', (e) => {
    const sec = parsePace(e.target.value);
    S.slowFmtOk = validPace(sec);
    if (S.slowFmtOk) S.paceSec2 = sec / f();
    validate();
    update();
  });
  $('range-toggle').addEventListener('click', () => {
    S.range = !S.range;
    if (S.range && S.paceSec2 == null) S.paceSec2 = S.paceSec + 30 / f(); // 30 s slower per unit to start from
    syncInputs();
    render();
    layout();
  });
  $('start').addEventListener('input', (e) => { S.start = e.target.value; update(); });
  $('rebuild').addEventListener('click', () => {
    const v = parseNum($('interval').value) * f();
    if (!(v > 0) || S.totalKm / v > 200) {
      $('interval').classList.add('bad');
      $('int-err').textContent = v > 0 ? 'That would create more than 200 checkpoints.' : 'Enter a spacing greater than 0.';
      return;
    }
    $('interval').classList.remove('bad');
    $('int-err').textContent = '';
    S.intervalKm = v;
    build(); render();
  });
  $('add').addEventListener('click', () => {
    if (S.cps.length >= MAX_CHECKPOINTS) return;
    const ord = S.cps.filter((c) => c.km < S.totalKm - 1e-9).sort(sortByKm);
    const last = ord.length ? ord[ord.length - 1].km : 0;
    let km = last + S.intervalKm;
    if (km >= S.totalKm - 1e-6) km = (last + S.totalKm) / 2;
    const c = { id: uid++, name: null, km: Math.round(km * 1000) / 1000 };
    S.cps.push(c);
    render();
    const el = $('d' + c.id);
    if (el) { el.focus(); el.select(); }
  });

  const rowsEl = $('rows');
  rowsEl.addEventListener('input', (e) => {
    const c = findCp(e.target);
    if (!c) return;
    if (e.target.classList.contains('ds')) {
      const v = parseNum(e.target.value) * f();
      if (v > 0 && v <= 1000) { e.target.classList.remove('bad'); c.km = v; update(); }
      else e.target.classList.add('bad');
    }
  });
  rowsEl.addEventListener('change', (e) => {
    if (!e.target.classList.contains('ds')) return;
    const c = findCp(e.target);
    if (!c) return;
    const aid = document.activeElement && document.activeElement.id;
    const o = domOrder();
    const want = ['start'].concat(o.ord.map((x) => String(x.id)), ['fin'], o.over.map((x) => String(x.id)));
    const have = Array.prototype.map.call(rowsEl.children, (r) => r.dataset.id);
    if (want.length !== have.length || want.some((v, i) => v !== have[i])) {
      render();
      if (aid) { const el = $(aid); if (el) el.focus(); }
    } else {
      e.target.value = fmtNum(c.km / f(), 3);
      e.target.classList.remove('bad');
    }
  });
  rowsEl.addEventListener('click', (e) => {
    const b = e.target.closest('.rm');
    if (!b) return;
    const c = findCp(b);
    if (!c) return;
    S.cps = S.cps.filter((x) => x !== c);
    render();
  });

  /* ---------- Copy ---------- */

  function scheduleText() {
    const ss = startSec();
    const clk = (s) => {
      if (ss == null) return DASH;
      const t = (ss + s) % 86400;
      return pad(Math.floor(t / 3600)) + ':' + pad(Math.floor((t % 3600) / 60)) + ':' + pad(t % 60);
    };
    const pts = [{ name: 'Start', km: 0 }]
      .concat(domOrder().ord.map((c) => ({ name: c.name || autoLabel(c.km), km: c.km })), [{ name: 'Finish', km: S.totalKm }]);
    const paceTxt = fmtPace(S.paceSec * f()) + ' /' + U() + (S.range ? ' to ' + fmtPace(S.paceSec2 * f()) + ' /' + U() : '');
    const head = raceName() + ' | ' + paceTxt + ' | start ' + S.start;
    const rows = [S.range
      ? ['Checkpoint', 'Distance', 'Fast race', 'Fast clock', 'Slow race', 'Slow clock']
      : ['Checkpoint', 'Distance', 'Race time', 'Time of day']];
    pts.forEach((pt) => {
      const a = Math.round(pt.km * S.paceSec);
      const row = [pt.name, fmtNum(pt.km / f(), 2) + ' ' + U(), hms(a), clk(a)];
      if (S.range) { const b = Math.round(pt.km * S.paceSec2); row.push(hms(b), clk(b)); }
      rows.push(row);
    });
    const w = rows[0].map((_, i) => Math.max.apply(null, rows.map((r) => r[i].length)));
    return head + '\n' + rows.map((r) => r.map((v, i) => v.padEnd(w[i])).join('  ').trimEnd()).join('\n');
  }

  function copyOut(btn, text, idleLabel, doneLabel) {
    const fb = $('fallback');
    const done = (label) => { btn.textContent = label; setTimeout(() => { btn.textContent = idleLabel; }, 1800); };
    const showFallback = () => { fb.hidden = false; fb.value = text; fb.focus(); fb.select(); };
    try {
      navigator.clipboard.writeText(text).then(() => { fb.hidden = true; done(doneLabel); }, showFallback);
    } catch (e) { showFallback(); }
  }
  function pacesReady() { return S.paceOk && (!S.range || S.paceOk2); }

  $('copy').addEventListener('click', function () {
    if (!pacesReady()) { this.textContent = 'Fix the pace first'; setTimeout(() => { this.textContent = 'Copy as text'; }, 1800); return; }
    copyOut(this, scheduleText(), 'Copy as text', 'Copied');
  });
  $('share').addEventListener('click', function () {
    copyOut(this, shareUrl(), 'Copy share link', 'Link copied');
  });

  /* ---------- Start ---------- */

  loadFromUrl();
  if (!S.cps) build();
  syncInputs();
  render();
  layout();
  interacted = location.search.length > 1; // a shared link keeps the address bar in sync from the start
  window.addEventListener('resize', layout);
  if (typeof ResizeObserver === 'function') new ResizeObserver(layout).observe($('results'));
})();
