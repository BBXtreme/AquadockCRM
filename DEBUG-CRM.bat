@echo off
title AquaDock CRM - Debug
color 0E

echo.
echo  ================================================
echo   AquaDock CRM v4.0 - DIAGNOSE
echo  ================================================
echo.

echo  [1] Prüfe Python...
python --version
if errorlevel 1 (
    echo  FEHLER: Python nicht gefunden!
    echo  Bitte installieren: https://www.python.org/downloads/
    goto END
)

echo.
echo  [2] Prüfe Flask...
python -c "import flask; print('Flask OK - Version:', flask.__version__)"
if errorlevel 1 (
    echo  Flask nicht installiert - installiere jetzt...
    pip install flask flask-cors
)

echo.
echo  [3] Prüfe ob app.py vorhanden...
if exist app.py (
    echo  app.py gefunden ✓
) else (
    echo  FEHLER: app.py nicht gefunden!
    echo  Aktueller Ordner:
    cd
    echo  Dateien in diesem Ordner:
    dir /b
    goto END
)

echo.
echo  [4] Starte CRM...
python app.py

:END
echo.
echo  ================================================
echo   Diagnose beendet. Druecke eine Taste...
echo  ================================================
pause
