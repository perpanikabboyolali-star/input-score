/* ==========================================================
 *  Kunci halaman panitia (admin) dengan PIN Admin.
 *  PIN disimpan di sessionStorage: otomatis keluar saat browser/tab ditutup.
 * ========================================================== */
var AdminAuth = (function () {
  function get() { try { return sessionStorage.getItem('adminPin') || ''; } catch (e) { return ''; } }
  function set(p) { try { sessionStorage.setItem('adminPin', p); } catch (e) {} }
  function clear() { try { sessionStorage.removeItem('adminPin'); } catch (e) {} }
  function check(api, pin) {
    return fetch(api + '?action=cekAdmin&pin=' + encodeURIComponent(pin), { redirect: 'follow' })
      .then(function (r) { return r.json(); })
      .then(function (j) { if (!j.ok) throw new Error(j.error || 'PIN admin salah'); return pin; });
  }
  /** Tampilkan form login jika belum masuk, lalu panggil onOk(pin) */
  function gate(api, onOk, judul) {
    if (!api) { alert('URL Web App (API_URL) belum diisi di file ini.'); return; }
    var p = get();
    if (p) { check(api, p).then(onOk).catch(function () { clear(); gate(api, onOk, judul); }); return; }
    var ov = document.createElement('div');
    ov.className = 'noprint';
    ov.setAttribute('style', 'position:fixed;inset:0;z-index:99;background:#0f1724;display:flex;align-items:center;justify-content:center;padding:16px;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif');
    ov.innerHTML = '<form style="background:#17212f;border:1px solid #2a3a50;border-radius:14px;padding:20px;width:100%;max-width:340px;color:#eef2f7">' +
      '<div style="font-size:12px;color:#f5a524;font-weight:700;letter-spacing:.06em">KHUSUS PANITIA</div>' +
      '<h2 style="margin:6px 0 4px;font-size:19px">' + (judul || 'Masuk Admin') + '</h2>' +
      '<p style="margin:0 0 14px;font-size:13px;color:#8b98ab">Masukkan PIN Admin (bukan PIN scorer).</p>' +
      '<input type="password" inputmode="numeric" autocomplete="off" placeholder="PIN Admin" style="width:100%;padding:12px;border-radius:10px;border:1px solid #2a3a50;background:#0f1724;color:#eef2f7;font-size:16px;box-sizing:border-box">' +
      '<button type="submit" style="margin-top:12px;width:100%;padding:12px;border:0;border-radius:10px;background:#f5a524;color:#111;font-weight:700;font-size:15px">Masuk</button>' +
      '<p class="msg" style="margin:10px 0 0;font-size:13px;color:#ff5d5d;min-height:1em"></p></form>';
    document.body.appendChild(ov);
    var f = ov.querySelector('form'), inp = ov.querySelector('input'), msg = ov.querySelector('.msg');
    inp.focus();
    f.onsubmit = function (e) {
      e.preventDefault();
      msg.style.color = '#8b98ab'; msg.textContent = 'Memeriksa…';
      check(api, inp.value.trim()).then(function (pin) {
        set(pin); ov.remove(); onOk(pin);
      }).catch(function (err) { msg.style.color = '#ff5d5d'; msg.textContent = err.message; });
    };
  }
  return { get: get, set: set, clear: clear, check: check, gate: gate };
})();
