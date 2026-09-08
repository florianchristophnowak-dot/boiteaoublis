/* ==========================================================================
   Wiederverwendete Oberflächenbausteine
   ========================================================================== */
(function (BAO) {
  'use strict';

  var util = BAO.util;
  var h = util.h;
  var schema = BAO.schema;

  /* --- Symbole -------------------------------------------------------------
     Bewusst als Inline-SVG: keine Symbolschrift, keine externe Ressource,
     gleiche Darstellung auf jedem Rechner. */
  var ICONS = {
    home: 'M4 11.5 12 5l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z',
    list: 'M4 7h16M4 12h16M4 17h10',
    quote: 'M4.5 15c3 0 4-1.7 4-4H5V6h5v5c0 3.4-1.8 5.4-5.5 5.7zM14 15c3 0 4-1.7 4-4h-3.5V6h5v5c0 3.4-1.8 5.4-5.5 5.7z',
    grid: 'M4 4h6.5v6.5H4zM13.5 4H20v6.5h-6.5zM4 13.5h6.5V20H4zM13.5 13.5H20V20h-6.5z',
    play: 'M8 5.5 19 12 8 18.5z',
    users: 'M9 11.5a3.4 3.4 0 1 0 0-6.8 3.4 3.4 0 0 0 0 6.8zM3 20c0-3.2 2.7-5.6 6-5.6s6 2.4 6 5.6M16.5 5.2a3.4 3.4 0 0 1 0 6.6M17.5 14.7c2.6.6 4.5 2.6 4.5 5.3',
    data: 'M12 3.5c4.4 0 8 1.3 8 2.9s-3.6 2.9-8 2.9-8-1.3-8-2.9 3.6-2.9 8-2.9zM4 6.4v11.2c0 1.6 3.6 2.9 8 2.9s8-1.3 8-2.9V6.4',
    search: 'M11 18.5a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15zM20.5 20.5l-4.2-4.2',
    plus: 'M12 5.5v13M5.5 12h13',
    edit: 'M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17z',
    trash: 'M5 7h14M10 7V5h4v2M6.5 7l.8 12a1 1 0 0 0 1 .9h7.4a1 1 0 0 0 1-.9L17.5 7',
    copy: 'M9 9h10v11H9zM5 15V4h10',
    beamer: 'M3 8h18v8H3zM7 16v3M17 16v3M12 8V5',
    focus: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
    school: 'M12 4 3 8.5 12 13l9-4.5zM7 11v5.2c0 .7 2.2 2.3 5 2.3s5-1.6 5-2.3V11',
    archive: 'M3.5 6.5h17v3.5h-17zM5.5 10v8.5a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V10M10 13.5h4'
  };

  function icon(name, size) {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', size || 18);
    svg.setAttribute('height', size || 18);
    svg.setAttribute('fill', 'none');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', ICONS[name] || ICONS.list);
    path.setAttribute('stroke', 'currentColor');
    path.setAttribute('stroke-width', '1.7');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(path);
    return svg;
  }

  /* --- Etiketten ----------------------------------------------------------- */

  function statusChip(statusId, options) {
    options = options || {};
    var info = schema.statusInfo(statusId);
    return h('span.chip.chip--st-' + info.id, { title: info.hint },
      h('i.dot'), options.long ? info.label : info.short);
  }

  function subjectVars(subject) {
    if (!subject) return {};
    return { '--subject-color': subject.color, '--subject-soft': subject.colorSoft };
  }

  function subjectChip(subject) {
    if (!subject) return null;
    return h('span.chip.chip--subject', { style: subjectVars(subject), text: subject.name });
  }

  function variantPips(variant) {
    var levels = { einfach: 1, standard: 2, anspruchsvoll: 3 };
    var value = levels[variant] || 2;
    var titles = { 1: 'einfache Variante', 2: 'Standardvariante', 3: 'anspruchsvolle Variante' };
    return h('span.level-pip', { dataset: { level: value }, title: titles[value] },
      h('i'), h('i'), h('i'));
  }

  function favButton(isFavourite, onToggle, label) {
    return h('button.fav', {
      type: 'button',
      'aria-pressed': isFavourite ? 'true' : 'false',
      'aria-label': label || 'Als Favorit merken',
      title: isFavourite ? 'Favorit entfernen' : 'Als Favorit merken',
      text: isFavourite ? '★' : '☆',
      onclick: function (event) { event.stopPropagation(); onToggle(); }
    });
  }

  /* --- Textdarstellung ------------------------------------------------------ */

  /**
   * Der Artikel wird nur angezeigt, wenn er nicht ohnehin schon im Zielwort
   * steht. So bleibt „le stage“ auch dann korrekt, wenn eine importierte
   * Liste den Artikel mit ins Wort geschrieben hat.
   */
  function displayArticle(lex) {
    if (!lex || !lex.article) return '';
    var article = util.fold(lex.article).replace(/\([^)]*\)/g, '').trim();
    var term = util.fold(lex.term);
    if (!article || !term) return lex.article;
    var parts = article.split(/\s*\/\s*/);
    for (var i = 0; i < parts.length; i++) {
      var part = parts[i];
      if (!part) continue;
      if (term.indexOf(part + ' ') === 0) return '';
      if (part.charAt(part.length - 1) === "'" && term.indexOf(part) === 0) return '';
    }
    return lex.article;
  }

  /** Vollständige Wortform inklusive Artikel und Formhinweis. */
  function termLabel(lex) {
    if (!lex) return '';
    var article = displayArticle(lex);
    if (article && article.charAt(article.length - 1) === '\u2019') return article + lex.term;
    return [article, lex.term].filter(Boolean).join(' ');
  }

  /* --- Genus des Artikels ----------------------------------------------------
     Artikel werden farbig ausgezeichnet: maskulin blau, feminin rot, neutrum
     grün – die aus dem Unterricht vertraute Konvention der/die/das. Die Farbe
     ist die einzige Bedeutung, die sie trägt.

     Erkannt wird das Genus zuerst am Artikel selbst, sonst am Formhinweis
     ("m.", "f.", "n."). Steht dort nichts, bleibt der Artikel neutral grau –
     lieber keine Farbe als eine falsche. */

  var ARTICLE_GENDER = {
    // romanische Sprachen
    le: 'm', la: 'f', un: 'm', une: 'f',
    el: 'm', lo: 'm', il: 'm', uno: 'm', una: 'f',
    // Deutsch
    der: 'm', die: 'f', das: 'n', eine: 'f'
    // Bewusst nicht aufgeführt: les, des, los, las, l', the, ein …
    // Sie sind mehrdeutig und richten sich nach dem Formhinweis.
  };

  /** Genus aus einem Formhinweis wie "m.", "f. pl." oder "neutrum". */
  function genderFromGram(gram) {
    if (!gram) return '';
    var text = ' ' + util.fold(gram).replace(/[.,;:()\[\]/]/g, ' ') + ' ';
    if (/ (f|fem|feminin|feminine|weiblich) /.test(text)) return 'f';
    if (/ (n|neutr|neutrum|neutral|sachlich) /.test(text)) return 'n';
    if (/ (m|masc|mask|maskulin|masculine|mannlich) /.test(text)) return 'm';
    return '';
  }

  function genderOfToken(token) {
    var key = util.fold(token).replace(/[\u2019']/g, '').replace(/[^a-z]/g, '');
    return ARTICLE_GENDER[key] || '';
  }

  /** Genus eines Eintrags, soweit eindeutig bestimmbar. */
  function genderOf(lex) {
    if (!lex) return '';
    var article = displayArticle(lex);
    var found = {};
    String(article).split(/[\s/]+/).forEach(function (token) {
      var gender = genderOfToken(token);
      if (gender) found[gender] = true;
    });
    var list = Object.keys(found);
    if (list.length === 1) return list[0];
    if (list.length > 1) return 'mf';
    return genderFromGram(lex.gram);
  }

  /**
   * Artikel als Knoten – jedes Teilstück bekommt seine eigene Genusfarbe.
   * So wird aus "le / la" ein blaues „le“ und ein rotes „la“.
   */
  function articleNode(lex, doc) {
    doc = doc || document;
    var article = displayArticle(lex);
    if (!article) return null;
    var fallback = genderFromGram(lex.gram);

    var wrap = doc.createElement('span');
    wrap.className = 'art';
    String(article).split(/(\s+|\/)/).forEach(function (token) {
      if (!token) return;
      if (/^(\s+|\/)$/.test(token)) {
        wrap.appendChild(doc.createTextNode(token));
        return;
      }
      var gender = genderOfToken(token) || fallback;
      var part = doc.createElement('span');
      part.className = 'art__part';
      if (gender) part.dataset.gender = gender;
      part.textContent = token;
      wrap.appendChild(part);
    });
    return wrap;
  }

  /**
   * Vollständige Wortform als Knoten: farbiger Artikel, Zielwort, Formhinweis.
   * Wird in der Projektion und in den Listen der Lehreransicht verwendet,
   * damit die Genusfarbe überall dieselbe Bedeutung hat.
   */
  function termNode(lex, options) {
    options = options || {};
    var doc = options.doc || document;
    var fragment = doc.createDocumentFragment();
    if (!lex) return fragment;

    var article = articleNode(lex, doc);
    if (article) {
      fragment.appendChild(article);
      // Elidierte Artikel („l’“) stehen ohne Leerzeichen am Wort.
      var text = article.textContent;
      if (text.charAt(text.length - 1) !== '\u2019') fragment.appendChild(doc.createTextNode(' '));
    }
    fragment.appendChild(doc.createTextNode(lex.term || ''));

    if (options.gram && lex.gram) {
      var gram = doc.createElement('span');
      gram.className = options.gramClass || 'gram';
      gram.textContent = lex.gram;
      fragment.appendChild(gram);
    }
    return fragment;
  }

  /**
   * Wandelt Leerstellen ("___") in ruhige Linien um.
   * Wird sowohl in der Lehreransicht als auch auf dem Beamer verwendet.
   */
  function gapText(text, doc) {
    doc = doc || document;
    var fragment = doc.createDocumentFragment();
    String(text || '').split(/(_{2,})/).forEach(function (part) {
      if (!part) return;
      if (/^_{2,}$/.test(part)) {
        var span = doc.createElement('span');
        span.className = 'gap';
        span.setAttribute('aria-label', 'Leerstelle');
        span.textContent = ' ';
        fragment.appendChild(span);
      } else {
        fragment.appendChild(doc.createTextNode(part));
      }
    });
    return fragment;
  }

  function plainStarterText(text) {
    return String(text || '').replace(/_{2,}/g, '…');
  }

  /* --- Bausteine ----------------------------------------------------------- */

  function emptyState(config) {
    var node = h('div.empty', {},
      config.icon ? h('div', { style: { 'font-size': '2rem' }, text: config.icon }) : null,
      h('div.empty__title', { text: config.title }),
      config.text ? h('p.empty__text', { text: config.text }) : null
    );
    if (config.actionLabel) {
      node.appendChild(h('button.btn.btn--primary', {
        type: 'button', text: config.actionLabel, onclick: config.onAction
      }));
    }
    if (config.secondaryLabel) {
      node.appendChild(h('button.btn.btn--ghost.btn--sm', {
        type: 'button', text: config.secondaryLabel, onclick: config.onSecondary
      }));
    }
    return node;
  }

  function selectField(config) {
    var select = h('select', { 'aria-label': config.ariaLabel || config.label || '' });
    (config.options || []).forEach(function (option) {
      select.appendChild(h('option', {
        value: option.value,
        text: option.label,
        selected: String(option.value) === String(config.value) ? true : null
      }));
    });
    if (config.onChange) select.addEventListener('change', function () { config.onChange(select.value, select); });
    if (!config.label) return select;
    return h('div.field', {}, h('label', { text: config.label }), select);
  }

  function textField(config) {
    var input = h(config.multiline ? 'textarea' : 'input', {
      type: config.multiline ? null : (config.type || 'text'),
      value: config.multiline ? null : (config.value || ''),
      placeholder: config.placeholder || '',
      rows: config.rows || null
    });
    if (config.multiline) input.value = config.value || '';
    if (config.onInput) input.addEventListener('input', function () { config.onInput(input.value, input); });
    if (config.name) input.name = config.name;
    var field = h('div.field' + (config.full ? '.full' : ''), {},
      config.label ? h('label', { text: config.label }) : null,
      input,
      config.hint ? h('span.hint', { text: config.hint }) : null
    );
    field.input = input;
    return field;
  }

  /** Freies Schlagwortfeld mit Chips. */
  function tagEditor(values, config) {
    config = config || {};
    var current = (values || []).slice();
    var wrap = h('div.tag-input');
    var input = h('input', { type: 'text', placeholder: config.placeholder || 'Hinzufügen …' });

    function emit() { if (config.onChange) config.onChange(current.slice()); }

    function draw() {
      util.clear(wrap);
      current.forEach(function (tag, index) {
        wrap.appendChild(h('span.chip.chip--tag', {}, tag,
          h('button', {
            type: 'button', 'aria-label': 'Entfernen: ' + tag, text: '×',
            onclick: function () { current.splice(index, 1); draw(); emit(); }
          })
        ));
      });
      wrap.appendChild(input);
    }

    function add(raw) {
      String(raw).split(/[,;]/).forEach(function (piece) {
        var tag = piece.trim();
        if (tag && current.indexOf(tag) < 0) current.push(tag);
      });
      input.value = '';
      draw();
      emit();
    }

    input.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' || event.key === ',') { event.preventDefault(); if (input.value.trim()) add(input.value); }
      else if (event.key === 'Backspace' && !input.value && current.length) { current.pop(); draw(); emit(); }
    });
    input.addEventListener('blur', function () { if (input.value.trim()) add(input.value); });
    wrap.addEventListener('click', function (event) { if (event.target === wrap) input.focus(); });

    draw();
    var field = config.label
      ? h('div.field' + (config.full ? '.full' : ''), {}, h('label', { text: config.label }), wrap)
      : wrap;
    field.getValue = function () { return current.slice(); };
    return field;
  }

  function statusOptions() {
    return schema.STATUS.map(function (s) { return { value: s.id, label: s.label }; });
  }

  function sceneOptions(state) {
    return (state.settings.scenes || schema.SCENES).map(function (s) { return { value: s, label: s }; });
  }

  function unitOptions(state, groupId, includeEmpty) {
    var list = BAO.select.unitsOfGroup(state, groupId).map(function (u) {
      return { value: u.id, label: u.title + ' (' + u.schoolYear + ')' };
    });
    if (includeEmpty !== false) list.unshift({ value: '', label: '– keiner Reihe zugeordnet –' });
    return list;
  }

  function functionOptions(state, includeEmpty) {
    var list = BAO.select.functions(state).map(function (f) { return { value: f.id, label: f.label }; });
    if (includeEmpty) list.unshift({ value: '', label: '– ohne Funktion –' });
    return list;
  }

  BAO.ui = {
    icon: icon,
    statusChip: statusChip,
    subjectChip: subjectChip,
    subjectVars: subjectVars,
    variantPips: variantPips,
    favButton: favButton,
    termLabel: termLabel,
    termNode: termNode,
    displayArticle: displayArticle,
    articleNode: articleNode,
    genderOf: genderOf,
    genderFromGram: genderFromGram,
    gapText: gapText,
    plainStarterText: plainStarterText,
    emptyState: emptyState,
    selectField: selectField,
    textField: textField,
    tagEditor: tagEditor,
    statusOptions: statusOptions,
    sceneOptions: sceneOptions,
    unitOptions: unitOptions,
    functionOptions: functionOptions
  };
})(window.BAO = window.BAO || {});
