// ========================================
// AquaDock CRM v4.0 — Firmen & Kontakte
// ========================================

// Global State
let currentFilters = { status: 'all', type: 'all', firmentyp: 'all', land: 'all', search: '' };
let currentCompanyDetails = null;
let currentCompanyId = null;   // für Modals
let currentContactId = null;   // für Kontakt-Edit
let deleteCompanyTarget = null; // { id, name }

// ========================================
// INIT
// ========================================

document.addEventListener('DOMContentLoaded', () => {
    // ISO-Ländercodes in bestehenden Daten bereinigen (einmalig, idempotent)
    fetch('/api/admin/cleanup-land', { method: 'POST' }).catch(() => {});
    loadStats();
    loadCompanies();
    loadGlobalReminders();
    initializeFilters();
    initializeSearch();
    lucide.createIcons();
});

// ========================================
// HELPER
// ========================================

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function formatWebsite(url) {
    if (!url) return null;
    // https:// voranstellen falls fehlt
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    return url;
}

function websiteLink(url, short = false) {
    if (!url) return '–';
    const href = formatWebsite(url);
    const label = short ? url.replace(/^https?:\/\/(www\.)?/i, '').split('/')[0] : escapeHtml(url);
    return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener"
        style="color:var(--primary); text-decoration:none; overflow-wrap:anywhere;"
        title="${escapeHtml(url)}">${label} <span style="font-size:10px;">↗</span></a>`;
}

function formatNumber(n) {
    return Number(n).toLocaleString('de-DE');
}

function getStatusLabel(s) {
    const map = {
        all: 'Alle', neu: 'Neu', interessant: '⭐ Interessant', lead: 'Lead', qualifiziert: 'Qualifiziert',
        akquise: 'Akquise', angebot: 'Angebot',
        gewonnen: '✅ Gewonnen', verloren: '❌ Verloren',
        kunde: 'Kunde', partner: 'Partner', inaktiv: 'Inaktiv'
    };
    return map[s] || s;
}

function getKundentypLabel(t) {
    const map = {
        // AquaDock Kategorien
        restaurant: '🍽 Restaurant',
        hotel: '🏨 Hotel',
        resort: '🌴 Resort',
        camping: '⛺ Camping',
        marina: '⚓ Marina',
        segelschule: '⛵ Segelschule',
        segelverein: '🏆 Segelverein',
        bootsverleih: '🚤 Bootsverleih',
        // CRM Typen
        neukunde: '🆕 Neukunde',
        bestandskunde: '⭐ Bestandskunde',
        interessent: '👁 Interessent',
        partner: '🤝 Partner',
        sonstige: 'Sonstige'
    };
    return map[t] || t;
}

function getFirmentypLabel(t) {
    const map = { kette: '🏭 Kette', einzeln: '🏠 Einzelbetrieb' };
    return map[t] || t;
}

function getPriorityLabel(p) {
    const map = { hoch: '🔴 Hoch', normal: '🟡 Normal', niedrig: '⚪ Niedrig' };
    return map[p] || p;
}

function getTimelineIcon(type) {
    const map = {
        note: 'file-text', call: 'phone', email: 'mail',
        meeting: 'calendar', created: 'plus-circle',
        status_change: 'refresh-cw', contact_added: 'user-plus'
    };
    return map[type] || 'activity';
}

function getTimelineIconClass(type) {
    const map = {
        note: 'icon-note', call: 'icon-call', email: 'icon-email',
        meeting: 'icon-meeting', created: 'icon-created',
        status_change: 'icon-status', contact_added: 'icon-contact'
    };
    return map[type] || '';
}

// ========================================
// API — COMPANIES
// ========================================

async function loadCompanies() {
    loadCountryFilters();
    try {
        const params = new URLSearchParams();
        if (currentFilters.status !== 'all') params.append('status', currentFilters.status);
        if (currentFilters.type !== 'all') params.append('type', currentFilters.type);
        if (currentFilters.firmentyp !== 'all') params.append('firmentyp', currentFilters.firmentyp);
        if (currentFilters.land !== 'all') params.append('land', currentFilters.land);
        if (currentFilters.search) params.append('search', currentFilters.search);

        const res = await fetch(`/api/companies?${params}`);
        const data = await res.json();
        if (data.success) renderCompanies(data.companies);
    } catch (e) {
        showError('Fehler beim Laden der Firmen');
    }
}

async function loadStats() {
    try {
        const res = await fetch('/api/stats');
        const data = await res.json();
        if (data.success) {
            const s = data.stats;
            document.getElementById('stat-total').textContent = s.total;
            document.getElementById('stat-contacts').textContent = s.total_contacts;
            document.getElementById('stat-gewonnen').textContent = s.by_status?.gewonnen || 0;
            document.getElementById('stat-value').textContent = '€ ' + formatNumber(s.total_value);
        }
    } catch (e) { console.error(e); }
}

async function loadCompanyDetails(id) {
    try {
        const res = await fetch(`/api/companies/${id}`);
        const data = await res.json();
        if (data.success) {
            currentCompanyDetails = data;
            currentCompanyId = id;
            showDetailView(data);
        }
    } catch (e) {
        showError('Fehler beim Laden der Details');
    }
}

async function createCompany(formData) {
    try {
        const res = await fetch('/api/companies', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
        });
        const data = await res.json();
        if (data.success) {
            closeCompanyModal();
            loadCompanies();
            loadStats();
            showSuccess('Firma erfolgreich erstellt');
        } else {
            showError(data.error || 'Fehler beim Erstellen');
        }
    } catch (e) {
        showError('Fehler beim Erstellen der Firma');
    }
}

async function updateCompany(id, formData) {
    try {
        const res = await fetch(`/api/companies/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
        });
        const data = await res.json();
        if (data.success) {
            closeCompanyModal();
            loadCompanies();
            loadStats();
            if (currentCompanyDetails?.company?.id === id) loadCompanyDetails(id);
            showSuccess('Firma aktualisiert');
        } else {
            showError(data.error || 'Fehler beim Aktualisieren');
        }
    } catch (e) {
        showError('Fehler beim Aktualisieren');
    }
}

// ========================================
// FIRMA LÖSCHEN – Dialog mit Kontakt-Option
// ========================================

async function showDeleteCompanyDialog(id, name) {
    deleteCompanyTarget = { id, name };
    document.getElementById('deleteCompanyName').textContent = name;

    // Kontakt-Anzahl laden
    const res = await fetch(`/api/companies/${id}/contacts/count`);
    const data = await res.json();
    const count = data.count || 0;
    document.getElementById('deleteContactCount').innerHTML =
        count > 0
            ? `<strong>⚠️ ${count} Kontakt${count !== 1 ? 'e' : ''}</strong> ${count !== 1 ? 'sind' : 'ist'} dieser Firma zugeordnet.`
            : '✅ Keine Kontakte dieser Firma zugeordnet.';

    // Default: keep
    selectDeleteOption('keep');
    document.getElementById('deleteCompanyModal').classList.add('active');
    lucide.createIcons();
}

function selectDeleteOption(option) {
    document.querySelectorAll('[name="deleteOption"]').forEach(r => r.checked = (r.value === option));
    document.getElementById('optionKeep').style.borderColor = option === 'keep' ? 'var(--primary)' : 'var(--gray-200)';
    document.getElementById('optionDelete').style.borderColor = option === 'delete' ? 'var(--danger)' : 'var(--gray-200)';
}

function closeDeleteCompanyDialog() {
    document.getElementById('deleteCompanyModal').classList.remove('active');
    deleteCompanyTarget = null;
}

// Alias für HTML onclick
function closeDeleteCompanyModal() { closeDeleteCompanyDialog(); }

async function confirmDeleteCompany() {
    if (!deleteCompanyTarget) return;
    const option = document.querySelector('[name="deleteOption"]:checked').value;
    const { id } = deleteCompanyTarget;

    try {
        const res = await fetch(`/api/companies/${id}?contacts=${option}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.success) {
            closeDeleteCompanyDialog();
            if (currentCompanyDetails?.company?.id === id) closeDetailView();
            loadCompanies();
            loadStats();
            loadGlobalReminders();
            showSuccess('Firma gelöscht');
        } else {
            showError(data.error || 'Fehler beim Löschen');
        }
    } catch (e) {
        showError('Fehler beim Löschen');
    }
}

// ========================================
// API — CONTACTS
// ========================================

async function createContact(formData) {
    try {
        const res = await fetch('/api/contacts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
        });
        const data = await res.json();
        if (data.success) {
            closeContactModal();
            if (currentCompanyId) loadCompanyDetails(currentCompanyId);
            loadCompanies();
            loadStats();
            showSuccess('Kontakt hinzugefügt');
        } else {
            showError(data.error || 'Fehler');
        }
    } catch (e) {
        showError('Fehler beim Erstellen des Kontakts');
    }
}

async function updateContact(id, formData) {
    try {
        const res = await fetch(`/api/contacts/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
        });
        const data = await res.json();
        if (data.success) {
            closeContactModal();
            if (currentCompanyId) loadCompanyDetails(currentCompanyId);
            loadCompanies();
            loadStats();
            showSuccess('Kontakt aktualisiert');
        } else {
            showError(data.error || 'Fehler');
        }
    } catch (e) {
        showError('Fehler beim Aktualisieren');
    }
}

async function deleteContact(contactId) {
    const confirmed = await showConfirm('Kontakt wirklich löschen?', 'Kontakt löschen');
    if (!confirmed) return;
    try {
        const res = await fetch(`/api/contacts/${contactId}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.success) {
            if (currentCompanyId) loadCompanyDetails(currentCompanyId);
            loadCompanies();
            loadStats();
            showSuccess('Kontakt gelöscht');
        } else {
            showError(data.error || 'Fehler');
        }
    } catch (e) {
        showError('Fehler beim Löschen');
    }
}

// ========================================
// API — TIMELINE
// ========================================

async function addTimelineEntry(companyId, entryData) {
    try {
        const res = await fetch(`/api/timeline/${companyId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(entryData)
        });
        const data = await res.json();
        if (data.success) {
            loadCompanyDetails(companyId);
            showSuccess('Aktivität hinzugefügt');
        } else {
            showError(data.error || 'Fehler');
        }
    } catch (e) {
        showError('Fehler beim Hinzufügen');
    }
}

// ========================================
// API — REMINDERS
// ========================================

async function addReminder(companyId, reminderData) {
    try {
        const res = await fetch(`/api/reminders/${companyId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(reminderData)
        });
        const data = await res.json();
        if (data.success) {
            loadCompanyDetails(companyId);
            loadGlobalReminders();
            showSuccess('Aufgabe erstellt');
        } else {
            showError(data.error || 'Fehler');
        }
    } catch (e) {
        showError('Fehler beim Erstellen der Aufgabe');
    }
}

async function completeReminder(reminderId) {
    try {
        const res = await fetch(`/api/reminders/${reminderId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'completed' })
        });
        const data = await res.json();
        if (data.success) {
            if (currentCompanyId) loadCompanyDetails(currentCompanyId);
            loadGlobalReminders();
            showSuccess('Aufgabe erledigt ✅');
        }
    } catch (e) {
        showError('Fehler');
    }
}

