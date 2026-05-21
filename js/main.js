// --- App Logic ---
let uploadedFiles = [];
let uploadedFileEntries = [];
let detectedPatterns = [];
let sessionRenameReportLines = [];
let lastRunMasterName = null;

function getBaseNameNoExt(fileName) {
    const name = String(fileName || '').trim();
    if (!name) return '';
    const lastDot = name.lastIndexOf('.');
    if (lastDot <= 0) return name;
    return name.slice(0, lastDot);
}

function setElementDisabled(el, disabled) {
    if (!el) return;
    el.disabled = disabled;
}

function yieldToUi() {
    return new Promise(resolve => setTimeout(resolve, 0));
}

function setAppBusy(isBusy, message = '') {
    const ids = ['fileInput', 'masterFileSelect', 'processBtn', 'exportTxtBtn'];
    ids.forEach(id => setElementDisabled(document.getElementById(id), isBusy));

    const busyStatus = document.getElementById('busyStatus');
    if (busyStatus) {
        busyStatus.textContent = isBusy ? message : '';
    }
}

function updateExportSummary() {
    const summary = document.getElementById('exportSummary');
    if (!summary) return;

    const entries = Array.isArray(uploadedFileEntries) ? uploadedFileEntries.filter(Boolean) : [];
    if (entries.length === 0) {
        summary.textContent = 'No files loaded yet.';
        return;
    }

    const modifiedCount = entries.filter(entry => entry.modified).length;
    const logCount = Array.isArray(sessionRenameReportLines) ? sessionRenameReportLines.length : 0;
    const fileWord = entries.length === 1 ? 'file' : 'files';
    const modifiedWord = modifiedCount === 1 ? 'file' : 'files';
    summary.textContent = `${entries.length} ${fileWord} loaded. ${modifiedCount} modified ${modifiedWord} ready for export. TXT log entries: ${logCount}.`;
}

function updateManualModeUi() {
    const manualEnabled = !!document.getElementById('useLfNrStart')?.checked;
    const manualFields = document.getElementById('manualOverrideFields');
    if (manualFields) manualFields.style.display = manualEnabled ? '' : 'none';

    const container = document.getElementById('patternsContainer');
    if (container) {
        const inputs = container.querySelectorAll('input, select, textarea, button');
        inputs.forEach(i => setElementDisabled(i, manualEnabled));
    }
}

function normalizeLfNr(value) {
    const raw = String(value || '').trim();
    if (!/^\d{1,6}$/.test(raw)) return null;
    return String(parseInt(raw, 10)).padStart(6, '0');
}

function extractImesIpktPointId(line) {
    const yxzIndex = line.indexOf('|YXZ|');
    if (yxzIndex === -1) return null;
    const preYxz = line.substring(0, yxzIndex);
    const lastPipeIndex = preYxz.lastIndexOf('|');
    if (lastPipeIndex === -1) return null;
    return preYxz.substring(lastPipeIndex + 1).trim();
}

function isLfNrLine(line, targetLfNr) {
    return new RegExp(`^\\s*${targetLfNr}\\|`).test(line);
}

function countAvailableAfterLfNrInMaster(masterText, startLfNr) {
    const counts = new Map();
    let foundStart = false;
    const lines = masterText.split('\n');
    for (const line of lines) {
        if (!foundStart && isLfNrLine(line, startLfNr)) {
            foundStart = true;
        }
        if (!foundStart) continue;

        const id = extractImesIpktPointId(line);
        const parsed = id ? parsePointId(id) : null;
        if (!parsed) continue;
        if (!coordinateMap.has(parsed.normalized)) continue;
        counts.set(parsed.patternKey, (counts.get(parsed.patternKey) || 0) + 1);
    }
    return { foundStart, counts };
}

