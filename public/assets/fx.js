/* Pianostemmer'n — lyd og bevegelse. Ingen avhengigheter.
   Lyd spilles kun ved brukerklikk (Web Audio krever uansett en gest). */
(function () {
  'use strict';

  function tilListe(nodeList) { return Array.prototype.slice.call(nodeList); }

  /* ---------- Lyd: enkel piano-aktig synth ----------
     iOS er kresen på to måter, og begge er håndtert her:
     1) Web Audio havner i «ambient»-kategorien og blir stum av
        ringebryteren på siden av telefonen. audioSession-kategorien
        «playback» overstyrer det (Safari 16.4+); eldre iOS trenger at
        et HTMLAudioElement har spilt av minst én gang.
     2) WebKit godtar i praksis bare click/touchend/keydown som gesten
        som låser opp lyd — pointerdown teller ikke. Derfor låses lyden
        opp av en egen lytter, og toner som ble bedt om før den tid
        settes i kø og spilles så snart konteksten faktisk går. */
  var ctx = null;      /* AudioContext */
  var buss = null;     /* felles utgang: gain → kompressor → høyttaler */
  var ko = [];         /* toner som venter på at konteksten våkner */
  var sesjonSatt = false;
  var STILLE_WAV = 'data:audio/wav;base64,UklGRuwAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YcgAAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgA==';

  function lagKontekst() {
    if (ctx) return ctx;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    /* Alt går gjennom én kompressor, slik at en full akkord (åtte
       strenger med overtoner) ikke klipper når vi skrur opp nivået. */
    buss = ctx.createGain();
    buss.gain.value = 0.9;
    var komp = ctx.createDynamicsCompressor();
    komp.threshold.value = -14;
    komp.knee.value = 24;
    komp.ratio.value = 8;
    komp.attack.value = 0.004;
    komp.release.value = 0.2;
    buss.connect(komp);
    komp.connect(ctx.destination);
    /* iOS setter «interrupted» etter Siri, en telefon eller skjermlås. */
    ctx.onstatechange = function () {
      if (ctx.state === 'running') tomKo();
    };
    return ctx;
  }

  function settSesjon() {
    if (sesjonSatt) return;
    sesjonSatt = true;
    try {
      if (navigator.audioSession) {
        navigator.audioSession.type = 'playback';
        return;
      }
    } catch (e) { /* ikke støttet — fall gjennom */ }
    /* Eldre iOS: å spille av et mediaelement bytter lydkategori. */
    try {
      var el = new Audio(STILLE_WAV);
      el.setAttribute('playsinline', '');
      el.volume = 0.001;
      el.loop = true;
      var p = el.play();
      if (p && p.catch) p.catch(function () {});
      setTimeout(function () { el.pause(); }, 800);
    } catch (e2) { /* ikke kritisk */ }
  }

  /* Låser opp en kontekst som allerede finnes. Vi lager den ikke her —
     da ville et hvilket som helst klikk på siden ha startet en lydsesjon
     og stoppet musikken folk hører på. */
  function lasOpp() {
    if (!ctx) return;
    if (ctx.state === 'running') { tomKo(); return; }
    var p = ctx.resume();
    if (p && p.then) p.then(tomKo, function () {}); else tomKo();
  }

  function tomKo() {
    if (!ctx || ctx.state !== 'running') return;
    var na = new Date().getTime();
    var venter = ko;
    ko = [];
    venter.forEach(function (post) {
      /* Ikke fyr av gamle anslag hvis opplåsingen tok lang tid. */
      if (na - post.tid < 1500) post.fn();
    });
  }

  /* Kjør fn nå hvis lyden går — ellers sett den i kø og prøv å låse opp. */
  function medLyd(fn) {
    var ac = lagKontekst();
    if (!ac) return;
    settSesjon();
    if (ac.state === 'running') { fn(); return; }
    ko.push({ fn: fn, tid: new Date().getTime() });
    lasOpp();
  }

  /* WebKit låser opp lyd på disse — ikke på pointerdown/touchstart. */
  ['touchend', 'click', 'keydown'].forEach(function (navn) {
    document.addEventListener(navn, lasOpp, true);
  });
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && ctx && ctx.state !== 'running') lasOpp();
  });

  /* Én tone = grunnfrekvens + overtoner, med anslag og utklinging.
     detune (i cent) er avviket fra ren stemming — det er «suret».
     Overtonene er kraftige med vilje: mobilhøyttalere gjengir nesten
     ingenting under ~500 Hz, så en ren sinus på C4 blir uhørbar. Det er
     overtonene som bærer tonehøyden på en liten høyttaler. */
  var OVERTONER = [[1, 1], [2, 0.55], [3, 0.32], [4, 0.2], [5, 0.12], [6, 0.07]];

  function playNote(freq, opts) {
    opts = opts || {};
    medLyd(function () {
      var ac = ctx;
      var t = ac.currentTime + (opts.delay || 0);
      var dur = opts.dur || 2.4;
      var master = ac.createGain();
      master.gain.setValueAtTime(0, t);
      master.gain.linearRampToValueAtTime(opts.gain || 0.3, t + 0.012);
      master.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      var lp = ac.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 5200;
      master.connect(lp);
      lp.connect(buss);
      OVERTONER.forEach(function (partial, i) {
        var o = ac.createOscillator();
        o.type = 'sine';
        o.frequency.value = freq * partial[0];
        o.detune.value = opts.detune || 0;
        var g = ac.createGain();
        /* Høye overtoner dør fortest — som på et ekte piano. */
        g.gain.setValueAtTime(partial[1], t);
        g.gain.exponentialRampToValueAtTime(
          partial[1] * 0.02, t + dur / (1 + i * 0.5)
        );
        o.connect(g);
        g.connect(master);
        o.start(t);
        o.stop(t + dur + 0.1);
      });
    });
  }

  /* Et piano har 2–3 strenger per tone. Stemt: strengene ligger oppå
     hverandre. Ustemt: strengeparene spriker (svev) OG tonene har drevet
     skjevt i forhold til hverandre (center-avvik i cent). */
  function playString(freq, center, spread, delay) {
    playNote(freq, { detune: center - spread / 2, delay: delay, gain: 0.2 });
    playNote(freq, { detune: center + spread / 2, delay: delay, gain: 0.2 });
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
  var keys = tilListe(document.querySelectorAll('.klaviatur .key'));
  function midiToFreq(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  keys.forEach(function (key) {
    var sisteAnslag = 0;
    var press = function () {
      /* pointerdown gir raskest respons, men på iOS er det ikke en gyldig
         gest for lyd — der bærer touchend/click anslaget i stedet. Vakten
         hindrer at begge to fyrer av samme tone. */
      var na = new Date().getTime();
      if (na - sisteAnslag < 300) return;
      sisteAnslag = na;
      playNote(midiToFreq(parseInt(key.getAttribute('data-midi'), 10)),
        { dur: 1.8, gain: 0.42 });
      key.classList.add('is-down');
      setTimeout(function () { key.classList.remove('is-down'); }, 180);
    };
    key.addEventListener('pointerdown', press);
    key.addEventListener('click', press);
    key.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); press(); }
    });
  });

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Pianostreng-scrollbar ---------- */
  var streng = document.querySelector('.streng');
  if (streng) {
    var strengVenter = false;
    var stram = function () {
      var maks = document.documentElement.scrollHeight - window.innerHeight;
      streng.style.width = (maks > 0 ? (window.scrollY / maks) * 100 : 0) + '%';
      strengVenter = false;
    };
    window.addEventListener('scroll', function () {
      if (!strengVenter) { strengVenter = true; requestAnimationFrame(stram); }
    }, { passive: true });
    stram();
  }

  /* ---------- Mus-parallax i hero (kun mus/desktop) ---------- */
  var scene = document.querySelector('.hero-stage');
  if (scene && !reduced && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    var mx = 0, my = 0, tx = 0, ty = 0, glir = false;
    scene.addEventListener('mousemove', function (e) {
      var r = scene.getBoundingClientRect();
      tx = ((e.clientX - r.left) / r.width - 0.5) * 2;
      ty = ((e.clientY - r.top) / r.height - 0.5) * 2;
      if (!glir) { glir = true; requestAnimationFrame(gli); }
    });
    function gli() {
      mx += (tx - mx) * 0.06;
      my += (ty - my) * 0.06;
      scene.style.setProperty('--mx', mx.toFixed(4));
      scene.style.setProperty('--my', my.toFixed(4));
      if (Math.abs(tx - mx) + Math.abs(ty - my) > 0.002) {
        requestAnimationFrame(gli);
      } else {
        glir = false;
      }
    }
  }

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
  var revealed = tilListe(document.querySelectorAll('.reveal'));
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