async function deleteReminder(reminderId) {
    const confirmed = await showConfirm('Aufgabe wirklich löschen?', 'Aufgabe löschen');
    if (!confirmed) return;
    try {
        const res = await fetch(`/api/reminders/${reminderId}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.success) {
            if (currentCompanyId) loadCompanyDetails(currentCompanyId);
            loadGlobalReminders();
            showSuccess('Aufgabe gelöscht');
        }
    } catch (e) {
        showError('Fehler beim Löschen');
    }
}

async function loadGlobalReminders() {
    try {
        const res = await fetch('/api/reminders/all');
        if (!res.ok) { renderGlobalReminders([]); return; }
        const data = await res.json();
        renderGlobalReminders(data.reminders || []);
    } catch (e) {
        renderGlobalReminders([]);
    }
}

// ========================================
// RENDERING — COMPANIES TABLE
// ========================================

function renderCompanies(companies) {
    const tbody = document.getElementById('companiesBody');

    if (!companies.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="10" class="empty-state">
                    <h3>Keine Firmen gefunden</h3>
                    <p>Legen Sie die erste Firma an oder passen Sie die Filter an</p>
                </td>
            </tr>`;
        return;
    }

    tbody.innerHTML = companies.map(c => {
        const overdueClass = c.overdue_reminders > 0 ? 'overdue-indicator' : '';
        return `
        <tr id="company-row-${c.id}" style="cursor:pointer;">
            <td style="padding:12px 8px; width:40px;" onclick="event.stopPropagation()">
                <input type="checkbox" class="company-checkbox" data-id="${c.id}"
                       onchange="onCompanyCheckboxChange()"
                       style="width:16px; height:16px; cursor:pointer; accent-color:var(--primary);">
            </td>
            <td onclick="loadCompanyDetails(${c.id})">
                <strong>${escapeHtml(c.firmenname)}</strong>
                ${c.rechtsform ? `<br><small style="color:var(--gray-500)">${escapeHtml(c.rechtsform)}</small>` : ''}
                ${c.firmentyp ? `<span class="firm-type-badge firm-type-${c.firmentyp}">${getFirmentypLabel(c.firmentyp)}</span>` : ''}
            </td>
            <td onclick="loadCompanyDetails(${c.id})">${renderPrimaryContact(c)}</td>
            <td onclick="loadCompanyDetails(${c.id})">${c.stadt ? `${escapeHtml(c.plz || '')} ${escapeHtml(c.stadt)}` : '–'}
                ${c.bundesland ? `<br><small style="color:var(--gray-500)">${escapeHtml(c.bundesland)}</small>` : ''}
            </td>
            <td onclick="loadCompanyDetails(${c.id})">${getKundentypLabel(c.kundentyp)}</td>
            <td onclick="loadCompanyDetails(${c.id})"><span class="status-badge status-${c.status}">${getStatusLabel(c.status)}</span></td>
            <td onclick="loadCompanyDetails(${c.id})">
                <span class="contact-count-badge">${c.contact_count || 0}</span>
            </td>
            <td class="${overdueClass}" onclick="loadCompanyDetails(${c.id})">
                ${c.open_reminders > 0
                    ? `<span class="reminder-indicator ${c.overdue_reminders > 0 ? 'overdue' : ''}">
                        ${c.overdue_reminders > 0 ? '⚠️' : '📋'} ${c.open_reminders}
                       </span>`
                    : '<span style="color:var(--gray-300)">–</span>'}
            </td>
            <td onclick="loadCompanyDetails(${c.id})">${c.value ? '€ ' + formatNumber(c.value) : '–'}</td>
            <td onclick="event.stopPropagation()">
                <button class="btn btn-sm btn-secondary" onclick="editCompany(${c.id})" title="Bearbeiten">
                    <i data-lucide="edit-2" style="width:14px;height:14px;"></i>
                </button>
                <button class="btn btn-sm btn-danger" onclick="showDeleteCompanyDialog(${c.id}, '${escapeHtml(c.firmenname)}')" title="Löschen">
                    <i data-lucide="trash-2" style="width:14px;height:14px;"></i>
                </button>
            </td>
        </tr>`;
    }).join('');

    lucide.createIcons();
}

function renderPrimaryContact(c) {
    if (c.primary_vorname || c.primary_nachname) {
        const name = [c.primary_anrede, c.primary_vorname, c.primary_nachname].filter(Boolean).map(escapeHtml).join(' ');
        const pos  = c.primary_position ? `<br><small style="color:var(--gray-500)">${escapeHtml(c.primary_position)}</small>` : '';
        const mail = c.primary_email ? `<br><small>📧 ${escapeHtml(c.primary_email)}</small>` : '';
        const tel  = (!c.primary_email && c.primary_telefon) ? `<br><small>📞 ${escapeHtml(c.primary_telefon)}</small>` : '';
        return `<strong>${name}</strong>${pos}${mail}${tel}`;
    }
    return '<span style="color:var(--gray-400); font-size:13px;">Kein Kontakt</span>';
}

// ========================================
// DETAIL VIEW
// ========================================

function showDetailView(data) {
    const { company, contacts, timeline, reminders } = data;

    document.getElementById('detailCompanyName').textContent = company.firmenname;
    document.getElementById('detailCompanyMeta').textContent =
        [company.rechtsform, company.stadt].filter(Boolean).join(' · ');
    const badge = document.getElementById('detailStatusBadge');
    badge.className = `status-badge status-${company.status}`;
    badge.textContent = getStatusLabel(company.status);

    renderContactsSection(contacts, company.id);
    renderTimeline(timeline);
    renderReminders(reminders);
    renderCRMInfo(company);

    document.getElementById('detailModal').classList.add('active');
    lucide.createIcons();
}

function renderContactsSection(contacts, companyId) {
    const container = document.getElementById('contactsContainer');

    if (!contacts.length) {
        container.innerHTML = `
            <div class="no-contacts">
                <p>Noch keine Ansprechpartner erfasst</p>
            </div>`;
        return;
    }

    container.innerHTML = contacts.map(c => `
        <div class="contact-card ${c.is_primary ? 'primary' : ''}">
            <div class="contact-card-header">
                <div class="contact-avatar">${escapeHtml(c.vorname[0] || '')}${escapeHtml(c.nachname[0] || '')}</div>
                <div class="contact-info">
                    <div class="contact-name">
                        ${escapeHtml(c.vorname)} ${escapeHtml(c.nachname)}
                        ${c.is_primary ? '<span class="primary-badge">Hauptkontakt</span>' : ''}
                    </div>
                    ${c.position ? `<div class="contact-position">${escapeHtml(c.position)}</div>` : ''}
                </div>
                <div class="contact-actions">
                    <button class="btn-icon" onclick="editContact(${c.id})" title="Bearbeiten">
                        <i data-lucide="edit-2"></i>
                    </button>
                    <button class="btn-icon danger" onclick="deleteContact(${c.id})" title="Löschen">
                        <i data-lucide="trash-2"></i>
                    </button>
                </div>
            </div>
            <div class="contact-details">
                ${c.email ? `<a href="mailto:${escapeHtml(c.email)}" class="contact-detail-item">
                    <i data-lucide="mail"></i> ${escapeHtml(c.email)}</a>` : ''}
                ${c.telefon ? `<span class="contact-detail-item">
                    <i data-lucide="phone"></i> ${escapeHtml(c.telefon)}</span>` : ''}
                ${c.mobil ? `<span class="contact-detail-item">
                    <i data-lucide="smartphone"></i> ${escapeHtml(c.mobil)}</span>` : ''}
                ${c.durchwahl ? `<span class="contact-detail-item">
                    <i data-lucide="hash"></i> DW ${escapeHtml(c.durchwahl)}</span>` : ''}
            </div>
        </div>
    `).join('');
}

function renderTimeline(timeline) {
    const container = document.getElementById('timelineContainer');
    if (!timeline.length) {
        container.innerHTML = '<p style="text-align:center; color:var(--gray-500); padding:20px;">Noch keine Aktivitäten</p>';
        return;
    }
    container.innerHTML = timeline.map(entry => {
        const date = new Date(entry.created_at).toLocaleString('de-DE');
        return `
            <div class="timeline-entry">
                <div class="timeline-icon ${getTimelineIconClass(entry.activity_type)}">
                    <i data-lucide="${getTimelineIcon(entry.activity_type)}"></i>
                </div>
                <div class="timeline-content">
                    <div class="timeline-header">
                        <strong>${escapeHtml(entry.title)}</strong>
                        <span class="timeline-time">${date}</span>
                    </div>
                    ${entry.content ? `<div class="timeline-text">${escapeHtml(entry.content)}</div>` : ''}
                    <div class="timeline-user">${escapeHtml(entry.user_name)}</div>
                </div>
            </div>`;
    }).join('');
}

function renderReminders(reminders) {
    const container = document.getElementById('remindersContainer');
    const openCount = document.getElementById('reminderOpenCount');
    const overdueCount = document.getElementById('reminderOverdueCount');

    const overdue = reminders.filter(r => isOverdue(r.due_date)).length;
    openCount.textContent = reminders.length;
    overdueCount.textContent = overdue;

    if (!reminders.length) {
        container.innerHTML = '<p style="text-align:center; color:var(--gray-500); padding:20px;">Keine offenen Aufgaben</p>';
        return;
    }

    container.innerHTML = reminders.map(r => {
        const overdueStatus = isOverdue(r.due_date);
        return `
            <div class="reminder-card ${overdueStatus ? 'overdue' : ''} priority-${r.priority}">
                <div class="reminder-header">
                    <span class="priority-badge priority-${r.priority}">${getPriorityLabel(r.priority)}</span>
                    <div>
                        <button class="btn-icon" onclick="completeReminder(${r.id})" title="Erledigt">
                            <i data-lucide="check"></i>
                        </button>
                        <button class="btn-icon" onclick="deleteReminder(${r.id})" title="Löschen">
                            <i data-lucide="trash-2"></i>
                        </button>
                    </div>
                </div>
                <div class="reminder-title">${escapeHtml(r.title)}</div>
                ${r.description ? `<div class="reminder-description">${escapeHtml(r.description)}</div>` : ''}
                <div class="reminder-footer">
                    <span class="reminder-date ${overdueStatus ? 'overdue-text' : ''}">
                        <i data-lucide="calendar"></i>
                        ${new Date(r.due_date).toLocaleDateString('de-DE')}
                        ${overdueStatus ? ' ⚠️ Überfällig' : ''}
                    </span>
                    <span class="reminder-assigned">${escapeHtml(r.assigned_to)}</span>
                </div>
            </div>`;
    }).join('');
}

function renderCRMInfo(company) {
    const container = document.getElementById('detailCRMInfo');
    const mapsUrl = company.lat && company.lon
        ? `https://www.openstreetmap.org/?mlat=${company.lat}&mlon=${company.lon}#map=16/${company.lat}/${company.lon}`
        : null;

    container.innerHTML = `
        <div class="crm-info-grid">
            <div class="crm-info-item">
                <span class="crm-info-label">Kundentyp</span>
                <span class="crm-info-value">${getKundentypLabel(company.kundentyp)}</span>
            </div>
            <div class="crm-info-item">
                <span class="crm-info-label">Firmentyp</span>
                <span class="crm-info-value">${(company.firmentyp === 'kette' || company.firmentyp === 'einzeln') ? getFirmentypLabel(company.firmentyp) : '–'}</span>
            </div>
            <div class="crm-info-item">
                <span class="crm-info-label">Wert</span>
                <span class="crm-info-value">${company.value ? '€ ' + formatNumber(company.value) : '–'}</span>
            </div>
            ${company.telefon ? `
            <div class="crm-info-item">
                <span class="crm-info-label">Telefon (Firma)</span>
                <span class="crm-info-value"><a href="tel:${escapeHtml(company.telefon)}">${escapeHtml(company.telefon)}</a></span>
            </div>` : ''}
            ${company.email ? `
            <div class="crm-info-item">
                <span class="crm-info-label">E-Mail (Firma)</span>
                <span class="crm-info-value"><a href="mailto:${escapeHtml(company.email)}">${escapeHtml(company.email)}</a></span>
            </div>` : ''}
            ${company.website ? `
            <div class="crm-info-item full">
                <span class="crm-info-label">Website</span>
                <span class="crm-info-value">${websiteLink(company.website)}</span>
            </div>` : ''}
            ${company.wasserdistanz != null ? `
            <div class="crm-info-item">
                <span class="crm-info-label">💧 Wasserdistanz</span>
                <span class="crm-info-value">${company.wasserdistanz} m</span>
            </div>` : ''}
            ${company.wassertyp ? `
            <div class="crm-info-item">
                <span class="crm-info-label">Wassertyp</span>
                <span class="crm-info-value">${escapeHtml(company.wassertyp)}</span>
            </div>` : ''}
            ${mapsUrl ? `
            <div class="crm-info-item full">
                <span class="crm-info-label">📍 Koordinaten</span>
                <span class="crm-info-value">
                    <a href="${mapsUrl}" target="_blank">
                        ${company.lat}, ${company.lon} (OpenStreetMap)
                    </a>
                    ${company.osm ? ` &nbsp;<a href="${escapeHtml(company.osm)}" target="_blank" rel="noopener" style="font-size:12px; color:var(--primary);">↗ OSM Objekt</a>` : ''}
                </span>
            </div>` : ''}
            ${!mapsUrl && company.osm ? `
            <div class="crm-info-item full">
                <span class="crm-info-label">🗺 OpenStreetMap</span>
                <span class="crm-info-value">
                    <a href="${escapeHtml(company.osm)}" target="_blank" rel="noopener" style="color:var(--primary);">↗ OSM Objekt öffnen</a>
                </span>
            </div>` : ''}
            ${mapsUrl ? `
            <div class="crm-info-item full">
                <span class="crm-info-label">🗺 CRM Karte</span>
                <span class="crm-info-value">
                    <a href="#" onclick="zoomToCompanyOnMap(${company.lat}, ${company.lon}, ${company.id}); return false;"
                       style="color:var(--primary); font-weight:600;">
                        📍 In CRM Karte zeigen
                    </a>
                </span>
            </div>` : ''}
            ${company.notes ? `
            <div class="crm-info-item full">
                <span class="crm-info-label">Notizen</span>
                <span class="crm-info-value">${escapeHtml(company.notes)}</span>
            </div>` : ''}
        </div>`;
}

function closeDetailView() {
    document.getElementById('detailModal').classList.remove('active');
    currentCompanyDetails = null;
}

// ========================================
// GLOBAL REMINDERS
// ========================================

function renderGlobalReminders(reminders) {
    const container = document.getElementById('globalRemindersContainer');
    if (!container) return;

    const overdue = reminders.filter(r => isOverdue(r.due_date)).length;
    document.getElementById('global-open-count').textContent = reminders.length;
    document.getElementById('global-overdue-count').textContent = overdue;

    if (!reminders.length) {
        container.innerHTML = `
            <div class="global-reminder-empty">
                <h4>✅ Keine offenen Aufgaben</h4>
                <p>Alle Aufgaben erledigt!</p>
            </div>`;
        return;
    }

    container.innerHTML = reminders.slice(0, 6).map(r => {
        const overdueStatus = isOverdue(r.due_date);
        return `
            <div class="global-reminder-card ${overdueStatus ? 'overdue' : ''} priority-${r.priority}"
                 onclick="loadCompanyDetails(${r.company_id})">
                <div class="global-reminder-header">
                    <span class="priority-badge priority-${r.priority}">${getPriorityLabel(r.priority)}</span>
                </div>
                <div class="global-reminder-title">${escapeHtml(r.title)}</div>
                <div class="global-reminder-company">🏢 ${escapeHtml(r.firmenname)}</div>
                <div class="global-reminder-footer">
                    <span class="global-reminder-date ${overdueStatus ? 'overdue-text' : ''}">
                        <i data-lucide="calendar"></i>
                        ${new Date(r.due_date).toLocaleDateString('de-DE')}
                        ${overdueStatus ? ' ⚠️' : ''}
                    </span>
                    <span>${escapeHtml(r.assigned_to)}</span>
                </div>
            </div>`;
    }).join('');

    if (reminders.length > 6) {
        container.innerHTML += `
            <div class="global-reminder-card" style="display:flex;align-items:center;justify-content:center;min-height:120px;border-style:dashed;">
                <div style="text-align:center; color:var(--gray-600);">
                    <strong>+ ${reminders.length - 6} weitere</strong><br>
                    <small>Firma öffnen für Details</small>
                </div>
            </div>`;
    }

    lucide.createIcons();
}

// ========================================
// COMPANY MODAL
// ========================================

let currentEditCompanyId = null;

function showNewCompanyModal() {
    currentEditCompanyId = null;
    document.getElementById('companyModalTitle').textContent = 'Neue Firma';
    document.getElementById('companyForm').reset();
    document.getElementById('c_land').value = 'Deutschland';
    document.getElementById('c_status').value = 'lead';
    document.getElementById('c_telefon').value = '';
    document.getElementById('c_email').value = '';
    document.getElementById('c_wasserdistanz').value = '';
    document.getElementById('c_wassertyp').value = '';
    document.getElementById('c_lat').value = '';
    document.getElementById('c_lon').value = '';
    document.getElementById('c_osm').value = '';
    const modal = document.getElementById('companyModal');
    modal.classList.add('active');
    // Scroll zum Anfang des Modals
    setTimeout(() => {
        const body = modal.querySelector('.modal-body');
        if (body) body.scrollTop = 0;
    }, 10);
    lucide.createIcons();
}

async function editCompany(id) {
    try {
        const res = await fetch(`/api/companies/${id}`);
        const data = await res.json();
        if (data.success) {
            currentEditCompanyId = id;
            const c = data.company;
            document.getElementById('companyModalTitle').textContent = 'Firma bearbeiten';
            document.getElementById('c_firmenname').value = c.firmenname || '';
            document.getElementById('c_rechtsform').value = c.rechtsform || '';
            document.getElementById('c_kundentyp').value = c.kundentyp || 'sonstige';
            document.getElementById('c_firmentyp').value = c.firmentyp || '';
            document.getElementById('c_website').value = c.website || '';
            document.getElementById('c_telefon').value = c.telefon || '';
            document.getElementById('c_email').value = c.email || '';
            document.getElementById('c_wasserdistanz').value = c.wasserdistanz || '';
            // Wassertyp setzen – falls Wert nicht im Dropdown, dynamisch hinzufügen
            const wasserSelect = document.getElementById('c_wassertyp');
            // Emojis und Sonderzeichen entfernen, dann mappen
            let wasserVal = (c.wassertyp || '').replace(/[^\w\s\/äöüÄÖÜß]/gu, '').trim();
            const wasserMap = {
                'küste': 'Küste / Meer', 'meer': 'Küste / Meer', 'küste / meer': 'Küste / Meer',
                'fluss': 'Fluss', 'badesee': 'Badesee', 'see': 'See',
                'hafen': 'Hafen', 'bach': 'Bach', 'kanal': 'Kanal',
                'teich': 'Teich', 'stausee': 'Stausee'
            };
            wasserVal = wasserMap[wasserVal.toLowerCase()] || wasserVal;
            wasserSelect.value = wasserVal;
            // Fallback: wenn Wert nicht im Dropdown, trotzdem setzen
            if (wasserSelect.value !== wasserVal && wasserVal) {
                console.log('Wassertyp nicht im Dropdown:', JSON.stringify(wasserVal));
            }
            document.getElementById('c_lat').value = c.lat || '';
            document.getElementById('c_lon').value = c.lon || '';
            document.getElementById('c_osm').value = c.osm || '';
            document.getElementById('c_strasse').value = c.strasse || '';
            document.getElementById('c_plz').value = c.plz || '';
            document.getElementById('c_stadt').value = c.stadt || '';
            document.getElementById('c_bundesland').value = c.bundesland || '';
            document.getElementById('c_land').value = c.land || 'Deutschland';
            document.getElementById('c_status').value = c.status || 'lead';
            document.getElementById('c_value').value = c.value || '';
            document.getElementById('c_notes').value = c.notes || '';
            const modal2 = document.getElementById('companyModal');
            modal2.classList.add('active');
            setTimeout(() => {
                const body2 = modal2.querySelector('.modal-body');
                if (body2) body2.scrollTop = 0;
            }, 10);
            lucide.createIcons();
        }
    } catch (e) {
        showError('Fehler beim Laden der Firma');
    }
}

function editCurrentCompany() {
    if (currentCompanyDetails?.company) {
        editCompany(currentCompanyDetails.company.id);
    }
}

function closeCompanyModal() {
    document.getElementById('companyModal').classList.remove('active');
    currentEditCompanyId = null;
}

function handleCompanySubmit(e) {
    e.preventDefault();
    const formData = {
        firmenname: document.getElementById('c_firmenname').value,
        rechtsform: document.getElementById('c_rechtsform').value,
        kundentyp: document.getElementById('c_kundentyp').value,
        firmentyp: document.getElementById('c_firmentyp').value,
        website: document.getElementById('c_website').value,
        telefon: document.getElementById('c_telefon').value,
        email: document.getElementById('c_email').value,
        strasse: document.getElementById('c_strasse').value,
        plz: document.getElementById('c_plz').value,
        stadt: document.getElementById('c_stadt').value,
        bundesland: document.getElementById('c_bundesland').value,
        land: document.getElementById('c_land').value,
        wasserdistanz: parseFloat(document.getElementById('c_wasserdistanz').value) || null,
        wassertyp: document.getElementById('c_wassertyp').value,
        lat: parseFloat(document.getElementById('c_lat').value) || null,
        lon: parseFloat(document.getElementById('c_lon').value) || null,
        osm: document.getElementById('c_osm').value.trim(),
        status: document.getElementById('c_status').value,
        value: parseInt(document.getElementById('c_value').value) || 0,
        notes: document.getElementById('c_notes').value
    };
    if (currentEditCompanyId) {
        updateCompany(currentEditCompanyId, formData);
    } else {
        createCompany(formData);
    }
}

// ========================================
// CONTACT MODAL
// ========================================

let currentEditContactId = null;

// Aus Firmendetail heraus – Firma vorausgewählt, Dropdown versteckt
function showAddContactModal() {
    currentEditContactId = null;
    document.getElementById('contactModalTitle').textContent = 'Kontakt hinzufügen';
    document.getElementById('contactModalSubtitle').textContent =
        currentCompanyDetails?.company?.firmenname || 'Ansprechpartner erfassen';
    document.getElementById('contactForm').reset();
    document.getElementById('co_anrede').value = '';
    document.getElementById('co_company_search').value = '';
    document.getElementById('co_company_id').value = '';
    document.getElementById('co_company_clear').style.display = 'none';
    document.getElementById('co_company_suggestions').style.display = 'none';
    // Firma vorausgewählt, Dropdown ausblenden
    document.getElementById('co_company_row').style.display = 'none';
    document.getElementById('co_company_id').value = currentCompanyId || '';
    document.getElementById('contactModal').classList.add('active');
    lucide.createIcons();
}

// Aus Toolbar – freie Firmenwahl
window.showNewContactModal = async function() {
    currentEditContactId = null;
    document.getElementById('contactModalTitle').textContent = 'Neuer Kontakt';
    document.getElementById('contactModalSubtitle').textContent = 'Firma optional zuweisen';
    document.getElementById('contactForm').reset();
    document.getElementById('co_company_row').style.display = '';

    // Firmen-Dropdown befüllen
    const select = document.getElementById('co_company_id');
    select.innerHTML = '<option value="">– Keine Firma –</option>';
    try {
        const res = await fetch('/api/companies?limit=9999');
        const data = await res.json();
        if (data.success) {
            data.companies
                .sort((a, b) => a.firmenname.localeCompare(b.firmenname))
                .forEach(c => {
                    const opt = document.createElement('option');
                    opt.value = c.id;
                    opt.textContent = c.firmenname;
                    select.appendChild(opt);
                });
        }
    } catch(e) {}

    document.getElementById('contactModal').classList.add('active');
    lucide.createIcons();
};

async function editContact(contactId) {
    try {
        // Zuerst aus currentCompanyDetails versuchen, sonst direkt per API laden
        let contact = currentCompanyDetails?.contacts?.find(c => c.id === contactId);

        if (!contact) {
            // Aus allContactsList (Kontakte-Tab) laden
            contact = allContactsList?.find(c => c.id === contactId);
        }

        if (!contact) {
            // Fallback: direkt per API laden
            const res = await fetch(`/api/contacts?contact_id=${contactId}`);
            const data = await res.json();
            contact = data.contacts?.[0];
        }

        if (!contact) { showError('Kontakt nicht gefunden'); return; }

        currentEditContactId = contactId;
        document.getElementById('contactModalTitle').textContent = 'Kontakt bearbeiten';
        document.getElementById('contactModalSubtitle').textContent =
            `${contact.vorname} ${contact.nachname}`;
        document.getElementById('co_anrede').value = contact.anrede || '';
        document.getElementById('co_vorname').value = contact.vorname || '';
        document.getElementById('co_nachname').value = contact.nachname || '';
        document.getElementById('co_position').value = contact.position || '';
        document.getElementById('co_email').value = contact.email || '';
        document.getElementById('co_telefon').value = contact.telefon || '';
        document.getElementById('co_mobil').value = contact.mobil || '';
        document.getElementById('co_durchwahl').value = contact.durchwahl || '';
        document.getElementById('co_is_primary').checked = !!contact.is_primary;
        document.getElementById('co_notes').value = contact.notes || '';

        // Firmen-Autocomplete anzeigen und vorausfüllen
        document.getElementById('co_company_row').style.display = '';
        document.getElementById('co_company_id').value = contact.company_id || '';
        if (contact.company_id && contact.firmenname) {
            document.getElementById('co_company_search').value = contact.firmenname;
            document.getElementById('co_company_clear').style.display = '';
        } else {
            document.getElementById('co_company_search').value = '';
            document.getElementById('co_company_clear').style.display = 'none';
        }

        document.getElementById('contactModal').classList.add('active');
        lucide.createIcons();
    } catch (e) {
        showError('Fehler beim Laden des Kontakts');
    }
}

function closeContactModal() {
    document.getElementById('contactModal').classList.remove('active');
    document.getElementById('co_company_row').style.display = 'none';
    currentEditContactId = null;
}

function handleContactSubmit(e) {
    e.preventDefault();
    const companyRow = document.getElementById('co_company_row');
    const companyIdVal = companyRow.style.display === 'none'
        ? currentCompanyId
        : (document.getElementById('co_company_id').value || null);
    const formData = {
        company_id: companyIdVal,
        anrede: document.getElementById('co_anrede').value,
        vorname: document.getElementById('co_vorname').value,
        nachname: document.getElementById('co_nachname').value,
        position: document.getElementById('co_position').value,
        email: document.getElementById('co_email').value,
        telefon: document.getElementById('co_telefon').value,
        mobil: document.getElementById('co_mobil').value,
        durchwahl: document.getElementById('co_durchwahl').value,
        is_primary: document.getElementById('co_is_primary').checked,
        notes: document.getElementById('co_notes').value
    };
    if (currentEditContactId) {
        updateContact(currentEditContactId, formData);
    } else {
        createContact(formData);
    }
}

// ========================================
// REMINDER MODAL
// ========================================

function showAddReminderModal() {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    document.getElementById('reminderForm').reset();
    document.getElementById('reminderDate').valueAsDate = tomorrow;
    document.getElementById('reminderPriority').value = 'normal';
    document.getElementById('reminderAssignedTo').value = 'Ich';
    document.getElementById('addReminderModal').classList.add('active');
    lucide.createIcons();
}

function closeReminderModal() {
    document.getElementById('addReminderModal').classList.remove('active');
}

async function handleReminderSubmit(e) {
    e.preventDefault();
    if (!currentCompanyId) { showError('Keine Firma ausgewählt'); return; }
    const reminderData = {
        title: document.getElementById('reminderTitle').value,
        description: document.getElementById('reminderDescription').value,
        due_date: document.getElementById('reminderDate').value,
        priority: document.getElementById('reminderPriority').value,
        assigned_to: document.getElementById('reminderAssignedTo').value
    };
    await addReminder(currentCompanyId, reminderData);
    closeReminderModal();
}

// ========================================
// ACTIVITY FORM
// ========================================

function addActivityFromForm() {
    if (!currentCompanyId) return;
    const type = document.getElementById('activityType').value;
    const title = document.getElementById('activityTitle').value;
    const content = document.getElementById('activityContent').value;
    if (!title) { showError('Bitte Titel eingeben'); return; }
    addTimelineEntry(currentCompanyId, { activity_type: type, title, content, user_name: 'Ich' });
    document.getElementById('activityTitle').value = '';
    document.getElementById('activityContent').value = '';
}

// ========================================
// FILTERS & SEARCH
// ========================================

function initializeFilters() {
    const statusFilters = document.getElementById('statusFilters');
    ['all', 'neu', 'interessant', 'lead', 'qualifiziert', 'akquise', 'angebot', 'gewonnen', 'verloren', 'kunde', 'partner', 'inaktiv'].forEach(s => {
        const btn = document.createElement('button');
        btn.className = `filter-btn ${s === 'all' ? 'active' : ''}`;
        btn.textContent = getStatusLabel(s);
        btn.onclick = () => setFilter('status', s, btn);
        statusFilters.appendChild(btn);
    });

    const typeFilters = document.getElementById('typeFilters');
    ['all', 'restaurant', 'hotel', 'resort', 'camping', 'marina', 'segelschule', 'segelverein', 'bootsverleih', 'sonstige'].forEach(t => {
        const btn = document.createElement('button');
        btn.className = `filter-btn ${t === 'all' ? 'active' : ''}`;
        btn.textContent = t === 'all' ? 'Alle' : getKundentypLabel(t);
        btn.onclick = () => setFilter('type', t, btn);
        typeFilters.appendChild(btn);
    });

    const firmentypFilters = document.getElementById('firmentypFilters');
    [['all', 'Alle'], ['kette', 'Kette'], ['einzeln', 'Einzelbetrieb']].forEach(([v, l]) => {
        const btn = document.createElement('button');
        btn.className = `filter-btn ${v === 'all' ? 'active' : ''}`;
        btn.textContent = l;
        btn.onclick = () => setFilter('firmentyp', v, btn);
        firmentypFilters.appendChild(btn);
    });

    // Länder dynamisch laden
    loadCountryFilters();
}

async function loadCountryFilters() {
    try {
        const res = await fetch('/api/filter/countries');
        const data = await res.json();

        const section = document.getElementById('landFilterSection');
        const container = document.getElementById('landFilters');

        container.innerHTML = '';

        if (!data.success || !data.countries || data.countries.length === 0) {
            section.style.display = 'none';
            return;
        }

        section.style.display = '';

        // "Alle" Button
        const allBtn = document.createElement('button');
        allBtn.className = `filter-btn ${currentFilters.land === 'all' ? 'active' : ''}`;
        allBtn.textContent = 'Alle';
        allBtn.onclick = () => setFilter('land', 'all', allBtn);
        container.appendChild(allBtn);

        // Ein Button pro Land
        data.countries.forEach(({ land, count }) => {
            const btn = document.createElement('button');
            btn.className = `filter-btn ${currentFilters.land === land ? 'active' : ''}`;
            btn.innerHTML = `${escapeHtml(land)} <span style="opacity:0.6; font-size:11px;">(${count})</span>`;
            btn.onclick = () => setFilter('land', land, btn);
            container.appendChild(btn);
        });
    } catch (e) {
        console.error('Länder laden fehlgeschlagen:', e);
    }
}

function setFilter(filterName, value, clickedBtn) {
    currentFilters[filterName] = value;
    const parentId = { status: 'statusFilters', type: 'typeFilters', firmentyp: 'firmentypFilters', land: 'landFilters' }[filterName];
    document.querySelectorAll(`#${parentId} .filter-btn`).forEach(b => b.classList.remove('active'));
    if (clickedBtn) clickedBtn.classList.add('active');
    loadCompanies();
}

function initializeSearch() {
    const input = document.getElementById('searchInput');
    let debounceTimer;
    input.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            currentFilters.search = input.value;
            loadCompanies();
        }, 300);
    });
}

