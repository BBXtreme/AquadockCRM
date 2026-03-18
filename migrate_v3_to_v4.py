"""
AquaDock CRM - Migration v3.0.3 → v4.0
Migriert bestehende Daten aus dem alten Schema (contacts-Tabelle mit Firmendaten)
in das neue Schema (companies + contacts getrennt)

Aufruf: python migrate_v3_to_v4.py
"""

import sqlite3
import os
import shutil
from datetime import datetime

SOURCE_DB = 'aquadock_crm.db'
BACKUP_DB = f'aquadock_crm_BACKUP_{datetime.now().strftime("%Y%m%d_%H%M%S")}.db'

def migrate():
    print("=" * 60)
    print("🔄 AquaDock CRM Migration v3.0.3 → v4.0")
    print("=" * 60)

    # Sicherheitsprüfung
    if not os.path.exists(SOURCE_DB):
        print(f"❌ Datenbank '{SOURCE_DB}' nicht gefunden!")
        print("   Bitte im richtigen Verzeichnis ausführen.")
        return False

    # Backup erstellen
    shutil.copy2(SOURCE_DB, BACKUP_DB)
    print(f"✅ Backup erstellt: {BACKUP_DB}")

    conn = sqlite3.connect(SOURCE_DB)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = OFF")
    cursor = conn.cursor()

    # Prüfen ob altes Schema vorhanden
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
    tables = [row[0] for row in cursor.fetchall()]
    print(f"📋 Gefundene Tabellen: {', '.join(tables)}")

    if 'contacts' not in tables:
        print("❌ Keine 'contacts' Tabelle gefunden - nichts zu migrieren.")
        conn.close()
        return False

    # Prüfen ob bereits neues Schema
    if 'companies' in tables:
        print("⚠️  'companies' Tabelle existiert bereits.")
        answer = input("   Trotzdem fortfahren? (ja/nein): ").strip().lower()
        if answer != 'ja':
            print("❌ Migration abgebrochen.")
            conn.close()
            return False

    # Alte Daten lesen
    cursor.execute("SELECT * FROM contacts")
    old_contacts = cursor.fetchall()
    print(f"\n📊 Alte Datensätze gefunden: {len(old_contacts)} Kontakte")

    # Neue Tabellen erstellen
    print("\n🏗️  Erstelle neue Tabellen...")

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS companies (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            firmenname TEXT NOT NULL,
            rechtsform TEXT,
            kundentyp TEXT NOT NULL DEFAULT 'sonstige',
            firmentyp TEXT,
            strasse TEXT,
            plz TEXT,
            stadt TEXT,
            bundesland TEXT,
            land TEXT DEFAULT 'Deutschland',
            website TEXT,
            status TEXT NOT NULL DEFAULT 'lead',
            value INTEGER DEFAULT 0,
            notes TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS contacts_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            company_id INTEGER,
            vorname TEXT NOT NULL,
            nachname TEXT NOT NULL,
            position TEXT,
            email TEXT,
            telefon TEXT,
            mobil TEXT,
            durchwahl TEXT,
            is_primary INTEGER DEFAULT 0,
            notes TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE SET NULL
        )
    ''')

    # Mapping: alte contact.id → neue company.id
    id_map = {}
    migrated_companies = 0
    migrated_contacts = 0
    errors = []

    print("\n🔄 Migriere Daten...")

    for old in old_contacts:
        try:
            # 1) Firma anlegen
            cursor.execute('''
                INSERT INTO companies (
                    firmenname, rechtsform, kundentyp, firmentyp,
                    strasse, plz, stadt, bundesland, land,
                    status, value, notes, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                old['firmenname'],
                old['rechtsform'] or '',
                old['kundentyp'] or 'sonstige',
                old['firmentyp'] or '',
                old['strasse'] or '',
                old['plz'] or '',
                old['stadt'] or '',
                old['bundesland'] or '',
                old['land'] or 'Deutschland',
                old['status'] or 'lead',
                old['value'] or 0,
                old['notes'] or '',
                old['created_at'],
                old['updated_at']
            ))
            company_id = cursor.lastrowid
            id_map[old['id']] = company_id
            migrated_companies += 1

            # 2) Hauptkontakt (AP1) anlegen
            if old['ap1_vorname'] or old['ap1_nachname']:
                cursor.execute('''
                    INSERT INTO contacts_new (
                        company_id, vorname, nachname, position,
                        email, telefon, mobil, durchwahl,
                        is_primary, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
                ''', (
                    company_id,
                    old['ap1_vorname'] or '',
                    old['ap1_nachname'] or '',
                    old['ap1_position'] or '',
                    old['ap1_email'] or '',
                    old['ap1_telefon'] or '',
                    old['ap1_mobil'] or '',
                    old['ap1_durchwahl'] or '',
                    old['created_at']
                ))
                migrated_contacts += 1

            # 3) Zweiter Kontakt (AP2) anlegen falls vorhanden
            if old['ap2_vorname'] or old['ap2_nachname']:
                cursor.execute('''
                    INSERT INTO contacts_new (
                        company_id, vorname, nachname, position,
                        email, telefon, mobil, durchwahl,
                        is_primary, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
                ''', (
                    company_id,
                    old['ap2_vorname'] or '',
                    old['ap2_nachname'] or '',
                    old['ap2_position'] or '',
                    old['ap2_email'] or '',
                    old['ap2_telefon'] or '',
                    old['ap2_mobil'] or '',
                    old['ap2_durchwahl'] or '',
                    old['created_at']
                ))
                migrated_contacts += 1

        except Exception as e:
            errors.append(f"Zeile {old['id']} ({old['firmenname']}): {str(e)}")

    # Timeline migrieren (contact_id → company_id)
    if 'timeline' in tables:
        print("🔄 Migriere Timeline...")
        cursor.execute("SELECT * FROM timeline")
        old_timeline = cursor.fetchall()
        migrated_tl = 0
        for tl in old_timeline:
            new_company_id = id_map.get(tl['contact_id'])
            if new_company_id:
                cursor.execute('''
                    INSERT INTO timeline (company_id, activity_type, title, content, user_name, created_at)
                    VALUES (?, ?, ?, ?, ?, ?)
                ''', (
                    new_company_id,
                    tl['activity_type'],
                    tl['title'],
                    tl['content'] or '',
                    tl['user_name'] or 'System',
                    tl['created_at']
                ))
                migrated_tl += 1
        print(f"   ✅ {migrated_tl} Timeline-Einträge migriert")

    # Reminders migrieren (contact_id → company_id)
    if 'reminders' in tables:
        print("🔄 Migriere Reminders...")
        cursor.execute("SELECT * FROM reminders")
        old_reminders = cursor.fetchall()
        migrated_rm = 0
        for rm in old_reminders:
            new_company_id = id_map.get(rm['contact_id'])
            if new_company_id:
                cursor.execute('''
                    INSERT INTO reminders (
                        company_id, title, description, due_date,
                        priority, status, assigned_to, created_at, completed_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (
                    new_company_id,
                    rm['title'],
                    rm['description'] or '',
                    rm['due_date'],
                    rm['priority'] or 'normal',
                    rm['status'] or 'open',
                    rm['assigned_to'] or 'Ich',
                    rm['created_at'],
                    rm['completed_at']
                ))
                migrated_rm += 1
        print(f"   ✅ {migrated_rm} Reminders migriert")

    # Alte contacts-Tabelle umbenennen und neue aktivieren
    cursor.execute("ALTER TABLE contacts RENAME TO contacts_v3_backup")
    cursor.execute("ALTER TABLE contacts_new RENAME TO contacts")

    conn.commit()
    conn.close()

    # Ergebnis
    print("\n" + "=" * 60)
    print("✅ Migration erfolgreich abgeschlossen!")
    print(f"   🏢 {migrated_companies} Firmen erstellt")
    print(f"   👤 {migrated_contacts} Kontakte migriert")
    if errors:
        print(f"\n⚠️  {len(errors)} Fehler aufgetreten:")
        for err in errors:
            print(f"   - {err}")
    print(f"\n💾 Original-Daten gesichert als: {BACKUP_DB}")
    print(f"   Alte contacts-Tabelle: contacts_v3_backup (kann später gelöscht werden)")
    print("=" * 60)
    return True


if __name__ == '__main__':
    migrate()
