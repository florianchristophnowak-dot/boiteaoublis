/* ==========================================================================
   Klänge abspielen
   Die Münzen des Soundboards: Jede spielt eine Audio- oder Videodatei. Ein
   zweiter Klick auf dieselbe Münze stoppt, eine andere Münze löst die
   laufende ab. Ein Video erscheint über der Leinwand – groß in der Mitte,
   bildfüllend oder kurz bildfüllend und danach groß.

   Der Ton kommt immer aus dem Hauptfenster: Dort hat die Lehrkraft geklickt,
   also erlaubt der Browser die Wiedergabe. Ist das Beamerfenster offen,
   läuft das Video dort stumm und im Gleichschritt mit.

   Daneben gibt es einen zweiten, unabhängigen Spieler für den Klang am Ende
   des Timers – er darf eine laufende Münze nicht abbrechen.
   ========================================================================== */
(function (BAO) {
  'use strict';

  var util = BAO.util;

  var FORMAT_TIP = 'Am zuverlässigsten sind MP3 oder WAV für Klänge und MP4 (H.264/AAC) oder WebM für Videos.';
  var AUDIO_ACCEPT = 'audio/*,.mp3,.wav,.ogg,.oga,.flac,.m4a,.aac,.opus';
  var MEDIA_ACCEPT = AUDIO_ACCEPT + ',video/*,.mp4,.m4v,.mov,.webm,.mkv';
  var IMAGE_ACCEPT = 'image/png,image/jpeg,image/svg+xml,image/webp,image/gif,.png,.jpg,.jpeg,.svg,.webp,.gif';
  var PROBE_TIMEOUT_MS = 6000;

  var current = null;        // { index, video, element, frames: [{ node, doc }], mirror, burst }
  var timerAudio = null;
  var listeners = [];

  function emit(reason) {
    listeners.slice().forEach(function (fn) {
      try { fn(reason); } catch (err) { console.error('Fehler im Beobachter der Klänge:', err); }
    });
  }

  function subscribe(fn) {
    listeners.push(fn);
    return function () {
      var i = listeners.indexOf(fn);
      if (i >= 0) listeners.splice(i, 1);
    };
  }

  function options() { return BAO.classroom.settings().sounds; }
  function volume() { return util.clamp(Number(options().volume), 0, 1); }

  /* --- Datei prüfen ------------------------------------------------------------ */

  /**
   * Kann der Browser die Datei abspielen – und ist es ein Klang oder ein Video?
   * Maßgeblich ist der Inhalt, nicht die Endung: Eine MP4-Datei ohne Bildspur
   * ist ein Klang.
   * @returns {Promise<{ok: boolean, kind: string, duration: number}>}
   */
  function probe(blob) {
    return new Promise(function (resolve) {
      var source = URL.createObjectURL(blob);
      var element = document.createElement('video');
      var done = false;
      var guard = window.setTimeout(function () { finish({ ok: false, kind: '', duration: 0 }); }, PROBE_TIMEOUT_MS);
      function finish(result) {
        if (done) return;
        done = true;
        window.clearTimeout(guard);
        element.onloadedmetadata = element.onerror = null;
        element.removeAttribute('src');
        try { element.load(); } catch (err) { /* egal */ }
        URL.revokeObjectURL(source);
        resolve(result);
      }
      element.preload = 'metadata';
      element.muted = true;
      element.onloadedmetadata = function () {
        finish({
          ok: true,
          kind: element.videoWidth > 0 && element.videoHeight > 0 ? 'video' : 'audio',
          duration: isFinite(element.duration) ? element.duration : 0
        });
      };
      element.onerror = function () { finish({ ok: false, kind: '', duration: 0 }); };
      element.src = source;
    });
  }

  /* --- Video über der Leinwand ---------------------------------------------------- */

  function hostOf(doc) {
    return doc.fullscreenElement && doc.fullscreenElement !== doc.documentElement
      ? doc.fullscreenElement : doc.body;
  }

  function buildFrame(doc, source, muted) {
    BAO.render.ensureStyle(doc, false);
    var video = doc.createElement('video');
    video.className = 'snd-video__film';
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.muted = !!muted;
    video.src = source;
    var node = doc.createElement('div');
    node.className = 'snd-video';
    node.setAttribute('role', 'button');
    node.setAttribute('aria-label', 'Video – Klick beendet die Wiedergabe');
    var box = doc.createElement('div');
    box.className = 'snd-video__box';
    box.appendChild(video);
    node.appendChild(box);
    box.addEventListener('click', function () { stop(); });
    hostOf(doc).appendChild(node);
    return { node: node, doc: doc, video: video };
  }

  function setMode(mode) {
    if (!current) return;
    current.frames.forEach(function (frame) { frame.node.dataset.mode = mode; });
  }

  function showVideo(source) {
    var settings = options();
    current.frames.push(buildFrame(document, source, false));
    current.element = current.frames[0].video;

    // Im Beamerfenster läuft dasselbe Video stumm mit.
    var surface = BAO.output.getSurface('window');
    if (surface && surface.doc && surface.doc !== document) {
      try {
        var twin = buildFrame(surface.doc, source, true);
        current.frames.push(twin);
        current.mirror = twin.video;
      } catch (err) { console.warn('Video im Beamerfenster nicht möglich:', err); }
    }

    if (settings.videoMode === 'full') {
      setMode('full');
    } else if (settings.videoMode === 'burst') {
      setMode('full');
      current.burst = window.setTimeout(function () { setMode('large'); },
        Math.max(200, Math.round(settings.burstSeconds * 1000)));
    } else {
      setMode('large');
    }
  }

  function syncMirror() {
    if (!current || !current.mirror) return;
    var mirror = current.mirror;
    try {
      if (Math.abs(mirror.currentTime - current.element.currentTime) > 0.25) mirror.currentTime = current.element.currentTime;
      if (mirror.paused) { var attempt = mirror.play(); if (attempt && attempt.catch) attempt.catch(function () {}); }
    } catch (err) { /* Fenster inzwischen geschlossen */ }
  }

  /* --- Münzen ------------------------------------------------------------------------ */

  function playingIndex() { return current ? current.index : -1; }
  function isVideoShowing() { return !!(current && current.video); }

  function reportError(name) {
    BAO.toast.error('„' + name + '“ konnte nicht abgespielt werden. ' + FORMAT_TIP);
  }

  /**
   * Löst eine Münze aus (index 0 … 7).
   * @returns {'playing'|'stopped'|'empty'|'missing'|'none'}
   */
  function trigger(index) {
    var button = options().buttons[index];
    if (!button) return 'none';
    if (!button.mediaId) return 'empty';
    if (!BAO.media.has(button.mediaId)) return 'missing';

    if (current && current.index === index) { stop(); return 'stopped'; }
    stop();

    var source = BAO.media.url(button.mediaId);
    var session = { index: index, video: button.kind === 'video', element: null, frames: [], mirror: null, burst: null, failed: false };
    current = session;

    if (session.video) showVideo(source);
    else { session.element = new Audio(); session.element.src = source; }

    var element = session.element;
    element.volume = volume();
    element.addEventListener('ended', function () { if (current === session) stop(); });
    element.addEventListener('error', function () { fail(session, button.name); });
    if (session.mirror) {
      element.addEventListener('playing', syncMirror);
      element.addEventListener('timeupdate', syncMirror);
    }

    var attempt;
    try { attempt = element.play(); } catch (err) { fail(session, button.name); return 'none'; }
    if (attempt && attempt.catch) attempt.catch(function (err) {
      // Ein Abbruch durch stop() ist kein Fehler.
      if (err && err.name === 'AbortError') return;
      fail(session, button.name);
    });

    emit('play');
    return 'playing';
  }

  function fail(session, name) {
    if (session.failed || current !== session) return;
    session.failed = true;            // genau eine Meldung je Fehlversuch
    stop();
    reportError(name || 'Die Datei');
  }

  function release(element) {
    if (!element) return;
    try {
      element.pause();
      element.removeAttribute('src');
      element.load();
    } catch (err) { /* Fenster inzwischen geschlossen */ }
  }

  function stop() {
    if (!current) return false;
    var session = current;
    current = null;
    if (session.burst) window.clearTimeout(session.burst);
    release(session.element);
    session.frames.forEach(function (frame) {
      release(frame.video);
      try { if (frame.node.parentNode) frame.node.parentNode.removeChild(frame.node); } catch (err) { /* egal */ }
    });
    emit('stop');
    return true;
  }

  /** Meldungen in Worten – für Klicks außerhalb der Verwaltung. */
  function triggerWithFeedback(index) {
    var result = trigger(index);
    var button = options().buttons[index];
    if (result === 'empty') {
      BAO.toast.show('Für Münze ' + (index + 1) + ' ist keine Medien-Datei zugewiesen.', {
        actionLabel: 'Soundboard öffnen', onAction: function () { BAO.app.go('soundboard'); }
      });
    } else if (result === 'missing') {
      BAO.toast.error('Die Datei „' + (button.name || 'ohne Namen') + '“ für Münze ' + (index + 1)
        + ' liegt in diesem Browser nicht mehr vor. Bitte neu zuweisen oder die Sicherungsdatei wiederherstellen.');
    }
    return result;
  }

  /** Lautstärke sofort anwenden – etwa während der Regler gezogen wird. */
  function applyVolume(value) {
    var level = util.clamp(Number(value), 0, 1);
    if (current && current.element) current.element.volume = level;
    if (timerAudio) timerAudio.volume = level;
  }

  /* --- Klang am Ende des Timers --------------------------------------------------------- */

  function stopTimerSound() {
    if (!timerAudio) return;
    release(timerAudio);
    timerAudio = null;
  }

  /** @returns {boolean} true, wenn ein Klang gestartet wurde */
  function playTimerSound() {
    stopTimerSound();
    var sound = BAO.classroom.settings().timerSound;
    if (!sound || !sound.mediaId || !BAO.media.has(sound.mediaId)) return false;
    var audio = new Audio();
    timerAudio = audio;
    audio.src = BAO.media.url(sound.mediaId);
    audio.volume = volume();
    audio.addEventListener('ended', function () { if (timerAudio === audio) stopTimerSound(); });
    try {
      var attempt = audio.play();
      if (attempt && attempt.catch) attempt.catch(function (err) {
        if (err && err.name === 'AbortError') return;
        console.warn('Der Klang am Ende des Timers ließ sich nicht abspielen:', err);
      });
    } catch (err) { return false; }
    return true;
  }

  function stopAll() {
    var stopped = stop();
    if (timerAudio) { stopTimerSound(); stopped = true; }
    return stopped;
  }

  /* --- Tastatur -----------------------------------------------------------------------------
     Überall in der App, auch im Beamerfenster:
       Alt + Umschalt + 1 … 8   Münze auslösen (nur sichtbare Münzen)
       Alt + Umschalt + 0       alles stoppen
     Solange ein Video zu sehen ist, beenden Esc, Leertaste und Rücktaste es.
     Die Tasten werden abgefangen, bevor Projektion, Tafel oder Whiteboard sie
     sehen – sonst löschte die Rücktaste nebenbei ein Element der Tafel. */

  function digitOf(event) {
    var match = /^(?:Digit|Numpad)([0-9])$/.exec(event.code || '');
    return match ? parseInt(match[1], 10) : -1;
  }

  function onKeyDown(event) {
    if (isVideoShowing() && !event.ctrlKey && !event.metaKey && !event.altKey
      && (event.key === 'Escape' || event.key === ' ' || event.key === 'Spacebar' || event.key === 'Backspace')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      stop();
      return;
    }
    if (!event.altKey || !event.shiftKey || event.ctrlKey || event.metaKey) return;
    var digit = digitOf(event);
    if (digit < 0 || digit > BAO.classroomModel.MAX_BUTTONS) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.repeat) return;
    if (digit === 0) { stopAll(); return; }
    if (digit <= options().visible) triggerWithFeedback(digit - 1);
  }

  /**
   * Bindet die Tastatur eines Dokuments an – Hauptfenster oder Beamerfenster.
   * Mehrfaches Anbinden schadet nicht: Derselbe Beobachter zählt nur einmal.
   */
  function bindDocument(doc) {
    if (doc) doc.addEventListener('keydown', onKeyDown, true);
  }

  bindDocument(document);

  BAO.sounds = {
    FORMAT_TIP: FORMAT_TIP,
    AUDIO_ACCEPT: AUDIO_ACCEPT,
    MEDIA_ACCEPT: MEDIA_ACCEPT,
    IMAGE_ACCEPT: IMAGE_ACCEPT,
    subscribe: subscribe,
    probe: probe,
    trigger: trigger,
    triggerWithFeedback: triggerWithFeedback,
    stop: stop,
    stopAll: stopAll,
    playingIndex: playingIndex,
    isVideoShowing: isVideoShowing,
    applyVolume: applyVolume,
    playTimerSound: playTimerSound,
    stopTimerSound: stopTimerSound,
    isTimerSoundPlaying: function () { return !!timerAudio; },
    bindDocument: bindDocument
  };
})(window.BAO = window.BAO || {});
