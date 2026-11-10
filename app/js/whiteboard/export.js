/* ==========================================================================
   Whiteboard als Bild
   Was auf einem Whiteboard geschrieben steht, soll die Stunde überleben: als
   Bild fürs Arbeitsblatt, für die Lernplattform oder zum Verschicken an die
   Klasse. Gezeichnet wird alles Geschriebene – nicht nur der Ausschnitt, der
   gerade zu sehen ist – stets hell, wie auf Papier.

   Verwendet nur die öffentliche Zeichenschnittstelle der Fläche
   (BAO.whiteboard, BAO.ink).
   ========================================================================== */
(function (BAO) {
  'use strict';

  var util = BAO.util;

  var MARGIN = 40;            // Rand um das Geschriebene, in Einheiten der Fläche
  var SCALE = 2;              // Bildpunkte je Einheit – scharf auch im Ausdruck
  var MAX_SIDE = 8000;        // Browser begrenzen die Kantenlänge einer Leinwand
  var MAX_PIXELS = 24e6;
  var GRID_STEP = 40;         // Raster wie auf der Zeichenfläche

  /** Die Farben der hellen Darstellung – auch wenn die App gerade dunkel ist. */
  function lightColors() {
    var root = document.documentElement;
    var previous = root.dataset.theme;
    root.dataset.theme = 'light';
    var colors;
    try { colors = BAO.whiteboard.resolveColors(document); }
    finally {
      if (previous === undefined) delete root.dataset.theme; else root.dataset.theme = previous;
    }
    return colors;
  }

  /** Linien, Karos oder Punkte – in den Koordinaten der Fläche. */
  function drawPattern(ctx, kind, colors, area, scale) {
    if (kind !== 'lines' && kind !== 'grid' && kind !== 'dots') return;
    var startX = Math.ceil(area.x0 / GRID_STEP) * GRID_STEP;
    var startY = Math.ceil(area.y0 / GRID_STEP) * GRID_STEP;
    var x, y;
    ctx.strokeStyle = colors.grid;
    ctx.fillStyle = colors.grid;
    ctx.lineWidth = 1 / Math.min(scale, 1.5);
    if (kind === 'dots') {
      for (x = startX; x <= area.x1; x += GRID_STEP) {
        for (y = startY; y <= area.y1; y += GRID_STEP) {
          ctx.beginPath();
          ctx.arc(x, y, 1.3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      return;
    }
    ctx.beginPath();
    for (y = startY; y <= area.y1; y += GRID_STEP) { ctx.moveTo(area.x0, y); ctx.lineTo(area.x1, y); }
    if (kind === 'grid') {
      for (x = startX; x <= area.x1; x += GRID_STEP) { ctx.moveTo(x, area.y0); ctx.lineTo(x, area.y1); }
    }
    ctx.stroke();
  }

  /**
   * Zeichnet ein Whiteboard vollständig auf eine neue Leinwand.
   * @returns {HTMLCanvasElement|null} null, wenn nichts geschrieben steht
   */
  function toCanvas(board) {
    var strokes = (board && board.strokes) || [];
    var box = BAO.ink.contentBox(strokes);
    if (!box) return null;

    var area = { x0: box.x0 - MARGIN, y0: box.y0 - MARGIN, x1: box.x1 + MARGIN, y1: box.y1 + MARGIN };
    var width = area.x1 - area.x0;
    var height = area.y1 - area.y0;
    // Sehr große Flächen werden etwas gröber – lieber ein Bild als keines.
    var scale = Math.min(SCALE, MAX_SIDE / Math.max(width, height), Math.sqrt(MAX_PIXELS / (width * height)));

    var canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    var ctx = canvas.getContext('2d');
    var colors = lightColors();

    ctx.fillStyle = colors.paper;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(scale, 0, 0, scale, -area.x0 * scale, -area.y0 * scale);
    drawPattern(ctx, board.background, colors, area, scale);
    BAO.whiteboard.drawStrokes(ctx, strokes, { colors: colors });
    return canvas;
  }

  /** Speichert das Whiteboard als PNG-Datei im Download-Ordner. */
  function savePng(board) {
    var canvas;
    try { canvas = toCanvas(board); }
    catch (err) {
      console.error('Whiteboard ließ sich nicht als Bild zeichnen:', err);
      BAO.toast.error('Das Bild ließ sich nicht erzeugen.');
      return Promise.resolve(false);
    }
    if (!canvas) {
      BAO.toast.show('Auf diesem Whiteboard steht noch nichts.');
      return Promise.resolve(false);
    }
    var name = 'whiteboard_' + util.fileSlug(board.title, 'tafelbild') + '.png';
    return new Promise(function (resolve) {
      canvas.toBlob(function (blob) {
        if (!blob) {
          BAO.toast.error('Das Bild ließ sich nicht erzeugen.');
          resolve(false);
          return;
        }
        util.downloadBlob(name, blob);
        BAO.toast.ok('„' + board.title + '“ als Bild gespeichert (' + canvas.width + ' × ' + canvas.height
          + ' Bildpunkte). Es liegt im Download-Ordner.');
        resolve(true);
      }, 'image/png');
    });
  }

  BAO.whiteboardImage = { toCanvas: toCanvas, savePng: savePng };
})(window.BAO = window.BAO || {});
