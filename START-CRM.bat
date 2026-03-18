@echo off
setlocal enabledelayedexpansion
title AquaDock CRM v4.0
color 0B

echo.
echo  ================================================
echo   🌊  AquaDock CRM v4.0 wird gestartet...
echo  ================================================
echo.

:: Prüfen ob Python installiert ist
python --version >nul 2>&1
if errorlevel 1 (
    echo  ❌ Python nicht gefunden!
    echo     Bitte Python installieren: https://www.python.org
    echo.
    pause
    exit
)

:: Prüfen ob Flask installiert ist
python -c "import flask" >nul 2>&1
if errorlevel 1 (
    echo  📦 Flask wird installiert...
    pip install flask flask-cors
    echo.
)

:: Prüfen ob Datenbank migriert werden muss
if exist aquadock_crm.db (
    python -c "import sqlite3; conn=sqlite3.connect('aquadock_crm.db'); c=conn.cursor(); c.execute(\"SELECT name FROM sqlite_master WHERE type='table' AND name='companies'\"); print('ok' if c.fetchone() else 'migrate')" > _check.tmp 2>&1
    set /p DB_STATUS=<_check.tmp
    del _check.tmp
    
    if "!DB_STATUS!"=="migrate" (
        echo  ⚠️  Alte Datenbank (v3) erkannt!
        echo     Migration auf v4 wird gestartet...
        echo.
        python migrate_v3_to_v4.py
        echo.
    )
)

:: CRM starten
echo  ✅ Starte AquaDock CRM v4.0...
echo  📍 URL: http://localhost:5000
echo.
echo  Browser wird geöffnet...
echo  (Fenster nicht schließen solange CRM läuft!)
echo.

:: Browser nach 2 Sekunden öffnen
start /b cmd /c "timeout /t 2 >nul && start http://localhost:5000"

:: Flask starten
python app.py

echo.
echo  CRM wurde beendet.
pause