function getPointIdFromMasterByLfNr(masterText, targetLfNr) {
    if (!masterText || !targetLfNr) return null;
    const lines = masterText.split('\n');
    for (const line of lines) {
        if (isLfNrLine(line, targetLfNr)) {
            const id = extractImesIpktPointId(line);
            return id ? id.trim() : null;
        }
    }
    return null;
}

function detectPatternsFromMaster() {
    const patternsByKey = new Map();
    const order = [];

    for (const id of coordinateMap.keys()) {
        const parsed = parsePointId(id);
        if (!parsed) continue;

        let entry = patternsByKey.get(parsed.patternKey);
        if (!entry) {
            entry = {
                patternKey: parsed.patternKey,
                family: parsed.family,
                path: parsed.path,
                count: 0,
                minIndex: null,
                maxIndex: null,
                idsInOrder: []
            };
            patternsByKey.set(parsed.patternKey, entry);
            order.push(parsed.patternKey);
        }

        entry.count++;
        entry.idsInOrder.push(parsed.normalized);
        if (entry.minIndex === null || parsed.index < entry.minIndex) entry.minIndex = parsed.index;
        if (entry.maxIndex === null || parsed.index > entry.maxIndex) entry.maxIndex = parsed.index;
    }

    return order.map(key => patternsByKey.get(key));
}

function renderPatternConfig(patterns) {
    const container = document.getElementById('patternsContainer');
    container.innerHTML = '';

    if (!patterns || patterns.length === 0) {
        const empty = document.createElement('div');
        empty.textContent = 'No supported patterns found in master (expected G01.001..G10.998 or P01.001..P10.998).';
        container.appendChild(empty);
        return;
    }

    for (const pattern of patterns) {
        const wrapper = document.createElement('div');
        wrapper.className = 'form-group';
        wrapper.dataset.patternKey = pattern.patternKey;

        const title = document.createElement('div');
        title.textContent = `${pattern.patternKey}  (found ${pattern.count}, range ${pattern.patternKey}.${pad3(pattern.minIndex)}..${pattern.patternKey}.${pad3(pattern.maxIndex)})`;
        wrapper.appendChild(title);

        const grid = document.createElement('div');
        grid.className = 'grid-2';

        const baseGroup = document.createElement('div');
        baseGroup.className = 'form-group';
        const baseLabel = document.createElement('label');
        baseLabel.textContent = 'New Base Prefix';
        const baseInput = document.createElement('input');
        baseInput.type = 'text';
        baseInput.value = '';
        baseInput.placeholder = 'e.g. 3560';
        baseInput.dataset.role = 'basePrefix';
        baseInput.inputMode = 'decimal';
        baseInput.autocomplete = 'off';
        baseInput.spellcheck = false;
        baseGroup.appendChild(baseLabel);
        baseGroup.appendChild(baseInput);
        grid.appendChild(baseGroup);

        const mqGroup = document.createElement('div');
        mqGroup.className = 'form-group';
        const mqLabel = document.createElement('label');
        mqLabel.textContent = 'Start MQ Index';
        const mqInput = document.createElement('input');
        mqInput.type = 'number';
        mqInput.value = '1';
        mqInput.min = '1';
        mqInput.dataset.role = 'startMq';
        mqInput.inputMode = 'numeric';
        mqGroup.appendChild(mqLabel);
        mqGroup.appendChild(mqInput);
        grid.appendChild(mqGroup);

        const startGroup = document.createElement('div');
        startGroup.className = 'form-group';
        const startLabel = document.createElement('label');
        startLabel.textContent = 'Start Point (###)';
        const startInput = document.createElement('input');
        startInput.type = 'number';
        startInput.value = String(pattern.minIndex);
        startInput.min = '1';
        startInput.max = '998';
        startInput.dataset.role = 'startIndex';
        startInput.inputMode = 'numeric';
        startGroup.appendChild(startLabel);
        startGroup.appendChild(startInput);
        grid.appendChild(startGroup);

        const qtyGroup = document.createElement('div');
        qtyGroup.className = 'form-group';
        const qtyLabel = document.createElement('label');
        qtyLabel.textContent = 'QTY to Rename';
        const qtyInput = document.createElement('input');
        qtyInput.type = 'number';
        qtyInput.value = String(pattern.count);
        qtyInput.min = '1';
        qtyInput.dataset.role = 'limit';
        qtyInput.inputMode = 'numeric';
        qtyGroup.appendChild(qtyLabel);
        qtyGroup.appendChild(qtyInput);
        grid.appendChild(qtyGroup);

        wrapper.appendChild(grid);
        container.appendChild(wrapper);
    }
}

