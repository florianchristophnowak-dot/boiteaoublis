/* ==========================================================================
   Ausgabeflächen der Projektion
   Drei mögliche Flächen, die immer denselben Inhalt zeigen:
     1. eigenständiges Beamerfenster (bevorzugt, auf den zweiten Bildschirm)
     2. Vollbild-Überlagerung in der Lehreransicht (verlässliche Rückfallebene)
     3. kleine Vorschau in der Steuerungsansicht

   Das Beamerfenster wird über window.open('') erzeugt und anschließend
   programmatisch aufgebaut. Dadurch teilt es sich den Ursprung mit der
   Lehreransicht und funktioniert auch beim Start über file:// ohne
   Webserver, Kanäle oder Netzwerk.
   ========================================================================== */
(function (BAO) {
  'use strict';

  var util = BAO.util;
  var render = BAO.render;

  var surfaces = [];              // { kind, stage, doc, win }
  var keyHandlers = [];
  var changeHandlers = [];
  var beamerWindow = null;
  var overlayNode = null;
  var watchTimer = null;

  function notifyChange(reason) {
    changeHandlers.forEach(function (fn) { fn(reason); });
  }

  function emitKey(event, source) {
    keyHandlers.forEach(function (fn) { fn(event, source); });
  }

  function addSurface(kind, stage, doc, win) {
    var surface = { kind: kind, stage: stage, doc: doc, win: win || null };
    surfaces.push(surface);
    return surface;
  }

  function removeSurface(kind) {
    surfaces = surfaces.filter(function (s) { return s.kind !== kind; });
  }

  function getSurface(kind) {
    for (var i = 0; i < surfaces.length; i++) if (surfaces[i].kind === kind) return surfaces[i];
    return null;
  }

  function all() { return surfaces.slice(); }

  /* --- Beamerfenster -------------------------------------------------------- */

  function screenPlacement() {
    // Auf erweiterten Anzeigen möglichst rechts neben dem Hauptbildschirm
    // starten. Wenn der Browser nichts darüber verrät, bleibt es beim
    // gewohnten Fenster, das die Lehrkraft selbst verschieben kann.
    var width = 1280;
    var height = 760;
    var left = 60;
    var top = 60;
    try {
      if (window.screen && window.screen.isExtended && window.screen.availWidth) {
        left = window.screen.availWidth + 20;
        top = 0;
      }
    } catch (err) { /* Bildschirmangaben nicht verfügbar */ }
    return 'width=' + width + ',height=' + height + ',left=' + left + ',top=' + top
      + ',menubar=no,toolbar=no,location=no,status=no,scrollbars=no,resizable=yes';
  }

  function buildHint(doc) {
    var hint = doc.createElement('div');
    hint.className = 'stage__hint';
    [
      ['F', 'Vollbild'],
      ['← →', 'Blättern'],
      ['Leertaste', 'Automatik'],
      ['B', 'Bildschirm leeren']
    ].forEach(function (pair) {
      var span = doc.createElement('span');
      var kbd = doc.createElement('kbd');
      kbd.textContent = pair[0];
      span.appendChild(kbd);
      span.appendChild(doc.createTextNode(pair[1]));
      hint.appendChild(span);
    });
    return hint;
  }

  function showHint(stage, milliseconds) {
    if (!stage || !stage.hint) return;
    stage.hint.dataset.hidden = 'false';
    if (stage.hintTimer) clearTimeout(stage.hintTimer);
    stage.hintTimer = setTimeout(function () {
      stage.hint.dataset.hidden = 'true';
    }, milliseconds || 6000);
  }

  function openWindow() {
    var win;
    try {
      win = window.open('', 'bao-beamer', screenPlacement());
    } catch (err) {
      win = null;
    }
    if (!win) return { ok: false, reason: 'blocked' };

    beamerWindow = win;
    var doc = win.document;

    try {
      doc.open();
      doc.write('<!doctype html><html lang="de"><head><meta charset="utf-8">'
        + '<title>Boîte à Oublis – Projektion</title></head><body></body></html>');
      doc.close();
    } catch (err) {
      // Manche Browser erlauben document.write nicht – dann direkt aufbauen.
      if (doc.head) doc.head.innerHTML = '<meta charset="utf-8"><title>Boîte à Oublis – Projektion</title>';
    }

    render.ensureStyle(doc, true);
    if (doc.body) doc.body.innerHTML = '';

    var stage = render.createStage(doc);
    var hint = buildHint(doc);
    stage.hint = hint;
    doc.body.appendChild(stage.root);
    doc.body.appendChild(hint);
    showHint(stage, 8000);

    doc.addEventListener('keydown', function (event) { emitKey(event, 'window'); });
    doc.addEventListener('mousemove', function () { showHint(stage, 2500); });
    win.addEventListener('resize', function () { notifyChange('resize'); });
    win.addEventListener('pagehide', handleWindowClosed);
    win.addEventListener('unload', handleWindowClosed);

    removeSurface('window');
    addSurface('window', stage, doc, win);

    if (watchTimer) clearInterval(watchTimer);
    watchTimer = setInterval(function () {
      if (!beamerWindow || beamerWindow.closed) handleWindowClosed();
    }, 1000);

    notifyChange('window-opened');
    return { ok: true, window: win, stage: stage };
  }

  function handleWindowClosed() {
    if (!getSurface('window') && !beamerWindow) return;
    if (beamerWindow && !beamerWindow.closed) return;   // pagehide ohne Schließen
    if (watchTimer) { clearInterval(watchTimer); watchTimer = null; }
    beamerWindow = null;
    removeSurface('window');
    notifyChange('window-closed');
  }

  function isWindowOpen() { return !!(beamerWindow && !beamerWindow.closed); }

  function closeWindow() {
    if (beamerWindow && !beamerWindow.closed) beamerWindow.close();
    beamerWindow = null;
    if (watchTimer) { clearInterval(watchTimer); watchTimer = null; }
    removeSurface('window');
    notifyChange('window-closed');
  }

  function focusWindow() {
    if (isWindowOpen()) { try { beamerWindow.focus(); } catch (err) { /* egal */ } }
  }

  function requestWindowFullscreen() {
    if (!isWindowOpen()) return false;
    try {
      var element = beamerWindow.document.documentElement;
      if (element.requestFullscreen) { element.requestFullscreen(); return true; }
    } catch (err) { /* Browser verweigert ohne direkte Nutzeraktion */ }
    return false;
  }

  /* --- Vollbild-Überlagerung ------------------------------------------------ */

  function openOverlay() {
    if (overlayNode) return getSurface('overlay');
    render.ensureStyle(document, false);
    overlayNode = util.h('div.stage-overlay', { role: 'region', 'aria-label': 'Projektion' });
    var stage = render.createStage(document);
    var hint = buildHint(document);
    stage.hint = hint;
    overlayNode.appendChild(stage.root);
    overlayNode.appendChild(hint);
    document.getElementById('overlay-root').appendChild(overlayNode);
    // Kurzmeldungen der Lehreransicht dürfen nicht auf der Leinwand landen.
    document.body.dataset.projecting = 'true';
    showHint(stage, 6000);

    overlayNode.addEventListener('mousemove', function () { showHint(stage, 2500); });

    var surface = addSurface('overlay', stage, document, window);
    notifyChange('overlay-opened');

    if (overlayNode.requestFullscreen) {
      var promise = overlayNode.requestFullscreen();
      if (promise && promise.catch) promise.catch(function () { /* Vollbild abgelehnt */ });
    }
    return surface;
  }

  function closeOverlay() {
    if (!overlayNode) return;
    if (document.fullscreenElement === overlayNode && document.exitFullscreen) {
      var promise = document.exitFullscreen();
      if (promise && promise.catch) promise.catch(function () { /* egal */ });
    }
    if (overlayNode.parentNode) overlayNode.parentNode.removeChild(overlayNode);
    overlayNode = null;
    delete document.body.dataset.projecting;
    removeSurface('overlay');
    notifyChange('overlay-closed');
  }

  function isOverlayOpen() { return !!overlayNode; }

  function toggleOverlayFullscreen() {
    if (!overlayNode) return;
    if (document.fullscreenElement) {
      if (document.exitFullscreen) document.exitFullscreen();
    } else if (overlayNode.requestFullscreen) {
      overlayNode.requestFullscreen();
    }
  }

  /* --- Vorschau in der Lehreransicht ---------------------------------------- */

  function attachPreview(container) {
    render.ensureStyle(document, false);
    removeSurface('preview');
    util.clear(container);
    var stage = render.createStage(document);
    container.appendChild(stage.root);
    return addSurface('preview', stage, document, window);
  }

  function detachPreview() { removeSurface('preview'); }

  /* --- Ereignisse ----------------------------------------------------------- */

  function onKey(handler) { keyHandlers.push(handler); }
  function onChange(handler) { changeHandlers.push(handler); }

  document.addEventListener('fullscreenchange', function () { notifyChange('fullscreen'); });
  window.addEventListener('beforeunload', function () {
    if (beamerWindow && !beamerWindow.closed) beamerWindow.close();
  });
  window.addEventListener('resize', function () { notifyChange('resize'); });

  BAO.output = {
    openWindow: openWindow,
    closeWindow: closeWindow,
    isWindowOpen: isWindowOpen,
    focusWindow: focusWindow,
    requestWindowFullscreen: requestWindowFullscreen,
    openOverlay: openOverlay,
    closeOverlay: closeOverlay,
    isOverlayOpen: isOverlayOpen,
    toggleOverlayFullscreen: toggleOverlayFullscreen,
    attachPreview: attachPreview,
    detachPreview: detachPreview,
    surfaces: all,
    getSurface: getSurface,
    showHint: showHint,
    onKey: onKey,
    onChange: onChange
  };
})(window.BAO = window.BAO || {});