// ========================================
// CSV EXPORT
// ========================================

async function exportToCSV() {
    try {
        const params = new URLSearchParams();
        if (currentFilters.status && currentFilters.status !== 'all')
            params.append('status', currentFilters.status);
        if (currentFilters.type && currentFilters.type !== 'all')
            params.append('kundentyp', currentFilters.type);
        if (currentFilters.land && currentFilters.land !== 'all')
            params.append('land', currentFilters.land);
        const search = document.getElementById('searchInput')?.value?.trim();
        if (search) params.append('search', search);
        window.location.href = `/api/companies/export/csv?${params}`;
    } catch (e) {
        showError('Fehler beim Export');
    }
}

console.log('✅ AquaDock CRM v4.1 geladen — Firmen & Kontakte getrennt');

// ========================================
// CSV IMPORT — Schritt 1: Datei wählen
// ========================================

let importParsedRows = [];   // alle geparsten CSV-Zeilen
let existingCompanyNames = []; // Namen bereits vorhandener Firmen

window.showImportModal = function() {
    document.getElementById('csvFile').value = '';
    document.getElementById('importFileName').textContent = '';
    document.getElementById('importPreviewBtn').disabled = true;
    importParsedRows = [];
    document.getElementById('importModal').classList.add('active');
    lucide.createIcons();
};

window.closeImportModal = function() {
    document.getElementById('importModal').classList.remove('active');
};

window.closeImportPreviewModal = function() {
    document.getElementById('importPreviewModal').classList.remove('active');
};

window.handleImportDrop = function(event) {
    event.preventDefault();
    document.getElementById('importDropzone').style.borderColor = 'var(--gray-300)';
    const file = event.dataTransfer.files[0];
    if (file && file.name.endsWith('.csv')) {
        document.getElementById('csvFile').files; // can't set directly
        // Use DataTransfer workaround
        const dt = new DataTransfer();
        dt.items.add(file);
        document.getElementById('csvFile').files = dt.files;
        handleImportFileSelect(document.getElementById('csvFile'));
    } else {
        showError('Bitte eine CSV-Datei auswählen');
    }
};

window.handleImportFileSelect = function(input) {
    const file = input.files[0];
    if (!file) return;
    document.getElementById('importFileName').textContent = '📄 ' + file.name;
    document.getElementById('importPreviewBtn').disabled = false;
};

// ========================================
// CSV IMPORT — Schritt 2: Vorschau laden
// ========================================

window.loadImportPreview = async function() {
    const fileInput = document.getElementById('csvFile');
    const file = fileInput.files[0];
    if (!file) { showError('Bitte eine CSV-Datei auswählen'); return; }

    const btn = document.getElementById('importPreviewBtn');
    btn.innerHTML = '<i data-lucide="loader"></i> Lädt...';
    btn.disabled = true;
    lucide.createIcons();

    try {
        // CSV clientseitig parsen
        const text = await file.text();
        importParsedRows = parseCSV(text);

        if (importParsedRows.length === 0) {
            showError('Keine Daten in der CSV-Datei gefunden');
            return;
        }

        // Bestehende Firmennamen vom Server laden
        const res = await fetch('/api/companies?limit=9999');
        const data = await res.json();
        existingCompanyNames = (data.companies || []).map(c => c.firmenname.trim().toLowerCase());

        // Vorschau rendern
        renderImportPreview(importParsedRows);

        // Modal wechseln
        window.closeImportModal();
        document.getElementById('importPreviewModal').classList.add('active');
        lucide.createIcons();

    } catch (e) {
        showError('Fehler beim Lesen der Datei: ' + e.message);
    } finally {
        btn.innerHTML = '<i data-lucide="eye"></i> Vorschau laden';
        btn.disabled = false;
        lucide.createIcons();
    }
};

function parseCSV(text) {
    // BOM entfernen
    text = text.replace(/^\uFEFF/, '');

    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) return [];

    // Trennzeichen erkennen
    const firstLine = lines[0];
    const delimiter = firstLine.includes(';') ? ';' : ',';

    const headers = firstLine.split(delimiter).map(h => h.trim().replace(/^"|"$/g, ''));
    const rows = [];

    for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(delimiter).map(v => v.trim().replace(/^"|"$/g, ''));
        if (values.every(v => !v)) continue; // leere Zeilen überspringen
        const row = {};
        headers.forEach((h, idx) => { row[h] = values[idx] || ''; });
        rows.push(row);
    }
    return rows;
}

function getRowName(row) {
    // Flexibles Mapping: unterstützt 'Firmenname', 'Name', 'Firma'
    return (row['Firmenname'] || row['Name'] || row['Firma'] || '').trim();
}

function getRowStadt(row) {
    return row['Stadt'] || row['Ort'] || row['Gemeinde'] || '–';
}

function getRowKontakt(row) {
    const ap1 = [row['AP1_Vorname'], row['AP1_Nachname']].filter(Boolean).join(' ');
    return ap1 || row['Telefon'] || row['Tel'] || '–';
}

