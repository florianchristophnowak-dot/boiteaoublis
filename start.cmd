@echo off
rem ============================================================
rem  Boite a Oublis - lokal starten (Windows)
rem  Oeffnet die App im Standardbrowser. Kein Server noetig.
rem ============================================================
setlocal
set "HERE=%~dp0"

if exist "%HERE%dist\boite-a-oublis.html" (
  echo Starte Boite a Oublis ...
  start "" "%HERE%dist\boite-a-oublis.html"
  goto :ende
)

if exist "%HERE%app\index.html" (
  echo Portable Datei nicht gefunden - starte die Entwicklungsfassung.
  start "" "%HERE%app\index.html"
  goto :ende
)

echo Es wurde keine App-Datei gefunden.
echo Erwartet: dist\boite-a-oublis.html oder app\index.html
pause

:ende
endlocal
