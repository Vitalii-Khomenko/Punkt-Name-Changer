// --- Renaming Logic ---

function processSingleFileSinglePointRename(content, ext, oldId, newName, options = {}) {
    if (typeof content !== 'string') {
        throw new Error('Invalid file content.');
    }
    if (!oldId || !newName) {
        throw new Error('Manual rename requires oldId and newName.');
    }
    if (!coordinateMap.has(oldId)) {
        return { modified: false, count: 0, content };
    }

    const reportLines = Array.isArray(options.reportLines) ? options.reportLines : null;
    const fileName = options.fileName || '';

    const lines = content.split('\n');
    const newLines = [];
    let localRenameCount = 0;

    for (let line of lines) {
        if (ext === 'imes' || ext === 'ipkt') {
            const yxzIndex = line.indexOf('|YXZ|');
            if (yxzIndex > -1) {
                const preYxz = line.substring(0, yxzIndex);
                const lastPipeIndex = preYxz.lastIndexOf('|');
                if (lastPipeIndex > -1) {
                    const idInLine = preYxz.substring(lastPipeIndex + 1).trim();
                    if (idInLine === oldId) {
                        let valid = true;
                        const postYxz = line.substring(yxzIndex + 5);
                        const parts = postYxz.split('|');
                        if (parts.length >= 2) {
                            const y = parseFloat(parts[0].trim());
                            const x = parseFloat(parts[1].trim());
                            if (!isNaN(y) && !isNaN(x)) {
                                const master = coordinateMap.get(oldId);
                                if (Math.abs(master.y - y) > 0.05 || Math.abs(master.x - x) > 0.05) {
                                    logWarning(`Skipping ${oldId}: Coords mismatch (File: ${y},${x} | Master: ${master.y},${master.x})`);
                                    valid = false;
                                }
                            }
                        }

                        if (valid) {
                            const originalSegment = line.substring(lastPipeIndex + 1, yxzIndex);
                            const originalLen = originalSegment.length;
                            let newPaddingLen = originalLen - newName.length;
                            if (newPaddingLen < 0) newPaddingLen = 0;
                            const newSegment = ' '.repeat(newPaddingLen) + newName;
                            line = line.substring(0, lastPipeIndex + 1) + newSegment + line.substring(yxzIndex);
                            localRenameCount++;
                            if (reportLines) reportLines.push(`${fileName}|${oldId} -> ${newName}`);
                        }
                    }
                }
            }
            newLines.push(line);
            continue;
        }

        if (ext === 'iroh') {
            if (!line.includes('PID:')) {
                newLines.push(line);
                continue;
            }

            const pipeParts = line.split('|');
            let tempPid = null, tempY = null, tempX = null;
            let isHeader = false;

            for (let part of pipeParts) {
                const trimmed = part.trim();
                if (trimmed.startsWith('PID:')) tempPid = trimmed.substring(4).trim();
                if (trimmed.startsWith('CLS:')) {
                    const clsVal = trimmed.substring(4).trim();
                    if (clsVal === 'STAT') isHeader = true;
                }
                if (trimmed.startsWith('Y:')) {
                    const val = trimmed.substring(2).trim();
                    if (val) tempY = parseFloat(val);
                }
                if (trimmed.startsWith('X:')) {
                    const val = trimmed.substring(2).trim();
                    if (val) tempX = parseFloat(val);
                }
                if (trimmed.startsWith('CODE:')) {
                    const codeVal = trimmed.substring(5).trim();
                    if (codeVal === 'iGeo') isHeader = true;
                }
            }

            if (!isHeader && tempPid === oldId) {
                if (!Number.isFinite(tempY) || !Number.isFinite(tempX)) {
                    newLines.push(line);
                    continue;
                }

                const master = coordinateMap.get(oldId);
                if (Math.abs(master.y - tempY) > 0.05 || Math.abs(master.x - tempX) > 0.05) {
                    logWarning(`Skipping ${oldId}: Coords mismatch (File: ${tempY},${tempX} | Master: ${master.y},${master.x})`);
                    newLines.push(line);
                    continue;
                }

                const pidStartIdx = line.indexOf('PID:');
                if (pidStartIdx > -1) {
                    const pipeAfterPid = line.indexOf('|', pidStartIdx);
                    if (pipeAfterPid > -1) {
                        const fieldContent = line.substring(pidStartIdx, pipeAfterPid);
                        const fieldWidth = fieldContent.length;
                        const label = 'PID:';
                        const availableSpace = fieldWidth - label.length;
                        let padding = availableSpace - newName.length;
                        if (padding < 0) padding = 0;
                        const newField = label + ' '.repeat(padding) + newName;
                        line = line.substring(0, pidStartIdx) + newField + line.substring(pipeAfterPid);
                        localRenameCount++;
                        if (reportLines) reportLines.push(`${fileName}|${oldId} -> ${newName}`);
                    }
                }
            }

            newLines.push(line);
            continue;
        }

        if (ext === 'lqp') {
            const trimmed = line.trim();
            if (trimmed.length > 0) {
                const tokens = trimmed.split(/\s+/);
                const candidateId = tokens[0];
                const secondToken = parseFloat(tokens[1]);
                const thirdToken = parseFloat(tokens[2]);
                const looksLikeLqpMeasurementLine =
                    Number.isFinite(secondToken) &&
                    Number.isFinite(thirdToken) &&
                    secondToken >= 0 && secondToken <= 400 &&
                    thirdToken >= 0 && thirdToken <= 400;

                const isDate = /^\d{2}\.\d{2}\.\d{4}/.test(candidateId);
                const isSep = /^[-=]+$/.test(candidateId);
                const isLabel = /^[A-Za-z]+$/.test(candidateId) && !/\d/.test(candidateId);

                if (!isDate && !isSep && !isLabel && looksLikeLqpMeasurementLine) {
                    if (candidateId === oldId && coordinateMap.has(candidateId)) {
                        const idIndex = line.indexOf(candidateId);
                        if (idIndex > -1 && idIndex < 20) {
                            const idEndIndex = idIndex + candidateId.length;
                            const dataPart = line.substring(idEndIndex);
                            const totalSpaceAvailable = idEndIndex;
                            const newNameLen = newName.length;
                            let newPaddingSize = totalSpaceAvailable - newNameLen;
                            let prefixSpace = '';
                            if (newPaddingSize > 0) prefixSpace = ' '.repeat(newPaddingSize);
                            line = prefixSpace + newName + dataPart;
                            localRenameCount++;
                            if (reportLines) reportLines.push(`${fileName}|${oldId} -> ${newName}`);
                        }
                    }
                }
            }
            newLines.push(line);
            continue;
        }

        newLines.push(line);
    }

    return {
        modified: localRenameCount > 0,
        count: localRenameCount,
        content: newLines.join('\n')
    };
}

