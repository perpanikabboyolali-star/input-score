/* ==========================================================
 *  Babak Eliminasi / Aduan — input skor per pertandingan
 *  Sistem SET (Recurve/Barebow/Nasional) & KUMULATIF (Compound)
 *  Maks 5 set/rambahan x 3 anak panah, shoot-off 1 anak panah.
 * ========================================================== */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var KEYS = ['X', '10', '9', '8', '7', '6', '5', '4', '3', '2', '1', 'M'];
  var KEYS_6 = ['X', '10', '9', '8', '7', '6', '5', 'M'];
  var E = { data: null, kat: null, m: null, sa: [], sb: [], soA: '', soB: '', soC: '', cur: null, view: '' };

  function cfg() { try { return JSON.parse(localStorage.getItem('cfg') || '{}'); } catch (e) { return {}; } }
  function load(k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function val(a) { return a === 'X' ? 10 : a === 'M' || !a ? 0 : Number(a) || 0; }
  function sum(a) { return (a || []).reduce(function (t, v) { return t + val(v); }, 0); }
  function toast(msg) { var t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(function () { t.hidden = true; }, 2500); }

  function api(params) {
    var q = Object.keys(params).map(function (k) { return k + '=' + encodeURIComponent(params[k]); }).join('&');
    return fetch(cfg().api + '?' + q, { redirect: 'follow' }).then(function (r) { return r.json(); })
      .then(function (j) { if (!j.ok) throw new Error(j.error || 'Gagal'); return j; });
  }
  function post(body) {
    body.pin = cfg().pin;
    return fetch(cfg().api, { method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json(); }).then(function (j) { if (!j.ok) throw new Error(j.error || 'Gagal'); return j; });
  }

  /* ---------- aturan pertandingan (sama dengan server) ---------- */
  function hitung(sa, sb, soA, soB, soC, sistem) {
    var pa = 0, pb = 0, ta = 0, tb = 0, ends = 0, win = '', pts = [];
    for (var i = 0; i < 5; i++) {
      var a = (sa[i] || []).filter(Boolean), b = (sb[i] || []).filter(Boolean);
      if (a.length < 3 || b.length < 3) break;
      ends++;
      var x = sum(a), y = sum(b); ta += x; tb += y;
      if (sistem === 'SET') {
        var p = x > y ? [2, 0] : y > x ? [0, 2] : [1, 1];
        pa += p[0]; pb += p[1]; pts.push(p);
        if (pa >= 6 || pb >= 6) { win = pa > pb ? 'A' : 'B'; break; }
      } else pts.push([ta, tb]);
    }
    var so = false;
    if (!win && ends === 5) {
      var seri = sistem === 'SET' ? pa === pb : ta === tb;
      if (!seri) win = sistem === 'SET' ? (pa > pb ? 'A' : 'B') : (ta > tb ? 'A' : 'B');
      else {
        so = true;
        if (soA && soB) { var va = val(soA), vb = val(soB); win = va > vb ? 'A' : vb > va ? 'B' : (soC === 'A' || soC === 'B' ? soC : ''); }
        if (win && sistem === 'SET') { if (win === 'A') pa++; else pb++; }
      }
    }
    return { poinA: sistem === 'SET' ? pa : ta, poinB: sistem === 'SET' ? pb : tb, pemenang: win, perluSO: so, ends: ends, pts: pts };
  }

  /* ---------- navigasi ---------- */
  function show(v) {
    ['vSetup', 'vTargets', 'vTarget', 'vEntry', 'vElim', 'vMatch'].forEach(function (x) { if ($(x)) $(x).hidden = x !== v; });
    E.view = v; $('btnBack').hidden = false; window.scrollTo(0, 0);
  }
  window.ElimUI = {
    back: function () {
      if (E.view === 'vMatch') { openList(); return true; }
      if (E.view === 'vElim') { E.view = ''; window.AppShow('vTargets'); return true; }
      return false;
    }
  };

  /* ---------- daftar pertandingan ---------- */
  function katInfo(k) { return (E.data.kategori || []).filter(function (x) { return x.kategori === k; })[0] || {}; }
  function openList() {
    show('vElim');
    $('hTitle').textContent = 'Babak Eliminasi'; $('hSub').textContent = E.kat || 'Pilih kategori';
    renderList();
    api({ action: 'eliminasi' }).then(function (j) { E.data = j; save('elimData', j); renderList(); })
      .catch(function (e) { toast('Pakai data tersimpan (' + e.message + ')'); });
  }
  function renderList() {
    E.data = E.data || load('elimData', null);
    if (!E.data) { $('elList').innerHTML = '<p class="mut pad">Memuat…</p>'; return; }
    var kats = E.data.kategori.filter(function (k) { return k.punyaBracket; });
    if (!kats.length) { $('elKat').innerHTML = ''; $('elList').innerHTML = '<p class="mut pad">Belum ada bracket. Panitia akan membuat bracket setelah kualifikasi selesai.</p>'; return; }
    if (!E.kat || !kats.some(function (k) { return k.kategori === E.kat; })) E.kat = kats[0].kategori;
    $('hSub').textContent = E.kat;
    $('elKat').innerHTML = kats.map(function (k) { return '<button class="chip' + (k.kategori === E.kat ? ' on' : '') + '" data-k="' + esc(k.kategori) + '">' + esc(k.kategori) + '</button>'; }).join('');
    var ms = E.data.matches.filter(function (m) { return m.kategori === E.kat && m.a && m.b; });
    var urut = function (m) { return m.ukuran === 1 ? 1.5 : m.ukuran; };   // perunggu sebelum final
    ms.sort(function (x, y) { return urut(y) - urut(x) || x.no - y.no; });
    var html = '', last = '';
    ms.forEach(function (m) {
      if (m.babak !== last) { html += '<div class="babak">' + esc(m.babak) + '</div>'; last = m.babak; }
      var siap = !m.pemenang, sk = (m.skorA && m.skorA.length) || (m.skorB && m.skorB.length) ? m.poinA + ' – ' + m.poinB : '';
      html += '<div class="mt' + (siap ? ' siap' : '') + '" data-id="' + esc(m.id) + '" style="margin:0 16px 8px">' +
        '<div class="bb"><span>' + esc(m.babak) + ' #' + m.no + (m.bantalan ? ' · Bantalan ' + esc(m.bantalan) : '') + '</span><span>' + (siap ? (sk ? '● Berlangsung' : '● Siap dimainkan') : '✓ Selesai') + '</span></div>' +
        '<div class="p' + (m.pemenang === 'A' ? ' w' : '') + '"><small>' + esc(m.a.seed) + '</small>' + esc(m.a.nama) + '</div><div class="s">' + (sk ? esc(m.poinA) : '') + '</div>' +
        '<div class="p' + (m.pemenang === 'B' ? ' w' : '') + '"><small>' + esc(m.b.seed) + '</small>' + esc(m.b.nama) + '</div><div class="s">' + (sk ? esc(m.poinB) : '') + '</div></div>';
    });
    $('elList').innerHTML = html || '<p class="mut pad">Belum ada pertandingan yang siap. Tunggu hasil babak sebelumnya.</p>';
  }
  $('btnElim').onclick = function () { openList(); };
  $('elKat').onclick = function (e) { var b = e.target.closest('.chip'); if (b) { E.kat = b.dataset.k; renderList(); } };
  $('elList').onclick = function (e) { var r = e.target.closest('.mt'); if (r) openMatch(r.dataset.id); };

  /* ---------- input skor pertandingan ---------- */
  function pad(sk) { var o = []; for (var i = 0; i < 5; i++) o.push(((sk && sk[i]) || []).slice(0, 3)); return o; }
  function openMatch(id) {
    var m = E.data.matches.filter(function (x) { return x.id === id; })[0]; if (!m) return;
    E.m = m;
    var d = load('md_' + id, null);
    E.sa = pad(d ? d.sa : m.skorA); E.sb = pad(d ? d.sb : m.skorB);
    E.soA = d ? d.soA : (m.soA || ''); E.soB = d ? d.soB : (m.soB || ''); E.soC = d ? d.soC : (m.soCloser || '');
    E.cur = null;
    var face = katInfo(m.kategori).face;
    $('mKeypad').innerHTML = (face === '6ring' ? KEYS_6 : KEYS).map(function (k) { return '<button class="key v-' + k + '" data-k="' + k + '">' + k + '</button>'; }).join('');
    show('vMatch');
    $('hTitle').textContent = m.babak + ' #' + m.no; $('hSub').textContent = m.kategori;
    renderMatch();
  }
  function sistem() { return katInfo(E.m.kategori).sistem || 'SET'; }
  function autoCur(h) {
    if (h.pemenang && !h.perluSO) return null;
    if (h.perluSO) { if (!E.soA) return { so: 'A' }; if (!E.soB) return { so: 'B' }; return null; }
    for (var i = 0; i < 5; i++) {
      for (var s = 0; s < 2; s++) {
        var arr = s === 0 ? E.sa[i] : E.sb[i];
        for (var k = 0; k < 3; k++) if (!arr[k]) return { side: s === 0 ? 'A' : 'B', end: i, idx: k };
      }
    }
    return null;
  }
  function sama(a, b) { return a && b && a.so === b.so && a.side === b.side && a.end === b.end && a.idx === b.idx; }
  function renderMatch() {
    var m = E.m, sis = sistem(), h = hitung(E.sa, E.sb, E.soA, E.soB, E.soC, sis);
    var cur = E.cur || autoCur(h);
    $('mHead').innerHTML =
      '<div class="pl">' + esc(m.a.nama) + '<small>Seed ' + esc(m.a.seed) + ' · ' + esc(m.a.klub) + '</small></div>' +
      '<div class="sc">' + h.poinA + ' – ' + h.poinB + '</div>' +
      '<div class="pl r">' + esc(m.b.nama) + '<small>Seed ' + esc(m.b.seed) + ' · ' + esc(m.b.klub) + '</small></div>' +
      '<div class="info">' + (sis === 'SET' ? 'Sistem set · menang 6 poin' : 'Sistem kumulatif · 5 rambahan') + '</div>' +
      (h.pemenang ? '<div class="menang">🏆 Pemenang: ' + esc(h.pemenang === 'A' ? m.a.nama : m.b.nama) + '</div>' : '');
    var rows = '';
    for (var i = 0; i < 5; i++) {
      var off = h.pemenang && !h.perluSO && i >= h.ends;
      var tri = function (side) {
        var arr = side === 'A' ? E.sa[i] : E.sb[i], s = '';
        for (var k = 0; k < 3; k++) {
          var c = { side: side, end: i, idx: k };
          s += '<div class="a ' + (arr[k] ? 'v-' + arr[k] : '') + (sama(cur, c) ? ' cur' : '') + '" data-s="' + side + '" data-e="' + i + '" data-k="' + k + '">' + (arr[k] || '') + '</div>';
        }
        return '<div class="tri">' + s + '</div>';
      };
      var ta = E.sa[i].filter(Boolean).length ? sum(E.sa[i]) : '', tb = E.sb[i].filter(Boolean).length ? sum(E.sb[i]) : '';
      var pt = h.pts[i] ? (sis === 'SET' ? h.pts[i][0] + '-' + h.pts[i][1] : '') : '';
      rows += '<div class="mend' + (off ? ' off' : '') + '"><div class="n">' + (sis === 'SET' ? 'S' : 'R') + (i + 1) + '</div>' + tri('A') +
        '<div class="t">' + ta + '</div><div class="pt">' + pt + '</div><div class="t">' + tb + '</div>' + tri('B') + '</div>';
    }
    $('mEnds').innerHTML = rows;
    $('mSO').hidden = !h.perluSO;
    if (h.perluSO) {
      var eq = E.soA && E.soB && val(E.soA) === val(E.soB);
      $('mSO').innerHTML = '<b>Shoot-off</b> <span class="mut">1 anak panah, nilai tertinggi menang</span>' +
        '<div class="row"><div>' + esc(m.a.nama) + '</div><div class="a ' + (E.soA ? 'v-' + E.soA : '') + (sama(cur, { so: 'A' }) ? ' cur' : '') + '" data-so="A">' + esc(E.soA) + '</div>' +
        '<div class="a ' + (E.soB ? 'v-' + E.soB : '') + (sama(cur, { so: 'B' }) ? ' cur' : '') + '" data-so="B">' + esc(E.soB) + '</div><div style="text-align:right">' + esc(m.b.nama) + '</div></div>' +
        (eq ? '<div class="mut" style="margin-top:8px">Nilai sama, siapa yang <b>paling dekat ke tengah</b>? (keputusan juri)</div><div class="dk">' +
          '<button data-c="A" class="' + (E.soC === 'A' ? 'on' : '') + '">' + esc(m.a.nama) + '</button><button data-c="B" class="' + (E.soC === 'B' ? 'on' : '') + '">' + esc(m.b.nama) + '</button></div>' : '');
    }
    save('md_' + m.id, { sa: E.sa, sb: E.sb, soA: E.soA, soB: E.soB, soC: E.soC });
  }
  $('mEnds').onclick = function (e) {
    var b = e.target.closest('.a'); if (!b) return;
    E.cur = { side: b.dataset.s, end: Number(b.dataset.e), idx: Number(b.dataset.k) }; renderMatch();
  };
  $('mSO').onclick = function (e) {
    var a = e.target.closest('[data-so]'); if (a) { E.cur = { so: a.dataset.so }; renderMatch(); return; }
    var c = e.target.closest('[data-c]'); if (c) { E.soC = c.dataset.c; renderMatch(); }
  };
  $('mKeypad').onclick = function (e) {
    var b = e.target.closest('.key'); if (!b) return;
    var h = hitung(E.sa, E.sb, E.soA, E.soB, E.soC, sistem());
    var c = E.cur || autoCur(h);
    if (!c) { toast('Pertandingan sudah selesai. Ketuk kotak untuk mengoreksi.'); return; }
    if (c.so) { if (c.so === 'A') E.soA = b.dataset.k; else E.soB = b.dataset.k; E.soC = ''; }
    else {
      var arr = c.side === 'A' ? E.sa[c.end] : E.sb[c.end];
      arr[c.idx] = b.dataset.k;
      for (var k = 0; k < c.idx; k++) if (!arr[k]) arr[k] = '';
    }
    E.cur = null; if (navigator.vibrate) navigator.vibrate(15);
    renderMatch();
  };
  $('mDel').onclick = function () {
    var c = E.cur;
    if (!c) {   // hapus nilai terakhir yang diisi
      if (E.soB) E.soB = ''; else if (E.soA) E.soA = '';
      else {
        outer: for (var i = 4; i >= 0; i--) for (var s = 1; s >= 0; s--) {
          var arr = s ? E.sb[i] : E.sa[i];
          for (var k = 2; k >= 0; k--) if (arr[k]) { arr[k] = ''; break outer; }
        }
      }
    } else if (c.so) { if (c.so === 'A') E.soA = ''; else E.soB = ''; }
    else (c.side === 'A' ? E.sa : E.sb)[c.end][c.idx] = '';
    E.soC = ''; E.cur = null; renderMatch();
  };
  $('mKirim').onclick = function () {
    var bersih = function (sk) {
      var o = sk.map(function (e) { return e.filter(Boolean); });
      while (o.length && !o[o.length - 1].length) o.pop();
      return o;
    };
    var btn = $('mKirim'); btn.disabled = true; btn.textContent = 'Mengirim…';
    post({ action: 'simpanMatch', matchId: E.m.id, skorA: bersih(E.sa), skorB: bersih(E.sb), soA: E.soA, soB: E.soB, soCloser: E.soC })
      .then(function (j) {
        localStorage.removeItem('md_' + E.m.id);
        toast(j.pemenang ? 'Tersimpan ✓ Pemenang lanjut ke babak berikutnya' : 'Skor sementara tersimpan ✓');
        return api({ action: 'eliminasi' }).then(function (d) { E.data = d; save('elimData', d); });
      }).then(function () { openList(); })
      .catch(function (e) { toast('Belum terkirim: ' + e.message + '. Draf aman di HP, coba lagi.'); })
      .then(function () { btn.disabled = false; btn.textContent = 'Kirim skor'; });
  };
})();
