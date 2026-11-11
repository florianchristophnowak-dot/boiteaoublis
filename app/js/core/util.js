/* ==========================================================================
   Werkzeugkasten: DOM-Aufbau, Text- und Datumshilfen, kleine Helfer
   ========================================================================== */
(function (BAO) {
  'use strict';

  var counter = 0;

  /** Kurze, aber kollisionssichere ID (kein externer Dienst nötig). */
  function uid(prefix) {
    counter += 1;
    var rnd = Math.random().toString(36).slice(2, 8);
    return (prefix || 'id') + '_' + Date.now().toString(36) + rnd + counter.toString(36);
  }

  function nowISO() { return new Date().toISOString(); }

  function clone(value) {
    if (value === null || typeof value !== 'object') return value;
    return JSON.parse(JSON.stringify(value));
  }

  function debounce(fn, wait) {
    var t = null;
    function wrapped() {
      var args = arguments, self = this;
      if (t) clearTimeout(t);
      t = setTimeout(function () { t = null; fn.apply(self, args); }, wait);
    }
    wrapped.cancel = function () { if (t) { clearTimeout(t); t = null; } };
    wrapped.flush = function () { if (t) { clearTimeout(t); t = null; fn.call(this); } };
    return wrapped;
  }

  function clamp(n, min, max) { return n < min ? min : (n > max ? max : n); }

  /** Suchnormalisierung: Kleinschreibung ohne Akzente ("élève" -> "eleve"). */
  function fold(text) {
    if (text == null) return '';
    var s = String(text).toLowerCase();
    if (s.normalize) s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return s.replace(/[’']/g, "'").replace(/\s+/g, ' ').trim();
  }

  function escapeHtml(text) {
    return String(text == null ? '' : text)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* --- DOM ---------------------------------------------------------------- */

  /**
   * h('div.card#main', { text: 'Hallo', onclick: fn, dataset: {…} }, kind1, kind2)
   * Kinder dürfen Strings, Zahlen, Knoten, Arrays oder null sein.
   */
  function h(tag, props) {
    var doc = (props && props.ownerDocument) || document;
    var parts = String(tag).split(/(?=[.#])/);
    var node = doc.createElement(parts[0] || 'div');
    for (var i = 1; i < parts.length; i++) {
      var p = parts[i];
      if (p[0] === '.') node.classList.add(p.slice(1));
      else if (p[0] === '#') node.id = p.slice(1);
    }
    if (props) {
      Object.keys(props).forEach(function (key) {
        var value = props[key];
        if (value === null || value === undefined || value === false) return;
        if (key === 'ownerDocument') return;
        if (key === 'class' || key === 'className') { String(value).split(/\s+/).forEach(function (c) { if (c) node.classList.add(c); }); return; }
        if (key === 'text') { node.textContent = String(value); return; }
        if (key === 'html') { node.innerHTML = value; return; }
        if (key === 'dataset') { Object.keys(value).forEach(function (d) { if (value[d] !== null && value[d] !== undefined) node.dataset[d] = value[d]; }); return; }
        if (key === 'style' && typeof value === 'object') { Object.keys(value).forEach(function (s) { node.style.setProperty(s, value[s]); }); return; }
        if (key.slice(0, 2) === 'on' && typeof value === 'function') { node.addEventListener(key.slice(2), value); return; }
        if (value === true) { node.setAttribute(key, ''); return; }
        node.setAttribute(key, value);
      });
    }
    for (var a = 2; a < arguments.length; a++) append(node, arguments[a]);
    return node;
  }

  function append(parent, child) {
    if (child === null || child === undefined || child === false || child === true) return parent;
    if (Array.isArray(child)) { child.forEach(function (c) { append(parent, c); }); return parent; }
    if (child.nodeType) { parent.appendChild(child); return parent; }
    parent.appendChild((parent.ownerDocument || document).createTextNode(String(child)));
    return parent;
  }

  function clear(node) { while (node && node.firstChild) node.removeChild(node.firstChild); return node; }

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  /** Ereignisdelegation: on(root, 'click', '[data-action]', handler) */
  function on(root, type, selector, handler) {
    root.addEventListener(type, function (event) {
      var target = event.target;
      if (!target || !target.closest) return;
      var match = target.closest(selector);
      if (match && root.contains(match)) handler.call(match, event, match);
    });
  }

  /**
   * Fügt Text an der Cursorposition eines Eingabefelds ein und meldet die
   * Änderung wie eine Tastatureingabe. caretOffset verschiebt den Cursor
   * danach (z. B. -1, um zwischen zwei eben eingefügte Klammern zu springen).
   */
  function insertAtCursor(input, text, caretOffset) {
    var start = input.selectionStart === null ? input.value.length : input.selectionStart;
    var end = input.selectionEnd === null ? start : input.selectionEnd;
    input.value = input.value.slice(0, start) + text + input.value.slice(end);
    var position = start + text.length + (caretOffset || 0);
    // preventScroll: Ohne das springt die Ansicht bei jedem eingefügten
    // Zeichen zum Feld zurück – bei einer Zeichentastatur unbrauchbar.
    try { input.focus({ preventScroll: true }); } catch (err) { input.focus(); }
    try { input.setSelectionRange(position, position); } catch (err) { /* Feldtyp ohne Auswahl */ }
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  /* --- Text und Formate --------------------------------------------------- */

  function plural(n, one, many) { return n === 1 ? one : (many || one + 'e'); }

  function formatDate(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  function formatDateTime(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function relativeDate(iso) {
    if (!iso) return '';
    var diff = Date.now() - new Date(iso).getTime();
    if (isNaN(diff)) return '';
    var min = Math.round(diff / 60000);
    if (min < 1) return 'gerade eben';
    if (min < 60) return 'vor ' + min + ' Min.';
    var hrs = Math.round(min / 60);
    if (hrs < 24) return 'vor ' + hrs + ' Std.';
    var days = Math.round(hrs / 24);
    if (days === 1) return 'gestern';
    if (days < 7) return 'vor ' + days + ' Tagen';
    return formatDate(iso);
  }

  /** Aktuelles Schuljahr in der Form "2025/26" (Wechsel Anfang August). */
  function currentSchoolYear(date) {
    var d = date ? new Date(date) : new Date();
    var y = d.getFullYear();
    var start = d.getMonth() >= 7 ? y : y - 1;
    return start + '/' + String((start + 1) % 100).padStart(2, '0');
  }

  function nextSchoolYear(year) {
    var m = /^(\d{4})\/(\d{2})$/.exec(String(year || ''));
    if (!m) return currentSchoolYear();
    var start = parseInt(m[1], 10) + 1;
    return start + '/' + String((start + 1) % 100).padStart(2, '0');
  }

  function sortBy(list, keyFn) {
    return list.slice().sort(function (a, b) {
      var ka = keyFn(a), kb = keyFn(b);
      if (ka < kb) return -1;
      if (ka > kb) return 1;
      return 0;
    });
  }

  function byOrder(a, b) { return (a.order || 0) - (b.order || 0); }

  function groupBy(list, keyFn) {
    var map = new Map();
    list.forEach(function (item) {
      var key = keyFn(item);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(item);
    });
    return map;
  }

  function unique(list) { return Array.from(new Set(list)); }

  function moveInArray(list, from, to) {
    if (from === to || from < 0 || from >= list.length) return list;
    var item = list.splice(from, 1)[0];
    list.splice(Math.max(0, Math.min(list.length, to)), 0, item);
    return list;
  }

  /* --- Dateien ------------------------------------------------------------ */

  function downloadBlob(filename, blob) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  function downloadText(filename, text, mime) {
    downloadBlob(filename, new Blob([text], { type: (mime || 'application/json') + ';charset=utf-8' }));
  }

  /** Ein Name, der als Dateiname auf jedem System taugt. */
  function fileSlug(text, fallback) {
    var slug = fold(text).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
    return slug || fallback || 'datei';
  }

  /**
   * Legt Text in die Zwischenablage. Liefert ein Promise mit true oder false –
   * auch dort, wo die neue Schnittstelle fehlt (Aufruf als Datei, ältere
   * Browser): Dann hilft der klassische Weg über ein unsichtbares Textfeld.
   */
  function copyText(text) {
    function legacy() {
      var area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.top = '-1000px';
      area.style.opacity = '0';
      // Innerhalb eines offenen Dialogs einhängen, sonst hält dieser den Fokus fest.
      var host = document.querySelector('.modal') || document.body;
      var previous = document.activeElement;
      host.appendChild(area);
      var ok = false;
      try {
        area.select();
        area.setSelectionRange(0, area.value.length);
        ok = document.execCommand('copy');
      } catch (err) { ok = false; }
      host.removeChild(area);
      if (previous && previous.focus) { try { previous.focus(); } catch (err2) { /* Fokusziel verschwunden */ } }
      return ok;
    }
    if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext !== false) {
      return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return legacy(); });
    }
    return Promise.resolve(legacy());
  }

  function readFileAsText(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result)); };
      reader.onerror = function () { reject(new Error('Die Datei konnte nicht gelesen werden.')); };
      reader.readAsText(file, 'utf-8');
    });
  }

  function pickFile(accept) {
    return new Promise(function (resolve) {
      var input = document.createElement('input');
      input.type = 'file';
      if (accept) input.accept = accept;
      input.style.display = 'none';
      document.body.appendChild(input);
      input.addEventListener('change', function () {
        var file = input.files && input.files[0] ? input.files[0] : null;
        document.body.removeChild(input);
        resolve(file);
      });
      input.click();
    });
  }

  function prefersReducedMotion() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  BAO.util = {
    uid: uid, nowISO: nowISO, clone: clone, debounce: debounce, clamp: clamp,
    fold: fold, escapeHtml: escapeHtml,
    h: h, append: append, clear: clear, $: $, $$: $$, on: on, insertAtCursor: insertAtCursor,
    plural: plural, formatDate: formatDate, formatDateTime: formatDateTime, relativeDate: relativeDate,
    currentSchoolYear: currentSchoolYear, nextSchoolYear: nextSchoolYear,
    sortBy: sortBy, byOrder: byOrder, groupBy: groupBy, unique: unique, moveInArray: moveInArray,
    downloadText: downloadText, downloadBlob: downloadBlob, fileSlug: fileSlug, copyText: copyText,
    readFileAsText: readFileAsText, pickFile: pickFile,
    prefersReducedMotion: prefersReducedMotion
  };
})(window.BAO = window.BAO || {});
