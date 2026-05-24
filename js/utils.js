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
//   Q01.001 .. Q10.998
// Returns null if not supported.
function parsePointId(value) {
    if (value === null || value === undefined) return null;
    const normalized = String(value).trim().toUpperCase();
    const match = normalized.match(/^([GPQ])(0[1-9]|10)\.(\d{3})$/);
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
    if (parsedPointId.family === 'Q') {
        const position = (parsedPointId.index - 1) % 4;
        return ['03', '04', '01', '02'][position];
    }

    const isOdd = parsedPointId.index % 2 !== 0;
    if (parsedPointId.family === 'P') {
        return isOdd ? '01' : '02';
    }
    return isOdd ? '03' : '04';
}

function isQuadroPrismPoint(parsedPointId) {
    return !!parsedPointId && parsedPointId.family === 'Q' && ((parsedPointId.index - 1) % 4) >= 2;
}

function addDeltaToNumericField(valueText, delta) {
    const raw = String(valueText);
    const match = raw.match(/^(\s*)([+-]?\d+(?:\.\d+)?)(\s*)$/);
    if (!match) return null;

    const numericText = match[2];
    const decimals = numericText.includes('.') ? Math.max(numericText.split('.')[1].length, 2) : 2;
    const updated = (parseFloat(numericText) + delta).toFixed(decimals);
    const targetWidth = Math.max(raw.length - match[3].length, updated.length);
    return updated.padStart(targetWidth, ' ') + match[3];
}

function applyQuadroPrismHeightOffset(line, patternType) {
    if (patternType === 'imes') {
        const yxzIndex = line.indexOf('|YXZ|');
        if (yxzIndex === -1) return line;

        const postYxz = line.substring(yxzIndex + 5);
        const parts = postYxz.split('|');
        if (parts.length < 3) return line;

        const adjustedHeight = addDeltaToNumericField(parts[2], -0.04);
        if (adjustedHeight === null) return line;

        parts[2] = adjustedHeight;
        return line.substring(0, yxzIndex + 5) + parts.join('|');
    }

    if (patternType === 'iroh') {
        let changed = false;
        const updated = line.replace(/(\b(?:H|Z):)([^|]*)/, (full, label, value) => {
            if (changed) return full;
            const adjustedHeight = addDeltaToNumericField(value, -0.04);
            if (adjustedHeight === null) return full;
            changed = true;
            return label + adjustedHeight;
        });
        return updated;
    }

    if (patternType === 'lqp') {
        const match = line.match(/^(\s*\S+\s+\S+\s+\S+\s+)([+-]?\d+(?:\.\d+)?)(.*)$/);
        if (!match) return line;

        const adjustedHeight = addDeltaToNumericField(match[2], -0.04);
        if (adjustedHeight === null) return line;
        return match[1] + adjustedHeight.trim() + match[3];
    }

    return line;
}

const SUPPORTED_INPUT_EXTENSIONS = new Set(['imes', 'ipkt', 'iroh', 'lqp', 'txt']);
const MAX_INPUT_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_SESSION_FILE_SIZE_BYTES = 30 * 1024 * 1024;
const SAFE_NAME_COMPONENT_PATTERN = /^[A-Za-z0-9._-]+$/;
const SAFE_SUFFIX_PATTERN = /^[A-Za-z0-9._-]*$/;

function getFileExtension(fileName) {
    const parts = String(fileName || '').split('.');
    return parts.length > 1 ? parts.pop().toLowerCase() : '';
}

function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    return `${(kb / 1024).toFixed(1)} MB`;
}

function isSupportedInputExtension(fileName) {
    return SUPPORTED_INPUT_EXTENSIONS.has(getFileExtension(fileName));
}

function isSafeNameComponent(value) {
    return SAFE_NAME_COMPONENT_PATTERN.test(String(value || '').trim());
}

function isSafeOutputSuffix(value) {
    return SAFE_SUFFIX_PATTERN.test(String(value || '').trim());
}

function filterAcceptedInputFiles(files) {
    const accepted = [];
    const warnings = [];
    let totalBytes = 0;

    for (const file of files) {
        if (!isSupportedInputExtension(file.name)) {
            warnings.push(`Skipped ${file.name}: unsupported extension.`);
            continue;
        }

        if (file.size > MAX_INPUT_FILE_SIZE_BYTES) {
            warnings.push(`Skipped ${file.name}: ${formatBytes(file.size)} exceeds ${formatBytes(MAX_INPUT_FILE_SIZE_BYTES)} file limit.`);
            continue;
        }

        if (totalBytes + file.size > MAX_SESSION_FILE_SIZE_BYTES) {
            warnings.push(`Skipped ${file.name}: session would exceed ${formatBytes(MAX_SESSION_FILE_SIZE_BYTES)} total limit.`);
            continue;
        }

        accepted.push(file);
        totalBytes += file.size;
    }

    return { accepted, warnings, totalBytes };
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
    logDiv.scrollTop = logDiv.scrollHeight;
}

function logSuccess(msg) { appendLog(msg, 'success'); }
function logWarning(msg) { appendLog(msg, 'warning'); }
function logError(msg) { appendLog(msg, 'error'); }
function clearLog() { document.getElementById('log').textContent = ''; }
