/* ==========================================================================
   Whiteboard – Geometrie der Striche
   Reine Rechenfunktionen ohne DOM: Begrenzungsrahmen, Radieren (ganz und
   teilweise), Lasso-Auswahl, Verschieben und Einpassen der Ansicht.
   Alle Koordinaten sind Weltkoordinaten – Pixel bei Zoomstufe 1. Die Fläche
   hat keinen Rand; die Ansicht bestimmt nur, welcher Ausschnitt zu sehen ist.
   ========================================================================== */
(function (BAO) {
  'use strict';

  var util = BAO.util;

  /* --- Breite ----------------------------------------------------------------- */

  /**
   * Linienbreite an einer Stelle des Strichs aus dem gespeicherten Druck.
   * Der Druck 0,5 ergibt immer genau die Grundbreite des Werkzeugs.
   *
   * Füller (Stift mit nib: 'fountain'): 0,25- bis 2-fache Grundbreite. Leicht
   * aufgesetzt entsteht eine Haarlinie, fest aufgedrückt ein kräftiger
   * Abstrich; nach oben hin wächst die Breite schneller – wie bei einer
   * Feder, die sich unter Druck spreizt. Stiftstriche ohne diese Angabe
   * sind älter als die Feder und behalten ihre damalige Breite.
   */
  function widthAt(stroke, pressure) {
    var p = typeof pressure === 'number' && pressure > 0 ? Math.min(pressure, 1) : 0.5;
    if (stroke.tool === 'pen') {
      if (stroke.nib === 'fountain') return stroke.width * (0.25 + 1.25 * p + 0.5 * p * p);
      return stroke.width * (0.55 + 0.9 * p);
    }
    if (stroke.tool === 'marker') return stroke.width * (0.7 + 0.6 * p);
    return stroke.width;
  }

  function maxWidth(stroke) { return widthAt(stroke, 1); }

  /**
   * Durchmesser eines einzelnen Punkts. Der Füller hinterlässt beim Aufsetzen
   * mindestens einen Punkt in Grundbreite – i-Punkte, Satzzeichen und Akzente
   * bleiben so lesbar, auch wenn sie nur ganz leicht getupft wurden.
   */
  function dotWidth(stroke) {
    var w = widthAt(stroke, stroke.points[2]);
    return stroke.nib === 'fountain' ? Math.max(w, stroke.width) : w;
  }

  /* --- Druck und Tempo ---------------------------------------------------------
     Was beim Schreiben gemessen wird, steht nicht roh im Strich. Gespeichert
     wird der wirksame Druck: 0,5 bedeutet Grundbreite, darunter wird die
     Linie feiner, darüber kräftiger (siehe widthAt). */

  /**
   * Kennlinie des Stifts: gemessener Druck -> wirksamer Druck.
   * Beim gewöhnlichen Schreiben melden Stifte nur etwa 0,15 bis 0,5; der
   * volle Ausschlag verlangt unangenehm viel Kraft. Die Kennlinie legt den
   * üblichen Schreibdruck (rund 0,3) auf die Grundbreite und spreizt den
   * Bereich darunter – dort, wo sich beim Schreiben tatsächlich etwas tut.
   */
  function pressureCurve(measured) {
    var p = typeof measured === 'number' && measured > 0 ? Math.min(measured, 1) : 0;
    return Math.pow(p, 0.6);
  }

  /**
   * Ersatz für Geräte ohne Drucksensor (Maus, Finger, einfache Stifte): Das
   * Schreibtempo in Bildschirmpixeln je Millisekunde bestimmt den wirksamen
   * Druck. Langsam fließt mehr Tinte, im Schwung wird die Linie fein;
   * gewöhnliches Schreibtempo (0,4) ergibt die Grundbreite.
   */
  function speedPressure(speed) {
    var v = speed > 0 ? speed : 0;
    return 0.1 + 0.56 / (1 + v);
  }

  /**
   * Härte der Feder: 'off' schreibt gleichmäßig, 'strong' verstärkt den
   * Ausschlag um die Grundbreite herum (weiche Feder), alles andere lässt den
   * Druck, wie er ist. Das Ergebnis bleibt über 0, weil 0 „keine Angabe“ heißt.
   */
  function flexPressure(pressure, mode) {
    if (mode === 'off') return 0.5;
    var p = mode === 'strong' ? 0.5 + (pressure - 0.5) * 1.6 : pressure;
    return p < 0.01 ? 0.01 : (p > 1 ? 1 : p);
  }

  /* Maße der Unterstreichung – dieselben Verhältnisse wie in Capy-note, damit
     eine dort vertraute Linie hier genauso aussieht. */
  function hookLength(width) { return Math.max(6, width * 3.2); }
  function doubleGap(width) { return Math.max(2.8, width * 1.35); }
  function waveAmplitude(width) { return 2 + width * 0.3; }
  function waveLength(width) { return 6 + width * 0.5; }

  /** Die waagerechten Linien einer Unterstreichung (eine oder zwei). */
  function underlineLines(stroke) {
    if (!stroke.double) return [stroke.y];
    var gap = doubleGap(stroke.width);
    return [stroke.y - gap / 2, stroke.y + gap / 2];
  }

  /** Das Häkchen am rechten Ende als Strecke [x1, y1, x2, y2] – oder null. */
  function underlineHook(stroke) {
    if (!stroke.hook) return null;
    var lines = underlineLines(stroke);
    var y = lines[lines.length - 1];
    var len = hookLength(stroke.width);
    var x = stroke.x + stroke.w;
    return [x, y, x - len * 0.28, y + len * 0.52];
  }

  /* --- Begrenzungsrahmen ------------------------------------------------------- */

  /** Rahmen eines Strichs einschließlich seiner Breite – null ohne Geometrie. */
  function bbox(stroke) {
    if (stroke.tool === 'underline') {
      var pad = stroke.width + (stroke.double ? doubleGap(stroke.width) / 2 : 0)
        + (stroke.style === 'wavy' ? waveAmplitude(stroke.width) : 0);
      return {
        x0: stroke.x - stroke.width, y0: stroke.y - pad,
        x1: stroke.x + stroke.w + stroke.width,
        y1: stroke.y + pad + (stroke.hook ? hookLength(stroke.width) * 0.52 : 0)
      };
    }
    if (stroke.tool === 'stamp') {
      var half = stroke.size / 2 + 2;
      return { x0: stroke.x - half, y0: stroke.y - half, x1: stroke.x + half, y1: stroke.y + half };
    }
    var pts = stroke.points || [];
    var r = maxWidth(stroke) / 2;
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (var i = 0; i + 1 < pts.length; i += 3) {
      if (pts[i] < x0) x0 = pts[i];
      if (pts[i] > x1) x1 = pts[i];
      if (pts[i + 1] < y0) y0 = pts[i + 1];
      if (pts[i + 1] > y1) y1 = pts[i + 1];
    }
    if (x0 === Infinity) return null;
    return { x0: x0 - r, y0: y0 - r, x1: x1 + r, y1: y1 + r };
  }

  function unionBox(a, b) {
    if (!a) return b ? { x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1 } : null;
    if (!b) return { x0: a.x0, y0: a.y0, x1: a.x1, y1: a.y1 };
    return {
      x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0),
      x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1)
    };
  }

  function boxesIntersect(a, b) {
    return !!a && !!b && a.x0 <= b.x1 && b.x0 <= a.x1 && a.y0 <= b.y1 && b.y0 <= a.y1;
  }

  function pointInBox(x, y, box) {
    return !!box && x >= box.x0 && x <= box.x1 && y >= box.y0 && y <= box.y1;
  }

  /** Rahmen um alles, was auf der Fläche liegt. */
  function contentBox(strokes) {
    var box = null;
    (strokes || []).forEach(function (stroke) { box = unionBox(box, bbox(stroke)); });
    return box;
  }

  /* --- Abstände -------------------------------------------------------------- */

  function distPointSegment(px, py, ax, ay, bx, by) {
    var dx = bx - ax;
    var dy = by - ay;
    if (dx === 0 && dy === 0) return Math.hypot(px - ax, py - ay);
    var t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy);
    t = t < 0 ? 0 : (t > 1 ? 1 : t);
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  }

  function orientation(ax, ay, bx, by, cx, cy) {
    var v = (by - ay) * (cx - bx) - (bx - ax) * (cy - by);
    return v > 1e-9 ? 1 : (v < -1e-9 ? -1 : 0);
  }

  function segmentsIntersect(ax, ay, bx, by, cx, cy, dx, dy) {
    var o1 = orientation(ax, ay, bx, by, cx, cy);
    var o2 = orientation(ax, ay, bx, by, dx, dy);
    var o3 = orientation(cx, cy, dx, dy, ax, ay);
    var o4 = orientation(cx, cy, dx, dy, bx, by);
    return o1 !== o2 && o3 !== o4 && o1 !== 0 && o2 !== 0 && o3 !== 0 && o4 !== 0;
  }

  function distSegmentSegment(ax, ay, bx, by, cx, cy, dx, dy) {
    if (segmentsIntersect(ax, ay, bx, by, cx, cy, dx, dy)) return 0;
    return Math.min(
      distPointSegment(ax, ay, cx, cy, dx, dy), distPointSegment(bx, by, cx, cy, dx, dy),
      distPointSegment(cx, cy, ax, ay, bx, by), distPointSegment(dx, dy, ax, ay, bx, by)
    );
  }

  /* --- Radieren -------------------------------------------------------------- */

  /**
   * Berührt der Radierer – eine Kapsel von (ax, ay) nach (bx, by) mit dem
   * Radius r – den Strich?
   */
  function strokeHit(stroke, ax, ay, bx, by, r) {
    if (stroke.tool === 'underline') {
      var reach = r + stroke.width / 2 + (stroke.style === 'wavy' ? waveAmplitude(stroke.width) : 0);
      var lines = underlineLines(stroke);
      for (var l = 0; l < lines.length; l++) {
        if (distSegmentSegment(stroke.x, lines[l], stroke.x + stroke.w, lines[l], ax, ay, bx, by) <= reach) return true;
      }
      var hook = underlineHook(stroke);
      return !!hook && distSegmentSegment(hook[0], hook[1], hook[2], hook[3], ax, ay, bx, by) <= reach;
    }
    if (stroke.tool === 'stamp') {
      return distPointSegment(stroke.x, stroke.y, ax, ay, bx, by) <= r + stroke.size * 0.45;
    }
    var pts = stroke.points;
    var reachPen = r + maxWidth(stroke) / 2;
    if (pts.length < 3) return false;
    if (pts.length === 3) return distPointSegment(pts[0], pts[1], ax, ay, bx, by) <= reachPen;
    for (var i = 3; i < pts.length; i += 3) {
      if (distSegmentSegment(pts[i - 3], pts[i - 2], pts[i], pts[i + 1], ax, ay, bx, by) <= reachPen) return true;
    }
    return false;
  }

  function eraserBox(ax, ay, bx, by, r) {
    return { x0: Math.min(ax, bx) - r, y0: Math.min(ay, by) - r, x1: Math.max(ax, bx) + r, y1: Math.max(ay, by) + r };
  }

  /** Nimmt jeden Strich ganz weg, den der Radierer berührt. */
  function eraseWhole(strokes, ax, ay, bx, by, r) {
    var box = eraserBox(ax, ay, bx, by, r);
    var changed = false;
    var out = strokes.filter(function (stroke) {
      if (!boxesIntersect(bbox(stroke), box)) return true;
      if (!strokeHit(stroke, ax, ay, bx, by, r)) return true;
      changed = true;
      return false;
    });
    return { strokes: changed ? out : strokes, changed: changed };
  }

  /**
   * Radiert nur, was unter dem Radierer liegt. Ein Strich zerfällt dabei in
   * Teilstücke, die als eigene Striche mit derselben Tinte weiterleben.
   * Unterstreichungen und Korrekturzeichen verschwinden als Ganzes.
   */
  function erasePartial(strokes, ax, ay, bx, by, r) {
    var box = eraserBox(ax, ay, bx, by, r);
    var changed = false;
    var out = [];

    strokes.forEach(function (stroke) {
      if (!boxesIntersect(bbox(stroke), box)) { out.push(stroke); return; }
      if (stroke.tool === 'underline' || stroke.tool === 'stamp') {
        if (strokeHit(stroke, ax, ay, bx, by, r)) changed = true; else out.push(stroke);
        return;
      }

      var pts = stroke.points;
      var n = pts.length / 3;
      var reach = r + maxWidth(stroke) / 2;
      var hitPoint = new Array(n);
      var hitSeg = new Array(n);
      var any = false;
      var i;
      for (i = 0; i < n; i++) {
        hitPoint[i] = distPointSegment(pts[3 * i], pts[3 * i + 1], ax, ay, bx, by) <= reach;
        if (hitPoint[i]) any = true;
      }
      // Schnelle Striche haben weite Lücken zwischen den Punkten – auch ein
      // Teilstück ohne getroffenen Punkt kann unter dem Radierer liegen.
      for (i = 0; i + 1 < n; i++) {
        hitSeg[i] = !hitPoint[i] && !hitPoint[i + 1]
          && distSegmentSegment(pts[3 * i], pts[3 * i + 1], pts[3 * i + 3], pts[3 * i + 4], ax, ay, bx, by) <= reach;
        if (hitSeg[i]) any = true;
      }
      if (!any) { out.push(stroke); return; }
      changed = true;

      var run = [];
      function flush() {
        if (run.length >= 2) {
          var points = [];
          run.forEach(function (index) { points.push(pts[3 * index], pts[3 * index + 1], pts[3 * index + 2]); });
          out.push(Object.assign({}, stroke, { id: util.uid('stk'), points: points }));
        }
        run = [];
      }
      for (i = 0; i < n; i++) {
        if (hitPoint[i]) { flush(); continue; }
        run.push(i);
        if (hitSeg[i]) flush();
      }
      flush();
    });

    return { strokes: changed ? out : strokes, changed: changed };
  }

  /* --- Lasso ------------------------------------------------------------------ */

  /** Liegt der Punkt im Polygon (flache Liste [x, y, x, y, …])? */
  function pointInPolygon(x, y, poly) {
    var inside = false;
    var n = poly.length / 2;
    for (var i = 0, j = n - 1; i < n; j = i++) {
      var xi = poly[2 * i], yi = poly[2 * i + 1];
      var xj = poly[2 * j], yj = poly[2 * j + 1];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  function polygonBox(poly) {
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (var i = 0; i + 1 < poly.length; i += 2) {
      if (poly[i] < x0) x0 = poly[i];
      if (poly[i] > x1) x1 = poly[i];
      if (poly[i + 1] < y0) y0 = poly[i + 1];
      if (poly[i + 1] > y1) y1 = poly[i + 1];
    }
    return x0 === Infinity ? null : { x0: x0, y0: y0, x1: x1, y1: y1 };
  }

  /** Stichproben eines Strichs für die Auswahl: höchstens 24 Punkte. */
  function samplePoints(stroke) {
    if (stroke.tool === 'stamp') return [stroke.x, stroke.y];
    if (stroke.tool === 'underline') {
      var out = [];
      for (var k = 0; k <= 4; k++) out.push(stroke.x + stroke.w * k / 4, stroke.y);
      return out;
    }
    var pts = stroke.points;
    var n = pts.length / 3;
    var step = Math.max(1, Math.floor(n / 24));
    var samples = [];
    for (var i = 0; i < n; i += step) samples.push(pts[3 * i], pts[3 * i + 1]);
    return samples;
  }

  /**
   * Wählt die Striche aus, die mehrheitlich innerhalb des Lassos liegen.
   * Ein Strich zählt als eingekreist, wenn mehr als die Hälfte seiner
   * Stichproben im Polygon liegt.
   */
  function lassoSelect(strokes, poly) {
    var box = polygonBox(poly);
    if (!box || poly.length < 6) return [];
    var ids = [];
    strokes.forEach(function (stroke) {
      if (!boxesIntersect(bbox(stroke), box)) return;
      var samples = samplePoints(stroke);
      var inside = 0;
      var total = samples.length / 2;
      for (var i = 0; i + 1 < samples.length; i += 2) {
        if (pointInPolygon(samples[i], samples[i + 1], poly)) inside += 1;
      }
      if (inside * 2 > total) ids.push(stroke.id);
    });
    return ids;
  }

  /* --- Verschieben ------------------------------------------------------------ */

  function round1(v) { return Math.round(v * 10) / 10; }

  /** Liefert eine verschobene Kopie des Strichs – das Original bleibt. */
  function translate(stroke, dx, dy) {
    if (stroke.tool === 'underline' || stroke.tool === 'stamp') {
      return Object.assign({}, stroke, { x: round1(stroke.x + dx), y: round1(stroke.y + dy) });
    }
    var pts = stroke.points;
    var moved = new Array(pts.length);
    for (var i = 0; i < pts.length; i += 3) {
      moved[i] = round1(pts[i] + dx);
      moved[i + 1] = round1(pts[i + 1] + dy);
      moved[i + 2] = pts[i + 2];
    }
    return Object.assign({}, stroke, { points: moved });
  }

  /* --- Ansicht ---------------------------------------------------------------- */

  /** Ansicht (Mitte und Zoom), die den Rahmen vollständig zeigt. */
  function fitView(box, width, height, padding, limits) {
    limits = limits || {};
    var pad = padding || 40;
    var w = Math.max(box.x1 - box.x0, 1);
    var h = Math.max(box.y1 - box.y0, 1);
    var zoom = Math.min((width - 2 * pad) / w, (height - 2 * pad) / h, limits.max || 2);
    zoom = util.clamp(zoom, limits.min || 0.15, limits.max || 6);
    return { cx: (box.x0 + box.x1) / 2, cy: (box.y0 + box.y1) / 2, zoom: zoom };
  }

  BAO.ink = {
    widthAt: widthAt,
    maxWidth: maxWidth,
    dotWidth: dotWidth,
    pressureCurve: pressureCurve,
    speedPressure: speedPressure,
    flexPressure: flexPressure,
    hookLength: hookLength,
    doubleGap: doubleGap,
    waveAmplitude: waveAmplitude,
    waveLength: waveLength,
    underlineLines: underlineLines,
    underlineHook: underlineHook,
    bbox: bbox,
    unionBox: unionBox,
    boxesIntersect: boxesIntersect,
    pointInBox: pointInBox,
    contentBox: contentBox,
    distPointSegment: distPointSegment,
    distSegmentSegment: distSegmentSegment,
    strokeHit: strokeHit,
    eraseWhole: eraseWhole,
    erasePartial: erasePartial,
    pointInPolygon: pointInPolygon,
    polygonBox: polygonBox,
    lassoSelect: lassoSelect,
    translate: translate,
    fitView: fitView,
    round1: round1
  };
})(window.BAO = window.BAO || {});
