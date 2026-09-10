/* ==========================================================================
   Durchlauf der wichtigsten Bedienabläufe in einem echten Browser.
   Voraussetzung: Playwright ist verfügbar (npm i -D playwright oder global).
   Aufruf:  node tests/e2e.mjs
   Die App wird als Datei geöffnet (file://) – genau so, wie sie im Unterricht
   gestartet wird.
   ========================================================================== */
import { createRequire } from 'node:module';
import { mkdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const appUrl = pathToFileURL(join(root, 'app', 'index.html')).href;
const distUrl = pathToFileURL(join(root, 'dist', 'boite-a-oublis.html')).href;
const shotDir = join(root, 'tests', 'output');

function loadPlaywright() {
  const candidates = [
    'playwright',
    '/opt/node22/lib/node_modules/playwright',
    '/usr/lib/node_modules/playwright',
    '/usr/local/lib/node_modules/playwright'
  ];
  for (const name of candidates) {
    try { return require(name); } catch { /* nächster Versuch */ }
  }
  return null;
}

const playwright = loadPlaywright();
if (!playwright) {
  console.error('Playwright wurde nicht gefunden. Installation: npm install -D playwright');
  process.exit(2);
}

let passed = 0;
let failed = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition) {
    passed += 1;
    console.log('  ok   ' + name);
  } else {
    failed += 1;
    failures.push(name + (detail ? ' – ' + detail : ''));
    console.log('  FEHL ' + name + (detail ? ' – ' + detail : ''));
  }
}

function section(title) { console.log('\n' + title); }

const consoleErrors = [];

