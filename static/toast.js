// ========================================
// TOAST NOTIFICATIONS (ersetzt alert)
// ========================================

function showToast(message, type = 'success', duration = 3000) {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';
    const title = type === 'success' ? 'Erfolg' : type === 'error' ? 'Fehler' : 'Info';
    
    toast.innerHTML = `
        <div class="toast-icon">${icon}</div>
        <div class="toast-content">
            <div class="toast-title">${title}</div>
            <div class="toast-message">${message}</div>
        </div>
        <button class="toast-close" onclick="this.parentElement.remove()">
            <i data-lucide="x" style="width: 16px; height: 16px;"></i>
        </button>
    `;
    
    container.appendChild(toast);
    lucide.createIcons();
    
    // Auto-remove after duration
    setTimeout(() => {
        toast.classList.add('hiding');
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

// Ersetzt die alten Funktionen
function showSuccess(message) {
    showToast(message, 'success');
}

function showError(message) {
    showToast(message, 'error');
}

// ========================================
// CONFIRM DIALOG (ersetzt confirm)
// ========================================

function showConfirm(message, title = 'Bestätigung erforderlich') {
    return new Promise((resolve) => {
        // Create overlay
        const overlay = document.createElement('div');
        overlay.className = 'confirm-overlay';
        
        overlay.innerHTML = `
            <div class="confirm-dialog">
                <div class="confirm-icon">⚠️</div>
                <div class="confirm-title">${title}</div>
                <div class="confirm-message">${message}</div>
                <div class="confirm-buttons">
                    <button class="btn btn-secondary" onclick="this.closest('.confirm-overlay').remove(); window.confirmResolve(false);">
                        <i data-lucide="x"></i>
                        Abbrechen
                    </button>
                    <button class="btn btn-primary" style="background: var(--danger);" onclick="this.closest('.confirm-overlay').remove(); window.confirmResolve(true);">
                        <i data-lucide="check"></i>
                        Bestätigen
                    </button>
                </div>
            </div>
        `;
        
        document.body.appendChild(overlay);
        lucide.createIcons();
        
        // Trigger animation
        setTimeout(() => overlay.classList.add('active'), 10);
        
        // Store resolve function globally
        window.confirmResolve = resolve;
    });
}

console.log('✨ Toast & Confirm System aktiviert! v3.0.1');
