/* ==========================================================================
   Darstellung der Bühne
   Baut die Projektionsansicht in ein beliebiges Dokument – in die eingebettete
   Vorschau, in die Vollbild-Überlagerung oder in das separate Beamerfenster.
   Die Aufteilung auf mehrere Seiten entsteht durch echtes Messen: Inhalte
   werden nie unbegrenzt verkleinert, sondern portioniert.
   ========================================================================== */
(function (BAO) {
  'use strict';

  var util = BAO.util;
  var ui = BAO.ui;
  var deckLib = BAO.deck;

  /** Sorgt dafür, dass ein Dokument die Bühnengestaltung kennt. */
  function ensureStyle(doc, includeDocumentStyle) {
    if (doc.getElementById('bao-stage-style')) return;
    var style = doc.createElement('style');
    style.id = 'bao-stage-style';
    style.textContent = (includeDocumentStyle ? BAO.stageDocumentStyle : '') + BAO.stageStyle;
    (doc.head || doc.documentElement).appendChild(style);
  }

  /** Erzeugt das Grundgerüst einer Bühne in einem Zieldokument. */
  function createStage(doc) {
    var h = function (tag, props) {
      var args = Array.prototype.slice.call(arguments, 2);
      props = Object.assign({ ownerDocument: doc }, props || {});
      return util.h.apply(null, [tag, props].concat(args));
    };

    var crumb = h('div.stage__crumb');
    var title = h('h1.stage__title');
    var pos = h('div.stage__pos');
    var body = h('div.stage__body');
    var dots = h('div.stage__dots');
    var badges = h('div.stage__badges', { style: { display: 'flex', gap: '.6em' } });
    var timerFill = h('i');
    var timer = h('div.stage__timer', {}, timerFill);
    var foot = h('footer.stage__foot', {}, dots, badges, timer);
    var head = h('header.stage__head', {}, crumb, title, pos);
    var root = h('div.bao-stage', { dataset: { stageTheme: 'light' } }, head, body, foot);

    return {
      doc: doc, root: root, head: head, crumb: crumb, title: title, pos: pos,
      body: body, foot: foot, dots: dots, badges: badges, timer: timer, timerFill: timerFill,
      hint: null
    };
  }

  /* --- Einzelne Einträge ---------------------------------------------------- */

  function buildLexemeNode(doc, lex, deck, layout, live) {
    var node = doc.createElement('article');
    node.className = 'pitem pitem--lex' + (live ? ' pitem--live' : '');

    var term = doc.createElement('div');
    term.className = 'pitem__term';
    var article = deck.fields.article ? ui.displayArticle(lex) : '';
    if (article) {
      var art = doc.createElement('span');
      art.className = 'art';
      // Elidierter Artikel („l’“) steht ohne Leerzeichen am Wort.
      art.textContent = article.charAt(article.length - 1) === '\u2019' ? article : article + ' ';
      term.appendChild(art);
    }
    term.appendChild(doc.createTextNode(lex.term || ''));
    if (deck.fields.gram && lex.gram) {
      var gram = doc.createElement('span');
      gram.className = 'gram';
      gram.textContent = lex.gram;
      term.appendChild(gram);
    }
    node.appendChild(term);

    deckLib.lexemeLines(lex, deck.fields, layout).forEach(function (line) {
      var p = doc.createElement('p');
      p.className = 'pitem__line ' + line.cls;
      p.textContent = line.text;
      node.appendChild(p);
    });

    var meta = deckLib.lexemeMeta(lex, deck.fields);
    if (meta && layout !== 'impulse') {
      var metaNode = doc.createElement('p');
      metaNode.className = 'pitem__meta';
      metaNode.textContent = meta;
      node.appendChild(metaNode);
    }
    return node;
  }

  function buildStarterNode(doc, starter, deck, live) {
    var node = doc.createElement('article');
    node.className = 'pitem pitem--starter' + (live ? ' pitem--live' : '');
    node.dataset.variant = starter.variant || 'standard';

    var text = doc.createElement('p');
    text.className = 'pitem__starter';
    text.appendChild(ui.gapText(starter.text, doc));
    node.appendChild(text);

    deckLib.starterLines(starter, deck.fields).forEach(function (line) {
      var p = doc.createElement('p');
      p.className = 'pitem__line ' + line.cls;
      p.textContent = line.text;
      node.appendChild(p);
    });
    return node;
  }

  function buildLiveNode(doc, entry, deck) {
    if (entry.type === 'starter') {
      return buildStarterNode(doc, { text: entry.text, translation: entry.translation, variant: 'standard' }, deck, true);
    }
    return buildLexemeNode(doc, {
      term: entry.text, article: '', gram: '', collocation: '', chunk: '',
      explanation: '', translation: entry.translation || '', example: '', pronunciation: ''
    }, deck, 'cards', true);
  }

  function buildGroupNode(doc, item) {
    var node = doc.createElement('div');
    node.className = 'pgroup';
    node.textContent = item.label;
    return node;
  }

  function buildItemNode(doc, item, deck, layout) {
    if (item.kind === 'group') return buildGroupNode(doc, item);
    if (item.kind === 'starter') return buildStarterNode(doc, item.ref, deck, false);
    if (item.kind === 'live') return buildLiveNode(doc, item.ref, deck);
    return buildLexemeNode(doc, item.ref, deck, layout, false);
  }

  /* --- Spaltenzahl ---------------------------------------------------------- */

  function probeFontSize(stage) {
    var doc = stage.doc;
    var probe = doc.createElement('div');
    probe.className = 'pitem__term';
    probe.style.position = 'absolute';
    probe.style.visibility = 'hidden';
    probe.textContent = 'M';
    stage.body.appendChild(probe);
    var size = parseFloat(doc.defaultView.getComputedStyle(probe).fontSize) || 32;
    stage.body.removeChild(probe);
    return size;
  }

  function averageLength(items) {
    var entries = items.filter(function (item) { return item.kind !== 'group'; });
    if (!entries.length) return 0;
    var total = entries.reduce(function (sum, item) {
      var ref = item.ref || {};
      return sum + String(ref.text || ref.term || '').length;
    }, 0);
    return total / entries.length;
  }

  function computeColumns(stage, layout, items) {
    var width = stage.body.clientWidth || 960;
    var fontSize = probeFontSize(stage);
    if (layout === 'starters') {
      var avg = averageLength(items);
      var wide = width >= 1000 && avg > 0 && avg < 42 && items.length > 4;
      return wide ? 2 : 1;
    }
    if (layout === 'impulse') {
      return util.clamp(Math.floor(width / (fontSize * 1.3 * 5.2)), 1, 4);
    }
    return util.clamp(Math.floor(width / (fontSize * 8.2)), 1, 3);
  }

  /* --- Messbasierte Seitenaufteilung ---------------------------------------- */

  /**
   * Läuft der Inhalt über die Seite hinaus?
   * Das Raster wächst nach unten, der Spaltenfluss nach rechts – geprüft wird
   * deshalb beides.
   */
  function overflows(stage) {
    var body = stage.body;
    return body.scrollHeight > body.clientHeight + 1 || body.scrollWidth > body.clientWidth + 1;
  }

  /** Kopie einer Zwischenüberschrift für die Fortsetzung auf der nächsten Seite. */
  function continuation(group, index) {
    return { kind: 'group', key: group.key + '__c' + index, label: group.label };
  }

  /**
   * Verteilt einen Abschnitt gleichmäßig auf eine vorgegebene Seitenzahl.
   * Zwischenüberschriften bleiben nie allein am Seitenende stehen und werden
   * auf der Folgeseite wiederholt.
   */
  function balance(items, pageCount) {
    var total = deckLib.countEntries(items);
    if (pageCount <= 1 || !total) return [items.slice()];
    var target = Math.ceil(total / pageCount);
    var pages = [];
    var current = [];
    var currentGroup = null;
    var used = 0;
    var placed = 0;

    items.forEach(function (item) {
      if (item.kind === 'group') { currentGroup = item; current.push(item); return; }
      current.push(item);
      used += 1;
      placed += 1;
      var remaining = total - placed;
      if (used >= target && remaining > 0 && pages.length < pageCount - 1) {
        pages.push(current);
        current = currentGroup ? [continuation(currentGroup, pages.length)] : [];
        used = 0;
      }
    });
    if (deckLib.countEntries(current)) pages.push(current);
    return pages.length === pageCount ? pages : null;
  }

  /** Prüft, ob jede Seite tatsächlich vollständig sichtbar ist. */
  function fits(stage, deck, section, pages, maxItems) {
    var doc = stage.doc;
    return pages.every(function (items) {
      if (deckLib.countEntries(items) > maxItems) return false;
      util.clear(stage.body);
      items.forEach(function (item) { stage.body.appendChild(buildItemNode(doc, item, deck, section.layout)); });
      return !overflows(stage);
    });
  }

  /**
   * Verteilt jeden Abschnitt so auf Seiten, dass nichts abgeschnitten wird.
   * Vorgehen: gierig füllen (garantiert passend), danach gleichmäßig
   * ausbalancieren und das Ergebnis erneut messen.
   */
  function relayout(stage, deck) {
    if (!deck || !deck.sections.length) { deck.slides = []; return deck; }
    if (!stage.body.clientHeight) return deck;          // noch nicht im Layout

    var doc = stage.doc;
    var previousLayout = stage.body.dataset.layout;
    var slides = [];
    stage.body.dataset.measuring = 'true';

    deck.sections.forEach(function (section, sectionIndex) {
      var cols = computeColumns(stage, section.layout, section.items);
      stage.body.dataset.layout = section.layout;
      stage.body.style.setProperty('--cols', cols);

      var maxItems = Math.max(1, deck.maxItemsPerSlide);
      var pages = [];
      var current = [];
      var currentGroup = null;

      function drawPage(items) {
        util.clear(stage.body);
        items.forEach(function (item) {
          stage.body.appendChild(buildItemNode(doc, item, deck, section.layout));
        });
      }

      /** Seite abschließen; überzählige Überschriften wandern mit. */
      function closePage(carry) {
        var page = current.slice();
        var moved = [];
        while (page.length && page[page.length - 1].kind === 'group') moved.unshift(page.pop());
        if (deckLib.countEntries(page)) pages.push(page);
        var next = moved.concat(carry || []);
        if (currentGroup && (!next.length || next[0].kind !== 'group')) {
          next = [continuation(currentGroup, pages.length)].concat(next);
        }
        return next;
      }

      util.clear(stage.body);
      section.items.forEach(function (item) {
        if (item.kind === 'group') currentGroup = item;
        stage.body.appendChild(buildItemNode(doc, item, deck, section.layout));
        current.push(item);

        var entries = deckLib.countEntries(current);
        if (overflows(stage) && entries > 1) {
          current.pop();
          current = closePage([item]);
          drawPage(current);
        } else if (entries >= maxItems) {
          current = closePage([]);
          drawPage(current);
        }
      });
      if (deckLib.countEntries(current)) pages.push(current);
      if (!pages.length) pages = [[]];

      // Ausbalancieren: gleich große Seiten lesen sich ruhiger.
      var balanced = balance(section.items, pages.length);
      if (balanced && fits(stage, deck, section, balanced, maxItems)) pages = balanced;

      pages.forEach(function (items, pageIndex) {
        if (!deckLib.countEntries(items)) return;
        slides.push({
          sectionId: section.id,
          sectionTitle: section.title,
          sectionIndex: sectionIndex,
          layout: section.layout,
          live: !!section.live,
          columns: cols,
          pageInSection: pageIndex + 1,
          pagesInSection: pages.length,
          items: items
        });
      });
    });

    util.clear(stage.body);
    delete stage.body.dataset.measuring;
    if (previousLayout) stage.body.dataset.layout = previousLayout;

    // Seitenzahlen je Abschnitt nachtragen (übersprungene Seiten zählen nicht).
    var perSection = {};
    slides.forEach(function (slide) { perSection[slide.sectionId] = (perSection[slide.sectionId] || 0) + 1; });
    var counter = {};
    slides.forEach(function (slide) {
      counter[slide.sectionId] = (counter[slide.sectionId] || 0) + 1;
      slide.pageInSection = counter[slide.sectionId];
      slide.pagesInSection = perSection[slide.sectionId];
    });

    deck.slides = slides;
    return deck;
  }

  /* --- Vollständige Darstellung --------------------------------------------- */

  function renderStage(stage, deck, view) {
    var doc = stage.doc;
    var root = stage.root;
    view = view || {};

    root.dataset.stageTheme = view.theme || 'light';
    root.dataset.focus = view.focus ? 'true' : 'false';
    root.dataset.blank = view.blank ? 'true' : 'false';
    root.setAttribute('data-blank-hint', 'Bildschirm geleert – Taste B blendet die Wortbank wieder ein');
    root.style.setProperty('--user-scale', view.scale || 1);

    if (!deck || !deck.slides.length) {
      util.clear(stage.crumb);
      stage.crumb.textContent = deck ? [deck.subjectName, deck.groupName].filter(Boolean).join(' · ') : '';
      stage.title.textContent = deck ? deck.title : 'Boîte à Oublis';
      stage.pos.textContent = '';
      util.clear(stage.body);
      delete stage.body.dataset.layout;
      var empty = doc.createElement('div');
      empty.className = 'stage__empty';
      empty.textContent = view.emptyText || 'Diese Wortbank enthält noch keine Einträge.';
      stage.body.appendChild(empty);
      stage.foot.dataset.hidden = 'true';
      return;
    }

    var index = util.clamp(view.index || 0, 0, deck.slides.length - 1);
    var slide = deck.slides[index];

    util.clear(stage.crumb);
    var crumbParts = [deck.subjectName, deck.groupName, deck.scene].filter(Boolean);
    if (crumbParts.length) {
      var strong = doc.createElement('b');
      strong.textContent = crumbParts[0];
      stage.crumb.appendChild(strong);
      if (crumbParts.length > 1) stage.crumb.appendChild(doc.createTextNode(' · ' + crumbParts.slice(1).join(' · ')));
    }

    stage.title.textContent = slide.sectionTitle
      + (slide.pagesInSection > 1 ? ' (' + slide.pageInSection + '/' + slide.pagesInSection + ')' : '');

    util.clear(stage.pos);
    var current = doc.createElement('b');
    current.textContent = String(index + 1);
    stage.pos.appendChild(current);
    stage.pos.appendChild(doc.createTextNode(' / ' + deck.slides.length));

    // Inhalt
    util.clear(stage.body);
    stage.body.dataset.layout = slide.layout;
    stage.body.style.setProperty('--cols', slide.columns || computeColumns(stage, slide.layout, slide.items));
    slide.items.forEach(function (item) {
      stage.body.appendChild(buildItemNode(doc, item, deck, slide.layout));
    });

    // Fußzeile
    var showProgress = view.showProgress !== false;
    stage.foot.dataset.hidden = showProgress ? 'false' : 'true';
    util.clear(stage.dots);
    if (deck.slides.length <= 24) {
      deck.slides.forEach(function (item, i) {
        var dot = doc.createElement('span');
        dot.className = 'stage__dot';
        dot.dataset.state = i === index ? 'current' : (i < index ? 'done' : 'todo');
        stage.dots.appendChild(dot);
      });
    }

    util.clear(stage.badges);
    if (view.copyMode) stage.badges.appendChild(badge(doc, 'copy', 'Abschreiben'));
    if (slide.live) stage.badges.appendChild(badge(doc, 'live', 'Live'));

    var showTimer = !!view.autoPlaying && !view.copyMode;
    stage.timer.style.display = showTimer ? '' : 'none';
    if (showTimer) {
      var ratio = view.autoSeconds ? (1 - (view.autoRemaining / view.autoSeconds)) : 0;
      stage.timerFill.style.width = Math.round(util.clamp(ratio, 0, 1) * 100) + '%';
    }
  }

  function badge(doc, kind, text) {
    var node = doc.createElement('span');
    node.className = 'stage__badge';
    node.dataset.kind = kind;
    node.textContent = text;
    return node;
  }

  /** Nur den Zeitbalken aktualisieren – ohne die Seite neu aufzubauen. */
  function updateTimer(stage, view) {
    if (!stage || !stage.timerFill) return;
    var showTimer = !!view.autoPlaying && !view.copyMode;
    stage.timer.style.display = showTimer ? '' : 'none';
    if (!showTimer) return;
    var ratio = view.autoSeconds ? (1 - (view.autoRemaining / view.autoSeconds)) : 0;
    stage.timerFill.style.width = Math.round(util.clamp(ratio, 0, 1) * 100) + '%';
  }

  BAO.render = {
    ensureStyle: ensureStyle,
    createStage: createStage,
    renderStage: renderStage,
    relayout: relayout,
    updateTimer: updateTimer,
    buildItemNode: buildItemNode,
    computeColumns: computeColumns
  };
})(window.BAO = window.BAO || {});
