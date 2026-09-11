/* ==========================================================================
   Companion-Modus: Verbindung zum Teacher Soundboard
   Ein schmaler Adapter, mehr nicht. Er nimmt genau die freigegebenen Befehle
   entgegen und bildet sie auf die vorhandenen Bausteine BAO.session,
   BAO.output, BAO.board und BAO.app ab. Projektionslogik entsteht hier keine.

   Technisch: Boîte à Oublis ist der Client. Ein Browserfenster kann selbst
   keinen Port öffnen, darf sich aber zu ws://127.0.0.1 verbinden – auch aus
   einer Datei heraus. Der Server liegt deshalb im Teacher Soundboard.

   Wichtig für die Daten: Die Verbindung merkt sich ihren Stand in einem
   eigenen Eintrag des lokalen Speichers, nicht im Bestand. Der Ursprung der
   App bleibt unangetastet – eine Einladung steht ausschließlich im Textanker.
   ========================================================================== */
(function (BAO) {
  'use strict';

  var proto = BAO.companionProtocol;

  var STORAGE_KEY = 'bao.companion.v1';
  var CONNECT_TIMEOUT = 2000;       // Antwort des Ports
  var WELCOME_TIMEOUT = 3000;       // Antwort auf die Anmeldung
  var PAIRING_TIMEOUT = 150000;     // Wartezeit, während die Lehrkraft bestätigt
  var BACKOFF = [1000, 2000, 4000, 8000, 15000, 30000];

  var settings = { enabled: false, token: '', clientId: '' };
  var state = {
    phase: 'off',      // off | searching | pairing | connected | denied | superseded
    port: 0,
    note: '',
    windowBlocked: false,
    appName: ''
  };

  var socket = null;
  var invite = '';
  var invitePort = 0;
  var attempt = 0;
  var retryTimer = null;
  var connectTimer = null;
  var welcomeTimer = null;
  var statusTimer = null;
  var listeners = [];
  var guided = false;
  var invited = false;

  /* --- Eigener Eintrag im lokalen Speicher ---------------------------------- */

  function loadSettings() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      var data = JSON.parse(raw);
      if (!data || typeof data !== 'object') return;
      settings.enabled = !!data.enabled;
      settings.token = proto.text(data.token, 200);
      settings.clientId = proto.text(data.clientId, 60);
    } catch (err) { /* ohne gespeicherten Stand beginnt alles bei „aus“ */ }
  }

  function saveSettings() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (err) { /* Nur-Sitzung-Betrieb: die Verbindung gilt dann einmalig */ }
  }

  function clientId() {
    if (!settings.clientId) {
      settings.clientId = 'bao-' + Math.random().toString(36).slice(2, 10);
      saveSettings();
    }
    return settings.clientId;
  }

  /* --- Beobachter ------------------------------------------------------------ */

  function subscribe(fn) {
    listeners.push(fn);
    return function () {
      var index = listeners.indexOf(fn);
      if (index >= 0) listeners.splice(index, 1);
    };
  }

  function emit() {
    listeners.forEach(function (fn) {
      try { fn(getState()); } catch (err) { console.error('Fehler im Companion-Beobachter:', err); }
    });
  }

  function setPhase(phase, note) {
    if (state.phase === phase && state.note === (note || '')) return;
    state.phase = phase;
    state.note = note || '';
    emit();
  }

  /* --- Einladung aus dem Textanker -------------------------------------------
     Das Teacher Soundboard öffnet die Datei mit "#/companion/<port>/<code>".
     Der Textanker gehört nicht zum Ursprung der Seite: Der lokale Speicher
     bleibt derselbe. Ein Suchteil ("?") dürfte dafür nicht verwendet werden. */

  function consumeInvitation() {
    var hash = String(window.location.hash || '');
    var match = hash.match(/^#\/companion\/(\d{1,5})\/([A-Za-z0-9_-]{4,120})$/);
    if (!match) return false;
    invitePort = parseInt(match[1], 10) || 0;
    invite = match[2];
    invited = true;
    settings.enabled = true;
    saveSettings();
    try {
      // Ersetzen statt Anhängen: kein zusätzlicher Eintrag im Verlauf und
      // die Einladung verschwindet aus der Adresszeile.
      window.location.replace('#/');
    } catch (err) {
      window.location.hash = '#/';
    }
    return true;
  }

  /* --- Verbindung ------------------------------------------------------------ */

  function ports() {
    if (!invitePort) return proto.PORTS.slice();
    // Der eingeladene Port zuerst, die übrigen als Rückfallebene.
    return [invitePort].concat(proto.PORTS.filter(function (p) { return p !== invitePort; }));
  }

  function clearTimers() {
    if (connectTimer) { clearTimeout(connectTimer); connectTimer = null; }
    if (welcomeTimer) { clearTimeout(welcomeTimer); welcomeTimer = null; }
  }

  function closeSocket() {
    clearTimers();
    var current = socket;
    socket = null;
    if (!current) return;
    try {
      current.onopen = current.onclose = current.onerror = current.onmessage = null;
      current.close();
    } catch (err) { /* egal */ }
  }

  function scheduleRetry() {
    if (!settings.enabled) return;
    if (retryTimer) return;
    var delay = BACKOFF[Math.min(attempt, BACKOFF.length - 1)];
    attempt += 1;
    retryTimer = setTimeout(function () {
      retryTimer = null;
      tryPort(0);
    }, delay);
  }

  /**
   * Versucht einen Port. Scheitert er, kommt der nächste; nach dem letzten
   * wird in wachsenden Abständen erneut gesucht. Läuft das Teacher Soundboard
   * nicht, geschieht schlicht nichts weiter.
   */
  function tryPort(index) {
    if (!settings.enabled) return;
    var list = ports();
    if (index >= list.length) { setPhase('searching'); scheduleRetry(); return; }
    closeSocket();
    setPhase('searching');

    var port = list[index];
    var ws;
    try {
      ws = new WebSocket('ws://127.0.0.1:' + port + '/companion');
    } catch (err) {
      tryPort(index + 1);
      return;
    }
    socket = ws;

    connectTimer = setTimeout(function () {
      if (socket === ws && ws.readyState !== 1) { closeSocket(); tryPort(index + 1); }
    }, CONNECT_TIMEOUT);

    ws.onopen = function () {
      if (socket !== ws) return;
      if (connectTimer) { clearTimeout(connectTimer); connectTimer = null; }
      send(proto.build('hello', {
        client: {
          app: 'boite-a-oublis',
          name: 'Boîte à Oublis',
          version: BAO.schema.APP_VERSION,
          id: clientId()
        },
        token: settings.token || undefined,
        invite: invite || undefined
      }));
      welcomeTimer = setTimeout(function () {
        // Antwortet dort etwas anderes als das Soundboard, wird weitergesucht.
        if (socket === ws && state.phase !== 'connected') { closeSocket(); tryPort(index + 1); }
      }, WELCOME_TIMEOUT);
      setPhase('searching');
    };

    ws.onmessage = function (event) {
      if (socket !== ws) return;
      handleMessage(event.data, port);
    };

    ws.onerror = function () { /* Der Abschluss folgt gleich in onclose */ };

    ws.onclose = function () {
      if (socket !== ws) return;
      socket = null;
      clearTimers();
      if (state.phase === 'connected') {
        state.port = 0;
        setPhase('searching');
        attempt = 0;
        scheduleRetry();
      } else if (state.phase === 'pairing') {
        // Die Rückfrage wurde beendet, ohne dass eine Antwort ankam.
        setPhase('searching');
        scheduleRetry();
      } else if (state.phase !== 'denied' && state.phase !== 'superseded') {
        tryPort(index + 1);
      }
    };
  }

  function send(raw) {
    if (!socket || socket.readyState !== 1) return false;
    try { socket.send(raw); return true; } catch (err) { return false; }
  }

  function handleMessage(raw, port) {
    var message = proto.parse(typeof raw === 'string' ? raw : '');
    if (!message) return;                       // unlesbar, fremd oder veraltet

    if (message.type === 'pending') {
      // Die Gegenstelle fragt gerade die Lehrkraft. Jetzt nicht weitersuchen,
      // sondern in Ruhe auf die Entscheidung warten.
      if (state.phase === 'connected') return;
      clearTimers();
      setPhase('pairing', 'Bitte die Verbindung im Teacher Soundboard bestätigen.');
      welcomeTimer = setTimeout(function () {
        if (socket && state.phase === 'pairing') { closeSocket(); setPhase('searching'); scheduleRetry(); }
      }, PAIRING_TIMEOUT);
      return;
    }

    if (message.type === 'welcome') {
      clearTimers();
      invite = '';
      invitePort = 0;
      attempt = 0;
      state.port = port;
      state.appName = proto.text(message.app, 60);
      var token = proto.text(message.token, 200);
      if (token && token !== settings.token) { settings.token = token; }
      settings.enabled = true;
      saveSettings();
      setPhase('connected');
      pushStatus();
      return;
    }

    if (message.type === 'denied') {
      var reason = proto.text(message.reason, 40);
      closeSocket();
      if (reason === 'superseded') {
        setPhase('superseded', 'Ein anderes Fenster steuert das Teacher Soundboard.');
        BAO.toast.show('Ein anderes Fenster steuert jetzt das Teacher Soundboard.', {
          timeout: 0,
          actionLabel: 'Hier übernehmen',
          onAction: function () { connect(); }
        });
      } else if (reason === 'rejected') {
        // Abgelehnt heißt abgelehnt: Erst auf ausdrücklichen Wunsch wieder fragen.
        settings.token = '';
        settings.enabled = false;
        saveSettings();
        setPhase('denied', 'Die Verbindung wurde im Teacher Soundboard abgelehnt.');
      } else {
        setPhase('denied', 'Das Teacher Soundboard hat die Verbindung abgelehnt (' + reason + ').');
      }
      return;
    }

    if (message.type === 'command') {
      runCommand(message);
      return;
    }
    // "ping" braucht keine Antwort: Das Protokoll des Browsers antwortet selbst.
  }

  /* --- Steuerung von außen ---------------------------------------------------- */

  function connect() {
    settings.enabled = true;
    saveSettings();
    if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
    attempt = 0;
    tryPort(0);
  }

  function disconnect(quiet) {
    settings.enabled = false;
    saveSettings();
    if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
    if (socket && socket.readyState === 1) send(proto.build('bye', {}));
    closeSocket();
    state.port = 0;
    setPhase('off', quiet ? '' : 'Die Verbindung ist getrennt.');
  }

  function forget() {
    settings.token = '';
    saveSettings();
    disconnect(true);
  }

  /* --- Zustandsmeldung --------------------------------------------------------- */

  function groupName(store, groupId) {
    var group = BAO.select.group(store, groupId);
    return group ? group.name : '';
  }

  function subjectName(store, subjectId) {
    var subject = BAO.select.subject(store, subjectId);
    return subject ? subject.name : '';
  }

  /** Der Stand, den das Teacher Soundboard für seine Kachel braucht. */
  function snapshot() {
    var store = BAO.store.getState();
    var payload = {
      kind: 'none',
      active: false,
      title: '',
      group: '',
      subject: '',
      level: 0,
      page: 0,
      pages: 0,
      blank: false,
      hasOutput: BAO.output.isWindowOpen() || BAO.output.isOverlayOpen(),
      windowBlocked: state.windowBlocked,
      appVersion: BAO.schema.APP_VERSION
    };

    if (BAO.board.isActive()) {
      var board = BAO.board.getBoard();
      var boardState = BAO.board.getState();
      payload.kind = 'board';
      payload.active = true;
      payload.blank = !!boardState.blank;
      if (board) {
        payload.title = board.title || 'Tafel';
        payload.group = groupName(store, board.groupId);
        payload.subject = subjectName(store, board.subjectId);
      }
      return payload;
    }

    var session = BAO.session.getState();
    if (!session.active) return payload;

    var bank = session.bankId ? BAO.select.bank(store, session.bankId) : null;
    payload.kind = bank ? 'bank' : 'live';
    payload.active = true;
    payload.title = bank ? bank.title : 'Live-Hilfe';
    payload.level = session.level;
    payload.page = session.index;
    payload.pages = BAO.session.totalSlides();
    payload.blank = !!session.blank;
    if (bank) {
      payload.group = groupName(store, bank.groupId);
      payload.subject = subjectName(store, bank.subjectId);
    }
    return payload;
  }

  function pushStatus() {
    if (state.phase !== 'connected') return;
    send(proto.build('status', { state: snapshot() }));
  }

  function schedulePush() {
    if (state.phase !== 'connected') return;
    if (statusTimer) return;
    statusTimer = setTimeout(function () {
      statusTimer = null;
      pushStatus();
    }, 120);
  }

  /* --- Ausgabefläche mit Rücksicht auf den Browser ------------------------------
     Ein eigenes Fenster darf ein Browser nur öffnen, wenn eine Benutzeraktion
     dahintersteht. Kommt der Wunsch über die Verbindung, ist das nicht der
     Fall. Statt die Sperre zu umgehen, erscheint die Projektion zunächst als
     Vollbild in dieser Ansicht und die Lehrkraft wird zum zweiten Fenster
     geführt. */

  function ensureOutput() {
    if (BAO.output.isWindowOpen() || BAO.output.isOverlayOpen()) return true;
    var result = BAO.output.openWindow();
    if (result && result.ok) {
      state.windowBlocked = false;
      return true;
    }
    state.windowBlocked = true;
    BAO.output.openOverlay();
    guideToWindow();
    return true;
  }

  function guideToWindow() {
    if (guided) return;
    guided = true;
    BAO.toast.show(
      'Die Projektion läuft als Vollbild in diesem Fenster. Für den Beamer braucht '
      + 'der Browser einen Klick, um ein eigenes Fenster zu öffnen.',
      {
        timeout: 0,
        actionLabel: 'Beamerfenster öffnen',
        onAction: function () { openWindowByGesture(); }
      }
    );
  }

  /** Wird aus einem echten Klick heraus aufgerufen – dann erlaubt der Browser das Fenster. */
  function openWindowByGesture() {
    var result = BAO.output.openWindow();
    if (result && result.ok) {
      state.windowBlocked = false;
      // Das Zeichnen übernimmt, wer gerade läuft: Sitzung oder Tafel hören
      // beide auf das Öffnen einer Ausgabefläche.
      BAO.output.closeOverlay();
      emit();
      schedulePush();
      return true;
    }
    BAO.toast.error('Der Browser hat das Fenster blockiert. Bitte Pop-ups für diese Seite erlauben.');
    return false;
  }

  /* --- Befehle ------------------------------------------------------------------ */

  function reply(id, ok, error, data) {
    send(proto.build('result', { id: id, ok: !!ok, error: error || undefined, data: data || undefined }));
  }

  function runCommand(message) {
    var id = proto.text(message.id, 40);
    var name = proto.text(message.name, 40);
    var args = proto.commandArgs(name, message.args);
    if (args === null) {
      reply(id, false, proto.isCommand(name) ? 'invalid-args' : 'unknown-command');
      return;
    }
    var outcome;
    try {
      outcome = execute(name, args);
    } catch (err) {
      console.error('Companion-Befehl fehlgeschlagen:', name, err);
      outcome = { ok: false, error: 'failed' };
    }
    reply(id, outcome.ok, outcome.error, outcome.data);
    schedulePush();
  }

  function sessionRunning() {
    return BAO.session.getState().active;
  }

  function execute(name, args) {
    switch (name) {
      case 'status.request':
        pushStatus();
        return { ok: true };

      case 'page.next':
        if (!sessionRunning()) return { ok: false, error: 'no-session' };
        return { ok: BAO.session.next(false) };

      case 'page.prev':
        if (!sessionRunning()) return { ok: false, error: 'no-session' };
        return { ok: BAO.session.prev() };

      case 'level.set':
        if (!sessionRunning()) return { ok: false, error: 'no-session' };
        BAO.session.setLevel(args.level);
        return { ok: true };

      case 'blank.toggle':
      case 'blank.set':
        return setBlank(name === 'blank.toggle' ? null : args.blank);

      case 'live.add':
        return addLive(args);

      case 'session.stop':
        return stopProjection();

      case 'output.open':
        ensureOutput();
        return { ok: true, data: { window: BAO.output.isWindowOpen() } };

      case 'library.list':
        return { ok: true, data: library() };

      case 'preset.start':
        return startPreset(args);

      default:
        return { ok: false, error: 'unknown-command' };
    }
  }

  function setBlank(wanted) {
    if (BAO.board.isActive()) {
      if (wanted === null || wanted !== BAO.board.getState().blank) BAO.board.toggleBlank();
      return { ok: true };
    }
    if (!sessionRunning()) return { ok: false, error: 'no-session' };
    if (wanted === null || wanted !== BAO.session.getState().blank) BAO.session.toggleBlank();
    return { ok: true };
  }

  function addLive(args) {
    if (BAO.board.isActive()) return { ok: false, error: 'board-active' };
    if (!sessionRunning()) {
      BAO.session.start('', {});
      ensureOutput();
    }
    var item = BAO.session.addLive({
      type: args.kind, text: args.text, translation: args.translation
    });
    if (!item) return { ok: false, error: 'empty' };
    if (BAO.app.currentRoute().path !== 'projektion') BAO.app.go('projektion');
    return { ok: true };
  }

  function stopProjection() {
    if (BAO.board.isActive()) {
      BAO.board.stop();
      BAO.output.closeOverlay();
      return { ok: true };
    }
    if (!sessionRunning()) return { ok: false, error: 'no-session' };
    BAO.session.stop();
    // Die geöffneten Flächen zeigen danach wieder den Bereitschaftstext,
    // damit auf dem Beamer nichts stehen bleibt.
    BAO.session.renderAll({ reason: 'stop' });
    BAO.output.closeOverlay();
    return { ok: true };
  }

  /** Titel und Kennungen – keine Wortschatzinhalte. */
  function library() {
    var store = BAO.store.getState();
    return {
      banks: (store.banks || []).slice(0, 300).map(function (bank) {
        return {
          id: bank.id,
          title: bank.title,
          group: groupName(store, bank.groupId),
          subject: subjectName(store, bank.subjectId),
          scene: bank.scene || '',
          defaultLevel: bank.defaultLevel || 2
        };
      }),
      boards: (store.boards || []).slice(0, 300).map(function (board) {
        return {
          id: board.id,
          title: board.title,
          group: groupName(store, board.groupId),
          subject: subjectName(store, board.subjectId),
          scene: '',
          defaultLevel: 2
        };
      })
    };
  }

  function startPreset(args) {
    var store = BAO.store.getState();
    if (args.kind === 'board') {
      if (!BAO.select.board(store, args.id)) return { ok: false, error: 'not-found' };
      BAO.app.projectBoard(args.id, { openOutput: false });
      ensureOutput();
      return { ok: true, data: { kind: 'board' } };
    }
    var bank = BAO.select.bank(store, args.id);
    if (!bank) return { ok: false, error: 'not-found' };
    BAO.app.projectBank(args.id, { level: args.level || bank.defaultLevel || 2, openOutput: false });
    ensureOutput();
    return { ok: true, data: { kind: 'bank' } };
  }

  /* --- Zugriff ------------------------------------------------------------------ */

  /** Befehl mit Prüfung ausführen – derselbe Weg wie über die Verbindung. */
  function executeChecked(name, rawArgs) {
    var args = proto.commandArgs(name, rawArgs);
    if (args === null) {
      return { ok: false, error: proto.isCommand(name) ? 'invalid-args' : 'unknown-command' };
    }
    try {
      return execute(name, args);
    } catch (err) {
      console.error('Companion-Befehl fehlgeschlagen:', name, err);
      return { ok: false, error: 'failed' };
    }
  }

  function getState() {
    return {
      enabled: settings.enabled,
      paired: !!settings.token,
      phase: state.phase,
      port: state.port,
      note: state.note,
      windowBlocked: state.windowBlocked,
      appName: state.appName,
      connected: state.phase === 'connected'
    };
  }

  function describe() {
    var current = getState();
    if (!current.enabled) return 'Nicht verbunden. Die Verbindung ist ausgeschaltet.';
    if (current.phase === 'connected') {
      return 'Verbunden mit Teacher Soundboard auf 127.0.0.1:' + current.port + '.';
    }
    if (current.phase === 'pairing') return 'Warte auf die Bestätigung im Teacher Soundboard …';
    if (current.phase === 'denied' || current.phase === 'superseded') return current.note;
    return 'Suche das Teacher Soundboard auf diesem Rechner …';
  }

  /* --- Start ---------------------------------------------------------------------- */

  function start() {
    // Nur wer die Verbindung eingeschaltet oder eine Einladung mitgebracht
    // hat, öffnet überhaupt eine Verbindung. Sonst geschieht hier nichts.
    if (settings.enabled) {
      // Nach dem Zeichnen der Oberfläche, damit der Start nicht wartet.
      window.setTimeout(function () { tryPort(0); }, invited ? 0 : 150);
    }

    BAO.session.subscribe(function () { schedulePush(); });
    BAO.board.subscribe(function () { schedulePush(); });
    BAO.output.onChange(function () { schedulePush(); });

    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState !== 'visible') return;
      if (!settings.enabled || state.phase === 'connected') return;
      if (state.phase === 'denied' || state.phase === 'superseded' || state.phase === 'pairing') return;
      if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
      attempt = 0;
      tryPort(0);
    });

    window.addEventListener('beforeunload', function () {
      if (socket && socket.readyState === 1) send(proto.build('bye', {}));
    });
  }

  BAO.companion = {
    start: start,
    connect: connect,
    disconnect: disconnect,
    forget: forget,
    subscribe: subscribe,
    getState: getState,
    describe: describe,
    snapshot: snapshot,
    pushStatus: pushStatus,
    openWindowByGesture: openWindowByGesture,
    // Für Prüfungen und die Verwaltungsansicht:
    execute: executeChecked,
    library: library,
    STORAGE_KEY: STORAGE_KEY
  };

  // Die Einladung wird schon beim Laden ausgewertet, damit die Adresszeile
  // sauber ist, bevor die Anwendung die erste Ansicht wählt.
  loadSettings();
  consumeInvitation();
})(window.BAO = window.BAO || {});
