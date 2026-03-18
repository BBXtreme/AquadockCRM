"""
AquaDock CRM v4.0
Saubere Trennung: Firmen (companies) & Personen (contacts)
Timeline & Reminders hängen an der Firma
"""

from flask import Flask, request, jsonify, send_from_directory, render_template, Response
from flask_cors import CORS
import sqlite3
from datetime import datetime
import json
import os
import csv
from io import StringIO

app = Flask(__name__, static_folder='static', template_folder='templates')
app.config['SEND_FILE_MAX_AGE_DEFAULT'] = 0
CORS(app)

DATABASE = 'aquadock_crm.db'

def get_db():
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn

def local_now():
    """Aktuelle lokale Zeit als String für DB-Inserts"""
    from datetime import datetime
    return datetime.now().strftime('%Y-%m-%d %H:%M:%S')

def init_db():
    conn = get_db()
    cursor = conn.cursor()

    # === COMPANIES (Firmenstammdaten) ===
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
            telefon TEXT,
            email TEXT,
            -- AquaDock spezifisch
            wasserdistanz REAL,
            wassertyp TEXT,
            lat REAL,
            lon REAL,
            status TEXT NOT NULL DEFAULT 'lead',
            value INTEGER DEFAULT 0,
            notes TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # === CONTACTS (Personen - eigenständig, optional einer Firma zugeordnet) ===
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS contacts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            company_id INTEGER,
            vorname TEXT NOT NULL,
            nachname TEXT NOT NULL,
            position TEXT,
            email TEXT,
            telefon TEXT,
            email TEXT,
            mobil TEXT,
            durchwahl TEXT,
            is_primary INTEGER DEFAULT 0,
            notes TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE SET NULL
        )
    ''')

    # === TIMELINE (hängt an Firma) ===
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS timeline (
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

    # === REMINDERS (hängt an Firma) ===
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS reminders (
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

    # === EMAIL LOG ===
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS email_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            template_name TEXT,
            recipient_email TEXT NOT NULL,
            recipient_name TEXT,
            subject TEXT,
            status TEXT DEFAULT 'sent',
            error_msg TEXT,
            sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # === EMAIL TEMPLATES ===
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS email_templates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            subject TEXT NOT NULL,
            body TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # Performance-Indizes
    index_statements = [
        'CREATE INDEX IF NOT EXISTS idx_contacts_company_id ON contacts(company_id)',
        'CREATE INDEX IF NOT EXISTS idx_contacts_is_primary ON contacts(company_id, is_primary)',
        'CREATE INDEX IF NOT EXISTS idx_reminders_company_id ON reminders(company_id)',
        'CREATE INDEX IF NOT EXISTS idx_reminders_status ON reminders(status)',
        'CREATE INDEX IF NOT EXISTS idx_companies_status ON companies(status)',
        'CREATE INDEX IF NOT EXISTS idx_companies_kundentyp ON companies(kundentyp)',
        'CREATE INDEX IF NOT EXISTS idx_companies_land ON companies(land)',
    ]
    for stmt in index_statements:
        try:
            cursor.execute(stmt)
        except:
            pass

    # Neue Spalten nachrüsten falls DB bereits existiert (v4.2 → v4.3)
    new_columns = [
        ('telefon', 'TEXT'),
        ('email', 'TEXT'),
        ('anrede', 'TEXT'),
        ('wasserdistanz', 'REAL'),
        ('wassertyp', 'TEXT'),
        ('lat', 'REAL'),
        ('lon', 'REAL'),
    ]
    for col_name, col_type in new_columns:
        try:
            cursor.execute(f'ALTER TABLE companies ADD COLUMN {col_name} {col_type}')
        except:
            pass  # Spalte existiert bereits

    # OSM + import_batch Felder nachrüsten
    for col in [('osm', 'TEXT'), ('import_batch', 'TEXT')]:
        try:
            cursor.execute(f'ALTER TABLE companies ADD COLUMN {col[0]} {col[1]}')
        except:
            pass

    # Neue Spalten in contacts nachrüsten
    contacts_columns = [
        ('anrede', 'TEXT'),
    ]
    for col_name, col_type in contacts_columns:
        try:
            cursor.execute(f'ALTER TABLE contacts ADD COLUMN {col_name} {col_type}')
        except:
            pass  # Spalte existiert bereits

    conn.commit()
    conn.close()
    print("✅ Datenbank v4.3 initialisiert")


# ==================== SMTP EINSTELLUNGEN ====================
import json, smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

SMTP_CONFIG_FILE = os.path.join(os.path.dirname(__file__), 'smtp_config.json')

def load_smtp_config():
    if os.path.exists(SMTP_CONFIG_FILE):
        with open(SMTP_CONFIG_FILE, 'r') as f:
            return json.load(f)
    return {}

def save_smtp_config(cfg):
    with open(SMTP_CONFIG_FILE, 'w') as f:
        json.dump(cfg, f, indent=2)

@app.route('/api/settings/smtp', methods=['GET'])
def get_smtp():
    cfg = load_smtp_config()
    # Passwort nicht zurücksenden
    safe = {k: v for k, v in cfg.items() if k != 'password'}
    safe['configured'] = bool(cfg.get('host') and cfg.get('user') and cfg.get('password'))
    return jsonify({'success': True, 'smtp': safe})

@app.route('/api/settings/smtp', methods=['POST'])
def save_smtp():
    try:
        data = request.get_json()
        cfg = load_smtp_config()
        cfg['host']     = data.get('host', '').strip()
        cfg['port']     = int(data.get('port', 587))
        cfg['user']     = data.get('user', '').strip()
        cfg['name']     = data.get('name', '').strip()
        if data.get('password'):
            cfg['password'] = data['password']
        save_smtp_config(cfg)
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/settings/smtp/test', methods=['POST'])
def test_smtp():
    try:
        data = request.get_json()
        to_email = data.get('to_email', '').strip()
        if not to_email:
            return jsonify({'success': False, 'error': 'Bitte Ziel-E-Mail angeben'}), 400

        cfg = load_smtp_config()
        if not cfg.get('host') or not cfg.get('user') or not cfg.get('password'):
            return jsonify({'success': False, 'error': 'SMTP nicht konfiguriert'}), 400

        msg = MIMEMultipart()
        sender = f"{cfg.get('name', 'AquaDock CRM')} <{cfg['user']}>"
        msg['From']    = sender
        msg['To']      = to_email
        msg['Subject'] = 'AquaDock CRM – Test-Mail ✅'
        msg.attach(MIMEText('Diese Test-Mail wurde erfolgreich über den konfigurierten SMTP-Server gesendet.', 'plain', 'utf-8'))

        port = int(cfg.get('port', 587))
        if port == 465:
            with smtplib.SMTP_SSL(cfg['host'], port, timeout=10) as s:
                s.login(cfg['user'], cfg['password'])
                s.sendmail(cfg['user'], to_email, msg.as_string())
        else:
            with smtplib.SMTP(cfg['host'], port, timeout=10) as s:
                s.starttls()
                s.login(cfg['user'], cfg['password'])
                s.sendmail(cfg['user'], to_email, msg.as_string())

        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


# ==================== MASSENMAIL ====================

def fill_placeholders(text, contact, company):
    replacements = {
        '{{anrede}}':     contact.get('anrede', '') or '',
        '{{vorname}}':    contact.get('vorname', '') or '',
        '{{nachname}}':   contact.get('nachname', '') or '',
        '{{firmenname}}': company.get('firmenname', '') or contact.get('firmenname', '') or '',
        '{{stadt}}':      company.get('stadt', '') or '',
        '{{land}}':       company.get('land', '') or '',
    }
    for key, val in replacements.items():
        text = text.replace(key, val)
    return text

@app.route('/api/massenmail/recipients', methods=['POST'])
def massenmail_recipients():
    try:
        data = request.get_json()
        mode = data.get('mode', 'all_contacts')
        conn = get_db()
        cursor = conn.cursor()
        if mode == 'all_contacts':
            cursor.execute('''SELECT co.anrede, co.vorname, co.nachname, co.email, c.firmenname
                FROM contacts co LEFT JOIN companies c ON co.company_id = c.id
                WHERE co.email IS NOT NULL AND co.email != ''
                ORDER BY co.nachname ASC''')
            rows = [{'name': f"{r['anrede'] or ''} {r['vorname']} {r['nachname']}".strip(),
                     'email': r['email'],
                     'firma': r['firmenname'] or ''} for r in cursor.fetchall()]
        else:
            cursor.execute('''SELECT firmenname, email FROM companies
                WHERE email IS NOT NULL AND email != '' ORDER BY firmenname ASC''')
            rows = [{'name': r['firmenname'], 'email': r['email'], 'firma': ''} for r in cursor.fetchall()]
        conn.close()
        return jsonify({'success': True, 'recipients': rows})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/massenmail/send-contacts', methods=['POST'])
def massenmail_send_contacts():
    try:
        data        = request.get_json()
        tpl_id      = data.get('template_id')
        contact_ids = data.get('contact_ids', [])
        delay       = int(data.get('delay', 2))

        cfg = load_smtp_config()
        if not cfg.get('host') or not cfg.get('user') or not cfg.get('password'):
            return jsonify({'success': False, 'error': 'SMTP nicht konfiguriert'}), 400

        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM email_templates WHERE id=?', (tpl_id,))
        tpl = dict(cursor.fetchone())

        placeholders = ','.join('?' * len(contact_ids))
        cursor.execute(f'''
            SELECT co.id, co.company_id, co.anrede, co.vorname, co.nachname,
                   co.email, co.position, c.firmenname, c.stadt, c.land
            FROM contacts co
            LEFT JOIN companies c ON co.company_id = c.id
            WHERE co.id IN ({placeholders}) AND co.email IS NOT NULL AND co.email != ''
            ORDER BY co.nachname ASC
        ''', contact_ids)
        recipients = [dict(r) for r in cursor.fetchall()]

        sent = 0; errors = 0
        import time
        port = int(cfg.get('port', 587))
        smtp_conn = None
        try:
            if port == 465:
                smtp_conn = smtplib.SMTP_SSL(cfg['host'], port, timeout=15)
            else:
                smtp_conn = smtplib.SMTP(cfg['host'], port, timeout=15)
                smtp_conn.starttls()
            smtp_conn.login(cfg['user'], cfg['password'])

            for r in recipients:
                try:
                    subject = fill_placeholders(tpl['subject'], r, r)
                    body    = fill_placeholders(tpl['body'], r, r)
                    msg = MIMEMultipart()
                    msg['From']    = f"{cfg.get('name','AquaDock CRM')} <{cfg['user']}>"
                    msg['To']      = r['email']
                    msg['Subject'] = subject
                    msg.attach(MIMEText(body, 'plain', 'utf-8'))
                    smtp_conn.sendmail(cfg['user'], r['email'], msg.as_string())
                    cursor.execute('''INSERT INTO email_log
                        (template_name, recipient_email, recipient_name, subject, status, sent_at)
                        VALUES (?,?,?,?,?,datetime('now','localtime'))''',
                        (tpl['name'], r['email'],
                         f"{r.get('anrede','')} {r['vorname']} {r['nachname']}".strip(),
                         subject, 'sent'))
                    # Timeline nur wenn Kontakt einer Firma zugeordnet ist
                    if r['company_id']:
                        cursor.execute('''INSERT INTO timeline
                            (company_id, activity_type, title, content, user_name, created_at)
                            VALUES (?, 'email', ?, ?, 'AquaDock CRM', datetime('now','localtime'))''',
                            (r['company_id'],
                             f"📧 E-Mail gesendet: {subject}",
                             f"Vorlage: {tpl['name']}\nEmpfänger: {r['email']}"))
                    conn.commit()
                    sent += 1
                    if delay > 0: time.sleep(delay)
                except Exception as e:
                    cursor.execute('''INSERT INTO email_log
                        (template_name, recipient_email, recipient_name, subject, status, error_msg, sent_at)
                        VALUES (?,?,?,?,?,?,datetime('now','localtime'))''',
                        (tpl['name'], r['email'],
                         f"{r['vorname']} {r['nachname']}".strip(),
                         tpl['subject'], 'error', str(e)))
                    conn.commit()
                    errors += 1
        finally:
            if smtp_conn:
                try: smtp_conn.quit()
                except: pass

        conn.close()
        return jsonify({'success': True, 'sent': sent, 'errors': errors})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/massenmail/preview-selection', methods=['POST'])
def massenmail_preview_selection():
    try:
        data = request.get_json()
        tpl_id = data.get('template_id')
        company_ids = data.get('company_ids', [])
        if not company_ids:
            return jsonify({'success': False, 'error': 'Keine Firmen ausgewählt'}), 400

        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM email_templates WHERE id=?', (tpl_id,))
        tpl = cursor.fetchone()
        if not tpl:
            return jsonify({'success': False, 'error': 'Vorlage nicht gefunden'}), 404
        tpl = dict(tpl)

        # Empfänger: primärer Kontakt → fallback Firmen-E-Mail
        placeholders = ','.join('?' * len(company_ids))
        cursor.execute(f'''
            SELECT c.id, c.firmenname, c.email as firma_email, c.stadt, c.land,
                   co.anrede, co.vorname, co.nachname, co.email as kontakt_email
            FROM companies c
            LEFT JOIN contacts co ON co.company_id = c.id AND co.is_primary = 1
            WHERE c.id IN ({placeholders})
            ORDER BY c.firmenname ASC
        ''', company_ids)
        rows = cursor.fetchall()

        recipients = []
        for r in rows:
            email = r['kontakt_email'] or r['firma_email']
            if email:
                recipients.append({
                    'email': email,
                    'anrede': r['anrede'] or '',
                    'vorname': r['vorname'] or '',
                    'nachname': r['nachname'] or r['firmenname'],
                    'firmenname': r['firmenname'],
                    'stadt': r['stadt'] or '',
                    'land': r['land'] or '',
                })

        conn.close()

        # Vorschau mit erstem Empfänger
        first = recipients[0] if recipients else {}
        subject = fill_placeholders(tpl['subject'], first, first)
        body    = fill_placeholders(tpl['body'], first, first)

        return jsonify({
            'success': True,
            'count': len(recipients),
            'subject': subject,
            'body': body,
            'recipients': recipients
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/massenmail/send-selection', methods=['POST'])
def massenmail_send_selection():
    try:
        data = request.get_json()
        tpl_id      = data.get('template_id')
        company_ids = data.get('company_ids', [])
        delay       = int(data.get('delay', 2))

        cfg = load_smtp_config()
        if not cfg.get('host') or not cfg.get('user') or not cfg.get('password'):
            return jsonify({'success': False, 'error': 'SMTP nicht konfiguriert'}), 400

        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM email_templates WHERE id=?', (tpl_id,))
        tpl = dict(cursor.fetchone())

        placeholders = ','.join('?' * len(company_ids))
        cursor.execute(f'''
            SELECT c.id, c.firmenname, c.email as firma_email, c.stadt, c.land,
                   co.anrede, co.vorname, co.nachname, co.email as kontakt_email
            FROM companies c
            LEFT JOIN contacts co ON co.company_id = c.id AND co.is_primary = 1
            WHERE c.id IN ({placeholders})
            ORDER BY c.firmenname ASC
        ''', company_ids)

        recipients = []
        for r in cursor.fetchall():
            email = r['kontakt_email'] or r['firma_email']
            if email:
                recipients.append({
                    'company_id': r['id'],
                    'email': email,
                    'anrede': r['anrede'] or '',
                    'vorname': r['vorname'] or '',
                    'nachname': r['nachname'] or r['firmenname'],
                    'firmenname': r['firmenname'],
                    'stadt': r['stadt'] or '',
                    'land': r['land'] or '',
                })

        sent = 0; errors = 0
        import time
        port = int(cfg.get('port', 587))
        smtp_conn = None
        try:
            if port == 465:
                smtp_conn = smtplib.SMTP_SSL(cfg['host'], port, timeout=15)
            else:
                smtp_conn = smtplib.SMTP(cfg['host'], port, timeout=15)
                smtp_conn.starttls()
            smtp_conn.login(cfg['user'], cfg['password'])

            for r in recipients:
                try:
                    subject = fill_placeholders(tpl['subject'], r, r)
                    body    = fill_placeholders(tpl['body'], r, r)
                    msg = MIMEMultipart()
                    msg['From']    = f"{cfg.get('name','AquaDock CRM')} <{cfg['user']}>"
                    msg['To']      = r['email']
                    msg['Subject'] = subject
                    msg.attach(MIMEText(body, 'plain', 'utf-8'))
                    smtp_conn.sendmail(cfg['user'], r['email'], msg.as_string())
                    cursor.execute('''INSERT INTO email_log
                        (template_name, recipient_email, recipient_name, subject, status, sent_at)
                        VALUES (?,?,?,?,?,datetime('now','localtime'))''',
                        (tpl['name'], r['email'],
                         f"{r['anrede']} {r['vorname']} {r['nachname']}".strip(),
                         subject, 'sent'))
                    # Timeline-Eintrag
                    cursor.execute('''INSERT INTO timeline
                        (company_id, activity_type, title, content, user_name, created_at)
                        VALUES (?, 'email', ?, ?, 'AquaDock CRM', datetime('now','localtime'))''',
                        (r['company_id'],
                         f"📧 E-Mail gesendet: {subject}",
                         f"Vorlage: {tpl['name']}\nEmpfänger: {r['email']}"))
                    conn.commit()
                    sent += 1
                    if delay > 0: time.sleep(delay)
                except Exception as e:
                    cursor.execute('''INSERT INTO email_log
                        (template_name, recipient_email, recipient_name, subject, status, error_msg, sent_at)
                        VALUES (?,?,?,?,?,?,datetime('now','localtime'))''',
                        (tpl['name'], r['email'],
                         f"{r['vorname']} {r['nachname']}".strip(),
                         tpl['subject'], 'error', str(e)))
                    conn.commit()
                    errors += 1
        finally:
            if smtp_conn:
                try: smtp_conn.quit()
                except: pass

        conn.close()
        return jsonify({'success': True, 'sent': sent, 'errors': errors})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/massenmail/preview', methods=['POST'])
def massenmail_preview():
    try:
        data = request.get_json()
        tpl_id = data.get('template_id')
        mode   = data.get('mode', 'all_contacts')  # all_contacts | all_companies

        conn = get_db()
        cursor = conn.cursor()

        # Template laden
        cursor.execute('SELECT * FROM email_templates WHERE id=?', (tpl_id,))
        tpl = cursor.fetchone()
        if not tpl:
            return jsonify({'success': False, 'error': 'Vorlage nicht gefunden'}), 404
        tpl = dict(tpl)

        # Ersten Empfänger laden für Vorschau
        if mode == 'all_contacts':
            cursor.execute('''SELECT co.*, c.firmenname, c.stadt, c.land
                FROM contacts co LEFT JOIN companies c ON co.company_id = c.id
                WHERE co.email IS NOT NULL AND co.email != '' LIMIT 1''')
            row = cursor.fetchone()
            contact = dict(row) if row else {}
            company = contact
        else:
            cursor.execute('''SELECT * FROM companies WHERE email IS NOT NULL AND email != '' LIMIT 1''')
            row = cursor.fetchone()
            company = dict(row) if row else {}
            contact = {'vorname': '', 'nachname': '', 'anrede': '', 'firmenname': company.get('firmenname', '')}

        # Empfänger zählen
        if mode == 'all_contacts':
            cursor.execute("SELECT COUNT(*) as cnt FROM contacts WHERE email IS NOT NULL AND email != ''")
        else:
            cursor.execute("SELECT COUNT(*) as cnt FROM companies WHERE email IS NOT NULL AND email != ''")
        count = cursor.fetchone()['cnt']
        conn.close()

        subject = fill_placeholders(tpl['subject'], contact, company)
        body    = fill_placeholders(tpl['body'], contact, company)
        return jsonify({'success': True, 'subject': subject, 'body': body, 'count': count})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/massenmail/send', methods=['POST'])
def massenmail_send():
    try:
        data   = request.get_json()
        tpl_id = data.get('template_id')
        mode   = data.get('mode', 'all_contacts')
        delay  = int(data.get('delay', 2))

        cfg = load_smtp_config()
        if not cfg.get('host') or not cfg.get('user') or not cfg.get('password'):
            return jsonify({'success': False, 'error': 'SMTP nicht konfiguriert'}), 400

        conn = get_db()
        cursor = conn.cursor()

        cursor.execute('SELECT * FROM email_templates WHERE id=?', (tpl_id,))
        tpl = dict(cursor.fetchone())

        # Empfänger laden
        if mode == 'all_contacts':
            cursor.execute('''SELECT co.*, c.firmenname, c.stadt, c.land
                FROM contacts co LEFT JOIN companies c ON co.company_id = c.id
                WHERE co.email IS NOT NULL AND co.email != ''
                ORDER BY co.nachname ASC''')
            recipients = [dict(r) for r in cursor.fetchall()]
        else:
            cursor.execute('''SELECT id, firmenname, email, stadt, land FROM companies
                WHERE email IS NOT NULL AND email != '' ORDER BY firmenname ASC''')
            rows = cursor.fetchall()
            recipients = [{'email': r['email'], 'vorname': '', 'nachname': r['firmenname'],
                           'anrede': '', 'firmenname': r['firmenname'],
                           'stadt': r['stadt'], 'land': r['land']} for r in rows]

        sent = 0; errors = 0
        port = int(cfg.get('port', 587))

        import time
        smtp_conn = None
        try:
            if port == 465:
                smtp_conn = smtplib.SMTP_SSL(cfg['host'], port, timeout=15)
            else:
                smtp_conn = smtplib.SMTP(cfg['host'], port, timeout=15)
                smtp_conn.starttls()
            smtp_conn.login(cfg['user'], cfg['password'])

            for r in recipients:
                try:
                    subject = fill_placeholders(tpl['subject'], r, r)
                    body    = fill_placeholders(tpl['body'],    r, r)
                    msg = MIMEMultipart()
                    sender_name = cfg.get('name', 'AquaDock CRM')
                    msg['From']    = f"{sender_name} <{cfg['user']}>"
                    msg['To']      = r['email']
                    msg['Subject'] = subject
                    msg.attach(MIMEText(body, 'plain', 'utf-8'))
                    smtp_conn.sendmail(cfg['user'], r['email'], msg.as_string())

                    cursor.execute('''INSERT INTO email_log (template_name, recipient_email, recipient_name, subject, status, sent_at)
                        VALUES (?,?,?,?,?,datetime('now','localtime'))''',
                        (tpl['name'], r['email'],
                         f"{r.get('anrede','')} {r.get('vorname','')} {r.get('nachname','')}".strip(),
                         subject, 'sent'))
                    conn.commit()
                    sent += 1
                    if delay > 0:
                        time.sleep(delay)
                except Exception as e:
                    cursor.execute('''INSERT INTO email_log (template_name, recipient_email, recipient_name, subject, status, error_msg, sent_at)
                        VALUES (?,?,?,?,?,?,datetime('now','localtime'))''',
                        (tpl['name'], r['email'],
                         f"{r.get('vorname','')} {r.get('nachname','')}".strip(),
                         tpl['subject'], 'error', str(e)))
                    conn.commit()
                    errors += 1
        finally:
            if smtp_conn:
                try: smtp_conn.quit()
                except: pass

        conn.close()
        return jsonify({'success': True, 'sent': sent, 'errors': errors})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/massenmail/log', methods=['GET'])
def get_mail_log():
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM email_log ORDER BY sent_at DESC LIMIT 500')
        logs = [dict(r) for r in cursor.fetchall()]
        conn.close()
        return jsonify({'success': True, 'logs': logs})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


# ==================== OSM UPDATE ====================

@app.route('/api/companies/update-osm', methods=['POST'])
def update_osm_from_csv():
    """OSM, Wassertyp + Wasserdistanz aus CSV nachträglich in bestehende Firmen eintragen"""
    try:
        if 'file' not in request.files:
            return jsonify({'success': False, 'error': 'Keine Datei'}), 400

        file = request.files['file']
        raw = file.read()
        try:
            file_content = raw.decode('utf-8-sig')
        except:
            file_content = raw.decode('latin-1')

        import csv
        from io import StringIO

        def csv_get(row, *keys, default=''):
            for k in keys:
                v = row.get(k, '').strip()
                if v: return v
            return default

        def csv_float_safe(v):
            if not v: return None
            v = v.strip()
            try:
                dot_count = v.count('.')
                if dot_count > 1:
                    digits = v.replace('.', '')
                    v = digits[:2] + '.' + digits[2:]
                elif ',' in v:
                    v = v.replace('.', '').replace(',', '.')
                return float(v)
            except:
                return None

        reader = csv.DictReader(StringIO(file_content), delimiter=';')
        conn = get_db()
        cursor = conn.cursor()

        updated = 0
        not_found = 0

        for row in reader:
            name        = csv_get(row, 'Name', 'Firmenname', 'Firma')
            osm         = csv_get(row, 'OSM', 'Osm', 'osm')
            wassertyp   = csv_get(row, 'Wassertyp', 'Wasserart')
            # Emoji aus Wassertyp entfernen
            for emoji in ['🏞', '🌊', '💧', '🏊', '🌅', '⚓']:
                wassertyp = wassertyp.replace(emoji, '').strip()
            wasserdistanz = csv_float_safe(csv_get(row, 'Wasserdistanz (m)', 'Wasserdistanz', 'Distanz'))

            if not name:
                continue

            # Firma per Name suchen
            cursor.execute('''SELECT id, osm, wassertyp, wasserdistanz
                FROM companies WHERE firmenname = ?''', (name,))
            existing = cursor.fetchone()

            if not existing:
                not_found += 1
                continue

            # Felder sammeln die aktualisiert werden sollen
            updates = {}
            if osm and not existing['osm']:
                updates['osm'] = osm
            if wassertyp and not existing['wassertyp']:
                updates['wassertyp'] = wassertyp
            if wasserdistanz is not None and existing['wasserdistanz'] is None:
                updates['wasserdistanz'] = wasserdistanz

            if updates:
                set_clause = ', '.join(f'{k} = ?' for k in updates)
                values = list(updates.values()) + [existing['id']]
                cursor.execute(f'UPDATE companies SET {set_clause} WHERE id = ?', values)
                updated += 1

        conn.commit()
        conn.close()
        return jsonify({'success': True, 'updated': updated, 'not_found': not_found})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


# ==================== KARTE API ====================

@app.route('/api/companies/osm-ids', methods=['GET'])
def get_osm_ids():
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT osm FROM companies WHERE osm IS NOT NULL AND osm != ''")
        ids = [r['osm'] for r in cursor.fetchall()]
        conn.close()
        return jsonify({'success': True, 'osm_ids': ids})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/companies/map', methods=['GET'])
def get_map_companies():
    try:
        conn = get_db()
        cursor = conn.cursor()

        status       = request.args.get('status', '')
        kundentyp    = request.args.get('kundentyp', '')
        wassertyp    = request.args.get('wassertyp', '')
        import_batch = request.args.get('import_batch', '')

        query = '''
            SELECT id, firmenname, kundentyp, status, wassertyp,
                   wasserdistanz, lat, lon, osm, telefon, website,
                   stadt, land, import_batch, created_at
            FROM companies
            WHERE lat IS NOT NULL AND lon IS NOT NULL
              AND lat != '' AND lon != ''
        '''
        params = []
        if status:       query += ' AND status = ?';       params.append(status)
        if kundentyp:    query += ' AND kundentyp = ?';    params.append(kundentyp)
        if wassertyp:    query += ' AND wassertyp = ?';    params.append(wassertyp)
        if import_batch: query += ' AND import_batch = ?'; params.append(import_batch)

        query += ' ORDER BY firmenname ASC'
        cursor.execute(query, params)
        companies = [dict(r) for r in cursor.fetchall()]
        conn.close()
        return jsonify({'success': True, 'companies': companies, 'count': len(companies)})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/import/batches', methods=['GET'])
def get_import_batches():
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('''
            SELECT import_batch, COUNT(*) as count
            FROM companies
            WHERE import_batch IS NOT NULL AND import_batch != ''
            GROUP BY import_batch
            ORDER BY import_batch DESC
        ''')
        batches = [dict(r) for r in cursor.fetchall()]
        conn.close()
        return jsonify({'success': True, 'batches': batches})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


# ==================== EMAIL TEMPLATES API ====================

@app.route('/api/templates', methods=['GET'])
def get_templates():
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM email_templates ORDER BY name ASC')
        templates = [dict(r) for r in cursor.fetchall()]
        conn.close()
        return jsonify({'success': True, 'templates': templates})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/templates', methods=['POST'])
def create_template():
    try:
        data = request.get_json()
        if not data.get('name') or not data.get('subject') or not data.get('body'):
            return jsonify({'success': False, 'error': 'Name, Betreff und Text sind Pflichtfelder'}), 400
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO email_templates (name, subject, body)
            VALUES (?, ?, ?)
        ''', (data['name'], data['subject'], data['body']))
        conn.commit()
        template_id = cursor.lastrowid
        conn.close()
        return jsonify({'success': True, 'id': template_id})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/templates/<int:tpl_id>', methods=['PUT'])
