// 3Digit DEMO — progressive enhancement only. Every action works without this
// script; the server re-validates everything. Countdowns are explanatory only.
(function () {
  'use strict';

  // ---- server-time aware countdowns ----
  var meta = document.querySelector('meta[name="server-now"]');
  var skew = meta ? new Date(meta.content).getTime() - Date.now() : 0;
  var nodes = Array.prototype.slice.call(document.querySelectorAll('[data-countdown]'));
  function fmt(ms) {
    var s = Math.floor(ms / 1000);
    var d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    if (d > 0) return d + 'd ' + h + 'h ' + m + 'm';
    if (h > 0) return h + 'h ' + String(m).padStart(2, '0') + 'm';
    return m + ':' + String(sec).padStart(2, '0');
  }
  function tick() {
    var now = Date.now() + skew;
    nodes.forEach(function (n) {
      var left = new Date(n.getAttribute('data-countdown')).getTime() - now;
      if (left <= 0) {
        n.textContent = 'Closed';
        n.classList.add('is-closed');
      } else {
        n.textContent = fmt(left) + ' left';
      }
    });
  }
  if (nodes.length) {
    tick();
    setInterval(tick, 1000);
  }

  // ---- prevent duplicate submits (integrity is enforced server-side) ----
  document.addEventListener('submit', function (e) {
    var form = e.target;
    if (!(form instanceof HTMLFormElement) || !form.hasAttribute('data-once')) return;
    if (form.getAttribute('data-busy') === '1') {
      e.preventDefault();
      return;
    }
    form.setAttribute('data-busy', '1');
    var btn = form.querySelector('button[type="submit"]:not([disabled])');
    if (btn) {
      btn.classList.add('is-busy');
      btn.setAttribute('aria-disabled', 'true');
      btn.setAttribute('data-label', btn.textContent);
      btn.textContent = 'Processing…';
    }
    // Recover if the user navigates back (bfcache).
    setTimeout(function () { form.removeAttribute('data-busy'); if (btn) { btn.classList.remove('is-busy'); btn.removeAttribute('aria-disabled'); btn.textContent = btn.getAttribute('data-label'); } }, 8000);
  });

  // ---- password visibility ----
  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('[data-toggle-password]');
    if (!t) return;
    var input = document.getElementById(t.getAttribute('data-toggle-password'));
    if (!input) return;
    var show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    t.textContent = show ? 'Hide' : 'Show';
    t.setAttribute('aria-pressed', show ? 'true' : 'false');
  });

  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-back]');
    if (b && history.length > 1) { e.preventDefault(); history.back(); }
  });

  // Focus the error summary so screen readers announce it.
  var summary = document.querySelector('[data-autofocus]');
  if (summary) summary.focus();

  // Collapse the staff menu by default on small screens.
  var side = document.querySelector('[data-sidenav]');
  if (side && window.matchMedia('(max-width: 900px)').matches) side.removeAttribute('open');

  // ---- digit picker ----
  var picker = document.querySelector('[data-digit-picker]');
  if (!picker) return;
  var input = picker.querySelector('[data-digits-input]');
  var keypad = picker.querySelector('[data-keypad]');
  var status = picker.querySelector('[data-picker-status]');
  var cap = picker.querySelector('[data-capacity]');
  var slots = Array.prototype.slice.call(picker.querySelectorAll('[data-slot]'));
  var keys = Array.prototype.slice.call(picker.querySelectorAll('[data-key]'));
  var drawSelect = document.querySelector('[data-draw-select]');
  var cont = document.querySelector('[data-continue]');
  keypad.hidden = false;
  picker.querySelector('[data-slots]').removeAttribute('aria-hidden');

  function value() { return (input.value || '').replace(/\D/g, '').slice(0, 3); }
  // Mirrors the server rule: exactly three ASCII digits, all different.
  function check(v) {
    if (!/^[0-9]{3}$/.test(v)) return { ok: false, msg: v.length ? 'Pili ng ' + (3 - v.length) + ' pang digit.' : 'Pili ng 3 magkakaibang digit.' };
    if (new Set(v.split('')).size !== 3) return { ok: false, error: true, msg: 'Bawal ang umuulit na digit (hal. 112, 555, 101).' };
    return { ok: true, msg: 'Napili: ' + v.split('').join(' ') + '. Same combination in any order.' };
  }
  var capSeq = 0;
  function render() {
    var v = value();
    if (input.value !== v) input.value = v;
    slots.forEach(function (s, i) {
      var d = v[i] || '';
      s.querySelector('.slot__value').textContent = d;
      s.classList.toggle('is-filled', !!d);
      var rm = s.querySelector('[data-remove]');
      rm.hidden = !d;
      rm.tabIndex = d ? 0 : -1;
      rm.setAttribute('aria-label', 'Remove digit ' + d);
    });
    keys.forEach(function (k) {
      var used = v.indexOf(k.getAttribute('data-key')) >= 0;
      k.setAttribute('aria-pressed', used ? 'true' : 'false');
      k.disabled = used || (v.length >= 3);
      if (used) k.disabled = true;
    });
    var c = check(v);
    status.textContent = c.msg;
    status.classList.toggle('is-error', !!c.error);
    if (c.ok) loadCapacity(v); else { cap.hidden = true; if (cont) cont.disabled = false; }
  }
  function loadCapacity(v) {
    if (!drawSelect || !drawSelect.value) return;
    var seq = ++capSeq;
    cap.hidden = false;
    cap.classList.remove('is-full');
    cap.innerHTML = '<p>Checking combination capacity…</p>';
    fetch('/api/capacity?draw_id=' + encodeURIComponent(drawSelect.value) + '&digits=' + encodeURIComponent(v), { headers: { Accept: 'application/json' }, credentials: 'same-origin' })
      .then(function (r) { return r.json().then(function (j) { return { status: r.status, body: j }; }); })
      .then(function (res) {
        if (seq !== capSeq) return;
        var j = res.body;
        if (!j.ok) { cap.innerHTML = ''; var p = document.createElement('p'); p.textContent = j.error || 'Could not check capacity.'; cap.appendChild(p); return; }
        cap.innerHTML = '';
        var ul = document.createElement('ul');
        [j.limitText, j.usedText, j.availableText].forEach(function (t) { var li = document.createElement('li'); li.textContent = t; ul.appendChild(li); });
        var head = document.createElement('p');
        head.innerHTML = '<strong>Combination ' + j.canonical + '</strong> (' + j.permutations.join(', ') + ')';
        cap.appendChild(head);
        cap.appendChild(ul);
        if (j.full) {
          cap.classList.add('is-full');
          var m = document.createElement('p');
          m.innerHTML = '<strong>This number combination has already reached the ₱500 limit. Please choose another combination.</strong><br><span lang="fil">Naabot na ng combination na ito ang ₱500 limit. Pumili ng ibang combination.</span>';
          cap.appendChild(m);
        }
        if (cont) cont.disabled = !!j.full;
        var note = document.createElement('p');
        note.className = 'small';
        note.textContent = 'Live value; the server checks again when you confirm.';
        cap.appendChild(note);
      })
      .catch(function () {
        if (seq !== capSeq) return;
        cap.innerHTML = '<p>Could not load capacity. You can still continue — the server will check it.</p>';
        var b = document.createElement('button');
        b.type = 'button'; b.className = 'btn btn--sm btn--ghost'; b.textContent = 'Retry';
        b.addEventListener('click', function () { loadCapacity(value()); });
        cap.appendChild(b);
        if (cont) cont.disabled = false;
      });
  }
  keypad.addEventListener('click', function (e) {
    var k = e.target.closest('[data-key]');
    if (k && !k.disabled) {
      var v = value();
      if (v.length < 3 && v.indexOf(k.getAttribute('data-key')) < 0) input.value = v + k.getAttribute('data-key');
      render();
      var next = keys.filter(function (x) { return !x.disabled; })[0];
      if (value().length === 3) (cont || input).focus(); else if (next && document.activeElement === k) next.focus();
      return;
    }
    if (e.target.closest('[data-clear]')) { input.value = ''; render(); input.focus(); }
  });
  picker.addEventListener('click', function (e) {
    var rm = e.target.closest('[data-remove]');
    if (!rm) return;
    var i = Number(rm.getAttribute('data-remove'));
    var v = value();
    input.value = v.slice(0, i) + v.slice(i + 1);
    render();
    input.focus();
  });
  input.addEventListener('input', render);
  if (drawSelect) drawSelect.addEventListener('change', render);
  render();
})();