function getPatternConfigsFromUi() {
    const container = document.getElementById('patternsContainer');
    const blocks = Array.from(container.querySelectorAll('[data-pattern-key]'));
    const configs = [];

    for (const block of blocks) {
        const patternKey = block.dataset.patternKey;
        const basePrefix = (block.querySelector('[data-role="basePrefix"]')?.value || '').trim();
        const startMq = parseInt(block.querySelector('[data-role="startMq"]')?.value, 10);
        const startIndex = parseInt(block.querySelector('[data-role="startIndex"]')?.value, 10);
        const limit = parseInt(block.querySelector('[data-role="limit"]')?.value, 10);

        configs.push({ patternKey, basePrefix, startMq, startIndex, limit });
    }

    return configs;
}

function validatePatternConfigs(patterns, configs, options = {}) {
    const patternsByKey = new Map((patterns || []).map(p => [p.patternKey, p]));
    const errors = [];
    const useLfNrStart = !!options.useLfNrStart;
    const availableAfterLfNr = options.availableAfterLfNr || null;

    for (const cfg of configs) {
        const pattern = patternsByKey.get(cfg.patternKey);
        if (!pattern) {
            errors.push(`${cfg.patternKey}: pattern not found in master.`);
            continue;
        }
        if (!cfg.basePrefix) {
            errors.push(`${cfg.patternKey}: New Base Prefix is required.`);
        } else if (!isSafeNameComponent(cfg.basePrefix)) {
            errors.push(`${cfg.patternKey}: New Base Prefix may contain only letters, numbers, dot, underscore, and hyphen.`);
        }
        if (!Number.isInteger(cfg.startMq) || cfg.startMq < 1) {
            errors.push(`${cfg.patternKey}: Start MQ must be >= 1.`);
        }
        if (!Number.isInteger(cfg.startIndex) || cfg.startIndex < 1 || cfg.startIndex > 998) {
            errors.push(`${cfg.patternKey}: Start Point must be in range 1..998.`);
        }
        if (!Number.isInteger(cfg.limit) || cfg.limit < 1) {
            errors.push(`${cfg.patternKey}: QTY to Rename must be >= 1.`);
        }

        if (useLfNrStart) {
            const available = availableAfterLfNr ? (availableAfterLfNr.get(cfg.patternKey) || 0) : 0;
            if (cfg.limit > available) {
                errors.push(`${cfg.patternKey}: requested ${cfg.limit}, but only ${available} points are available from <LfNr> start in master.`);
            }
        } else {
            const startOldId = `${cfg.patternKey}.${pad3(cfg.startIndex)}`;
            if (!coordinateMap.has(startOldId)) {
                errors.push(`${cfg.patternKey}: Start point ${startOldId} not found in master.`);
            }

            const startPos = pattern.idsInOrder.indexOf(startOldId);
            if (startPos === -1) {
                errors.push(`${cfg.patternKey}: Start point ${startOldId} not found in ordered master list.`);
            } else {
                const available = pattern.idsInOrder.length - startPos;
                if (cfg.limit > available) {
                    errors.push(`${cfg.patternKey}: requested ${cfg.limit}, but only ${available} points are available from ${startOldId} in master order.`);
                }
            }
        }
    }

    return errors;
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('fileInput').addEventListener('change', handleFileSelect);
    document.getElementById('masterFileSelect').addEventListener('change', analyzeCurrentMaster);
    document.getElementById('processBtn').addEventListener('click', processFiles);
    document.getElementById('exportTxtBtn').addEventListener('click', exportTxtReport);
    document.getElementById('useLfNrStart').addEventListener('change', updateManualModeUi);
    updateManualModeUi();
    updateExportSummary();
});