def update_template(tpl_id):
    try:
        data = request.get_json()
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('''
            UPDATE email_templates SET name=?, subject=?, body=?,
            updated_at=CURRENT_TIMESTAMP WHERE id=?
        ''', (data['name'], data['subject'], data['body'], tpl_id))
        conn.commit()
        conn.close()
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/templates/<int:tpl_id>', methods=['DELETE'])
def delete_template(tpl_id):
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('DELETE FROM email_templates WHERE id=?', (tpl_id,))
        conn.commit()
        conn.close()
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


# ==================== COMPANIES API ====================

@app.route('/api/companies', methods=['GET'])
def get_companies():
    try:
        conn = get_db()
        cursor = conn.cursor()

        status = request.args.get('status')
        kundentyp = request.args.get('type')
        firmentyp = request.args.get('firmentyp')
        search = request.args.get('search', '').strip().lower()

        query = '''
            SELECT 
                c.*,
                COUNT(DISTINCT co.id) as contact_count,
                COUNT(DISTINCT CASE WHEN r.status = 'open' THEN r.id END) as open_reminders,
                COUNT(DISTINCT CASE WHEN r.status = 'open' AND date(r.due_date) < date('now') THEN r.id END) as overdue_reminders,
                primary_co.vorname as primary_vorname,
                primary_co.nachname as primary_nachname,
                primary_co.position as primary_position,
                primary_co.email as primary_email,
                primary_co.telefon as primary_telefon
            FROM companies c
            LEFT JOIN contacts co ON co.company_id = c.id
            LEFT JOIN reminders r ON r.company_id = c.id
            LEFT JOIN (
                SELECT company_id, vorname, nachname, position, email, telefon
                FROM contacts
                WHERE id IN (
                    SELECT MIN(CASE WHEN is_primary = 1 THEN id END)
                    FROM contacts GROUP BY company_id
                )
                UNION ALL
                SELECT company_id, vorname, nachname, position, email, telefon
                FROM contacts c2
                WHERE is_primary = 0
                AND NOT EXISTS (
                    SELECT 1 FROM contacts c3 
                    WHERE c3.company_id = c2.company_id AND c3.is_primary = 1
                )
                AND c2.id = (
                    SELECT MIN(id) FROM contacts c4 WHERE c4.company_id = c2.company_id
                )
            ) primary_co ON primary_co.company_id = c.id
            WHERE 1=1
        '''
        params = []

        if status and status != 'all':
            query += ' AND c.status = ?'
            params.append(status)

        if kundentyp and kundentyp != 'all':
            query += ' AND c.kundentyp = ?'
            params.append(kundentyp)

        if firmentyp and firmentyp != 'all':
            query += ' AND c.firmentyp = ?'
            params.append(firmentyp)

        land = request.args.get('land')
        if land and land != 'all':
            query += ' AND c.land = ?'
            params.append(land)

        if search:
            query += ''' AND (
                LOWER(c.firmenname) LIKE ? OR
                LOWER(c.stadt) LIKE ? OR
                LOWER(c.plz) LIKE ? OR
                EXISTS (
                    SELECT 1 FROM contacts co2 
                    WHERE co2.company_id = c.id AND (
                        LOWER(co2.vorname) LIKE ? OR 
                        LOWER(co2.nachname) LIKE ? OR 
                        LOWER(co2.email) LIKE ?
                    )
                )
            )'''
            s = f'%{search}%'
            params.extend([s, s, s, s, s, s])

        query += ' GROUP BY c.id ORDER BY c.created_at DESC'

        cursor.execute(query, params)
        rows = cursor.fetchall()
        companies = [dict(row) for row in rows]

        conn.close()
        return jsonify({'success': True, 'companies': companies})

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/companies/<int:company_id>', methods=['GET'])
def get_company(company_id):
    try:
        conn = get_db()
        cursor = conn.cursor()

        cursor.execute('SELECT * FROM companies WHERE id = ?', (company_id,))
        company = cursor.fetchone()
        if not company:
            return jsonify({'success': False, 'error': 'Firma nicht gefunden'}), 404

        cursor.execute('''
            SELECT * FROM contacts WHERE company_id = ?
            ORDER BY is_primary DESC, nachname ASC
        ''', (company_id,))
        contacts = [dict(r) for r in cursor.fetchall()]

        cursor.execute('''
            SELECT * FROM timeline WHERE company_id = ?
            ORDER BY created_at DESC
        ''', (company_id,))
        timeline = [dict(r) for r in cursor.fetchall()]

        cursor.execute('''
            SELECT * FROM reminders WHERE company_id = ? AND status = 'open'
            ORDER BY due_date ASC
        ''', (company_id,))
        reminders = [dict(r) for r in cursor.fetchall()]

        conn.close()
        return jsonify({
            'success': True,
            'company': dict(company),
            'contacts': contacts,
            'timeline': timeline,
            'reminders': reminders
        })

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/companies', methods=['POST'])
def create_company():
    try:
        data = request.json
        if not data.get('firmenname'):
            return jsonify({'success': False, 'error': 'Firmenname ist Pflichtfeld'}), 400

        conn = get_db()
        cursor = conn.cursor()

        # Duplikat-Check überspringen wenn force=True
        force = request.args.get('force') == '1' or data.get('_force')

        # Duplikat-Check: OSM-URL bereits vorhanden?
        if not force and data.get('osm'):
            cursor.execute('SELECT id, firmenname FROM companies WHERE osm = ?', (data['osm'],))
            existing = cursor.fetchone()
            if existing:
                conn.close()
                return jsonify({
                    'success': False,
                    'duplicate': True,
                    'error': f'Bereits im CRM vorhanden: "{existing["firmenname"]}" (gleiche OSM-ID)',
                    'existing_id': existing['id']
                }), 409

        # Duplikat-Check: Gleicher Firmenname + Stadt?
        if not force and data.get('stadt'):
            cursor.execute('''SELECT id, firmenname FROM companies
                WHERE firmenname = ? AND stadt = ?''',
                (data['firmenname'], data.get('stadt', '')))
            existing = cursor.fetchone()
            if existing:
                conn.close()
                return jsonify({
                    'success': False,
                    'duplicate': True,
                    'error': f'Mögliches Duplikat: "{existing["firmenname"]}" in {data["stadt"]} bereits vorhanden',
                    'existing_id': existing['id']
                }), 409

        cursor.execute('''
            INSERT INTO companies (
                firmenname, rechtsform, kundentyp, firmentyp,
                strasse, plz, stadt, bundesland, land, website, telefon, email,
                wasserdistanz, wassertyp, lat, lon, osm,
                status, value, notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            data['firmenname'],
            data.get('rechtsform', ''),
            data.get('kundentyp', 'sonstige'),
            data.get('firmentyp', ''),
            data.get('strasse', ''),
            data.get('plz', ''),
            data.get('stadt', ''),
            data.get('bundesland', ''),
            data.get('land', 'Deutschland'),
            data.get('website', ''),
            data.get('telefon', ''),
            data.get('email', ''),
            data.get('wasserdistanz'),
            data.get('wassertyp', ''),
            data.get('lat'),
            data.get('lon'),
            data.get('osm', ''),
            data.get('status', 'lead'),
            data.get('value', 0),
            data.get('notes', '')
        ))
        company_id = cursor.lastrowid

        # Auto-Timeline
        cursor.execute('''
            INSERT INTO timeline (company_id, activity_type, title, content)
            VALUES (?, 'created', 'Firma angelegt', ?)
        ''', (company_id, f'Firma "{data["firmenname"]}" wurde im CRM angelegt'))

        conn.commit()
        conn.close()

        return jsonify({'success': True, 'id': company_id, 'message': 'Firma erstellt'}), 201

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/companies/<int:company_id>', methods=['PUT'])
def update_company(company_id):
    try:
        data = request.json
        conn = get_db()
        cursor = conn.cursor()

        cursor.execute('SELECT * FROM companies WHERE id = ?', (company_id,))
        old = cursor.fetchone()
        if not old:
            return jsonify({'success': False, 'error': 'Firma nicht gefunden'}), 404

        cursor.execute('''
            UPDATE companies SET
                firmenname=?, rechtsform=?, kundentyp=?, firmentyp=?,
                strasse=?, plz=?, stadt=?, bundesland=?, land=?, website=?, telefon=?, email=?,
                wasserdistanz=?, wassertyp=?, lat=?, lon=?, osm=?,
                status=?, value=?, notes=?,
                updated_at=CURRENT_TIMESTAMP
            WHERE id=?
        ''', (
            data['firmenname'],
            data.get('rechtsform', ''),
            data.get('kundentyp', 'sonstige'),
            data.get('firmentyp', ''),
            data.get('strasse', ''),
            data.get('plz', ''),
            data.get('stadt', ''),
            data.get('bundesland', ''),
            data.get('land', 'Deutschland'),
            data.get('website', ''),
            data.get('telefon', ''),
            data.get('email', ''),
            data.get('wasserdistanz'),
            data.get('wassertyp', ''),
            data.get('lat'),
            data.get('lon'),
            data.get('osm', ''),
            data.get('status', 'lead'),
            data.get('value', 0),
            data.get('notes', ''),
            company_id
        ))

        # Log Statusänderung
        if old['status'] != data.get('status'):
            cursor.execute('''
                INSERT INTO timeline (company_id, activity_type, title, content)
                VALUES (?, 'status_change', 'Status geändert', ?)
            ''', (company_id, f'Status von "{old["status"]}" zu "{data.get("status")}" geändert'))

        conn.commit()
        conn.close()
        return jsonify({'success': True, 'message': 'Firma aktualisiert'})

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/companies/<int:company_id>', methods=['DELETE'])
def delete_company(company_id):
    """
    Firma löschen.
    ?contacts=delete  → Kontakte mitlöschen
    ?contacts=keep    → Kontakte behalten (company_id = NULL via ON DELETE SET NULL)
    """
    try:
        contacts_action = request.args.get('contacts', 'keep')
        conn = get_db()
        cursor = conn.cursor()

        cursor.execute('SELECT firmenname FROM companies WHERE id = ?', (company_id,))
        company = cursor.fetchone()
        if not company:
            return jsonify({'success': False, 'error': 'Firma nicht gefunden'}), 404

        if contacts_action == 'delete':
            cursor.execute('DELETE FROM contacts WHERE company_id = ?', (company_id,))

        # Firma löschen (Timeline + Reminders → CASCADE, Contacts → SET NULL)
        cursor.execute('DELETE FROM companies WHERE id = ?', (company_id,))

        conn.commit()
        conn.close()
        return jsonify({'success': True, 'message': 'Firma gelöscht'})

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/companies/<int:company_id>/contacts/count', methods=['GET'])
def get_company_contact_count(company_id):
    """Anzahl der Kontakte einer Firma – für Lösch-Dialog im Frontend"""
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('SELECT COUNT(*) as count FROM contacts WHERE company_id = ?', (company_id,))
        count = cursor.fetchone()['count']
        conn.close()
        return jsonify({'success': True, 'count': count})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


# ==================== CONTACTS API ====================

@app.route('/api/contacts', methods=['GET'])
def get_contacts():
    """Alle Kontakte, optional gefiltert nach company_id"""
    try:
        conn = get_db()
        cursor = conn.cursor()

        company_id = request.args.get('company_id')
        search = request.args.get('search', '').strip().lower()

        query = '''
            SELECT co.*, c.firmenname
            FROM contacts co
            LEFT JOIN companies c ON co.company_id = c.id
            WHERE 1=1
        '''
        params = []

        if company_id:
            query += ' AND co.company_id = ?'
            params.append(company_id)

        if search:
            query += ''' AND (
                LOWER(co.vorname) LIKE ? OR
                LOWER(co.nachname) LIKE ? OR
                LOWER(co.email) LIKE ?
            )'''
            s = f'%{search}%'
            params.extend([s, s, s])

        query += ' ORDER BY co.is_primary DESC, co.nachname ASC'

        cursor.execute(query, params)
        contacts = [dict(r) for r in cursor.fetchall()]
        conn.close()
        return jsonify({'success': True, 'contacts': contacts})

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/contacts/<int:contact_id>', methods=['GET'])
def get_single_contact(contact_id):
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('''
            SELECT co.*, c.firmenname, c.stadt, c.land
            FROM contacts co
            LEFT JOIN companies c ON co.company_id = c.id
            WHERE co.id = ?
        ''', (contact_id,))
        row = cursor.fetchone()
        conn.close()
        if not row:
            return jsonify({'success': False, 'error': 'Nicht gefunden'}), 404
        return jsonify({'success': True, 'contact': dict(row)})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500



def create_contact():
    try:
        data = request.json
        if not data.get('vorname') or not data.get('nachname'):
            return jsonify({'success': False, 'error': 'Vor- und Nachname sind Pflichtfelder'}), 400

        conn = get_db()
        cursor = conn.cursor()

        # Wenn dieser als Hauptkontakt markiert → anderen zurücksetzen
        if data.get('is_primary') and data.get('company_id'):
            cursor.execute(
                'UPDATE contacts SET is_primary = 0 WHERE company_id = ?',
                (data['company_id'],)
            )

        cursor.execute('''
            INSERT INTO contacts (
                company_id, anrede, vorname, nachname, position,
                email, telefon, mobil, durchwahl,
                is_primary, notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            data.get('company_id'),
            data.get('anrede', ''),
            data['vorname'],
            data['nachname'],
            data.get('position', ''),
            data.get('email', ''),
            data.get('telefon', ''),
            data.get('mobil', ''),
            data.get('durchwahl', ''),
            1 if data.get('is_primary') else 0,
            data.get('notes', '')
        ))
        contact_id = cursor.lastrowid

        # Timeline-Eintrag bei der Firma
        if data.get('company_id'):
            cursor.execute('''
                INSERT INTO timeline (company_id, activity_type, title, content)
                VALUES (?, 'contact_added', 'Kontakt hinzugefügt', ?)
            ''', (data['company_id'], f'{data["vorname"]} {data["nachname"]} wurde als Kontakt hinzugefügt'))

        conn.commit()
        conn.close()
        return jsonify({'success': True, 'id': contact_id, 'message': 'Kontakt erstellt'}), 201

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/contacts/<int:contact_id>', methods=['PUT'])
def update_contact(contact_id):
    try:
        data = request.json
        conn = get_db()
        cursor = conn.cursor()

        cursor.execute('SELECT * FROM contacts WHERE id = ?', (contact_id,))
        old = cursor.fetchone()
        if not old:
            return jsonify({'success': False, 'error': 'Kontakt nicht gefunden'}), 404

        # Hauptkontakt-Logik
        if data.get('is_primary') and data.get('company_id'):
            cursor.execute(
                'UPDATE contacts SET is_primary = 0 WHERE company_id = ? AND id != ?',
                (data['company_id'], contact_id)
            )

        cursor.execute('''
            UPDATE contacts SET
                company_id=?, vorname=?, nachname=?, position=?,
                email=?, telefon=?, mobil=?, durchwahl=?,
                is_primary=?, notes=?,
                updated_at=CURRENT_TIMESTAMP
            WHERE id=?
        ''', (
            data.get('company_id'),
            data['vorname'],
            data['nachname'],
            data.get('position', ''),
            data.get('email', ''),
            data.get('telefon', ''),
            data.get('mobil', ''),
            data.get('durchwahl', ''),
            1 if data.get('is_primary') else 0,
            data.get('notes', ''),
            contact_id
        ))

        conn.commit()
        conn.close()
        return jsonify({'success': True, 'message': 'Kontakt aktualisiert'})

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/contacts/<int:contact_id>', methods=['DELETE'])
def delete_contact(contact_id):
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('DELETE FROM contacts WHERE id = ?', (contact_id,))
        if cursor.rowcount == 0:
            return jsonify({'success': False, 'error': 'Kontakt nicht gefunden'}), 404
        conn.commit()
        conn.close()
        return jsonify({'success': True, 'message': 'Kontakt gelöscht'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


# ==================== TIMELINE API ====================

@app.route('/api/timeline/<int:company_id>', methods=['POST'])
def add_timeline_entry(company_id):
    try:
        data = request.json
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO timeline (company_id, activity_type, title, content, user_name, created_at)
            VALUES (?, ?, ?, ?, ?, datetime('now','localtime'))
        ''', (
            company_id,
            data['activity_type'],
            data['title'],
            data.get('content', ''),
            data.get('user_name', 'Ich')
        ))
        conn.commit()
        conn.close()
        return jsonify({'success': True, 'message': 'Aktivität hinzugefügt'}), 201
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


# ==================== REMINDERS API ====================

@app.route('/api/reminders/<int:company_id>', methods=['POST'])
def add_reminder(company_id):
    try:
        data = request.json
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO reminders (company_id, title, description, due_date, priority, assigned_to)
            VALUES (?, ?, ?, ?, ?, datetime('now','localtime'))
        ''', (
            company_id,
            data['title'],
            data.get('description', ''),
            data['due_date'],
            data.get('priority', 'normal'),
            data.get('assigned_to', 'Ich')
        ))
        conn.commit()
        conn.close()
        return jsonify({'success': True, 'message': 'Aufgabe erstellt'}), 201
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/reminders/<int:reminder_id>', methods=['PUT'])
def update_reminder(reminder_id):
    try:
        data = request.json
        conn = get_db()
        cursor = conn.cursor()

        if data.get('status') == 'completed':
            cursor.execute('''
                UPDATE reminders SET status='completed', completed_at=CURRENT_TIMESTAMP
                WHERE id=?
            ''', (reminder_id,))
        else:
            cursor.execute('''
                UPDATE reminders SET
                    status=?, title=?, description=?, due_date=?, priority=?
                WHERE id=?
            ''', (
                data.get('status', 'open'),
                data.get('title'),
                data.get('description', ''),
                data.get('due_date'),
                data.get('priority', 'normal'),
                reminder_id
            ))

        conn.commit()
        conn.close()
        return jsonify({'success': True, 'message': 'Aufgabe aktualisiert'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/reminders/<int:reminder_id>', methods=['DELETE'])
def delete_reminder(reminder_id):
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('DELETE FROM reminders WHERE id = ?', (reminder_id,))
        conn.commit()
        conn.close()
        return jsonify({'success': True, 'message': 'Aufgabe gelöscht'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/reminders/all', methods=['GET'])
def get_all_reminders():
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('''
            SELECT r.*, c.firmenname
            FROM reminders r
            JOIN companies c ON r.company_id = c.id
            WHERE r.status = 'open'
            ORDER BY r.due_date ASC
        ''')
        reminders = [dict(r) for r in cursor.fetchall()]
        conn.close()
        return jsonify({'success': True, 'reminders': reminders})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e), 'reminders': []}), 200


# ==================== STATISTICS API ====================

@app.route('/api/stats', methods=['GET'])
def get_stats():
    try:
        conn = get_db()
        cursor = conn.cursor()

        cursor.execute('SELECT COUNT(*) as count FROM companies')
        total = cursor.fetchone()['count']

        cursor.execute('SELECT status, COUNT(*) as count FROM companies GROUP BY status')
        by_status = {row['status']: row['count'] for row in cursor.fetchall()}

        cursor.execute('SELECT COUNT(*) as count FROM contacts')
        total_contacts = cursor.fetchone()['count']

        cursor.execute('SELECT SUM(value) as total FROM companies WHERE status = "gewonnen"')
        total_value = cursor.fetchone()['total'] or 0

        cursor.execute('SELECT COUNT(*) as count FROM reminders WHERE status = "open"')
        open_reminders = cursor.fetchone()['count']

        cursor.execute('''
            SELECT COUNT(*) as count FROM reminders
            WHERE status = "open" AND date(due_date) < date('now')
        ''')
        overdue_reminders = cursor.fetchone()['count']

        conn.close()
        return jsonify({
            'success': True,
            'stats': {
                'total': total,
                'total_contacts': total_contacts,
                'by_status': by_status,
                'total_value': total_value,
                'open_reminders': open_reminders,
                'overdue_reminders': overdue_reminders
            }
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


# ==================== CSV EXPORT ====================

@app.route('/api/companies/export/csv', methods=['GET'])
def export_companies_csv():
    try:
        conn = get_db()
        cursor = conn.cursor()

        status_filter    = request.args.get('status', '')
        kundentyp_filter = request.args.get('kundentyp', '')
        land_filter      = request.args.get('land', '')
        search_filter    = request.args.get('search', '').strip().lower()

        query = '''
            SELECT c.*,
                co.anrede      as hk_anrede,
                co.vorname     as hk_vorname,
                co.nachname    as hk_nachname,
                co.position    as hk_position,
                co.email       as hk_email,
                co.telefon     as hk_telefon,
                co.mobil       as hk_mobil,
                GROUP_CONCAT(
                    co2.vorname || ' ' || co2.nachname, ' | '
                ) as alle_kontakte
            FROM companies c
            LEFT JOIN contacts co  ON co.company_id = c.id AND co.is_primary = 1
            LEFT JOIN contacts co2 ON co2.company_id = c.id
            WHERE 1=1
        '''
        params = []
        if status_filter and status_filter != 'all':
            query += ' AND c.status = ?'
            params.append(status_filter)
        if kundentyp_filter and kundentyp_filter != 'all':
            query += ' AND c.kundentyp = ?'
            params.append(kundentyp_filter)
        if land_filter and land_filter != 'all':
            query += ' AND c.land = ?'
            params.append(land_filter)
        if search_filter:
            query += ''' AND (
                LOWER(c.firmenname) LIKE ? OR LOWER(c.stadt) LIKE ? OR
                LOWER(c.land) LIKE ? OR LOWER(c.email) LIKE ?
            )'''
            s = f'%{search_filter}%'
            params.extend([s, s, s, s])

        query += ' GROUP BY c.id ORDER BY c.firmenname ASC'

        cursor.execute(query, params)
        companies = cursor.fetchall()
        conn.close()

        output = StringIO()
        writer = csv.writer(output, delimiter=';', quoting=csv.QUOTE_ALL)
        writer.writerow([
            'ID', 'Firmenname', 'Rechtsform', 'Kategorie', 'Betriebstyp',
            'Straße', 'PLZ', 'Stadt', 'Bundesland', 'Land',
            'Website', 'Telefon', 'E-Mail',
            'Wassertyp', 'Wasserdistanz (m)', 'Breitengrad', 'Längengrad',
            'Status', 'Wert (€)', 'Notizen',
            'HK Anrede', 'HK Vorname', 'HK Nachname', 'HK Position',
            'HK E-Mail', 'HK Telefon', 'HK Mobil',
            'Alle Kontakte',
            'Erstellt am', 'Geändert am'
        ])
        for c in companies:
            writer.writerow([
                c['id'],
                c['firmenname'],
                c['rechtsform'] or '',
                c['kundentyp'] or '',
                c['firmentyp'] or '',
                c['strasse'] or '',
                c['plz'] or '',
                c['stadt'] or '',
                c['bundesland'] or '',
                c['land'] or '',
                c['website'] or '',
                c['telefon'] or '',
                c['email'] or '',
                c['wassertyp'] or '',
                c['wasserdistanz'] or '',
                c['lat'] or '',
                c['lon'] or '',
                c['status'] or '',
                c['value'] or 0,
                c['notes'] or '',
                c['hk_anrede'] or '',
                c['hk_vorname'] or '',
                c['hk_nachname'] or '',
                c['hk_position'] or '',
                c['hk_email'] or '',
                c['hk_telefon'] or '',
                c['hk_mobil'] or '',
                c['alle_kontakte'] or '',
                c['created_at'] or '',
                c['updated_at'] or '',
            ])

        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        return Response(
            '\ufeff' + output.getvalue(),  # BOM für Excel-Kompatibilität
            mimetype='text/csv; charset=utf-8',
            headers={'Content-Disposition': f'attachment; filename=aquadock_export_{timestamp}.csv'}
        )
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


# ==================== ROUTES ====================

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/<path:filename>')
def serve_static(filename):
    return send_from_directory('static', filename)

@app.route('/api/companies/import/csv', methods=['POST'])
def import_companies_csv():
    """Import companies from CSV - unterstützt v3-Format und AquaDock-Quelldaten"""

    # Hilfsfunktionen außerhalb der Schleife
    def csv_get(row, *keys, default=''):
        for k in keys:
            v = row.get(k, '').strip()
            if v: return v
        return default

    def csv_float(row, *keys):
        for k in keys:
            v = row.get(k, '').strip()
            if not v: continue
            try:
                dot_count = v.count('.')
                if dot_count > 1:
                    # Format wie 436.338.574 → 43.6338574
                    # Alle Punkte entfernen, dann Dezimalkomma nach 2. Stelle einfügen
                    digits = v.replace('.', '')
                    v = digits[:2] + '.' + digits[2:]
                elif ',' in v and dot_count >= 1:
                    # 1.234,56 → 1234.56
                    v = v.replace('.', '').replace(',', '.')
                elif ',' in v:
                    v = v.replace(',', '.')
                return float(v)
            except:
                pass
        return None

    try:
        if 'file' not in request.files:
            return jsonify({'success': False, 'error': 'Keine Datei hochgeladen'}), 400

        file = request.files['file']

        raw = file.read()
        # Encoding erkennen
        try:
            file_content = raw.decode('utf-8-sig')
        except:
            file_content = raw.decode('latin-1')

        csv_file = StringIO(file_content)
        # Trennzeichen erkennen
        sample = file_content[:2048]
        try:
            dialect = csv.Sniffer().sniff(sample, delimiters=';,\t')
            delimiter = dialect.delimiter
        except:
            delimiter = ';' if ';' in sample else ','

        csv_file.seek(0)
        reader = csv.DictReader(csv_file, delimiter=delimiter)

        conn = get_db()
        cursor = conn.cursor()

        imported = 0
        errors = []

        land_map = {
            'DE': 'Deutschland', 'AT': 'Österreich', 'CH': 'Schweiz',
            'NL': 'Niederlande', 'FR': 'Frankreich', 'IT': 'Italien',
            'ES': 'Spanien', 'PL': 'Polen', 'CZ': 'Tschechien',
            'LU': 'Luxemburg', 'BE': 'Belgien', 'DK': 'Dänemark',
        }

        # Kategorie → Kundentyp Mapping (case-insensitive)
        kategorie_map = {
            'restaurant': 'restaurant',
            'hotel': 'hotel',
            'resort': 'resort',
            'camping': 'camping',
            'marina': 'marina',
            'segelschule': 'segelschule',
            'segelverein': 'segelverein',
            'bootsverleih': 'bootsverleih',
            'neukunde': 'neukunde',
            'bestandskunde': 'bestandskunde',
            'interessent': 'interessent',
            'partner': 'partner',
        }

        # Import-Batch ID einmalig pro Import generieren
        import_batch = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

        for row_num, row in enumerate(reader, start=2):
            try:
                # Flexibles Firmenname-Mapping
                firmenname = csv_get(row, 'Firmenname', 'Name', 'Firma', 'Betrieb')
                if not firmenname:
                    errors.append(f'Zeile {row_num}: Kein Firmenname gefunden')
                    continue

                # Land mapping
                raw_land = csv_get(row, 'Land', default='')
                land = land_map.get(raw_land.upper(), raw_land) if raw_land else 'Deutschland'

                # Wassertyp: Emoji entfernen
                wassertyp_raw = csv_get(row, 'Wassertyp', 'Wasserart', default='')
                wassertyp = wassertyp_raw.replace('🏞', '').replace('🌊', '').replace('💧', '').strip()

                # Wert sicher parsen
                try:
                    wert = int(float(csv_get(row, 'Wert', default='0') or 0))
                except:
                    wert = 0

                cursor.execute('''
                    INSERT INTO companies (
                        firmenname, rechtsform, kundentyp, firmentyp,
                        strasse, plz, stadt, bundesland, land,
                        website, telefon, email,
                        wasserdistanz, wassertyp, lat, lon, osm,
                        import_batch, status, value, notes
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (
                    firmenname,
                    csv_get(row, 'Rechtsform'),
                    kategorie_map.get(
                        csv_get(row, 'Kundentyp', 'Kategorie', 'Typ', default='sonstige').lower(),
                        csv_get(row, 'Kundentyp', 'Kategorie', 'Typ', default='sonstige').lower()
                    ),
                    csv_get(row, 'Firmentyp'),
                    csv_get(row, 'Straße', 'Strasse', 'Adresse'),
                    csv_get(row, 'PLZ', 'Postleitzahl'),
                    csv_get(row, 'Stadt', 'Ort', 'Gemeinde'),
                    csv_get(row, 'Bundesland', 'Bundesstaat'),
                    land,
                    csv_get(row, 'Website', 'Webseite', 'URL'),
                    csv_get(row, 'Telefon', 'Tel', 'Phone', 'AP1_Telefon'),
                    csv_get(row, 'Email', 'E-Mail', 'EMail', 'email', 'Kontakt_Email'),
                    csv_float(row, 'Wasserdistanz (m)', 'Wasserdistanz', 'Distanz'),
                    wassertyp,
                    csv_float(row, 'Lat', 'Latitude', 'Breitengrad'),
                    csv_float(row, 'Lon', 'Longitude', 'Längengrad', 'Laengengrad'),
                    csv_get(row, 'OSM', 'Osm', 'osm', 'OpenStreetMap', default=''),
                    import_batch,
                    csv_get(row, 'Status', default='neu'),
                    wert,
                    csv_get(row, 'Notizen', 'Beschreibung', 'Anmerkung')
                ))
                company_id = cursor.lastrowid

                # AP1 → Hauptkontakt
                if row.get('AP1_Vorname') or row.get('AP1_Nachname'):
                    cursor.execute('''
                        INSERT INTO contacts (
                            company_id, vorname, nachname, position,
                            email, telefon, mobil, durchwahl, is_primary
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
                    ''', (
                        company_id,
                        row.get('AP1_Vorname', ''),
                        row.get('AP1_Nachname', ''),
                        row.get('AP1_Position', ''),
                        row.get('AP1_Email', ''),
                        row.get('AP1_Telefon', ''),
                        row.get('AP1_Mobil', ''),
                        row.get('AP1_Durchwahl', '')
                    ))

                # AP2 → zweiter Kontakt
                if row.get('AP2_Vorname') or row.get('AP2_Nachname'):
                    cursor.execute('''
                        INSERT INTO contacts (
                            company_id, vorname, nachname, position,
                            email, telefon, mobil, durchwahl, is_primary
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
                    ''', (
                        company_id,
                        row.get('AP2_Vorname', ''),
                        row.get('AP2_Nachname', ''),
                        row.get('AP2_Position', ''),
                        row.get('AP2_Email', ''),
                        row.get('AP2_Telefon', ''),
                        row.get('AP2_Mobil', ''),
                        row.get('AP2_Durchwahl', '')
                    ))

                imported += 1

            except Exception as e:
                errors.append(f'Zeile {row_num}: {str(e)}')
                continue

        conn.commit()
        conn.close()

        return jsonify({
            'success': True,
            'imported': imported,
            'errors': errors,
            'message': f'{imported} Firmen importiert'
        })

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/filter/countries', methods=['GET'])
def get_countries():
    """Gibt alle Länder zurück die in der Datenbank existieren"""
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('''
            SELECT DISTINCT land, COUNT(*) as count 
            FROM companies 
            WHERE land IS NOT NULL AND land != ''
            GROUP BY land 
            ORDER BY count DESC, land ASC
        ''')
        countries = [{'land': row['land'], 'count': row['count']} for row in cursor.fetchall()]
        conn.close()
        return jsonify({'success': True, 'countries': countries})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/companies/bulk-delete', methods=['POST'])
def bulk_delete_companies():
    """Löscht mehrere Firmen auf einmal"""
    try:
        data = request.get_json()
        ids = data.get('ids', [])
        contact_option = data.get('contacts', 'keep')  # 'keep' oder 'delete'

        if not ids:
            return jsonify({'success': False, 'error': 'Keine IDs angegeben'}), 400

        conn = get_db()
        cursor = conn.cursor()

        # Placeholders für IN-Clause
        placeholders = ','.join('?' * len(ids))

        if contact_option == 'delete':
            cursor.execute(f'DELETE FROM contacts WHERE company_id IN ({placeholders})', ids)
        else:
            # Kontakte behalten, Zuordnung aufheben
            cursor.execute(f'UPDATE contacts SET company_id = NULL WHERE company_id IN ({placeholders})', ids)

        # Timeline + Reminders löschen (CASCADE würde das auch tun, aber sicherheitshalber)
        cursor.execute(f'DELETE FROM timeline WHERE company_id IN ({placeholders})', ids)
        cursor.execute(f'DELETE FROM reminders WHERE company_id IN ({placeholders})', ids)

        # Firmen löschen
        cursor.execute(f'DELETE FROM companies WHERE id IN ({placeholders})', ids)
        deleted = cursor.rowcount

        conn.commit()
        conn.close()

        return jsonify({'success': True, 'deleted': deleted})

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/admin/cleanup-land', methods=['POST'])
def cleanup_land():
    """Bereinigt ISO-Ländercodes in bestehenden Daten"""
    try:
        land_map = {
            'DE': 'Deutschland', 'AT': 'Österreich', 'CH': 'Schweiz',
            'NL': 'Niederlande', 'FR': 'Frankreich', 'IT': 'Italien',
            'ES': 'Spanien', 'PL': 'Polen', 'CZ': 'Tschechien',
            'LU': 'Luxemburg', 'BE': 'Belgien', 'DK': 'Dänemark',
        }
        conn = get_db()
        cursor = conn.cursor()
        updated = 0
        for iso, name in land_map.items():
            cursor.execute(
                "UPDATE companies SET land = ? WHERE land = ?",
                (name, iso)
            )
            updated += cursor.rowcount
        conn.commit()
        conn.close()
        return jsonify({'success': True, 'updated': updated})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/version', methods=['GET'])
def get_version():
    return jsonify({'version': '4.2.0', 'model': 'companies+contacts'})


# ==================== MAIN ====================

if __name__ == '__main__':
    init_db()
    print("=" * 50)
    print("🌊 AquaDock CRM v4.0 gestartet")
    print("=" * 50)
    print("📍 URL: http://localhost:5000")
    print("💾 Datenbank: aquadock_crm.db")
    print("🏗️  Modell: Firmen + Kontakte getrennt")
    print("=" * 50)
    app.run(debug=True, port=5000, host='0.0.0.0')
