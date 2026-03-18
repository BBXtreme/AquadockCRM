// ========================================
// DATE HELPER (für konsistente Überfällig-Prüfung)
// ========================================

function getTodayWithoutTime() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
}

function getDateWithoutTime(dateString) {
    const date = new Date(dateString);
    date.setHours(0, 0, 0, 0);
    return date;
}

function isOverdue(dueDateString) {
    const today = getTodayWithoutTime();
    const dueDate = getDateWithoutTime(dueDateString);
    return dueDate < today;
}

function isToday(dueDateString) {
    const today = getTodayWithoutTime();
    const dueDate = getDateWithoutTime(dueDateString);
    return dueDate.getTime() === today.getTime();
}

function isTomorrow(dueDateString) {
    const today = getTodayWithoutTime();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dueDate = getDateWithoutTime(dueDateString);
    return dueDate.getTime() === tomorrow.getTime();
}

console.log('✅ Date Helper geladen - konsistente Datums-Vergleiche');
