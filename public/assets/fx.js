/* Pianostemmer'n — lyd og bevegelse. Ingen avhengigheter.
   Lyd spilles kun ved brukerklikk (Web Audio krever uansett en gest). */
(function () {
  'use strict';

  /* ---------- Lyd: enkel piano-aktig synth ---------- */
  var ctx = null;
  function audio() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  /* Én tone = grunnfrekvens + overtoner, med anslag og utklinging.
     detune (i cent) er avviket fra ren stemming — det er «suret». */
  function playNote(freq, opts) {
    opts = opts || {};
    var ac = audio();
    var t = ac.currentTime + (opts.delay || 0);
    var dur = opts.dur || 2.4;
    var master = ac.createGain();
    master.gain.setValueAtTime(0, t);
    master.gain.linearRampToValueAtTime(opts.gain || 0.16, t + 0.012);
    master.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    var lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2800;
    master.connect(lp);
    lp.connect(ac.destination);
    [[1, 1], [2, 0.32], [3, 0.11], [4, 0.05]].forEach(function (partial) {
      var o = ac.createOscillator();
      o.type = 'sine';
      o.frequency.value = freq * partial[0];
      o.detune.value = opts.detune || 0;
      var g = ac.createGain();
      g.gain.value = partial[1];
      o.connect(g);
      g.connect(master);
      o.start(t);
      o.stop(t + dur + 0.1);
    });
  }

  /* Et piano har 2–3 strenger per tone. Stemt: strengene ligger oppå
     hverandre. Ustemt: strengeparene spriker (svev) OG tonene har drevet
     skjevt i forhold til hverandre (center-avvik i cent). */
  function playString(freq, center, spread, delay) {
    playNote(freq, { detune: center - spread / 2, delay: delay, gain: 0.11 });
    playNote(freq, { detune: center + spread / 2, delay: delay, gain: 0.11 });
  }

  var CHORD = [261.63, 329.63, 392.0, 523.25]; /* C-dur: C4 E4 G4 C5 */

  function playChord(centers, spreads) {
    CHORD.forEach(function (freq, i) {
      playString(freq, centers[i], spreads[i], i * 0.045);
    });
  }

  var btnSur = document.getElementById('spill-ustemt');
  var btnRen = document.getElementById('spill-stemt');
  function flash(btn) {
    btn.classList.add('is-playing');
    setTimeout(function () { btn.classList.remove('is-playing'); }, 2400);
  }
  if (btnSur) btnSur.addEventListener('click', function () {
    /* Semitone-nivå surt: tonene ligger opptil godt over et halvt trinn
       skjevt (100 cent = én semitone), med stort svev i strengeparene og
       litt tilfeldig slingring per klikk — som et ekte vrak av et piano. */
    var jitter = function (base) { return base + (Math.random() - 0.5) * 40; };
    playChord(
      [jitter(-120), jitter(90), jitter(-70), jitter(140)],
      [60, 75, 55, 70]
    );
    flash(btnSur);
  });
  if (btnRen) btnRen.addEventListener('click', function () {
    playChord([0, 0, 0, 0], [2, 2, 2, 2]); /* samstemt → ren klang */
    flash(btnRen);
  });

  /* ---------- Spillbare tangenter ---------- */
  var keys = document.querySelectorAll('.klaviatur .key');
  function midiToFreq(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  keys.forEach(function (key) {
    var press = function () {
      playNote(midiToFreq(parseInt(key.dataset.midi, 10)), { dur: 1.8, gain: 0.2 });
      key.classList.add('is-down');
      setTimeout(function () { key.classList.remove('is-down'); }, 180);
    };
    key.addEventListener('pointerdown', press);
    key.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); press(); }
    });
  });

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Støv i scenelyset ---------- */
  var canvas = document.querySelector('.stov');
  if (canvas && !reduced) {
    var c2d = canvas.getContext('2d');
    var stage = canvas.parentElement;
    var W = 0, H = 0;
    var parts = [];
    function newPart(fraBunn) {
      return {
        x: Math.random() * W,
        y: fraBunn ? H + 4 : Math.random() * H,
        r: 0.6 + Math.random() * 1.6,
        vx: -(0.04 + Math.random() * 0.14),
        vy: -(0.07 + Math.random() * 0.2),
        a: 0.06 + Math.random() * 0.26,
        ph: Math.random() * Math.PI * 2
      };
    }
    function size() {
      W = canvas.width = stage.clientWidth;
      H = canvas.height = stage.clientHeight;
      var n = Math.max(12, Math.min(42, Math.floor(W / 36)));
      while (parts.length < n) parts.push(newPart(false));
      parts.length = n;
    }
    size();
    window.addEventListener('resize', size);
    var iSyne = true;
    new IntersectionObserver(function (entries) {
      iSyne = entries[0].isIntersecting;
    }).observe(stage);
    (function tick(t) {
      if (iSyne) {
        c2d.clearRect(0, 0, W, H);
        parts.forEach(function (p) {
          p.x += p.vx;
          p.y += p.vy;
          if (p.y < -4 || p.x < -4) {
            var ny = newPart(true);
            for (var k in ny) p[k] = ny[k];
          }
          var glimt = p.a * (0.55 + 0.45 * Math.sin(t / 900 + p.ph));
          c2d.beginPath();
          c2d.arc(p.x, p.y, p.r, 0, 7);
          c2d.fillStyle = 'rgba(233, 196, 150, ' + glimt.toFixed(3) + ')';
          c2d.fill();
        });
      }
      requestAnimationFrame(tick);
    })(0);
  }

  /* ---------- Scroll-reveal ---------- */
  var revealed = document.querySelectorAll('.reveal');
  if (!reduced && 'IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
    revealed.forEach(function (el) { io.observe(el); });
  } else {
    revealed.forEach(function (el) { el.classList.add('is-visible'); });
  }
})();
