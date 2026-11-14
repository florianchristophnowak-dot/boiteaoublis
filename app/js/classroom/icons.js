/* ==========================================================================
   Symbole der Unterrichtsleiste – Kacheln, Schaltflächen, Münzen, Timer
   Alles wird als Inline-SVG erzeugt: keine Bilddatei, keine Symbolschrift.
   Jede Funktion bekommt das Zieldokument, weil dieselben Zeichen auch im
   eigenständigen Beamerfenster entstehen.

   Farben und Formen folgen dem Teacher Soundboard, aus dem die Leiste stammt:
   weißes Motiv auf farbiger Kachel, kühle Töne für Sozialformen, warme für
   Material – gleiche wahrgenommene Helligkeit, damit die Reihe als ein System
   wirkt.
   ========================================================================== */
(function (BAO) {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';
  var serial = 0;

  var TILE_COLORS = {
    plenum: '#2563eb', individual: '#7c3aed', partner: '#0d9488',
    group: '#16a34a', presentation: '#c026d3', stations: '#0891b2',
    binder: '#ea580c', book: '#dc2626', workbook: '#d97706',
    worksheet: '#64748b', pen: '#e11d48', tablet: '#4c6382', headphones: '#b45309',
    'phase-placeholder': '#3f4854', 'material-placeholder': '#3f4854',
    generic: '#475569', clear: '#7f1d1d'
  };

  /* Zustände der Kachel „Projektion“ (im Soundboard die Boîte-Kachel). */
  var BOITE_COLORS = { ready: '#2f6f8f', live: '#1d9a6c', blank: '#38424e' };

  /* Farben der Timer-Scheibe. */
  var TIMER = {
    idle: '#5d6874', paused: '#eda34d', done: '#df5d67', spent: '#39424f',
    plenty: '#63c6a0', low: '#eda34d'
  };

  function tileColor(key) { return TILE_COLORS[key] || TILE_COLORS.generic; }

  /** Farbe des Rests: grün, im letzten Fünftel orange, am Ende rot. */
  function timerArcColor(progress) {
    if (progress > 0.20) return TIMER.plenty;
    return progress > 0 ? TIMER.low : TIMER.done;
  }

  function el(doc, tag, attrs, children) {
    var node = doc.createElementNS(SVG_NS, tag);
    Object.keys(attrs || {}).forEach(function (key) {
      if (attrs[key] !== null && attrs[key] !== undefined) node.setAttribute(key, attrs[key]);
    });
    (children || []).forEach(function (child) { if (child) node.appendChild(child); });
    return node;
  }

  function svg(doc, viewBox, className, children) {
    return el(doc, 'svg', {
      viewBox: viewBox, 'class': className, 'aria-hidden': 'true', focusable: 'false'
    }, children);
  }

  /* --- Motive der Kacheln --------------------------------------------------- */

  function hasGlyph(key) { return !!(BAO.classroomGlyphs && BAO.classroomGlyphs[key]); }

  /** Das weiße Motiv einer Kachel. Unbekannte Schlüssel bekommen drei Punkte. */
  function glyph(doc, key) {
    if (hasGlyph(key)) {
      return svg(doc, '0 0 512 512', 'cr-glyph', [
        el(doc, 'path', { d: BAO.classroomGlyphs[key], fill: 'currentColor', 'fill-rule': 'evenodd' })
      ]);
    }
    return svg(doc, '0 0 100 100', 'cr-glyph', [28, 50, 72].map(function (x) {
      return el(doc, 'circle', { cx: x, cy: 50, r: 7, fill: 'none', stroke: 'currentColor', 'stroke-width': 5 });
    }));
  }

  /* --- Schaltflächen -------------------------------------------------------- */

  function stroke(width) {
    return { fill: 'none', stroke: 'currentColor', 'stroke-width': width || 7,
      'stroke-linecap': 'round', 'stroke-linejoin': 'round' };
  }

  function line(doc, x1, y1, x2, y2, width) {
    return el(doc, 'path', Object.assign({ d: 'M' + x1 + ' ' + y1 + 'L' + x2 + ' ' + y2 }, stroke(width)));
  }

  function filled(doc, d) { return el(doc, 'path', { d: d, fill: 'currentColor' }); }

  /** Unterstützungsstufe als Balkenreihe – ohne eine einzige Ziffer. */
  function levelBars(doc, x, y, width, height, level, dimmed) {
    var total = 3;
    var gap = width * 0.10;
    var barWidth = (width - gap * (total - 1)) / total;
    var nodes = [];
    for (var index = 0; index < total; index++) {
      // Ansteigende Höhe: Auch ohne Farbe bleibt die Reihenfolge ablesbar.
      var share = 0.45 + 0.55 * (index / (total - 1));
      var barHeight = height * share;
      var attrs = {
        x: (x + index * (barWidth + gap)).toFixed(2), y: (y + height - barHeight).toFixed(2),
        width: barWidth.toFixed(2), height: barHeight.toFixed(2),
        rx: (Math.min(barWidth, barHeight) * 0.35).toFixed(2)
      };
      if (index < level) {
        attrs.fill = 'currentColor';
        if (dimmed) attrs['fill-opacity'] = 0.67;
      } else {
        attrs.fill = 'none';
        attrs.stroke = 'currentColor';
        attrs['stroke-opacity'] = 0.5;
        attrs['stroke-width'] = Math.max(1.2, height * 0.10).toFixed(2);
      }
      nodes.push(el(doc, 'rect', attrs));
    }
    return nodes;
  }

  var ACTIONS = {
    play: function (doc) { return [filled(doc, 'M34 26L74 50 34 74z')]; },
    pause: function (doc) {
      return [el(doc, 'rect', { x: 30, y: 26, width: 13, height: 48, rx: 2, fill: 'currentColor' }),
        el(doc, 'rect', { x: 57, y: 26, width: 13, height: 48, rx: 2, fill: 'currentColor' })];
    },
    reset: function (doc) {
      return [el(doc, 'path', Object.assign({ d: 'M62.5 28.3A25 25 0 1 0 73.5 58.6' }, stroke(7))),
        filled(doc, 'M79.3 42.6L83.8 62.3 63.2 54.8z')];
    },
    plus: function (doc) { return [line(doc, 28, 50, 72, 50), line(doc, 50, 28, 50, 72)]; },
    minus: function (doc) { return [line(doc, 28, 50, 72, 50)]; },
    sound: function (doc) {
      return [filled(doc, 'M22 39H34L48 24V76L34 61H22z'),
        el(doc, 'path', Object.assign({ d: 'M61.2 63.1A16 16 0 0 0 61.2 36.9' }, stroke(6))),
        el(doc, 'path', Object.assign({ d: 'M68.1 72.9A28 28 0 0 0 68.1 27.1' }, stroke(6)))];
    },
    stop: function (doc) {
      return [el(doc, 'rect', { x: 29, y: 29, width: 42, height: 42, rx: 6, fill: 'currentColor' })];
    },
    menu: function (doc) {
      return [[34, 34], [66, 34], [34, 66], [66, 66]].map(function (p) {
        return el(doc, 'circle', { cx: p[0], cy: p[1], r: 6.5, fill: 'currentColor' });
      });
    },
    prev: function (doc) { return [filled(doc, 'M64 26L30 50 64 74z'), line(doc, 23, 28, 23, 72)]; },
    next: function (doc) { return [filled(doc, 'M36 26L70 50 36 74z'), line(doc, 77, 28, 77, 72)]; },
    eye: function (doc) {
      return [el(doc, 'path', Object.assign({ d: 'M20 50Q50 20 80 50Q50 80 20 50z' }, stroke(7))),
        el(doc, 'circle', { cx: 50, cy: 50, r: 9, fill: 'currentColor' })];
    },
    'eye-off': function (doc) { return ACTIONS.eye(doc).concat([line(doc, 22, 76, 78, 24, 8)]); },
    live: function (doc) {
      return [el(doc, 'path', Object.assign({
        d: 'M32 24H68A10 10 0 0 1 78 34V54A10 10 0 0 1 68 64H52L36 78 40 64H32A10 10 0 0 1 22 54V34A10 10 0 0 1 32 24z'
      }, stroke(7))), line(doc, 38, 44, 62, 44), line(doc, 50, 32, 50, 56)];
    },
    level1: function (doc) { return levelBars(doc, 22, 26, 56, 48, 1); },
    level2: function (doc) { return levelBars(doc, 22, 26, 56, 48, 2); },
    level3: function (doc) { return levelBars(doc, 22, 26, 56, 48, 3); }
  };

  /** Zeichen einer runden Schaltfläche (Start, Pause, Plus …). */
  function action(doc, name) {
    var draw = ACTIONS[name] || ACTIONS.menu;
    return svg(doc, '0 0 100 100', 'cr-action', draw(doc));
  }

  /* --- Kachel „Projektion“ ---------------------------------------------------
     Eine Leinwand auf ihrem Ständer. Läuft eine Projektion, stehen Zeilen
     darauf; ist sie ausgeblendet, hängt das Rollo herunter. */

  function boite(doc, state, level) {
    var nodes = [
      el(doc, 'rect', Object.assign({ x: 17, y: 16, width: 66, height: 42, rx: 5 }, stroke(5.5))),
      line(doc, 50, 58, 50, 67, 5.5), line(doc, 38, 67, 62, 67, 5.5)
    ];
    if (state === 'live') {
      [[26.08, 47.5], [37, 34.3], [47.92, 40.9]].forEach(function (row) {
        nodes.push(el(doc, 'rect', { x: 26.24, y: row[0], width: row[1], height: 5, rx: 2.5, fill: 'currentColor' }));
      });
    } else if (state === 'blank') {
      nodes.push(el(doc, 'rect', { x: 24.9, y: 34.1, width: 50.2, height: 5.9, rx: 2.95, fill: 'currentColor' }));
    }
    if ((state === 'live' || state === 'blank') && level) {
      nodes = nodes.concat(levelBars(doc, 24, 74, 52, 16, level, state === 'blank'));
    }
    return svg(doc, '0 0 100 100', 'cr-glyph', nodes);
  }

  /* --- Münzen ------------------------------------------------------------------
     Die Klangtasten sehen aus wie im Soundboard: nummerierte Münzen in Gold,
     Silber und Bronze mit Glanzlicht, Punktrand und einer leicht schräg
     sitzenden Ziffer. Ein eigenes Bild ersetzt die Münze (siehe panel.js). */

  var COIN_PALETTES = [
    { base: [240, 205, 90], edge: [170, 120, 20] },
    { base: [210, 210, 220], edge: [120, 120, 130] },
    { base: [200, 140, 90], edge: [120, 70, 35] }
  ];
  var COIN_TILT = [-6, 5, -3, 7, -5, 4, -7, 3];

  function rgb(c) { return 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')'; }

  function coin(doc, number) {
    var palette = COIN_PALETTES[(number - 1) % COIN_PALETTES.length];
    var id = 'cr-coin-' + (++serial);
    var light = palette.base.map(function (v) { return Math.min(v + 35, 255); });

    var gradient = el(doc, 'radialGradient', {
      id: id, gradientUnits: 'userSpaceOnUse', cx: 50, cy: 50, r: 58, fx: 32.5, fy: 28.7
    }, [
      el(doc, 'stop', { offset: 0, 'stop-color': rgb(light) }),
      el(doc, 'stop', { offset: 0.45, 'stop-color': rgb(palette.base) }),
      el(doc, 'stop', { offset: 1, 'stop-color': rgb(palette.edge) })
    ]);

    var nodes = [
      el(doc, 'defs', {}, [gradient]),
      el(doc, 'circle', { cx: 50, cy: 50, r: 47, fill: 'url(#' + id + ')', stroke: rgb(palette.edge), 'stroke-width': 4 }),
      el(doc, 'circle', { cx: 50, cy: 50, r: 38.5, fill: 'none', stroke: '#fff', 'stroke-opacity': 0.47, 'stroke-width': 1.8 })
    ];
    for (var i = 0; i < 18; i++) {
      var angle = (i / 18) * 2 * Math.PI;
      nodes.push(el(doc, 'circle', {
        cx: (50 + Math.cos(angle) * 43.6).toFixed(2), cy: (50 + Math.sin(angle) * 43.6).toFixed(2),
        r: 1.8, fill: '#fff', 'fill-opacity': 0.47
      }));
    }
    nodes.push(el(doc, 'path', {
      d: 'M85.1 29.8A40.5 40.5 0 0 0 19 24', fill: 'none', stroke: '#fff', 'stroke-opacity': 0.55,
      'stroke-width': 3, 'stroke-linecap': 'round'
    }));

    var font = '"Comic Sans MS", "Segoe Print", "Arial Rounded MT Bold", "Segoe UI", Arial, sans-serif';
    var tilt = 'rotate(' + COIN_TILT[(number - 1) % COIN_TILT.length] + ' 50 50)';
    function digit(attrs) {
      var text = el(doc, 'text', Object.assign({
        x: 50, y: 68, 'text-anchor': 'middle', 'font-family': font, 'font-size': 52, 'font-weight': 700,
        transform: tilt
      }, attrs));
      text.textContent = String(number);
      return text;
    }
    nodes.push(digit({ x: 52, y: 70, fill: '#000', 'fill-opacity': 0.35 }));
    nodes.push(digit({ fill: '#fff', stroke: '#000', 'stroke-width': 6, 'stroke-linejoin': 'round', 'paint-order': 'stroke' }));

    return svg(doc, '0 0 100 100', 'cr-coin__face', nodes);
  }

  /* --- Timer-Scheibe -------------------------------------------------------------
     Restzeit als schrumpfender Kreisausschnitt, bewusst ohne Ziffern: Der
     Ausschnitt zeigt die verbleibende Zeit als Fläche und ist damit auch aus
     der letzten Reihe ablesbar. Er beginnt bei zwölf Uhr und reicht im
     Uhrzeigersinn so weit, wie noch Zeit bleibt. */

  function pieD(progress) {
    var p = Math.max(0, Math.min(1, progress));
    if (p <= 0) return '';
    if (p >= 0.9999) return 'M0 -49A49 49 0 1 1 0 49A49 49 0 1 1 0 -49z';
    var angle = p * 2 * Math.PI;
    var x = 49 * Math.sin(angle);
    var y = -49 * Math.cos(angle);
    return 'M0 0L0 -49A49 49 0 ' + (p > 0.5 ? 1 : 0) + ' 1 ' + x.toFixed(2) + ' ' + y.toFixed(2) + 'z';
  }

  /**
   * @returns {{node: SVGElement, set: function(number, string)}}
   * set(progress, state) mit state = idle | running | paused | done
   */
  function dial(doc) {
    var disc = el(doc, 'circle', { cx: 0, cy: 0, r: 49, fill: TIMER.idle });
    var rest = el(doc, 'path', { d: '', fill: TIMER.plenty });
    var node = svg(doc, '-50 -50 100 100', 'cr-dial__svg', [disc, rest]);
    var last = '';
    function set(progress, state) {
      var key = state + ':' + (state === 'running' || state === 'paused' ? progress.toFixed(4) : '');
      if (key === last) return;
      last = key;
      if (state === 'idle' || state === 'done') {
        disc.setAttribute('fill', state === 'idle' ? TIMER.idle : TIMER.done);
        rest.setAttribute('d', '');
        return;
      }
      disc.setAttribute('fill', TIMER.spent);
      rest.setAttribute('fill', state === 'paused' ? TIMER.paused : timerArcColor(progress));
      rest.setAttribute('d', pieD(progress));
    }
    return { node: node, set: set };
  }

  BAO.classroomIcons = {
    TILE_COLORS: TILE_COLORS,
    BOITE_COLORS: BOITE_COLORS,
    TIMER: TIMER,
    tileColor: tileColor,
    timerArcColor: timerArcColor,
    hasGlyph: hasGlyph,
    glyph: glyph,
    action: action,
    boite: boite,
    coin: coin,
    dial: dial,
    pieD: pieD
  };
})(window.BAO = window.BAO || {});
