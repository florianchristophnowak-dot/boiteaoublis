/* ==========================================================================
   Anwendungsrahmen
   Navigation, Arbeitskontext (Fach + Lerngruppe), Schnellsuche, Live-Hilfe,
   Tastenkürzel und das Zeichnen der jeweils aktiven Ansicht.
   ========================================================================== */
(function (BAO) {
  'use strict';

  var util = BAO.util;
  var h = util.h;
  var ui = BAO.ui;
  var select = BAO.select;

  /* Der einfache Modus zeigt nur, was für die Grundform gebraucht wird:
     Tafeln, Elemente, Lerngruppen, Daten. Erreichbar bleibt alles – die
     Adressen ändern sich nicht, nur die Navigationsleiste wird kürzer. */
  var ROUTES = [
    { path: 'start',        view: 'dashboard',  label: 'Start',        icon: 'home',   key: '1' },
    { path: 'tafeln',       view: 'boards',     label: 'Tafeln',       icon: 'beamer', key: '2', simple: true },
    { path: 'wortschatz',   view: 'vocab',      label: 'Wortschatz',   icon: 'list',   key: '3',
      simple: true, simpleLabel: 'Elemente' },
    { path: 'satzanfaenge', view: 'starters',   label: 'Satzanfänge',  icon: 'quote',  key: '4' },
    { path: 'wortbanken',   view: 'banks',      label: 'Wortbanken',   icon: 'grid',   key: '5' },
    { path: 'projektion',   view: 'present',    label: 'Projektion',   icon: 'play',   key: '6' },
    { path: 'tafel',        view: 'board',      label: 'Tafel',        icon: 'beamer', hidden: true },
    { path: 'wortbank',     view: 'bankEditor', label: 'Wortbank',     icon: 'grid',   hidden: true },
    { path: 'verwaltung',   view: 'manage',     label: 'Lerngruppen',  icon: 'school', key: '7', simple: true },
    { path: 'daten',        view: 'data',       label: 'Daten',        icon: 'data',   key: '8', simple: true }
  ];

  /* Änderungen, die nur die Leinwand betreffen. Ein vollständiger Neuaufbau
     der Lehreransicht wäre hier störend – beim Ziehen sogar sichtbar. */
  var QUIET_LABELS = {
    'Wortbank geöffnet': true, 'Tafel geöffnet': true,
    'Element verschoben': true, 'Elementgröße geändert': true
  };

  var current = { path: 'start', params: [] };
  var renderScheduled = false;
  var viewScrollTop = {};

  /* --- Routen --------------------------------------------------------------- */

  /** Läuft die Oberfläche in der einfachen Grundform? */
  function isSimple() {
    var state = BAO.store.getState();
    return !!(state && state.settings && state.settings.simpleMode);
  }

  function homePath() { return isSimple() ? 'tafeln' : 'start'; }

  /** Beschriftung einer Route – in der Grundform teils schlichter. */
  function routeLabel(route) {
    return (isSimple() && route.simpleLabel) ? route.simpleLabel : route.label;
  }

  function parseHash() {
    var hash = String(window.location.hash || '').replace(/^#\/?/, '');
    var parts = hash.split('/').filter(Boolean).map(decodeURIComponent);
    var path = parts[0] || homePath();
    var route = ROUTES.filter(function (r) { return r.path === path; })[0];
    if (!route) route = ROUTES.filter(function (r) { return r.path === homePath(); })[0] || ROUTES[0];
    return { path: route.path, route: route, params: parts.slice(1) };
  }

  function go(path) {
    var target = '#/' + String(path).replace(/^#?\/?/, '');
    if (window.location.hash === target) { renderView(); return; }
    window.location.hash = target;
  }

  function currentRoute() { return current; }

  /* --- Arbeitskontext -------------------------------------------------------- */

  function setContext(subjectId, groupId) {
    BAO.store.commit('Arbeitskontext gewechselt', function (draft) {
      if (subjectId) draft.ui.subjectId = subjectId;
      if (groupId !== undefined) draft.ui.groupId = groupId;
      if (groupId) {
        draft.ui.recentGroups = [groupId].concat((draft.ui.recentGroups || [])
          .filter(function (id) { return id !== groupId; })).slice(0, 8);
      }
    }, { undoable: false });
  }

  function renderContextSwitcher() {
    var state = BAO.store.getState();
    var ctx = select.context(state);
    var host = document.getElementById('context-switcher');
    util.clear(host);

    if (!ctx.subject) {
      host.appendChild(h('button.btn.btn--primary.btn--sm', {
        type: 'button', text: 'Erstes Fach anlegen',
        onclick: function () { go('verwaltung'); }
      }));
      return;
    }

    var subjectSelect = h('select', { 'aria-label': 'Fach wählen' });
    ctx.subjects.forEach(function (subject) {
      subjectSelect.appendChild(h('option', {
        value: subject.id, text: subject.name,
        selected: subject.id === ctx.subject.id ? true : null
      }));
    });
    subjectSelect.addEventListener('change', function () {
      var groups = select.groupsOfSubject(BAO.store.getState(), subjectSelect.value);
      setContext(subjectSelect.value, groups.length ? groups[0].id : '');
    });

    host.appendChild(h('div.ctx-select', { style: ui.subjectVars(ctx.subject) },
      h('span.ctx-flag', { text: ctx.subject.short || ctx.subject.name.slice(0, 2).toUpperCase() }),
      h('span.ctx-select__label', { text: 'Fach' }),
      subjectSelect
    ));

    var groupSelect = h('select', { 'aria-label': 'Lerngruppe wählen' });
    if (!ctx.groups.length) {
      groupSelect.appendChild(h('option', { value: '', text: 'keine Lerngruppe' }));
    }
    ctx.groups.forEach(function (group) {
      groupSelect.appendChild(h('option', {
        value: group.id,
        text: group.name + ' · Jg. ' + group.grade + (group.favorite ? ' ★' : ''),
        selected: ctx.group && group.id === ctx.group.id ? true : null
      }));
    });
    groupSelect.addEventListener('change', function () { setContext(ctx.subject.id, groupSelect.value); });

    host.appendChild(h('div.ctx-select', {},
      h('span.ctx-select__label', { text: 'Lerngruppe' }),
      groupSelect
    ));

    if (ctx.unit) {
      host.appendChild(h('span.chip.chip--outline', {
        title: 'Laufende Unterrichtsreihe', text: ctx.unit.title
      }));
    }
  }

  /* --- Navigationsleiste ----------------------------------------------------- */

  function renderRail() {
    var state = BAO.store.getState();
    var ctx = select.context(state);
    var rail = document.getElementById('rail');
    util.clear(rail);

    var counts = {
      vocab: ctx.group ? select.lexemesOfGroup(state, ctx.group.id).length : 0,
      starters: ctx.group ? select.startersOfGroup(state, ctx.group.id, ctx.subject ? ctx.subject.id : '').length : 0,
      banks: ctx.group ? select.banksOfGroup(state, ctx.group.id).length : 0,
      boards: ctx.group ? select.boardsOfGroup(state, ctx.group.id).length : 0
    };

    // Welche Ansicht ist im Untermenü einer anderen zu Hause?
    var PARENT = { wortbank: 'wortbanken', tafel: 'tafeln' };
    var simple = isSimple();

    ROUTES.filter(function (route) {
      return !route.hidden && (!simple || route.simple);
    }).forEach(function (route) {
      if (route.path === 'wortschatz') rail.appendChild(h('div.rail__title', { text: 'Bestand' }));
      if (route.path === 'verwaltung') rail.appendChild(h('div.rail__sep'));
      var count = route.view === 'vocab' ? counts.vocab
        : route.view === 'starters' ? counts.starters
        : route.view === 'banks' ? counts.banks
        : route.view === 'boards' ? counts.boards : null;

      var label = routeLabel(route);
      var item = h('button.rail__item', {
        type: 'button',
        'aria-current': current.path === route.path || PARENT[current.path] === route.path ? 'page' : null,
        title: label + (route.key ? '  (Alt + ' + route.key + ')' : ''),
        onclick: function () { go(route.path); }
      },
        h('span.rail__icon', {}, ui.icon(route.icon, 18)),
        h('span.rail__label', { text: label }),
        count !== null ? h('span.rail__count', { text: String(count) }) : null
      );
      rail.appendChild(item);
    });

    rail.appendChild(h('div.spacer'));
    rail.appendChild(h('button.rail__item', {
      type: 'button',
      title: 'Navigationsleiste schmal/breit',
      onclick: function () {
        var shell = document.getElementById('shell');
        var collapsed = shell.dataset.rail === 'collapsed';
        shell.dataset.rail = collapsed ? '' : 'collapsed';
        BAO.store.commit('Navigationsbreite', function (draft) {
          draft.settings.railCollapsed = !collapsed;
        }, { undoable: false });
      }
    },
      h('span.rail__icon', { text: '⇤' }),
      h('span.rail__label', { text: 'Schmaler' })
    ));
  }

  /* --- Ansicht --------------------------------------------------------------- */

  function renderView() {
    var host = document.getElementById('view');
    var state = BAO.store.getState();
    var route = current.route || ROUTES[0];
    var view = BAO.views[route.view];

    // Scrollposition je Ansicht merken – hilft beim Hin- und Herspringen.
    var main = document.querySelector('.main');
    if (main) viewScrollTop[current.lastPath || ''] = main.scrollTop;

    util.clear(host);
    if (!view) {
      host.appendChild(h('div.view', {}, ui.emptyState({
        title: 'Ansicht nicht gefunden',
        text: 'Diese Adresse gibt es nicht. Zurück zum Start.',
        actionLabel: 'Zum Start', onAction: function () { go('start'); }
      })));
      return;
    }

    var ctx = select.context(state);
    try {
      view.render(host, { state: state, ctx: ctx, params: current.params, app: BAO.app });
    } catch (err) {
      console.error('Fehler beim Zeichnen der Ansicht:', err);
      util.clear(host);
      host.appendChild(h('div.view', {}, ui.emptyState({
        title: 'Diese Ansicht konnte nicht dargestellt werden',
        text: String(err && err.message ? err.message : err),
        actionLabel: 'Zum Start', onAction: function () { go('start'); }
      })));
    }

    renderRail();
    renderContextSwitcher();
    current.lastPath = current.path;
    if (main) main.scrollTop = viewScrollTop[current.path] || 0;
  }

  function scheduleRender() {
    if (renderScheduled) return;
    renderScheduled = true;
    window.requestAnimationFrame(function () {
      renderScheduled = false;
      renderView();
    });
  }

  /* --- Schnellsuche ---------------------------------------------------------- */

  var paletteNode = null;

  function closeSearch() {
    if (!paletteNode) return;
    if (paletteNode.parentNode) paletteNode.parentNode.removeChild(paletteNode);
    paletteNode = null;
  }

  function openSearch(initialQuery) {
    if (paletteNode) { util.$('input', paletteNode).focus(); return; }
    var input = h('input.palette__input', {
      type: 'search', placeholder: 'Wort, Satzanfang, Wortbank oder Lerngruppe suchen …',
      'aria-label': 'Schnellsuche', value: initialQuery || ''
    });
    var list = h('div.palette__list');
    var backdrop = h('div.palette-backdrop', {},
      h('div.palette', {}, input, list,
        h('div.palette__hint', {},
          h('span', {}, h('kbd', { text: '↑ ↓' }), ' Auswahl'),
          h('span', {}, h('kbd', { text: 'Enter' }), ' Öffnen'),
          h('span', {}, h('kbd', { text: 'Esc' }), ' Schließen')
        )
      )
    );

    var results = [];
    var activeIndex = 0;

    var TYPE_LABEL = { group: 'Lerngruppe', bank: 'Wortbank', board: 'Tafel',
      unit: 'Unterrichtsreihe', lexeme: 'Wortschatz', starter: 'Satzanfang' };

    function draw(query) {
      util.clear(list);
      list.appendChild(h('div.palette__group', {
        text: query ? results.length + ' ' + util.plural(results.length, 'Treffer', 'Treffer') : 'Zuletzt verwendet'
      }));
      if (!results.length) {
        util.clear(list);
        list.appendChild(h('div.palette__group', { text: query ? 'Kein Treffer' : 'Noch nichts geöffnet' }));
        return;
      }
      results.forEach(function (result, index) {
        list.appendChild(h('button.palette__item', {
          type: 'button',
          dataset: { active: index === activeIndex ? 'true' : 'false' },
          onclick: function () { activate(result); }
        },
          h('span.chip.chip--outline', { text: TYPE_LABEL[result.type] || result.type }),
          h('span.palette__main', {},
            h('span.palette__title', { text: result.title }),
            h('span.palette__meta', { text: result.meta || '' })
          )
        ));
      });
    }

    function refresh() {
      var query = input.value.trim();
      var currentState = BAO.store.getState();
      results = query
        ? BAO.search.global(currentState, query, { limit: 30 })
        : select.recentBanks(currentState, 6).map(function (bank) {
          return {
            type: 'bank', id: bank.id, title: bank.title,
            groupId: bank.groupId, subjectId: bank.subjectId,
            meta: 'Wortbank · ' + bank.scene
          };
        });
      activeIndex = 0;
      draw(query);
    }

    function activate(result) {
      closeSearch();
      if (!result) return;
      if (result.subjectId) setContext(result.subjectId, result.groupId || undefined);
      if (result.type === 'bank') { go('wortbank/' + result.id); return; }
      if (result.type === 'board') { go('tafel/' + result.id); return; }
      if (result.type === 'group') { go('wortschatz'); return; }
      if (result.type === 'unit') { go('verwaltung'); return; }
      if (result.type === 'lexeme') { go('wortschatz/' + result.id); return; }
      if (result.type === 'starter') { go('satzanfaenge/' + result.id); return; }
    }

    input.addEventListener('input', refresh);
    input.addEventListener('keydown', function (event) {
      if (event.key === 'ArrowDown') { event.preventDefault(); activeIndex = Math.min(activeIndex + 1, results.length - 1); draw(input.value.trim()); }
      else if (event.key === 'ArrowUp') { event.preventDefault(); activeIndex = Math.max(activeIndex - 1, 0); draw(input.value.trim()); }
      else if (event.key === 'Enter') { event.preventDefault(); activate(results[activeIndex]); }
      else if (event.key === 'Escape') { event.preventDefault(); closeSearch(); }
    });
    backdrop.addEventListener('mousedown', function (event) { if (event.target === backdrop) closeSearch(); });

    paletteNode = backdrop;
    document.getElementById('overlay-root').appendChild(backdrop);
    refresh();
    input.focus();
  }

  /* --- Live-Hilfe ------------------------------------------------------------ */

  function openLiveHelp() {
    var state = BAO.store.getState();
    var ctx = select.context(state);
    var session = BAO.session.getState();

    var typeSelect = ui.selectField({
      label: 'Art', value: 'word',
      options: [{ value: 'word', label: 'Ausdruck / Wort' }, { value: 'starter', label: 'Satzanfang' }]
    });
    var textField = ui.textField({ label: 'Text', placeholder: 'z. B. Je me suis bien débrouillé(e).', full: true });
    var translationField = ui.textField({ label: 'Deutsch (optional)', placeholder: 'z. B. Ich bin gut zurechtgekommen.' });

    return BAO.modal.open({
      title: 'Live-Hilfe einblenden',
      subtitle: 'Sofort projizieren – später entscheiden, ob der Eintrag dauerhaft gespeichert wird.',
      width: '520px',
      body: h('div.stack', {},
        textField, h('div.grid2', {}, typeSelect, translationField),
        h('div.note', { text: 'Die Automatik pausiert automatisch, sobald eine Live-Hilfe erscheint.' })
      ),
      initialFocus: 'input',
      actions: [
        { label: 'Abbrechen', value: null, kind: 'ghost' },
        {
          label: 'Einblenden', kind: 'primary',
          onSelect: function () {
            var text = textField.input.value.trim();
            if (!text) { textField.input.focus(); return false; }
            if (!session.active) {
              BAO.session.start('', {});
              ensureOutput();
            }
            BAO.session.addLive({
              type: util.$('select', typeSelect).value,
              text: text,
              translation: translationField.input.value.trim()
            });
            if (current.path !== 'projektion') go('projektion');
            BAO.toast.show('Live-Hilfe wird projiziert.', {
              actionLabel: 'Dauerhaft speichern',
              onAction: function () { go('projektion'); }
            });
            return true;
          }
        }
      ]
    });
  }

  /** Stellt sicher, dass mindestens eine Ausgabefläche sichtbar ist. */
  function ensureOutput() {
    if (BAO.output.isWindowOpen() || BAO.output.isOverlayOpen()) return true;
    var result = BAO.output.openWindow();
    if (result.ok) return true;
    BAO.output.openOverlay();
    return true;
  }

  /** Der kürzeste Weg vom Bestand zur Projektion. */
  function projectBank(bankId, options) {
    options = options || {};
    BAO.session.start(bankId, options);
    if (options.openOutput !== false) ensureOutput();
    go('projektion');
  }

  /** Dasselbe für eine Tafel. */
  function projectBoard(boardId, options) {
    options = options || {};
    var board = select.board(BAO.store.getState(), boardId);
    if (!board) return;
    // Eine Tafel bringt ihre Lerngruppe mit.
    setContext(board.subjectId, board.groupId);
    if (!BAO.board.start(boardId)) return;
    if (options.openOutput !== false) ensureOutput();
    go('tafel/' + boardId);
  }

  /* --- Tastenkürzel ----------------------------------------------------------- */

  function isTyping(event) {
    var target = event.target;
    if (!target) return false;
    var tag = (target.tagName || '').toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable;
  }

  function bindShortcuts() {
    document.addEventListener('keydown', function (event) {
      var mod = event.ctrlKey || event.metaKey;

      if (mod && event.key.toLowerCase() === 'k') { event.preventDefault(); openSearch(); return; }
      if (mod && event.key.toLowerCase() === 'l') { event.preventDefault(); openLiveHelp(); return; }
      if (mod && event.key.toLowerCase() === 'z' && !event.shiftKey) {
        event.preventDefault();
        var label = BAO.store.undo();
        BAO.toast.show(label ? 'Rückgängig: ' + label : 'Nichts zum Rückgängigmachen.', { timeout: 2600 });
        return;
      }
      if (mod && ((event.key.toLowerCase() === 'z' && event.shiftKey) || event.key.toLowerCase() === 'y')) {
        event.preventDefault();
        var redone = BAO.store.redo();
        BAO.toast.show(redone ? 'Wiederhergestellt: ' + redone : 'Nichts zum Wiederherstellen.', { timeout: 2600 });
        return;
      }
      if (mod && event.key.toLowerCase() === 'b') {
        event.preventDefault();
        if (BAO.output.isWindowOpen()) BAO.output.closeWindow(); else ensureOutput();
        return;
      }
      if (event.altKey && !mod && /^[1-8]$/.test(event.key)) {
        var route = ROUTES.filter(function (r) { return r.key === event.key; })[0];
        if (route) { event.preventDefault(); go(route.path); }
        return;
      }
      if (event.key === 'Escape') {
        if (BAO.modal.consumeEscape()) { event.preventDefault(); return; }
        if (BAO.output.isOverlayOpen()) { BAO.output.closeOverlay(); return; }
      }
      if (isTyping(event)) return;
      if (event.key === '/' && !mod) { event.preventDefault(); openSearch(); }
    });
  }

  /* --- Kopfzeile und Fußzeile -------------------------------------------------- */

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme || 'auto';
  }

  function bindChrome() {
    util.on(document, 'click', '[data-action="open-search"]', function () { openSearch(); });
    util.on(document, 'click', '[data-action="open-live"]', function () { openLiveHelp(); });
    util.on(document, 'click', '[data-action="toggle-simple"]', function () {
      var next = !isSimple();
      BAO.store.commit('Ansichtsumfang', function (draft) { draft.settings.simpleMode = next; }, { undoable: false });
      // In der Grundform gibt es manche Ansicht nicht mehr in der Leiste –
      // dann führt der Weg zurück auf die Tafeln.
      var route = ROUTES.filter(function (r) { return r.path === current.path; })[0];
      if (next && route && !route.simple && route.path !== 'tafel') go('tafeln'); else renderView();
      BAO.toast.show(next
        ? 'Einfache Grundform: Tafeln, Elemente, Lerngruppen, Daten.'
        : 'Vollständige Ansicht mit Satzanfängen, Wortbanken und Projektion.', { timeout: 3200 });
    });
    util.on(document, 'click', '[data-action="toggle-theme"]', function () {
      var order = ['auto', 'light', 'dark'];
      var state = BAO.store.getState();
      var next = order[(order.indexOf(state.settings.theme) + 1) % order.length];
      BAO.store.commit('Helligkeit', function (draft) { draft.settings.theme = next; }, { undoable: false });
      applyTheme(next);
      BAO.toast.show('Darstellung: ' + ({ auto: 'automatisch', light: 'hell', dark: 'dunkel' })[next], { timeout: 1800 });
    });

    document.addEventListener('bao:storage', function (event) {
      var foot = document.querySelector('.appfoot');
      var label = document.querySelector('[data-bind="storage-state"]');
      if (!foot || !label) return;
      var detail = event.detail || {};
      foot.dataset.storage = detail.state === 'ok' ? 'ok' : 'error';
      label.textContent = detail.state === 'ok'
        ? 'Automatisch lokal gespeichert' + (detail.savedAt ? ' · ' + util.relativeDate(detail.savedAt) : '')
        : detail.message || 'Speicherung nicht möglich';
      label.title = detail.message || '';
    });
  }

  /* --- Start ------------------------------------------------------------------- */

  function start() {
    BAO.store.init();
    var state = BAO.store.getState();

    applyTheme(state.settings.theme);
    document.getElementById('shell').dataset.rail = state.settings.railCollapsed ? 'collapsed' : '';
    var versionLabel = document.querySelector('[data-bind="version"]');
    if (versionLabel) versionLabel.textContent = 'Version ' + BAO.schema.APP_VERSION;

    BAO.render.ensureStyle(document, false);

    window.addEventListener('hashchange', function () {
      current = parseHash();
      renderView();
    });
    current = parseHash();

    BAO.store.subscribe(function (nextState, meta) {
      var label = document.querySelector('[data-bind="context-label"]');
      var ctx = select.context(nextState);
      if (label) {
        label.textContent = ctx.group
          ? ctx.group.name + ' · ' + (ctx.subject ? ctx.subject.name : '') + ' · Jg. ' + ctx.group.grade
          : 'Wortschatz für den Unterricht';
      }
      if (meta.reason === 'commit' && QUIET_LABELS[meta.label]) return;
      scheduleRender();
    });

    bindChrome();
    bindShortcuts();
    renderView();

    // Optionaler Companion-Modus. Ist er nicht eingeschaltet, geschieht hier
    // nichts: keine Verbindung, keine Wartezeit, keine Meldung.
    if (BAO.companion) BAO.companion.start();

    var storage = BAO.store.storageInfo();
    document.dispatchEvent(new CustomEvent('bao:storage', { detail: storage }));
    if (!storage.available) {
      BAO.toast.error('Der Browser erlaubt keine dauerhafte lokale Speicherung. '
        + 'Bitte exportiere deine Daten vor dem Schließen im Bereich „Daten“.', { timeout: 0 });
    }
  }

  BAO.app = {
    ROUTES: ROUTES,
    start: start,
    go: go,
    renderView: renderView,
    scheduleRender: scheduleRender,
    currentRoute: currentRoute,
    setContext: setContext,
    openSearch: openSearch,
    openLiveHelp: openLiveHelp,
    ensureOutput: ensureOutput,
    projectBank: projectBank,
    projectBoard: projectBoard,
    isSimple: isSimple,
    applyTheme: applyTheme
  };
})(window.BAO = window.BAO || {});
