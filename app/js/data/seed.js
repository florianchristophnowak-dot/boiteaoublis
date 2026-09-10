/* ==========================================================================
   Beispieldaten
   Zwei Lerngruppen (Französisch, Englisch), je zwei Unterrichtsreihen, ein
   mitgewachsener Wortschatzbestand, kommunikative Satzanfänge und vier
   einsatzfertige Wortbanken. Bewusst überschaubar gehalten.
   ========================================================================== */
(function (BAO) {
  'use strict';

  var schema = BAO.schema;
  var util = BAO.util;

  function fill(state) {
    var YEAR_NOW = '2025/26';
    var YEAR_PREV = '2024/25';

    /* --- Fächer ---------------------------------------------------------- */
    state.subjects = [
      schema.makeSubject({ id: 'sub_fr', name: 'Französisch', short: 'FR', color: '#2b5c8a', colorSoft: '#e6eef7', order: 0 }),
      schema.makeSubject({ id: 'sub_en', name: 'Englisch', short: 'EN', color: '#a4552f', colorSoft: '#f8e9e1', order: 1 })
    ];

    /* --- Lerngruppen ------------------------------------------------------ */
    state.groups = [
      schema.makeGroup({
        id: 'grp_fr9b', subjectId: 'sub_fr', name: '9b', grade: 9, schoolYear: YEAR_NOW,
        note: 'Dritte Fremdsprache ab Klasse 7, zwei Wochenstunden.', favorite: true,
        history: [{ schoolYear: YEAR_PREV, grade: 8, at: '2025-07-10T09:00:00.000Z', note: 'Übernahme ins neue Schuljahr' }]
      }),
      schema.makeGroup({
        id: 'grp_en10a', subjectId: 'sub_en', name: '10a', grade: 10, schoolYear: YEAR_NOW,
        note: 'Grundkurs, viel mündliche Arbeit.', favorite: true,
        history: [{ schoolYear: YEAR_PREV, grade: 9, at: '2025-07-10T09:00:00.000Z', note: 'Übernahme ins neue Schuljahr' }]
      })
    ];

    /* --- Unterrichtsreihen ------------------------------------------------ */
    state.units = [
      schema.makeUnit({ id: 'unt_fr_ville', groupId: 'grp_fr9b', title: 'Découvrir une ville française',
        description: 'Stadtviertel beschreiben, Wege erklären, Vorlieben begründen.', schoolYear: YEAR_PREV, status: 'done', order: 0 }),
      schema.makeUnit({ id: 'unt_fr_stage', groupId: 'grp_fr9b', title: 'Le stage en entreprise',
        description: 'Praktikumserfahrungen erzählen, bewerten und vergleichen.', schoolYear: YEAR_NOW, status: 'current', order: 1 }),
      schema.makeUnit({ id: 'unt_en_cartoon', groupId: 'grp_en10a', title: 'Analysing cartoons',
        description: 'Bildmaterial beschreiben und die Aussage herausarbeiten.', schoolYear: YEAR_PREV, status: 'done', order: 0 }),
      schema.makeUnit({ id: 'unt_en_social', groupId: 'grp_en10a', title: 'Growing up online',
        description: 'Soziale Medien, Selbstbild und Regulierung diskutieren.', schoolYear: YEAR_NOW, status: 'current', order: 1 })
    ];

    /* --- Wortschatz Französisch ------------------------------------------ */
    var fr = [
      // Grundbestand aus der Reihe des Vorjahres
      { term: 'quartier', article: 'le', gram: 'm.', translation: 'das Viertel, der Stadtteil',
        collocation: 'un quartier animé', explanation: 'une partie d’une ville',
        example: 'J’habite dans un quartier assez calme.', status: 'core', unit: 'unt_fr_ville', topics: ['la ville'] },
      { term: 'se trouver', translation: 'sich befinden, liegen',
        collocation: 'se trouver au centre-ville', example: 'La gare se trouve près du parc.',
        status: 'core', unit: 'unt_fr_ville', topics: ['la ville'] },
      { term: 'endroit', article: 'l’', gram: 'm., pl. les endroits', translation: 'der Ort, die Stelle',
        collocation: 'mon endroit préféré', status: 'core', unit: 'unt_fr_ville', topics: ['la ville'] },
      { term: 'avoir envie de', translation: 'Lust haben auf', chunk: 'J’ai envie de découvrir…',
        example: 'J’ai envie de visiter le vieux port.', status: 'core', unit: 'unt_fr_ville' },
      { term: 'pratique', gram: 'adj., unveränderlich im Genus', translation: 'praktisch',
        collocation: 'c’est très pratique', status: 'core', unit: 'unt_fr_ville' },
      // Wieder aufgreifen (Bildbeschreibung)
      { term: 'décrire', gram: 'je décris, nous décrivons', translation: 'beschreiben',
        collocation: 'décrire une photo', status: 'revisit', unit: 'unt_fr_ville', topics: ['méthode'] },
      { term: 'au premier plan', translation: 'im Vordergrund',
        chunk: 'Au premier plan, on voit…', status: 'revisit', unit: 'unt_fr_ville', topics: ['méthode'] },
      { term: 'à l’arrière-plan', translation: 'im Hintergrund',
        chunk: 'À l’arrière-plan, il y a…', status: 'revisit', unit: 'unt_fr_ville', topics: ['méthode'] },
      // Laufende Reihe: le stage
      { term: 'stage', article: 'le', gram: 'm.', pronunciation: '[staʒ]', translation: 'das Praktikum',
        collocation: 'faire un stage en entreprise', explanation: 'une période de travail pour découvrir un métier',
        example: 'J’ai fait un stage dans une boulangerie.', status: 'new', unit: 'unt_fr_stage',
        topics: ['le monde du travail'], cefr: 'A2' },
      { term: 'entreprise', article: 'l’', gram: 'f.', translation: 'das Unternehmen, der Betrieb',
        collocation: 'une entreprise familiale', status: 'new', unit: 'unt_fr_stage', topics: ['le monde du travail'] },
      { term: 'métier', article: 'le', gram: 'm.', translation: 'der Beruf',
        collocation: 'exercer un métier', explanation: 'le travail qu’on fait tous les jours',
        example: 'Le métier de vendeuse demande de la patience.', status: 'new', unit: 'unt_fr_stage',
        topics: ['le monde du travail'] },
      { term: 'postuler', translation: 'sich bewerben',
        collocation: 'postuler pour un poste', example: 'Je voudrais postuler pour un stage de trois semaines.',
        status: 'new', unit: 'unt_fr_stage', topics: ['le monde du travail'] },
      { term: 'candidature', article: 'la', gram: 'f.', translation: 'die Bewerbung',
        collocation: 'envoyer une candidature', status: 'new', unit: 'unt_fr_stage', topics: ['le monde du travail'] },
      { term: 'entretien', article: 'l’', gram: 'm.', translation: 'das Vorstellungsgespräch',
        collocation: 'passer un entretien', status: 'new', unit: 'unt_fr_stage', topics: ['le monde du travail'] },
      { term: 'responsable', article: 'le / la', translation: 'der/die Verantwortliche',
        collocation: 'le responsable du service', status: 'active', unit: 'unt_fr_stage', topics: ['le monde du travail'] },
      { term: 'horaires', article: 'les', gram: 'm. pl.', translation: 'die Arbeitszeiten',
        collocation: 'des horaires flexibles', status: 'active', unit: 'unt_fr_stage', topics: ['le monde du travail'] },
      { term: 'tâche', article: 'la', gram: 'f.', translation: 'die Aufgabe',
        collocation: 'effectuer une tâche', example: 'Ma tâche principale était de ranger les rayons.',
        status: 'active', unit: 'unt_fr_stage', topics: ['le monde du travail'] },
      { term: 'apprendre à + Infinitiv', translation: 'lernen, etwas zu tun',
        chunk: 'J’ai appris à travailler en équipe.', status: 'active', unit: 'unt_fr_stage' },
      { term: 'expérience', article: 'l’', gram: 'f.', translation: 'die Erfahrung',
        collocation: 'acquérir de l’expérience', status: 'active', unit: 'unt_fr_stage' },
      { term: 'enrichissant, enrichissante', gram: 'adj.', translation: 'bereichernd',
        collocation: 'une expérience enrichissante', example: 'C’était une expérience très enrichissante.',
        status: 'new', unit: 'unt_fr_stage' },
      { term: 'exigeant, exigeante', gram: 'adj.', translation: 'anspruchsvoll, fordernd',
        collocation: 'un travail exigeant', status: 'active', unit: 'unt_fr_stage' },
      { term: 'collègue', article: 'le / la', translation: 'der Kollege / die Kollegin',
        collocation: 's’entendre bien avec ses collègues', status: 'active', unit: 'unt_fr_stage',
        topics: ['le monde du travail'] },
      { term: 'se débrouiller', translation: 'zurechtkommen, sich zu helfen wissen',
        chunk: 'Je me suis bien débrouillé(e).', explanation: 'réussir à faire quelque chose tout seul',
        status: 'new', unit: 'unt_fr_stage' },
      { term: 'photocopieuse', article: 'la', gram: 'f.', translation: 'das Kopiergerät',
        status: 'archived', unit: 'unt_fr_stage', topics: ['le monde du travail'] }
    ];

    /* --- Wortschatz Englisch --------------------------------------------- */
    var en = [
      { term: 'to point out', translation: 'hervorheben, betonen',
        collocation: 'the author points out that…', status: 'core', unit: 'unt_en_cartoon', topics: ['analysis'] },
      { term: 'the message', translation: 'die Aussage, die Botschaft',
        collocation: 'to convey a message', explanation: 'the idea the author wants to get across',
        status: 'core', unit: 'unt_en_cartoon', topics: ['analysis'] },
      { term: 'to exaggerate', pronunciation: '[ɪɡˈzædʒəreɪt]', translation: 'übertreiben',
        collocation: 'the cartoonist exaggerates…', status: 'revisit', unit: 'unt_en_cartoon', topics: ['analysis'] },
      { term: 'to depict', translation: 'darstellen, abbilden',
        collocation: 'the cartoon depicts…', status: 'revisit', unit: 'unt_en_cartoon', topics: ['analysis'] },
      { term: 'in the foreground / in the background', translation: 'im Vordergrund / im Hintergrund',
        chunk: 'In the foreground you can see…', status: 'revisit', unit: 'unt_en_cartoon', topics: ['analysis'] },
      { term: 'social media', gram: 'usually plural', translation: 'soziale Medien',
        collocation: 'on social media', example: 'Most of us spend hours on social media every day.',
        status: 'new', unit: 'unt_en_social', topics: ['media'], cefr: 'B1' },
      { term: 'peer pressure', translation: 'Gruppendruck',
        explanation: 'the feeling that you have to do what your friends do',
        collocation: 'to give in to peer pressure', status: 'new', unit: 'unt_en_social', topics: ['media'] },
      { term: 'self-esteem', pronunciation: '[ˌself ɪˈstiːm]', translation: 'das Selbstwertgefühl',
        collocation: 'low self-esteem', status: 'new', unit: 'unt_en_social', topics: ['media'] },
      { term: 'filter bubble', translation: 'die Filterblase',
        explanation: 'when you only see opinions you already agree with',
        status: 'new', unit: 'unt_en_social', topics: ['media'] },
      { term: 'to compare oneself to sb.', translation: 'sich mit jemandem vergleichen',
        chunk: 'I keep comparing myself to other people.', status: 'new', unit: 'unt_en_social', topics: ['media'] },
      { term: 'addictive', translation: 'süchtig machend',
        collocation: 'highly addictive', example: 'Short videos are highly addictive.',
        status: 'new', unit: 'unt_en_social', topics: ['media'] },
      { term: 'body image', translation: 'das Körperbild',
        explanation: 'how you see and judge your own body', status: 'new', unit: 'unt_en_social', topics: ['media'] },
      { term: 'to regulate', translation: 'regulieren, gesetzlich regeln',
        collocation: 'to regulate social media platforms', status: 'new', unit: 'unt_en_social', topics: ['media', 'debate'] },
      { term: 'screen time', translation: 'die Bildschirmzeit',
        collocation: 'to limit your screen time', status: 'active', unit: 'unt_en_social', topics: ['media'] },
      { term: 'privacy settings', translation: 'die Privatsphäre-Einstellungen',
        collocation: 'to check your privacy settings', status: 'active', unit: 'unt_en_social', topics: ['media'] },
      { term: 'cyberbullying', translation: 'Mobbing im Netz',
        explanation: 'using the internet to hurt or frighten someone', status: 'active', unit: 'unt_en_social',
        topics: ['media', 'debate'] },
      { term: 'harmful', translation: 'schädlich',
        collocation: 'harmful content', status: 'active', unit: 'unt_en_social', topics: ['debate'] },
      { term: 'to be aware of sth.', translation: 'sich einer Sache bewusst sein',
        chunk: 'You should be aware of the risks.', status: 'active', unit: 'unt_en_social' },
      { term: 'to scroll through sth.', translation: 'durch etwas scrollen',
        collocation: 'to scroll through your feed', status: 'active', unit: 'unt_en_social', topics: ['media'] },
      { term: 'anonymity', pronunciation: '[ˌænəˈnɪməti]', translation: 'die Anonymität',
        collocation: 'the anonymity of the internet', status: 'active', unit: 'unt_en_social', topics: ['debate'] },
      { term: 'chat room', translation: 'der Chatraum',
        status: 'archived', unit: 'unt_en_social', topics: ['media'] }
    ];

    function buildLexemes(rows, subjectId, groupId, prefix) {
      return rows.map(function (row, index) {
        var unitId = row.unit || '';
        var unit = state.units.filter(function (u) { return u.id === unitId; })[0];
        return schema.makeLexeme({
          id: prefix + '_' + index,
          subjectId: subjectId,
          groupId: groupId,
          term: row.term,
          article: row.article || '',
          gram: row.gram || '',
          collocation: row.collocation || '',
          chunk: row.chunk || '',
          explanation: row.explanation || '',
          translation: row.translation || '',
          example: row.example || '',
          pronunciation: row.pronunciation || '',
          topics: row.topics || [],
          tags: row.tags || [],
          cefr: row.cefr || '',
          status: row.status || 'new',
          introducedUnitId: unitId,
          introducedSchoolYear: unit ? unit.schoolYear : ''
        });
      });
    }

    state.lexemes = buildLexemes(fr, 'sub_fr', 'grp_fr9b', 'lex_fr')
      .concat(buildLexemes(en, 'sub_en', 'grp_en10a', 'lex_en'));

    /* --- Satzanfänge ------------------------------------------------------ */
    var startersFr = [
      ['opinion', 'À mon avis, ___.', 'Meiner Meinung nach …', 'standard'],
      ['opinion', 'Je trouve que ___.', 'Ich finde, dass …', 'einfach'],
      ['opinion', 'Personnellement, je pense que ___.', 'Persönlich denke ich, dass …', 'standard'],
      ['opinion', 'Il me semble que ___, même si ___.', 'Mir scheint, dass …, auch wenn …', 'anspruchsvoll'],
      ['reason', 'parce que ___', 'weil …', 'einfach'],
      ['reason', 'En effet, ___.', 'Tatsächlich … / Denn …', 'standard'],
      ['reason', 'C’est la raison pour laquelle ___.', 'Das ist der Grund, weshalb …', 'anspruchsvoll'],
      ['agree', 'Tu as raison, ___.', 'Du hast recht, …', 'einfach'],
      ['agree', 'Je suis d’accord avec toi, parce que ___.', 'Ich stimme dir zu, weil …', 'standard'],
      ['agree', 'Je partage ton point de vue, car ___.', 'Ich teile deinen Standpunkt, denn …', 'anspruchsvoll'],
      ['disagree', 'Je ne suis pas d’accord, parce que ___.', 'Ich bin nicht einverstanden, weil …', 'standard'],
      ['disagree', 'Ce n’est pas si simple : ___.', 'So einfach ist das nicht: …', 'anspruchsvoll'],
      ['ask', 'Pourquoi est-ce que ___ ?', 'Warum …?', 'einfach'],
      ['ask', 'Qu’est-ce que tu veux dire par ___ ?', 'Was meinst du mit …?', 'standard'],
      ['clarify', 'Autrement dit, ___.', 'Anders gesagt …', 'standard'],
      ['clarify', 'Ce que je voulais dire, c’est que ___.', 'Was ich sagen wollte, ist, dass …', 'anspruchsvoll'],
      ['compare', 'Par rapport à ___, ___ est plus ___.', 'Im Vergleich zu … ist … mehr …', 'standard'],
      ['compare', 'Alors que ___, ___.', 'Während …, …', 'anspruchsvoll'],
      ['example', 'Par exemple, ___.', 'Zum Beispiel …', 'einfach'],
      ['example', 'Prenons l’exemple de ___.', 'Nehmen wir das Beispiel von …', 'anspruchsvoll'],
      ['continue', 'Et toi, qu’est-ce que tu en penses ?', 'Und du, was denkst du darüber?', 'standard'],
      ['continue', 'Revenons à ___.', 'Kommen wir zurück zu …', 'anspruchsvoll'],
      ['summarize', 'Pour résumer, ___.', 'Zusammenfassend …', 'standard'],
      ['summarize', 'Nous avons constaté que ___.', 'Wir haben festgestellt, dass …', 'anspruchsvoll'],
      ['analyse', 'Le document présente ___.', 'Das Dokument zeigt …', 'standard'],
      ['analyse', 'Au premier plan, on voit ___.', 'Im Vordergrund sieht man …', 'standard'],
      ['analyse', 'L’auteur souligne que ___.', 'Der Autor betont, dass …', 'anspruchsvoll'],
      ['mediate', 'Dans le texte allemand, il s’agit de ___.', 'In dem deutschen Text geht es um …', 'standard'],
      ['mediate', 'L’auteur explique que ___.', 'Der Autor erklärt, dass …', 'standard']
    ];

    var startersEn = [
      ['opinion', 'I think (that) ___.', 'Ich denke, dass …', 'einfach'],
      ['opinion', 'In my opinion, ___.', 'Meiner Meinung nach …', 'standard'],
      ['opinion', 'From my point of view, ___.', 'Aus meiner Sicht …', 'standard'],
      ['opinion', 'It seems to me that ___, although ___.', 'Mir scheint, dass …, obwohl …', 'anspruchsvoll'],
      ['reason', 'because ___', 'weil …', 'einfach'],
      ['reason', 'The main reason for this is that ___.', 'Der Hauptgrund dafür ist, dass …', 'standard'],
      ['reason', 'This is mainly due to ___.', 'Das liegt vor allem an …', 'anspruchsvoll'],
      ['agree', 'That’s a good point, and ___.', 'Das ist ein guter Punkt, und …', 'standard'],
      ['agree', 'I agree with you because ___.', 'Ich stimme dir zu, weil …', 'einfach'],
      ['agree', 'I couldn’t agree more, especially when ___.', 'Dem stimme ich völlig zu, besonders wenn …', 'anspruchsvoll'],
      ['disagree', 'I’m not sure about that, ___.', 'Da bin ich mir nicht sicher, …', 'einfach'],
      ['disagree', 'I see it differently because ___.', 'Ich sehe das anders, weil …', 'standard'],
      ['disagree', 'While I see your point, I would argue that ___.', 'Ich verstehe dein Argument, würde aber sagen, dass …', 'anspruchsvoll'],
      ['ask', 'What do you mean by ___?', 'Was meinst du mit …?', 'standard'],
      ['ask', 'Could you explain ___ again?', 'Könntest du … noch einmal erklären?', 'einfach'],
      ['clarify', 'What I meant was ___.', 'Was ich meinte, war …', 'standard'],
      ['clarify', 'To put it another way, ___.', 'Anders ausgedrückt …', 'anspruchsvoll'],
      ['compare', 'Compared to ___, ___ is ___.', 'Verglichen mit … ist …', 'standard'],
      ['compare', 'Whereas ___, ___.', 'Während …, …', 'anspruchsvoll'],
      ['example', 'For example, ___.', 'Zum Beispiel …', 'einfach'],
      ['example', 'A good example of this is ___.', 'Ein gutes Beispiel dafür ist …', 'standard'],
      ['continue', 'What about you?', 'Und du?', 'einfach'],
      ['continue', 'Let’s move on to ___.', 'Kommen wir zu …', 'standard'],
      ['summarize', 'All in all, ___.', 'Alles in allem …', 'standard'],
      ['summarize', 'To sum up, we found that ___.', 'Zusammenfassend haben wir festgestellt, dass …', 'anspruchsvoll'],
      ['analyse', 'The cartoon shows ___.', 'Der Cartoon zeigt …', 'einfach'],
      ['analyse', 'In the foreground / background, you can see ___.', 'Im Vorder-/Hintergrund sieht man …', 'standard'],
      ['analyse', 'The cartoonist criticises ___ by ___.', 'Der Zeichner kritisiert …, indem er …', 'anspruchsvoll'],
      ['mediate', 'The German text is about ___.', 'In dem deutschen Text geht es um …', 'standard'],
      ['mediate', 'The author explains that ___.', 'Der Autor erklärt, dass …', 'standard']
    ];

    function buildStarters(rows, subjectId, groupId, prefix) {
      return rows.map(function (row, index) {
        return schema.makeStarter({
          id: prefix + '_' + index,
          subjectId: subjectId,
          groupId: groupId,
          functionId: 'fn_' + row[0],
          text: row[1],
          translation: row[2],
          variant: row[3],
          status: 'active'
        });
      });
    }

    state.starters = buildStarters(startersFr, 'sub_fr', 'grp_fr9b', 'sta_fr')
      .concat(buildStarters(startersEn, 'sub_en', 'grp_en10a', 'sta_en'));

    /* --- Wortbanken ------------------------------------------------------- */
    function lexIds(prefix, indexes) { return indexes.map(function (i) { return prefix + '_' + i; }); }

    function items(kind, ids) {
      return ids.map(function (id) { return schema.makeBankItem({ kind: kind, refId: id }); });
    }

    function startersByFunction(prefix, functions, variants) {
      return state.starters.filter(function (s) {
        return s.id.indexOf(prefix) === 0
          && functions.indexOf(s.functionId) >= 0
          && (!variants || variants.indexOf(s.variant) >= 0);
      }).map(function (s) { return s.id; });
    }

    state.banks = [
      schema.makeBank({
        id: 'bnk_fr_stage', subjectId: 'sub_fr', groupId: 'grp_fr9b', unitId: 'unt_fr_stage',
        title: 'Parler de son stage', scene: 'Partnergespräch', defaultLevel: 2, favorite: true,
        note: 'Partnerinterview: Wie war dein Praktikum? – 10 Minuten, danach Kurzberichte.',
        lastUsedAt: '2025-09-02T08:20:00.000Z',
        sections: [
          schema.makeSection({ id: 'sec_fr_stage_1', title: 'Rund um das Praktikum', layout: 'auto',
            items: items('lex', lexIds('lex_fr', [8, 9, 10, 14, 15, 16, 21])) }),
          schema.makeSection({ id: 'sec_fr_stage_2', title: 'Erfahrungen bewerten', layout: 'auto',
            items: items('lex', lexIds('lex_fr', [17, 18, 19, 20, 22])) }),
          schema.makeSection({ id: 'sec_fr_stage_3', title: 'Meinung äußern und begründen', layout: 'starters',
            items: items('starter', startersByFunction('sta_fr', ['fn_opinion', 'fn_reason', 'fn_continue'])) })
        ]
      }),
      schema.makeBank({
        id: 'bnk_fr_photo', subjectId: 'sub_fr', groupId: 'grp_fr9b', unitId: 'unt_fr_ville',
        title: 'Décrire une photo', scene: 'Textanalyse', defaultLevel: 1,
        note: 'Kurze Aktivierung zu Stundenbeginn – Wortschatz aus Klasse 8 auffrischen.',
        lastUsedAt: '2025-08-28T10:05:00.000Z',
        sections: [
          schema.makeSection({ id: 'sec_fr_photo_1', title: 'Bildaufbau', layout: 'impulse',
            items: items('lex', lexIds('lex_fr', [5, 6, 7])) }),
          schema.makeSection({ id: 'sec_fr_photo_2', title: 'Formulierungen', layout: 'starters',
            items: items('starter', startersByFunction('sta_fr', ['fn_analyse'])) })
        ]
      }),
      schema.makeBank({
        id: 'bnk_en_debate', subjectId: 'sub_en', groupId: 'grp_en10a', unitId: 'unt_en_social',
        title: 'Should social media be regulated?', scene: 'Diskussion', defaultLevel: 2, favorite: true,
        note: 'Fishbowl-Diskussion, 20 Minuten. Stufe 2 zu Beginn, später auf Stufe 1 zurücknehmen.',
        lastUsedAt: '2025-09-04T11:40:00.000Z',
        sections: [
          schema.makeSection({ id: 'sec_en_deb_1', title: 'Kernbegriffe', layout: 'auto',
            items: items('lex', lexIds('lex_en', [12, 16, 10, 14, 13, 15, 19])) }),
          schema.makeSection({ id: 'sec_en_deb_2', title: 'Meinung äußern und begründen', layout: 'starters',
            items: items('starter', startersByFunction('sta_en', ['fn_opinion', 'fn_reason'])) }),
          schema.makeSection({ id: 'sec_en_deb_3', title: 'Zustimmen und widersprechen', layout: 'starters',
            items: items('starter', startersByFunction('sta_en', ['fn_agree', 'fn_disagree'])) }),
          schema.makeSection({ id: 'sec_en_deb_4', title: 'Ergebnisse zusammenfassen', layout: 'starters',
            items: items('starter', startersByFunction('sta_en', ['fn_summarize', 'fn_continue'])) })
        ]
      }),
      schema.makeBank({
        id: 'bnk_en_cartoon', subjectId: 'sub_en', groupId: 'grp_en10a', unitId: 'unt_en_cartoon',
        title: 'Analysing a cartoon', scene: 'Textanalyse', defaultLevel: 3,
        note: 'Methodentraining – volle Unterstützung, danach Stufe 1 zur Sicherung.',
        sections: [
          schema.makeSection({ id: 'sec_en_car_1', title: 'Methodenwortschatz', layout: 'auto',
            items: items('lex', lexIds('lex_en', [0, 1, 2, 3, 4])) }),
          schema.makeSection({ id: 'sec_en_car_2', title: 'Formulierungen für die Analyse', layout: 'starters',
            items: items('starter', startersByFunction('sta_en', ['fn_analyse', 'fn_clarify'])) })
        ]
      })
    ];

    /* --- Tafeln -----------------------------------------------------------
       Die einfache Grundform: eine Fläche, Elemente darauf. Wort oder Satz
       spielt keine Rolle – beides steht gleichberechtigt nebeneinander. */
    function scatter(entries) {
      return entries.map(function (entry) {
        return schema.makeBoardItem({
          kind: entry[0], refId: entry[1], x: entry[2], y: entry[3],
          scale: entry[4] === undefined ? 1 : entry[4]
        });
      });
    }

    state.boards = [
      schema.makeBoard({
        id: 'brd_fr_stage', subjectId: 'sub_fr', groupId: 'grp_fr9b', unitId: 'unt_fr_stage',
        title: 'Mon stage – Wortfeld an der Tafel', favorite: true,
        note: 'Ausgangspunkt für das Partnergespräch. Elemente lassen sich während der Stunde umsortieren.',
        items: scatter([
          ['lex', 'lex_fr_8', 0.22, 0.24, 1.25],
          ['lex', 'lex_fr_9', 0.58, 0.19],
          ['lex', 'lex_fr_10', 0.83, 0.3],
          ['lex', 'lex_fr_14', 0.18, 0.55],
          ['lex', 'lex_fr_15', 0.45, 0.47],
          ['lex', 'lex_fr_16', 0.75, 0.6],
          ['starter', 'sta_fr_0', 0.35, 0.79, 0.85],
          ['starter', 'sta_fr_3', 0.72, 0.86, 0.85]
        ])
      }),
      schema.makeBoard({
        id: 'brd_en_debate', subjectId: 'sub_en', groupId: 'grp_en10a', unitId: 'unt_en_social',
        title: 'Social media – arguments on the board',
        showTranslation: true,
        items: scatter([
          ['lex', 'lex_en_12', 0.24, 0.26],
          ['lex', 'lex_en_13', 0.6, 0.22],
          ['lex', 'lex_en_14', 0.82, 0.44],
          ['lex', 'lex_en_15', 0.3, 0.55],
          ['lex', 'lex_en_16', 0.58, 0.66]
        ])
      })
    ];

    /* --- Ausgangslage der Oberfläche -------------------------------------- */
    // Ein frischer Bestand startet in der einfachen Grundform. Die
    // vollständige Ansicht ist einen Klick in der Kopfzeile entfernt.
    state.settings.simpleMode = true;
    state.ui.subjectId = 'sub_fr';
    state.ui.groupId = 'grp_fr9b';
    state.ui.recentBanks = ['bnk_fr_stage', 'bnk_en_debate', 'bnk_fr_photo'];
    state.ui.recentGroups = ['grp_fr9b', 'grp_en10a'];
    state.meta.seededAt = util.nowISO();
    return state;
  }

  BAO.seed = { fill: fill };
})(window.BAO = window.BAO || {});