function renderImportPreview(rows) {
    const tbody = document.getElementById('importPreviewBody');
    let neuCount = 0;
    let dupCount = 0;

    // Nur gültige Zeilen mit einem Namen
    const validRows = rows.map((row, originalIdx) => ({ row, originalIdx }))
        .filter(({ row }) => !!getRowName(row));

    tbody.innerHTML = validRows.map(({ row, originalIdx }) => {
        const firmenname = getRowName(row);
        const isDuplicate = existingCompanyNames.includes(firmenname.toLowerCase());

        if (isDuplicate) dupCount++; else neuCount++;

        const statusBadge = isDuplicate
            ? '<span class="import-badge duplicate">⚠️ Duplikat</span>'
            : '<span class="import-badge new">✅ Neu</span>';

        const kontakt = getRowKontakt(row);
        const stadt = getRowStadt(row);
        const crmStatus = row['Status'] || 'neu';

        const td = 'style="padding:9px 14px; font-size:13px; white-space:nowrap; border-bottom:1px solid var(--gray-100);"';
        const tdMuted = 'style="padding:9px 14px; font-size:13px; color:var(--gray-500); white-space:nowrap; border-bottom:1px solid var(--gray-100);"';

        const kategorie = row['Kategorie'] || row['Firmentyp'] || row['Typ'] || '–';
        const strasse   = row['Straße'] || row['Strasse'] || row['Adresse'] || '–';
        const plz       = row['PLZ'] || row['Postleitzahl'] || '–';
        const land      = row['Land'] || '–';
        const telefon   = row['Telefon'] || row['Tel'] || row['AP1_Telefon'] || '–';
        const email     = row['Email'] || row['E-Mail'] || row['EMail'] || row['email'] || '–';
        const website   = row['Website'] || row['Webseite'] || '–';
        const wassertyp = (row['Wassertyp'] || '').replace('🏞', '').replace('🌊', '').replace('💧', '').trim() || '–';
        const wassdist  = row['Wasserdistanz (m)'] || row['Wasserdistanz'] || '–';

        return `<tr class="${isDuplicate ? 'import-row-duplicate' : ''}">
            <td ${td}>
                <input type="checkbox" class="import-checkbox" data-idx="${originalIdx}"
                       ${!isDuplicate ? 'checked' : ''}
                       onchange="updateImportCount()"
                       style="width:16px; height:16px; cursor:pointer; accent-color:var(--primary);">
            </td>
            <td ${td}>${statusBadge}</td>
            <td ${td}><strong>${escapeHtml(firmenname)}</strong></td>
            <td ${tdMuted}>${escapeHtml(kategorie)}</td>
            <td ${tdMuted}>${escapeHtml(strasse)}</td>
            <td ${tdMuted}>${escapeHtml(plz)}</td>
            <td ${tdMuted}>${escapeHtml(stadt)}</td>
            <td ${tdMuted}>${escapeHtml(land)}</td>
            <td ${tdMuted}>${escapeHtml(telefon)}</td>
            <td ${tdMuted}>${email !== '–' ? `<a href='mailto:${escapeHtml(email)}' style='color:var(--primary)'>${escapeHtml(email)}</a>` : '–'}</td>
            <td ${tdMuted}>${website !== '–' ? websiteLink(website, true) : '–'}</td>
            <td ${tdMuted}>${escapeHtml(wassertyp)}</td>
            <td ${tdMuted}>${escapeHtml(wassdist)}</td>
            <td ${td}><span class="status-badge status-${crmStatus}">${getStatusLabel(crmStatus)}</span></td>
        </tr>`;
    }).join('');

    // Zusammenfassung
    const total = neuCount + dupCount;
    document.getElementById('importSummary').innerHTML = `
        <div class="import-stat-box new">
            <div class="import-stat-num">${neuCount}</div>
            <div class="import-stat-label">✅ Neue Firmen</div>
        </div>
        <div class="import-stat-box duplicate">
            <div class="import-stat-num">${dupCount}</div>
            <div class="import-stat-label">⚠️ Duplikate</div>
        </div>
        <div class="import-stat-box total">
            <div class="import-stat-num">${total}</div>
            <div class="import-stat-label">📊 Gesamt</div>
        </div>
        <div style="flex:1; display:flex; align-items:center; font-size:13px; color:var(--gray-600);">
            Duplikate sind standardmäßig <strong style="margin:0 4px;">abgewählt</strong>. 
            Du kannst sie manuell aktivieren.
        </div>`;

    document.getElementById('importPreviewSubtitle').textContent =
        `Schritt 2 von 2 — ${total} Zeilen gefunden, ${dupCount} Duplikate erkannt`;

    // Alle auswählen Checkbox
    document.getElementById('selectAllImport').checked = true;
    updateImportCount();
}

window.toggleAllImportRows = function(checked) {
    document.querySelectorAll('.import-checkbox').forEach(cb => cb.checked = checked);
    updateImportCount();
};

window.updateImportCount = function() {
    const selected = document.querySelectorAll('.import-checkbox:checked').length;
    const total = document.querySelectorAll('.import-checkbox').length;
    const label = document.getElementById('importConfirmLabel');
    const selectAll = document.getElementById('selectAllImport');
    if (label) label.textContent = `${selected} von ${total} importieren`;
    if (selectAll) {
        selectAll.checked = selected === total && total > 0;
        selectAll.indeterminate = selected > 0 && selected < total;
    }
};

// ========================================
// CSV IMPORT — Schritt 3: Importieren
// ========================================

window.confirmImport = async function() {
    // data-idx enthält den originalIdx aus importParsedRows
    const selectedIdxs = [...document.querySelectorAll('.import-checkbox:checked')]
        .map(cb => parseInt(cb.dataset.idx))
        .filter(i => !isNaN(i));

    if (selectedIdxs.length === 0) {
        showError('Keine Zeilen ausgewählt');
        return;
    }

    const btn = document.getElementById('importConfirmBtn');
    btn.disabled = true;
    btn.innerHTML = '<i data-lucide="loader"></i> Importiere...';
    lucide.createIcons();

    try {
        const selectedRows = selectedIdxs.map(i => importParsedRows[i]).filter(Boolean);

        // Als CSV neu zusammenbauen und an Backend senden
        const headers = Object.keys(selectedRows[0]);
        const csvContent = [
            headers.join(';'),
            ...selectedRows.map(row => headers.map(h => row[h] || '').join(';'))
        ].join('\n');

        const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const formData = new FormData();
        formData.append('file', blob, 'import.csv');

        const res = await fetch('/api/companies/import/csv', { method: 'POST', body: formData });
        const data = await res.json();

        if (data.success) {
            window.closeImportPreviewModal();
            loadCompanies();
            loadStats();
            let msg = `${data.imported} Firmen erfolgreich importiert!`;
            if (data.errors?.length > 0) msg += ` (${data.errors.length} Fehler)`;
            showSuccess(msg);
        } else {
            showError(data.error || 'Import fehlgeschlagen');
        }
    } catch (e) {
        showError('Fehler: ' + e.message);
    } finally {
        btn.disabled = false;
        updateImportCount();
        lucide.createIcons();
    }
};

window.downloadCSVTemplate = function() {
    const headers = [
        'Firmenname', 'Rechtsform', 'Kundentyp', 'Firmentyp',
        'Straße', 'PLZ', 'Stadt', 'Bundesland', 'Land',
        'AP1_Vorname', 'AP1_Nachname', 'AP1_Position', 'AP1_Email',
        'AP1_Telefon', 'AP1_Mobil', 'AP1_Durchwahl',
        'AP2_Vorname', 'AP2_Nachname', 'AP2_Position', 'AP2_Email',
        'AP2_Telefon', 'AP2_Mobil', 'AP2_Durchwahl',
        'Status', 'Wert', 'Notizen'
    ].join(';');
    const example = [
        'Muster GmbH', 'GmbH', 'neukunde', 'einzeln',
        'Musterstraße 1', '12345', 'Berlin', 'Berlin', 'Deutschland',
        'Max', 'Mustermann', 'Geschäftsführer', 'max@muster.de',
        '030 12345', '0171 12345', '101',
        '', '', '', '', '', '', '',
        'lead', '5000', 'Notiz hier'
    ].join(';');
    const csv = headers + '\n' + example;
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'aquadock_import_vorlage.csv';
    a.click();
    URL.revokeObjectURL(url);
};

// Legacy — nicht mehr genutzt aber zur Sicherheit
window.handleCSVImport = function() { window.loadImportPreview(); };
window.updateImportFileName = window.handleImportFileSelect;

console.log('✅ Import-Vorschau mit Duplikat-Erkennung bereit v4.1');
// ========================================
// MASSENLÖSCHEN
// ========================================

let bulkSelectedIds = new Set();

window.onCompanyCheckboxChange = function() {
    bulkSelectedIds.clear();
    document.querySelectorAll('.company-checkbox:checked').forEach(cb => {
        bulkSelectedIds.add(parseInt(cb.dataset.id));
    });
    // Bar beim ersten Anklicken sichtbar machen damit "Alle markieren" erscheint
    if (bulkSelectedIds.size > 0) {
        document.getElementById('bulkDeleteBar').style.display = 'flex';
    }
    updateBulkBar();

    // Alle-auswählen Checkbox synchronisieren
    const all = document.querySelectorAll('.company-checkbox');
    const checked = document.querySelectorAll('.company-checkbox:checked');
    const selectAll = document.getElementById('selectAllCompanies');
    if (selectAll) {
        selectAll.checked = all.length > 0 && checked.length === all.length;
        selectAll.indeterminate = checked.length > 0 && checked.length < all.length;
    }
};

window.toggleAllCompanies = function(checked) {
    document.querySelectorAll('.company-checkbox').forEach(cb => {
        cb.checked = checked;
        const id = parseInt(cb.dataset.id);
        if (checked) bulkSelectedIds.add(id);
        else bulkSelectedIds.delete(id);
    });
    updateBulkBar();
};

window.selectAllCompanies = function() {
    // Alle sichtbaren Checkboxen ankreuzen
    document.querySelectorAll('.company-checkbox').forEach(cb => {
        cb.checked = true;
        bulkSelectedIds.add(parseInt(cb.dataset.id));
    });
    updateBulkBar();
    showSuccess(`${bulkSelectedIds.size} Firmen ausgewählt`);
};

function updateBulkBar() {
    const bar = document.getElementById('bulkDeleteBar');
    const counter = document.getElementById('bulkSelectedCount');
    const n = bulkSelectedIds.size;
    if (n > 0) {
        bar.style.display = 'flex';
        counter.textContent = `${n} Firma${n !== 1 ? 'en' : ''} ausgewählt`;
    } else {
        bar.style.display = 'none';
    }
}

window.clearBulkSelection = function() {
    bulkSelectedIds.clear();
    document.querySelectorAll('.company-checkbox').forEach(cb => cb.checked = false);
    const selectAll = document.getElementById('selectAllCompanies');
    if (selectAll) { selectAll.checked = false; selectAll.indeterminate = false; }
    updateBulkBar();
};

window.showBulkDeleteDialog = function() {
    const n = bulkSelectedIds.size;
    if (n === 0) return;
    document.getElementById('bulkDeleteSubtitle').textContent =
        `${n} Firma${n !== 1 ? 'en' : ''} werden gelöscht`;
    document.getElementById('bulkDeleteSummary').innerHTML =
        `<strong>${n} Firma${n !== 1 ? 'en' : ''}</strong> mit allen zugehörigen Erinnerungen und Aktivitäten.`;
    document.getElementById('bulkDeleteConfirmLabel').textContent =
        `${n} Firma${n !== 1 ? 'en' : ''} löschen`;

    // Radio auf "keep" zurücksetzen
    document.querySelector('input[name="bulkContactOption"][value="keep"]').checked = true;
    updateBulkOption(document.querySelector('input[name="bulkContactOption"][value="keep"]'));

    document.getElementById('bulkDeleteModal').classList.add('active');
    lucide.createIcons();
};

window.closeBulkDeleteModal = function() {
    document.getElementById('bulkDeleteModal').classList.remove('active');
};

window.updateBulkOption = function(radio) {
    document.getElementById('bulkOptionKeepLabel').style.borderColor =
        radio.value === 'keep' ? 'var(--primary)' : 'var(--gray-200)';
    document.getElementById('bulkOptionDeleteLabel').style.borderColor =
        radio.value === 'delete' ? '#dc2626' : 'var(--gray-200)';
};

window.executeBulkDelete = async function() {
    const contactOption = document.querySelector('input[name="bulkContactOption"]:checked').value;
    const ids = [...bulkSelectedIds];
    const btn = document.getElementById('bulkDeleteConfirmLabel');
    btn.textContent = 'Wird gelöscht...';

    try {
        const res = await fetch('/api/companies/bulk-delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids, contacts: contactOption })
        });
        const data = await res.json();
        if (data.success) {
            closeBulkDeleteModal();
            clearBulkSelection();
            loadCompanies();
            loadStats();
            showSuccess(`${data.deleted} Firma${data.deleted !== 1 ? 'en' : ''} gelöscht`);
        } else {
            showError(data.error || 'Fehler beim Löschen');
        }
    } catch (e) {
        showError('Fehler: ' + e.message);
    } finally {
        btn.textContent = `${ids.length} Firmen löschen`;
    }
};

// ========================================
// KONTAKTE ÜBERSICHT (aufklappbar)
// ========================================

let allContactsList = [];
let contactsPanelOpen = false;

window.switchTab = async function(tab) {
    const views = { firmen: 'viewFirmen', kontakte: 'viewKontakte', vorlagen: 'viewVorlagen', einstellungen: 'viewEinstellungen', maillog: 'viewMaillog', karte: 'viewKarte' };
    const tabs  = { firmen: 'tabFirmen', kontakte: 'tabKontakte', vorlagen: 'tabVorlagen', einstellungen: 'tabEinstellungen', maillog: 'tabMaillog', karte: 'tabKarte' };

    // Alle ausblenden / deaktivieren
    Object.values(views).forEach(id => { const el = document.getElementById(id); if(el) el.style.display = 'none'; });
    Object.values(tabs).forEach(id => {
        const el = document.getElementById(id);
        if(el) { el.style.color = 'var(--gray-500)'; el.style.borderBottom = '2px solid transparent'; }
    });

    // Aktiven Tab einblenden
    const activeView = document.getElementById(views[tab]);
    const activeTab  = document.getElementById(tabs[tab]);
    if(activeView) activeView.style.display = '';
    if(activeTab)  { activeTab.style.color = 'var(--primary)'; activeTab.style.borderBottom = '2px solid var(--primary)'; }

    if (tab === 'kontakte') await loadAllContacts();
    if (tab === 'vorlagen') await loadTemplates();
    if (tab === 'einstellungen') await loadSmtpSettings();
    if (tab === 'maillog') await loadMailLog();
    if (tab === 'karte') { setTimeout(() => { initKarte(); if (karteMap) karteMap.invalidateSize(); }, 100); }
    lucide.createIcons();
};

async function loadAllContacts() {
    try {
        const res = await fetch('/api/contacts');
        const data = await res.json();
        if (data.success) {
            allContactsList = data.contacts;
            renderContactsList(allContactsList);
        }
    } catch(e) {
        showError('Fehler beim Laden der Kontakte');
    }
}

window.filterContactsList = function(query) {
    const q = query.toLowerCase();
    const filtered = q
        ? allContactsList.filter(c =>
            (c.vorname + ' ' + c.nachname).toLowerCase().includes(q) ||
            (c.firmenname || '').toLowerCase().includes(q) ||
            (c.email || '').toLowerCase().includes(q) ||
            (c.telefon || '').toLowerCase().includes(q) ||
            (c.mobil || '').toLowerCase().includes(q)
          )
        : allContactsList;
    renderContactsList(filtered);
};

let bulkSelectedContactIds = new Set();

function updateContactBulkBar() {
    const bar = document.getElementById('contactBulkBar');
    const count = document.getElementById('contactBulkCount');
    if (!bar) return;
    if (bulkSelectedContactIds.size > 0) {
        bar.style.display = 'flex';
        count.textContent = `${bulkSelectedContactIds.size} Kontakt${bulkSelectedContactIds.size !== 1 ? 'e' : ''} ausgewählt`;
    } else {
        bar.style.display = 'none';
    }
}

window.toggleContactCheckbox = function(id, cb) {
    if (cb.checked) bulkSelectedContactIds.add(id);
    else bulkSelectedContactIds.delete(id);
    updateContactBulkBar();
};

window.selectAllContacts = function() {
    const checkboxes = document.querySelectorAll('.contact-bulk-cb');
    checkboxes.forEach(cb => {
        const id = parseInt(cb.dataset.id);
        cb.checked = true;
        bulkSelectedContactIds.add(id);
    });
    updateContactBulkBar();
};

window.clearContactSelection = function() {
    bulkSelectedContactIds.clear();
    document.querySelectorAll('.contact-bulk-cb').forEach(cb => cb.checked = false);
    updateContactBulkBar();
};

window.bulkDeleteContacts = async function() {
    const ids = [...bulkSelectedContactIds];
    if (!confirm(`${ids.length} Kontakt${ids.length !== 1 ? 'e' : ''} wirklich löschen?`)) return;
    try {
        let deleted = 0;
        for (const id of ids) {
            const res = await fetch(`/api/contacts/${id}`, { method: 'DELETE' });
            const data = await res.json();
            if (data.success) deleted++;
        }
        bulkSelectedContactIds.clear();
        await loadAllContacts();
        loadStats();
        showSuccess(`${deleted} Kontakt${deleted !== 1 ? 'e' : ''} gelöscht`);
    } catch(e) { showError('Fehler beim Löschen'); }
};