function processSingleFileMultiPattern(content, ext, sessions, options = {}) {
    if (content.length > 5 * 1024 * 1024 && !content.includes('\n')) {
        throw new Error('File too large and lacks newlines. Possible binary or corrupted file.');
    }

    const reportLines = Array.isArray(options.reportLines) ? options.reportLines : null;
    const fileName = options.fileName || '';

    const useLfNrStart = !!options.useLfNrStart && (ext === 'imes' || ext === 'ipkt');
    const startLfNr = options.startLfNr || null;
    const manualState = options.manualState && typeof options.manualState === 'object' ? options.manualState : { started: false };

    const manualOverride = options.manualOverride && typeof options.manualOverride === 'object' ? options.manualOverride : null;
    const manualOverrideEnabled = !!(manualOverride && manualOverride.enabled);

    const sessionsByKey = new Map();
    for (const s of sessions) {
        sessionsByKey.set(s.patternKey, s);
    }

    const lines = content.split('\n');
    const newLines = [];
    let localRenameCount = 0;

    for (let line of lines) {
        let id = null, y = null, x = null;
        let lfNr = null;
        let patternType = 'unknown';

        const yxzIndex = line.indexOf('|YXZ|');
        if (yxzIndex > -1) {
            const firstPipeIndex = line.indexOf('|');
            if (firstPipeIndex > -1) {
                const rawLfNr = line.substring(0, firstPipeIndex).trim();
                if (/^\d{1,6}$/.test(rawLfNr)) {
                    lfNr = String(parseInt(rawLfNr, 10)).padStart(6, '0');
                }
            }
            const preYxz = line.substring(0, yxzIndex);
            const lastPipeIndex = preYxz.lastIndexOf('|');
            if (lastPipeIndex > -1) {
                id = preYxz.substring(lastPipeIndex + 1).trim();

                const postYxz = line.substring(yxzIndex + 5);
                const parts = postYxz.split('|');
                if (parts.length >= 2) {
                    y = parseFloat(parts[0].trim());
                    x = parseFloat(parts[1].trim());
                    patternType = 'imes';
                }
            }
        }

        if (useLfNrStart && !manualState.started && patternType === 'imes' && lfNr && startLfNr && lfNr === startLfNr) {
            manualState.started = true;
        }

        if (manualOverrideEnabled && manualState.started && manualOverride.remaining > 0 && id) {
            const parsed = parsePointId(id);
            const masterKey = parsed ? parsed.normalized : null;
            if (parsed && masterKey && coordinateMap.has(masterKey)) {
                let valid = false;
                const master = coordinateMap.get(masterKey);

                if (patternType === 'iroh' && (y === null || x === null || isNaN(y) || isNaN(x))) {
                    valid = false;
                } else if (y !== null && x !== null && !isNaN(y) && !isNaN(x)) {
                    if (Math.abs(master.y - y) > 0.05 || Math.abs(master.x - x) > 0.05) {
                        logWarning(`Skipping ${id}: Coords mismatch (File: ${y},${x} | Master: ${master.y},${master.x})`);
                        valid = false;
                    } else {
                        valid = true;
                    }
                } else {
                    valid = true;
                }

                if (valid) {
                    const suffixCode = getSuffixCodeFromPointId(parsed);
                    const mqString = pad2(manualOverride.mqIndex);
                    const newName = `${manualOverride.basePrefix}.MQ${mqString}.${suffixCode}`;

                    if (suffixCode === '04' || suffixCode === '02') {
                        manualOverride.mqIndex++;
                    }

                    if (patternType === 'imes') {
                        const yxzIdx = line.indexOf('|YXZ|');
                        const pre = line.substring(0, yxzIdx);
                        const pipeIdx = pre.lastIndexOf('|');
                        const originalSegment = line.substring(pipeIdx + 1, yxzIdx);
                        const originalLen = originalSegment.length;
                        let newPaddingLen = originalLen - newName.length;
                        if (newPaddingLen < 0) newPaddingLen = 0;
                        const newSegment = ' '.repeat(newPaddingLen) + newName;
                        line = line.substring(0, pipeIdx + 1) + newSegment + line.substring(yxzIdx);
                    } else if (patternType === 'iroh') {
                        const pidStartIdx = line.indexOf('PID:');
                        if (pidStartIdx > -1) {
                            const pipeAfterPid = line.indexOf('|', pidStartIdx);
                            if (pipeAfterPid > -1) {
                                const fieldContent = line.substring(pidStartIdx, pipeAfterPid);
                                const fieldWidth = fieldContent.length;
                                const label = 'PID:';
                                const availableSpace = fieldWidth - label.length;
                                let padding = availableSpace - newName.length;
                                if (padding < 0) padding = 0;
                                const newField = label + ' '.repeat(padding) + newName;
                                line = line.substring(0, pidStartIdx) + newField + line.substring(pipeAfterPid);
                            }
                        }
                    } else if (patternType === 'lqp') {
                        const idIndex = line.indexOf(id);
                        if (idIndex > -1 && idIndex < 20) {
                            const idEndIndex = idIndex + id.length;
                            const dataPart = line.substring(idEndIndex);
                            const totalSpaceAvailable = idEndIndex;
                            const newNameLen = newName.length;
                            let newPaddingSize = totalSpaceAvailable - newNameLen;
                            let prefixSpace = '';
                            if (newPaddingSize > 0) {
                                prefixSpace = ' '.repeat(newPaddingSize);
                            }
                            line = prefixSpace + newName + dataPart;
                        }
                    }

                    localRenameCount++;
                    manualOverride.remaining--;
                    if (reportLines) {
                        reportLines.push(`${fileName}|${id} -> ${newName}`);
                    }
                }
            }

            newLines.push(line);
            continue;
        }

        if (!id && line.includes('PID:')) {
            const pipeParts = line.split('|');
            let tempPid = null, tempY = null, tempX = null;
            let isHeader = false;

            for (let part of pipeParts) {
                const trimmed = part.trim();
                if (trimmed.startsWith('PID:')) tempPid = trimmed.substring(4).trim();
                if (trimmed.startsWith('CLS:')) {
                    const clsVal = trimmed.substring(4).trim();
                    if (clsVal === 'STAT') isHeader = true;
                }
                if (trimmed.startsWith('Y:')) {
                    const val = trimmed.substring(2).trim();
                    if (val) tempY = parseFloat(val);
                }
                if (trimmed.startsWith('X:')) {
                    const val = trimmed.substring(2).trim();
                    if (val) tempX = parseFloat(val);
                }
                if (trimmed.startsWith('CODE:')) {
                    const codeVal = trimmed.substring(5).trim();
                    if (codeVal === 'iGeo') isHeader = true;
                }
            }

            if (tempPid && !isHeader) {
                id = tempPid;
                y = tempY;
                x = tempX;
                patternType = 'iroh';
            }
        }

        if (!id && ext === 'lqp') {
            const trimmed = line.trim();
            if (trimmed.length > 0) {
                const tokens = trimmed.split(/\s+/);
                const candidateId = tokens[0];
                const secondToken = parseFloat(tokens[1]);
                const thirdToken = parseFloat(tokens[2]);
                const looksLikeLqpMeasurementLine =
                    Number.isFinite(secondToken) &&
                    Number.isFinite(thirdToken) &&
                    secondToken >= 0 && secondToken <= 400 &&
                    thirdToken >= 0 && thirdToken <= 400;

                const isDate = /^\d{2}\.\d{2}\.\d{4}/.test(candidateId);
                const isSep = /^[-=]+$/.test(candidateId);
                const isLabel = /^[A-Za-z]+$/.test(candidateId) && !/\d/.test(candidateId);

                if (!isDate && !isSep && !isLabel) {
                    if (looksLikeLqpMeasurementLine && coordinateMap.has(candidateId)) {
                        id = candidateId;
                        patternType = 'lqp';
                    }
                }
            }
        }

        if (id) {
            const parsed = parsePointId(id);
            const session = parsed ? sessionsByKey.get(parsed.patternKey) : null;

            if (session && !session.done) {
                if (!useLfNrStart) {
                    if (!session.active) {
                        if (id === session.startOldId) {
                            session.active = true;
                        }
                    }
                }

                const sessionIsActive = useLfNrStart ? manualState.started : session.active;

                if (sessionIsActive && session.renamedCount < session.limit) {
                    let valid = false;

                    if (coordinateMap.has(id)) {
                        const master = coordinateMap.get(id);

                        if (patternType === 'iroh' && (y === null || x === null || isNaN(y) || isNaN(x))) {
                            valid = false;
                        } else if (y !== null && x !== null && !isNaN(y) && !isNaN(x)) {
                            if (Math.abs(master.y - y) > 0.05 || Math.abs(master.x - x) > 0.05) {
                                logWarning(`Skipping ${id}: Coords mismatch (File: ${y},${x} | Master: ${master.y},${master.x})`);
                                valid = false;
                            } else {
                                valid = true;
                            }
                        } else {
                            valid = true;
                        }
                    } else {
                        valid = false;
                    }

                    if (valid) {
                        const suffixCode = getSuffixCodeFromPointId(parsed);
                        const isOddSuffix = (suffixCode === '01' || suffixCode === '03');
                        const isEvenSuffix = (suffixCode === '02' || suffixCode === '04');

                        // If current is odd and previous was also odd, the previous had no
                        // even partner to close it — start a new MQ for the current point.
                        if (isOddSuffix && session.lastSuffixCode !== null) {
                            const prevWasOdd = (session.lastSuffixCode === '01' || session.lastSuffixCode === '03');
                            if (prevWasOdd) session.mqIndex++;
                        }

                        const mqString = pad2(session.mqIndex);
                        const newName = `${session.basePrefix}.MQ${mqString}.${suffixCode}`;

                        session.lastSuffixCode = suffixCode;

                        // After an even-suffix point the pair is complete — advance MQ.
                        if (isEvenSuffix) session.mqIndex++;

                        if (patternType === 'imes') {
                            const yxzIdx = line.indexOf('|YXZ|');
                            const pre = line.substring(0, yxzIdx);
                            const pipeIdx = pre.lastIndexOf('|');

                            const originalSegment = line.substring(pipeIdx + 1, yxzIdx);
                            const originalLen = originalSegment.length;
                            let newPaddingLen = originalLen - newName.length;
                            if (newPaddingLen < 0) newPaddingLen = 0;
                            const newSegment = ' '.repeat(newPaddingLen) + newName;
                            line = line.substring(0, pipeIdx + 1) + newSegment + line.substring(yxzIdx);
                        } else if (patternType === 'iroh') {
                            const pidStartIdx = line.indexOf('PID:');
                            if (pidStartIdx > -1) {
                                const pipeAfterPid = line.indexOf('|', pidStartIdx);
                                if (pipeAfterPid > -1) {
                                    const fieldContent = line.substring(pidStartIdx, pipeAfterPid);
                                    const fieldWidth = fieldContent.length;
                                    const label = 'PID:';
                                    const availableSpace = fieldWidth - label.length;

                                    let padding = availableSpace - newName.length;
                                    if (padding < 0) padding = 0;
                                    const newField = label + ' '.repeat(padding) + newName;
                                    line = line.substring(0, pidStartIdx) + newField + line.substring(pipeAfterPid);
                                }
                            }
                        } else if (patternType === 'lqp') {
                            const idIndex = line.indexOf(id);
                            if (idIndex > -1 && idIndex < 20) {
                                const idEndIndex = idIndex + id.length;
                                const dataPart = line.substring(idEndIndex);
                                const totalSpaceAvailable = idEndIndex;
                                const newNameLen = newName.length;
                                let newPaddingSize = totalSpaceAvailable - newNameLen;
                                let prefixSpace = '';
                                if (newPaddingSize > 0) {
                                    prefixSpace = ' '.repeat(newPaddingSize);
                                }
                                line = prefixSpace + newName + dataPart;
                            }
                        }

                        session.renamedCount++;
                        localRenameCount++;

                        if (reportLines) {
                            reportLines.push(`${fileName}|${id} -> ${newName}`);
                        }

                        if (session.renamedCount >= session.limit) {
                            session.active = false;
                            session.done = true;
                        }
                    }
                }
            }
        }

        newLines.push(line);
    }

    return {
        modified: localRenameCount > 0,
        count: localRenameCount,
        content: newLines.join('\n')
    };
}
