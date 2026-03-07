// --- Global State ---
window.coordinateMap = new Map();

// --- Helpers ---
function pad2(value) {
    return String(parseInt(value, 10)).padStart(2, '0');
}

function pad3(value) {
    return String(parseInt(value, 10)).padStart(3, '0');
}

// Parses only dot-format IDs used in this project:
//   G01.001 .. G10.998
//   P01.001 .. P10.998
// Returns null if not supported.
function parsePointId(value) {
    if (value === null || value === undefined) return null;
    const normalized = String(value).trim().toUpperCase();
    const match = normalized.match(/^([GP])(0[1-9]|10)\.(\d{3})$/);
    if (!match) return null;

    const family = match[1];
    const path = match[2];
    const index = parseInt(match[3], 10);
    if (!Number.isInteger(index) || index < 1 || index > 998) return null;

    return {
        normalized: `${family}${path}.${pad3(index)}`,
        family,
        path,
        index,
        patternKey: `${family}${path}`
    };
}

function getSuffixCodeFromPointId(parsedPointId) {
    if (!parsedPointId) return null;
    const isOdd = parsedPointId.index % 2 !== 0;
    if (parsedPointId.family === 'P') {
        return isOdd ? '01' : '02';
    }
    return isOdd ? '03' : '04';
}

function readFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target.result);
        reader.onerror = e => reject(e);
        reader.readAsText(file);
    });
}

function downloadFile(content, oldName, suffix) {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');

    const parts = oldName.split('.');
    const ext = parts.pop();
    const name = parts.join('.');

    a.href = url;
    a.download = `${name}${suffix}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function downloadTextFile(content, filename) {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Keep log bounded for long multi-run sessions (mobile safety)
const LOG_MAX_LINES = 400;

function enforceLogLimit(logDiv) {
    if (!logDiv) return;
    const maxNodes = LOG_MAX_LINES * 2 + 10;
    while (logDiv.childNodes.length > maxNodes) {
        logDiv.removeChild(logDiv.firstChild);
    }
}

function log(msg) {
    appendLog(String(msg), '');
}

function appendLog(msg, type) {
    const logDiv = document.getElementById('log');
    const span = document.createElement('span');
    if (type) span.className = type;
    span.textContent = msg;
    logDiv.appendChild(span);
    logDiv.appendChild(document.createTextNode('\n'));
    enforceLogLimit(logDiv);
}

function logSuccess(msg) { appendLog(msg, 'success'); }
function logWarning(msg) { appendLog(msg, 'warning'); }
function logError(msg) { appendLog(msg, 'error'); }
function clearLog() { document.getElementById('log').textContent = ''; }