function renderContactsList(contacts) {
    const tbody = document.getElementById('contactsListBody');
    const label = document.getElementById('contactsCountLabel');

    if (label) label.textContent = `${contacts.length} von ${allContactsList.length} Kontakten`;
    bulkSelectedContactIds.clear();
    updateContactBulkBar();

    if (contacts.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="padding:32px; text-align:center; color:var(--gray-400);">Keine Kontakte gefunden</td></tr>`;
        return;
    }

    tbody.innerHTML = contacts.map(c => {
        const anrede = c.anrede ? `${escapeHtml(c.anrede)} ` : '';
        const name = `${anrede}${escapeHtml(c.vorname)} ${escapeHtml(c.nachname)}`;
        const primary = c.is_primary ? ' <span style="font-size:10px; background:#dbeafe; color:#1e40af; padding:1px 6px; border-radius:8px;">Haupt</span>' : '';
        const firma = c.firmenname
            ? `<a href="#" onclick="loadCompanyDetails(${c.company_id}); return false;"
                  style="color:var(--primary); text-decoration:none; font-weight:500;"
                  title="Firma öffnen">${escapeHtml(c.firmenname)}</a>`
            : '<span style="color:var(--gray-300);">–</span>';
        const tel = c.telefon
            ? `<a href="tel:${escapeHtml(c.telefon)}" style="color:var(--gray-700);">${escapeHtml(c.telefon)}</a>`
            : (c.mobil ? `<a href="tel:${escapeHtml(c.mobil)}" style="color:var(--gray-700);">${escapeHtml(c.mobil)}</a>` : '–');
        const email = c.email
            ? `<a href="mailto:${escapeHtml(c.email)}" style="color:var(--primary);">${escapeHtml(c.email)}</a>`
            : '–';

        return `<tr style="border-bottom:1px solid var(--gray-100); cursor:pointer;" onclick="showContactDetail(${c.id})" onmouseenter="this.style.background='var(--gray-50)'" onmouseleave="this.style.background=''">
            <td style="padding:12px 16px; width:40px;" onclick="event.stopPropagation()">
                <input type="checkbox" class="contact-bulk-cb" data-id="${c.id}"
                       onchange="toggleContactCheckbox(${c.id}, this)"
                       style="width:16px; height:16px; cursor:pointer;">
            </td>
            <td style="padding:12px 16px; font-weight:600; color:var(--primary);">${name}${primary}</td>
            <td style="padding:12px 16px; font-size:13px; color:var(--gray-600);">${escapeHtml(c.position || '–')}</td>
            <td style="padding:12px 16px; font-size:13px;">${firma}</td>
            <td style="padding:12px 16px; font-size:13px;">${tel}</td>
            <td style="padding:12px 16px; font-size:13px;">${email}</td>
            <td style="padding:12px 16px;" onclick="event.stopPropagation()">
                <button class="btn btn-sm btn-secondary" onclick="editContact(${c.id})" title="Bearbeiten">
                    <i data-lucide="edit-2" style="width:14px;height:14px;"></i>
                </button>
                <button class="btn btn-sm btn-danger" onclick="deleteContactFromList(${c.id}, '${escapeHtml(c.vorname + ' ' + c.nachname)}')" title="Löschen">
                    <i data-lucide="trash-2" style="width:14px;height:14px;"></i>
                </button>
            </td>
        </tr>`;
    }).join('');
    lucide.createIcons();
}

window.deleteContactFromList = async function(contactId, name) {
    if (!confirm(`Kontakt "${name}" wirklich löschen?`)) return;
    try {
        const res = await fetch(`/api/contacts/${contactId}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.success) {
            allContactsList = allContactsList.filter(c => c.id !== contactId);
            renderContactsList(allContactsList);
            loadStats();
            showSuccess('Kontakt gelöscht');
        }
    } catch(e) { showError('Fehler beim Löschen'); }
};

// ========================================
// E-MAIL VORLAGEN
// ========================================

let allTemplates = [];
let currentEditTemplateId = null;

async function loadTemplates() {
    try {
        const res = await fetch('/api/templates');
        const data = await res.json();
        if (data.success) {
            allTemplates = data.templates;
            renderTemplates(allTemplates);
            // Tab-Zähler
            const badge = document.getElementById('tabVorlagenCount');
            if (badge) {
                badge.textContent = allTemplates.length || '';
                badge.style.background = allTemplates.length ? 'var(--primary)' : 'var(--gray-300)';
            }
        }
    } catch(e) { showError('Fehler beim Laden der Vorlagen'); }
}

function renderTemplates(templates) {
    const container = document.getElementById('templatesList');
    if (!container) return;

    if (templates.length === 0) {
        container.innerHTML = `
            <div style="text-align:center; padding:64px; color:var(--gray-400); border:2px dashed var(--gray-200); border-radius:var(--radius-lg);">
                <i data-lucide="mail" style="width:40px;height:40px; margin:0 auto 12px; display:block; opacity:0.3;"></i>
                <div style="font-size:15px; font-weight:600; margin-bottom:6px;">Noch keine Vorlagen</div>
                <div style="font-size:13px;">Klicke auf „Neue Vorlage" um loszulegen</div>
            </div>`;
        lucide.createIcons();
        return;
    }

    container.innerHTML = templates.map(t => `
        <div style="background:white; border:1px solid var(--gray-200); border-radius:var(--radius-lg);
                    padding:20px 24px; display:flex; align-items:flex-start; gap:16px;">
            <div style="background:#e0f2fe; color:#0369a1; border-radius:var(--radius);
                        padding:10px; flex-shrink:0;">
                <i data-lucide="mail" style="width:20px;height:20px;"></i>
            </div>
            <div style="flex:1; min-width:0;">
                <div style="font-weight:700; font-size:15px; color:var(--gray-900); margin-bottom:4px;">
                    ${escapeHtml(t.name)}
                </div>
                <div style="font-size:13px; color:var(--gray-600); margin-bottom:6px;">
                    <strong>Betreff:</strong> ${escapeHtml(t.subject)}
                </div>
                <div style="font-size:12px; color:var(--gray-400); white-space:pre-wrap; max-height:60px;
                            overflow:hidden; font-family:monospace; background:var(--gray-50);
                            padding:8px 10px; border-radius:6px; border:1px solid var(--gray-100);">
                    ${escapeHtml(t.body.substring(0, 200))}${t.body.length > 200 ? '…' : ''}
                </div>
                <div style="font-size:11px; color:var(--gray-400); margin-top:6px;">
                    Erstellt: ${new Date(t.created_at).toLocaleDateString('de-DE')}
                </div>
            </div>
            <div style="display:flex; gap:8px; flex-shrink:0;">
                <button class="btn btn-sm btn-secondary" onclick="editTemplate(${t.id})" title="Bearbeiten">
                    <i data-lucide="edit-2" style="width:14px;height:14px;"></i>
                </button>
                <button class="btn btn-sm btn-danger" onclick="deleteTemplate(${t.id}, '${escapeHtml(t.name)}')" title="Löschen">
                    <i data-lucide="trash-2" style="width:14px;height:14px;"></i>
                </button>
            </div>
        </div>
    `).join('');
    // Lucide nur auf templatesList beschränken – nicht globale Buttons überschreiben
    lucide.createIcons({ nameAttr: 'data-lucide', attrs: {}, nodes: [container] });
}

window.showTemplateEditor = function(id = null) {
    currentEditTemplateId = id;
    const t = id ? allTemplates.find(x => x.id === id) : null;
    document.getElementById('templateModalTitle').textContent = t ? 'Vorlage bearbeiten' : 'Neue Vorlage';
    document.getElementById('tpl_name').value = t?.name || '';
    document.getElementById('tpl_subject').value = t?.subject || '';
    document.getElementById('tpl_body').value = t?.body || '';
    document.getElementById('templateModal').classList.add('active');
    // Keine lucide.createIcons() hier – würde Platzhalter-Buttons als Icons rendern
};

window.editTemplate = function(id) { showTemplateEditor(id); };

window.closeTemplateModal = function() {
    document.getElementById('templateModal').classList.remove('active');
    currentEditTemplateId = null;
};

