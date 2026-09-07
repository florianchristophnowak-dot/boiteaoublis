/* ==========================================================================
   Startansicht
   Der schnellste Weg in den Unterricht: zuletzt verwendete Wortbanken,
   Favoriten, der Bestand der aktuellen Lerngruppe und die wichtigsten
   Sofortaktionen.
   ========================================================================== */
(function (BAO) {
  'use strict';

  var util = BAO.util;
  var h = util.h;
  var ui = BAO.ui;
  var select = BAO.select;

  function greeting() {
    var hour = new Date().getHours();
    if (hour < 11) return 'Guten Morgen';
    if (hour < 17) return 'Guten Tag';
    return 'Guten Abend';
  }

  function bankTile(state, bank, app) {
    var group = select.group(state, bank.groupId);
    var subject = select.subject(state, bank.subjectId);
    var count = select.bankItemCount(bank);

    return h('div.tile', {
      style: ui.subjectVars(subject),
      onclick: function () { app.go('wortbank/' + bank.id); }
    },
      h('span.tile__accent'),
      h('div.tile__top', {},
        h('span.tile__title', { text: bank.title }),
        h('span.spacer'),
        ui.favButton(bank.favorite, function () {
          BAO.store.commit('Favorit geändert', function (draft) {
            var target = select.bank(draft, bank.id);
            if (target) target.favorite = !target.favorite;
          });
        })
      ),
      h('div.tile__meta', {
        text: [bank.scene, group ? group.name : '', count + ' ' + util.plural(count, 'Eintrag', 'Einträge')]
          .filter(Boolean).join(' · ')
      }),
      bank.lastUsedAt ? h('div.tile__meta', { text: 'zuletzt: ' + util.relativeDate(bank.lastUsedAt) }) : null,
      h('div.tile__foot', {},
        h('button.btn.btn--primary.btn--sm', {
          type: 'button',
          onclick: function (event) { event.stopPropagation(); app.projectBank(bank.id); }
        }, ui.icon('play', 15), 'Projizieren'),
        h('button.btn.btn--sm', {
          type: 'button', text: 'Bearbeiten',
          onclick: function (event) { event.stopPropagation(); app.go('wortbank/' + bank.id); }
        })
      )
    );
  }

  function statBlock(label, value, hint) {
    return h('div.stat', { title: hint || '' },
      h('span.stat__value', { text: String(value) }),
      h('span.stat__label', { text: label })
    );
  }

  function render(host, context) {
    var state = context.state;
    var ctx = context.ctx;
    var app = context.app;
    var view = h('div.view.dash');

    if (!state.subjects.length) {
      view.appendChild(ui.emptyState({
        title: 'Willkommen bei Boîte à Oublis',
        text: 'Lege zuerst ein Fach und eine Lerngruppe an. Danach kannst du Wortschatz sammeln, '
          + 'Wortbanken zusammenstellen und sie über den Beamer einblenden.',
        actionLabel: 'Fach und Lerngruppe anlegen',
        onAction: function () { app.go('verwaltung'); }
      }));
      host.appendChild(view);
      return;
    }

    var counts = ctx.group ? select.statusCounts(state, ctx.group.id) : { total: 0, new: 0, active: 0, revisit: 0, core: 0 };
    var banks = ctx.group ? select.banksOfGroup(state, ctx.group.id) : [];
    var starters = ctx.group && ctx.subject ? select.startersOfGroup(state, ctx.group.id, ctx.subject.id) : [];
    var recents = select.recentBanks(state, 6);
    var favourites = select.favouriteBanks(state);

    /* --- Kopfbereich ---------------------------------------------------- */
    var hero = h('div.dash__hero', { style: ui.subjectVars(ctx.subject) },
      h('div', { style: { flex: '1 1 340px', 'min-width': '0' } },
        h('h1', { text: greeting() + '.' }),
        h('p', {
          text: ctx.group
            ? 'Aktuell geöffnet: ' + ctx.subject.name + ' · ' + ctx.group.name + ' (Jahrgang ' + ctx.group.grade
              + ', ' + ctx.group.schoolYear + ')' + (ctx.unit ? ' – Reihe „' + ctx.unit.title + '“.' : '.')
            : 'Für dieses Fach ist noch keine Lerngruppe angelegt.'
        }),
        h('div.dash__heroActions', {},
          recents[0]
            ? h('button.btn.btn--primary', {
              type: 'button',
              onclick: function () { app.projectBank(recents[0].id); }
            }, ui.icon('play', 16), 'Weiter mit „' + recents[0].title + '“')
            : h('button.btn.btn--primary', {
              type: 'button', text: 'Erste Wortbank anlegen',
              onclick: function () { app.go('wortbanken'); }
            }),
          h('button.btn', {
            type: 'button', onclick: function () { app.openLiveHelp(); }
          }, ui.icon('plus', 16), 'Live-Hilfe'),
          h('button.btn', {
            type: 'button',
            title: 'Beamerfenster öffnen oder schließen (Strg + B)',
            onclick: function () {
              if (BAO.output.isWindowOpen()) {
                BAO.output.closeWindow();
                BAO.toast.show('Beamerfenster geschlossen.');
              } else {
                var result = BAO.output.openWindow();
                if (!result.ok) {
                  BAO.toast.error('Das Beamerfenster wurde vom Browser blockiert. '
                    + 'Bitte Pop-ups für diese Seite erlauben – oder den Vollbildmodus verwenden.');
                  BAO.output.openOverlay();
                } else {
                  BAO.toast.ok('Beamerfenster geöffnet. Auf den zweiten Bildschirm ziehen und dort F drücken.');
                  if (BAO.session.getState().active) BAO.session.renderAll({ reason: 'window-opened' });
                }
              }
            }
          }, ui.icon('beamer', 16), 'Beamerfenster')
        )
      ),
      h('div.dash__stats', {},
        statBlock('Wortschatz', counts.total, 'Einträge dieser Lerngruppe insgesamt'),
        statBlock('neu', counts.new, 'Einträge mit Status „neu eingeführt“'),
        statBlock('auffrischen', counts.revisit, 'Einträge, die wieder aufgegriffen werden sollen'),
        statBlock('Grundbestand', counts.core, 'gesicherter Wortschatz'),
        statBlock('Satzanfänge', starters.length),
        statBlock('Wortbanken', banks.length)
      )
    );
    view.appendChild(hero);

    /* --- Zuletzt verwendet ------------------------------------------------ */
    var recentSection = h('section.section', {},
      h('div.section__head', {},
        h('h2', { text: 'Zuletzt verwendet' }),
        h('span.spacer'),
        h('button.btn.btn--ghost.btn--sm', {
          type: 'button', text: 'Alle Wortbanken', onclick: function () { app.go('wortbanken'); }
        })
      )
    );
    if (recents.length) {
      var tiles = h('div.tiles');
      recents.forEach(function (bank) { tiles.appendChild(bankTile(state, bank, app)); });
      recentSection.appendChild(tiles);
    } else {
      recentSection.appendChild(ui.emptyState({
        title: 'Noch keine Wortbank geöffnet',
        text: 'Stelle aus deinem Wortschatz eine Wortbank für eine konkrete Unterrichtsphase zusammen.',
        actionLabel: 'Wortbank anlegen',
        onAction: function () { app.go('wortbanken'); }
      }));
    }
    view.appendChild(recentSection);

    /* --- Favoriten -------------------------------------------------------- */
    if (favourites.length) {
      var favSection = h('section.section', {},
        h('div.section__head', {}, h('h2', { text: 'Favoriten' }),
          h('span.sub', { text: 'für den schnellen Zugriff angeheftet' }))
      );
      var favTiles = h('div.tiles');
      favourites.forEach(function (bank) { favTiles.appendChild(bankTile(state, bank, app)); });
      favSection.appendChild(favTiles);
      view.appendChild(favSection);
    }

    /* --- Lerngruppen ------------------------------------------------------ */
    var groupSection = h('section.section', {},
      h('div.section__head', {},
        h('h2', { text: 'Lerngruppen' }),
        h('span.spacer'),
        h('button.btn.btn--ghost.btn--sm', {
          type: 'button', text: 'Verwalten', onclick: function () { app.go('verwaltung'); }
        })
      )
    );
    var groupTiles = h('div.tiles');
    state.subjects.forEach(function (subject) {
      select.groupsOfSubject(state, subject.id).forEach(function (group) {
        var groupCounts = select.statusCounts(state, group.id);
        var groupBanks = select.banksOfGroup(state, group.id).length;
        groupTiles.appendChild(h('div.tile', {
          style: ui.subjectVars(subject),
          onclick: function () { app.setContext(subject.id, group.id); app.go('wortschatz'); }
        },
          h('span.tile__accent'),
          h('div.tile__top', {},
            h('span.tile__title', { text: group.name }),
            h('span.chip.chip--subject', { style: ui.subjectVars(subject), text: subject.name }),
            h('span.spacer'),
            ui.favButton(group.favorite, function () {
              BAO.store.commit('Favorit geändert', function (draft) {
                var target = select.group(draft, group.id);
                if (target) target.favorite = !target.favorite;
              });
            })
          ),
          h('div.tile__meta', { text: 'Jahrgang ' + group.grade + ' · ' + group.schoolYear }),
          h('div.tile__foot', {},
            h('span.chip', { text: groupCounts.total + ' Wörter' }),
            groupCounts.revisit ? h('span.chip.chip--st-revisit', {}, h('i.dot'), groupCounts.revisit + ' auffrischen') : null,
            h('span.chip', { text: groupBanks + ' ' + util.plural(groupBanks, 'Wortbank', 'Wortbanken') })
          )
        ));
      });
    });
    groupTiles.appendChild(h('button.tile.tile--add', {
      type: 'button', onclick: function () { app.go('verwaltung'); }
    }, ui.icon('plus', 22), h('span', { text: 'Lerngruppe anlegen' })));
    groupSection.appendChild(groupTiles);
    view.appendChild(groupSection);

    host.appendChild(view);
  }

  BAO.views = BAO.views || {};
  BAO.views.dashboard = { render: render };
})(window.BAO = window.BAO || {});