async function handleFileSelect(event) {
    setAppBusy(true, 'Reading selected files...');
    await yieldToUi();

    try {
        // New session starts when user selects new input files.
        clearLog();
        sessionRenameReportLines = [];
        detectedPatterns = [];
        coordinateMap.clear();
        lastRunMasterName = null;

        const selectedFiles = Array.from(event.target.files);
        const acceptedResult = filterAcceptedInputFiles(selectedFiles);
        for (const warning of acceptedResult.warnings) logWarning(warning);

        uploadedFiles = acceptedResult.accepted;
        uploadedFileEntries = new Array(uploadedFiles.length);
        updateExportSummary();
        const select = document.getElementById('masterFileSelect');
        select.innerHTML = '';

        if (uploadedFiles.length === 0) {
            select.innerHTML = '<option value="">No files selected</option>';
            if (selectedFiles.length > 0) logError('No supported files remained after safety checks.');
            return;
        }

        let selectedIndex = 0;
        for (let i = 0; i < uploadedFiles.length; i++) {
            const ext = getFileExtension(uploadedFiles[i].name);
            if (ext === 'ipkt' || ext === 'imes') {
                selectedIndex = i;
                break;
            } else if (ext === 'lqp' && selectedIndex === 0) {
                selectedIndex = i;
            }
        }

        uploadedFiles.forEach((file, index) => {
            const opt = document.createElement('option');
            opt.value = index;
            opt.text = file.name;
            select.add(opt);
        });

        select.selectedIndex = selectedIndex;
        log(`Loaded ${uploadedFiles.length} files (${formatBytes(acceptedResult.totalBytes)}). Default master: ${uploadedFiles[selectedIndex].name}`);

        log('Reading files into session memory...');
        let loadedCount = 0;
        for (let i = 0; i < uploadedFiles.length; i++) {
            const file = uploadedFiles[i];
            try {
                const text = await readFile(file);
                const ext = getFileExtension(file.name);
                uploadedFileEntries[i] = {
                    file,
                    name: file.name,
                    ext,
                    originalContent: text,
                    currentContent: text,
                    modified: false
                };
                loadedCount++;
                updateExportSummary();
            } catch (e) {
                logError(`Failed to read ${file.name}: ${e.message || e}`);
                uploadedFileEntries[i] = null;
            }
        }
        logSuccess(`Session ready: ${loadedCount}/${uploadedFiles.length} files loaded.`);

        await analyzeCurrentMaster();
    } finally {
        setAppBusy(false);
        updateExportSummary();
    }
}

async function analyzeCurrentMaster() {
    const masterIndexValue = document.getElementById('masterFileSelect').value;
    if (masterIndexValue === '') return;
    const masterIndex = Number(masterIndexValue);
    if (!Number.isInteger(masterIndex) || masterIndex < 0 || masterIndex >= uploadedFiles.length) return;
    if (!uploadedFiles || uploadedFiles.length <= masterIndex) return;

    const masterFile = uploadedFiles[masterIndex];
    const masterEntry = uploadedFileEntries[masterIndex];

    try {
        if (!masterEntry) {
            return logError('Master file content is not loaded. Please reselect files.');
        }
        buildCoordinateMap(masterEntry.originalContent, masterFile.name);

        detectedPatterns = detectPatternsFromMaster();
        renderPatternConfig(detectedPatterns);

        if (detectedPatterns.length > 0) {
            const total = detectedPatterns.reduce((sum, p) => sum + p.count, 0);
            logSuccess(`Auto-detected: ${detectedPatterns.length} patterns, ${total} points total (dot format).`);
        } else {
            logWarning('No dot-format patterns detected in master. Expected G01.001..G10.998 and/or P01.001..P10.998.');
        }
    } catch (e) {
        console.error(e);
        logError('Analysis error: ' + e.message);
    }
}

