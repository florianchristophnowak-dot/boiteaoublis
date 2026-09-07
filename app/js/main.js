/* ==========================================================================
   Start der Anwendung
   Läuft vollständig lokal: keine Netzwerkzugriffe, keine externen Ressourcen.
   ========================================================================== */
(function (BAO) {
  'use strict';

  function fail(message, error) {
    console.error(message, error);
    var host = document.getElementById('view');
    if (!host) return;
    host.innerHTML = '';
    var box = document.createElement('div');
    box.className = 'view';
    box.innerHTML = '<div class="empty"><div class="empty__title">Die App konnte nicht starten</div>'
      + '<p class="empty__text">' + BAO.util.escapeHtml(message) + '</p>'
      + '<p class="empty__text">' + BAO.util.escapeHtml(String(error && error.message ? error.message : error)) + '</p></div>';
    host.appendChild(box);
  }

  function boot() {
    try {
      BAO.app.start();
    } catch (error) {
      fail('Beim Start ist ein Fehler aufgetreten.', error);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window.BAO = window.BAO || {});
