@echo off
rem ============================================================
rem  Boite a Oublis ueber einen lokalen Webserver starten.
rem  Nur noetig, wenn der Browser das Oeffnen als Datei einschraenkt.
rem  Voraussetzung: Node.js ist installiert.
rem ============================================================
setlocal
set "HERE=%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js wurde nicht gefunden.
  echo Bitte start.cmd verwenden - dafuer wird kein Node.js benoetigt.
  pause
  goto :ende
)
start "" http://localhost:8765/
node "%HERE%tools\serve.mjs" 8765
:ende
endlocal
