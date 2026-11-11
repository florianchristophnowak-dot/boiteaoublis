/* ==========================================================================
   Whiteboard – Fläche mit Werkzeugen
   Die Leisten schweben über der Fläche, damit sie auch im Vollbild da sind:
   links die Werkzeuge, daneben die Einstellungen des gewählten Werkzeugs,
   unten rechts der Zoom. Die Fläche selbst steuert BAO.whiteboard.
   ========================================================================== */
(function (BAO) {
  'use strict';

  var util = BAO.util;
  var h = util.h;
  var ui = BAO.ui;
  var schema = BAO.schema;
  var select = BAO.select;
  var wb = BAO.whiteboard;

  var TOOL_ICONS = {
    pen: 'pen', marker: 'marker', highlighter: 'highlighter', underline: 'underline',
    stamp: 'stamp', eraser: 'eraser', lasso: 'lasso', hand: 'hand'
  };

  /* Die laufende Fläche überlebt einen Neuaufbau der Ansicht: Wird dieselbe
     Fläche noch einmal gezeichnet, zieht ihr Element einfach mit um. */
  var active = null;      // { id, ctrl, refs }

  function teardown() {
    if (!active) return;
    active.ctrl.destroy();
    active = null;
  }

  /** Vom Anwendungsrahmen aufgerufen, wenn eine andere Ansicht folgt. */
  function unmount() { teardown(); }

  /* --- Kleine SVG-Helfer (util.h baut nur HTML) --------------------------------- */

  function svg(viewBox, children) {
    var node = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    node.setAttribute('viewBox', viewBox);
    node.setAttribute('aria-hidden', 'true');
    node.setAttribute('focusable', 'false');
    children.forEach(function (child) { node.appendChild(child); });
    return node;
  }

  function path(d, attrs) {
    var node = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    node.setAttribute('d', d);
    node.setAttribute('fill', 'none');
    node.setAttribute('stroke', 'currentColor');
    node.setAttribute('stroke-linecap', 'round');
    node.setAttribute('stroke-linejoin', 'round');
    Object.keys(attrs || {}).forEach(function (key) { node.setAttribute(key, attrs[key]); });
    return node;
  }

  function stampGlyph(variant) {
    var def = wb.STAMP_PATHS[variant];
    var parts = [path(def.main, { 'stroke-width': def.width })];
    if (def.accent) parts.push(path(def.accent, { 'stroke-width': def.width }));
    return svg('0 0 100 100', parts);
  }

  function underlineGlyph(style) {
    var attrs = { 'stroke-width': 2.2 };
    var d = 'M2 7H28';
    if (style === 'dashed') attrs['stroke-dasharray'] = '6 3.5';
    else if (style === 'dotted') attrs['stroke-dasharray'] = '0.5 3.6';
    else if (style === 'wavy') d = 'M2 7c2.2-3.5 4.3-3.5 6.5 0s4.3 3.5 6.5 0 4.3-3.5 6.5 0 4.3 3.5 6.5 0';
    return svg('0 0 30 14', [path(d, attrs)]);
  }

  /* --- Bausteine der Optionsleiste ----------------------------------------------- */

  function group(label, children) {
    var node = h('div.wb-options__group', {});
    if (label) node.appendChild(h('span.wb-options__label', { text: label }));
    children.forEach(function (child) { if (child) node.appendChild(child); });
    return node;
  }

  function sep() { return h('span.wb-options__sep'); }

  function swatches(keys, selected, onPick, soft) {
    return group(null, keys.map(function (key) {
      return h('button.wb-swatch' + (soft ? '.wb-swatch--soft' : ''), {
        type: 'button',
        title: wb.COLOR_LABELS[key] || key, 'aria-label': 'Farbe ' + (wb.COLOR_LABELS[key] || key),
        'aria-pressed': key === selected ? 'true' : 'false',
        style: { '--sw': 'var(--wb-c-' + key + ')' },
        onclick: function () { onPick(key); }
      });
    }));
  }

  function widths(toolId, tools, ctrl) {
    var list = wb.WIDTHS[toolId];
    var dots = [5, 8, 12];
    return group('Breite', list.map(function (w, index) {
      return h('button.wb-width', {
        type: 'button', title: wb.WIDTH_LABELS[index] + ' (' + w + ' px)',
        'aria-label': 'Breite ' + wb.WIDTH_LABELS[index],
        'aria-pressed': tools[toolId].width === index ? 'true' : 'false',
        onclick: function () { ctrl.setToolOption(toolId, 'width', index); }
      }, h('i', { style: { width: dots[index] + 'px', height: dots[index] + 'px' } }));
    }));
  }

  function segment(options, value, onPick) {
    var node = h('div.wb-seg', { role: 'group' });
    options.forEach(function (option) {
      node.appendChild(h('button', {
        type: 'button', text: option.label, title: option.title || option.label,
        'aria-pressed': option.value === value ? 'true' : 'false',
        onclick: function () { onPick(option.value); }
      }));
    });
    return node;
  }

  function toggleButton(label, pressed, title, onToggle) {
    return h('button.btn.btn--sm', {
      type: 'button', text: label, title: title,
      'aria-pressed': pressed ? 'true' : 'false',
      style: pressed ? { 'border-color': 'var(--brand)', 'background': 'var(--brand-soft)', 'color': 'var(--brand-ink)' } : null,
      onclick: onToggle
    });
  }

  function optionsFor(ctrl) {
    var tools = ctrl.getTools();
    var id = tools.tool;
    var parts = [];

    function pick(toolId, key) {
      return function (value) { ctrl.setToolOption(toolId, key, value); };
    }

    if (id === 'pen' || id === 'marker') {
      parts.push(swatches(wb.INK_COLORS, tools[id].color, pick(id, 'color')), sep(), widths(id, tools, ctrl));
      if (id === 'pen') {
        // Der Stift schreibt wie ein Füller – hier lässt sich einstellen, wie stark der Druck wirkt.
        var feel = segment(wb.PEN_PRESSURES.map(function (level) {
          return { value: level.id, label: level.label, title: level.hint };
        }), tools.pen.pressure, pick('pen', 'pressure'));
        feel.setAttribute('aria-label', 'Druck');
        var feelGroup = group('Druck', [feel]);
        feelGroup.title = 'Wie stark der Druck die Linie breiter macht. '
          + 'Ohne druckempfindlichen Stift (Maus, Finger) zählt das Schreibtempo: langsam breiter, schnell feiner.';
        parts.push(sep(), feelGroup);
      }
    } else if (id === 'highlighter') {
      parts.push(swatches(wb.HIGHLIGHT_COLORS, tools.highlighter.color, pick('highlighter', 'color'), true),
        sep(), widths('highlighter', tools, ctrl));
    } else if (id === 'underline') {
      var u = tools.underline;
      parts.push(
        swatches(wb.INK_COLORS, u.color, pick('underline', 'color')), sep(),
        group('Linie', wb.UNDERLINE_STYLES.map(function (style) {
          return h('button.wb-ustyle', {
            type: 'button', title: style.label, 'aria-label': style.label,
            'aria-pressed': u.style === style.id ? 'true' : 'false',
            onclick: function () { ctrl.setToolOption('underline', 'style', style.id); }
          }, underlineGlyph(style.id));
        })), sep(),
        widths('underline', tools, ctrl), sep(),
        group(null, [
          toggleButton('Doppelt', u.double, 'Zwei Linien übereinander', function () { ctrl.setToolOption('underline', 'double', !u.double); }),
          toggleButton('Häkchen rechts', u.hook, 'Kleiner Haken am rechten Ende – wie in Capy-note', function () { ctrl.setToolOption('underline', 'hook', !u.hook); })
        ]), sep(),
        h('span.wb-options__label', { text: 'waagerecht ziehen' })
      );
    } else if (id === 'stamp') {
      var st = tools.stamp;
      parts.push(
        group('Zeichen', wb.STAMPS.map(function (def) {
          var button = h('button.wb-stamp', {
            type: 'button', title: def.label, 'aria-label': def.label,
            'aria-pressed': st.stamp === def.id ? 'true' : 'false',
            style: { '--stamp': 'var(--wb-c-' + def.color + ')' },
            onclick: function () { ctrl.setToolOption('stamp', 'stamp', def.id); }
          });
          if (def.variant === 'text') button.appendChild(h('span', { text: def.text }));
          else button.appendChild(stampGlyph(def.variant));
          return button;
        })), sep(),
        swatches(wb.INK_COLORS, st.color, pick('stamp', 'color')), sep(),
        group('Größe', wb.STAMP_SIZES.map(function (size, index) {
          return h('button.wb-width', {
            type: 'button', title: wb.WIDTH_LABELS[index], 'aria-label': 'Größe ' + wb.WIDTH_LABELS[index],
            'aria-pressed': st.size === index ? 'true' : 'false',
            onclick: function () { ctrl.setToolOption('stamp', 'size', index); }
          }, h('i', { style: { width: (5 + index * 3) + 'px', height: (5 + index * 3) + 'px' } }));
        })), sep(),
        h('span.wb-options__label', { text: 'antippen setzt das Zeichen' })
      );
    } else if (id === 'eraser') {
      var er = tools.eraser;
      parts.push(
        segment([
          { value: 'stroke', label: 'Ganzer Strich', title: 'Berührte Striche verschwinden vollständig' },
          { value: 'partial', label: 'Fein', title: 'Nur die berührte Stelle wird entfernt' }
        ], er.mode, pick('eraser', 'mode')), sep(),
        group('Größe', wb.ERASER_SIZES.map(function (size, index) {
          return h('button.wb-width', {
            type: 'button', title: wb.WIDTH_LABELS[index], 'aria-label': 'Radierer ' + wb.WIDTH_LABELS[index],
            'aria-pressed': er.size === index ? 'true' : 'false',
            onclick: function () { ctrl.setToolOption('eraser', 'size', index); }
          }, h('i', { style: { width: (5 + index * 4) + 'px', height: (5 + index * 4) + 'px' } }));
        })), sep(),
        h('span.wb-options__label', { text: 'Stift umdrehen radiert ebenfalls' })
      );
    } else if (id === 'lasso') {
      var count = ctrl.getSelection().length;
      if (count) {
        parts.push(
          h('strong', { text: count + ' ' + util.plural(count, 'Strich', 'Striche') + ' ausgewählt' }), sep(),
          h('span.wb-options__label', { text: 'Umfärben' }),
          swatches(wb.INK_COLORS, '', function (key) { ctrl.recolorSelection(key); }), sep(),
          h('button.btn.btn--sm', {
            type: 'button', title: 'Ausgewählte Striche löschen (Entf)',
            onclick: function () { ctrl.deleteSelection(); }
          }, ui.icon('trash', 14), 'Löschen'),
          h('button.btn.btn--sm.btn--ghost', {
            type: 'button', text: 'Auswahl aufheben', title: 'Esc',
            onclick: function () { ctrl.clearSelection(); }
          }),
          sep(), h('span.wb-options__label', { text: 'Auswahl ziehen verschiebt sie' })
        );
      } else {
        parts.push(h('span.wb-options__label', { text: 'Einkreisen, was verschoben, umgefärbt oder gelöscht werden soll.' }));
      }
    } else if (id === 'hand') {
      parts.push(h('span.wb-options__label', { text: 'Ziehen verschiebt die Fläche · Mausrad rollt · Strg + Mausrad zoomt' }));
    }
    return parts;
  }

  /* --- Leisten --------------------------------------------------------------------- */

  function buildChrome(ctrl, refs) {
    var rail = h('div.wb-tools', { role: 'toolbar', 'aria-label': 'Werkzeuge' });
    var options = h('div.wb-options', { role: 'toolbar', 'aria-label': 'Einstellungen des Werkzeugs' });
    var zoom = h('div.wb-zoom', { role: 'toolbar', 'aria-label': 'Ansicht' });
    var hint = h('div.wb-hint');

    function renderRail() {
      util.clear(rail);
      var tools = ctrl.getTools();
      wb.TOOLS.forEach(function (tool) {
        if (tool.id === 'eraser') rail.appendChild(h('div.wb-tools__sep'));
        rail.appendChild(h('button.wb-tool', {
          type: 'button',
          dataset: { tool: tool.id },
          title: tool.label + ' (' + tool.key.toUpperCase() + ') – ' + tool.hint,
          'aria-label': tool.label,
          'aria-pressed': tools.tool === tool.id ? 'true' : 'false',
          onclick: function () { ctrl.setTool(tool.id); }
        }, ui.icon(TOOL_ICONS[tool.id] || 'pen', 20)));
      });
      rail.appendChild(h('div.wb-tools__sep'));
      rail.appendChild(h('button.wb-tool', {
        type: 'button', title: 'Rückgängig (Strg + Z)', 'aria-label': 'Rückgängig',
        dataset: { action: 'undo' },
        onclick: function () {
          var label = BAO.store.undo();
          BAO.toast.show(label ? 'Rückgängig: ' + label : 'Nichts zum Rückgängigmachen.', { timeout: 2200 });
        }
      }, ui.icon('undo', 20)));
      rail.appendChild(h('button.wb-tool', {
        type: 'button', title: 'Wiederherstellen (Strg + Y)', 'aria-label': 'Wiederherstellen',
        dataset: { action: 'redo' },
        onclick: function () {
          var label = BAO.store.redo();
          BAO.toast.show(label ? 'Wiederhergestellt: ' + label : 'Nichts zum Wiederherstellen.', { timeout: 2200 });
        }
      }, ui.icon('redo', 20)));
    }

    function renderOptions() {
      util.clear(options);
      optionsFor(ctrl).forEach(function (part) { options.appendChild(part); });
    }

    function renderZoom() {
      util.clear(zoom);
      var level = Math.round(ctrl.getView().zoom * 100);
      zoom.appendChild(h('button', {
        type: 'button', title: 'Verkleinern (−)', 'aria-label': 'Verkleinern',
        onclick: function () { ctrl.zoomOut(); }
      }, '−'));
      zoom.appendChild(h('button.wb-zoom__level', {
        type: 'button', text: level + ' %', title: 'Auf 100 % zurücksetzen (0)',
        onclick: function () { ctrl.zoomTo(1); }
      }));
      zoom.appendChild(h('button', {
        type: 'button', title: 'Vergrößern (+)', 'aria-label': 'Vergrößern',
        onclick: function () { ctrl.zoomIn(); }
      }, '+'));
      zoom.appendChild(h('button.wb-zoom__fit', {
        type: 'button', title: 'Alles Geschriebene ins Bild holen',
        onclick: function () { ctrl.fitContent(); }
      }, ui.icon('fit', 16), 'Einpassen'));
      zoom.appendChild(h('button.wb-zoom__reset', {
        type: 'button', title: 'Zurück zum Ausgangspunkt',
        onclick: function () { ctrl.resetView(); }
      }, 'Anfang'));
      zoom.appendChild(h('button', {
        type: 'button',
        title: ctrl.isFullscreen() ? 'Vollbild beenden (F)' : 'Vollbild (F)',
        'aria-label': ctrl.isFullscreen() ? 'Vollbild beenden' : 'Vollbild',
        onclick: function () { ctrl.toggleFullscreen(); }
      }, ui.icon('focus', 16)));
    }

    function renderHint() {
      util.clear(hint);
      var tools = ctrl.getTools();
      var checkbox = h('input', {
        type: 'checkbox', checked: tools.touchDraws ? true : null,
        onchange: function (event) { ctrl.setTouchDraws(event.target.checked); }
      });
      hint.appendChild(h('span', { text: 'Stift schreibt · ein Finger verschiebt · zwei Finger zoomen' }));
      hint.appendChild(h('label', { title: 'Für Geräte ohne Stift: Der Finger zeichnet, zwei Finger verschieben und zoomen weiterhin.' },
        checkbox, 'Finger zeichnet'));
    }

    renderRail();
    renderOptions();
    renderZoom();
    renderHint();

    ctrl.subscribe(function (reason) {
      if (reason === 'tool') { renderRail(); renderOptions(); renderHint(); }
      else if (reason === 'selection') renderOptions();
      else if (reason === 'view' || reason === 'fullscreen') renderZoom();
      else if (reason === 'strokes') {
        if (refs.count && refs.count.isConnected) refs.count.textContent = countLabel(ctrl.strokeCount());
        if (ctrl.getTools().tool === 'lasso') renderOptions();
      }
    });

    return [rail, options, zoom, hint];
  }

  function countLabel(n) { return n + ' ' + util.plural(n, 'Strich', 'Striche'); }

  /* --- Ansicht ------------------------------------------------------------------------ */

  function render(host, context) {
    var state = context.state;
    var ctx = context.ctx;
    var app = context.app;
    var boardId = context.params[0];
    var board = boardId ? select.whiteboard(state, boardId) : null;
    var view = h('div.view.view--whiteboard');

    if (!board) {
      teardown();
      view.classList.remove('view--whiteboard');
      view.appendChild(ui.emptyState({
        title: 'Whiteboard nicht gefunden',
        text: 'Dieses Whiteboard gibt es nicht mehr.',
        actionLabel: 'Zur Übersicht', onAction: function () { app.go('whiteboards'); }
      }));
      host.appendChild(view);
      return;
    }

    // Das Whiteboard bestimmt den Arbeitskontext, nicht umgekehrt – wie die Tafel.
    var arriving = !active || active.id !== board.id;
    if (!ctx.group || ctx.group.id !== board.groupId) {
      if (!arriving) {
        // Oben wurde die Lerngruppe gewechselt: Dieses Whiteboard gehört nicht dazu.
        teardown();
        app.go('whiteboards');
        return;
      }
      app.setContext(board.subjectId, board.groupId);
      state = BAO.store.getState();
      board = select.whiteboard(state, boardId);
    }

    if (arriving) {
      teardown();
      BAO.store.commit('Whiteboard geöffnet', function (draft) {
        var target = select.whiteboard(draft, board.id);
        if (target) target.lastUsedAt = util.nowISO();
      }, { undoable: false });
    }

    var subject = select.subject(state, board.subjectId);
    var groupObj = select.group(state, board.groupId);
    var refs = active ? active.refs : {};
    refs.count = h('span', { text: countLabel((board.strokes || []).length) });

    var backgroundSelect = ui.selectField({
      ariaLabel: 'Hintergrund', value: board.background,
      options: schema.WHITEBOARD_BACKGROUNDS.map(function (b) { return { value: b.id, label: b.label }; }),
      onChange: function (value) { wb.setBackground(board.id, value); }
    });
    backgroundSelect.title = 'Hintergrund der Fläche';

    view.appendChild(h('div.view__head', {},
      h('div.view__title', {},
        h('h1', { text: board.title }),
        h('span.sub', {},
          [subject ? subject.name : '', groupObj ? groupObj.name + ' · Jg. ' + groupObj.grade : '']
            .filter(Boolean).join(' · ') + ' · ',
          refs.count
        )
      ),
      h('div.spacer'),
      h('div.view__actions', {},
        h('button.btn', { type: 'button', onclick: function () { app.go('whiteboards'); } }, 'Alle Whiteboards'),
        backgroundSelect,
        h('button.btn.btn--sm.btn--icon', {
          type: 'button', title: 'Titel ändern',
          onclick: function () {
            BAO.modal.prompt({
              title: 'Titel des Whiteboards', label: 'Titel', value: board.title
            }).then(function (value) {
              if (value === null) return;
              var title = String(value).trim();
              if (!title) return;
              BAO.store.commit('Whiteboard umbenannt', function (draft) {
                var target = select.whiteboard(draft, board.id);
                if (target) { target.title = title; target.updatedAt = util.nowISO(); }
              });
            });
          }
        }, ui.icon('edit', 15)),
        h('button.btn.btn--sm', {
          type: 'button', title: 'Vollbild auf diesem Bildschirm (Taste F)',
          onclick: function () { if (active) active.ctrl.toggleFullscreen(); }
        }, ui.icon('focus', 15), 'Vollbild'),
        h('button.btn.btn--sm', {
          type: 'button', title: 'Alle Striche entfernen',
          onclick: function () {
            BAO.modal.confirm({
              title: 'Whiteboard leeren?',
              text: 'Alle Striche auf „' + board.title + '“ werden entfernt.',
              detail: 'Rückgängig ist mit Strg + Z möglich.',
              confirmLabel: 'Leeren', danger: true
            }).then(function (confirmed) {
              if (!confirmed) return;
              if (wb.clearStrokes(board.id)) BAO.toast.undoable('Whiteboard geleert.');
            });
          }
        }, ui.icon('trash', 15), 'Leeren')
      )
    ));

    var stage;
    if (active && active.id === board.id) {
      // Dieselbe Fläche – ihr Element zieht in die neue Ansicht um.
      stage = active.ctrl.element;
      active.refs = refs;
      view.appendChild(stage);
      host.appendChild(view);
      active.ctrl.repaint();
      return;
    }

    stage = h('div.wb', { 'aria-label': 'Zeichenfläche: ' + board.title });
    view.appendChild(stage);
    host.appendChild(view);

    var ctrl = wb.mount(stage, { whiteboardId: board.id });
    active = { id: board.id, ctrl: ctrl, refs: refs };
    buildChrome(ctrl, refs).forEach(function (node) { stage.appendChild(node); });
  }

  BAO.views = BAO.views || {};
  BAO.views.whiteboard = {
    render: render,
    unmount: unmount,
    /** Für Prüfungen: die laufende Steuerung der Fläche. */
    controller: function () { return active ? active.ctrl : null; }
  };
})(window.BAO = window.BAO || {});
