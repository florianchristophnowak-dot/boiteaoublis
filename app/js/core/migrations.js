/* ==========================================================================
   Migrationen
   Jede Migration hebt den Datenbestand um genau eine Version an. Dadurch
   lassen sich alte Sicherungen auch nach Jahren noch einlesen.
   ========================================================================== */
(function (BAO) {
  'use strict';

  /**
   * Reihenfolge ist bindend: Index 0 führt von Datenversion 0 auf 1 usw.
   * Eine Migration bekommt den Zustand, verändert ihn und gibt ihn zurück.
   */
  var STEPS = [
    {
      to: 1,
      describe: 'Vorabversionen: fehlende Grundfelder ergänzen',
      run: function (state) {
        // Frühe Testdaten kannten weder Abschnitte in Wortbanken noch Verläufe.
        (state.banks || []).forEach(function (bank) {
          if (!Array.isArray(bank.sections)) {
            bank.sections = [{
              id: BAO.util.uid('sec'),
              title: 'Wortschatz',
              layout: 'auto',
              items: Array.isArray(bank.items) ? bank.items : []
            }];
            delete bank.items;
          }
          if (typeof bank.defaultLevel !== 'number') bank.defaultLevel = 2;
        });
        (state.groups || []).forEach(function (group) {
          if (!Array.isArray(group.history)) group.history = [];
        });
        return state;
      }
    },
    {
      to: 2,
      describe: 'Tafeln und einfacher Modus ergänzt',
      run: function (state) {
        if (!Array.isArray(state.boards)) state.boards = [];
        if (!state.settings) state.settings = {};
        // Ein bestehender Bestand behält die vollständige Oberfläche. Wer die
        // einfache Grundform sehen möchte, schaltet sie in der Kopfzeile um.
        if (typeof state.settings.simpleMode !== 'boolean') state.settings.simpleMode = false;
        return state;
      }
    }
  ];

  /**
   * Hebt den Zustand auf die aktuelle Datenversion.
   * @returns {{state: object, applied: string[], error: string|null}}
   */
  function migrate(state) {
    var applied = [];
    var target = BAO.schema.SCHEMA_VERSION;
    var version = typeof state.schemaVersion === 'number' ? state.schemaVersion : 0;

    if (version > target) {
      return { state: state, applied: applied, error: 'Datenversion ' + version + ' ist neuer als diese Programmversion.' };
    }

    STEPS.forEach(function (step) {
      if (version < step.to && step.to <= target) {
        try {
          state = step.run(state) || state;
          version = step.to;
          state.schemaVersion = version;
          applied.push('v' + step.to + ': ' + step.describe);
        } catch (err) {
          throw new Error('Migration auf Version ' + step.to + ' fehlgeschlagen: ' + err.message);
        }
      }
    });

    state.schemaVersion = target;
    return { state: state, applied: applied, error: null };
  }

  BAO.migrations = { migrate: migrate, STEPS: STEPS };
})(window.BAO = window.BAO || {});
