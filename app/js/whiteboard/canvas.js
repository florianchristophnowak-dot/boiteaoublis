/* ==========================================================================
   Whiteboard – Zeichenfläche
   Eine unbegrenzte Fläche für Handschrift. Der Stift schreibt, der Finger
   verschiebt und zoomt (zwei Finger), die Maus kann beides. Gezeichnet wird
   in Weltkoordinaten; die Ansicht (Mitte + Zoomstufe) rechnet sie auf den
   Bildschirm um – deshalb bleibt alles in jeder Vergrößerung scharf.

   Zwei übereinanderliegende Leinwände: die untere trägt alle fertigen
   Striche, die obere nur das, was sich gerade bewegt (den entstehenden
   Strich, den Radierer, das Lasso, die Auswahl). So muss während des
   Schreibens nie die ganze Fläche neu gezeichnet werden.

   Striche landen im Bestand (BAO.store) und werden wie alles andere lokal
   gespeichert, exportiert und per Strg + Z zurückgenommen.
   ========================================================================== */
(function (BAO) {
  'use strict';

  var util = BAO.util;
  var ink = BAO.ink;
  var schema = BAO.schema;
  var select = BAO.select;

  var MIN_ZOOM = 0.15;
  var MAX_ZOOM = 6;
  var GRID_STEP = 40;                 // Linienabstand in Weltpixeln

  /* --- Werkzeuge --------------------------------------------------------------- */

  var TOOLS = [
    { id: 'pen',         label: 'Stift',            key: 't', hint: 'schreibt wie ein Füller – die Breite folgt dem Druck' },
    { id: 'marker',      label: 'Marker',           key: 'm', hint: 'breiter Filzstift' },
    { id: 'highlighter', label: 'Textmarker',       key: 'x', hint: 'halbtransparent, liegt hinter der Tinte' },
    { id: 'stamp',       label: 'Korrekturzeichen', key: 'k', altKey: 'u', hint: 'Häkchen, Kürzel und Unterstreichungen: Tippen setzt das Zeichen, Ziehen unterstreicht' },
    { id: 'eraser',      label: 'Radierer',         key: 'r', hint: 'ganze Striche oder nur Teile' },
    { id: 'lasso',       label: 'Auswahl',          key: 'l', hint: 'einkreisen – dann verschieben, umfärben, löschen' },
    { id: 'hand',        label: 'Verschieben',      key: 'h', hint: 'Fläche verschieben (auch mit Stift oder Maus)' }
  ];

  /* Farben sind Schlüssel: dieselbe Tinte bleibt auf hellem und dunklem Grund
     lesbar. Blau, Rot und Grün entsprechen den Genusfarben der App. */
  var INK_COLORS = ['ink', 'blue', 'red', 'green', 'orange', 'amber', 'purple', 'grey'];
  var HIGHLIGHT_COLORS = ['yellow', 'mint', 'sky', 'pink', 'peach'];
  var COLOR_LABELS = {
    ink: 'Tinte', blue: 'Blau', red: 'Rot', green: 'Grün', orange: 'Orange', amber: 'Ocker',
    purple: 'Violett', grey: 'Grau', yellow: 'Gelb', mint: 'Mint', sky: 'Himmelblau', pink: 'Rosa', peach: 'Pfirsich'
  };
  var FALLBACK_COLORS = {
    paper: '#fdfcfa', grid: '#e4ded4', select: '#2b7bb9', muted: '#6b7382',
    ink: '#1a1f28', blue: '#0f3f96', red: '#9c1223', green: '#10603a', orange: '#c26240',
    amber: '#9a6512', purple: '#5c4a99', grey: '#6b7382',
    yellow: '#f6d13c', mint: '#8fe3b3', sky: '#8ecbf5', pink: '#f5a3c7', peach: '#f9b98a'
  };

  var WIDTHS = {
    pen: [1.6, 2.4, 3.6],
    marker: [4, 6, 9],
    highlighter: [14, 20, 28],
    underline: [1.6, 2.4, 3.6]
  };
  var WIDTH_LABELS = ['fein', 'mittel', 'breit'];

  /* Der Stift schreibt wie ein Füller: Druck macht die Linie breiter. Diese
     Stufen legen fest, wie stark – die Härte der Feder. Ohne Drucksensor
     (Maus, Finger, einfache Stifte) zählt stattdessen das Schreibtempo. */
  var PEN_PRESSURES = [
    { id: 'off',    label: 'aus',    hint: 'Gleichmäßige Linie – Druck und Tempo ändern die Breite nicht' },
    { id: 'normal', label: 'normal', hint: 'Wie ein Füller: leicht aufgesetzt fein, fest aufgedrückt breit' },
    { id: 'strong', label: 'stark',  hint: 'Wie ein Füller mit weicher Feder: Haarlinien und kräftige Abstriche' }
  ];
  var ERASER_SIZES = [8, 16, 32];     // Radius in Bildschirmpixeln
  var STAMP_SIZES = [22, 30, 44];
  var MARK_DRAG = 8;                  // ab so vielen Bildschirmpixeln zur Seite wird aus dem Tipp eine Unterstreichung

  /* Korrekturzeichen – Formen und Kürzel wie in Capy-note. Die drei
     handschriftlichen Zeichen sind Vektoren in einem 100×100-Raster.
     Die Unterstreichung gehört dazu: Sie entsteht mit demselben Werkzeug,
     in der Farbe des gewählten Zeichens und so kräftig wie dessen Strich
     (WIDTHS.underline und STAMP_SIZES laufen deshalb über dieselbe Stufe). */
  var STAMP_PATHS = {
    check:         { main: 'M 24 36 Q 24 52 28 66 Q 31 78 36 72 Q 55 38 88 9', width: 8 },
    check_crossed: { main: 'M 24 36 Q 24 52 28 66 Q 31 78 36 72 Q 55 38 88 9', accent: 'M 48 45 Q 60 44 74 45', width: 8 },
    omission:      { main: 'M 23 16 Q 31 40 45 86 Q 61 40 81 16', width: 8.5 }
  };
  var STAMPS = [
    { id: 'check',         variant: 'check',         label: 'Häkchen',                      color: 'red' },
    { id: 'check_crossed', variant: 'check_crossed', label: 'halbes Häkchen (durchgestrichen)', color: 'red' },
    { id: 'omission',      variant: 'omission',      label: 'Auslassungszeichen',           color: 'red' },
    { id: 'gr',   variant: 'text', text: 'Gr',   label: 'Grammatik',    color: 'red' },
    { id: 'o',    variant: 'text', text: 'O',    label: 'Orthographie', color: 'orange' },
    { id: 'v',    variant: 'text', text: 'V',    label: 'Vokabular',    color: 'amber' },
    { id: 'conj', variant: 'text', text: 'Conj', label: 'Konjugation',  color: 'green' },
    { id: 'acc',  variant: 'text', text: 'Acc',  label: 'Akzent',       color: 'blue' },
    { id: 'g',    variant: 'text', text: 'G',    label: 'Genus',        color: 'purple' }
  ];
  var UNDERLINE_STYLES = [
    { id: 'solid',  label: 'durchgezogen', glyph: '—' },
    { id: 'dashed', label: 'gestrichelt',  glyph: '– –' },
    { id: 'dotted', label: 'gepunktet',    glyph: '···' },
    { id: 'wavy',   label: 'wellig',       glyph: '∿' }
  ];

  var DEFAULT_TOOLS = {
    tool: 'pen',
    pen:         { color: 'ink', width: 1, pressure: 'normal' },
    marker:      { color: 'blue', width: 1 },
    highlighter: { color: 'yellow', width: 1 },
    underline:   { style: 'solid', double: false, hook: false },   // Farbe und Stärke kommen vom Korrekturzeichen
    stamp:       { color: 'red', size: 1, stamp: 'check' },
    eraser:      { mode: 'stroke', size: 1 },
    touchDraws:  false
  };

  var CANVAS_FONT = '"Segoe UI", system-ui, -apple-system, Roboto, "Helvetica Neue", Arial, sans-serif';

  function stampDef(id) {
    for (var i = 0; i < STAMPS.length; i++) if (STAMPS[i].id === id) return STAMPS[i];
    return STAMPS[0];
  }

  function toolDef(id) {
    for (var i = 0; i < TOOLS.length; i++) if (TOOLS[i].id === id) return TOOLS[i];
    return null;
  }

  function isDrawingTool(id) { return id === 'pen' || id === 'marker' || id === 'highlighter'; }

  function penPressureDef(id) {
    for (var i = 0; i < PEN_PRESSURES.length; i++) if (PEN_PRESSURES[i].id === id) return PEN_PRESSURES[i];
    return null;
  }

  /** Zuletzt gewählte Werkzeuge aus den Einstellungen, mit Rückfallwerten. */
  function readTools() {
    var saved = (BAO.store.getState().settings || {}).whiteboard || {};
    var tools = util.clone(DEFAULT_TOOLS);
    Object.keys(DEFAULT_TOOLS).forEach(function (key) {
      if (saved[key] === undefined) return;
      if (typeof DEFAULT_TOOLS[key] === 'object') Object.assign(tools[key], saved[key]);
      else tools[key] = saved[key];
    });
    // Unterstreichen war einmal ein eigenes Werkzeug und gehört jetzt zu den Korrekturzeichen.
    if (tools.tool === 'underline') tools.tool = 'stamp';
    if (!toolDef(tools.tool)) tools.tool = 'pen';
    ['pen', 'marker', 'highlighter'].forEach(function (id) {
      tools[id].width = util.clamp(parseInt(tools[id].width, 10) || 0, 0, 2);
    });
    tools.stamp.size = util.clamp(parseInt(tools.stamp.size, 10) || 0, 0, 2);
    tools.eraser.size = util.clamp(parseInt(tools.eraser.size, 10) || 0, 0, 2);
    if (tools.eraser.mode !== 'partial') tools.eraser.mode = 'stroke';
    if (!penPressureDef(tools.pen.pressure)) tools.pen.pressure = 'normal';
    return tools;
  }

  function saveTools(tools) {
    BAO.store.commit('Werkzeug gewählt', function (draft) {
      draft.settings.whiteboard = util.clone(tools);
    }, { undoable: false });
  }

  /* --- Zugriff auf den Bestand ------------------------------------------------- */

  function mutate(whiteboardId, label, fn, options) {
    return BAO.store.commit(label, function (draft) {
      var board = select.whiteboard(draft, whiteboardId);
      if (!board) return false;
      if (fn(board, draft) === false) return false;
      board.updatedAt = util.nowISO();
    }, options);
  }

  function addStroke(whiteboardId, stroke) {
    return mutate(whiteboardId, 'Strich gezeichnet', function (board) { board.strokes.push(stroke); });
  }

  function replaceStrokes(whiteboardId, strokes, label) {
    return mutate(whiteboardId, label || 'Striche geändert', function (board) { board.strokes = util.clone(strokes); });
  }

  function setView(whiteboardId, view) {
    return mutate(whiteboardId, 'Whiteboard-Ansicht', function (board) {
      board.view = { cx: ink.round1(view.cx), cy: ink.round1(view.cy), zoom: Math.round(view.zoom * 1000) / 1000 };
    }, { undoable: false });
  }

  function setBackground(whiteboardId, background) {
    return mutate(whiteboardId, 'Whiteboard-Hintergrund', function (board) { board.background = background; });
  }

  function clearStrokes(whiteboardId) {
    return mutate(whiteboardId, 'Whiteboard geleert', function (board) {
      if (!board.strokes.length) return false;
      board.strokes = [];
    });
  }

  /* --- Farben ------------------------------------------------------------------- */

  function resolveColors(doc) {
    var out = Object.assign({}, FALLBACK_COLORS);
    try {
      var style = (doc || document).defaultView.getComputedStyle((doc || document).documentElement);
      Object.keys(FALLBACK_COLORS).forEach(function (key) {
        var value = style.getPropertyValue('--wb-' + (key === 'paper' || key === 'grid' || key === 'select' || key === 'muted' ? key : 'c-' + key)).trim();
        if (value) out[key] = value;
      });
    } catch (err) { /* ohne Stylesheet bleiben die Rückfallfarben */ }
    return out;
  }

  function colorOf(colors, key) {
    if (!key) return colors.ink;
    if (key.charAt(0) === '#') return key;
    return colors[key] || colors.ink;
  }

  /* --- Zeichnen ------------------------------------------------------------------ */

  function applyView(ctx, view, size) {
    var ox = view.cx - size.w / 2 / view.zoom;
    var oy = view.cy - size.h / 2 / view.zoom;
    ctx.setTransform(size.dpr * view.zoom, 0, 0, size.dpr * view.zoom,
      -ox * view.zoom * size.dpr, -oy * view.zoom * size.dpr);
  }

  function visibleBox(view, size) {
    var ox = view.cx - size.w / 2 / view.zoom;
    var oy = view.cy - size.h / 2 / view.zoom;
    return { x0: ox, y0: oy, x1: ox + size.w / view.zoom, y1: oy + size.h / view.zoom };
  }

  function drawBackground(ctx, kind, colors, size, view) {
    ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
    ctx.fillStyle = colors.paper;
    ctx.fillRect(0, 0, size.w, size.h);
    if (kind !== 'lines' && kind !== 'grid' && kind !== 'dots') return;

    var zoom = view.zoom;
    var step = GRID_STEP;
    while (step * zoom < 14) step *= 2;         // stark verkleinert: gröberes Raster
    var ox = view.cx - size.w / 2 / zoom;
    var oy = view.cy - size.h / 2 / zoom;
    var startX = Math.floor(ox / step) * step;
    var startY = Math.floor(oy / step) * step;
    var endX = ox + size.w / zoom;
    var endY = oy + size.h / zoom;
    var x, y;

    ctx.strokeStyle = colors.grid;
    ctx.fillStyle = colors.grid;
    ctx.lineWidth = 1;
    if (kind === 'dots') {
      for (x = startX; x <= endX; x += step) {
        for (y = startY; y <= endY; y += step) {
          ctx.beginPath();
          ctx.arc((x - ox) * zoom, (y - oy) * zoom, 1.3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      return;
    }
    ctx.beginPath();
    for (y = startY; y <= endY; y += step) {
      var sy = Math.round((y - oy) * zoom) + 0.5;
      ctx.moveTo(0, sy);
      ctx.lineTo(size.w, sy);
    }
    if (kind === 'grid') {
      for (x = startX; x <= endX; x += step) {
        var sx = Math.round((x - ox) * zoom) + 0.5;
        ctx.moveTo(sx, 0);
        ctx.lineTo(sx, size.h);
      }
    }
    ctx.stroke();
  }

  /* Ein Strich wird als Folge von Kurvenstücken gezeichnet: Stück i führt
     vom Mittelpunkt vor dem Stützpunkt i zum Mittelpunkt dahinter, mit dem
     Stützpunkt als Kontrollpunkt. Das glättet die Handschrift, ohne dass
     Punkte verloren gehen. */
  function tracePiece(ctx, pts, n, i) {
    var x = pts[3 * i];
    var y = pts[3 * i + 1];
    if (i === 0) {
      if (n > 1) ctx.lineTo((x + pts[3]) / 2, (y + pts[4]) / 2);
    } else if (i < n - 1) {
      ctx.quadraticCurveTo(x, y, (x + pts[3 * i + 3]) / 2, (y + pts[3 * i + 4]) / 2);
    } else {
      ctx.lineTo(x, y);
    }
  }

  function traceAll(ctx, pts) {
    var n = pts.length / 3;
    ctx.moveTo(pts[0], pts[1]);
    for (var i = 0; i < n; i++) tracePiece(ctx, pts, n, i);
  }

  /* --- Tinte mit wechselnder Breite ---------------------------------------------
     Stift und Marker werden nicht als Linie gezogen, sondern als Fläche
     gefüllt: die Spur einer runden Feder, deren Breite sich stufenlos
     ändert. Die Mittellinie ist dieselbe geglättete Kurve wie oben; an jedem
     Stützpunkt gilt die Breite aus dem Druck, dazwischen geht sie so weich
     über wie die Kurve selbst. So läuft der Strich spitz aus, wo der Druck
     nachlässt, und hat nirgends einen Absatz.

     Die Fläche ist EIN geschlossener Umriss: die rechte Seite des Strichs
     entlang, um das runde Ende herum und die linke Seite zurück. Zwei
     Stützstellen verbindet ein Trapez; am Knick dazwischen bekommt die
     Außenseite einen Bogen und die Innenseite den Eckpunkt, in dem sich die
     beiden Kanten schneiden. Wo es diesen Eckpunkt nicht gibt (enge Kringel,
     Spitzkehren), läuft die Innenseite über die Mittellinie. So bleibt jedes
     Teilstück für sich richtig herum, und mit der Füllregel „nonzero“
     entsteht auch dort kein Loch, wo der Strich sich selbst überdeckt.

     Ein Umriss ohne innere Kanten ist schneller gefüllt als viele kleine
     Teilflächen – und sauberer: Überlappende Flächen in einem Pfad lassen je
     nach Rasterverfahren feine helle Nähte im Strich zurück. Eigene Kreise
     und Hüllen bekommt nur, was ein Trapez nicht trifft: Stellen, an denen
     die Breite sprunghaft wechselt. */

  var TAU = Math.PI * 2;
  var INK_FLATNESS = 0.05;            // erlaubte Abweichung von der Kurve in Gerätepixeln
  var INK_HULL = 2;                   // erlaubte Abweichung vom Trapez zur genauen Hülle, in Vielfachen davon

  var inkX = [], inkY = [], inkR = [];  // Stützstellen der Mittellinie mit Radius
  var inkA = [], inkB = [];             // rechte und linke Seite des Umrisses
  var inkSteepAt = [];                  // Teilstücke, deren Breite sprunghaft wechselt

  /** Nimmt eine Stützstelle auf; fällt sie auf die vorige, zählt der größere Kreis. */
  function inkSample(x, y, r) {
    var m = inkX.length;
    if (m) {
      var dx = x - inkX[m - 1];
      var dy = y - inkY[m - 1];
      if (dx * dx + dy * dy < 1e-8) {
        if (r > inkR[m - 1]) inkR[m - 1] = r;
        return;
      }
    }
    inkX.push(x);
    inkY.push(y);
    inkR.push(r);
  }

  /** Zahl der Sehnen, die einen Bogen mit diesem Öffnungswinkel genau genug nachzeichnen. */
  function inkArcSteps(r, sweep, tol) {
    if (r <= tol) return 1;
    var steps = Math.ceil(sweep / (2 * Math.acos(1 - tol / r)));
    return steps < 1 ? 1 : steps;
  }

  /** Kreis als Vieleck – im selben Drehsinn wie der Umriss. */
  function inkDisc(path, x, y, r, tol) {
    var steps = inkArcSteps(r, TAU, tol);
    if (steps < 6) steps = 6;
    path.moveTo(x + r, y);
    for (var i = 1; i < steps; i++) {
      var a = i / steps * TAU;
      path.lineTo(x + r * Math.cos(a), y + r * Math.sin(a));
    }
    path.closePath();
    return steps;
  }

  /** Fläche zwischen zwei Kreisen entlang ihrer äußeren Tangenten (d = Abstand der Mitten). */
  function inkHull(path, ax, ay, ar, bx, by, br, d) {
    var ux = (bx - ax) / d;
    var uy = (by - ay) / d;
    var k = (ar - br) / d;
    var s = Math.sqrt(1 - k * k);
    var px = k * ux - s * uy, py = k * uy + s * ux;
    var qx = k * ux + s * uy, qy = k * uy - s * ux;
    path.moveTo(ax + ar * px, ay + ar * py);
    path.lineTo(ax + ar * qx, ay + ar * qy);
    path.lineTo(bx + br * qx, by + br * qy);
    path.lineTo(bx + br * px, by + br * py);
    path.closePath();
  }

  /** Weicht das Trapez zwischen zwei Kreisen sichtbar von ihrer genauen Hülle ab? */
  function inkSteep(ra, rb, d, tol) {
    var dr = rb > ra ? rb - ra : ra - rb;
    if (dr >= d) return true;                      // ein Kreis liegt ganz im anderen
    var k = dr / d;
    return (ra > rb ? ra : rb) * (1 - Math.sqrt(1 - k * k)) > INK_HULL * tol;
  }

  /**
   * Legt die Fläche eines Strichs in einen Pfad (Leinwand oder Path2D) und
   * liefert die Zahl seiner Eckpunkte. scale sind Gerätepixel je Weltpixel:
   * So fein wird die Kurve unterteilt.
   */
  function traceInk(path, stroke, minWidth, scale) {
    var pts = stroke.points;
    var n = pts.length / 3;
    var tol = INK_FLATNESS / scale;
    var X = inkX, Y = inkY, R = inkR, A = inkA, B = inkB, steepAt = inkSteepAt;
    X.length = Y.length = R.length = A.length = B.length = steepAt.length = 0;

    // 1. Die geglättete Mittellinie abtasten: Ort und halbe Breite je Stützstelle.
    var rp;                           // Radius am vorigen, am aktuellen und am nächsten Stützpunkt
    var ri = Math.max(ink.widthAt(stroke, pts[2]), minWidth) / 2;
    var rn = ri;
    inkSample(pts[0], pts[1], ri);
    if (n > 1) {
      rn = Math.max(ink.widthAt(stroke, pts[5]), minWidth) / 2;
      inkSample((pts[0] + pts[3]) / 2, (pts[1] + pts[4]) / 2, (ri + rn) / 2);
      for (var i = 1; i < n - 1; i++) {
        rp = ri;
        ri = rn;
        rn = Math.max(ink.widthAt(stroke, pts[3 * i + 5]), minWidth) / 2;
        var cx = pts[3 * i], cy = pts[3 * i + 1];
        var sx = (pts[3 * i - 3] + cx) / 2, sy = (pts[3 * i - 2] + cy) / 2, sr = (rp + ri) / 2;
        var ex = (cx + pts[3 * i + 3]) / 2, ey = (cy + pts[3 * i + 4]) / 2, er = (ri + rn) / 2;
        // So viele Teilstücke, dass weder die Kurve noch der Verlauf der Breite sichtbar eckig wird.
        var hx = sx - 2 * cx + ex, hy = sy - 2 * cy + ey;
        var bend = Math.sqrt(hx * hx + hy * hy) / 4;
        var swell = Math.abs(sr - 2 * ri + er) / 4;
        var steps = Math.ceil(Math.sqrt(Math.max(bend, swell * 1.6) / tol));
        if (steps < 1) steps = 1; else if (steps > 24) steps = 24;
        for (var j = 1; j <= steps; j++) {
          var t = j / steps;
          var u = 1 - t;
          inkSample(u * u * sx + 2 * u * t * cx + t * t * ex, u * u * sy + 2 * u * t * cy + t * t * ey,
            u * u * sr + 2 * u * t * ri + t * t * er);
        }
      }
      inkSample(pts[3 * n - 3], pts[3 * n - 2], rn);
    }
    var m = X.length;
    if (m === 1) return inkDisc(path, X[0], Y[0], R[0], tol);

    // 2. Beide Seiten des Umrisses sammeln. n ist die Normale des laufenden
    //    Teilstücks; A liegt in Laufrichtung rechts (−n), B links (+n).
    var x = X[0], y = Y[0], r = R[0];
    var dx = X[1] - x, dy = Y[1] - y;
    var d = Math.sqrt(dx * dx + dy * dy);
    var nx = -dy / d, ny = dx / d;
    var qx, qy, dp, g, k, a, c, s, st;
    A.push(x - r * nx, y - r * ny);
    B.push(x + r * nx, y + r * ny);
    if (inkSteep(r, R[1], d, tol)) steepAt.push(0);
    for (g = 1; g < m - 1; g++) {
      x = X[g]; y = Y[g]; r = R[g];
      qx = nx; qy = ny; dp = d;                    // voriges Teilstück
      dx = X[g + 1] - x; dy = Y[g + 1] - y;
      d = Math.sqrt(dx * dx + dy * dy);
      nx = -dy / d; ny = dx / d;
      if (inkSteep(r, R[g + 1], d, tol)) steepAt.push(g);
      var cross = qx * ny - qy * nx;
      var dot = qx * nx + qy * ny;
      var outer, inner, so;
      if (cross > 1e-9 || (dot < 0 && cross > -1e-9)) {
        // Linkskurve (oder genaue Kehrtwende): rechts außen, links innen
        outer = A; inner = B; so = -1;
        a = cross > 1e-9 ? Math.atan2(cross, dot) : Math.PI;
      } else if (cross < -1e-9) {
        outer = B; inner = A; so = 1;
        a = Math.atan2(cross, dot);
      } else {
        A.push(x - r * nx, y - r * ny);            // geradeaus: ein Punkt je Seite
        B.push(x + r * nx, y + r * ny);
        continue;
      }
      // Außen: Ende des vorigen Teilstücks, Bogen um die Stützstelle, Anfang des nächsten.
      outer.push(x + so * r * qx, y + so * r * qy);
      st = inkArcSteps(r, a < 0 ? -a : a, tol);
      for (k = 1; k < st; k++) {
        c = Math.cos(a * k / st);
        s = Math.sin(a * k / st);
        outer.push(x + so * r * (qx * c - qy * s), y + so * r * (qx * s + qy * c));
      }
      outer.push(x + so * r * nx, y + so * r * ny);
      // Innen: der Schnittpunkt der beiden Kanten – aber nur, wenn jedes der
      // beiden Trapeze die Ecke des anderen enthält. Dann ist das Stück, das
      // der Umriss damit ausspart, von beiden gedeckt, und es fehlt nichts.
      var si = -so;
      var corner = false;
      var ac = cross < 0 ? -cross : cross;
      var ad = dot < 0 ? -dot : dot;
      var rq = R[g - 1], rz = R[g + 1];
      if (r * ac < dp && r * ac < d && ad * dp <= dp + (rq - r) * ac && ad * d <= d + (rz - r) * ac) {
        var spx = X[g - 1] + si * rq * qx, spy = Y[g - 1] + si * rq * qy;
        var ax = x + si * r * qx - spx, ay = y + si * r * qy - spy;
        var snx = x + si * r * nx, sny = y + si * r * ny;
        var bx = X[g + 1] + si * rz * nx - snx, by = Y[g + 1] + si * rz * ny - sny;
        var den = ax * by - ay * bx;
        if (den > 1e-12 || den < -1e-12) {
          var wx = snx - spx, wy = sny - spy;
          var ta = (wx * by - wy * bx) / den;
          var tb = (wx * ay - wy * ax) / den;
          if (ta >= 0 && ta <= 1 && tb >= 0 && tb <= 1) {
            inner.push(spx + ta * ax, spy + ta * ay);
            corner = true;
          }
        }
      }
      if (!corner) inner.push(x + si * r * qx, y + si * r * qy, x, y, x + si * r * nx, y + si * r * ny);
    }
    x = X[m - 1]; y = Y[m - 1]; r = R[m - 1];
    A.push(x - r * nx, y - r * ny);
    B.push(x + r * nx, y + r * ny);

    // 3. Der Umriss: rechte Seite vor, rundes Ende, linke Seite zurück, runder Anfang.
    var count = (A.length + B.length) / 2;
    path.moveTo(A[0], A[1]);
    for (k = 2; k < A.length; k += 2) path.lineTo(A[k], A[k + 1]);
    st = inkArcSteps(r, Math.PI, tol);
    count += st - 1;
    for (k = 1; k < st; k++) {
      c = Math.cos(Math.PI * k / st);
      s = Math.sin(Math.PI * k / st);
      path.lineTo(x - r * (nx * c - ny * s), y - r * (nx * s + ny * c));
    }
    for (k = B.length - 2; k >= 0; k -= 2) path.lineTo(B[k], B[k + 1]);
    x = X[0]; y = Y[0]; r = R[0];
    dx = X[1] - x; dy = Y[1] - y;
    d = Math.sqrt(dx * dx + dy * dy);
    nx = -dy / d; ny = dx / d;                     // Normale des ersten Teilstücks
    st = inkArcSteps(r, Math.PI, tol);
    count += st - 1;
    for (k = 1; k < st; k++) {
      c = Math.cos(Math.PI * k / st);
      s = Math.sin(Math.PI * k / st);
      path.lineTo(x + r * (nx * c - ny * s), y + r * (nx * s + ny * c));
    }
    path.closePath();

    // 4. Wo die Breite sprunghaft wechselt (ein Tupfer, ein jäher Druckstoß),
    //    reicht das Trapez nicht: Dort kommen die genaue Hülle und ihre runden Enden dazu.
    var last = -1;
    for (k = 0; k < steepAt.length; k++) {
      g = steepAt[k];
      dx = X[g + 1] - X[g]; dy = Y[g + 1] - Y[g];
      d = Math.sqrt(dx * dx + dy * dy);
      if (last !== g) count += inkDisc(path, X[g], Y[g], R[g], tol);
      if (d > Math.abs(R[g + 1] - R[g])) {
        inkHull(path, X[g], Y[g], R[g], X[g + 1], Y[g + 1], R[g + 1], d);
        count += 4;
      }
      count += inkDisc(path, X[g + 1], Y[g + 1], R[g + 1], tol);
      last = g + 1;
    }
    return count;
  }

  /* Die Fläche eines fertigen Strichs wird einmal berechnet und als Pfad
     aufbewahrt – wie beim Rahmen gilt die Kennung mit einer kleinen Signatur
     als Schlüssel. Neu berechnet wird erst, wenn eine deutlich stärkere
     Vergrößerung eine feinere Unterteilung verlangt. */
  var inkPaths = new Map();
  var inkPathLoad = 0;                // Eckpunkte aller aufbewahrten Pfade
  var INK_PATH_LIMIT = 1500000;

  function inkQuality(scale) {
    var quality = 1;
    while (quality < scale && quality < 32) quality *= 2;
    return quality;
  }

  function inkSignature(stroke) {
    var pts = stroke.points;
    var n = pts.length;
    return n + ':' + pts[0] + ',' + pts[1] + ',' + pts[2] + ':' + pts[n - 3] + ',' + pts[n - 2] + ',' + pts[n - 1]
      + ':' + stroke.width + ':' + stroke.tool + ':' + (stroke.nib || '');
  }

  function inkPath(stroke, quality) {
    var sig = inkSignature(stroke);
    var entry = inkPaths.get(stroke.id);
    if (entry && entry.sig === sig && entry.quality === quality) return entry.path;
    if (entry) inkPathLoad -= entry.load;
    var path = new Path2D();
    var load = traceInk(path, stroke, 0, quality);
    if (inkPathLoad + load > INK_PATH_LIMIT) { inkPaths.clear(); inkPathLoad = 0; }
    inkPaths.set(stroke.id, { sig: sig, quality: quality, path: path, load: load });
    inkPathLoad += load;
    return path;
  }

  function forgetInkPaths() {
    inkPaths.clear();
    inkPathLoad = 0;
  }

  /** Gerätepixel je Weltpixel der Leinwand, so wie sie gerade eingestellt ist. */
  function scaleOf(ctx) {
    try {
      var m = ctx.getTransform();
      return Math.sqrt(m.a * m.a + m.b * m.b) || 1;
    } catch (err) {
      return 1;
    }
  }

  /** Füllt Stift- oder Markertinte. cached: Der Strich ist fertig, sein Pfad darf aufbewahrt werden. */
  function fillInk(ctx, stroke, minWidth, scale, cached) {
    var quality = inkQuality(scale);
    if (cached && !minWidth) {
      ctx.fill(inkPath(stroke, quality));
      return;
    }
    ctx.beginPath();
    traceInk(ctx, stroke, minWidth, quality);
    ctx.fill();
  }

  var pathCache = {};
  function stampPath(d) {
    if (!pathCache[d]) pathCache[d] = new Path2D(d);
    return pathCache[d];
  }

  function drawStamp(ctx, stroke, color) {
    var size = Math.max(6, stroke.size);
    ctx.save();
    if (stroke.variant === 'text') {
      ctx.fillStyle = color;
      ctx.font = '700 ' + (size * 0.62) + 'px ' + CANVAS_FONT;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(stroke.text || '', stroke.x, stroke.y);
    } else {
      var def = STAMP_PATHS[stroke.variant] || STAMP_PATHS.check;
      ctx.translate(stroke.x - size / 2, stroke.y - size / 2);
      ctx.scale(size / 100, size / 100);
      ctx.strokeStyle = color;
      ctx.lineWidth = def.width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke(stampPath(def.main));
      if (def.accent) ctx.stroke(stampPath(def.accent));
    }
    ctx.restore();
  }

  /** Unterstreichung wie in Capy-note: Stil, einfach/doppelt, Häkchen rechts. */
  function drawUnderline(ctx, stroke, color, minWidth) {
    var lw = Math.max(stroke.width, minWidth || 0, 0.4);
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    ctx.lineCap = 'round';
    ink.underlineLines(stroke).forEach(function (yy) {
      ctx.beginPath();
      if (stroke.style === 'wavy') {
        ctx.setLineDash([]);
        var amp = ink.waveAmplitude(lw);
        var wl = ink.waveLength(lw);
        var stepPx = Math.max(0.5, wl / 10);
        for (var px = 0; px < stroke.w; px += stepPx) {
          var wy = yy + Math.sin((px / wl) * Math.PI * 2) * amp;
          if (px === 0) ctx.moveTo(stroke.x, wy); else ctx.lineTo(stroke.x + px, wy);
        }
        ctx.lineTo(stroke.x + stroke.w, yy + Math.sin((stroke.w / wl) * Math.PI * 2) * amp);
      } else {
        if (stroke.style === 'dashed') ctx.setLineDash([lw * 4, lw * 2.2]);
        else if (stroke.style === 'dotted') ctx.setLineDash([lw * 0.4, lw * 2.2]);
        else ctx.setLineDash([]);
        ctx.moveTo(stroke.x, yy);
        ctx.lineTo(stroke.x + stroke.w, yy);
      }
      ctx.stroke();
    });
    var hook = ink.underlineHook(stroke);
    if (hook) {
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(hook[0], hook[1]);
      ctx.lineTo(hook[2], hook[3]);
      ctx.stroke();
    }
    ctx.restore();
  }

  /**
   * Zeichnet einen Strich. scale (Gerätepixel je Weltpixel) wird sonst von
   * der Leinwand erfragt; cached erlaubt, die Fläche fertiger Tinte
   * aufzubewahren – für den gerade entstehenden Strich bleibt es weg.
   */
  function drawStroke(ctx, stroke, colors, minWidth, scale, cached) {
    var color = colorOf(colors, stroke.color);
    minWidth = minWidth || 0;
    if (stroke.tool === 'stamp') { drawStamp(ctx, stroke, color); return; }
    if (stroke.tool === 'underline') { drawUnderline(ctx, stroke, color, minWidth); return; }
    var pts = stroke.points;
    var n = pts.length / 3;
    if (!n) return;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineJoin = 'round';
    if (stroke.tool === 'highlighter') {
      ctx.globalAlpha = 0.42;
      ctx.lineCap = 'butt';
      if (n === 1) {
        ctx.beginPath();
        ctx.arc(pts[0], pts[1], stroke.width / 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.lineWidth = Math.max(stroke.width, minWidth);
        ctx.beginPath();
        traceAll(ctx, pts);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      return;
    }
    if (n === 1) {
      ctx.beginPath();
      ctx.arc(pts[0], pts[1], Math.max(ink.dotWidth(stroke), minWidth) / 2, 0, TAU);
      ctx.fill();
      return;
    }
    fillInk(ctx, stroke, minWidth, scale || scaleOf(ctx), cached);
  }

  /* Rahmen werden je Strich zwischengespeichert; der Bestand tauscht die
     Objekte bei jeder Änderung aus, deshalb gilt die Kennung mit einer
     kleinen Signatur der Geometrie als Schlüssel. */
  var boxCache = new Map();
  function signature(stroke) {
    if (stroke.tool === 'underline') return stroke.x + ',' + stroke.y + ',' + stroke.w + ',' + stroke.width + ',' + stroke.double + ',' + stroke.hook + ',' + stroke.style;
    if (stroke.tool === 'stamp') return stroke.x + ',' + stroke.y + ',' + stroke.size;
    var pts = stroke.points;
    return pts.length + ':' + pts[0] + ',' + pts[1] + ':' + stroke.width;
  }
  function boxOf(stroke) {
    var cached = boxCache.get(stroke.id);
    var sig = signature(stroke);
    if (cached && cached.sig === sig) return cached.box;
    var box = ink.bbox(stroke);
    boxCache.set(stroke.id, { sig: sig, box: box });
    if (boxCache.size > 20000) boxCache.clear();
    return box;
  }

  /**
   * Zeichnet eine Strichliste: Textmarker zuerst, damit sie hinter der
   * Tinte liegen. options: { colors, cull, exclude, minWidth }
   */
  function drawStrokes(ctx, strokes, options) {
    options = options || {};
    var colors = options.colors || resolveColors();
    var cull = options.cull || null;
    var exclude = options.exclude || null;
    var scale = scaleOf(ctx);
    var later = [];
    strokes.forEach(function (stroke) {
      if (exclude && exclude[stroke.id]) return;
      if (cull && !ink.boxesIntersect(boxOf(stroke), cull)) return;
      if (stroke.tool === 'highlighter') drawStroke(ctx, stroke, colors, options.minWidth, scale, true);
      else later.push(stroke);
    });
    later.forEach(function (stroke) { drawStroke(ctx, stroke, colors, options.minWidth, scale, true); });
  }

  /** Kleines Vorschaubild für die Kacheln der Übersicht. */
  function thumbnail(board, width, height) {
    var canvas = document.createElement('canvas');
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    var ctx = canvas.getContext('2d');
    var size = { w: width, h: height, dpr: dpr };
    var colors = resolveColors();
    var strokes = board.strokes || [];
    var box = ink.contentBox(strokes);
    var view = box
      ? ink.fitView(box, width, height, 10, { min: 0.02, max: 1.2 })
      : { cx: 0, cy: 0, zoom: 0.5 };
    drawBackground(ctx, board.background, colors, size, view);
    applyView(ctx, view, size);
    drawStrokes(ctx, strokes, { colors: colors, minWidth: 1.2 / view.zoom });
    return canvas;
  }

  /* --- Steuerung einer Fläche ------------------------------------------------- */

  var viewMemory = {};                // zuletzt gesehene Ansicht je Whiteboard (für Neuaufbauten)

  function modalOpen() {
    var root = document.getElementById('modal-root');
    return !!(root && root.firstChild);
  }

  function isTyping(event) {
    var target = event.target;
    if (!target) return false;
    var tag = (target.tagName || '').toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable;
  }

  /**
   * Baut die Zeichenfläche in einen Behälter und liefert die Steuerung.
   * options: { whiteboardId }
   */
  function mount(container, options) {
    options = options || {};
    var whiteboardId = options.whiteboardId;
    var doc = container.ownerDocument;
    var win = doc.defaultView;

    var inkCanvas = doc.createElement('canvas');
    inkCanvas.className = 'wb-ink';
    var liveCanvas = doc.createElement('canvas');
    liveCanvas.className = 'wb-live';
    container.appendChild(inkCanvas);
    container.appendChild(liveCanvas);
    var ictx = inkCanvas.getContext('2d');
    var lctx = liveCanvas.getContext('2d');

    var size = { w: 0, h: 0, dpr: 1 };
    var colors = resolveColors(doc);
    var tools = readTools();
    var board = currentBoard();
    var view = viewMemory[whiteboardId]
      ? Object.assign({}, viewMemory[whiteboardId])
      : (board && board.view ? { cx: board.view.cx || 0, cy: board.view.cy || 0, zoom: util.clamp(board.view.zoom || 1, MIN_ZOOM, MAX_ZOOM) } : { cx: 0, cy: 0, zoom: 1 });
    var selection = { ids: [], set: {}, box: null };
    var gesture = null;                 // laufende Eingabe (siehe start…-Funktionen)
    var touches = new Map();            // aktive Finger: pointerId -> {x, y}
    var hover = null;                   // Stift/Maus über der Fläche (Radierer-Kreis)
    var spaceDown = false;
    var listeners = [];
    var dirty = { ink: true, live: true };
    var frame = 0;
    var lastPaint = { view: null, ms: 0 };
    var settleTimer = null;
    var wheelBurst = false;
    var appending = false;              // der gerade gespeicherte Strich wird auf die Tinte gesetzt
    var destroyed = false;

    function currentBoard() { return select.whiteboard(BAO.store.getState(), whiteboardId); }
    function strokesNow() {
      if (gesture && gesture.working) return gesture.working;
      var b = currentBoard();
      return b ? b.strokes : [];
    }
    function strokeById(id) {
      var list = strokesNow();
      for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
      return null;
    }

    function emit(reason) {
      listeners.forEach(function (fn) {
        try { fn(reason, api); } catch (err) { console.error('Fehler im Whiteboard-Beobachter:', err); }
      });
    }

    /* --- Koordinaten ---------------------------------------------------------- */

    function screenPoint(event) {
      var rect = inkCanvas.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    }
    function toWorld(p) {
      return { x: view.cx + (p.x - size.w / 2) / view.zoom, y: view.cy + (p.y - size.h / 2) / view.zoom };
    }
    function rememberView() {
      viewMemory[whiteboardId] = { cx: view.cx, cy: view.cy, zoom: view.zoom };
    }
    var persistView = util.debounce(function () {
      if (destroyed) return;
      rememberView();
      setView(whiteboardId, view);
    }, 800);
    function viewChanged() {
      dirty.ink = true;
      dirty.live = true;
      schedule();
      persistView();
      emit('view');
    }

    /* --- Zeichnen --------------------------------------------------------------- */

    function schedule() {
      if (frame || destroyed) return;
      frame = win.requestAnimationFrame(tick);
    }
    function tick() {
      frame = 0;
      if (destroyed) return;
      if (dirty.ink) { dirty.ink = false; paintInkOrShift(); }
      if (dirty.live) { dirty.live = false; paintLive(); }
    }

    /* Beim Verschieben einer großen Fläche wird nicht jedes Bild neu
       gezeichnet: Die fertige Leinwand wird per CSS verschoben und skaliert,
       und erst nach einer kurzen Ruhe folgt der saubere Neuaufbau. */
    function paintInkOrShift() {
      var shifting = (gesture && (gesture.kind === 'pan' || gesture.kind === 'pinch')) || wheelBurst;
      if (shifting && lastPaint.view && lastPaint.ms > 9) {
        var lv = lastPaint.view;
        var ox = view.cx - size.w / 2 / view.zoom;
        var oy = view.cy - size.h / 2 / view.zoom;
        var lox = lv.cx - size.w / 2 / lv.zoom;
        var loy = lv.cy - size.h / 2 / lv.zoom;
        inkCanvas.style.transformOrigin = '0 0';
        inkCanvas.style.transform = 'translate(' + ((lox - ox) * view.zoom) + 'px,' + ((loy - oy) * view.zoom) + 'px) scale(' + (view.zoom / lv.zoom) + ')';
        if (settleTimer) clearTimeout(settleTimer);
        settleTimer = setTimeout(function () {
          settleTimer = null;
          wheelBurst = false;
          if (destroyed) return;
          paintInk();
          if (dirty.live) { dirty.live = false; paintLive(); }
        }, 140);
        return;
      }
      wheelBurst = false;
      paintInk();
    }

    function paintInk() {
      var started = win.performance ? win.performance.now() : Date.now();
      var b = currentBoard();
      inkCanvas.style.transform = '';
      if (!b) return;
      var strokes = strokesNow();
      drawBackground(ictx, b.background, colors, size, view);
      if (!strokes.length && !gesture) {
        ictx.fillStyle = colors.muted;
        ictx.globalAlpha = 0.7;
        ictx.font = '500 15px ' + CANVAS_FONT;
        ictx.textAlign = 'center';
        ictx.textBaseline = 'middle';
        ictx.fillText('Einfach losschreiben – mit dem Stift. Der Finger verschiebt die Fläche.', size.w / 2, size.h / 2);
        ictx.globalAlpha = 1;
      }
      applyView(ictx, view, size);
      drawStrokes(ictx, strokes, {
        colors: colors, cull: visibleBox(view, size),
        exclude: gesture && gesture.hideSelected ? selection.set : null
      });
      ictx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
      lastPaint.view = { cx: view.cx, cy: view.cy, zoom: view.zoom };
      lastPaint.ms = (win.performance ? win.performance.now() : Date.now()) - started;
    }

    function drawSelectionMarks(ctx, dx, dy) {
      var z = view.zoom;
      ctx.save();
      ctx.translate(dx || 0, dy || 0);
      ctx.strokeStyle = colors.select;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.globalAlpha = 0.4;
      selection.ids.forEach(function (id) {
        var stroke = strokeById(id);
        if (!stroke) return;
        if (stroke.tool === 'underline' || stroke.tool === 'stamp') {
          var box = ink.bbox(stroke);
          ctx.lineWidth = 2 / z;
          ctx.strokeRect(box.x0, box.y0, box.x1 - box.x0, box.y1 - box.y0);
          return;
        }
        var pts = stroke.points;
        if (pts.length === 3) {
          ctx.beginPath();
          ctx.arc(pts[0], pts[1], ink.maxWidth(stroke) / 2 + 4 / z, 0, Math.PI * 2);
          ctx.fillStyle = colors.select;
          ctx.fill();
          return;
        }
        ctx.lineWidth = ink.maxWidth(stroke) + 6 / z;
        ctx.beginPath();
        traceAll(ctx, pts);
        ctx.stroke();
      });
      ctx.globalAlpha = 1;
      if (selection.box) {
        var pad = 8 / z;
        ctx.setLineDash([6 / z, 4 / z]);
        ctx.lineWidth = 1.5 / z;
        ctx.strokeRect(selection.box.x0 - pad, selection.box.y0 - pad,
          selection.box.x1 - selection.box.x0 + 2 * pad, selection.box.y1 - selection.box.y0 + 2 * pad);
      }
      ctx.restore();
    }

    function paintLive() {
      lctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
      lctx.clearRect(0, 0, size.w, size.h);
      var eraserCursor = tools.tool === 'eraser' && hover && (!gesture || gesture.kind === 'erase');
      if (!gesture && !selection.ids.length && !eraserCursor) return;
      applyView(lctx, view, size);
      var z = view.zoom;

      if (selection.ids.length && !(gesture && gesture.kind === 'move')) drawSelectionMarks(lctx, 0, 0);

      if (gesture) {
        if (gesture.kind === 'draw' || (gesture.kind === 'mark' && gesture.stroke)) {
          drawStroke(lctx, gesture.stroke, colors);
        } else if (gesture.kind === 'lasso') {
          lctx.save();
          lctx.strokeStyle = colors.select;
          lctx.lineWidth = 1.5 / z;
          lctx.setLineDash([5 / z, 4 / z]);
          lctx.beginPath();
          for (var i = 0; i + 1 < gesture.poly.length; i += 2) {
            if (i === 0) lctx.moveTo(gesture.poly[0], gesture.poly[1]);
            else lctx.lineTo(gesture.poly[i], gesture.poly[i + 1]);
          }
          lctx.closePath();
          lctx.stroke();
          lctx.restore();
        } else if (gesture.kind === 'move') {
          lctx.save();
          lctx.translate(gesture.dx, gesture.dy);
          drawStrokes(lctx, gesture.selected, { colors: colors });
          lctx.restore();
          drawSelectionMarks(lctx, gesture.dx, gesture.dy);
        }
      }

      if (eraserCursor) {
        var wp = toWorld(hover);
        lctx.save();
        lctx.strokeStyle = colors.ink;
        lctx.globalAlpha = 0.6;
        lctx.lineWidth = 1 / z;
        lctx.beginPath();
        lctx.arc(wp.x, wp.y, eraserRadius(), 0, Math.PI * 2);
        lctx.stroke();
        lctx.restore();
      }
      lctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
    }

    /* --- Größe --------------------------------------------------------------- */

    function resize() {
      var w = container.clientWidth;
      var h = container.clientHeight;
      if (!w || !h) return;
      var dpr = Math.min(win.devicePixelRatio || 1, 3);
      if (w === size.w && h === size.h && dpr === size.dpr) return;
      size = { w: w, h: h, dpr: dpr };
      [inkCanvas, liveCanvas].forEach(function (canvas) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        canvas.style.width = w + 'px';
        canvas.style.height = h + 'px';
      });
      lastPaint.view = null;
      dirty.ink = true;
      dirty.live = true;
      schedule();
    }

    /* --- Werkzeuge ------------------------------------------------------------- */

    function eraserRadius() { return ERASER_SIZES[tools.eraser.size] / view.zoom; }

    function setTool(id) {
      if (!toolDef(id) || tools.tool === id) return;
      tools.tool = id;
      container.dataset.tool = id;
      saveTools(tools);
      dirty.live = true;
      schedule();
      emit('tool');
    }

    function setToolOption(toolId, key, value) {
      if (!tools[toolId] || typeof tools[toolId] !== 'object') return;
      tools[toolId][key] = value;
      if (toolId === 'stamp' && key === 'stamp') tools.stamp.color = stampDef(value).color;
      saveTools(tools);
      dirty.live = true;
      schedule();
      emit('tool');
    }

    function setTouchDraws(value) {
      tools.touchDraws = !!value;
      saveTools(tools);
      emit('tool');
    }

    /* --- Auswahl --------------------------------------------------------------- */

    function selectionBox(ids) {
      var box = null;
      ids.forEach(function (id) {
        var stroke = strokeById(id);
        if (stroke) box = ink.unionBox(box, ink.bbox(stroke));
      });
      return box;
    }

    function setSelection(ids, quiet) {
      selection.ids = ids.slice();
      selection.set = {};
      ids.forEach(function (id) { selection.set[id] = true; });
      selection.box = selectionBox(ids);
      dirty.live = true;
      schedule();
      if (!quiet) emit('selection');
    }

    function clearSelection() {
      if (!selection.ids.length) return;
      setSelection([]);
    }

    function deleteSelection() {
      if (!selection.ids.length) return false;
      var set = selection.set;
      var count = selection.ids.length;
      var remaining = strokesNow().filter(function (s) { return !set[s.id]; });
      setSelection([], true);
      replaceStrokes(whiteboardId, remaining, count === 1 ? 'Strich gelöscht' : 'Striche gelöscht');
      emit('selection');
      return true;
    }

    function recolorSelection(color) {
      if (!selection.ids.length) return false;
      var set = selection.set;
      var changed = strokesNow().map(function (s) {
        return set[s.id] ? Object.assign({}, s, { color: color }) : s;
      });
      replaceStrokes(whiteboardId, changed, 'Strichfarbe geändert');
      return true;
    }

    /* --- Eingabe: Hilfen --------------------------------------------------------- */

    function capture(event) {
      try { inkCanvas.setPointerCapture(event.pointerId); } catch (err) { /* künstliche Ereignisse */ }
    }

    function coalesced(event) {
      var list = null;
      try { list = event.getCoalescedEvents ? event.getCoalescedEvents() : null; } catch (err) { list = null; }
      return list && list.length ? list : [event];
    }

    function eventTime(event) {
      var t = event.timeStamp;
      return typeof t === 'number' && t > 0 ? t : (win.performance ? win.performance.now() : Date.now());
    }

    function round2(v) { return Math.round(v * 100) / 100; }

    /* --- Eingabe: Druck und Tempo ------------------------------------------------
       Der Stift schreibt wie ein Füller. Meldet er Druck, bestimmt der Druck
       die Breite; sonst (Maus, Finger, einfache Stifte) das Schreibtempo. */

    var pen = { first: null, real: false };   // liefert der Stift erkennbar echten Druck?

    /**
     * Gemessener Druck des Stifts – oder null, solange keiner erkennbar ist.
     * Geräte ohne Drucksensor melden durchgehend denselben Wert (laut Norm
     * 0,5); echter Druck verrät sich dadurch, dass er sich ändert.
     */
    function measuredPressure(event) {
      if (event.pointerType !== 'pen') return null;
      var p = event.pressure;
      if (typeof p !== 'number' || !(p > 0)) return null;
      if (!pen.real) {
        if (pen.first === null) pen.first = p;
        else if (Math.abs(p - pen.first) > 0.004) pen.real = true;
        if (!pen.real) return null;
      }
      return Math.min(p, 1);
    }

    /**
     * Ersatzdruck aus dem Schreibtempo. Der Strich setzt fein an und findet
     * dann seine Breite: langsam breiter, im Schwung feiner. Gemessen wird
     * über mindestens zwei Millisekunden, damit gebündelt gemeldete
     * Ereignisse kein falsches Tempo vortäuschen.
     */
    function pacedPressure(g, sp, time) {
      var pace = g.pace;
      if (!pace) {
        g.pace = { x: sp.x, y: sp.y, t: time, way: 0, speed: null, p: 0.3 };
        return 0.3;
      }
      pace.way += Math.hypot(sp.x - pace.x, sp.y - pace.y);
      pace.x = sp.x;
      pace.y = sp.y;
      var dt = time - pace.t;
      if (dt >= 2) {
        var speed = pace.way / dt;                  // Bildschirmpixel je Millisekunde
        pace.speed = pace.speed === null ? speed : pace.speed + (speed - pace.speed) * (1 - Math.exp(-dt / 25));
        pace.p += (ink.speedPressure(pace.speed) - pace.p) * (1 - Math.exp(-dt / 30));
        pace.t = time;
        pace.way = 0;
      }
      return pace.p;
    }

    /** Wirksamer Druck für die nächste Stelle des entstehenden Strichs. */
    function inkPressure(g, event, sp) {
      if (g.flex === 'off') return 0.5;
      var time = eventTime(event);
      var measured = measuredPressure(event);
      if (measured === null) {
        if (g.smooth !== null) return g.p;                        // Aussetzer mitten im Strich: Wert halten
        if (event.pointerType === 'pen' && event.pressure > 0) g.unproven = true;   // Druck gemeldet, noch nicht als echt erkannt
        if (g.flex === 'marker') return 0.5;                      // der Filzstift kennt kein Tempo
        return ink.flexPressure(pacedPressure(g, sp, time), g.flex);
      }
      if (g.smooth === null) {
        // Der Stift erweist sich erst in diesem Strich als druckempfindlich (es
        // ist sein erster auf dieser Fläche): Der Ansatz war bis hierher
        // geschätzt und bekommt nun den Druck, mit dem der Stift aufgesetzt hat.
        var pts = g.stroke.points;
        if (g.unproven && pts.length <= 9) {
          var onset = round2(ink.flexPressure(ink.pressureCurve(pen.first), g.flex));
          for (var k = 2; k < pts.length; k += 3) pts[k] = onset;
        }
        g.smooth = measured;
      } else {
        // Leichte Glättung gegen das Zittern des Sensors – nach Zeit, nicht nach Zahl der Meldungen.
        g.smooth += (measured - g.smooth) * Math.max(0.35, 1 - Math.exp(-(time - g.time) / 10));
      }
      g.time = time;
      g.measured = measured;
      g.samples += 1;
      if (measured < g.low) g.low = measured;
      if (measured > g.high) g.high = measured;
      return ink.flexPressure(ink.pressureCurve(g.smooth), g.flex);
    }

    /* --- Eingabe: Gesten ----------------------------------------------------- */

    function startDraw(event, wp) {
      clearSelection();
      var id = tools.tool;
      var pref = tools[id];
      var data = { tool: id, color: pref.color, width: WIDTHS[id][pref.width], points: [] };
      if (id === 'pen') data.nib = 'fountain';
      gesture = {
        kind: 'draw', pointerId: event.pointerId, type: event.pointerType,
        stroke: schema.makeStroke(data), minDist: 0.9 / view.zoom, pending: null,
        // Feder: Der Stift folgt Druck und Tempo (so stark wie eingestellt), der
        // Marker nur echtem Druck, der Textmarker bleibt gleichmäßig.
        flex: id === 'pen' ? pref.pressure : (id === 'marker' ? 'marker' : 'off'),
        p: 0.5, smooth: null, time: 0, measured: null, samples: 0, low: 1, high: 0,
        pace: null, resting: false, unproven: false
      };
      addDrawPoints(event);
    }

    /** lifted: das Ereignis des Abhebens – es bringt nur noch einen Ort mit, keinen Druck. */
    function addDrawPoints(event, lifted) {
      var g = gesture;
      var pts = g.stroke.points;
      coalesced(event).forEach(function (e) {
        var sp = screenPoint(e);
        var wp = toWorld(sp);
        if (!lifted) g.p = inkPressure(g, e, sp);
        var n = pts.length;
        if (n && Math.hypot(wp.x - pts[n - 3], wp.y - pts[n - 2]) < g.minDist) {
          g.pending = [wp.x, wp.y, g.p];
          if (!lifted) {
            // Der Stift ruht: An dieser Stelle wird die Tinte nur mehr, nie weniger.
            if (g.p > pts[n - 1]) pts[n - 1] = round2(g.p);
            g.resting = true;
          }
          return;
        }
        if (n >= 3 * 6000) return;        // Schutz vor endlosen Strichen
        pts.push(ink.round1(wp.x), ink.round1(wp.y), round2(g.p));
        g.pending = null;
        g.resting = false;
      });
      dirty.live = true;
      schedule();
    }

    /* Ein fertiger Strich aus Stift oder Marker liegt immer zuoberst. Er wird
       deshalb auf die fertige Tinte gesetzt, statt nach jedem Strich die ganze
       Fläche neu aufzubauen – das hält das Schreiben auch auf einer vollen
       Fläche flüssig. Wo das nicht stimmt (Textmarker liegen hinter der Tinte,
       die Ansicht ist in Bewegung, die Fläche war leer und zeigt noch ihren
       Hinweis), folgt der vollständige Neuaufbau. */
    function canAppend(stroke) {
      var seen = lastPaint.view;
      return stroke.tool !== 'highlighter' && !dirty.ink && !settleTimer && !inkCanvas.style.transform
        && !!seen && seen.cx === view.cx && seen.cy === view.cy && seen.zoom === view.zoom
        && strokesNow().length > 0;
    }

    /** Speichert den Strich. Steht er danach schon auf der Tinte, merkt sich die Geste das (appended). */
    function finishDraw(g) {
      var stroke = g.stroke;
      var pts = stroke.points;
      var n = pts.length;
      if (!n) return;
      if (g.pending && Math.hypot(g.pending[0] - pts[n - 3], g.pending[1] - pts[n - 2]) > 0.05) {
        pts.push(ink.round1(g.pending[0]), ink.round1(g.pending[1]), round2(g.pending[2]));
        n += 3;
      }
      if (g.measured !== null) {
        // Im Schwung abgehoben: Die Spitze folgt dem zuletzt gemessenen Druck,
        // nicht dem geglätteten – so läuft der Strich fein aus.
        if (!g.resting && n >= 6) {
          var tip = round2(ink.flexPressure(ink.pressureCurve(g.measured), g.flex));
          if (tip < pts[n - 1]) pts[n - 1] = tip;
        }
        // Ein ganzer Strich ohne jede Änderung: Dieser Stift misst doch keinen Druck.
        if (g.samples > 8 && g.high - g.low < 0.004) { pen.real = false; pen.first = g.high; }
      }
      if (stroke.tool !== 'highlighter' && n > 3) {
        // Ein Tupfer ist ein Punkt: Wer den Stift nur aufsetzt, verwackelt ihn
        // um Bruchteile eines Pixels – daraus wird kein Strichlein, sondern
        // ein Punkt mit dem stärksten Druck dieser Berührung.
        var reach = Math.max(stroke.width * 0.5, 1.2 / view.zoom);
        var far = 0, sumX = 0, sumY = 0, top = 0;
        for (var i = 0; i < n; i += 3) {
          far = Math.max(far, Math.hypot(pts[i] - pts[0], pts[i + 1] - pts[1]));
          sumX += pts[i];
          sumY += pts[i + 1];
          if (pts[i + 2] > top) top = pts[i + 2];
        }
        if (far <= reach) stroke.points = [ink.round1(sumX * 3 / n), ink.round1(sumY * 3 / n), top];
      }
      var quick = canAppend(stroke);
      appending = quick;
      var saved = addStroke(whiteboardId, stroke);
      appending = false;
      if (!quick || !saved) return;
      applyView(ictx, view, size);
      drawStroke(ictx, stroke, colors, 0, size.dpr * view.zoom, true);
      ictx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
      g.appended = !dirty.ink;          // nichts sonst verlangt einen Neuaufbau (siehe endGesture)
    }

    /* Korrekturzeichen: Ein Tipp setzt das gewählte Zeichen, waagerechtes
       Ziehen unterstreicht – in derselben Farbe und passenden Stärke. Was
       entsteht, entscheidet sich erst unterwegs: Solange der Zeiger nicht
       mindestens MARK_DRAG Pixel zur Seite gewandert ist, bleibt es ein Tipp.
       Einmal Unterstreichung, immer Unterstreichung – wer zum Anfang
       zurückzieht, bricht sie ab und bekommt kein Zeichen untergeschoben. */
    function startMark(event, wp, sp) {
      clearSelection();
      var pref = tools.stamp;
      var line = tools.underline;
      var def = stampDef(pref.stamp);
      gesture = {
        kind: 'mark', pointerId: event.pointerId, type: event.pointerType,
        startX: wp.x, startSx: sp.x, dragging: false, stroke: null,
        stamp: schema.makeStroke({
          tool: 'stamp', color: pref.color, variant: def.variant, text: def.text || '',
          x: ink.round1(wp.x), y: ink.round1(wp.y), size: STAMP_SIZES[pref.size]
        }),
        line: schema.makeStroke({
          tool: 'underline', color: pref.color, width: WIDTHS.underline[pref.size],
          x: wp.x, y: wp.y, w: 0, style: line.style, double: !!line.double, hook: !!line.hook
        })
      };
    }

    function updateMark(wp, sp) {
      var g = gesture;
      if (!g.dragging) {
        if (Math.abs(sp.x - g.startSx) < MARK_DRAG) return;
        g.dragging = true;
        g.stroke = g.line;                // ab jetzt zeigt die Vorschau die Linie
      }
      g.line.x = Math.min(g.startX, wp.x);
      g.line.w = Math.abs(wp.x - g.startX);
      dirty.live = true;
      schedule();
    }

    function finishMark(g) {
      if (!g.dragging) { addStroke(whiteboardId, g.stamp); return; }
      var s = g.line;
      if (s.w * view.zoom < 3) return;
      s.x = ink.round1(s.x);
      s.y = ink.round1(s.y);
      s.w = ink.round1(s.w);
      addStroke(whiteboardId, s);
    }

    function startErase(event, wp) {
      clearSelection();
      var b = currentBoard();
      gesture = {
        kind: 'erase', pointerId: event.pointerId, type: event.pointerType,
        working: b ? b.strokes : [], changed: false, lastX: wp.x, lastY: wp.y,
        mode: tools.eraser.mode, radius: eraserRadius()
      };
      applyErase(wp);
    }

    function applyErase(wp) {
      var g = gesture;
      var run = g.mode === 'partial' ? ink.erasePartial : ink.eraseWhole;
      var result = run(g.working, g.lastX, g.lastY, wp.x, wp.y, g.radius);
      if (result.changed) {
        g.working = result.strokes;
        g.changed = true;
        dirty.ink = true;
      }
      g.lastX = wp.x;
      g.lastY = wp.y;
      dirty.live = true;
      schedule();
    }

    function finishErase(g) {
      if (g.changed) replaceStrokes(whiteboardId, g.working, 'Radiert');
    }

    function startLasso(event, wp) {
      gesture = { kind: 'lasso', pointerId: event.pointerId, type: event.pointerType, poly: [wp.x, wp.y] };
    }

    function updateLasso(wp) {
      var poly = gesture.poly;
      var n = poly.length;
      if (Math.hypot(wp.x - poly[n - 2], wp.y - poly[n - 1]) < 2 / view.zoom) return;
      poly.push(wp.x, wp.y);
      dirty.live = true;
      schedule();
    }

    function finishLasso(g) {
      var ids = ink.lassoSelect(strokesNow(), g.poly);
      setSelection(ids);
    }

    function startMove(event, wp) {
      var set = selection.set;
      gesture = {
        kind: 'move', pointerId: event.pointerId, type: event.pointerType,
        startX: wp.x, startY: wp.y, dx: 0, dy: 0, hideSelected: true,
        selected: strokesNow().filter(function (s) { return set[s.id]; })
      };
      dirty.ink = true;
      dirty.live = true;
      schedule();
    }

    function updateMove(wp) {
      gesture.dx = wp.x - gesture.startX;
      gesture.dy = wp.y - gesture.startY;
      dirty.live = true;
      schedule();
    }

    function finishMove(g) {
      dirty.ink = true;
      if (Math.abs(g.dx) + Math.abs(g.dy) < 0.5) return;
      var set = selection.set;
      var moved = strokesNow().map(function (s) { return set[s.id] ? ink.translate(s, g.dx, g.dy) : s; });
      replaceStrokes(whiteboardId, moved, 'Striche verschoben');
      selection.box = selectionBox(selection.ids);
    }

    function startPan(event, sp) {
      gesture = { kind: 'pan', pointerId: event.pointerId, type: event.pointerType, last: sp };
      container.dataset.panning = 'true';
    }

    function updatePan(sp) {
      view.cx -= (sp.x - gesture.last.x) / view.zoom;
      view.cy -= (sp.y - gesture.last.y) / view.zoom;
      gesture.last = sp;
      viewChanged();
    }

    function startPinch() {
      var pts = Array.from(touches.values());
      var mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
      gesture = {
        kind: 'pinch', type: 'touch', pointerId: null,
        dist: Math.max(1, Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)),
        startZoom: view.zoom, anchor: toWorld(mid)
      };
      container.dataset.panning = 'true';
    }

    function updatePinch() {
      var pts = Array.from(touches.values());
      if (pts.length < 2) return;
      var mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
      var dist = Math.max(1, Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y));
      view.zoom = util.clamp(gesture.startZoom * dist / gesture.dist, MIN_ZOOM, MAX_ZOOM);
      // Der Punkt zwischen den Fingern bleibt unter den Fingern.
      view.cx = gesture.anchor.x - (mid.x - size.w / 2) / view.zoom;
      view.cy = gesture.anchor.y - (mid.y - size.h / 2) / view.zoom;
      viewChanged();
    }

    function endGesture(cancelled) {
      var g = gesture;
      if (!g) return;
      gesture = null;
      delete container.dataset.panning;
      if (!cancelled) {
        if (g.kind === 'draw') finishDraw(g);
        else if (g.kind === 'mark') finishMark(g);
        else if (g.kind === 'erase') finishErase(g);
        else if (g.kind === 'lasso') finishLasso(g);
        else if (g.kind === 'move') finishMove(g);
      } else if (g.kind === 'erase' || g.kind === 'move') {
        dirty.ink = true;
      }
      if (g.kind === 'pan' || g.kind === 'pinch') persistView();
      dirty.ink = dirty.ink || g.kind === 'draw' || g.kind === 'mark' || g.kind === 'erase';
      dirty.live = true;
      if (g.appended) dirty.ink = false;  // der Strich steht schon auf der Tinte (siehe finishDraw)
      schedule();
    }

    /* --- Eingabe: Zeigerereignisse ------------------------------------------------- */

    function onPointerDown(event) {
      if (destroyed) return;
      if (event.pointerType === 'touch') { onTouchDown(event); return; }

      // Stift oder Maus hat Vorrang vor Fingern, die gerade verschieben.
      if (touches.size) {
        touches.clear();
        if (gesture && (gesture.kind === 'pan' || gesture.kind === 'pinch')) endGesture(false);
      }
      if (gesture) return;

      var sp = screenPoint(event);
      var wp = toWorld(sp);
      var buttons = event.buttons || 0;
      var penErases = event.pointerType === 'pen' && ((buttons & 32) !== 0 || (buttons & 2) !== 0);
      var mousePans = event.pointerType === 'mouse' && (event.button === 1 || event.button === 2);
      capture(event);
      event.preventDefault();

      if (mousePans || spaceDown || tools.tool === 'hand') { startPan(event, sp); return; }
      if (penErases) { startErase(event, wp); return; }
      if (selection.ids.length && tools.tool === 'lasso' && ink.pointInBox(wp.x, wp.y, selection.box)) {
        startMove(event, wp);
        return;
      }
      switch (tools.tool) {
        case 'pen': case 'marker': case 'highlighter': startDraw(event, wp); break;
        case 'stamp': startMark(event, wp, sp); break;
        case 'eraser': startErase(event, wp); break;
        case 'lasso': clearSelection(); startLasso(event, wp); break;
        default: startPan(event, sp);
      }
    }

    function onTouchDown(event) {
      if (gesture && gesture.type !== 'touch') return;          // Handballen neben dem Stift
      var sp = screenPoint(event);
      touches.set(event.pointerId, sp);
      capture(event);
      event.preventDefault();

      if (touches.size === 1) {
        if (gesture) return;
        var wp = toWorld(sp);
        if (selection.ids.length && ink.pointInBox(wp.x, wp.y, selection.box)) { startMove(event, wp); return; }
        if (tools.touchDraws && tools.tool !== 'hand') {
          if (isDrawingTool(tools.tool)) { startDraw(event, wp); return; }
          if (tools.tool === 'stamp') { startMark(event, wp, sp); return; }
          if (tools.tool === 'eraser') { startErase(event, wp); return; }
          if (tools.tool === 'lasso') { clearSelection(); startLasso(event, wp); return; }
        }
        startPan(event, sp);
        return;
      }
      if (touches.size === 2) {
        if (gesture && gesture.kind === 'draw' && gesture.type === 'touch') {
          // Zwei Finger kurz nach dem Aufsetzen: Das war kein Strich, sondern eine Zoomgeste.
          if (gesture.stroke.points.length <= 3 * 12) { endGesture(true); }
          else { touches.delete(event.pointerId); return; }
        } else if (gesture && gesture.kind === 'mark' && !gesture.dragging) {
          endGesture(true);               // noch nichts gezogen: Der erste Finger gehörte zur Zoomgeste – kein Zeichen setzen
        } else if (gesture && gesture.kind !== 'pan') {
          touches.delete(event.pointerId);
          return;
        }
        startPinch();
        return;
      }
      touches.delete(event.pointerId);                            // dritter Finger: ignorieren
    }

    function onPointerMove(event) {
      if (destroyed) return;
      if (event.pointerType === 'touch') {
        if (!touches.has(event.pointerId)) return;
        var tp = screenPoint(event);
        touches.set(event.pointerId, tp);
        if (!gesture) return;
        if (gesture.kind === 'pinch') { updatePinch(); return; }
        if (gesture.pointerId !== event.pointerId) return;
        updateGesture(event, tp);
        return;
      }
      var sp = screenPoint(event);
      hover = sp;
      if (!gesture) {
        if (tools.tool === 'eraser') { dirty.live = true; schedule(); }
        return;
      }
      if (gesture.pointerId !== event.pointerId) return;
      updateGesture(event, sp);
    }

    function updateGesture(event, sp) {
      var g = gesture;
      if (g.kind === 'draw') { addDrawPoints(event); return; }
      if (g.kind === 'pan') { updatePan(sp); return; }
      var wp = toWorld(sp);
      if (g.kind === 'mark') updateMark(wp, sp);
      else if (g.kind === 'lasso') updateLasso(wp);
      else if (g.kind === 'move') updateMove(wp);
      else if (g.kind === 'erase') {
        coalesced(event).forEach(function (e) { applyErase(toWorld(screenPoint(e))); });
      }
    }

    function onPointerUp(event) {
      if (destroyed) return;
      if (event.pointerType === 'touch') {
        if (!touches.has(event.pointerId)) return;
        touches.delete(event.pointerId);
        if (gesture && gesture.kind === 'pinch') {
          if (touches.size < 2) {
            endGesture(false);
            // Ein Finger bleibt liegen: einfach weiter verschieben.
            if (touches.size === 1) {
              var rest = Array.from(touches.entries())[0];
              startPan({ pointerId: rest[0], pointerType: 'touch' }, rest[1]);
            }
          }
          return;
        }
        if (gesture && gesture.pointerId === event.pointerId) endGesture(event.type === 'pointercancel');
        return;
      }
      if (gesture && gesture.pointerId === event.pointerId) {
        if (gesture.kind === 'draw' && event.type !== 'pointercancel') addDrawPoints(event, true);
        endGesture(event.type === 'pointercancel');
      }
    }

    function onPointerLeave() {
      hover = null;
      if (tools.tool === 'eraser') { dirty.live = true; schedule(); }
    }

    function onWheel(event) {
      if (destroyed) return;
      event.preventDefault();
      var factor = event.deltaMode === 1 ? 16 : (event.deltaMode === 2 ? size.h : 1);
      var dx = event.deltaX * factor;
      var dy = event.deltaY * factor;
      if (event.ctrlKey || event.metaKey) {
        zoomAt(screenPoint(event), Math.exp(-dy * 0.0022));
        return;
      }
      if (event.shiftKey && !dx) { dx = dy; dy = 0; }
      view.cx += dx / view.zoom;
      view.cy += dy / view.zoom;
      wheelBurst = true;
      viewChanged();
    }

    function zoomAt(sp, factor) {
      var wp = toWorld(sp);
      view.zoom = util.clamp(view.zoom * factor, MIN_ZOOM, MAX_ZOOM);
      view.cx = wp.x - (sp.x - size.w / 2) / view.zoom;
      view.cy = wp.y - (sp.y - size.h / 2) / view.zoom;
      wheelBurst = true;
      viewChanged();
    }

    function zoomTo(zoom) {
      view.zoom = util.clamp(zoom, MIN_ZOOM, MAX_ZOOM);
      viewChanged();
    }

    function fitContent() {
      var box = ink.contentBox(strokesNow());
      if (!box) { view.cx = 0; view.cy = 0; view.zoom = 1; viewChanged(); return; }
      var fitted = ink.fitView(box, size.w, size.h, 48, { min: MIN_ZOOM, max: 2 });
      view.cx = fitted.cx;
      view.cy = fitted.cy;
      view.zoom = fitted.zoom;
      viewChanged();
    }

    /* --- Tastatur ------------------------------------------------------------- */

    function keysActive(event) {
      if (destroyed || modalOpen() || isTyping(event)) return false;
      var route = BAO.app && BAO.app.currentRoute ? BAO.app.currentRoute() : null;
      return !route || route.path === 'whiteboard';
    }

    function onKeyDown(event) {
      if (event.key === ' ') {
        if (!keysActive(event)) return;
        if (!spaceDown) { spaceDown = true; container.dataset.space = 'true'; }
        event.preventDefault();
        return;
      }
      if (!keysActive(event) || event.ctrlKey || event.metaKey || event.altKey) return;
      var key = event.key.toLowerCase();
      var tool = TOOLS.filter(function (t) { return t.key === key || t.altKey === key; })[0];
      if (tool) { setTool(tool.id); event.preventDefault(); return; }
      switch (event.key) {
        case 'Delete': case 'Backspace':
          if (deleteSelection()) event.preventDefault();
          break;
        case 'Escape':
          if (selection.ids.length) { clearSelection(); event.preventDefault(); }
          break;
        case '+': zoomAt({ x: size.w / 2, y: size.h / 2 }, 1.25); event.preventDefault(); break;
        case '-': zoomAt({ x: size.w / 2, y: size.h / 2 }, 0.8); event.preventDefault(); break;
        case '0': zoomTo(1); event.preventDefault(); break;
        case 'f': case 'F': toggleFullscreen(); event.preventDefault(); break;
        default: break;
      }
    }

    function onKeyUp(event) {
      if (event.key === ' ' && spaceDown) {
        spaceDown = false;
        delete container.dataset.space;
      }
    }

    /* --- Vollbild ----------------------------------------------------------------- */

    function isFullscreen() { return doc.fullscreenElement === container; }

    function toggleFullscreen() {
      try {
        if (isFullscreen()) { if (doc.exitFullscreen) doc.exitFullscreen(); }
        else if (container.requestFullscreen) {
          var promise = container.requestFullscreen();
          if (promise && promise.catch) promise.catch(function () { /* abgelehnt */ });
        }
      } catch (err) { /* Vollbild nicht verfügbar */ }
    }

    function onFullscreenChange() {
      win.setTimeout(resize, 50);
      emit('fullscreen');
    }

    /* --- Bestand beobachten --------------------------------------------------------- */

    var unsubscribe = BAO.store.subscribe(function (state, meta) {
      if (destroyed) return;
      if (meta.reason === 'commit' && (meta.label === 'Werkzeug gewählt' || meta.label === 'Whiteboard-Ansicht')) return;
      var b = currentBoard();
      if (!b) return;
      if (appending) {                  // siehe finishDraw: Der neue Strich kommt einfach obenauf.
        emit('strokes');
        return;
      }
      if (meta.reason !== 'commit') {
        tools = readTools();
        container.dataset.tool = tools.tool;
        emit('tool');
      }
      if (selection.ids.length && !gesture) {
        var alive = {};
        b.strokes.forEach(function (s) { alive[s.id] = true; });
        var kept = selection.ids.filter(function (id) { return alive[id]; });
        if (kept.length !== selection.ids.length) setSelection(kept);
        else selection.box = selectionBox(kept);
      }
      dirty.ink = true;
      dirty.live = true;
      schedule();
      emit('strokes');
    });

    /* --- Aufbau und Abbau ------------------------------------------------------------- */

    var cleanup = [];
    function listen(target, type, fn, opts) {
      target.addEventListener(type, fn, opts || false);
      cleanup.push(function () { target.removeEventListener(type, fn, opts || false); });
    }

    listen(inkCanvas, 'pointerdown', onPointerDown);
    listen(inkCanvas, 'pointermove', onPointerMove);
    listen(inkCanvas, 'pointerup', onPointerUp);
    listen(inkCanvas, 'pointercancel', onPointerUp);
    listen(inkCanvas, 'lostpointercapture', function (event) {
      if (gesture && gesture.pointerId === event.pointerId) endGesture(false);
      touches.delete(event.pointerId);
    });
    listen(inkCanvas, 'pointerleave', onPointerLeave);
    listen(inkCanvas, 'wheel', onWheel, { passive: false });
    listen(inkCanvas, 'contextmenu', function (event) { event.preventDefault(); });
    listen(container, 'gesturestart', function (event) { event.preventDefault(); });
    listen(container, 'dragstart', function (event) { event.preventDefault(); });
    listen(doc, 'keydown', onKeyDown);
    listen(doc, 'keyup', onKeyUp);
    listen(doc, 'fullscreenchange', onFullscreenChange);

    var observer = null;
    if (win.ResizeObserver) {
      observer = new win.ResizeObserver(function () { resize(); });
      observer.observe(container);
    } else {
      listen(win, 'resize', resize);
    }

    container.dataset.tool = tools.tool;
    resize();
    schedule();

    var api = {
      element: container,
      whiteboardId: whiteboardId,
      subscribe: function (fn) {
        listeners.push(fn);
        return function () {
          var i = listeners.indexOf(fn);
          if (i >= 0) listeners.splice(i, 1);
        };
      },
      getTools: function () { return tools; },
      setTool: setTool,
      setToolOption: setToolOption,
      setTouchDraws: setTouchDraws,
      getView: function () { return { cx: view.cx, cy: view.cy, zoom: view.zoom }; },
      zoomIn: function () { zoomAt({ x: size.w / 2, y: size.h / 2 }, 1.25); },
      zoomOut: function () { zoomAt({ x: size.w / 2, y: size.h / 2 }, 0.8); },
      zoomTo: zoomTo,
      resetView: function () { view.cx = 0; view.cy = 0; view.zoom = 1; viewChanged(); },
      fitContent: fitContent,
      getSelection: function () { return selection.ids.slice(); },
      hasSelection: function () { return selection.ids.length > 0; },
      clearSelection: clearSelection,
      deleteSelection: deleteSelection,
      recolorSelection: recolorSelection,
      strokeCount: function () { return strokesNow().length; },
      isFullscreen: isFullscreen,
      toggleFullscreen: toggleFullscreen,
      repaint: function () { colors = resolveColors(doc); dirty.ink = true; dirty.live = true; schedule(); },
      flushView: function () { persistView.cancel(); rememberView(); setView(whiteboardId, view); },
      destroy: function () {
        if (destroyed) return;
        destroyed = true;
        persistView.cancel();
        rememberView();
        if (currentBoard()) setView(whiteboardId, view);
        if (frame) win.cancelAnimationFrame(frame);
        if (settleTimer) clearTimeout(settleTimer);
        if (observer) observer.disconnect();
        cleanup.forEach(function (fn) { fn(); });
        unsubscribe();
        listeners.length = 0;
        forgetInkPaths();
      }
    };
    return api;
  }

  BAO.whiteboard = {
    TOOLS: TOOLS,
    INK_COLORS: INK_COLORS,
    HIGHLIGHT_COLORS: HIGHLIGHT_COLORS,
    COLOR_LABELS: COLOR_LABELS,
    WIDTHS: WIDTHS,
    WIDTH_LABELS: WIDTH_LABELS,
    PEN_PRESSURES: PEN_PRESSURES,
    ERASER_SIZES: ERASER_SIZES,
    STAMP_SIZES: STAMP_SIZES,
    STAMPS: STAMPS,
    STAMP_PATHS: STAMP_PATHS,
    UNDERLINE_STYLES: UNDERLINE_STYLES,
    MIN_ZOOM: MIN_ZOOM,
    MAX_ZOOM: MAX_ZOOM,
    toolDef: toolDef,
    stampDef: stampDef,
    isDrawingTool: isDrawingTool,
    readTools: readTools,
    saveTools: saveTools,
    resolveColors: resolveColors,
    colorOf: colorOf,
    drawStrokes: drawStrokes,
    drawStroke: drawStroke,
    thumbnail: thumbnail,
    addStroke: addStroke,
    replaceStrokes: replaceStrokes,
    setView: setView,
    setBackground: setBackground,
    clearStrokes: clearStrokes,
    mount: mount
  };
})(window.BAO = window.BAO || {});
