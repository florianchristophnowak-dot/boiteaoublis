/* ==========================================================================
   Phasen-Timer – reine Rechenlogik
   Keine Uhr, keine Oberfläche: Jede Funktion bekommt den Stand und die
   aktuelle Zeit und gibt einen neuen Stand zurück. So lässt sich der Timer
   ohne Wartezeit prüfen und übersteht ein Neuladen der Seite – gespeichert
   wird nicht „noch 4 Minuten“, sondern der Zeitpunkt, an dem er endet.

   Stand:  { total, remaining, deadline, running, paused }
     total      Gesamtdauer in Sekunden (0 = kein Timer gesetzt)
     remaining  Rest in Sekunden, solange der Timer nicht läuft
     deadline   Zeitpunkt des Endes (Millisekunden seit 1970), solange er läuft
     running    die Uhr läuft
     paused     angehalten mit Rest

   Verhalten wie im Teacher Soundboard, aus dem der Timer stammt.
   ========================================================================== */
(function (BAO) {
  'use strict';

  var MIN_MINUTES = 1;
  var MAX_MINUTES = 999;

  function clampMinutes(value, fallback) {
    var parsed = parseInt(value, 10);
    if (!isFinite(parsed)) return fallback === undefined ? MIN_MINUTES : fallback;
    return Math.max(MIN_MINUTES, Math.min(MAX_MINUTES, parsed));
  }

  function empty() {
    return { total: 0, remaining: 0, deadline: 0, running: false, paused: false };
  }

  function finite(value) {
    var number = Number(value);
    return isFinite(number) ? number : 0;
  }

  /**
   * Macht aus beliebigen gespeicherten Daten einen gültigen Stand.
   * Ein Timer, der abgelaufen ist oder in der Zwischenzeit abgelaufen wäre,
   * gilt als gelöscht: Wer die App am nächsten Morgen öffnet, soll weder eine
   * rote Scheibe von gestern sehen noch ihr Signal hören.
   */
  function normalize(raw, now) {
    if (!raw || typeof raw !== 'object') return empty();
    var total = Math.max(0, finite(raw.total));
    if (total <= 0) return empty();
    total = Math.min(total, MAX_MINUTES * 60);
    if (raw.running === true) {
      var deadline = finite(raw.deadline);
      var rest = (deadline - now) / 1000;
      if (rest <= 0) return empty();
      // Eine verstellte Systemuhr soll keinen Timer erzeugen, der länger
      // läuft als seine Gesamtdauer.
      if (rest > total) deadline = now + total * 1000;
      return { total: total, remaining: Math.min(rest, total), deadline: deadline, running: true, paused: false };
    }
    var remaining = Math.min(finite(raw.remaining), total);
    if (remaining <= 0) return empty();
    return { total: total, remaining: remaining, deadline: 0, running: false, paused: true };
  }

  function hasValue(timer) { return timer.total > 0; }

  function remainingSeconds(timer, now) {
    if (timer.running) return Math.max(0, (timer.deadline - now) / 1000);
    return Math.max(0, timer.remaining);
  }

  /** Ist die Zeit um, während die Uhr noch läuft, hält dieser Schritt sie an. */
  function settle(timer, now) {
    if (timer.running && timer.deadline - now <= 0) {
      return { total: timer.total, remaining: 0, deadline: 0, running: false, paused: false };
    }
    return timer;
  }

  function start(minutes, now) {
    var total = clampMinutes(minutes) * 60;
    return { total: total, remaining: total, deadline: now + total * 1000, running: true, paused: false };
  }

  function pause(timer, now) {
    if (!timer.running) return timer;
    var rest = remainingSeconds(timer, now);
    return { total: timer.total, remaining: rest, deadline: 0, running: false, paused: rest > 0 };
  }

  function resume(timer, now) {
    if (!timer.paused || timer.remaining <= 0) return timer;
    return {
      total: timer.total, remaining: timer.remaining,
      deadline: now + timer.remaining * 1000, running: true, paused: false
    };
  }

  function togglePause(timer, now) {
    if (timer.running) return pause(timer, now);
    if (timer.paused) return resume(timer, now);
    return timer;
  }

  /** Beginnt mit der vollen Dauer von vorn. */
  function reset(timer, now) {
    if (timer.total <= 0) return timer;
    return {
      total: timer.total, remaining: timer.total,
      deadline: now + timer.total * 1000, running: true, paused: false
    };
  }

  /**
   * Verlängert oder verkürzt den Timer um ganze Minuten.
   * Ein laufender Timer läuft weiter, ein angehaltener bleibt angehalten.
   * Die Gesamtdauer wächst mit, damit der Kreisausschnitt nie über die
   * volle Scheibe hinausreicht.
   */
  function addMinutes(timer, minutes, now) {
    var seconds = Math.round(Number(minutes) || 0) * 60;
    if (timer.total <= 0) return seconds > 0 ? start(minutes, now) : timer;

    var wasRunning = timer.running;
    var rest = Math.max(0, remainingSeconds(timer, now) + seconds);
    var total = Math.max(rest, timer.total + seconds);
    if (rest <= 0) return { total: total, remaining: 0, deadline: 0, running: false, paused: false };
    if (wasRunning) return { total: total, remaining: rest, deadline: now + rest * 1000, running: true, paused: false };
    return { total: total, remaining: rest, deadline: 0, running: false, paused: true };
  }

  /** Aufgerundet: Bei 4:01 stehen noch „5 Minuten“ an. */
  function minutesOf(seconds) { return Math.max(0, Math.ceil(seconds / 60 - 1e-9)); }

  function remainingMinutes(timer, now) { return minutesOf(remainingSeconds(timer, now)); }
  function totalMinutes(timer) { return minutesOf(timer.total); }

  /** Anteil der verbleibenden Zeit, 1 = alles übrig, 0 = abgelaufen. */
  function progress(timer, now) {
    if (timer.total <= 0) return 0;
    return Math.max(0, Math.min(1, remainingSeconds(timer, now) / timer.total));
  }

  /** idle = kein Timer, running, paused, done = abgelaufen. */
  function phase(timer, now) {
    if (timer.total <= 0) return 'idle';
    if (remainingSeconds(timer, now) <= 0) return 'done';
    return timer.running ? 'running' : 'paused';
  }

  /** „4:05“ – für die Lehreransicht; auf der Leinwand stehen bewusst keine Ziffern. */
  function clock(seconds) {
    var whole = Math.max(0, Math.ceil(seconds - 1e-9));
    var minutes = Math.floor(whole / 60);
    var rest = whole % 60;
    return minutes + ':' + (rest < 10 ? '0' : '') + rest;
  }

  BAO.classroomTimer = {
    MIN_MINUTES: MIN_MINUTES,
    MAX_MINUTES: MAX_MINUTES,
    clampMinutes: clampMinutes,
    empty: empty,
    normalize: normalize,
    hasValue: hasValue,
    remainingSeconds: remainingSeconds,
    settle: settle,
    start: start,
    pause: pause,
    resume: resume,
    togglePause: togglePause,
    reset: reset,
    addMinutes: addMinutes,
    remainingMinutes: remainingMinutes,
    totalMinutes: totalMinutes,
    progress: progress,
    phase: phase,
    clock: clock
  };
})(window.BAO = window.BAO || {});
