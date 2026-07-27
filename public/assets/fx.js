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
    /* tonene drar hver sin vei + store sprik i strengeparene → skikkelig surt */
    playChord([-16, 22, -10, 18], [48, 62, 44, 56]);
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

  /* ---------- Scroll-reveal ---------- */
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
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
