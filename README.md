# AquaDock CRM v3.0.0

For internal Sales & Marketing activities only.
Let's go bro.

## Vollständiges CRM-System

### Features:

✅ **Kontaktverwaltung**

- Vollständige Kontaktdaten (2 Ansprechpartner)
- Status-Tracking (Lead → Gewonnen)
- Kundentypen & Firmentypen

✅ **Timeline & Aktivitäten**

- Notizen, Anrufe, Emails, Meetings
- Chronologische Übersicht

✅ **Aufgaben & Reminders**

- Prioritäten, Fälligkeitsdaten
- Globale Aufgaben-Übersicht
- Kalender-Ansicht

✅ **CSV Import/Export**

- UTF-8 Support
- Fehlerbehandlung

---

## 🚀 Installation (Windows)

```bash
# 1. Python-Pakete installieren
pip install flask flask-cors

# 2. Server starten
Windows: START-CRM.bat
Mac/Linux: ./START-CRM.sh

# 3. Browser öffnen
http://localhost:5000
```

---

## 📁 Projekt-Struktur (old before refactoring)

```
aquadock-crm/
├── app.py              # Backend
├── templates/index.html # Frontend
├── static/
│   ├── app.js         # JavaScript
│   └── style.css      # CSS
└── START-CRM.bat/sh   # Start-Scripts
```



WICHTIG:
--------
- Server muss laufen bleiben (CMD/Terminal-Fenster)
- Datenbank wird beim ersten Start automatisch erstellt
- Logo muss in static/ Ordner sein

Bei Problemen:
--------------
1. Python installiert? → python --version
2. Pakete installiert? → pip list | grep flask
3. Port 5000 frei? → Andere Programme beenden

