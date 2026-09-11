/* ==========================================================================
   Companion-Protokoll
   Das gemeinsame Nachrichtenformat zwischen Boîte à Oublis und dem Teacher
   Soundboard. Bewusst winzig, versioniert und ohne jede Fremdbibliothek.

   Grundsatz: Es gibt eine feste Liste erlaubter Befehle. Alles andere wird
   verworfen – kein freies JavaScript, kein Dateizugriff, keine Umwege. Jede
   eingehende Nachricht wird auf Protokollnamen, Version, Typ und Inhalt
   geprüft, bevor sie überhaupt betrachtet wird.
   ========================================================================== */
(function (BAO) {
  'use strict';

  var PROTOCOL = 'bao-companion';
  var VERSION = 1;

  // Dieselbe Liste steht im Teacher Soundboard. Der erste erreichbare Port
  // gewinnt; mehr als diese drei werden nie probiert.
  var PORTS = [8317, 8318, 8319];

  var MAX_BYTES = 64 * 1024;

  var SERVER_TYPES = { welcome: true, pending: true, denied: true, command: true, ping: true };

  /* --- Prüfung einzelner Werte --------------------------------------------- */

  function text(value, limit) {
    if (typeof value === 'number' && isFinite(value)) value = String(value);
    if (typeof value !== 'string') return '';
    return value.replace(/[\r\n]+/g, ' ').trim().slice(0, limit || 300);
  }

  function level(value) {
    var parsed = typeof value === 'number' ? value : parseInt(value, 10);
    return (parsed === 1 || parsed === 2 || parsed === 3) ? parsed : 0;
  }

  /* --- Erlaubte Befehle ------------------------------------------------------
     Jeder Eintrag liefert entweder geprüfte Parameter oder null. null heißt:
     Der Befehl wird nicht ausgeführt. */
  var COMMANDS = {
    'page.next': function () { return {}; },
    'page.prev': function () { return {}; },
    'level.set': function (args) {
      var value = level(args.level);
      return value ? { level: value } : null;
    },
    'blank.toggle': function () { return {}; },
    'blank.set': function (args) { return { blank: !!args.blank }; },
    'live.add': function (args) {
      var value = text(args.text, 240);
      if (!value) return null;
      return {
        text: value,
        translation: text(args.translation, 240),
        kind: args.kind === 'starter' ? 'starter' : 'word'
      };
    },
    'session.stop': function () { return {}; },
    'output.open': function () { return {}; },
    'library.list': function () { return {}; },
    'preset.start': function (args) {
      var id = text(args.id, 120);
      if (!id) return null;
      var payload = { id: id, kind: args.kind === 'board' ? 'board' : 'bank' };
      var wanted = level(args.level);
      if (wanted) payload.level = wanted;
      return payload;
    },
    'status.request': function () { return {}; }
  };

  /* --- Nachrichten ----------------------------------------------------------- */

  function build(type, fields) {
    var message = { protocol: PROTOCOL, v: VERSION, type: type };
    Object.keys(fields || {}).forEach(function (key) {
      if (fields[key] !== undefined && fields[key] !== null) message[key] = fields[key];
    });
    return JSON.stringify(message);
  }

  /**
   * Prüft eine Nachricht der Gegenstelle.
   * Gibt null zurück, sobald irgendetwas nicht stimmt: kaputtes JSON, fremdes
   * Protokoll, andere Version, unbekannter Typ, zu groß.
   */
  function parse(raw) {
    if (typeof raw !== 'string' || !raw || raw.length > MAX_BYTES) return null;
    var data;
    try { data = JSON.parse(raw); } catch (err) { return null; }
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
    if (data.protocol !== PROTOCOL) return null;
    if (data.v !== VERSION) return null;
    if (typeof data.type !== 'string' || !SERVER_TYPES[data.type]) return null;
    return data;
  }

  /** Geprüfte Parameter eines Befehls oder null. */
  function commandArgs(name, args) {
    if (typeof name !== 'string' || !Object.prototype.hasOwnProperty.call(COMMANDS, name)) return null;
    return COMMANDS[name](args && typeof args === 'object' ? args : {});
  }

  function isCommand(name) {
    return typeof name === 'string' && Object.prototype.hasOwnProperty.call(COMMANDS, name);
  }

  BAO.companionProtocol = {
    PROTOCOL: PROTOCOL,
    VERSION: VERSION,
    PORTS: PORTS,
    MAX_BYTES: MAX_BYTES,
    COMMAND_NAMES: Object.keys(COMMANDS),
    build: build,
    parse: parse,
    commandArgs: commandArgs,
    isCommand: isCommand,
    text: text,
    level: level
  };
})(window.BAO = window.BAO || {});