async function run() {
  await mkdir(shotDir, { recursive: true });
  const browser = await playwright.chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1600, height: 950 },
    acceptDownloads: true
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => consoleErrors.push('pageerror: ' + error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push('console: ' + message.text());
  });

  await page.goto(appUrl);
  await page.waitForFunction(() => window.BAO && window.BAO.store && window.BAO.store.getState());

  /* --- 1. Start und Beispieldaten ---------------------------------------- */
  section('1. Start, Beispieldaten und lokale Speicherung');
  const boot = await page.evaluate(() => {
    const state = BAO.store.getState();
    let storage = 'blockiert';
    try { localStorage.setItem('bao.probe', '1'); localStorage.removeItem('bao.probe'); storage = 'ok'; } catch (e) { /* egal */ }
    return {
      storage,
      subjects: state.subjects.map((s) => s.name),
      groups: state.groups.map((g) => g.name),
      lexemes: state.lexemes.length,
      starters: state.starters.length,
      banks: state.banks.length,
      units: state.units.length,
      version: BAO.schema.APP_VERSION
    };
  });
  check('lokale Speicherung verfügbar (file://)', boot.storage === 'ok', boot.storage);
  check('Französisch und Englisch getrennt vorhanden',
    boot.subjects.includes('Französisch') && boot.subjects.includes('Englisch'), boot.subjects.join(', '));
  check('zwei Lerngruppen als Beispiel', boot.groups.length === 2, boot.groups.join(', '));
  check('Wortschatz vorhanden', boot.lexemes >= 40, String(boot.lexemes));
  check('Satzanfänge vorhanden', boot.starters >= 40, String(boot.starters));
  check('Wortbanken vorhanden', boot.banks >= 4, String(boot.banks));
  check('Unterrichtsreihen vorhanden', boot.units >= 4, String(boot.units));
  check('Versionsnummer in der Fußzeile',
    (await page.textContent('.appfoot')).includes(boot.version));
  check('Urheberhinweis in der Fußzeile', (await page.textContent('.appfoot')).includes('Florian Nowak'));

  /* --- 2. Fachwechsel ----------------------------------------------------- */
  section('2. Fächer und Lerngruppen getrennt verwalten');
  await page.evaluate(() => BAO.app.setContext('sub_en', 'grp_en10a'));
  await page.waitForTimeout(120);
  let scoped = await page.evaluate(() => {
    const state = BAO.store.getState();
    const ctx = BAO.select.context(state);
    return {
      subject: ctx.subject.name,
      group: ctx.group.name,
      lexemes: BAO.select.lexemesOfGroup(state, ctx.group.id).length,
      foreign: BAO.select.lexemesOfGroup(state, ctx.group.id).filter((l) => l.subjectId !== 'sub_en').length
    };
  });
  check('Kontextwechsel auf Englisch', scoped.subject === 'Englisch' && scoped.group === '10a');
  check('Wortschatz ist je Lerngruppe getrennt', scoped.foreign === 0 && scoped.lexemes >= 15,
    scoped.lexemes + ' Einträge, ' + scoped.foreign + ' fremd');

  await page.evaluate(() => BAO.app.setContext('sub_fr', 'grp_fr9b'));
  await page.waitForTimeout(120);

  /* --- 3. Lerngruppe und Reihe anlegen ------------------------------------ */
  section('3. Lerngruppe, Unterrichtsreihe und Einträge anlegen');
  const created = await page.evaluate(() => {
    let groupId = '';
    let unitId = '';
    BAO.store.commit('Test: Lerngruppe', (draft) => {
      const group = BAO.schema.makeGroup({ subjectId: 'sub_fr', name: '7c', grade: 7, schoolYear: '2025/26' });
      draft.groups.push(group);
      groupId = group.id;
      const unit = BAO.schema.makeUnit({ groupId: group.id, title: 'Salut, ça va ?', schoolYear: '2025/26', status: 'current' });
      draft.units.push(unit);
      unitId = unit.id;
    });
    return { groupId, unitId };
  });
  check('neue Lerngruppe angelegt', !!created.groupId);
  check('neue Unterrichtsreihe angelegt', !!created.unitId);

  // Wortschatzeintrag über die Oberfläche
  await page.evaluate(() => { BAO.app.setContext('sub_fr', 'grp_fr9b'); BAO.app.go('wortschatz'); });
  await page.waitForTimeout(200);
  await page.click('button:has-text("Neuer Eintrag")');
  await page.waitForSelector('.modal');
  await page.fill('.modal input >> nth=0', 'le CV');
  await page.click('.modal button:text-is("Speichern")');
  await page.waitForTimeout(250);
  check('Eintrag über das Formular gespeichert',
    await page.evaluate(() => BAO.store.getState().lexemes.some((l) => l.term === 'le CV')));

  // Mehrere Zeilen einfügen
  await page.click('button:has-text("Mehrere Zeilen einfügen")');
  await page.waitForSelector('.modal textarea');
  await page.fill('.modal textarea', 'le contrat = der Vertrag\nla formation – die Ausbildung\nle bilan; die Bilanz; faire le bilan');
  await page.click('.modal button:has-text("Einträge anlegen")');
  await page.waitForTimeout(250);
  const bulk = await page.evaluate(() => {
    const terms = BAO.store.getState().lexemes.map((l) => l.term);
    return ['le contrat', 'la formation', 'le bilan'].every((t) => terms.includes(t));
  });
  check('mehrere Zeilen auf einmal eingefügt', bulk);

  // Satzanfang über die Oberfläche, mit frei benannter Verwendung
  await page.evaluate(() => BAO.app.go('satzanfaenge'));
  await page.waitForTimeout(250);
  await page.click('button:has-text("Neuer Satzanfang")');
  await page.waitForSelector('.modal');
  await page.fill('.modal input >> nth=0', 'Es könnte sein, dass ');
  await page.click('.modal button:has-text("Leerstelle einfügen")');
  await page.waitForTimeout(120);
  check('Leerstelle wird per Knopf eingefügt',
    (await page.inputValue('.modal input >> nth=0')) === 'Es könnte sein, dass ___',
    await page.inputValue('.modal input >> nth=0'));
  check('Vorschau zeigt die Leerstelle als Linie',
    await page.evaluate(() => document.querySelectorAll('.modal .starter__text .gap').length === 1));

  await page.fill('.modal input[list]', 'eine Vermutung äußern');
  await page.click('.modal button:text-is("Speichern")');
  await page.waitForTimeout(300);
  const freeFunction = await page.evaluate(() => {
    const state = BAO.store.getState();
    const starter = state.starters.filter((s) => s.text.indexOf('Es könnte sein') === 0)[0];
    const fn = starter ? state.functions.filter((f) => f.id === starter.functionId)[0] : null;
    return { saved: !!starter, label: fn ? fn.label : '', count: state.functions.length };
  });
  check('Satzanfang mit frei benannter Verwendung gespeichert',
    freeFunction.saved && freeFunction.label === 'eine Vermutung äußern', JSON.stringify(freeFunction));
  check('die neue Verwendung steht jetzt im Bestand', freeFunction.count === 13, String(freeFunction.count));
  check('der neue Satzanfang erscheint unter seiner Verwendung',
    await page.evaluate(() => Array.prototype.some.call(
      document.querySelectorAll('.func-group__head h3'), (h) => h.textContent === 'eine Vermutung äußern')));

  const gapForms = await page.evaluate(() => {
    const count = (text) => {
      const wrap = document.createElement('div');
      wrap.appendChild(BAO.ui.gapText(text, document));
      return wrap.querySelectorAll('.gap').length;
    };
    return { unterstriche: count('A ___ B'), punkte: count('A ... B'), auslassung: count('A \u2026 B') };
  });
  check('Unterstriche, drei Punkte und Auslassungszeichen gelten als Leerstelle',
    gapForms.unterstriche === 1 && gapForms.punkte === 1 && gapForms.auslassung === 1,
    JSON.stringify(gapForms));

  // Satzanfang anlegen
  const starterCreated = await page.evaluate(() => {
    const before = BAO.store.getState().starters.length;
    BAO.store.commit('Test: Satzanfang', (draft) => {
      draft.starters.push(BAO.schema.makeStarter({
        subjectId: 'sub_fr', groupId: 'grp_fr9b', functionId: 'fn_opinion',
        text: 'Je dirais que ___, mais ___.', translation: 'Ich würde sagen, dass …, aber …',
        variant: 'anspruchsvoll'
      }));
    });
    return BAO.store.getState().starters.length === before + 1;
  });
  check('Satzanfang mit Leerstellen angelegt', starterCreated);

  /* --- 3b. IPA-Tastatur ---------------------------------------------------- */
  section('3b. Virtuelle IPA-Tastatur');
  await page.evaluate(() => {
    BAO.app.setContext('sub_fr', 'grp_fr9b');
    const lex = BAO.store.getState().lexemes.filter((l) => l.term === 'stage')[0];
    BAO.views.vocab.openEditor(lex);
  });
  await page.waitForSelector('.modal .ipa-field');
  check('Tastatur ist zunächst eingeklappt',
    (await page.isVisible('.modal .ipa-board')) === false);

  await page.fill('.modal .ipa-field input', '');
  await page.click('.modal .ipa-field input');
  await page.waitForTimeout(500);
  check('Klick ins Aussprachefeld öffnet die Tastatur', await page.isVisible('.modal .ipa-board'));
  check('Sprache des Fachs ist vorgewählt',
    (await page.textContent('.modal .ipa-board__tabs .btn[aria-selected="true"]')) === 'Französisch');

  await page.click('.modal .ipa-key[aria-label^="[ ]"]');
  await page.click('.modal .ipa-key[aria-label^="ʁ"]');
  await page.click('.modal .ipa-key[aria-label^="ɛ̃"]');
  await page.waitForTimeout(150);
  check('Zeichen landen zwischen den Klammern',
    (await page.inputValue('.modal .ipa-field input')) === '[ʁɛ̃]',
    await page.inputValue('.modal .ipa-field input'));

  await page.click('.modal .ipa-board__tabs .btn:has-text("Englisch")');
  await page.waitForTimeout(150);
  const englishKeys = await page.evaluate(() =>
    Array.prototype.map.call(document.querySelectorAll('.modal .ipa-key'), (k) => k.textContent));
  check('Englische Zeichen vorhanden (θ, ð, ŋ, æ, Diphthonge)',
    ['θ', 'ð', 'ŋ', 'æ', 'eɪ', 'ɜː'].every((k) => englishKeys.includes(k)));
  await page.click('.modal .ipa-board__tabs .btn:has-text("Spanisch")');
  await page.waitForTimeout(150);
  const spanishKeys = await page.evaluate(() =>
    Array.prototype.map.call(document.querySelectorAll('.modal .ipa-key'), (k) => k.textContent));
  check('Spanische Zeichen vorhanden (β, ɣ, ʎ, ɾ, x)',
    ['β', 'ɣ', 'ʎ', 'ɾ', 'x'].every((k) => spanishKeys.includes(k)));

  await page.click('.modal button:has-text("Löschen")');
  await page.waitForTimeout(120);
  check('Löschen nimmt ein ganzes Zeichen samt Kombinationszeichen zurück',
    (await page.inputValue('.modal .ipa-field input')) === '[ʁ]',
    await page.inputValue('.modal .ipa-field input'));

  await page.click('.modal .ipa-field input');
  await page.waitForTimeout(200);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  check('Esc schließt zuerst die Tastatur, nicht den Dialog',
    (await page.isVisible('.modal .ipa-board')) === false && (await page.isVisible('.modal')) === true);

  await page.fill('.modal .ipa-field input', '[ʁɛ̃]');
  await page.click('.modal button:text-is("Änderungen übernehmen")');
  await page.waitForTimeout(250);
  check('Lautschrift wird gespeichert',
    await page.evaluate(() => {
      const lex = BAO.store.getState().lexemes.filter((l) => l.term === 'stage')[0];
      return lex && lex.pronunciation === '[ʁɛ̃]';
    }));
  await page.screenshot({ path: join(shotDir, 'ipa-tastatur.png') });

  // Ursprünglichen Wert zurückschreiben, damit die Projektion später stimmt.
  await page.evaluate(() => BAO.store.commit('Test: Lautschrift zurück', (draft) => {
    const lex = draft.lexemes.filter((l) => l.term === 'stage')[0];
    if (lex) lex.pronunciation = '[sta\u0292]';
  }));

  /* --- 4. Wortbank zusammenstellen ---------------------------------------- */
  section('4. Wortbank zusammenstellen');
  const bankId = await page.evaluate(() => {
    let id = '';
    BAO.store.commit('Test: Wortbank', (draft) => {
      const bank = BAO.schema.makeBank({
        subjectId: 'sub_fr', groupId: 'grp_fr9b', title: 'Testbank Bewerbung', scene: 'Rollenspiel', defaultLevel: 2,
        sections: [
          BAO.schema.makeSection({ title: 'Wortschatz', items: [] }),
          BAO.schema.makeSection({ title: 'Redemittel', layout: 'starters', items: [] })
        ]
      });
      const lexemes = draft.lexemes.filter((l) => l.groupId === 'grp_fr9b').slice(0, 9);
      bank.sections[0].items = lexemes.map((l) => BAO.schema.makeBankItem({ kind: 'lex', refId: l.id }));
      const starters = draft.starters.filter((s) => s.groupId === 'grp_fr9b').slice(0, 6);
      bank.sections[1].items = starters.map((s) => BAO.schema.makeBankItem({ kind: 'starter', refId: s.id }));
      draft.banks.push(bank);
      id = bank.id;
    });
    return id;
  });
  check('Wortbank mit zwei Abschnitten angelegt', !!bankId);

  // Duplizieren über die Oberfläche
  await page.evaluate((id) => BAO.app.go('wortbank/' + id), bankId);
  await page.waitForTimeout(250);
  await page.click('button:has-text("Duplizieren")');
  await page.waitForTimeout(250);
  check('Wortbank dupliziert',
    await page.evaluate(() => BAO.store.getState().banks.some((b) => b.title.includes('(Kopie)'))));

  // Reihenfolge per Ziehen ändern
  await page.evaluate((id) => BAO.app.go('wortbank/' + id), bankId);
  await page.waitForTimeout(300);
  const orderBefore = await page.evaluate((id) =>
    BAO.select.bank(BAO.store.getState(), id).sections[0].items.map((i) => i.refId), bankId);
  await page.locator('.bsection .bitem').first().dragTo(page.locator('.bsection .bitem').nth(3));
  await page.waitForTimeout(300);
  const orderAfter = await page.evaluate((id) =>
    BAO.select.bank(BAO.store.getState(), id).sections[0].items.map((i) => i.refId), bankId);
  check('Reihenfolge per Ziehen und Ablegen geändert',
    orderBefore.join() !== orderAfter.join() && orderBefore.length === orderAfter.length,
    orderBefore.slice(0, 4).join(',') + ' → ' + orderAfter.slice(0, 4).join(','));

  // Eintrag aus dem Bestand hinzufügen
  const addedByClick = await page.evaluate((id) => {
    const count = () => BAO.select.bankItemCount(BAO.select.bank(BAO.store.getState(), id));
    const before = count();
    const button = Array.prototype.find.call(document.querySelectorAll('.picker__item'),
      (b) => b.dataset.inBank === 'false');
    if (!button) return { error: 'kein hinzufügbarer Eintrag' };
    button.click();
    return { before, after: count() };
  }, bankId);
  check('Eintrag aus dem Bestand per Klick hinzugefügt',
    !addedByClick.error && addedByClick.after === addedByClick.before + 1, JSON.stringify(addedByClick));

  /* --- 5. Projektion ------------------------------------------------------ */
  section('5. Projektion, Unterstützungsstufen und Navigation');
  await page.evaluate((id) => { BAO.session.start(id, {}); BAO.app.go('projektion'); }, bankId);
  await page.waitForTimeout(400);
  await page.evaluate(() => { BAO.output.openOverlay(); BAO.session.renderAll({ reason: 'overlay-opened' }); });
  await page.waitForTimeout(400);

  check('Vollbildfläche geöffnet', await page.isVisible('.stage-overlay .bao-stage'));

  await page.evaluate(() => BAO.toast.show('Diese Meldung darf niemand sehen.'));
  await page.waitForTimeout(150);
  check('Kurzmeldungen erscheinen nicht auf der Projektionsfläche',
    (await page.isVisible('.toast')) === false);

  check('keine Bedienelemente in der Projektion',
    await page.evaluate(() => document.querySelectorAll('.stage-overlay button, .stage-overlay input').length === 0));
  const deckInfo = await page.evaluate(() => {
    const deck = BAO.session.getDeck();
    return { slides: deck.slides.length, sections: deck.sections.length };
  });
  check('Wortbank ergibt mindestens zwei Seiten', deckInfo.slides >= 2, JSON.stringify(deckInfo));

  const levels = {};
  for (const level of [1, 2, 3]) {
    await page.evaluate((l) => BAO.session.setLevel(l), level);
    await page.waitForTimeout(250);
    levels[level] = await page.evaluate(() => {
      const body = document.querySelector('.stage-overlay .stage__body');
      return {
        text: body.textContent.trim().length,
        lines: body.querySelectorAll('.pitem__line').length,
        layout: body.dataset.layout,
        overflow: body.scrollHeight > body.clientHeight + 1
      };
    });
    await page.screenshot({ path: join(shotDir, 'stufe-' + level + '.png') });
  }
  check('Stufe 1 zeigt nur Impulse', levels[1].lines === 0, JSON.stringify(levels[1]));
  check('Stufe 2 zeigt Chunks', levels[2].lines > 0 && levels[2].lines <= levels[3].lines);
  check('Stufe 3 zeigt mehr Hilfen als Stufe 2', levels[3].lines > levels[2].lines,
    levels[2].lines + ' vs. ' + levels[3].lines);
  check('keine Stufe läuft über den Bildschirm hinaus',
    !levels[1].overflow && !levels[2].overflow && !levels[3].overflow);

  // Einzelne Hilfe ausblenden
  const toggled = await page.evaluate(() => {
    BAO.session.setLevel(3);
    const before = document.querySelectorAll('.stage-overlay .pitem__de').length;
    BAO.session.setField('translation', false);
    const after = document.querySelectorAll('.stage-overlay .pitem__de').length;
    return { before, after };
  });
  check('einzelne Hilfe lässt sich gezielt ausblenden', toggled.after < toggled.before,
    JSON.stringify(toggled));
  await page.evaluate(() => BAO.session.setLevel(2));
  await page.waitForTimeout(200);

  // Manuell blättern
  const nav = await page.evaluate(async () => {
    BAO.session.goTo(0);
    const first = BAO.session.getState().index;
    BAO.session.next(false);
    const second = BAO.session.getState().index;
    BAO.session.prev();
    const back = BAO.session.getState().index;
    BAO.session.goTo(BAO.session.totalSlides() - 1);
    const atEnd = BAO.session.getState().index;
    const advancedPastEnd = BAO.session.next(false);
    return { first, second, back, atEnd, advancedPastEnd, total: BAO.session.totalSlides() };
  });
  check('manuelles Vor- und Zurückblättern', nav.second === 1 && nav.back === 0);
  check('kein Überspringen über das Ende hinaus', nav.advancedPastEnd === false && nav.atEnd === nav.total - 1);

  // Tastatursteuerung
  await page.evaluate(() => BAO.session.goTo(0));
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(120);
  check('Tastatur: Pfeil rechts blättert weiter',
    await page.evaluate(() => BAO.session.getState().index === 1));
  await page.keyboard.press('b');
  await page.waitForTimeout(120);
  check('Tastatur: B leert den Bildschirm',
    await page.evaluate(() => document.querySelector('.stage-overlay .bao-stage').dataset.blank === 'true'));
  await page.keyboard.press('b');
  await page.waitForTimeout(120);

  // Automatisches Weiterschalten
  const auto = await page.evaluate(async () => {
    BAO.session.goTo(0);
    BAO.session.setSeconds(5);
    const started = BAO.session.play();
    const playing = BAO.session.getState().auto.playing;
    BAO.session.pause();
    const paused = BAO.session.getState().auto.playing;
    return { started, playing, paused };
  });
  check('Automatik startet und pausiert', auto.started && auto.playing && auto.paused === false);

  const autoRun = await page.evaluate(() => new Promise((done) => {
    BAO.session.goTo(0);
    BAO.session.setSeconds(5);
    const startIndex = BAO.session.getState().index;
    BAO.session.play();
    // Intervall künstlich verkürzen, damit der Test nicht wartet.
    BAO.session.getState().auto.remaining = 0.3;
    setTimeout(() => {
      const result = { startIndex, nowIndex: BAO.session.getState().index };
      BAO.session.pause();
      done(result);
    }, 900);
  }));
  check('Automatik schaltet einen Abschnitt weiter', autoRun.nowIndex > autoRun.startIndex,
    JSON.stringify(autoRun));

  // Abschreibmodus
  const copyMode = await page.evaluate(() => {
    BAO.session.toggleCopyMode();
    const active = BAO.session.getState().copyMode;
    const blocked = BAO.session.play();
    BAO.session.toggleCopyMode();
    return { active, blocked };
  });
  check('Abschreibmodus hält die Automatik an', copyMode.active && copyMode.blocked === false);

  // Fokusmodus
  const focus = await page.evaluate(() => {
    const before = BAO.session.getDeck().sections.length;
    const sectionId = BAO.session.currentSlide().sectionId;
    BAO.session.toggleFocus(sectionId);
    const during = BAO.session.getDeck().sections.length;
    const flag = document.querySelector('.stage-overlay .bao-stage').dataset.focus;
    BAO.session.toggleFocus(sectionId);
    return { before, during, flag, after: BAO.session.getDeck().sections.length };
  });
  check('Fokusmodus zeigt nur einen Abschnitt',
    focus.during === 1 && focus.flag === 'true' && focus.after === focus.before, JSON.stringify(focus));

  // Live-Hilfe
  const live = await page.evaluate(() => {
    BAO.session.play();
    BAO.session.addLive({ type: 'starter', text: 'Autrement dit, ___.', translation: 'Anders gesagt …' });
    const paused = BAO.session.getState().auto.playing === false;
    const slide = BAO.session.currentSlide();
    const visible = document.querySelector('.stage-overlay .pitem--live') !== null;
    return { paused, visible, section: slide ? slide.sectionId : '', count: BAO.session.getState().live.length };
  });
  check('Live-Hilfe erscheint sofort', live.visible && live.count === 1, JSON.stringify(live));
  check('Live-Hilfe pausiert die Automatik', live.paused);
  await page.screenshot({ path: join(shotDir, 'live-hilfe.png') });

  const liveSaved = await page.evaluate(() => {
    const item = BAO.session.getState().live[0];
    const before = BAO.store.getState().starters.length;
    BAO.store.commit('Test: Live gespeichert', (draft) => {
      draft.starters.push(BAO.schema.makeStarter({
        subjectId: 'sub_fr', groupId: 'grp_fr9b', text: item.text, translation: item.translation
      }));
    });
    BAO.session.removeLive(item.id);
    return { added: BAO.store.getState().starters.length === before + 1, remaining: BAO.session.getState().live.length };
  });
  check('Live-Hilfe lässt sich dauerhaft speichern', liveSaved.added && liveSaved.remaining === 0);

  /* --- 6. Beamerfenster --------------------------------------------------- */
  section('6. Eigenes Beamerfenster');
  const [beamer] = await Promise.all([
    context.waitForEvent('page').catch(() => null),
    page.evaluate(() => BAO.output.openWindow())
  ]);
  if (beamer) {
    await beamer.waitForTimeout(400);
    await page.evaluate(() => BAO.session.renderAll({ reason: 'window-opened' }));
    await beamer.waitForTimeout(300);
    const mirrored = await beamer.evaluate(() => {
      const stage = document.querySelector('.bao-stage');
      return {
        exists: !!stage,
        styled: !!document.getElementById('bao-stage-style'),
        title: (document.querySelector('.stage__title') || {}).textContent || '',
        items: document.querySelectorAll('.pitem').length
      };
    });
    check('Beamerfenster zeigt die Bühne', mirrored.exists && mirrored.items > 0, JSON.stringify(mirrored));
    check('Beamerfenster ist eigenständig formatiert', mirrored.styled);
    await beamer.screenshot({ path: join(shotDir, 'beamerfenster.png') });

    await page.evaluate(() => BAO.session.goTo(0));
    await beamer.waitForTimeout(250);
    const synced = await beamer.evaluate(() => (document.querySelector('.stage__pos') || {}).textContent || '');
    check('Beamerfenster folgt der Steuerung', synced.trim().startsWith('1'), synced);
    await page.evaluate(() => BAO.output.closeWindow());
    await page.waitForTimeout(200);
    check('Beamerfenster lässt sich schließen',
      await page.evaluate(() => BAO.output.isWindowOpen() === false));
  } else {
    check('Beamerfenster konnte geöffnet werden', false, 'kein zweites Fenster erhalten');
  }

  /* --- 7. Verschiedene Fenstergrößen -------------------------------------- */
  section('7. Projektion bei verschiedenen Auflösungen');
  const sizes = [[1920, 1080], [1366, 768], [1280, 800], [1024, 640], [800, 600]];
  for (const [width, height] of sizes) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(250);
    await page.evaluate(() => BAO.session.renderAll({ reason: 'resize' }));
    await page.waitForTimeout(200);
    const report = await page.evaluate(() => {
      const deck = BAO.session.getDeck();
      const body = document.querySelector('.stage-overlay .stage__body');
      const results = [];
      for (let i = 0; i < deck.slides.length; i++) {
        BAO.session.goTo(i);
        results.push(body.scrollHeight > body.clientHeight + 1);
      }
      BAO.session.goTo(0);
      const term = document.querySelector('.stage-overlay .pitem__term, .stage-overlay .pitem__starter');
      return {
        slides: deck.slides.length,
        overflow: results.some(Boolean),
        fontSize: term ? parseFloat(getComputedStyle(term).fontSize) : 0
      };
    });
    check(width + '×' + height + ': nichts wird abgeschnitten', !report.overflow,
      report.slides + ' Seiten');
    check(width + '×' + height + ': Schrift bleibt groß genug',
      report.fontSize >= Math.min(20, height / 34), Math.round(report.fontSize) + ' px');
    await page.screenshot({ path: join(shotDir, 'projektion-' + width + 'x' + height + '.png') });
  }
  await page.setViewportSize({ width: 1600, height: 950 });
  await page.evaluate(() => { BAO.output.closeOverlay(); BAO.session.renderAll({ reason: 'overlay-closed' }); });

  /* --- 8. Schuljahreswechsel ---------------------------------------------- */
  section('8. Lerngruppe ins nächste Schuljahr übernehmen');
  const before = await page.evaluate(() => {
    const state = BAO.store.getState();
    const group = BAO.select.group(state, 'grp_fr9b');
    return {
      grade: group.grade,
      year: group.schoolYear,
      lexemes: BAO.select.lexemesOfGroup(state, 'grp_fr9b').length,
      history: (group.history || []).length,
      counts: BAO.select.statusCounts(state, 'grp_fr9b'),
      openUnits: BAO.select.unitsOfGroup(state, 'grp_fr9b').filter((u) => u.status === 'current').length
    };
  });

  // Über die Oberfläche, damit genau der Weg getestet wird, den die Lehrkraft geht.
  await page.evaluate(() => BAO.app.go('verwaltung'));
  await page.waitForTimeout(250);
  await page.click('.grp:has(.grp__name:text-is("9b")) button:has-text("Ins nächste Schuljahr")');
  await page.waitForSelector('.modal');
  await page.screenshot({ path: join(shotDir, 'schuljahreswechsel.png') });
  await page.click('.modal button:has-text("Übernehmen")');
  await page.waitForTimeout(350);

  const after = await page.evaluate(() => {
    const state = BAO.store.getState();
    const group = BAO.select.group(state, 'grp_fr9b');
    return {
      grade: group.grade,
      year: group.schoolYear,
      lexemes: BAO.select.lexemesOfGroup(state, 'grp_fr9b').length,
      history: (group.history || []).length,
      counts: BAO.select.statusCounts(state, 'grp_fr9b'),
      openUnits: BAO.select.unitsOfGroup(state, 'grp_fr9b').filter((u) => u.status === 'current').length
    };
  });

  check('Jahrgangsstufe erhöht', after.grade === before.grade + 1, before.grade + ' → ' + after.grade);
  check('Schuljahr fortgeschrieben', after.year !== before.year, before.year + ' → ' + after.year);
  check('Wortschatz wird nicht dupliziert', after.lexemes === before.lexemes,
    before.lexemes + ' → ' + after.lexemes);
  check('nichts bleibt auf „neu eingeführt“ stehen', after.counts.new === 0, JSON.stringify(after.counts));
  check('gesicherter und aufzufrischender Bestand wächst',
    after.counts.core + after.counts.revisit > before.counts.core + before.counts.revisit,
    JSON.stringify(before.counts) + ' → ' + JSON.stringify(after.counts));
  check('Einträge der letzten Reihe stehen auf „wieder aufgreifen“', after.counts.revisit > 0);
  check('laufende Reihen wurden abgeschlossen', after.openUnits === 0, String(after.openUnits));
  check('Verlauf festgehalten', after.history === before.history + 1);

  /* --- 9. Rückgängig ------------------------------------------------------ */
  section('9. Rückgängig machen');
  const undo = await page.evaluate(() => {
    const grade = () => BAO.select.group(BAO.store.getState(), 'grp_fr9b').grade;
    const start = grade();
    BAO.store.undo();
    const undone = grade();
    BAO.store.redo();
    const redone = grade();
    return { start, undone, redone };
  });
  check('Rückgängig stellt den vorherigen Stand her', undo.undone === undo.start - 1, JSON.stringify(undo));
  check('Wiederherstellen funktioniert', undo.redone === undo.start);

  /* --- 10. Export und Import ---------------------------------------------- */
  section('10. Export, Import und Zusammenführen');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.evaluate(() => BAO.backup.exportToFile(BAO.store.getState()))
  ]);
  const exportPath = join(shotDir, 'export.json');
  await download.saveAs(exportPath);
  const exported = JSON.parse(await readFile(exportPath, 'utf8'));
  check('Export erzeugt eine Sicherungsdatei', exported.kind === 'boite-a-oublis.backup');
  check('Export enthält alle Bereiche',
    exported.data.lexemes.length > 0 && exported.data.banks.length > 0 && exported.data.starters.length > 0);

  const importResult = await page.evaluate(async (payload) => {
    // Bestand absichtlich verkleinern, danach aus der Sicherung wiederherstellen.
    BAO.store.commit('Test: Bestand geleert', (draft) => {
      draft.lexemes = draft.lexemes.slice(0, 3);
      draft.banks = [];
    });
    const reduced = BAO.store.getState().lexemes.length;
    const analysis = BAO.backup.analyse(payload, BAO.store.getState());
    if (!analysis.ok) return { error: analysis.errors.join('; ') };

    const merged = BAO.backup.merge(BAO.store.getState(), analysis.incoming);
    BAO.store.replaceState(merged.state, 'Test: zusammengeführt');
    const afterMerge = BAO.store.getState().lexemes.length;

    BAO.store.replaceState(analysis.incoming, 'Test: wiederhergestellt');
    const afterRestore = BAO.store.getState().lexemes.length;
    return { reduced, afterMerge, afterRestore, banks: BAO.store.getState().banks.length };
  }, await readFile(exportPath, 'utf8'));
  check('Import wird geprüft und angenommen', !importResult.error, importResult.error);
  check('Zusammenführen ergänzt fehlende Einträge',
    importResult.afterMerge > importResult.reduced, JSON.stringify(importResult));
  check('Wiederherstellen setzt den vollen Bestand zurück',
    importResult.afterRestore === exported.data.lexemes.length && importResult.banks === exported.data.banks.length,
    JSON.stringify(importResult));

  const badImport = await page.evaluate(() => {
    const before = BAO.store.getState().lexemes.length;
    const a = BAO.backup.analyse('{"foo":1}', BAO.store.getState());
    const b = BAO.backup.analyse('kein json', BAO.store.getState());
    return { rejectedA: a.ok === false, rejectedB: b.ok === false, unchanged: BAO.store.getState().lexemes.length === before };
  });
  check('fremde Dateien werden abgelehnt', badImport.rejectedA && badImport.rejectedB);
  check('abgelehnter Import verändert nichts', badImport.unchanged);

  // Import über die Oberfläche (Prüfdialog mit drei Möglichkeiten)
  await page.evaluate(() => BAO.app.go('daten'));
  await page.waitForTimeout(250);
  await page.evaluate((payload) => {
    const file = new File([payload], 'sicherung.json', { type: 'application/json' });
    BAO.views.data.handleBackupFile(file);
  }, await readFile(exportPath, 'utf8'));
  await page.waitForSelector('.modal');
  const dialogText = await page.textContent('.modal');
  check('Import-Dialog zeigt einen Vergleich', dialogText.includes('Wortschatzeinträge'));
  check('Import-Dialog bietet Wiederherstellen, Zusammenführen und Abbrechen',
    dialogText.includes('Zusammenführen') && dialogText.includes('Wiederherstellen') && dialogText.includes('Abbrechen'));
  await page.screenshot({ path: join(shotDir, 'import-dialog.png') });
  await page.click('.modal button:has-text("Abbrechen")');
  await page.waitForTimeout(200);
  check('Abbrechen lässt den Bestand unangetastet',
    await page.evaluate(() => document.querySelector('.modal') === null));

  // Live-Hilfe über die Kopfzeile
  await page.evaluate(() => { BAO.session.start('', {}); BAO.app.openLiveHelp(); });
  await page.waitForSelector('.modal input');
  await page.fill('.modal input >> nth=0', 'Ça dépend de ___.');
  await page.click('.modal button:has-text("Einblenden")');
  await page.waitForTimeout(300);
  check('Live-Hilfe aus der Kopfzeile landet in der Projektion',
    await page.evaluate(() => BAO.session.getState().live.length === 1
      && BAO.app.currentRoute().path === 'projektion'));
  await page.evaluate(() => { BAO.session.clearLive(); BAO.session.stop(); });

  /* --- 11. CSV ------------------------------------------------------------ */
  section('11. CSV-Import');
  const csv = await page.evaluate(() => {
    const text = 'Zielwort;Deutsch;Wortverbindung;Status\n'
      + 'le rendez-vous;der Termin;prendre un rendez-vous;neu\n'
      + 'la réunion;die Besprechung;participer à une réunion;aktiv\n';
    const parsed = BAO.csv.parse(text);
    const mapping = BAO.csv.guessMapping(parsed.rows[0]);
    const result = BAO.csv.toLexemes(parsed.rows.slice(1), mapping, {
      subjectId: 'sub_fr', groupId: 'grp_fr9b', status: 'new'
    }, []);
    return {
      delimiter: parsed.delimiter,
      mapped: Object.keys(mapping).sort(),
      entries: result.entries.map((e) => ({ term: e.term, translation: e.translation, status: e.status }))
    };
  });
  check('CSV-Trennzeichen erkannt', csv.delimiter === ';');
  check('CSV-Spalten automatisch zugeordnet',
    ['status', 'term', 'translation'].every((f) => csv.mapped.includes(f)), csv.mapped.join(','));
  check('CSV-Zeilen werden zu Einträgen',
    csv.entries.length === 2 && csv.entries[0].term === 'le rendez-vous' && csv.entries[1].status === 'active',
    JSON.stringify(csv.entries));

  /* --- 12. Dauerhaftigkeit ------------------------------------------------ */
  section('12. Daten nach einem Neustart');
  const marker = 'Testwort ' + Date.now();
  await page.evaluate((term) => {
    BAO.store.commit('Test: Merkeintrag', (draft) => {
      draft.lexemes.push(BAO.schema.makeLexeme({ subjectId: 'sub_fr', groupId: 'grp_fr9b', term: term }));
    });
    BAO.store.flush();
  }, marker);
  await page.reload();
  await page.waitForFunction(() => window.BAO && window.BAO.store && window.BAO.store.getState());
  const persisted = await page.evaluate((term) => ({
    found: BAO.store.getState().lexemes.some((l) => l.term === term),
    total: BAO.store.getState().lexemes.length
  }), marker);
  check('Daten sind nach dem Neuladen noch da', persisted.found, JSON.stringify(persisted));

  /* --- 12b. Genusfarben der Artikel --------------------------------------- */
  section('12b. Artikel farbig nach Genus');
  const genusLogic = await page.evaluate(() => {
    const state = BAO.store.getState();
    const pick = (term) => state.lexemes.filter((l) => l.term === term)[0];
    return {
      stage: BAO.ui.genderOf(pick('stage')),              // le, m.
      entreprise: BAO.ui.genderOf(pick('entreprise')),    // l’, f.
      responsable: BAO.ui.genderOf(pick('responsable')),  // le / la
      horaires: BAO.ui.genderOf(pick('horaires')),        // les, m. pl.
      englisch: BAO.ui.genderOf(pick('social media')),    // ohne Artikel
      deutschDer: BAO.ui.genderOf({ article: 'der', term: 'Vertrag' }),
      deutschDie: BAO.ui.genderOf({ article: 'die', term: 'Bewerbung' }),
      deutschDas: BAO.ui.genderOf({ article: 'das', term: 'Praktikum' })
    };
  });
  check('maskulin am Artikel erkannt', genusLogic.stage === 'm', genusLogic.stage);
  check('feminin über den Formhinweis erkannt („l’“ + f.)', genusLogic.entreprise === 'f', genusLogic.entreprise);
  check('doppelte Form „le / la“ erkannt', genusLogic.responsable === 'mf', genusLogic.responsable);
  check('Plural greift auf den Formhinweis zurück', genusLogic.horaires === 'm', genusLogic.horaires);
  check('ohne Anhaltspunkt keine Farbe', genusLogic.englisch === '', genusLogic.englisch);
  check('deutsche Artikel der/die/das erkannt',
    genusLogic.deutschDer === 'm' && genusLogic.deutschDie === 'f' && genusLogic.deutschDas === 'n',
    JSON.stringify(genusLogic));

  await page.evaluate(() => {
    BAO.app.setContext('sub_fr', 'grp_fr9b');
    BAO.session.start('bnk_fr_stage', { level: 2 });
    BAO.app.go('projektion');
    BAO.output.openOverlay();
    BAO.session.renderAll({ reason: 'overlay-opened' });
  });
  await page.waitForTimeout(500);

  function rgb(value) {
    const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(value || '');
    return m ? { r: +m[1], g: +m[2], b: +m[3] } : null;
  }

  const stageColours = await page.evaluate(() => {
    const read = (gender) => {
      const el = document.querySelector('.stage-overlay .art__part[data-gender="' + gender + '"]');
      return el ? { text: el.textContent, color: getComputedStyle(el).color } : null;
    };
    return { m: read('m'), f: read('f'), plain: document.querySelectorAll('.stage-overlay .art__part:not([data-gender])').length };
  });
  const mColour = stageColours.m && rgb(stageColours.m.color);
  const fColour = stageColours.f && rgb(stageColours.f.color);
  check('maskuliner Artikel wird in der Projektion blau dargestellt',
    !!mColour && mColour.b > mColour.r + 40, JSON.stringify(stageColours.m));
  check('femininer Artikel wird in der Projektion rot dargestellt',
    !!fColour && fColour.r > fColour.b + 40, JSON.stringify(stageColours.f));
  await page.screenshot({ path: join(shotDir, 'genusfarben.png') });

  const darkColours = await page.evaluate(() => {
    BAO.session.setTheme('dark');
    const read = (gender) => {
      const el = document.querySelector('.stage-overlay .art__part[data-gender="' + gender + '"]');
      return el ? getComputedStyle(el).color : '';
    };
    const bg = getComputedStyle(document.querySelector('.stage-overlay .bao-stage')).backgroundColor;
    const result = { m: read('m'), f: read('f'), bg: bg };
    BAO.session.setTheme('light');
    return result;
  });
  const darkM = rgb(darkColours.m);
  const darkF = rgb(darkColours.f);
  check('auf dunklem Grund bleiben die Genusfarben hell genug',
    !!darkM && !!darkF && darkM.b > 180 && darkF.r > 180, JSON.stringify(darkColours));
  check('auch aufgehellt bleibt blau blau und rot rot',
    darkM.b > darkM.r + 40 && darkF.r > darkF.b + 40, JSON.stringify(darkColours));

  await page.evaluate(() => { BAO.output.closeOverlay(); BAO.app.go('wortschatz'); });
  await page.waitForTimeout(400);
  const listColours = await page.evaluate(() => {
    const read = (gender) => {
      const el = document.querySelector('.lex__term .art__part[data-gender="' + gender + '"]');
      return el ? getComputedStyle(el).color : '';
    };
    return { m: read('m'), f: read('f') };
  });
  const listM = rgb(listColours.m);
  const listF = rgb(listColours.f);
  check('gleiche Genusfarben in der Wortschatzliste',
    !!listM && !!listF && listM.b > listM.r + 40 && listF.r > listF.b + 40, JSON.stringify(listColours));

  /* --- 12c. Tafel ---------------------------------------------------------- */
  section('12c. Tafel: die einfache Grundform');
  await page.evaluate(() => { BAO.app.setContext('sub_fr', 'grp_fr9b'); BAO.app.go('tafeln'); });
  await page.waitForTimeout(300);
  check('Beispieltafel vorhanden', await page.evaluate(() => BAO.store.getState().boards.length >= 1),
    String(await page.evaluate(() => BAO.store.getState().boards.length)));

  await page.click('button:has-text("Neue Tafel")');
  await page.waitForSelector('.modal');
  await page.fill('.modal input >> nth=0', 'Prüftafel');
  await page.click('.modal button:text-is("Anlegen und öffnen")');
  await page.waitForTimeout(500);
  const boardId = await page.evaluate(() => BAO.board.getState().boardId);
  check('Tafel angelegt und geöffnet', !!boardId && await page.evaluate(() => BAO.board.isActive()));
  check('leere Tafel lädt zum Doppelklick ein',
    (await page.textContent('.stage-frame')).includes('Doppelklick'));

  // Anlegen unmittelbar auf der Fläche
  const frameBox = await page.locator('.stage-frame').boundingBox();
  await page.mouse.dblclick(frameBox.x + frameBox.width * 0.3, frameBox.y + frameBox.height * 0.3);
  await page.waitForTimeout(250);
  check('Doppelklick öffnet die Eingabe auf der Fläche',
    await page.locator('.stage-frame .bcomposer__input').count() === 1);
  await page.keyboard.type('la craie');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);

  // Ein ganzer Satz – dieselbe Bedienung, dieselbe Darstellung
  await page.mouse.dblclick(frameBox.x + frameBox.width * 0.62, frameBox.y + frameBox.height * 0.68);
  await page.waitForTimeout(250);
  await page.keyboard.type('Je voudrais expliquer que ___.');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);

  const boardCreated = await page.evaluate(() => {
    const state = BAO.store.getState();
    const board = BAO.select.board(state, BAO.board.getState().boardId);
    const word = state.lexemes.filter((l) => l.term === 'la craie')[0];
    const sentence = state.lexemes.filter((l) => l.term === 'Je voudrais expliquer que ___.')[0];
    const classes = BAO.util.$$('.stage-frame .bcard').map((n) => n.className);
    return {
      wordInStock: !!word,
      sentenceInStock: !!sentence,
      onBoard: board.items.length,
      sameGroup: !!word && word.groupId === board.groupId && word.subjectId === board.subjectId,
      classes: classes,
      gaps: document.querySelectorAll('.stage-frame .bcard .gap').length
    };
  });
  check('auf der Fläche angelegtes Wort steht im Bestand', boardCreated.wordInStock);
  check('ein ganzer Satz entsteht genauso', boardCreated.sentenceInStock);
  check('beide liegen auf der Tafel', boardCreated.onBoard === 2, String(boardCreated.onBoard));
  check('neues Element gehört der Lerngruppe des Fachs', boardCreated.sameGroup);
  check('Wort und Satz sind auf der Tafel dieselbe Art von Element',
    boardCreated.classes.length === 2 && boardCreated.classes.every((c) => c.trim() === 'bcard'),
    boardCreated.classes.join(' | '));
  check('Leerstellen werden auch auf der Tafel als Linie gezeigt', boardCreated.gaps === 1, String(boardCreated.gaps));

  // Verschieben in der Vorschau
  const firstCard = page.locator('.stage-frame .bcard').first();
  const cardId = await firstCard.getAttribute('data-item-id');
  const cardBox = await firstCard.boundingBox();
  const posBefore = await page.evaluate((id) => {
    const board = BAO.select.board(BAO.store.getState(), BAO.board.getState().boardId);
    return board.items.filter((i) => i.id === id)[0];
  }, cardId);
  await page.mouse.move(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(cardBox.x + cardBox.width / 2 + 150, cardBox.y + cardBox.height / 2 + 90, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(350);
  const posAfter = await page.evaluate((id) => {
    const board = BAO.select.board(BAO.store.getState(), BAO.board.getState().boardId);
    return board.items.filter((i) => i.id === id)[0];
  }, cardId);
  check('Ziehen verschiebt das Element dauerhaft',
    Math.abs(posAfter.x - posBefore.x) > 0.03 && Math.abs(posAfter.y - posBefore.y) > 0.03,
    JSON.stringify(posBefore) + ' -> ' + JSON.stringify(posAfter));
  check('die Position bleibt innerhalb der Fläche',
    posAfter.x >= 0 && posAfter.x <= 1 && posAfter.y >= 0 && posAfter.y <= 1, JSON.stringify(posAfter));

  // Verschieben und Anlegen im eigenen Beamerfenster
  const [boardBeamer] = await Promise.all([
    context.waitForEvent('page').catch(() => null),
    page.evaluate(() => BAO.output.openWindow())
  ]);
  if (boardBeamer) {
    await boardBeamer.setViewportSize({ width: 1280, height: 760 });
    await boardBeamer.waitForTimeout(500);
    check('Beamerfenster zeigt dieselbe Tafel',
      await boardBeamer.locator('.bcard').count() === 2,
      String(await boardBeamer.locator('.bcard').count()));

    const beamerCard = boardBeamer.locator('.bcard').first();
    const beamerId = await beamerCard.getAttribute('data-item-id');
    const beamerBox = await beamerCard.boundingBox();
    const beforeBeamer = await page.evaluate((id) => {
      const board = BAO.select.board(BAO.store.getState(), BAO.board.getState().boardId);
      return board.items.filter((i) => i.id === id)[0].x;
    }, beamerId);
    await boardBeamer.mouse.move(beamerBox.x + beamerBox.width / 2, beamerBox.y + beamerBox.height / 2);
    await boardBeamer.mouse.down();
    await boardBeamer.mouse.move(beamerBox.x + beamerBox.width / 2 - 220, beamerBox.y + beamerBox.height / 2 + 120, { steps: 10 });
    await boardBeamer.mouse.up();
    await page.waitForTimeout(400);
    const afterBeamer = await page.evaluate((id) => {
      const board = BAO.select.board(BAO.store.getState(), BAO.board.getState().boardId);
      return board.items.filter((i) => i.id === id)[0].x;
    }, beamerId);
    check('Ziehen funktioniert auch auf dem Beamerbild',
      Math.abs(afterBeamer - beforeBeamer) > 0.05, beforeBeamer + ' -> ' + afterBeamer);
    const mirroredLeft = await page.evaluate((id) => {
      const node = document.querySelector('.stage-frame .bcard[data-item-id="' + id + '"]');
      return node ? parseFloat(node.style.left) / 100 : -1;
    }, beamerId);
    check('die Vorschau folgt dem Beamerbild', Math.abs(mirroredLeft - afterBeamer) < 0.06,
      mirroredLeft + ' vs ' + afterBeamer);

    const stageBox = await boardBeamer.locator('.stage__body').boundingBox();
    await boardBeamer.mouse.dblclick(stageBox.x + stageBox.width * 0.82, stageBox.y + stageBox.height * 0.2);
    await boardBeamer.waitForTimeout(250);
    check('im Beamerfenster öffnet sich die Eingabe',
      await boardBeamer.locator('.bcomposer__input').count() === 1);
    await boardBeamer.keyboard.type('le tableau');
    await boardBeamer.keyboard.press('Enter');
    await page.waitForTimeout(400);
    check('unmittelbar am Beamer angelegtes Element steht im Bestand',
      await page.evaluate(() => BAO.store.getState().lexemes.some((l) => l.term === 'le tableau')));
    await boardBeamer.screenshot({ path: join(shotDir, 'tafel-beamer.png') });
    await page.evaluate(() => BAO.output.closeWindow());
    await page.waitForTimeout(250);
  } else {
    check('Beamerfenster für die Tafel konnte geöffnet werden', false, 'kein zweites Fenster erhalten');
  }

  // Später ergänzen: aus dem Text wird ein vollständiger Eintrag
  const enriched = await page.evaluate(() => {
    const state = BAO.store.getState();
    const lex = state.lexemes.filter((l) => l.term === 'la craie')[0];
    const bareBefore = BAO.select.isBareEntry(lex);
    BAO.store.commit('Prüfung: ergänzen', (draft) => {
      const target = BAO.select.lexeme(draft, lex.id);
      target.term = 'craie';
      target.article = 'la';
      target.translation = 'die Kreide';
      const board = BAO.select.board(draft, BAO.board.getState().boardId);
      board.showTranslation = true;
    });
    return { bareBefore: bareBefore, bareAfter: BAO.select.isBareEntry(BAO.select.lexeme(BAO.store.getState(), lex.id)) };
  });
  await page.waitForTimeout(350);
  check('ein nur getipptes Element gilt als „nur Text“', enriched.bareBefore && !enriched.bareAfter,
    JSON.stringify(enriched));
  const afterEnrich = await page.evaluate(() => ({
    article: (document.querySelector('.stage-frame .bcard .art__part[data-gender="f"]') || {}).textContent || '',
    german: BAO.util.$$('.stage-frame .bcard__de').map((n) => n.textContent)
  }));
  check('ergänzter Artikel erscheint farbig auf der Tafel', afterEnrich.article === 'la', afterEnrich.article);
  check('ergänzte Übersetzung lässt sich einblenden',
    afterEnrich.german.includes('die Kreide'), afterEnrich.german.join(' | '));

  // Vorhandene Satzanfänge liegen gleichberechtigt daneben
  const placed = await page.evaluate(() => {
    const state = BAO.store.getState();
    const starter = BAO.select.startersOfGroup(state, 'grp_fr9b', 'sub_fr')[0];
    BAO.board.place('starter', starter.id);
    return starter.id;
  });
  await page.waitForTimeout(350);
  check('ein vorhandener Satzanfang lässt sich auf die Tafel legen',
    await page.evaluate((id) => {
      const board = BAO.select.board(BAO.store.getState(), BAO.board.getState().boardId);
      return board.items.some((i) => i.kind === 'starter' && i.refId === id);
    }, placed));
  check('auch er ist auf der Fläche ein Element wie jedes andere',
    await page.evaluate(() => BAO.util.$$('.stage-frame .bcard')
      .every((n) => n.className.trim() === 'bcard')));

  // Tastatur: rücken, vergrößern, von der Tafel nehmen
  const keyboard = await page.evaluate(async (id) => {
    BAO.board.select(id);
    const board = () => BAO.select.board(BAO.store.getState(), BAO.board.getState().boardId);
    const item = () => board().items.filter((i) => i.id === id)[0];
    const startX = item().x;
    const startScale = item().scale;
    const fire = (key) => document.dispatchEvent(new KeyboardEvent('keydown', { key: key, bubbles: true, cancelable: true }));
    fire('ArrowRight');
    const afterMove = item().x;
    fire('+');
    const afterScale = item().scale;
    fire('Delete');
    return {
      moved: afterMove - startX,
      scaled: afterScale - startScale,
      stillOnBoard: !!item(),
      stillInStock: !!BAO.select.lexeme(BAO.store.getState(), (BAO.store.getState().lexemes.filter((l) => l.term === 'craie')[0] || {}).id)
    };
  }, cardId);
  check('Pfeiltaste rückt das ausgewählte Element', keyboard.moved > 0.005, String(keyboard.moved));
  check('Plustaste vergrößert es', keyboard.scaled > 0.05, String(keyboard.scaled));
  check('Entf nimmt es von der Tafel', !keyboard.stillOnBoard);
  check('der Eintrag selbst bleibt im Bestand', keyboard.stillInStock);

  // Ordnen
  const arranged = await page.evaluate(() => {
    BAO.board.arrange();
    const board = BAO.select.board(BAO.store.getState(), BAO.board.getState().boardId);
    return board.items.map((i) => [Math.round(i.x * 1000) / 1000, Math.round(i.y * 1000) / 1000]);
  });
  await page.waitForTimeout(250);
  check('„Ordnen“ verteilt die Elemente gleichmäßig',
    arranged.length > 1 && new Set(arranged.map((p) => p.join(','))).size === arranged.length,
    JSON.stringify(arranged));
  await page.screenshot({ path: join(shotDir, 'tafel.png') });

  // Eine Tafel gehört einer Lerngruppe – und damit einer Sprache
  await page.evaluate(() => {
    BAO.app.setContext('sub_fr', 'grp_fr9b');
    BAO.app.go('tafel/brd_en_debate');
  });
  await page.waitForTimeout(700);
  const aligned = await page.evaluate(() => {
    const state = BAO.store.getState();
    const context = BAO.select.context(state);
    const board = BAO.select.board(state, 'brd_en_debate');
    return {
      ctx: context.subject.id + '/' + context.group.id,
      board: board.subjectId + '/' + board.groupId
    };
  });
  check('eine geöffnete Tafel setzt den Arbeitskontext auf ihre Lerngruppe',
    aligned.ctx === aligned.board, JSON.stringify(aligned));
  const boardHead = await page.textContent('.view__title .sub');
  check('die Kopfzeile nennt Fach und Lerngruppe der Tafel',
    boardHead.includes('Englisch') && boardHead.includes('10a'), boardHead);

  await page.fill('.ctrl-card input[type="search"]', 'stage');
  await page.waitForTimeout(300);
  check('„Aus dem Bestand holen“ zeigt nur den Bestand dieser Lerngruppe',
    await page.evaluate(() => BAO.util.$$('.picker__item').length) === 0);

  check('ein Eintrag aus einer anderen Sprache lässt sich nicht auf die Tafel legen',
    await page.evaluate(() => {
      const count = () => BAO.select.board(BAO.store.getState(), 'brd_en_debate').items.length;
      const before = count();
      BAO.board.place('lex', 'lex_fr_8');
      return count() === before;
    }));

  // Was aus einem älteren Bestand doch fremd auf einer Tafel liegt, wird benannt
  await page.evaluate(() => {
    BAO.store.commit('Prüfung: fremdes Element', (draft) => {
      BAO.select.board(draft, 'brd_en_debate').items.push(
        BAO.schema.makeBoardItem({ kind: 'lex', refId: 'lex_fr_8', x: 0.5, y: 0.85 }));
    });
  });
  await page.waitForTimeout(450);
  check('ein fremdsprachiges Element wird in der Liste gekennzeichnet',
    await page.evaluate(() => BAO.util.$$('.belem .chip--warn').length) === 1,
    JSON.stringify(await page.evaluate(() => BAO.util.$$('.belem .chip--warn').map((n) => n.textContent))));

  // Der Wechsel der Lerngruppe oben verlässt eine Tafel, die nicht dazugehört
  await page.evaluate(() => BAO.app.setContext('sub_fr', 'grp_fr9b'));
  await page.waitForTimeout(700);
  check('ein Wechsel der Lerngruppe führt zurück zur Tafelübersicht',
    await page.evaluate(() => BAO.app.currentRoute().path === 'tafeln' && BAO.board.isActive() === false));

  // Anlegen mit ausdrücklicher Wahl von Fach und Lerngruppe
  await page.click('button:has-text("Neue Tafel")');
  await page.waitForSelector('.modal');
  const dialogLabels = await page.evaluate(() => BAO.util.$$('.modal .field > label').map((n) => n.textContent));
  check('beim Anlegen lassen sich Fach und Lerngruppe wählen',
    dialogLabels.some((l) => l.indexOf('Fach') === 0) && dialogLabels.some((l) => l.indexOf('Lerngruppe') === 0),
    dialogLabels.join(', '));
  await page.fill('.modal input >> nth=0', 'Tafel für Englisch');
  await page.selectOption('.modal select >> nth=0', 'sub_en');
  await page.waitForTimeout(250);
  check('der Fachwechsel füllt die Lerngruppen neu',
    await page.evaluate(() => BAO.util.$$('.modal select')[1].options[0].value) === 'grp_en10a');
  await page.click('.modal button:text-is("Anlegen und öffnen")');
  await page.waitForTimeout(700);
  const madeFor = await page.evaluate(() => {
    const state = BAO.store.getState();
    const board = BAO.select.board(state, BAO.board.getState().boardId);
    const context = BAO.select.context(state);
    return {
      board: board.subjectId + '/' + board.groupId,
      ctx: context.subject.id + '/' + context.group.id,
      title: board.title
    };
  });
  check('die neue Tafel gehört der gewählten Lerngruppe',
    madeFor.board === 'sub_en/grp_en10a' && madeFor.title === 'Tafel für Englisch', JSON.stringify(madeFor));
  check('der Arbeitskontext zieht mit', madeFor.ctx === madeFor.board, JSON.stringify(madeFor));

  await page.evaluate(() => { BAO.app.setContext('sub_fr', 'grp_fr9b'); BAO.app.go('tafeln'); });
  await page.waitForTimeout(400);

  // Einfache Grundform
  const modes = await page.evaluate(() => {
    const labels = () => BAO.util.$$('.rail__item .rail__label').map((n) => n.textContent);
    BAO.store.commit('Prüfung: Grundform', (d) => { d.settings.simpleMode = true; }, { undoable: false });
    BAO.app.renderView();
    const simple = labels();
    BAO.store.commit('Prüfung: vollständig', (d) => { d.settings.simpleMode = false; }, { undoable: false });
    BAO.app.renderView();
    return { simple: simple, full: labels() };
  });
  check('die einfache Grundform zeigt nur Tafeln, Elemente, Lerngruppen und Daten',
    modes.simple.includes('Tafeln') && modes.simple.includes('Elemente')
    && !modes.simple.includes('Wortbanken') && !modes.simple.includes('Satzanfänge'),
    modes.simple.join(', '));
  check('die vollständige Ansicht bringt alles zurück',
    modes.full.includes('Wortbanken') && modes.full.includes('Satzanfänge') && modes.full.includes('Tafeln'),
    modes.full.join(', '));

  // Eine Wortbank-Projektion löst die Tafel ab – es gibt nur eine Leinwand.
  await page.evaluate(() => BAO.session.start('bnk_fr_stage', { level: 2 }));
  await page.waitForTimeout(300);
  check('eine Wortbank-Projektion beendet die Tafel',
    await page.evaluate(() => BAO.board.isActive() === false && BAO.session.getState().active === true));

  /* --- 13. Alle Ansichten zeichnen sich fehlerfrei ------------------------ */
  section('13. Alle Ansichten');
  for (const route of ['start', 'tafeln', 'wortschatz', 'satzanfaenge', 'wortbanken', 'projektion', 'verwaltung', 'daten']) {
    await page.evaluate((r) => BAO.app.go(r), route);
    await page.waitForTimeout(220);
    const ok = await page.evaluate(() => {
      const view = document.querySelector('#view .view');
      return !!view && view.textContent.trim().length > 0
        && !view.textContent.includes('konnte nicht dargestellt werden');
    });
    check('Ansicht „' + route + '“ zeichnet sich', ok);
    await page.screenshot({ path: join(shotDir, 'ansicht-' + route + '.png') });
  }

  /* --- 14. Schnellsuche --------------------------------------------------- */
  section('14. Schnellsuche');
  await page.evaluate(() => BAO.app.openSearch());
  await page.waitForSelector('.palette__input');
  await page.fill('.palette__input', 'stage');
  await page.waitForTimeout(220);
  const hits = await page.evaluate(() => document.querySelectorAll('.palette__item').length);
  check('Schnellsuche liefert Treffer', hits > 0, String(hits));
  await page.keyboard.press('Escape');

  const foldSearch = await page.evaluate(() => {
    const results = BAO.search.global(BAO.store.getState(), 'experience', { limit: 10 });
    return results.some((r) => BAO.util.fold(r.title).includes('experience'));
  });
  check('Suche ist akzentunempfindlich („experience“ findet „l’expérience“)', foldSearch);

  /* --- 15. Portable Einzeldatei -------------------------------------------- */
  section('15. Portable Einzeldatei (dist/boite-a-oublis.html)');
  const portable = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const distPage = await portable.newPage();
  const distErrors = [];
  distPage.on('pageerror', (error) => distErrors.push('pageerror: ' + error.message));
  distPage.on('console', (message) => {
    if (message.type() === 'error') distErrors.push('console: ' + message.text());
  });
  await distPage.goto(distUrl);
  await distPage.waitForFunction(() => window.BAO && window.BAO.store && window.BAO.store.getState());

  // Der Einbettungsfehler machte aus util.$$ ein util.$ – seither liefert
  // util.$ eine Liste statt eines Elements und jedes Formular bricht ab.
  const helpers = await distPage.evaluate(() => {
    const one = BAO.util.$('.rail__item');
    const many = BAO.util.$$('.rail__item');
    return {
      singleIsElement: !!(one && one.tagName),
      manyIsArray: Array.isArray(many) && many.length > 1
    };
  });
  check('util.$ liefert in der Einzeldatei ein Element', helpers.singleIsElement, JSON.stringify(helpers));
  check('util.$$ liefert in der Einzeldatei eine Liste', helpers.manyIsArray, JSON.stringify(helpers));

  await distPage.evaluate(() => { BAO.app.setContext('sub_fr', 'grp_fr9b'); BAO.app.go('satzanfaenge'); });
  await distPage.waitForTimeout(300);
  await distPage.click('button:has-text("Neuer Satzanfang")');
  await distPage.waitForSelector('.modal', { timeout: 5000 });
  await distPage.fill('.modal input >> nth=0', 'Portable ___.');
  await distPage.click('.modal button:text-is("Speichern")');
  await distPage.waitForTimeout(300);
  check('Satzanfang lässt sich auch in der Einzeldatei anlegen',
    await distPage.evaluate(() => BAO.store.getState().starters.some((s) => s.text === 'Portable ___.')));

  await distPage.evaluate(() => { BAO.app.go('wortschatz'); });
  await distPage.waitForTimeout(300);
  await distPage.click('button:has-text("Neuer Eintrag")');
  await distPage.waitForSelector('.modal');
  await distPage.fill('.modal input >> nth=0', 'la portabilité');
  await distPage.click('.modal button:text-is("Speichern")');
  await distPage.waitForTimeout(300);
  check('Wortschatzeintrag lässt sich auch in der Einzeldatei anlegen',
    await distPage.evaluate(() => BAO.store.getState().lexemes.some((l) => l.term === 'la portabilité')));

  await distPage.evaluate(() => { BAO.app.go('tafel/brd_fr_stage'); });
  await distPage.waitForTimeout(500);
  const distFrame = await distPage.locator('.stage-frame').boundingBox();
  check('Tafel zeichnet sich auch in der Einzeldatei',
    await distPage.locator('.stage-frame .bcard').count() > 0);
  await distPage.mouse.dblclick(distFrame.x + distFrame.width * 0.5, distFrame.y + distFrame.height * 0.85);
  await distPage.waitForTimeout(250);
  await distPage.keyboard.type('le classeur');
  await distPage.keyboard.press('Enter');
  await distPage.waitForTimeout(350);
  check('Element lässt sich auch in der Einzeldatei auf der Fläche anlegen',
    await distPage.evaluate(() => BAO.store.getState().lexemes.some((l) => l.term === 'le classeur')));

  check('keine Fehler in der Einzeldatei', distErrors.length === 0, distErrors.slice(0, 3).join(' | '));
  await portable.close();

  /* --- Abschluss ---------------------------------------------------------- */
  await browser.close();

  section('Konsolenausgaben');
  check('keine Fehler in der Browserkonsole', consoleErrors.length === 0,
    consoleErrors.slice(0, 5).join(' | '));

  console.log('\n' + passed + ' Prüfungen bestanden, ' + failed + ' fehlgeschlagen.');
  if (failed) {
    console.log('\nFehlgeschlagen:');
    failures.forEach((f) => console.log('  - ' + f));
    process.exit(1);
  }
  console.log('Bildschirmfotos: tests/output/');
}

run().catch((error) => {
  console.error('\nTestlauf abgebrochen:', error);
  process.exit(1);
});
