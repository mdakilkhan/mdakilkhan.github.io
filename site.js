(function () {
  var root = document.documentElement;
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- theme toggle ---------- */
  function isDark() {
    var t = root.getAttribute('data-theme');
    if (t) return t === 'dark';
    return window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches;
  }
  var tb = document.getElementById('themeBtn');
  if (tb) tb.addEventListener('click', function () {
    var next = isDark() ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    try { localStorage.setItem('ak-theme', next); } catch (e) {}
    if (net) net.colors();
  });

  /* ---------- copy helpers ---------- */
  function copyText(text, btn, okLabel, el) {
    var orig = btn.textContent;
    function fallback() {
      if (el) { var r = document.createRange(); r.selectNodeContents(el); var s = getSelection(); s.removeAllRanges(); s.addRange(r); btn.textContent = 'Selected, press Ctrl+C'; }
      else { btn.textContent = 'Copy failed'; }
    }
    try {
      navigator.clipboard.writeText(text).then(function () { btn.textContent = okLabel; btn.classList.add('done'); }, fallback);
    } catch (e) { fallback(); }
    setTimeout(function () { btn.textContent = orig; btn.classList.remove('done'); }, 2000);
  }
  var cb = document.getElementById('copyBtn'), em = document.getElementById('email');
  if (cb && em) cb.addEventListener('click', function () { copyText(em.textContent, cb, 'Copied', em); });
  document.addEventListener('click', function (ev) {
    var b = ev.target.closest && ev.target.closest('.cite');
    if (b) copyText(b.getAttribute('data-cite'), b, 'Citation copied', null);
  });

  /* ---------- publication filter ---------- */
  var chips = [].slice.call(document.querySelectorAll('.chip'));
  chips.forEach(function (c) {
    c.addEventListener('click', function () {
      var f = c.getAttribute('data-f');
      chips.forEach(function (x) { x.setAttribute('aria-pressed', x === c ? 'true' : 'false'); });
      [].forEach.call(document.querySelectorAll('.pgroup'), function (g) {
        g.hidden = !(f === 'all' || g.getAttribute('data-group') === f);
      });
    });
  });

  /* ---------- preview routing (single-file preview only) ---------- */
  if (window.AK_PREVIEW) {
    var views = [].slice.call(document.querySelectorAll('.view'));
    var ids = views.map(function (v) { return v.getAttribute('data-view'); });
    var navLinks = [].slice.call(document.querySelectorAll('.nav a'));
    var route = function () {
      var n = location.hash.slice(1);
      if (n === 'contact') { var f = document.getElementById('contact'); if (f) f.scrollIntoView(); return; }
      if (ids.indexOf(n) < 0) n = 'home';
      views.forEach(function (v) { v.hidden = v.getAttribute('data-view') !== n; });
      navLinks.forEach(function (a) { if (a.getAttribute('href') === '#' + n) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
      window.scrollTo(0, 0);
      if (net && n === 'home') net.resize();
    };
    window.addEventListener('hashchange', route);
    setTimeout(route, 0);
  }

  /* ---------- diffusion network (independent cascade model) ---------- */
  var net = null;
  var cv = document.getElementById('net');
  if (cv && cv.getContext) net = (function () {
    var ctx = cv.getContext('2d'), stat = document.getElementById('netStat');
    var P = 0.35, N = 64, K = 3, HOP = 520;
    var W = 0, H = 0, nodes = [], edges = [], adj = [], col = {};
    var seed = 7;
    function rnd() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
    function colors() {
      var s = getComputedStyle(root);
      col = { line: s.getPropertyValue('--line').trim(), ink: s.getPropertyValue('--ink').trim(), muted: s.getPropertyValue('--muted').trim(),
        accent: s.getPropertyValue('--accent').trim(), surface: s.getPropertyValue('--surface').trim(), soft: s.getPropertyValue('--accent-soft').trim() };
    }
    function build() {
      seed = 7; nodes = []; edges = []; adj = [];
      var tries = 0;
      while (nodes.length < N && tries < 5000) {
        tries++;
        var x = .07 + rnd() * .86, y = .08 + rnd() * .84, ok = true;
        for (var i = 0; i < nodes.length; i++) { var dx = nodes[i].x - x, dy = (nodes[i].y - y); if (dx * dx + dy * dy < .0085) { ok = false; break; } }
        if (ok) nodes.push({ x: x, y: y, state: 0, t: 0, r: 2.6 + rnd() * 2.2 });
      }
      for (var a = 0; a < nodes.length; a++) adj.push([]);
      var seen = {};
      for (var a = 0; a < nodes.length; a++) {
        var d = nodes.map(function (n, j) { var dx = n.x - nodes[a].x, dy = n.y - nodes[a].y; return [dx * dx + dy * dy, j]; })
          .sort(function (u, v) { return u[0] - v[0]; });
        for (var k = 1; k <= K; k++) {
          var b = d[k][1], key = a < b ? a + '-' + b : b + '-' + a;
          if (seen[key]) continue; seen[key] = 1;
          var id = edges.length; edges.push({ a: a, b: b, from: -1, t0: 0, ok: false });
          adj[a].push([b, id]); adj[b].push([a, id]);
        }
      }
    }
    var running = false, reached = 0, lastStart = 0;
    function reset() { nodes.forEach(function (n) { n.state = 0; }); edges.forEach(function (e) { e.from = -1; e.ok = false; }); reached = 0; }
    function activate(i, t) {
      var n = nodes[i]; if (n.state) return;
      n.state = 1; n.t = t; reached++;
      adj[i].forEach(function (pair) {
        var j = pair[0], e = edges[pair[1]];
        if (nodes[j].state || e.from !== -1) return;
        e.from = i; e.t0 = t; e.ok = Math.random() < P;
      });
    }
    function start(i, t) { reset(); activate(i, t); running = true; lastStart = t; }
    function resize() {
      var r = cv.getBoundingClientRect(); if (!r.width) return;
      var d = Math.min(window.devicePixelRatio || 1, 2);
      W = r.width; H = r.height; cv.width = W * d; cv.height = H * d; ctx.setTransform(d, 0, 0, d, 0, 0);
      if (!running) draw(performance.now());
    }
    function px(n) { return [n.x * W, n.y * H]; }
    function draw(t) {
      ctx.clearRect(0, 0, W, H);
      var active = false;
      // edges
      edges.forEach(function (e) {
        var A = px(nodes[e.a]), B = px(nodes[e.b]);
        ctx.strokeStyle = col.line; ctx.lineWidth = 1; ctx.globalAlpha = 1;
        ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.stroke();
        if (e.from === -1) return;
        var S = e.from === e.a ? A : B, Tn = e.from === e.a ? B : A, to = e.from === e.a ? e.b : e.a;
        var k = (t - e.t0) / HOP;
        if (k < 1) {
          active = true;
          var len = e.ok ? k : Math.min(k, .45);
          var fade = e.ok ? 1 : Math.max(0, 1 - k);
          ctx.strokeStyle = col.accent; ctx.globalAlpha = fade * (e.ok ? 1 : .55); ctx.lineWidth = 1.8;
          ctx.beginPath(); ctx.moveTo(S[0], S[1]); ctx.lineTo(S[0] + (Tn[0] - S[0]) * len, S[1] + (Tn[1] - S[1]) * len); ctx.stroke();
          ctx.globalAlpha = fade; ctx.fillStyle = col.accent;
          ctx.beginPath(); ctx.arc(S[0] + (Tn[0] - S[0]) * len, S[1] + (Tn[1] - S[1]) * len, 2.6, 0, 6.283); ctx.fill();
        } else if (e.ok) {
          if (!nodes[to].state) activate(to, e.t0 + HOP);
          ctx.strokeStyle = col.accent; ctx.globalAlpha = .35; ctx.lineWidth = 1.4;
          ctx.beginPath(); ctx.moveTo(S[0], S[1]); ctx.lineTo(Tn[0], Tn[1]); ctx.stroke();
        }
        ctx.globalAlpha = 1;
      });
      // nodes
      nodes.forEach(function (n, i) {
        var p = px(n);
        if (n.state) {
          var age = (t - n.t) / 900;
          if (age < 1) {
            active = true;
            ctx.globalAlpha = (1 - age) * .5; ctx.fillStyle = col.accent;
            ctx.beginPath(); ctx.arc(p[0], p[1], n.r + 4 + age * 16, 0, 6.283); ctx.fill(); ctx.globalAlpha = 1;
          }
          ctx.fillStyle = col.accent;
          ctx.beginPath(); ctx.arc(p[0], p[1], n.r + 1.2, 0, 6.283); ctx.fill();
        } else {
          ctx.fillStyle = col.surface; ctx.strokeStyle = col.muted; ctx.lineWidth = 1.3;
          ctx.beginPath(); ctx.arc(p[0], p[1], n.r, 0, 6.283); ctx.fill(); ctx.stroke();
        }
      });
      if (stat) stat.textContent = 'reached ' + reached + ' of ' + nodes.length;
      return active;
    }
    function loop(t) {
      var active = draw(t);
      if (!active && running && !reduce && t - lastStart > 2600) {
        // pause on the finished cascade, then seed a new one
        if (!loop.wait) loop.wait = t;
        if (t - loop.wait > 2200) { loop.wait = 0; start(Math.floor(Math.random() * nodes.length), t); }
      }
      if (!reduce || active) requestAnimationFrame(loop);
      else running = false;
    }
    cv.addEventListener('click', function (ev) {
      var r = cv.getBoundingClientRect(), x = (ev.clientX - r.left) / r.width, y = (ev.clientY - r.top) / r.height, best = 0, bd = 9;
      nodes.forEach(function (n, i) { var d = (n.x - x) * (n.x - x) + (n.y - y) * (n.y - y); if (d < bd) { bd = d; best = i; } });
      loop.wait = 0; start(best, performance.now());
      if (reduce) requestAnimationFrame(loop);
    });
    colors(); build(); resize();
    if (window.matchMedia) { var mq = matchMedia('(prefers-color-scheme: dark)'); if (mq.addEventListener) mq.addEventListener('change', function () { colors(); }); }
    window.addEventListener('resize', resize);
    if (window.MutationObserver) new MutationObserver(colors).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
    var now = performance.now();
    start(Math.floor(nodes.length / 2), now);
    requestAnimationFrame(loop);
    return { colors: colors, resize: resize };
  })();
})();