window.saveTemplate = async function() {
    const name = document.getElementById('tpl_name').value.trim();
    const subject = document.getElementById('tpl_subject').value.trim();
    const body = document.getElementById('tpl_body').value.trim();
    if (!name || !subject || !body) { showError('Bitte alle Pflichtfelder ausfüllen'); return; }

    const payload = { name, subject, body };
    const url = currentEditTemplateId ? `/api/templates/${currentEditTemplateId}` : '/api/templates';
    const method = currentEditTemplateId ? 'PUT' : 'POST';

    try {
        const res = await fetch(url, { method, headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
        const data = await res.json();
        if (data.success) {
            closeTemplateModal();
            await loadTemplates();
            showSuccess(currentEditTemplateId ? 'Vorlage aktualisiert' : 'Vorlage erstellt');
        } else { showError(data.error || 'Fehler beim Speichern'); }
    } catch(e) { showError('Fehler beim Speichern'); }
};

window.deleteTemplate = async function(id, name) {
    if (!confirm(`Vorlage „${name}" wirklich löschen?`)) return;
    try {
        const res = await fetch(`/api/templates/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.success) { await loadTemplates(); showSuccess('Vorlage gelöscht'); }
    } catch(e) { showError('Fehler beim Löschen'); }
};

// ========================================
// SMTP EINSTELLUNGEN
// ========================================

async function loadSmtpSettings() {
    try {
        const res = await fetch('/api/settings/smtp');
        const data = await res.json();
        if (data.success && data.smtp) {
            const s = data.smtp;
            document.getElementById('smtp_host').value = s.host || '';
            document.getElementById('smtp_port').value = s.port || '587';
            document.getElementById('smtp_user').value = s.user || '';
            document.getElementById('smtp_name').value = s.name || '';
            // Badge
            const badge = document.getElementById('smtpStatusBadge');
            if (badge) {
                badge.textContent = s.configured ? '✅ Konfiguriert' : 'Nicht konfiguriert';
                badge.style.background = s.configured ? '#dcfce7' : 'var(--gray-100)';
                badge.style.color = s.configured ? '#166534' : 'var(--gray-500)';
            }
        }
    } catch(e) {}
}

window.saveSmtpSettings = async function() {
    const payload = {
        host:     document.getElementById('smtp_host').value.trim(),
        port:     document.getElementById('smtp_port').value,
        user:     document.getElementById('smtp_user').value.trim(),
        password: document.getElementById('smtp_password').value,
        name:     document.getElementById('smtp_name').value.trim(),
    };
    if (!payload.host || !payload.user) { showError('Host und E-Mail sind Pflicht'); return; }
    try {
        const res = await fetch('/api/settings/smtp', {
            method: 'POST', headers: {'Content-Type':'application/json'},
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success) {
            showSuccess('SMTP-Einstellungen gespeichert');
            document.getElementById('smtp_password').value = '';
            loadSmtpSettings();
        } else { showError(data.error || 'Fehler'); }
    } catch(e) { showError('Fehler beim Speichern'); }
};

window.sendTestMail = async function() {
    const to = document.getElementById('smtp_test_email').value.trim();
    if (!to) { showError('Bitte Test-Zieladresse eingeben'); return; }
    const btn = event.target.closest('button');
    btn.disabled = true;
    btn.innerHTML = '<i data-lucide="loader" style="width:14px;height:14px;"></i> Sende...';
    lucide.createIcons();
    try {
        const res = await fetch('/api/settings/smtp/test', {
            method: 'POST', headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ to_email: to })
        });
        const data = await res.json();
        if (data.success) showSuccess('Test-Mail erfolgreich gesendet ✅');
        else showError('Fehler: ' + (data.error || 'Unbekannt'));
    } catch(e) { showError('Verbindungsfehler'); }
    finally {
        btn.disabled = false;
        btn.innerHTML = '<i data-lucide="send" style="width:14px;height:14px;"></i> Test senden';
        lucide.createIcons();
    }
};

window.toggleSmtpPassword = function() {
    const input = document.getElementById('smtp_password');
    const eye   = document.getElementById('smtpPwEye');
    if (input.type === 'password') {
        input.type = 'text';
        eye.setAttribute('data-lucide', 'eye-off');
    } else {
        input.type = 'password';
        eye.setAttribute('data-lucide', 'eye');
    }
    lucide.createIcons();
};

// ========================================
// MASSENMAIL
// ========================================

window.showMassenmailModal = async function() {
    // Vorlagen ins Dropdown laden
    const sel = document.getElementById('mm_template');
    sel.innerHTML = '<option value="">– Vorlage wählen –</option>';
    allTemplates.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.id;
        opt.textContent = t.name;
        sel.appendChild(opt);
    });
    document.getElementById('mm_preview_box').style.display = 'none';
    document.getElementById('mm_send_progress').textContent = '';
    document.getElementById('mm_recipient_count').textContent = '';
    document.getElementById('massenmailModal').classList.add('active');
    lucide.createIcons();
    await updateRecipientCount();
};

window.closeMassenmailModal = function() {
    document.getElementById('massenmailModal').classList.remove('active');
};

window.updateRecipientCount = async function() {
    await updateMassenmailPreview();
};

window.updateMassenmailPreview = async function() {
    const tplId = document.getElementById('mm_template').value;
    const mode  = document.querySelector('input[name="mm_recipients"]:checked')?.value || 'all_contacts';
    if (!tplId) {
        document.getElementById('mm_recipient_count').textContent = '';
        document.getElementById('mm_preview_box').style.display = 'none';
        return;
    }
    try {
        const res = await fetch('/api/massenmail/preview', {
            method: 'POST', headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ template_id: parseInt(tplId), mode })
        });
        const data = await res.json();
        if (data.success) {
            document.getElementById('mm_recipient_count').innerHTML =
                `<strong style="color:var(--primary);">${data.count}</strong> Empfänger mit gültiger E-Mail-Adresse`;
            document.getElementById('mm_preview_subject').textContent = data.subject;
            document.getElementById('mm_preview_body').textContent = data.body;
            document.getElementById('mm_preview_box').style.display = '';
            // Empfängerliste zurücksetzen
            const btn = document.getElementById('mm_toggle_list_btn');
            if (btn) { btn.style.display = data.count > 0 ? '' : 'none'; btn.textContent = 'Liste anzeigen'; }
            document.getElementById('mm_recipient_list').style.display = 'none';
        }
    } catch(e) {}
};

window.startMassenmail = async function() {
    const tplId = document.getElementById('mm_template').value;
    const mode  = document.querySelector('input[name="mm_recipients"]:checked')?.value || 'all_contacts';
    const delay = document.getElementById('mm_delay').value;

    if (!tplId) { showError('Bitte eine Vorlage wählen'); return; }

    const countEl = document.getElementById('mm_recipient_count');
    const count   = countEl.textContent.match(/\d+/)?.[0] || '?';
    if (!confirm(`Massenmail an ${count} Empfänger senden?\n\nDieser Vorgang kann einige Minuten dauern.`)) return;

    const btn = document.getElementById('mm_send_btn');
    const progress = document.getElementById('mm_send_progress');
    btn.disabled = true;
    btn.innerHTML = '<i data-lucide="loader" style="width:15px;height:15px;"></i> Wird gesendet...';
    progress.textContent = 'Versand läuft – bitte warten...';
    lucide.createIcons();

    try {
        const res = await fetch('/api/massenmail/send', {
            method: 'POST', headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ template_id: parseInt(tplId), mode, delay: parseInt(delay) })
        });
        const data = await res.json();
        if (data.success) {
            closeMassenmailModal();
            showSuccess(`✅ Versand abgeschlossen – ${data.sent} gesendet, ${data.errors} Fehler`);
            if (data.errors > 0) showError(`${data.errors} Mails konnten nicht gesendet werden – Details im Versandlog`);
        } else {
            showError('Fehler: ' + (data.error || 'Unbekannt'));
        }
    } catch(e) {
        showError('Verbindungsfehler beim Senden');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i data-lucide="send" style="width:15px;height:15px;"></i> Jetzt senden';
        progress.textContent = '';
        lucide.createIcons();
    }
};

// ========================================
// VERSANDLOG
// ========================================

window.loadMailLog = async function() {
    try {
        const res = await fetch('/api/massenmail/log');
        const data = await res.json();
        if (!data.success) return;
        const logs = data.logs;

        // Tab-Zähler
        const badge = document.getElementById('tabMaillogCount');
        if (badge) {
            badge.textContent = logs.length || '';
            badge.style.background = logs.length ? 'var(--primary)' : 'var(--gray-300)';
        }

        const tbody = document.getElementById('maillogBody');
        if (!tbody) return;
        if (logs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="padding:32px; text-align:center; color:var(--gray-400);">Noch keine Versandeinträge</td></tr>';
            return;
        }
        tbody.innerHTML = logs.map(l => {
            const ok = l.status === 'sent';
            const date = new Date(l.sent_at).toLocaleString('de-DE');
            return `<tr style="border-bottom:1px solid var(--gray-100);">
                <td style="padding:10px 16px; font-size:13px; white-space:nowrap;">${date}</td>
                <td style="padding:10px 16px; font-size:13px; font-weight:600;">${escapeHtml(l.template_name || '–')}</td>
                <td style="padding:10px 16px; font-size:13px;">
                    <div>${escapeHtml(l.recipient_name || '')}</div>
                    <div style="color:var(--primary); font-size:12px;">${escapeHtml(l.recipient_email)}</div>
                </td>
                <td style="padding:10px 16px;">
                    <span style="font-size:12px; padding:2px 8px; border-radius:10px;
                        background:${ok ? '#dcfce7' : '#fee2e2'};
                        color:${ok ? '#166534' : '#991b1b'};">
                        ${ok ? '✅ Gesendet' : '❌ Fehler'}
                    </span>
                </td>
                <td style="padding:10px 16px; font-size:12px; color:var(--gray-400);">${escapeHtml(l.error_msg || '–')}</td>
            </tr>`;
        }).join('');
    } catch(e) { showError('Fehler beim Laden des Logs'); }
};

window.toggleRecipientList = async function() {
    const list = document.getElementById('mm_recipient_list');
    const btn  = document.getElementById('mm_toggle_list_btn');
    const mode = document.querySelector('input[name="mm_recipients"]:checked')?.value || 'all_contacts';

    if (list.style.display !== 'none') {
        list.style.display = 'none';
        btn.textContent = 'Liste anzeigen';
        return;
    }

    btn.textContent = 'Lädt...';
    try {
        const res = await fetch('/api/massenmail/recipients', {
            method: 'POST', headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ mode })
        });
        const data = await res.json();
        if (data.success) {
            const tbody = document.getElementById('mm_recipient_list_body');
            tbody.innerHTML = data.recipients.map(r => `
                <tr style="border-bottom:1px solid var(--gray-100);"
                    onmouseenter="this.style.background='white'" onmouseleave="this.style.background=''">
                    <td style="padding:6px 12px;">
                        ${escapeHtml(r.name)}
                        ${r.firma ? `<span style="color:var(--gray-400); font-size:11px;"> · ${escapeHtml(r.firma)}</span>` : ''}
                    </td>
                    <td style="padding:6px 12px; color:var(--primary);">${escapeHtml(r.email)}</td>
                </tr>`).join('');
            list.style.display = '';
            btn.textContent = 'Liste ausblenden';
        }
    } catch(e) { btn.textContent = 'Liste anzeigen'; }
};

// ========================================
// MASSENMAIL AUS FIRMEN-SELEKTION
// ========================================

let massenmailSelectionIds = [];

window.showMassenmailFromSelection = async function() {
    massenmailSelectionIds = [...bulkSelectedIds];
    if (massenmailSelectionIds.length === 0) {
        showError('Bitte zuerst Firmen auswählen');
        return;
    }

    // Vorlagen laden falls noch nicht geladen
    if (allTemplates.length === 0) await loadTemplates();

    // Modal befüllen
    const sel = document.getElementById('mm_template');
    sel.innerHTML = '<option value="">– Vorlage wählen –</option>';
    allTemplates.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.id;
        opt.textContent = t.name;
        sel.appendChild(opt);
    });

    // Empfänger-Modus auf "Selektion" umstellen
    document.getElementById('mm_mode_row').style.display = 'none';
    document.getElementById('mm_selection_info').style.display = '';
    document.getElementById('mm_selection_count').textContent = massenmailSelectionIds.length;
    document.getElementById('mm_preview_box').style.display = 'none';
    document.getElementById('mm_recipient_count').textContent = '';
    document.getElementById('mm_recipient_list').style.display = 'none';
    const btn = document.getElementById('mm_toggle_list_btn');
    if (btn) { btn.style.display = 'none'; btn.textContent = 'Liste anzeigen'; }
    document.getElementById('mm_send_progress').textContent = '';

    document.getElementById('massenmailModal').classList.add('active');
    lucide.createIcons();

    // Wenn nur eine Vorlage vorhanden → automatisch vorauswählen und Vorschau laden
    if (allTemplates.length === 1) {
        sel.value = allTemplates[0].id;
        await window.updateMassenmailPreview();
    } else if (allTemplates.length > 1) {
        // Empfänger-Anzahl direkt anzeigen ohne Vorschau
        document.getElementById('mm_recipient_count').innerHTML =
            `<strong style="color:var(--primary);">${massenmailSelectionIds.length}</strong> Firmen ausgewählt – bitte Vorlage wählen`;
    }
};

// Override updateMassenmailPreview to handle selection mode
const _origPreview = window.updateMassenmailPreview;
window.updateMassenmailPreview = async function() {
    const tplId = document.getElementById('mm_template').value;
    if (!tplId) {
        document.getElementById('mm_recipient_count').textContent = '';
        document.getElementById('mm_preview_box').style.display = 'none';
        return;
    }

    // Selektion-Modus?
    if (massenmailSelectionIds.length > 0 && document.getElementById('mm_mode_row').style.display === 'none') {
        try {
            const res = await fetch('/api/massenmail/preview-selection', {
                method: 'POST', headers: {'Content-Type':'application/json'},
                body: JSON.stringify({ template_id: parseInt(tplId), company_ids: massenmailSelectionIds })
            });
            const data = await res.json();
            if (data.success) {
                document.getElementById('mm_recipient_count').innerHTML =
                    `<strong style="color:var(--primary);">${data.count}</strong> Empfänger mit gültiger E-Mail-Adresse`;
                document.getElementById('mm_preview_subject').textContent = data.subject;
                document.getElementById('mm_preview_body').textContent = data.body;
                document.getElementById('mm_preview_box').style.display = '';
                // Empfängerliste cachen
                window._selectionRecipients = data.recipients;
                const listBtn = document.getElementById('mm_toggle_list_btn');
                if (listBtn) { listBtn.style.display = data.count > 0 ? '' : 'none'; listBtn.textContent = 'Liste anzeigen'; }
                document.getElementById('mm_recipient_list').style.display = 'none';
            }
        } catch(e) {}
        return;
    }
    await _origPreview();
};

// Override startMassenmail for selection mode
const _origSend = window.startMassenmail;
window.startMassenmail = async function() {
    const tplId = document.getElementById('mm_template').value;
    if (!tplId) { showError('Bitte eine Vorlage wählen'); return; }

    // Selektion-Modus?
    if (massenmailSelectionIds.length > 0 && document.getElementById('mm_mode_row').style.display === 'none') {
        const delay = document.getElementById('mm_delay').value;
        const count = massenmailSelectionIds.length;
        if (!confirm(`Massenmail an ${count} ausgewählte Firmen senden?\n\nDieser Vorgang kann einige Minuten dauern.`)) return;

        const btn = document.getElementById('mm_send_btn');
        const progress = document.getElementById('mm_send_progress');
        btn.disabled = true;
        btn.innerHTML = '<i data-lucide="loader" style="width:15px;height:15px;"></i> Wird gesendet...';
        progress.textContent = 'Versand läuft – bitte warten...';
        lucide.createIcons();

        try {
            const res = await fetch('/api/massenmail/send-selection', {
                method: 'POST', headers: {'Content-Type':'application/json'},
                body: JSON.stringify({ template_id: parseInt(tplId), company_ids: massenmailSelectionIds, delay: parseInt(delay) })
            });
            const data = await res.json();
            if (data.success) {
                closeMassenmailModal();
                clearBulkSelection();
                showSuccess(`✅ Versand abgeschlossen – ${data.sent} gesendet, ${data.errors} Fehler`);
                if (data.errors > 0) showError(`${data.errors} Mails fehlgeschlagen – Details im Versandlog`);
            } else {
                showError('Fehler: ' + (data.error || 'Unbekannt'));
            }
        } catch(e) {
            showError('Verbindungsfehler beim Senden');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i data-lucide="send" style="width:15px;height:15px;"></i> Jetzt senden';
            progress.textContent = '';
            lucide.createIcons();
        }
        return;
    }

    await _origSend();
};

// Override toggleRecipientList for selection mode
const _origToggle = window.toggleRecipientList;
window.toggleRecipientList = async function() {
    const list = document.getElementById('mm_recipient_list');
    const btn  = document.getElementById('mm_toggle_list_btn');

    if (list.style.display !== 'none') {
        list.style.display = 'none';
        btn.textContent = 'Liste anzeigen';
        return;
    }

    // Selektion-Modus – gecachte Empfänger nutzen
    if (massenmailSelectionIds.length > 0 && window._selectionRecipients && document.getElementById('mm_mode_row').style.display === 'none') {
        const tbody = document.getElementById('mm_recipient_list_body');
        tbody.innerHTML = window._selectionRecipients.map(r => `
            <tr style="border-bottom:1px solid var(--gray-100);"
                onmouseenter="this.style.background='white'" onmouseleave="this.style.background=''">
                <td style="padding:6px 12px;">
                    ${escapeHtml(r.anrede ? r.anrede + ' ' : '')}${escapeHtml(r.vorname)} ${escapeHtml(r.nachname)}
                    <span style="color:var(--gray-400); font-size:11px;"> · ${escapeHtml(r.firmenname)}</span>
                </td>
                <td style="padding:6px 12px; color:var(--primary);">${escapeHtml(r.email)}</td>
            </tr>`).join('');
        list.style.display = '';
        btn.textContent = 'Liste ausblenden';
        return;
    }

    await _origToggle();
};

// Reset selection mode when modal closes normally
const _origClose = window.closeMassenmailModal;
window.closeMassenmailModal = function() {
    massenmailSelectionIds = [];
    window._selectionRecipients = null;
    document.getElementById('mm_mode_row').style.display = '';
    document.getElementById('mm_selection_info').style.display = 'none';
    _origClose();
};

// ========================================
// MASSENMAIL AUS KONTAKTE-SELEKTION
// ========================================

window.showMassenmailFromContacts = async function() {
    const ids = [...bulkSelectedContactIds];
    if (ids.length === 0) { showError('Bitte zuerst Kontakte auswählen'); return; }

    if (allTemplates.length === 0) await loadTemplates();

    // Modal vorbereiten
    const sel = document.getElementById('mm_template');
    sel.innerHTML = '<option value="">– Vorlage wählen –</option>';
    allTemplates.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.id; opt.textContent = t.name;
        sel.appendChild(opt);
    });

    // Selektion-Modus aktivieren (Empfänger-Radio ausblenden)
    document.getElementById('mm_mode_row').style.display = 'none';
    document.getElementById('mm_selection_info').style.display = '';
    document.getElementById('mm_selection_count').textContent = ids.length;
    document.getElementById('mm_preview_box').style.display = 'none';
    document.getElementById('mm_recipient_count').textContent = '';
    document.getElementById('mm_recipient_list').style.display = 'none';
    const btn = document.getElementById('mm_toggle_list_btn');
    if (btn) { btn.style.display = 'none'; btn.textContent = 'Liste anzeigen'; }
    document.getElementById('mm_send_progress').textContent = '';

    // Merken dass wir im Kontakte-Modus sind
    window._massenmailContactIds = ids;
    massenmailSelectionIds = []; // Firmen-Selektion leeren

    document.getElementById('massenmailModal').classList.add('active');
    lucide.createIcons();

    if (allTemplates.length === 1) {
        sel.value = allTemplates[0].id;
        await loadContactMassenmailPreview(ids);
    } else {
        document.getElementById('mm_recipient_count').innerHTML =
            `<strong style="color:var(--primary);">${ids.length}</strong> Kontakte ausgewählt – bitte Vorlage wählen`;
    }
};

async function loadContactMassenmailPreview(ids) {
    const tplId = document.getElementById('mm_template').value;
    if (!tplId || !ids || ids.length === 0) return;
    try {
        // Vorschau mit erstem Kontakt aus allContactsList
        const first = allContactsList.find(c => ids.includes(c.id)) || {};
        const tpl   = allTemplates.find(t => t.id === parseInt(tplId));
        if (!tpl) return;
        const subject = tpl.subject
            .replace('{{anrede}}', first.anrede || '')
            .replace('{{vorname}}', first.vorname || '')
            .replace('{{nachname}}', first.nachname || '')
            .replace('{{firmenname}}', first.firmenname || '')
            .replace('{{stadt}}', first.stadt || '')
            .replace('{{land}}', first.land || '');
        const body = tpl.body
            .replace(/\{\{anrede\}\}/g, first.anrede || '')
            .replace(/\{\{vorname\}\}/g, first.vorname || '')
            .replace(/\{\{nachname\}\}/g, first.nachname || '')
            .replace(/\{\{firmenname\}\}/g, first.firmenname || '')
            .replace(/\{\{stadt\}\}/g, first.stadt || '')
            .replace(/\{\{land\}\}/g, first.land || '');

        const withEmail = ids.filter(id => allContactsList.find(c => c.id === id && c.email));
        document.getElementById('mm_recipient_count').innerHTML =
            `<strong style="color:var(--primary);">${withEmail.length}</strong> von ${ids.length} Kontakten haben eine E-Mail-Adresse`;
        document.getElementById('mm_preview_subject').textContent = subject;
        document.getElementById('mm_preview_body').textContent = body;
        document.getElementById('mm_preview_box').style.display = '';

        // Empfängerliste
        window._contactRecipients = ids
            .map(id => allContactsList.find(c => c.id === id))
            .filter(c => c && c.email);
        const listBtn = document.getElementById('mm_toggle_list_btn');
        if (listBtn) { listBtn.style.display = withEmail.length > 0 ? '' : 'none'; listBtn.textContent = 'Liste anzeigen'; }
        document.getElementById('mm_recipient_list').style.display = 'none';
    } catch(e) {}
}

// Patch: updateMassenmailPreview im Kontakte-Modus
const _origPreview2 = window.updateMassenmailPreview;
window.updateMassenmailPreview = async function() {
    if (window._massenmailContactIds?.length > 0) {
        await loadContactMassenmailPreview(window._massenmailContactIds);
        return;
    }
    await _origPreview2();
};

// Patch: startMassenmail im Kontakte-Modus
const _origSend2 = window.startMassenmail;
window.startMassenmail = async function() {
    if (window._massenmailContactIds?.length > 0) {
        const tplId = document.getElementById('mm_template').value;
        if (!tplId) { showError('Bitte eine Vorlage wählen'); return; }
        const delay = document.getElementById('mm_delay').value;
        const count = window._massenmailContactIds.length;
        if (!confirm(`Massenmail an ${count} ausgewählte Kontakte senden?`)) return;

        const btn = document.getElementById('mm_send_btn');
        const progress = document.getElementById('mm_send_progress');
        btn.disabled = true;
        btn.innerHTML = '<i data-lucide="loader" style="width:15px;height:15px;"></i> Wird gesendet...';
        progress.textContent = 'Versand läuft – bitte warten...';
        lucide.createIcons();
        try {
            const res = await fetch('/api/massenmail/send-contacts', {
                method: 'POST', headers: {'Content-Type':'application/json'},
                body: JSON.stringify({ template_id: parseInt(tplId), contact_ids: window._massenmailContactIds, delay: parseInt(delay) })
            });
            const data = await res.json();
            if (data.success) {
                closeMassenmailModal();
                clearContactSelection();
                showSuccess(`✅ Versand abgeschlossen – ${data.sent} gesendet, ${data.errors} Fehler`);
                if (data.errors > 0) showError(`${data.errors} Mails fehlgeschlagen – Details im Versandlog`);
            } else { showError('Fehler: ' + (data.error || 'Unbekannt')); }
        } catch(e) { showError('Verbindungsfehler beim Senden'); }
        finally {
            btn.disabled = false;
            btn.innerHTML = '<i data-lucide="send" style="width:15px;height:15px;"></i> Jetzt senden';
            progress.textContent = '';
            lucide.createIcons();
        }
        return;
    }
    await _origSend2();
};

// Patch: toggleRecipientList im Kontakte-Modus
const _origToggle2 = window.toggleRecipientList;
window.toggleRecipientList = async function() {
    const list = document.getElementById('mm_recipient_list');
    const btn  = document.getElementById('mm_toggle_list_btn');
    if (list.style.display !== 'none') {
        list.style.display = 'none'; btn.textContent = 'Liste anzeigen'; return;
    }
    if (window._contactRecipients?.length > 0) {
        const tbody = document.getElementById('mm_recipient_list_body');
        tbody.innerHTML = window._contactRecipients.map(c => `
            <tr style="border-bottom:1px solid var(--gray-100);"
                onmouseenter="this.style.background='white'" onmouseleave="this.style.background=''">
                <td style="padding:6px 12px;">
                    ${escapeHtml((c.anrede ? c.anrede + ' ' : '') + c.vorname + ' ' + c.nachname)}
                    ${c.firmenname ? `<span style="color:var(--gray-400); font-size:11px;"> · ${escapeHtml(c.firmenname)}</span>` : ''}
                </td>
                <td style="padding:6px 12px; color:var(--primary);">${escapeHtml(c.email)}</td>
            </tr>`).join('');
        list.style.display = ''; btn.textContent = 'Liste ausblenden'; return;
    }
    await _origToggle2();
};

// Patch: closeMassenmailModal – auch Kontakte-IDs zurücksetzen
const _origClose2 = window.closeMassenmailModal;
window.closeMassenmailModal = function() {
    window._massenmailContactIds = null;
    window._contactRecipients = null;
    _origClose2();
};

// ========================================
// KONTAKT DETAILANSICHT
// ========================================

window.showContactDetail = async function(contactId) {
    let c = null;
    try {
        const res = await fetch(`/api/contacts/${contactId}`);
        const data = await res.json();
        if (data.success) c = data.contact;
    } catch(e) {}
    if (!c) c = allContactsList.find(x => x.id === contactId);
    if (!c) return;

    const fullName = [c.anrede, c.vorname, c.nachname].filter(Boolean).join(' ');
    const initials = ((c.vorname?.[0] || '') + (c.nachname?.[0] || '')).toUpperCase() || '?';

    document.getElementById('contactDetailInitials').textContent = initials;
    document.getElementById('contactDetailName').textContent = fullName;
    document.getElementById('contactDetailPosition').textContent = c.position || '';

    // Firma
    const firmaRow = document.getElementById('contactDetailFirmaRow');
    const firmaLink = document.getElementById('contactDetailFirmaLink');
    if (c.firmenname && c.company_id) {
        firmaRow.style.display = 'flex';
        firmaLink.textContent = c.firmenname;
        firmaLink.onclick = (e) => { e.preventDefault(); closeContactDetail(); loadCompanyDetails(c.company_id); };
    } else {
        firmaRow.style.display = 'none';
    }

    // E-Mail
    const emailRow = document.getElementById('contactDetailEmailRow');
    if (c.email) {
        emailRow.style.display = 'flex';
        const el = document.getElementById('contactDetailEmail');
        el.textContent = c.email; el.href = `mailto:${c.email}`;
    } else { emailRow.style.display = 'none'; }

    // Telefon
    const telRow = document.getElementById('contactDetailTelRow');
    if (c.telefon) {
        telRow.style.display = 'flex';
        const el = document.getElementById('contactDetailTel');
        el.textContent = c.telefon; el.href = `tel:${c.telefon}`;
    } else { telRow.style.display = 'none'; }

    // Mobil
    const mobilRow = document.getElementById('contactDetailMobilRow');
    if (c.mobil) {
        mobilRow.style.display = 'flex';
        const el = document.getElementById('contactDetailMobil');
        el.textContent = c.mobil; el.href = `tel:${c.mobil}`;
    } else { mobilRow.style.display = 'none'; }

    // Durchwahl
    const dwRow = document.getElementById('contactDetailDurchwahl');
    if (c.durchwahl) {
        dwRow.style.display = 'flex';
        document.getElementById('contactDetailDurchwahlVal').textContent = c.durchwahl;
    } else { dwRow.style.display = 'none'; }

    // Notizen
    const notesRow = document.getElementById('contactDetailNotesRow');
    if (c.notes) {
        notesRow.style.display = '';
        document.getElementById('contactDetailNotes').textContent = c.notes;
    } else { notesRow.style.display = 'none'; }

    // Leer-Hinweis
    const hasData = c.email || c.telefon || c.mobil || c.durchwahl || c.notes;
    document.getElementById('contactDetailEmpty').style.display = hasData ? 'none' : '';

    // Bearbeiten-Button
    document.getElementById('contactDetailEditBtn').onclick = () => {
        closeContactDetail();
        editContact(contactId);
    };

    document.getElementById('contactDetailModal').classList.add('active');
    lucide.createIcons();
};

window.closeContactDetail = function() {
    document.getElementById('contactDetailModal').classList.remove('active');
};

// ========================================
// FIRMA AUTOCOMPLETE (Kontakt-Formular)
// ========================================

let _companySearchTimeout = null;

window.companyAutocomplete = function(query) {
    clearTimeout(_companySearchTimeout);
    const suggestions = document.getElementById('co_company_suggestions');
    const clearBtn    = document.getElementById('co_company_clear');
    const hiddenId    = document.getElementById('co_company_id');

    // Selektion zurücksetzen wenn Nutzer tippt
    hiddenId.value = '';
    clearBtn.style.display = query ? '' : 'none';

    if (query.length < 2) {
        suggestions.style.display = 'none';
        return;
    }

    _companySearchTimeout = setTimeout(async () => {
        try {
            const res = await fetch(`/api/companies?search=${encodeURIComponent(query)}&limit=20`);
            const data = await res.json();
            if (!data.success || !data.companies.length) {
                suggestions.innerHTML = `<div style="padding:12px 16px; font-size:13px; color:var(--gray-400);">Keine Treffer</div>`;
                suggestions.style.display = '';
                return;
            }
            suggestions.innerHTML = data.companies.map(c => `
                <div onclick="selectCompany(${c.id}, '${escapeHtml(c.firmenname)}')"
                     style="padding:10px 16px; font-size:13px; cursor:pointer; display:flex; align-items:center; gap:10px; border-bottom:1px solid var(--gray-100);"
                     onmouseenter="this.style.background='var(--gray-50)'"
                     onmouseleave="this.style.background=''">
                    <i data-lucide="building-2" style="width:14px;height:14px; color:var(--gray-400); flex-shrink:0;"></i>
                    <div>
                        <div style="font-weight:600;">${escapeHtml(c.firmenname)}</div>
                        ${c.stadt ? `<div style="font-size:11px; color:var(--gray-400);">${escapeHtml(c.stadt)}${c.land ? ' · ' + escapeHtml(c.land) : ''}</div>` : ''}
                    </div>
                </div>`).join('');
            suggestions.style.display = '';
            lucide.createIcons();
        } catch(e) {}
    }, 250);
};

window.selectCompany = function(id, name) {
    document.getElementById('co_company_id').value = id;
    document.getElementById('co_company_search').value = name;
    document.getElementById('co_company_clear').style.display = '';
    document.getElementById('co_company_suggestions').style.display = 'none';
};

window.clearCompanySelection = function() {
    document.getElementById('co_company_id').value = '';
    document.getElementById('co_company_search').value = '';
    document.getElementById('co_company_clear').style.display = 'none';
    document.getElementById('co_company_suggestions').style.display = 'none';
};

// Suggestions schließen bei Klick außerhalb
document.addEventListener('click', function(e) {
    const wrapper = document.getElementById('co_company_search')?.closest('div[style*="position:relative"]');
    if (wrapper && !wrapper.contains(e.target)) {
        document.getElementById('co_company_suggestions').style.display = 'none';
    }
});

// ========================================
// PLATZHALTER EINFÜGEN (Vorlage Editor)
// ========================================

window.insertPlaceholder = function(fieldId, placeholder) {
    const el = document.getElementById(fieldId);
    if (!el) return;
    const start = el.selectionStart ?? el.value.length;
    const end   = el.selectionEnd   ?? el.value.length;
    el.value = el.value.substring(0, start) + placeholder + el.value.substring(end);
    const pos = start + placeholder.length;
    el.focus();
    el.setSelectionRange(pos, pos);
};

// ========================================
// KARTE (Leaflet)
// ========================================

let karteMap = null;
let karteMarkers = null;

const karteKategorieColors = {
    restaurant: '#ef4444',
    hotel:      '#f97316',
    resort:     '#8b5cf6',
    camping:    '#22c55e',
    marina:      '#3b82f6',
    segelschule: '#0891b2',
    segelverein: '#7c3aed',
    bootsverleih:'#0d9488',
    sonstige:    '#6b7280'
};

const karteKategorieEmoji = {
    restaurant: '🍽', hotel: '🏨', resort: '🌴',
    camping: '⛺', marina: '⚓', sonstige: '📍'
};

function createKarteIcon(kundentyp, status, isNew = false) {
    const color = karteKategorieColors[kundentyp] || '#6b7280';
    const emoji = karteKategorieEmoji[kundentyp] || '📍';
    const ring = status === 'gewonnen' || status === 'kunde' ? '#16a34a'
               : status === 'inaktiv' ? '#9ca3af'
               : status === 'interessant' ? '#eab308'
               : color;
    const size = isNew ? 34 : 28;
    const pulse = isNew ? `
        <div style="position:absolute; width:${size+10}px; height:${size+10}px; border-radius:50%;
             border:3px solid ${color}; top:50%; left:50%;
             transform:translate(-50%,-50%);
             animation:kartePulse 1.5s infinite; opacity:0.6;"></div>` : '';
    return L.divIcon({
        className: '',
        html: `<div style="position:relative; width:${size}px; height:${size}px;">
            ${pulse}
            <div style="
                width:${size}px; height:${size}px; border-radius:50%;
                background:${color}; border:${isNew ? 4 : 3}px solid ${isNew ? 'white' : ring};
                display:flex; align-items:center; justify-content:center;
                font-size:${isNew ? 15 : 13}px;
                box-shadow:${isNew ? '0 0 12px ' + color + ', 0 2px 6px rgba(0,0,0,0.4)' : '0 2px 6px rgba(0,0,0,0.3)'};
                cursor:pointer; position:relative; z-index:1;">
                ${emoji}
            </div>
        </div>`,
        iconSize: [size, size],
        iconAnchor: [size/2, size/2],
        popupAnchor: [0, -size/2 - 4]
    });
}

async function initKarte() {
    if (karteMap) return; // already initialized

    const loading = document.getElementById('karteLoading');

    karteMap = L.map('karteMap', { zoomControl: true }).setView([51.1657, 10.4515], 6);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> © <a href="https://carto.com/">CARTO</a>',
        maxZoom: 19
    }).addTo(karteMap);

    karteMarkers = L.layerGroup().addTo(karteMap);

    if (loading) loading.style.display = 'none';
    await loadKarteBatches();
    await loadKarteData();
}

async function loadKarteBatches() {
    try {
        const res = await fetch('/api/import/batches');
        const data = await res.json();
        if (!data.success) return;
        const sel = document.getElementById('karteBatchFilter');
        if (!sel) return;
        // Keep first option, rebuild rest
        sel.innerHTML = '<option value="">Alle Importe</option>';
        data.batches.forEach(b => {
            const date = new Date(b.import_batch).toLocaleString('de-DE');
            const opt = document.createElement('option');
            opt.value = b.import_batch;
            opt.textContent = `📥 ${date} (${b.count} Einträge)`;
            sel.appendChild(opt);
        });
    } catch(e) {}
}

async function loadKarteData() {
    const loading = document.getElementById('karteLoading');
    if (loading) loading.style.display = '';

    const status       = document.getElementById('karteStatusFilter')?.value || '';
    const kundentyp    = document.getElementById('karteKategorieFilter')?.value || '';
    const wassertyp    = document.getElementById('karteWassertypFilter')?.value || '';
    const import_batch = document.getElementById('karteBatchFilter')?.value || '';

    const params = new URLSearchParams();
    if (status)        params.append('status', status);
    if (kundentyp)     params.append('kundentyp', kundentyp);
    if (wassertyp)     params.append('wassertyp', wassertyp);
    if (import_batch)  params.append('import_batch', import_batch);

    try {
        const res  = await fetch(`/api/companies/map?${params}`);
        const data = await res.json();
        if (!data.success) return;

        karteMarkers.clearLayers();

        const label = document.getElementById('karteCountLabel');
        const badge = document.getElementById('tabKarteCount');
        if (label) label.textContent = `${data.count} Standorte mit Koordinaten`;
        if (badge) {
            badge.textContent = data.count || '';
            badge.style.background = data.count ? 'var(--primary)' : 'var(--gray-300)';
        }

        const bounds = [];
        data.companies.forEach(c => {
            if (!c.lat || !c.lon) return;
            const isNew = !!import_batch && c.import_batch === import_batch;
            const marker = L.marker([c.lat, c.lon], {
                icon: createKarteIcon(c.kundentyp, c.status, isNew),
                zIndexOffset: isNew ? 1000 : 0
            });

            const distanz   = c.wasserdistanz ? `${c.wasserdistanz}m` : '';
            const wasserBadge = c.wassertyp ? `<span style="font-size:11px; background:#e0f2fe; color:#0369a1; padding:1px 6px; border-radius:8px; margin-left:4px;">💧 ${escapeHtml(c.wassertyp)}</span>` : '';
            const tel     = c.telefon ? `<div style="font-size:12px; margin-top:4px;">📞 <a href="tel:${escapeHtml(c.telefon)}" style="color:var(--primary);">${escapeHtml(c.telefon)}</a></div>` : '';
            const web     = c.website ? `<div style="font-size:12px; margin-top:2px;">🌐 <a href="${escapeHtml(c.website)}" target="_blank" rel="noopener" style="color:var(--primary);">Website ↗</a></div>` : '';
            const osmLink = c.osm     ? `<div style="font-size:12px; margin-top:2px;">🗺 <a href="${escapeHtml(c.osm)}" target="_blank" rel="noopener" style="color:var(--primary);">OSM Objekt ↗</a></div>` : '';
            const ort     = c.stadt   ? `<div style="font-size:11px; color:#6b7280; margin-top:2px;">${escapeHtml(c.stadt)}${c.land ? ', ' + escapeHtml(c.land) : ''}</div>` : '';

            marker.bindPopup(`
                <div style="min-width:200px; font-family:system-ui,sans-serif;">
                    <div style="font-weight:700; font-size:14px; margin-bottom:4px;">${escapeHtml(c.firmenname)}</div>
                    <div style="display:flex; align-items:center; gap:4px; flex-wrap:wrap; margin-bottom:4px;">
                        <span style="font-size:11px; background:${karteKategorieColors[c.kundentyp] || '#6b7280'}22;
                              color:${karteKategorieColors[c.kundentyp] || '#6b7280'};
                              padding:1px 8px; border-radius:8px; font-weight:600; text-transform:uppercase;">
                            ${karteKategorieEmoji[c.kundentyp] || ''} ${escapeHtml(c.kundentyp || 'Sonstige')}
                        </span>
                        ${distanz ? `<span style="font-size:11px; color:#0369a1;">💧 ${distanz}${wasserBadge}</span>` : ''}
                    </div>
                    ${ort}${tel}${web}${osmLink}
                    <button onclick="loadCompanyDetails(${c.id}); switchTab('firmen');"
                            style="margin-top:8px; width:100%; padding:5px 10px; border:none;
                                   background:var(--primary,#0ea5e9); color:white; border-radius:6px;
                                   cursor:pointer; font-size:12px; font-weight:600;">
                        📋 Firma öffnen
                    </button>
                </div>
            `, { maxWidth: 280 });

            karteMarkers.addLayer(marker);
            bounds.push([c.lat, c.lon]);
        });

        // Nur beim ersten Laden auf Bounds zoomen, danach Position beibehalten
        if (bounds.length > 0 && !window._karteInitialBoundsDone) {
            karteMap.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
            window._karteInitialBoundsDone = true;
        }

    } catch(e) {
        showError('Fehler beim Laden der Kartendaten');
    } finally {
        if (loading) loading.style.display = 'none';
    }
}

window.refreshKarte = function() { loadKarteData(); };

// ========================================
// OSM POI LAYER (Overpass API)
// ========================================

let osmLayer = null;
let osmLayerActive = false;
let crmOsmIds = new Set(); // OSM-IDs die bereits im CRM sind

// OSM Kategorien die abgefragt werden
const osmQueryTags = [
    'amenity=restaurant', 'amenity=cafe', 'amenity=bar',
    'tourism=hotel', 'tourism=hostel', 'tourism=camp_site',
    'leisure=marina', 'amenity=boat_rental'
];

window.toggleOsmLayer = async function() {
    osmLayerActive = !osmLayerActive;
    const btn = document.getElementById('osmToggleBtn');

    if (osmLayerActive) {
        btn.textContent = '⚪ OSM-POIs ausblenden';
        btn.style.borderColor = 'var(--primary)';
        btn.style.color = 'var(--primary)';
        await loadOsmPois();
        // Karte: bei Verschieben neu laden
        karteMap.on('moveend', onKarteMoveEnd);
    } else {
        btn.textContent = '⚪ OSM-POIs anzeigen';
        btn.style.borderColor = 'var(--gray-300)';
        btn.style.color = '';
        if (osmLayer) { osmLayer.clearLayers(); }
        karteMap.off('moveend', onKarteMoveEnd);
        document.getElementById('osmCountLabel').textContent = '';
    }
};

function onKarteMoveEnd() {
    if (osmLayerActive) loadOsmPois();
}

async function loadOsmPois() {
    if (!karteMap) return;
    const bounds = karteMap.getBounds();
    const zoom = karteMap.getZoom();

    // Nur bei ausreichendem Zoom laden (Performance)
    if (zoom < 11) {
        document.getElementById('osmCountLabel').textContent = 'Bitte weiter reinzoomen für OSM-POIs (Zoom ≥ 11)';
        if (osmLayer) osmLayer.clearLayers();
        return;
    }

    const s = bounds.getSouth().toFixed(5);
    const w = bounds.getWest().toFixed(5);
    const n = bounds.getNorth().toFixed(5);
    const e = bounds.getEast().toFixed(5);
    const bbox = `${s},${w},${n},${e}`;

    // Overpass Query für alle relevanten POIs
    const tagFilters = osmQueryTags.map(t => {
        const [k, v] = t.split('=');
        return `node["${k}"="${v}"](${bbox});way["${k}"="${v}"](${bbox});`;
    }).join('');

    const query = `[out:json][timeout:15];(${tagFilters});out center;`;

    document.getElementById('osmCountLabel').textContent = 'OSM-POIs werden geladen...';

    try {
        const res = await fetch('https://overpass-api.de/api/interpreter', {
            method: 'POST',
            body: 'data=' + encodeURIComponent(query)
        });
        const data = await res.json();

        // CRM OSM-IDs aktualisieren
        await refreshCrmOsmIds();

        if (!osmLayer) {
            osmLayer = L.layerGroup().addTo(karteMap);
        } else {
            osmLayer.clearLayers();
        }

        let newCount = 0;
        data.elements.forEach(el => {
            const lat = el.lat || el.center?.lat;
            const lon = el.lon || el.center?.lon;
            if (!lat || !lon) return;

            const osmId = `${el.type}/${el.id}`;
            const osmUrl = `https://www.openstreetmap.org/${osmId}`;
            const name = el.tags?.name || el.tags?.['name:de'] || '(kein Name)';
            const amenity = el.tags?.amenity || el.tags?.tourism || el.tags?.leisure || '';

            // Prüfen ob bereits im CRM
            const inCrm = crmOsmIds.has(osmUrl) || crmOsmIds.has(osmId);
            if (inCrm) return; // Bereits im CRM → nicht als unbekannt anzeigen

            newCount++;

            const icon = L.divIcon({
                className: '',
                html: `<div style="
                    width:24px; height:24px; border-radius:50%;
                    background:white; border:2px solid #9ca3af;
                    display:flex; align-items:center; justify-content:center;
                    font-size:11px; box-shadow:0 2px 4px rgba(0,0,0,0.2);
                    cursor:pointer; color:#6b7280; font-weight:700;">?</div>`,
                iconSize: [24, 24],
                iconAnchor: [12, 12],
                popupAnchor: [0, -14]
            });

            const tel  = el.tags?.phone || el.tags?.['contact:phone'] || '';
            const web  = el.tags?.website || el.tags?.['contact:website'] || '';
            const addr = [el.tags?.['addr:street'], el.tags?.['addr:housenumber'],
                          el.tags?.['addr:postcode'], el.tags?.['addr:city']]
                         .filter(Boolean).join(' ');

            // POI Daten sicher speichern
            const poiKey = `osm_${el.type}_${el.id}`;
            window._osmPois = window._osmPois || {};
            window._osmPois[poiKey] = {
                name, amenity, lat, lon, osm: osmUrl,
                telefon: tel, website: web,
                strasse: el.tags?.['addr:street'] ? (el.tags['addr:street'] + ' ' + (el.tags?.['addr:housenumber'] || '')).trim() : '',
                plz:    el.tags?.['addr:postcode'] || '',
                stadt:  el.tags?.['addr:city'] || '',
                land:   (()=>{
                    const iso = el.tags?.['addr:country'] || '';
                    const landMap = {
                        'DE':'Deutschland','AT':'Österreich','CH':'Schweiz',
                        'HR':'Kroatien','SI':'Slowenien','IT':'Italien',
                        'FR':'Frankreich','ES':'Spanien','NL':'Niederlande',
                        'PL':'Polen','CZ':'Tschechien','HU':'Ungarn',
                        'GR':'Griechenland','PT':'Portugal','TR':'Türkei',
                        'ME':'Montenegro','BA':'Bosnien','RS':'Serbien',
                        'MK':'Nordmazedonien','AL':'Albanien','BG':'Bulgarien',
                        'RO':'Rumänien','SK':'Slowakei','BE':'Belgien',
                        'DK':'Dänemark','SE':'Schweden','NO':'Norwegen',
                        'FI':'Finnland','LU':'Luxemburg','GB':'Großbritannien',
                    };
                    return landMap[iso] || iso;
                })()
            };

            const marker = L.marker([lat, lon], { icon, zIndexOffset: -100 });
            marker.bindPopup(`
                <div style="min-width:220px; font-family:system-ui,sans-serif;">
                    <div style="font-weight:700; font-size:14px; margin-bottom:4px;">${escapeHtml(name)}</div>
                    <div style="font-size:11px; background:#f3f4f6; color:#6b7280; padding:2px 8px;
                                border-radius:8px; display:inline-block; margin-bottom:6px;">
                        ${escapeHtml(amenity)}
                    </div>
                    ${addr ? `<div style="font-size:12px; color:#6b7280; margin-bottom:4px;">📍 ${escapeHtml(addr)}</div>` : ''}
                    ${tel  ? `<div style="font-size:12px; margin-bottom:2px;">📞 ${escapeHtml(tel)}</div>` : ''}
                    ${web  ? `<div style="font-size:12px; margin-bottom:4px;">🌐 <a href="${escapeHtml(web)}" target="_blank" rel="noopener" style="color:var(--primary);">Website ↗</a></div>` : ''}
                    <div style="font-size:11px; color:#9ca3af; margin-bottom:8px;">
                        <a href="${osmUrl}" target="_blank" rel="noopener" style="color:#9ca3af;">OSM: ${osmId}</a>
                    </div>
                    <button onclick="importOsmPoi('${poiKey}')"
                            style="width:100%; padding:6px 10px; border:none;
                                   background:#22c55e; color:white; border-radius:6px;
                                   cursor:pointer; font-size:12px; font-weight:600;">
                        ➕ In CRM importieren
                    </button>
                </div>
            `, { maxWidth: 280 });

            osmLayer.addLayer(marker);
        });

        document.getElementById('osmCountLabel').textContent =
            `${newCount} unbekannte OSM-POIs im Kartenausschnitt`;

    } catch(e) {
        document.getElementById('osmCountLabel').textContent = 'Fehler beim Laden der OSM-Daten';
        console.error('Overpass error:', e);
    }
}

async function refreshCrmOsmIds() {
    try {
        const res = await fetch('/api/companies/osm-ids');
        const data = await res.json();
        if (data.success) {
            crmOsmIds = new Set(data.osm_ids);
        }
    } catch(e) {}
}

function guessLandFromCoords(lat, lon) {
    if (!lat || !lon) return 'Deutschland';
    // Grobe Bounding Boxes für häufige Länder
    if (lat >= 47.3 && lat <= 55.1 && lon >= 5.9 && lon <= 15.0) return 'Deutschland';
    if (lat >= 46.4 && lat <= 49.0 && lon >= 9.5 && lon <= 17.2) return 'Österreich';
    if (lat >= 45.8 && lat <= 47.8 && lon >= 5.9 && lon <= 10.5) return 'Schweiz';
    if (lat >= 45.8 && lat <= 46.9 && lon >= 13.4 && lon <= 16.6) return 'Slowenien';
    if (lat >= 42.4 && lat <= 46.6 && lon >= 13.5 && lon <= 19.5) return 'Kroatien';
    if (lat >= 36.6 && lat <= 47.1 && lon >= 6.6  && lon <= 18.5) return 'Italien';
    if (lat >= 42.3 && lat <= 51.1 && lon >= -4.8 && lon <= 8.2)  return 'Frankreich';
    if (lat >= 36.0 && lat <= 43.8 && lon >= -9.3 && lon <= 4.3)  return 'Spanien';
    if (lat >= 50.7 && lat <= 53.6 && lon >= 3.3  && lon <= 7.2)  return 'Niederlande';
    if (lat >= 49.5 && lat <= 51.5 && lon >= 2.5  && lon <= 6.4)  return 'Belgien';
    if (lat >= 54.6 && lat <= 57.8 && lon >= 8.0  && lon <= 15.2) return 'Dänemark';
    if (lat >= 55.3 && lat <= 69.1 && lon >= 11.0 && lon <= 24.2) return 'Schweden';
    if (lat >= 57.9 && lat <= 71.2 && lon >= 4.5  && lon <= 31.2) return 'Norwegen';
    if (lat >= 49.6 && lat <= 55.1 && lon >= 14.1 && lon <= 24.2) return 'Polen';
    if (lat >= 45.7 && lat <= 48.6 && lon >= 16.1 && lon <= 22.9) return 'Ungarn';
    if (lat >= 35.9 && lat <= 41.8 && lon >= 19.4 && lon <= 29.6) return 'Griechenland';
    if (lat >= 36.9 && lat <= 42.2 && lon >= -9.5 && lon <= -6.2) return 'Portugal';
    if (lat >= 41.2 && lat <= 48.3 && lon >= 20.2 && lon <= 30.0) return 'Rumänien';
    if (lat >= 50.0 && lat <= 51.1 && lon >= -5.7 && lon <= 1.8)  return 'Großbritannien';
    return '';
}

window.importOsmPoi = async function(poiKey) {
    const poiData = window._osmPois?.[poiKey];
    if (!poiData) { showError('POI Daten nicht gefunden'); return; }

    // Duplikat-Check: OSM-URL bereits im CRM?
    if (crmOsmIds.has(poiData.osm)) {
        showError(`⚠️ "${poiData.name}" ist bereits im CRM vorhanden (OSM-ID identisch)`);
        return;
    }

    // Kategorie aus amenity/tourism ableiten
    const kategorieMap = {
        restaurant: 'restaurant', cafe: 'restaurant', bar: 'restaurant',
        hotel: 'hotel', hostel: 'hotel',
        camp_site: 'camping',
        marina: 'marina', boat_rental: 'bootsverleih',
        sailing_school: 'segelschule', sailing: 'segelverein'
    };
    const kundentyp = kategorieMap[poiData.amenity] || 'sonstige';

    const poiDataToSend = {
        firmenname:   poiData.name,
        kundentyp,
        strasse:      poiData.strasse?.trim() || '',
        plz:          poiData.plz || '',
        stadt:        poiData.stadt || '',
        land:         poiData.land || guessLandFromCoords(poiData.lat, poiData.lon),
        telefon:      poiData.telefon || '',
        website:      poiData.website || '',
        lat:          poiData.lat,
        lon:          poiData.lon,
        osm:          poiData.osm,
        status:       'neu'
    };

    // Button auf Lade-Status setzen
    const importBtn = document.querySelector(`button[onclick="importOsmPoi('${poiKey}')"]`);
    if (importBtn) {
        importBtn.disabled = true;
        importBtn.innerHTML = '⏳ Wird importiert...';
        importBtn.style.background = '#6b7280';
    }

    const resetBtn = () => {
        if (importBtn) {
            importBtn.disabled = false;
            importBtn.innerHTML = '➕ In CRM importieren';
            importBtn.style.background = '#22c55e';
        }
    };

    try {
        const res = await fetch('/api/companies', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                firmenname:   poiData.name,
                kundentyp,
                strasse:      poiData.strasse?.trim() || '',
                plz:          poiData.plz || '',
                stadt:        poiData.stadt || '',
                land:         poiData.land || guessLandFromCoords(poiData.lat, poiData.lon),
                telefon:      poiData.telefon || '',
                website:      poiData.website || '',
                lat:          poiData.lat,
                lon:          poiData.lon,
                osm:          poiData.osm,
                status:       'neu'
            })
        });
        const data = await res.json();
        if (data.success) {
            showSuccess(`✅ "${poiData.name}" wurde ins CRM importiert`);
            crmOsmIds.add(poiData.osm);
            // Popup schließen
            karteMap.closePopup();
            window._karteInitialBoundsDone = true;
            await loadKarteData();
            if (osmLayerActive) await loadOsmPois();
        } else if (data.duplicate) {
            // Duplikat gefunden – Nutzer fragen
            if (confirm(`⚠️ ${data.error}\n\nTrotzdem als neue Firma importieren?`)) {
                // Nochmal ohne Duplikat-Check
                const res2 = await fetch('/api/companies?force=1', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ ...poiDataToSend, _force: true })
                });
                const data2 = await res2.json();
                if (data2.success) {
                    showSuccess(`✅ "${poiData.name}" wurde trotzdem importiert`);
                    window._karteInitialBoundsDone = true;
                    await loadKarteData();
                    if (osmLayerActive) await loadOsmPois();
                }
            } else {
                // Bestehende Firma öffnen
                if (data.existing_id) {
                    loadCompanyDetails(data.existing_id);
                    switchTab('firmen');
                }
            }
        } else {
            resetBtn();
            showError('Fehler: ' + (data.error || 'Unbekannt'));
        }
    } catch(e) {
        resetBtn();
        showError('Verbindungsfehler beim Import');
    }
};