window.analyzeCurrentMaster = analyzeCurrentMaster;

async function processFiles() {
    setAppBusy(true, 'Renaming points...');
    await yieldToUi();

    try {
        const masterIndexValue = document.getElementById('masterFileSelect').value;
        if (masterIndexValue === '') return alert('Please select files first.');
        const masterIndex = Number(masterIndexValue);
        if (!Number.isInteger(masterIndex) || masterIndex < 0 || masterIndex >= uploadedFiles.length) {
            return logError('Invalid master file selection. Please reselect files.');
        }

        const masterFile = uploadedFiles[masterIndex];
        const masterEntry = uploadedFileEntries[masterIndex];
        const manualEnabled = !!document.getElementById('useLfNrStart')?.checked;
        const startLfNr = normalizeLfNr(document.getElementById('startLfNr').value);
        const manualNewName = (document.getElementById('manualNewPointName')?.value || '').trim();

        if (!masterEntry) {
            return logError('Master file content is not loaded. Please reselect files.');
        }

        lastRunMasterName = masterFile.name;
        log(`Rename run started. Master: ${masterFile.name}`);

        buildCoordinateMap(masterEntry.originalContent, masterFile.name);

        if (coordinateMap.size === 0) {
            return logError('No coordinates found in Master file! Check format.');
        }
        log(`Indexed ${coordinateMap.size} points from master.`);
        detectedPatterns = detectPatternsFromMaster();

        const masterExt = getFileExtension(masterFile.name);
        if (manualEnabled) {
            if (!(masterExt === 'imes' || masterExt === 'ipkt')) {
                return logError('Manual <LfNr> mode requires Master to be .imes or .ipkt.');
            }
            if (!startLfNr) {
                return logError('Invalid Start <LfNr>. Please enter digits like 22 or 000022.');
            }
            if (!manualNewName) {
                return logError('Manual mode: New Point Name is required.');
            }
            if (manualNewName.includes('|') || /\s/.test(manualNewName)) {
                return logError('Manual mode: New Point Name must not contain spaces or "|".');
            }

            const oldId = getPointIdFromMasterByLfNr(masterEntry.originalContent, startLfNr);
            if (!oldId) {
                return logError(`Manual mode: <LfNr> "${startLfNr}" not found in master.`);
            }
            if (!coordinateMap.has(oldId)) {
                return logError(`Manual mode: Point at <LfNr> ${startLfNr} is not eligible (not found in Master coordinate map): "${oldId}"`);
            }

            let totalRenames = 0;
            let filesChanged = 0;

            const entriesToProcess = [
                uploadedFileEntries[masterIndex],
                ...uploadedFileEntries.filter((entry, idx) => idx !== masterIndex && !!entry)
            ].filter(Boolean);

            for (const entry of entriesToProcess) {
                try {
                    const result = processSingleFileSinglePointRename(
                        entry.currentContent,
                        entry.ext,
                        oldId,
                        manualNewName,
                        {
                            fileName: entry.name,
                            reportLines: sessionRenameReportLines
                        }
                    );
                    if (result.modified) {
                        entry.currentContent = result.content;
                        entry.modified = true;
                        filesChanged++;
                        totalRenames += result.count;
                    }
                } catch (e) {
                    logError(`Error processing ${entry.name}: ${e.message}`);
                }
            }

            if (totalRenames > 0) {
                logSuccess(`Manual: <LfNr> ${startLfNr} | ${oldId} -> ${manualNewName} | renames: ${totalRenames} | files changed: ${filesChanged}`);
            } else {
                logWarning(`Manual: <LfNr> ${startLfNr} | ${oldId} -> ${manualNewName} | no changes (point not found in current session files).`);
            }
            return;
        }

        // Normal (pattern) mode
        const configs = getPatternConfigsFromUi();
        log(`Pattern mode. Patterns: ${configs.length}`);

        const validationErrors = validatePatternConfigs(detectedPatterns, configs, {
            useLfNrStart: false,
            availableAfterLfNr: null
        });
        if (validationErrors.length > 0) {
            for (const msg of validationErrors) logError(msg);
            return;
        }
        logSuccess('Validation passed for all patterns.');

        const sessions = configs.map(cfg => ({
            patternKey: cfg.patternKey,
            basePrefix: cfg.basePrefix,
            startOldId: `${cfg.patternKey}.${pad3(cfg.startIndex)}`,
            startIndex: cfg.startIndex,
            startMq: cfg.startMq,
            startPairIndex: Math.floor((cfg.startIndex - 1) / 2),
            mqIndex: cfg.startMq,
            limit: cfg.limit,
            renamedCount: 0,
            active: false,
            done: false,
            lastSuffixCode: null
        }));

        let totalRenames = 0;
        let filesChanged = 0;

        const entriesToProcess = [
            uploadedFileEntries[masterIndex],
            ...uploadedFileEntries.filter((entry, idx) => idx !== masterIndex && !!entry)
        ].filter(Boolean);

        for (const entry of entriesToProcess) {
            try {
                const result = processSingleFileMultiPattern(
                    entry.currentContent,
                    entry.ext,
                    sessions,
                    {
                        fileName: entry.name,
                        reportLines: sessionRenameReportLines,
                        useLfNrStart: false
                    }
                );
                if (result.modified) {
                    entry.currentContent = result.content;
                    entry.modified = true;
                    filesChanged++;
                    totalRenames += result.count;
                }
            } catch (e) {
                logError(`Error processing ${entry.name}: ${e.message}`);
            }
        }

        const summary = sessions.map(s => `${s.patternKey}: ${s.renamedCount}/${s.limit}, next MQ ${pad2(s.mqIndex)}`).join(' | ');
        logSuccess(`Pattern run done. Renames: ${totalRenames} | files changed: ${filesChanged} | ${summary}`);
    } finally {
        setAppBusy(false);
        updateExportSummary();
    }
}

