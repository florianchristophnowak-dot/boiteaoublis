/* ==========================================================================
   Vorlage für die Projektion ("Deck")
   Übersetzt eine Wortbank zusammen mit der gewählten Unterstützungsstufe in
   Abschnitte und daraus in einzelne Bildschirmseiten. Die endgültige
   Aufteilung entsteht in render.js durch Messung – hier steht die inhaltliche
   Vorarbeit und eine belastbare Schätzung.
   ========================================================================== */
(function (BAO) {
  'use strict';

  var util = BAO.util;
  var schema = BAO.schema;
  var select = BAO.select;

  var LIVE_SECTION_ID = '__live';

  /** Feldsichtbarkeit für eine Unterstützungsstufe. */
  function fieldsForLevel(level, fieldLevels) {
    var levels = fieldLevels || schema.defaultSettings().fieldLevels;
    var out = {};
    schema.FIELDS.forEach(function (field) {
      var threshold = levels[field.key] === undefined ? field.level : levels[field.key];
      out[field.key] = level >= threshold;
    });
    return out;
  }

  function countSecondary(fields) {
    return ['collocation', 'chunk', 'explanation', 'translation', 'example', 'pronunciation']
      .filter(function (key) { return fields[key]; }).length;
  }

  /* --- Zeilen eines Eintrags ---------------------------------------------- */

  function lexemeLines(lex, fields, layout) {
    var lines = [];
    function push(cls, text) { if (text) lines.push({ cls: cls, text: text }); }

    if (layout === 'impulse') {
      // Impuls: bewusst nur eine einzige Stützzeile, damit die Fläche ruhig bleibt.
      if (fields.chunk && lex.chunk) push('pitem__chunk', lex.chunk);
      else if (fields.collocation && lex.collocation) push('pitem__chunk', lex.collocation);
      else if (fields.translation && lex.translation) push('pitem__de', lex.translation);
      return lines;
    }

    if (fields.collocation) push('pitem__chunk', lex.collocation);
    if (fields.chunk) push('pitem__chunk', lex.chunk);
    if (fields.explanation) push('pitem__expl', lex.explanation);
    if (fields.translation) push('pitem__de', lex.translation);
    if (fields.example) push('pitem__ex', lex.example);
    return lines;
  }

  function lexemeMeta(lex, fields) {
    var parts = [];
    if (fields.pronunciation && lex.pronunciation) parts.push(lex.pronunciation);
    return parts.join(' · ');
  }

  function starterLines(starter, fields) {
    var lines = [];
    if (fields.starterTranslation && starter.translation) {
      lines.push({ cls: 'pitem__de', text: starter.translation });
    }
    return lines;
  }

  /* --- Abschnittsaufbau ---------------------------------------------------- */

  function resolveLayout(section, items, fields) {
    if (section.layout && section.layout !== 'auto') return section.layout;
    var onlyStarters = items.length > 0 && items.every(function (i) { return i.kind === 'starter'; });
    if (onlyStarters) return 'starters';
    if (countSecondary(fields) === 0) return 'impulse';
    return 'cards';
  }

  /**
   * Schätzt, wie viele Einträge auf eine Seite passen. Die Messung in
   * render.js korrigiert das anschließend – diese Zahl ist die Obergrenze und
   * sorgt zugleich für die vom Konzept gewünschte Portionierung.
   */
  function estimateCapacity(layout, fields, maxItems) {
    var secondary = countSecondary(fields);
    if (layout === 'starters') {
      return util.clamp(fields.starterTranslation ? 6 : 8, 3, maxItems);
    }
    if (layout === 'impulse') {
      return util.clamp(9, 3, Math.max(6, maxItems));
    }
    var capacity = maxItems - secondary * 2;
    return util.clamp(capacity, 3, maxItems);
  }

  function buildItems(state, section) {
    var items = [];
    (section.items || []).forEach(function (item) {
      var resolved = select.resolveItem(state, item);
      if (!resolved) return;
      items.push({
        key: item.id,
        kind: resolved.kind,
        ref: resolved.ref,
        item: item
      });
    });
    return items;
  }

  /**
   * Satzanfänge werden nach kommunikativen Funktionen gegliedert, sobald ein
   * Abschnitt mehr als eine Funktion enthält. Die Zwischenüberschrift ist eine
   * eigene Position und wird beim Umbruch nie allein am Seitenende gelassen.
   */
  function withFunctionGroups(state, items, layout) {
    if (layout !== 'starters') return items;
    var functionIds = util.unique(items.map(function (item) {
      return item.kind === 'starter' ? (item.ref.functionId || '') : '';
    }));
    if (functionIds.length < 2) return items;

    var out = [];
    var lastFunction = null;
    items.forEach(function (item) {
      var functionId = item.kind === 'starter' ? (item.ref.functionId || '') : '';
      if (functionId !== lastFunction) {
        out.push({
          key: 'grp_' + functionId + '_' + out.length,
          kind: 'group',
          label: select.functionLabel(state, functionId)
        });
        lastFunction = functionId;
      }
      out.push(item);
    });
    return out;
  }

  function countEntries(items) {
    return items.filter(function (item) { return item.kind !== 'group'; }).length;
  }

  /**
   * build(state, bank, options)
   * options: { level, fields, focusSectionId, liveItems, maxItemsPerSlide }
   */
  function build(state, bank, options) {
    options = options || {};
    var level = options.level || (bank ? bank.defaultLevel : 2) || 2;
    var fields = options.fields || fieldsForLevel(level, state.settings.fieldLevels);
    var maxItems = options.maxItemsPerSlide || state.settings.maxItemsPerSlide || 12;

    var subject = bank ? select.subject(state, bank.subjectId) : null;
    var group = bank ? select.group(state, bank.groupId) : null;

    var deck = {
      bankId: bank ? bank.id : '',
      title: bank ? bank.title : 'Live-Hilfe',
      scene: bank ? bank.scene : '',
      subjectName: subject ? subject.name : '',
      subjectColor: subject ? subject.color : '',
      groupName: group ? group.name : '',
      level: level,
      fields: fields,
      maxItemsPerSlide: maxItems,
      sections: [],
      slides: []
    };

    (bank ? bank.sections || [] : []).forEach(function (section) {
      var items = buildItems(state, section);
      if (!items.length) return;
      if (options.focusSectionId && section.id !== options.focusSectionId) return;
      var layout = resolveLayout(section, items, fields);
      deck.sections.push({
        id: section.id,
        title: section.title,
        layout: layout,
        capacity: estimateCapacity(layout, fields, maxItems),
        items: withFunctionGroups(state, items, layout)
      });
    });

    var live = (options.liveItems || []).filter(Boolean);
    if (live.length && (!options.focusSectionId || options.focusSectionId === LIVE_SECTION_ID)) {
      var liveItems = live.map(function (entry) {
        return { key: entry.id, kind: 'live', ref: entry, item: null };
      });
      deck.sections.push({
        id: LIVE_SECTION_ID,
        title: 'Live-Hilfe',
        layout: liveItems.every(function (i) { return i.ref.type === 'starter'; }) ? 'starters' : 'cards',
        capacity: estimateCapacity('cards', fields, maxItems),
        items: liveItems,
        live: true
      });
    }

    paginate(deck);
    return deck;
  }

  /**
   * Verteilt die Einträge jedes Abschnitts auf Seiten.
   * capacities: optionale Zuordnung { sectionId: anzahl } aus der Messung.
   */
  function paginate(deck, capacities) {
    var slides = [];
    deck.sections.forEach(function (section, sectionIndex) {
      var capacity = Math.max(1, (capacities && capacities[section.id]) || section.capacity);
      var pages = Math.max(1, Math.ceil(section.items.length / capacity));
      // Gleichmäßig verteilen: lieber 2 x 5 als 8 + 2.
      var perPage = Math.ceil(section.items.length / pages);
      for (var page = 0; page < pages; page++) {
        var items = section.items.slice(page * perPage, (page + 1) * perPage);
        if (!items.length) continue;
        slides.push({
          sectionId: section.id,
          sectionTitle: section.title,
          sectionIndex: sectionIndex,
          layout: section.layout,
          live: !!section.live,
          pageInSection: page + 1,
          pagesInSection: pages,
          items: items
        });
      }
    });
    // Seitenzahlen nachtragen, wenn ein Abschnitt tatsächlich mehrfach umbrochen wurde.
    var perSection = {};
    slides.forEach(function (slide) { perSection[slide.sectionId] = (perSection[slide.sectionId] || 0) + 1; });
    slides.forEach(function (slide) { slide.pagesInSection = perSection[slide.sectionId]; });

    deck.slides = slides;
    return deck;
  }

  function isEmpty(deck) { return !deck || !deck.slides.length; }

  function sectionSummary(deck) {
    return deck.sections.map(function (section) {
      var slides = deck.slides.filter(function (s) { return s.sectionId === section.id; });
      return {
        id: section.id,
        title: section.title,
        items: countEntries(section.items),
        slides: slides.length,
        firstSlide: deck.slides.indexOf(slides[0]),
        live: !!section.live
      };
    });
  }

  BAO.deck = {
    LIVE_SECTION_ID: LIVE_SECTION_ID,
    fieldsForLevel: fieldsForLevel,
    countSecondary: countSecondary,
    lexemeLines: lexemeLines,
    lexemeMeta: lexemeMeta,
    starterLines: starterLines,
    estimateCapacity: estimateCapacity,
    build: build,
    paginate: paginate,
    countEntries: countEntries,
    isEmpty: isEmpty,
    sectionSummary: sectionSummary
  };
})(window.BAO = window.BAO || {});