// ========================================
// OSM UPDATE AUS CSV
// ========================================

window.showOsmUpdateModal = function() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const formData = new FormData();
        formData.append('file', file);
        try {
            showSuccess('OSM-Links werden aktualisiert...');
            const res = await fetch('/api/companies/update-osm', { method: 'POST', body: formData });
            const data = await res.json();
            if (data.success) {
                showSuccess(`✅ ${data.updated} Firmen aktualisiert (OSM, Wassertyp, Distanz), ${data.not_found} nicht gefunden`);
                loadCompanies();
            } else {
                showError('Fehler: ' + (data.error || 'Unbekannt'));
            }
        } catch(e) { showError('Verbindungsfehler'); }
    };
    input.click();
};

// ========================================
// IN CRM KARTE ZEIGEN
// ========================================

window.zoomToCompanyOnMap = async function(lat, lon, companyId) {
    // Detail-Modal schließen
    closeDetailView();

    // Zum Karten-Tab wechseln
    await switchTab('karte');

    // Kurz warten bis Karte initialisiert
    let attempts = 0;
    while (!karteMap && attempts < 20) {
        await new Promise(r => setTimeout(r, 100));
        attempts++;
    }
    if (!karteMap) return;

    window._karteInitialBoundsDone = true;

    // Karte laden falls noch nicht geschehen
    if (karteMarkers.getLayers().length === 0) {
        await loadKarteData();
    }

    // Auf Firma zoomen
    karteMap.setView([lat, lon], 16);

    // Marker finden und Popup öffnen
    await new Promise(r => setTimeout(r, 300));
    karteMarkers.eachLayer(marker => {
        const mPos = marker.getLatLng();
        if (Math.abs(mPos.lat - lat) < 0.0001 && Math.abs(mPos.lng - lon) < 0.0001) {
            marker.openPopup();
        }
    });

    // Temporären Highlight-Kreis anzeigen
    const circle = L.circle([lat, lon], {
        color: 'var(--primary, #0ea5e9)',
        fillColor: 'var(--primary, #0ea5e9)',
        fillOpacity: 0.15,
        weight: 3,
        radius: 80
    }).addTo(karteMap);
    setTimeout(() => karteMap.removeLayer(circle), 3000);
};
