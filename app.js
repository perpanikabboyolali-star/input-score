/* ==========================================================
 *  Aplikasi Input Skor Panahan (PWA)
 *  Versi 2: multi-sesi, divisi + kelompok umur, keypad sesuai face
 *  Alur: Pengaturan → Pilih Bantalan → Sesi → Daftar pemanah per End
 *        → Ketuk nilai per anak panah → Kirim End (antre offline)
 * ========================================================== */
(function () {
  'use strict';

  var KEYS = ['X', '10', '9', '8', '7', '6', '5', '4', '3', '2', '1', 'M'];
  var KEYS_6RING = ['X', '10', '9', '8', '7', '6', '5', 'M'];   // Compound & Nasional
  var URUT = {}; KEYS.forEach(function (k, i) { URUT[k] = i; });
  function is6ring(a) { return !!a && (a.face === '6ring' || a.face === '5ring'); }   // '5ring' = data lama
  function keysFor(a) { return is6ring(a) ? KEYS_6RING : KEYS; }

  /* ---------- penyimpanan lokal ---------- */
  function load(k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  var cfg = load('cfg', { api: '', pin: '', dev: '' });
  var meta = load('meta', { namaLomba: 'Skor Panahan', jumlahSesi: 1, endPerSesi: 6, jumlahEnd: 6, panahPerEnd: 6 });
  if (!meta.endPerSesi) { meta.jumlahSesi = 1; meta.endPerSesi = meta.jumlahEnd; }
  var draft = load('draft', {});   // {id:{end:[...]}}
  var queue = load('queue', []);   // [{id,end,arrows,device,ts}]
  var S = { bantalan: null, archers: [], end: 1, idx: 0, edit: -1, view: 'vSetup' };

  /* ---------- util ---------- */
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function val(a) { return a === 'X' ? 10 : a === 'M' ? 0 : Number(a) || 0; }
  function sum(arr) { return (arr || []).reduce(function (t, a) { return t + val(a); }, 0); }
  function sortArrows(arr) { return arr.slice().sort(function (a, b) { return URUT[a] - URUT[b]; }); }
  function toast(msg, ms) {
    var t = $('toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toast._t); toast._t = setTimeout(function () { t.hidden = true; }, ms || 2200);
  }
  function sesiOf(end) { return Math.ceil(end / meta.endPerSesi); }
  function endLokal(end) { return (end - 1) % meta.endPerSesi + 1; }
  function labelEnd(end) { return (meta.jumlahSesi > 1 ? 'Sesi ' + sesiOf(end) + ' · ' : '') + 'End ' + endLokal(end) + '/' + meta.endPerSesi; }
  function labelPendek(end) { return (meta.jumlahSesi > 1 ? 'S' + sesiOf(end) + '-' : '') + 'E' + endLokal(end); }
  function sesiTotal(a, ses) {
    var t = 0;
    for (var e = (ses - 1) * meta.endPerSesi + 1; e <= ses * meta.endPerSesi; e++) t += sum(getArrows(a, e));
    return t;
  }
  function info(a) { return [a.divisi, a.ku, a.genderLabel].filter(Boolean).join(' ') + ' · ' + a.klub; }
  function vibrate() { if (navigator.vibrate) navigator.vibrate(15); }

  /* ---------- API ---------- */
  function apiGet(params) {
    var q = Object.keys(params).map(function (k) { return k + '=' + encodeURIComponent(params[k]); }).join('&');
    return withTimeout(fetch(cfg.api + '?' + q, { redirect: 'follow' }), 20000)
      .then(function (r) { return r.json(); })
      .then(function (j) { if (!j.ok) throw new Error(j.error || 'Gagal'); return j; });
  }
  function apiPost(body) {
    return withTimeout(fetch(cfg.api, {
      method: 'POST', redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // hindari preflight CORS
      body: JSON.stringify(body)
    }), 30000).then(function (r) { return r.json(); })
      .then(function (j) { if (!j.ok) throw new Error(j.error || 'Gagal'); return j; });
  }
  function withTimeout(p, ms) {
    return Promise.race([p, new Promise(function (_, rej) { setTimeout(function () { rej(new Error('Waktu habis')); }, ms); })]);
  }

  /* ---------- data skor ---------- */
  function serverArrows(a, end) { var s = a.skor && a.skor[end]; return s ? s.arrows : null; }
  function getArrows(a, end) {
    if (draft[a.id] && draft[a.id][end]) return draft[a.id][end];
    return serverArrows(a, end) || [];
  }
  function setArrows(a, end, arr) {
    draft[a.id] = draft[a.id] || {}; draft[a.id][end] = arr; save('draft', draft);
  }
  function isDirty(a, end) {
    if (!(draft[a.id] && draft[a.id][end])) return false;
    return JSON.stringify(draft[a.id][end]) !== JSON.stringify(serverArrows(a, end) || []);
  }
  function inQueue(a, end) { return queue.some(function (q) { return q.id === a.id && Number(q.end) === Number(end); }); }
  function runTotal(a) { var t = 0; for (var e = 1; e <= meta.jumlahEnd; e++) t += sum(getArrows(a, e)); return t; }
  function endFull(end) {
    return S.archers.length > 0 && S.archers.every(function (a) { return getArrows(a, end).length >= meta.panahPerEnd; });
  }
  function endStatus(end) {
    var anyQ = S.archers.some(function (a) { return inQueue(a, end); });
    if (anyQ) return 'q';
    var allServer = S.archers.length && S.archers.every(function (a) {
      return (serverArrows(a, end) || []).length >= meta.panahPerEnd && !isDirty(a, end);
    });
    return allServer ? 'done' : '';
  }

  /* ---------- navigasi ---------- */
  function show(view) {
    ['vSetup', 'vTargets', 'vTarget', 'vEntry', 'vElim', 'vMatch'].forEach(function (v) { if ($(v)) $(v).hidden = v !== view; });
    S.view = view;
    $('btnBack').hidden = (view === 'vSetup' || view === 'vTargets');
    var t = meta.namaLomba, sub = '';
    if (view === 'vTarget' || view === 'vEntry') { t = 'Bantalan ' + S.bantalan + (!ACARA && GEL ? ' · ' + GEL : ''); sub = labelEnd(S.end); }
    if (view === 'vTargets') sub = cfg.dev || '';
    $('hTitle').textContent = t; $('hSub').textContent = sub;
    window.scrollTo(0, 0);
  }
  window.AppShow = function (v) { show(v); if (v === 'vTargets') loadTargets(); };
  $('btnBack').onclick = function () {
    if (window.ElimUI && window.ElimUI.back()) return;
    if (S.view === 'vEntry') { renderTarget(); show('vTarget'); }
    else if (S.view === 'vTarget') { show('vTargets'); loadTargets(); }
  };

  /* ---------- 1. Pengaturan ---------- */
  $('iApi').value = cfg.api; $('iPin').value = cfg.pin; $('iDev').value = cfg.dev;
  $('btnSimpanSetup').onclick = function () {
    cfg = { api: $('iApi').value.trim(), pin: $('iPin').value.trim(), dev: $('iDev').value.trim() || 'HP' };
    if (!/^https:\/\/script\.google(usercontent)?\.com\//.test(cfg.api)) { $('setupMsg').textContent = 'URL harus diawali https://script.google.com/…'; return; }
    $('setupMsg').textContent = 'Menghubungkan…';
    apiGet({ action: 'config' }).then(function (j) {
      meta = { namaLomba: j.namaLomba, jumlahSesi: j.jumlahSesi || 1, endPerSesi: j.endPerSesi || j.jumlahEnd,
        jumlahEnd: j.jumlahEnd, panahPerEnd: j.panahPerEnd };
      save('meta', meta);
      save('cfg', cfg);
      return ambilBantalan();
    }).then(function () {
      $('setupMsg').textContent = ''; show('vTargets'); renderTargets(load('targets', []));
    }).catch(function (e) { $('setupMsg').textContent = 'Gagal: ' + e.message; });
  };
  $('btnUbahSetup').onclick = function () { show('vSetup'); };

  /* ---------- 2. Pilih bantalan ---------- */
  var GEL = load('gel', ''), ACARA = load('acara', '');
  function kunci() { return ACARA ? 'ac:' + ACARA : GEL; }
  function jamSekarang() { var d = new Date(); return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); }
  function berlangsung(a) { var n = jamSekarang(); return a.mulai && a.mulai <= n && (!a.selesai || n <= a.selesai); }
  function acaraOtomatis(list) {   // acara yang sedang berjalan, atau yang berikutnya, atau yang terakhir
    var n = jamSekarang();
    for (var i = 0; i < list.length; i++) if (!list[i].selesai || n <= list[i].selesai) return list[i].id;
    return list.length ? list[list.length - 1].id : '';
  }
  function ambilBantalan() {
    return apiGet({ action: 'bantalan', pin: cfg.pin, acara: ACARA }).then(function (j) {
      var list = j.acara || [];
      save('acaraList', list); save('aktif', j.aktif || '');
      if (list.length && !list.some(function (a) { return a.id === ACARA; })) { ACARA = acaraOtomatis(list); save('acara', ACARA); return ambilBantalan(); }
      if (!list.length && ACARA) { ACARA = ''; save('acara', ''); }
      save('targets', j.data);
      if (S.view === 'vTargets') renderTargets(j.data);
    });
  }
  function renderTargets(list) {
    list = list || [];
    var acts = load('acaraList', []);
    $('acaraTabs').hidden = !acts.length;
    $('acaraTabs').innerHTML = acts.length ? '<div class="mut" style="margin:0 0 6px">Acara hari ini — pilih yang sedang kamu catat:</div>' + acts.map(function (a) {
      return '<button class="act' + (a.id === ACARA ? ' on' : '') + '" data-a="' + esc(a.id) + '"><span class="w">' + esc(a.mulai || '') + (a.selesai ? '–' + esc(a.selesai) : '') +
        (berlangsung(a) ? ' <i>● berlangsung</i>' : '') + '</span><b>' + esc(a.acara) + '</b><small>' + esc(a.kategori || '') + '</small></button>';
    }).join('') : '';
    if (acts.length) list = list.map(function (t) { t = Object.assign({}, t); t.gelombang = ''; return t; });
    var gels = []; list.forEach(function (t) { if (t.gelombang && gels.indexOf(t.gelombang) < 0) gels.push(t.gelombang); });
    if (gels.length && gels.indexOf(GEL) < 0) { GEL = gels[0]; save('gel', GEL); }
    if (!gels.length) GEL = '';
    $('gelTabs').hidden = !gels.length;
    $('gelTabs').innerHTML = gels.map(function (g) { return '<button class="seg' + (g === GEL ? ' on' : '') + '" data-g="' + esc(g) + '">' + esc(g) + '</button>'; }).join('');
    list = list.filter(function (t) { return !gels.length || (t.gelombang || '') === GEL; });
    var ak = load('aktif', ''); $('aktifInfo').hidden = !ak || acts.length > 0; $('aktifInfo').textContent = ak ? '📅 Input dibuka: ' + ak.replace(/^Jadwal hari ini: /, '') : '';
    $('targetGrid').innerHTML = list.map(function (t) {
      return '<button class="tgt" data-b="' + esc(t.bantalan) + '"><b>' + esc(t.bantalan) + '</b><span>' + t.jumlah + ' pemanah</span></button>';
    }).join('') || '<p class="mut">Tidak ada bantalan yang dibuka untuk input saat ini.</p>';
  }
  function loadTargets() {
    renderTargets(load('targets', []));
    if (!navigator.onLine) return;
    apiGet({ action: 'config' }).then(function (j) {   // format lomba selalu ikut sheet Pengaturan
      meta = { namaLomba: j.namaLomba, jumlahSesi: j.jumlahSesi || 1, endPerSesi: j.endPerSesi || j.jumlahEnd,
        jumlahEnd: j.jumlahEnd, panahPerEnd: j.panahPerEnd };
      save('meta', meta); if (S.view === 'vTargets') $('hTitle').textContent = meta.namaLomba;
    }).catch(function () {});
    ambilBantalan().catch(function () {});
  }
  $('acaraTabs').onclick = function (e) {
    var b = e.target.closest('.act'); if (!b) return;
    ACARA = b.dataset.a; save('acara', ACARA);
    renderTargets(load('targets', [])); $('targetGrid').innerHTML = '<p class="mut">Memuat…</p>';
    ambilBantalan().catch(function (er) { toast('Gagal memuat: ' + er.message); });
  };
  $('gelTabs').onclick = function (e) {
    var b = e.target.closest('button'); if (!b) return;
    GEL = b.dataset.g; save('gel', GEL); renderTargets(load('targets', []));
  };
  $('targetGrid').onclick = function (e) {
    var b = e.target.closest('.tgt'); if (!b) return;
    openTarget(b.dataset.b);
  };

  /* ---------- 3. Bantalan ---------- */
  function openTarget(b) {
    S.bantalan = b; save('lastTarget', b);
    S.archers = load('arch_' + kunci() + '_' + b, []);
    S.end = firstOpenEnd();
    renderTarget(); show('vTarget');
    refreshArchers();
  }
  function refreshArchers() {
    if (!navigator.onLine) return Promise.resolve();
    var q = { action: 'peserta', bantalan: S.bantalan, pin: cfg.pin };
    if (ACARA) q.acara = ACARA; else q.gelombang = GEL;
    return apiGet(q).then(function (j) {
      S.archers = j.data; save('arch_' + kunci() + '_' + S.bantalan, j.data);
      if (S.view === 'vTarget') renderTarget();
    }).catch(function (e) { toast('Pakai data tersimpan (' + e.message + ')'); });
  }
  function firstOpenEnd() {
    for (var e = 1; e <= meta.jumlahEnd; e++) if (!endFull(e)) return e;
    return meta.jumlahEnd;
  }
  function renderTarget() {
    var chips = '', ses = sesiOf(S.end), seg = '';
    if (meta.jumlahSesi > 1) {
      for (var si = 1; si <= meta.jumlahSesi; si++) {
        seg += '<button class="seg' + (si === ses ? ' on' : '') + '" data-s="' + si + '">Sesi ' + si + '</button>';
      }
    }
    $('sesiTabs').innerHTML = seg; $('sesiTabs').hidden = !seg;
    for (var e = (ses - 1) * meta.endPerSesi + 1; e <= ses * meta.endPerSesi; e++) {
      var st = endStatus(e);
      chips += '<button class="chip ' + (e === S.end ? 'on ' : '') + st + '" data-e="' + e + '">E' + endLokal(e) + (st === 'done' ? ' ✓' : st === 'q' ? ' ⏳' : '') + '</button>';
    }
    $('endChips').innerHTML = chips;
    $('archerList').innerHTML = S.archers.map(function (a, i) {
      var arr = getArrows(a, S.end), mini = '';
      for (var k = 0; k < meta.panahPerEnd; k++) mini += '<i class="' + (arr[k] ? 'v-' + arr[k] : '') + '">' + (arr[k] || '·') + '</i>';
      return '<div class="arc ' + (arr.length >= meta.panahPerEnd ? 'full' : '') + '" data-i="' + i + '">' +
        '<div class="pos">' + esc(a.posisi || i + 1) + '</div>' +
        '<div><div class="nm">' + esc(a.nama) + '</div><div class="mut">' + esc(info(a)) + '</div></div>' +
        '<div class="tot" data-card="' + i + '"><b>' + sum(arr) + '</b><span class="mut">' +
        (meta.jumlahSesi > 1 ? 'S' + ses + ' ' + sesiTotal(a, ses) + ' · ' : '') + 'Σ ' + runTotal(a) + '</span></div>' +
        '<div class="mini">' + mini + '</div></div>';
    }).join('') || '<p class="mut">Tidak ada pemanah di bantalan ini.</p>';
    var dirty = S.archers.some(function (a) { return isDirty(a, S.end); });
    $('btnKirim').disabled = !(endFull(S.end) && dirty);
    $('btnKirim').textContent = dirty || !endFull(S.end) ? 'Kirim ' + labelPendek(S.end) : labelPendek(S.end) + ' sudah terkirim';
    $('hSub').textContent = labelEnd(S.end);
  }
  $('endChips').onclick = function (e) {
    var c = e.target.closest('.chip'); if (!c) return;
    S.end = Number(c.dataset.e); renderTarget();
  };
  $('sesiTabs').onclick = function (e) {
    var c = e.target.closest('.seg'); if (!c) return;
    var ses = Number(c.dataset.s), first = (ses - 1) * meta.endPerSesi + 1;
    S.end = first;
    for (var x = first; x < ses * meta.endPerSesi; x++) { if (!endFull(x)) break; S.end = x + 1; }
    renderTarget();
  };
  $('archerList').onclick = function (e) {
    var card = e.target.closest('[data-card]');
    if (card) { showScorecard(S.archers[Number(card.dataset.card)]); return; }
    var row = e.target.closest('.arc'); if (!row) return;
    openEntry(Number(row.dataset.i));
  };

  /* ---------- 4. Input anak panah ---------- */
  var keypadFace = null;
  function buildKeypad(a) {
    var face = is6ring(a) ? '6ring' : 'full';
    if (face === keypadFace) return;
    keypadFace = face;
    $('keypad').innerHTML = keysFor(a).map(function (k) { return '<button class="key v-' + k + '" data-k="' + k + '">' + k + '</button>'; }).join('');
  }
  function openEntry(i) { S.idx = i; S.edit = -1; renderEntry(); show('vEntry'); }
  function renderEntry() {
    var a = S.archers[S.idx], arr = getArrows(a, S.end);
    $('ePos').textContent = a.posisi || S.idx + 1;
    $('eNama').textContent = a.nama;
    $('eInfo').textContent = info(a) + ' · ' + (is6ring(a) ? 'Face 6-ring (5–10)' : 'Face penuh (1–10)');
    buildKeypad(a);
    var cur = S.edit >= 0 ? S.edit : arr.length, h = '';
    for (var k = 0; k < meta.panahPerEnd; k++) {
      h += '<div class="a ' + (arr[k] ? 'v-' + arr[k] : '') + (k === cur ? ' cur' : '') + '" data-k="' + k + '">' + (arr[k] || '') + '</div>';
    }
    $('eArrows').innerHTML = h;
    $('eTotal').textContent = sum(arr);
    $('eRun').textContent = meta.jumlahSesi > 1 ? 'Sesi ' + sesiOf(S.end) + ': ' + sesiTotal(a, sesiOf(S.end)) + ' · Total: ' + runTotal(a) : runTotal(a);
    $('hSub').textContent = labelEnd(S.end);
    var last = S.idx >= S.archers.length - 1;
    $('btnNext').textContent = last ? 'Selesai ✓' : 'Pemanah berikutnya ›';
  }
  $('keypad').onclick = function (e) {
    var b = e.target.closest('.key'); if (!b) return;
    var a = S.archers[S.idx], arr = getArrows(a, S.end).slice();
    if (keysFor(a).indexOf(b.dataset.k) < 0) return;
    var wasEdit = S.edit >= 0;
    if (wasEdit) { arr[S.edit] = b.dataset.k; S.edit = -1; }
    else if (arr.length < meta.panahPerEnd) arr.push(b.dataset.k);
    else { toast('End sudah penuh. Ketuk kotak untuk mengubah.'); return; }
    if (arr.length >= meta.panahPerEnd) arr = sortArrows(arr);
    setArrows(a, S.end, arr); vibrate(); renderEntry();
    if (!wasEdit && arr.length >= meta.panahPerEnd && S.idx < S.archers.length - 1) {
      setTimeout(function () { if (S.view === 'vEntry') { S.idx++; S.edit = -1; renderEntry(); } }, 450);
    }
  };
  $('eArrows').onclick = function (e) {
    var b = e.target.closest('.a'); if (!b) return;
    var k = Number(b.dataset.k), arr = getArrows(S.archers[S.idx], S.end);
    S.edit = k < arr.length ? k : -1; renderEntry();
  };
  $('btnDel').onclick = function () {
    var a = S.archers[S.idx], arr = getArrows(a, S.end).slice();
    if (S.edit >= 0) { arr.splice(S.edit, 1); S.edit = -1; } else arr.pop();
    setArrows(a, S.end, arr); renderEntry();
  };
  $('btnNext').onclick = function () {
    if (S.idx < S.archers.length - 1) { S.idx++; S.edit = -1; renderEntry(); }
    else { renderTarget(); show('vTarget'); }
  };

  /* ---------- 5. Kirim end (konfirmasi → antre → sinkron) ---------- */
  $('btnKirim').onclick = function () {
    var rows = S.archers.map(function (a) {
      var arr = getArrows(a, S.end);
      return '<tr><td style="text-align:left">' + esc(a.posisi) + ' · ' + esc(a.nama) + '</td><td>' + arr.join(' ') + '</td><td class="v">' + sum(arr) + '</td></tr>';
    }).join('');
    modal('<h3>Konfirmasi ' + labelEnd(S.end) + '</h3><table class="sc"><tr><th style="text-align:left">Pemanah</th><th>Anak panah</th><th>Total</th></tr>' + rows +
      '</table><p class="mut pad">Pastikan nilai sudah dicek bersama pemanah sebelum dikirim.</p>',
      [['Batal', null], ['Kirim', function () {
        var end = S.end;
        S.archers.forEach(function (a) {
          if (!isDirty(a, end)) return;
          queue = queue.filter(function (q) { return !(q.id === a.id && Number(q.end) === end); });
          queue.push({ id: a.id, end: end, arrows: getArrows(a, end), device: cfg.dev, ts: Date.now() });
        });
        save('queue', queue);
        if (end < meta.jumlahEnd) S.end = end + 1;
        renderTarget(); sync();
      }]]);
  };

  var syncing = false;
  function sync() {
    updateSyncBadge();
    if (syncing || !queue.length || !navigator.onLine || !cfg.api) return;
    syncing = true;
    var batch = queue.slice(0, 40);
    apiPost({ action: 'simpan', pin: cfg.pin, entries: batch }).then(function () {
      batch.forEach(function (b) {
        // tandai sebagai milik server
        Object.keys(localStorage).forEach(function (k) {
          if (k.indexOf('arch_') !== 0) return;
          var list = load(k, []), changed = false;
          list.forEach(function (a) { if (a.id === b.id) { a.skor = a.skor || {}; a.skor[b.end] = { arrows: b.arrows, total: sum(b.arrows) }; changed = true; } });
          if (changed) save(k, list);
        });
        S.archers.forEach(function (a) { if (a.id === b.id) { a.skor = a.skor || {}; a.skor[b.end] = { arrows: b.arrows, total: sum(b.arrows) }; } });
        if (draft[b.id] && JSON.stringify(draft[b.id][b.end]) === JSON.stringify(b.arrows)) delete draft[b.id][b.end];
      });
      var sent = batch.map(function (b) { return b.ts + b.id + b.end; });
      queue = queue.filter(function (q) { return sent.indexOf(q.ts + q.id + q.end) < 0; });
      save('queue', queue); save('draft', draft);
      toast('Skor terkirim ✓');
    }).catch(function (e) {
      toast('Belum terkirim: ' + e.message + '. Akan dicoba lagi.', 3000);
    }).then(function () {
      syncing = false; updateSyncBadge();
      if (S.view === 'vTarget') renderTarget();
      if (queue.length && navigator.onLine) setTimeout(sync, 8000);
    });
  }
  function updateSyncBadge() {
    var el = $('sync');
    if (!navigator.onLine) { el.className = 'sync off'; el.textContent = 'Offline' + (queue.length ? ' · ' + queue.length : ''); }
    else if (queue.length) { el.className = 'sync pending'; el.textContent = 'Antre ' + queue.length; }
    else { el.className = 'sync'; el.textContent = 'Online ✓'; }
  }
  window.addEventListener('online', sync);
  window.addEventListener('offline', updateSyncBadge);
  setInterval(sync, 30000);
  $('sync').onclick = function () { if (queue.length) { toast('Mencoba kirim ' + queue.length + ' data…'); sync(); } };

  /* ---------- kartu skor & modal ---------- */
  function showScorecard(a) {
    var rows = '', tot = 0, n = meta.panahPerEnd;
    for (var ses = 1; ses <= meta.jumlahSesi; ses++) {
      if (meta.jumlahSesi > 1) rows += '<tr><th colspan="' + (n + 3) + '" style="text-align:left;color:var(--acc)">Sesi ' + ses + '</th></tr>';
      for (var e = (ses - 1) * meta.endPerSesi + 1; e <= ses * meta.endPerSesi; e++) {
        var arr = getArrows(a, e), s = sum(arr); tot += arr.length ? s : 0;
        rows += '<tr><td>E' + endLokal(e) + '</td>' + [0, 1, 2, 3, 4, 5].slice(0, n).map(function (k) {
          return '<td class="v ' + (arr[k] ? 'v-' + arr[k] : '') + '">' + (arr[k] || '') + '</td>';
        }).join('') + '<td class="v">' + (arr.length ? s : '') + '</td><td class="v">' + (arr.length ? tot : '') + '</td></tr>';
      }
      if (meta.jumlahSesi > 1) rows += '<tr><td colspan="' + (n + 1) + '" style="text-align:right">Total Sesi ' + ses + '</td><td class="v" colspan="2">' + sesiTotal(a, ses) + '</td></tr>';
    }
    rows += '<tr><td colspan="' + (n + 1) + '" style="text-align:right"><b>TOTAL</b></td><td class="v" colspan="2" style="color:var(--acc);font-size:18px">' + runTotal(a) + '</td></tr>';
    modal('<h3>' + esc(a.nama) + '</h3><p class="mut" style="margin:0 16px 10px">' + esc(info(a)) + ' · Bantalan ' + esc(a.bantalan + a.posisi) +
      '</p><table class="sc"><tr><th>End</th><th colspan="' + n + '">Anak panah</th><th>End</th><th>Kum.</th></tr>' + rows + '</table>', [['Tutup', null]]);
  }
  function modal(html, btns) {
    $('mBody').innerHTML = html;
    $('mBtns').innerHTML = '';
    btns.forEach(function (b, i) {
      var el = document.createElement('button');
      el.className = 'btn ' + (i === btns.length - 1 && btns.length > 1 ? 'pri' : 'ghost');
      el.textContent = b[0];
      el.onclick = function () { $('modal').hidden = true; if (b[1]) b[1](); };
      $('mBtns').appendChild(el);
    });
    $('modal').hidden = false;
  }

  /* ---------- mulai ---------- */
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(function () {});
  if (cfg.api && cfg.pin) { show('vTargets'); loadTargets(); } else show('vSetup');
  updateSyncBadge(); sync();
})();
