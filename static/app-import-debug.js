// DEBUG VERSION - CSV Import with extensive logging

async function handleCSVImportDebug(event) {
    console.log('=== CSV IMPORT DEBUG START ===');
    
    const fileInput = document.getElementById('csvFile');
    console.log('File input element:', fileInput);
    
    const file = fileInput.files[0];
    console.log('Selected file:', file);
    
    if (!file) {
        console.error('No file selected!');
        alert('❌ Bitte wählen Sie eine CSV-Datei aus');
        return;
    }
    
    console.log('File details:', {
        name: file.name,
        size: file.size,
        type: file.type
    });
    
    if (!file.name.endsWith('.csv')) {
        console.error('File is not CSV:', file.name);
        alert('❌ Nur CSV-Dateien erlaubt');
        return;
    }
    
    const formData = new FormData();
    formData.append('file', file);
    console.log('FormData created:', formData);
    
    const importBtn = event ? event.target : document.querySelector('.import-footer .btn-primary');
    console.log('Import button:', importBtn);
    
    const originalText = importBtn.innerHTML;
    importBtn.innerHTML = '<i data-lucide="loader" style="animation: spin 1s linear infinite;"></i> Importiere...';
    importBtn.disabled = true;
    
    try {
        console.log('Sending request to /api/contacts/import/csv...');
        
        const response = await fetch('/api/contacts/import/csv', {
            method: 'POST',
            body: formData
        });
        
        console.log('Response status:', response.status);
        console.log('Response headers:', response.headers);
        
        const contentType = response.headers.get('content-type');
        console.log('Content-Type:', contentType);
        
        if (!contentType || !contentType.includes('application/json')) {
            const text = await response.text();
            console.error('Response is not JSON! Got:', text.substring(0, 500));
            throw new Error('Server returned HTML instead of JSON. Check console for details.');
        }
        
        const data = await response.json();
        console.log('Response data:', data);
        
        if (data.success) {
            console.log('Import successful!', data);
            closeImportModal();
            loadContacts();
            loadStats();
            if (typeof loadGlobalReminders === 'function') {
                loadGlobalReminders();
            }
            
            let message = `✅ ${data.imported} Kontakte erfolgreich importiert!`;
            if (data.errors && data.errors.length > 0) {
                console.warn('Import errors:', data.errors);
                message += `\n\n⚠️ ${data.errors.length} Fehler:\n${data.errors.slice(0, 5).join('\n')}`;
                if (data.errors.length > 5) {
                    message += `\n... und ${data.errors.length - 5} weitere`;
                }
            }
            alert(message);
        } else {
            console.error('Import failed:', data.error);
            alert('❌ ' + (data.error || 'Import fehlgeschlagen'));
        }
    } catch (error) {
        console.error('=== CSV IMPORT ERROR ===');
        console.error('Error:', error);
        console.error('Stack:', error.stack);
        alert('❌ Fehler beim Import:\n\n' + error.message + '\n\nDetails in der Browser-Konsole (F12)');
    } finally {
        importBtn.innerHTML = originalText;
        importBtn.disabled = false;
        lucide.createIcons();
        console.log('=== CSV IMPORT DEBUG END ===');
    }
}

// Replace the original function
window.handleCSVImport = handleCSVImportDebug;
console.log('✅ CSV Import Debug Mode aktiviert! Version: 2.1.0-debug');
