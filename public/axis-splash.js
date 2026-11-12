/*
 * UniteSpace splash screen.
 *   window.showAxisSplash(label?) — show it (again), e.g. right after sign-in;
 *   window.hideAxisSplash()      — hide once the app is ready; waits until the intro animation has played.
 * The markup for the first paint lives in index.html; later shows rebuild it.
 */
(function () {
  var script = document.currentScript;
  var base = script && script.src ? script.src.replace(/axis-splash\.js(\?.*)?$/, '') : '/';
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var MIN_VISIBLE_MS = reduced ? 300 : 2300;
  var FAILSAFE_MS = 15000;

  var raf = 0;
  var startedAt = 0;
  var hideTimer = 0;
  var failsafeTimer = 0;

  function markup(label) {
    return (
      '<div class="axis-splash__identity">' +
        '<div class="axis-splash__emblem">' +
          '<canvas class="axis-splash__particles" aria-hidden="true"></canvas>' +
          '<img class="axis-splash__mark" src="' + base + 'axis-splash-mark.svg" alt="" draggable="false">' +
        '</div>' +
        '<div class="axis-splash__word"><img src="' + base + 'axis-splash-word.svg" alt="UniteSpace" draggable="false"></div>' +
        '<p class="axis-splash__status">' + (label || '') + '</p>' +
        '<div class="axis-splash__loading" aria-hidden="true"></div>' +
      '</div>'
    );
  }

  function getRoot() {
    return document.getElementById('axis-splash');
  }

  function revealRest(root) {
    root.querySelector('.axis-splash__mark').classList.add('is-ready');
    root.querySelector('.axis-splash__word').classList.add('is-ready');
    root.querySelector('.axis-splash__status').classList.add('is-ready');
    root.querySelector('.axis-splash__loading').classList.add('is-ready');
  }

  function animate(root) {
    var mark = root.querySelector('.axis-splash__mark');
    var canvas = root.querySelector('.axis-splash__particles');
    if (reduced || !canvas.getContext) {
      revealRest(root);
      return;
    }

    // rAF is paused in background tabs; make sure the logo still shows up.
    window.setTimeout(function () { revealRest(root); }, 2200);

    var img = new Image();
    img.onerror = function () { revealRest(root); };
    img.onload = function () {
      var size = canvas.getBoundingClientRect().width || 184;
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(size * dpr);
      canvas.height = Math.round(size * dpr);
      var ctx = canvas.getContext('2d');
      ctx.scale(dpr, dpr);

      // Sample the mark's pixels to get the target points for the particles.
      var off = document.createElement('canvas');
      off.width = 160;
      off.height = 160;
      var oc = off.getContext('2d', { willReadFrequently: true });
      oc.drawImage(img, 12, 12, 136, 136);
      var pix;
      try {
        pix = oc.getImageData(0, 0, 160, 160).data;
      } catch (e) {
        revealRest(root);
        return;
      }

      var points = [];
      for (var y = 22; y < 140; y += 3) {
        for (var x = 22; x < 140; x += 3) {
          var i = (y * 160 + x) * 4;
          if (pix[i + 3] > 175 && Math.random() < 0.82) {
            points.push({ tx: x * size / 160, ty: y * size / 160, color: 'rgb(' + pix[i] + ',' + pix[i + 1] + ',' + pix[i + 2] + ')' });
          }
        }
      }

      var cx = size / 2;
      var cy = size / 2;
      var parts = points.map(function (p, idx) {
        var a = Math.atan2(p.ty - cy, p.tx - cx);
        var radius = size * (0.72 + Math.random() * 0.62);
        var side = idx % 2 ? 1 : -1;
        return {
          tx: p.tx, ty: p.ty, color: p.color,
          sx: cx + Math.cos(a + side * 0.9) * radius,
          sy: cy + Math.sin(a + side * 0.9) * radius,
          delay: Math.random() * 0.24,
          r: 0.55 + Math.random() * 0.7,
        };
      });

      var start = performance.now();
      function frame(now) {
        var t = Math.min((now - start) / 1900, 1);
        ctx.clearRect(0, 0, size, size);
        for (var k = 0; k < parts.length; k++) {
          var p = parts[k];
          var local = Math.max(0, Math.min(1, (t - p.delay) / (1 - p.delay)));
          var ease = 1 - Math.pow(1 - local, 3);
          var wobble = (1 - ease) * Math.sin(local * 12 + p.tx) * 6;
          ctx.globalAlpha = Math.min(1, local * 3) * (t > 0.78 ? Math.max(0, (1 - t) / 0.22) : 1);
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.sx + (p.tx - p.sx) * ease + wobble, p.sy + (p.ty - p.sy) * ease, p.r * (0.8 + 0.2 * ease), 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
        if (t > 0.48) mark.classList.add('is-ready');
        if (t < 1) {
          raf = requestAnimationFrame(frame);
        } else {
          ctx.clearRect(0, 0, size, size);
          revealRest(root);
        }
      }
      raf = requestAnimationFrame(frame);
    };
    img.src = base + 'axis-splash-mark.svg';
  }

  function show(label) {
    document.documentElement.classList.add('axis-splash-active');
    window.clearTimeout(hideTimer);
    window.clearTimeout(failsafeTimer);
    cancelAnimationFrame(raf);

    var root = getRoot();
    if (root) {
      root.classList.remove('is-hidden');
      var status = root.querySelector('.axis-splash__status');
      if (status && typeof label === 'string') status.textContent = label;
      if (root.dataset.started) {
        failsafeTimer = window.setTimeout(hideNow, FAILSAFE_MS);
        return;
      }
    } else {
      root = document.createElement('div');
      root.id = 'axis-splash';
      root.className = 'axis-splash';
      root.setAttribute('role', 'status');
      root.setAttribute('aria-live', 'polite');
      root.setAttribute('aria-label', 'Загрузка UniteSpace');
      root.innerHTML = markup(label);
      document.body.appendChild(root);
    }

    root.dataset.started = '1';
    startedAt = performance.now();
    failsafeTimer = window.setTimeout(hideNow, FAILSAFE_MS);
    animate(root);
  }

  function hideNow() {
    window.clearTimeout(hideTimer);
    window.clearTimeout(failsafeTimer);
    var root = getRoot();
    if (!root) return;
    cancelAnimationFrame(raf);
    root.classList.add('is-hidden');
    document.documentElement.classList.remove('axis-splash-active');
    window.setTimeout(function () {
      var current = getRoot();
      if (current && current.classList.contains('is-hidden')) current.remove();
    }, 420);
  }

  function hide() {
    if (!getRoot()) return;
    window.clearTimeout(hideTimer);
    var wait = Math.max(0, MIN_VISIBLE_MS - (performance.now() - startedAt));
    hideTimer = window.setTimeout(hideNow, wait);
  }

  window.showAxisSplash = show;
  window.hideAxisSplash = hide;

  var LABEL_KEY = 'axis-splash-label';

  // Shows the splash now and keeps its label for the next page when a redirect follows.
  window.showAxisSplashBeforeRedirect = function (label) {
    try { window.sessionStorage.setItem(LABEL_KEY, label || ''); } catch (e) { /* storage unavailable */ }
    show(label);
  };

  // First paint: index.html already contains the markup.
  var initial = getRoot();
  if (initial) {
    var carriedLabel = '';
    try {
      carriedLabel = window.sessionStorage.getItem(LABEL_KEY) || '';
      window.sessionStorage.removeItem(LABEL_KEY);
    } catch (e) { /* storage unavailable */ }
    initial.innerHTML = markup(carriedLabel);
    show();
  }
})();