function exportTxtReport() {
    const hasFiles = Array.isArray(uploadedFileEntries) && uploadedFileEntries.some(e => !!e);
    if (!hasFiles) {
        return logWarning('No session files loaded yet.');
    }

    const suffix = (document.getElementById('suffix')?.value || '').trim();
    if (!isSafeOutputSuffix(suffix)) {
        return logError('Output Suffix may contain only letters, numbers, dot, underscore, and hyphen.');
    }
    let downloadedFiles = 0;
    for (const entry of uploadedFileEntries) {
        if (entry && entry.modified) {
            downloadFile(entry.currentContent, entry.name, suffix);
            downloadedFiles++;
        }
    }

    let exportedTxt = false;
    if (sessionRenameReportLines && sessionRenameReportLines.length > 0) {
        const header = [
            'PunktNameChanger TXT Report',
            `Generated: ${new Date().toISOString()}`
        ];
        const content = header.concat([''], sessionRenameReportLines).join('\n');

        const base = getBaseNameNoExt(lastRunMasterName);
        const reportName = base ? `${base}_log.txt` : 'rename_log.txt';
        downloadTextFile(content, reportName);
        exportedTxt = true;
    }

    if (downloadedFiles === 0 && !exportedTxt) {
        return logWarning('Nothing to export yet. Run Rename first.');
    }
    updateExportSummary();
    logSuccess(`Export complete. Files: ${downloadedFiles}, TXT: ${exportedTxt ? 'yes' : 'no'}.`);
}
