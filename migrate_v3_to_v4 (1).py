"""
AquaDock CRM - Migration v3.0.3 → v4.0 (FIXED v2)
Robust gegen teilweise migrierte Datenbanken.
"""

import sqlite3
import os
import shutil
from datetime import datetime

SOURCE_DB = 'aquadock_crm.db'
BACKUP_DB = f'aquadock_crm_BACKUP_{datetime.now().strftime("%Y%m%d_%H%M%S")}.db'

def get_columns(cursor, table):
    cursor.execute(f"PRAGMA table_info({table})")
    return [row[1] for row in cursor.fetchall()]

def migrate():
    print("=" * 60)
    print("🔄 AquaDock CRM Migration v3.0.3 → v4.0 (FIXED)")
    print("=" * 60)

    if not os.path.exists(SOURCE_DB):
        print(f"❌ Datenbank '{SOURCE_DB}' nicht gefunden!")
        return False

    # Backup erstellen
    shutil.copy2(SOURCE_DB, BACKUP_DB)
    print(f"✅ Backup erstellt: {BACKUP_DB}")

    conn = sqlite3.connect(SOURCE_DB)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = OFF")
    cursor = conn.cursor()

    # Tabellen ermitteln
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
    tables = [row[0] for row in cursor.fetchall()]
    print(f"📋 Tabellen: {', '.join(tables)}")

    # ── Schritt 1: Alte contacts-Daten lesen ──────────────────────
    # Prüfen ob alte contacts-Tabelle noch vorhanden (mit ap1_vorname Spalte)
    old_contacts_data = []

    if 'contacts' in tables:
        cols = get_columns(cursor, 'contacts')
        if 'ap1_vorname' in cols:
            # Altes v3 Schema → lesen
            cursor.execute("SELECT * FROM contacts")
            old_contacts_data = cursor.fetchall()
            print(f"📊 Alte Kontakte (v3): {len(old_contacts_data)}")
        elif 'contacts_v3_backup' in tables:
            # Bereits teilweise migriert → aus Backup lesen
            cursor.execute("SELECT * FROM contacts_v3_backup")
            old_contacts_data = cursor.fetchall()
            print(f"📊 Alte Kontakte (aus Backup): {len(old_contacts_data)}")
        else:
            print("ℹ️  Keine alten v3-Kontakte gefunden.")
    elif 'contacts_v3_backup' in tables:
        cursor.execute("SELECT * FROM contacts_v3_backup")
        old_contacts_data = cursor.fetchall()
        print(f"📊 Alte Kontakte (aus Backup): {len(old_contacts_data)}")

    if not old_contacts_data:
        print("❌ Keine zu migrierenden Daten gefunden.")
        conn.close()
        return False

    answer = input("\nTrotzdem fortfahren? (ja/nein): ").strip().lower()
    if answer != 'ja':
        print("❌ Abgebrochen.")
        conn.close()
        return False

    # ── Schritt 2: Alles aufräumen ─────────────────────────────────
    print("\n🧹 Bereinige alte Tabellen...")

    # Alte Tabellen droppen die neu erstellt werden
    for tbl in ['timeline', 'reminders', 'companies', 'contacts_new']:
        try:
            cursor.execute(f"DROP TABLE IF EXISTS {tbl}")
        except:
            pass

    # Alte contacts umbenennen falls noch nicht passiert
    if 'contacts' in tables:
        cols = get_columns(cursor, 'contacts')
        if 'ap1_vorname' in cols:
            cursor.execute("DROP TABLE IF EXISTS contacts_v3_backup")
            cursor.execute("ALTER TABLE contacts RENAME TO contacts_v3_backup")

    # ── Schritt 3: Neue Tabellen anlegen ──────────────────────────
    print("🏗️  Erstelle neue Tabellen...")

    cursor.execute('''
        CREATE TABLE companies (
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
        CREATE TABLE contacts (
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

    cursor.execute('''
        CREATE TABLE timeline (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            company_id INTEGER NOT NULL,
            activity_type TEXT NOT NULL,
            title TEXT NOT NULL,
            content TEXT,
            user_name TEXT DEFAULT 'System',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE
        )
    ''')

    cursor.execute('''
        CREATE TABLE reminders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            company_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            description TEXT,
            due_date TEXT NOT NULL,
            priority TEXT DEFAULT 'normal',
            status TEXT DEFAULT 'open',
            assigned_to TEXT DEFAULT 'Ich',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            completed_at TIMESTAMP,
            FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE
        )
    ''')

    # ── Schritt 4: Daten migrieren ─────────────────────────────────
    print("\n🔄 Migriere Daten...")

    id_map = {}  # alte contact.id → neue company.id
    migrated_companies = 0
    migrated_contacts = 0
    errors = []

    for old in old_contacts_data:
        try:
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

            # AP1 → Hauptkontakt
            if old['ap1_vorname'] or old['ap1_nachname']:
                cursor.execute('''
                    INSERT INTO contacts (
                        company_id, vorname, nachname, position,
                        email, telefon, mobil, durchwahl, is_primary, created_at
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

            # AP2 → zweiter Kontakt (falls vorhanden)
            if old['ap2_vorname'] or old['ap2_nachname']:
                cursor.execute('''
                    INSERT INTO contacts (
                        company_id, vorname, nachname, position,
                        email, telefon, mobil, durchwahl, is_primary, created_at
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
            errors.append(f"ID {old['id']} ({old['firmenname']}): {str(e)}")

    # ── Schritt 5: Timeline migrieren ─────────────────────────────
    if 'timeline_v3_backup' in tables or any(
        'contact_id' in get_columns(cursor, t)
        for t in tables if t.startswith('timeline')
    ):
        pass  # bereits weggemigriert

    # Alte Timeline aus Backup falls vorhanden
    old_tl_table = None
    if 'timeline_v3_backup' in tables:
        old_tl_table = 'timeline_v3_backup'

    if old_tl_table:
        print("🔄 Migriere Timeline...")
        cursor.execute(f"SELECT * FROM {old_tl_table}")
        old_tl = cursor.fetchall()
        migrated_tl = 0
        for tl in old_tl:
            new_company_id = id_map.get(tl['contact_id'])
            if new_company_id:
                cursor.execute('''
                    INSERT INTO timeline (company_id, activity_type, title, content, user_name, created_at)
                    VALUES (?, ?, ?, ?, ?, ?)
                ''', (new_company_id, tl['activity_type'], tl['title'],
                      tl['content'] or '', tl['user_name'] or 'System', tl['created_at']))
                migrated_tl += 1
        print(f"   ✅ {migrated_tl} Timeline-Einträge migriert")

    # ── Schritt 6: Reminders migrieren ────────────────────────────
    old_rm_table = None
    if 'reminders_v3_backup' in tables:
        old_rm_table = 'reminders_v3_backup'
    elif 'reminders' in tables:
        cols = get_columns(cursor, 'reminders')
        if 'contact_id' in cols:
            old_rm_table = 'reminders'

    if old_rm_table and old_rm_table != 'reminders':
        print("🔄 Migriere Reminders...")
        cursor.execute(f"SELECT * FROM {old_rm_table}")
        old_rm = cursor.fetchall()
        migrated_rm = 0
        for rm in old_rm:
            new_company_id = id_map.get(rm['contact_id'])
            if new_company_id:
                cursor.execute('''
                    INSERT INTO reminders (
                        company_id, title, description, due_date,
                        priority, status, assigned_to, created_at, completed_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (
                    new_company_id, rm['title'], rm['description'] or '',
                    rm['due_date'], rm['priority'] or 'normal',
                    rm['status'] or 'open', rm['assigned_to'] or 'Ich',
                    rm['created_at'], rm['completed_at']
                ))
                migrated_rm += 1
        print(f"   ✅ {migrated_rm} Reminders migriert")

    conn.commit()
    conn.close()

    # Ergebnis
    print("\n" + "=" * 60)
    print("✅ Migration erfolgreich!")
    print(f"   🏢 {migrated_companies} Firmen erstellt")
    print(f"   👤 {migrated_contacts} Kontakte migriert")
    if errors:
        print(f"\n⚠️  {len(errors)} Fehler:")
        for err in errors[:10]:
            print(f"   - {err}")
    print(f"\n💾 Backup: {BACKUP_DB}")
    print("=" * 60)
    return True


if __name__ == '__main__':
    migrate()
