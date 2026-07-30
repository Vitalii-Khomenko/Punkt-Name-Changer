'use strict';

    const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
    const DEFAULT_DUPLICATE_TOLERANCE = 0.1;
    const COORDINATE_COMPARISON_EPSILON = 1e-9;
    const SAFE_NAME_COMPONENT_PATTERN = /^[A-Za-z0-9._-]+$/;
    const ASCII = new TextEncoder();
    const fileInput = document.getElementById('ipktFile');
    const analyzeButton = document.getElementById('analyzeButton');
    const applyPrefixButton = document.getElementById('applyPrefixButton');
    const clearButton = document.getElementById('clearButton');
    const renameButton = document.getElementById('renameButton');
    const statusElement = document.getElementById('status');
    const summaryCard = document.getElementById('summaryCard');
    const exportCard = document.getElementById('exportCard');
    const duplicatesCard = document.getElementById('duplicatesCard');
    const duplicateResults = document.getElementById('duplicateResults');
    const downloadDuplicatesButton = document.getElementById('downloadDuplicatesButton');
    const groupsBody = document.getElementById('groupsBody');
    const warningsElement = document.getElementById('warnings');
    const mqSchematic = document.getElementById('mqSchematic');

    let sourceFile = null;
    let sourceBytes = null;
    let discoveredGroups = [];
    let latestOutput = null;
    let latestDuplicateAnalysis = null;

    function setStatus(message, kind = '') {
        statusElement.textContent = message;
        statusElement.className = `status ${kind}`.trim();
    }

    function bytesToAscii(bytes) {
        let text = '';
        for (let index = 0; index < bytes.length; index += 1) {
            text += String.fromCharCode(bytes[index]);
        }
        return text;
    }

    function findSequence(bytes, sequence, start = 0, end = bytes.length) {
        outer: for (let index = start; index <= end - sequence.length; index += 1) {
            for (let offset = 0; offset < sequence.length; offset += 1) {
                if (bytes[index + offset] !== sequence[offset]) continue outer;
            }
            return index;
        }
        return -1;
    }

    function findLastByte(bytes, value, start, end) {
        for (let index = end - 1; index >= start; index -= 1) {
            if (bytes[index] === value) return index;
        }
        return -1;
    }

    function findByte(bytes, value, start, end) {
        for (let index = start; index < end; index += 1) {
            if (bytes[index] === value) return index;
        }
        return -1;
    }

    function trimAsciiField(bytes, start, end) {
        while (start < end && (bytes[start] === 32 || bytes[start] === 9)) start += 1;
        while (end > start && (bytes[end - 1] === 32 || bytes[end - 1] === 9 || bytes[end - 1] === 13)) end -= 1;
        return bytesToAscii(bytes.subarray(start, end));
    }

    function parseSourcePointId(pointId) {
        const match = String(pointId).match(/^(.*)\.(\d{1,3})$/);
        if (!match) return null;
        const sourceGroup = match[1];
        const sourceIndex = Number.parseInt(match[2], 10);
        if (!sourceGroup || !Number.isInteger(sourceIndex) || sourceIndex < 1 || sourceIndex > 998) return null;
        const explicitExMatch = sourceGroup.match(/^(.*)\.EX$/i);
        return {
            sourceGroup,
            sourceIndex,
            isExplicitEx: Boolean(explicitExMatch),
            exBaseGroup: explicitExMatch ? explicitExMatch[1] : null
        };
    }

    function parseIpktBytes(bytes) {
        const records = [];
        const duplicateRecords = [];
        const groupsByName = new Map();
        let skippedRecords = 0;
        let duplicateSkippedRecords = 0;
        const yxzMarker = ASCII.encode('|YXZ|');
        let lineStart = 0;
        let lineNumber = 1;

        while (lineStart < bytes.length) {
            let lineEnd = bytes.indexOf(10, lineStart);
            if (lineEnd === -1) lineEnd = bytes.length;
            const yxzIndex = findSequence(bytes, yxzMarker, lineStart, lineEnd);

            if (yxzIndex !== -1) {
                const pipeIndex = findLastByte(bytes, 124, lineStart, yxzIndex);
                const pointId = pipeIndex === -1 ? '' : trimAsciiField(bytes, pipeIndex + 1, yxzIndex);
                const lfnrEnd = findByte(bytes, 124, lineStart, yxzIndex);
                const lfnr = lfnrEnd === -1 ? '' : trimAsciiField(bytes, lineStart, lfnrEnd);
                const yEnd = findByte(bytes, 124, yxzIndex + yxzMarker.length, lineEnd);
                const xEnd = yEnd === -1 ? -1 : findByte(bytes, 124, yEnd + 1, lineEnd);
                const heightEnd = xEnd === -1 ? -1 : findByte(bytes, 124, xEnd + 1, lineEnd);
                const y = yEnd === -1 ? null : Number.parseFloat(trimAsciiField(bytes, yxzIndex + yxzMarker.length, yEnd));
                const x = xEnd === -1 ? null : Number.parseFloat(trimAsciiField(bytes, yEnd + 1, xEnd));
                const height = heightEnd === -1 ? null : Number.parseFloat(trimAsciiField(bytes, xEnd + 1, heightEnd));
                const finiteY = Number.isFinite(y) ? y : null;
                const finiteX = Number.isFinite(x) ? x : null;
                const finiteHeight = Number.isFinite(height) ? height : null;

                if (pointId && finiteY !== null && finiteX !== null) {
                    duplicateRecords.push({ pointId, lfnr, lineNumber, y: finiteY, x: finiteX, height: finiteHeight });
                } else {
                    duplicateSkippedRecords += 1;
                }

                const parsed = parseSourcePointId(pointId);
                if (!parsed) {
                    skippedRecords += 1;
                } else {
                    const record = {
                        ...parsed,
                        pointId,
                        lfnr,
                        lineNumber,
                        y: finiteY,
                        x: finiteX,
                        height: finiteHeight,
                        fieldStart: pipeIndex + 1,
                        fieldEnd: yxzIndex,
                        fieldWidth: yxzIndex - pipeIndex - 1,
                        heightStart: xEnd === -1 ? null : xEnd + 1,
                        heightEnd: heightEnd === -1 ? null : heightEnd
                    };
                    records.push(record);
                    if (!groupsByName.has(parsed.sourceGroup)) {
                        groupsByName.set(parsed.sourceGroup, {
                            sourceGroup: parsed.sourceGroup,
                            isExplicitEx: parsed.isExplicitEx,
                            exBaseGroup: parsed.exBaseGroup,
                            count: 0,
                            minIndex: parsed.sourceIndex,
                            maxIndex: parsed.sourceIndex,
                            records: []
                        });
                    }
                    const group = groupsByName.get(parsed.sourceGroup);
                    group.count += 1;
                    group.minIndex = Math.min(group.minIndex, parsed.sourceIndex);
                    group.maxIndex = Math.max(group.maxIndex, parsed.sourceIndex);
                    group.records.push(record);
                }
            }

            lineStart = lineEnd + 1;
            lineNumber += 1;
        }

        return { records, duplicateRecords, groups: Array.from(groupsByName.values()), skippedRecords, duplicateSkippedRecords };
    }

    function createDisjointSet(size) {
        const parent = Array.from({ length: size }, (_, index) => index);
        const rank = new Array(size).fill(0);

        function find(index) {
            let root = index;
            while (parent[root] !== root) root = parent[root];
            while (parent[index] !== index) {
                const next = parent[index];
                parent[index] = root;
                index = next;
            }
            return root;
        }

        function union(left, right) {
            let leftRoot = find(left);
            let rightRoot = find(right);
            if (leftRoot === rightRoot) return;
            if (rank[leftRoot] < rank[rightRoot]) [leftRoot, rightRoot] = [rightRoot, leftRoot];
            parent[rightRoot] = leftRoot;
            if (rank[leftRoot] === rank[rightRoot]) rank[leftRoot] += 1;
        }

        return { find, union };
    }

    function findDuplicateGroups(records, tolerance) {
        if (records.length < 2) return [];
        if (tolerance === 0) {
            const exactGroups = new Map();
            records.forEach((record) => {
                const key = `${record.y}|${record.x}`;
                if (!exactGroups.has(key)) exactGroups.set(key, []);
                exactGroups.get(key).push(record);
            });
            return Array.from(exactGroups.values()).filter((group) => group.length > 1);
        }

        const disjointSet = createDisjointSet(records.length);
        const buckets = new Map();
        records.forEach((record, recordIndex) => {
            const cellY = Math.floor(record.y / tolerance);
            const cellX = Math.floor(record.x / tolerance);
            for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
                for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
                    (buckets.get(`${cellY + offsetY}:${cellX + offsetX}`) || []).forEach((candidateIndex) => {
                        const candidate = records[candidateIndex];
                        if (
                            Math.abs(record.y - candidate.y) <= tolerance + COORDINATE_COMPARISON_EPSILON &&
                            Math.abs(record.x - candidate.x) <= tolerance + COORDINATE_COMPARISON_EPSILON
                        ) {
                            disjointSet.union(recordIndex, candidateIndex);
                        }
                    });
                }
            }
            const ownKey = `${cellY}:${cellX}`;
            if (!buckets.has(ownKey)) buckets.set(ownKey, []);
            buckets.get(ownKey).push(recordIndex);
        });

        const connectedGroups = new Map();
        records.forEach((record, index) => {
            const root = disjointSet.find(index);
            if (!connectedGroups.has(root)) connectedGroups.set(root, []);
            connectedGroups.get(root).push(record);
        });
        return Array.from(connectedGroups.values()).filter((group) => group.length > 1);
    }

    function calculateDuplicateGroupDeltas(group) {
        return {
            y: Math.max(...group.map((record) => record.y)) - Math.min(...group.map((record) => record.y)),
            x: Math.max(...group.map((record) => record.x)) - Math.min(...group.map((record) => record.x))
        };
    }

    function findMatchingPairs(group, tolerance) {
        const pairs = [];
        for (let leftIndex = 0; leftIndex < group.length - 1; leftIndex += 1) {
            for (let rightIndex = leftIndex + 1; rightIndex < group.length; rightIndex += 1) {
                const left = group[leftIndex];
                const right = group[rightIndex];
                const deltaY = Math.abs(left.y - right.y);
                const deltaX = Math.abs(left.x - right.x);
                if (
                    deltaY <= tolerance + COORDINATE_COMPARISON_EPSILON &&
                    deltaX <= tolerance + COORDINATE_COMPARISON_EPSILON
                ) {
                    pairs.push({ left, right, deltaY, deltaX });
                }
            }
        }
        return pairs;
    }

    function formatCoordinate(value) {
        return Number.isFinite(value) ? value.toFixed(5) : '-';
    }

    function formatReportDate(value) {
        return new Date(value).toLocaleString('en-GB', {
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit',
            hour12: false, timeZoneName: 'short'
        });
    }

    function getSafeDownloadBaseName(fileName) {
        const baseName = String(fileName).replace(/\.ipkt$/i, '').replace(/[^A-Za-z0-9._-]+/g, '_');
        return baseName || 'ipkt';
    }

    function renderDuplicateAnalysis(analysis) {
        const pointsInGroups = analysis.groups.reduce((sum, group) => sum + group.length, 0);
        document.getElementById('duplicatesSummary').textContent =
            `${analysis.groups.length} duplicate coordinate groups found across ${pointsInGroups} points using ${analysis.tolerance} m Y/X tolerance.`;
        duplicateResults.replaceChildren();
        duplicatesCard.classList.remove('hidden');
        downloadDuplicatesButton.disabled = false;

        if (analysis.groups.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'empty-state success';
            empty.textContent = 'No duplicate coordinates were found with the selected tolerance.';
            duplicateResults.appendChild(empty);
            return;
        }

        analysis.groups.forEach((group, groupIndex) => {
            const deltas = calculateDuplicateGroupDeltas(group);
            const wrapper = document.createElement('article');
            wrapper.className = 'duplicate-group';
            const header = document.createElement('div');
            header.className = 'duplicate-header';
            const title = document.createElement('span');
            title.textContent = `Group ${groupIndex + 1}: ${group.length} records`;
            const range = document.createElement('span');
            range.textContent = `Range: Y ${formatCoordinate(deltas.y)} m, X ${formatCoordinate(deltas.x)} m`;
            header.append(title, range);

            const tableWrap = document.createElement('div');
            tableWrap.className = 'table-wrap';
            const table = document.createElement('table');
            const headRow = document.createElement('tr');
            ['Point ID', 'LfNr', 'File line', 'Y', 'X', 'Height'].forEach((label) => {
                const cell = document.createElement('th');
                cell.textContent = label;
                headRow.appendChild(cell);
            });
            const head = document.createElement('thead');
            head.appendChild(headRow);
            const body = document.createElement('tbody');
            group.forEach((record) => {
                const row = document.createElement('tr');
                [record.pointId, record.lfnr || '-', String(record.lineNumber), formatCoordinate(record.y), formatCoordinate(record.x), formatCoordinate(record.height)]
                    .forEach((value) => {
                        const cell = document.createElement('td');
                        cell.textContent = value;
                        row.appendChild(cell);
                    });
                body.appendChild(row);
            });
            table.append(head, body);
            tableWrap.appendChild(table);
            wrapper.append(header, tableWrap);
            duplicateResults.appendChild(wrapper);
        });
    }

    function buildDuplicateReport(analysis) {
        const pointsInGroups = analysis.groups.reduce((sum, group) => sum + group.length, 0);
        const lines = [
            'IPKT Group Path Renamer Duplicate Coordinate Report',
            `Generated: ${formatReportDate(analysis.generatedAt)}`,
            `File: ${analysis.fileName}`,
            `Tolerance: ${analysis.tolerance} m per Y/X component`,
            `Valid YXZ records: ${analysis.records.length}`,
            `Skipped malformed YXZ records: ${analysis.skippedRecords}`,
            `Duplicate groups: ${analysis.groups.length}`,
            `Points in duplicate groups: ${pointsInGroups}`,
            ''
        ];
        if (analysis.groups.length === 0) {
            lines.push('No duplicate coordinates were found.');
            return lines.join('\r\n');
        }
        analysis.groups.forEach((group, groupIndex) => {
            const deltas = calculateDuplicateGroupDeltas(group);
            const matchingPairs = findMatchingPairs(group, analysis.tolerance);
            lines.push(`Group ${groupIndex + 1} (${group.length} records, ${matchingPairs.length} direct matches, Y range ${formatCoordinate(deltas.y)} m, X range ${formatCoordinate(deltas.x)} m)`);
            group.forEach((record) => {
                lines.push(`  ${record.pointId} | LfNr ${record.lfnr || '-'} | line ${record.lineNumber} | Y ${formatCoordinate(record.y)} | X ${formatCoordinate(record.x)} | H ${formatCoordinate(record.height)}`);
            });
            lines.push('  Direct matching pairs:');
            matchingPairs.forEach((pair) => {
                lines.push(`    ${pair.left.pointId} (line ${pair.left.lineNumber}) <-> ${pair.right.pointId} (line ${pair.right.lineNumber}) | delta Y ${formatCoordinate(pair.deltaY)} m | delta X ${formatCoordinate(pair.deltaX)} m`);
            });
            lines.push('');
        });
        return lines.join('\r\n');
    }

    function pad2(value) {
        return String(value).padStart(2, '0');
    }

    function pad3(value) {
        return String(value).padStart(3, '0');
    }

    function getTypeSize(type) {
        return type === 'Q' || type === 'QL' ? 4 : 2;
    }

    function getSuffix(type, sourceIndex) {
        if (type === 'Q') return ['3', '4', '1', '2'][(sourceIndex - 1) % 4];
        if (type === 'QL') return ['1', '3', '4', '2'][(sourceIndex - 1) % 4];
        if (type === 'P') return sourceIndex % 2 === 1 ? '1' : '2';
        return sourceIndex % 2 === 1 ? '3' : '4';
    }

    function isQuadroPrism(type, sourceIndex) {
        const position = (sourceIndex - 1) % 4;
        if (type === 'Q') return position >= 2;
        if (type === 'QL') return position === 0 || position === 3;
        return false;
    }

    function getMqIndex(type, sourceIndex, startSourceIndex, startMq) {
        const size = getTypeSize(type);
        return startMq + Math.floor((sourceIndex - 1) / size) - Math.floor((startSourceIndex - 1) / size);
    }

    function buildSections(group, config) {
        const size = getTypeSize(config.type);
        const sectionsByIndex = new Map();
        group.records.forEach((record) => {
            const sectionIndex = Math.floor((record.sourceIndex - 1) / size);
            if (!sectionsByIndex.has(sectionIndex)) sectionsByIndex.set(sectionIndex, []);
            sectionsByIndex.get(sectionIndex).push(record);
        });
        return Array.from(sectionsByIndex, ([sectionIndex, records]) => {
            const coordinateRecords = records.filter((record) => record.y !== null && record.x !== null);
            return {
                sectionIndex,
                records,
                y: coordinateRecords.length ? coordinateRecords.reduce((sum, record) => sum + record.y, 0) / coordinateRecords.length : null,
                x: coordinateRecords.length ? coordinateRecords.reduce((sum, record) => sum + record.x, 0) / coordinateRecords.length : null
            };
        }).sort((left, right) => left.sectionIndex - right.sectionIndex);
    }

    function getSectionDistance(left, right) {
        if (left.y === null || left.x === null || right.y === null || right.x === null) return null;
        return Math.hypot(right.y - left.y, right.x - left.x);
    }

    function getRecordDistance(left, right) {
        if (left.y === null || left.x === null || right.y === null || right.x === null) return null;
        return Math.hypot(right.y - left.y, right.x - left.x);
    }

    function buildExplicitExChunks(records, bridgeMinDistance) {
        const sortedRecords = [...records].sort((left, right) => left.sourceIndex - right.sourceIndex);
        const segments = [];
        let segmentStart = 0;
        for (let index = 1; index < sortedRecords.length; index += 1) {
            const distance = getRecordDistance(sortedRecords[index - 1], sortedRecords[index]);
            if (distance !== null && distance >= bridgeMinDistance) {
                segments.push({
                    records: sortedRecords.slice(segmentStart, index),
                    bridgeAfterDistance: distance
                });
                segmentStart = index;
            }
        }
        segments.push({ records: sortedRecords.slice(segmentStart), bridgeAfterDistance: null });

        const chunks = [];
        function appendChunk(sourceIndexes, segmentRecords, bridgeSide) {
            const indexSet = new Set(sourceIndexes);
            chunks.push({
                sourceIndexes,
                records: segmentRecords.filter((record) => indexSet.has(record.sourceIndex)),
                bridgeSide
            });
        }

        segments.forEach((segment, segmentIndex) => {
            const startsAfterBridge = segmentIndex > 0;
            const endsBeforeBridge = segment.bridgeAfterDistance !== null;
            const sourceIndexes = [];
            const firstSourceIndex = segment.records[0]?.sourceIndex;
            const lastSourceIndex = segment.records[segment.records.length - 1]?.sourceIndex;
            for (let sourceIndex = firstSourceIndex; sourceIndex <= lastSourceIndex; sourceIndex += 1) {
                sourceIndexes.push(sourceIndex);
            }
            let cursor = 0;
            let remaining = sourceIndexes.length;

            if (startsAfterBridge && remaining > 0) {
                const size = Math.min(2, remaining);
                appendChunk(sourceIndexes.slice(cursor, cursor + size), segment.records, 'after');
                cursor += size;
                remaining -= size;
            }

            const reservedBeforeBridge = endsBeforeBridge && remaining > 0 ? Math.min(2, remaining) : 0;
            const middleEnd = sourceIndexes.length - reservedBeforeBridge;
            while (cursor < middleEnd) {
                const size = Math.min(4, middleEnd - cursor);
                appendChunk(sourceIndexes.slice(cursor, cursor + size), segment.records, null);
                cursor += size;
            }
            if (reservedBeforeBridge > 0) {
                appendChunk(sourceIndexes.slice(cursor), segment.records, 'before');
            }
            if (endsBeforeBridge && chunks.length > 0) {
                chunks[chunks.length - 1].bridgeAfterDistance = segment.bridgeAfterDistance;
            }
        });
        return chunks;
    }

    function findExplicitExAnchor(group, configs) {
        const firstRecord = [...group.records].sort((left, right) => left.sourceIndex - right.sourceIndex)
            .find((record) => record.y !== null && record.x !== null);
        if (!firstRecord) return null;

        const candidates = [];
        discoveredGroups.forEach((candidateGroup) => {
            if (candidateGroup.isExplicitEx) return;
            const candidateConfig = configs.get(candidateGroup.sourceGroup);
            if (!candidateConfig || !['P', 'G'].includes(candidateConfig.type)) return;
            const plan = getCoordinateAwareMqPlan(candidateGroup, candidateConfig);
            buildSections(candidateGroup, candidateConfig).forEach((section) => {
                const mqIndex = plan.mqBySection.get(section.sectionIndex);
                if (!Number.isInteger(mqIndex) || section.y === null || section.x === null) return;
                candidates.push({
                    sourceGroup: candidateGroup.sourceGroup,
                    mqIndex,
                    distance: Math.hypot(firstRecord.y - section.y, firstRecord.x - section.x),
                    sameFamily: candidateGroup.sourceGroup === group.exBaseGroup
                });
            });
        });
        candidates.sort((left, right) => left.distance - right.distance || Number(right.sameFamily) - Number(left.sameFamily));
        return candidates[0] || null;
    }

    function getExplicitExPlan(group, config, configs) {
        const anchor = findExplicitExAnchor(group, configs);
        if (!anchor) return { error: `${group.sourceGroup}: no configured prism or rail MQ is available for coordinate anchoring.` };
        const chunks = buildExplicitExChunks(group.records, config.bridgeMinDistance);
        const mappingByRecord = new Map();
        const bridges = [];
        let mqIndex = anchor.mqIndex;

        chunks.forEach((chunk, chunkIndex) => {
            chunk.records.forEach((record) => {
                mappingByRecord.set(record, { mqIndex, position: chunk.sourceIndexes.indexOf(record.sourceIndex) + 1 });
            });
            if (chunk.bridgeAfterDistance !== undefined) {
                bridges.push({
                    afterSourceIndex: chunk.sourceIndexes[chunk.sourceIndexes.length - 1],
                    beforeSourceIndex: chunks[chunkIndex + 1]?.sourceIndexes[0] ?? null,
                    distance: chunk.bridgeAfterDistance,
                    reservedMqIndex: mqIndex + 1
                });
                mqIndex += 2;
            } else {
                mqIndex += 1;
            }
        });
        return { anchor, chunks, mappingByRecord, bridges };
    }

    function detectBridgeTransitions(sections, config) {
        const bridgeTransitionIndexes = new Set();
        const bridges = [];
        if (!config.coordinateGapCheck || !config.bridgeDetection || sections.length < 4) return { bridgeTransitionIndexes, bridges };

        const distances = sections.slice(1).map((section, index) => getSectionDistance(sections[index], section));
        let index = 0;
        while (index < distances.length) {
            if (distances[index] === null || distances[index] < config.bridgeMinDistance) {
                index += 1;
                continue;
            }

            const runStart = index;
            while (
                index + 1 < distances.length &&
                distances[index + 1] !== null &&
                distances[index + 1] >= config.bridgeMinDistance
            ) {
                index += 1;
            }
            const runEnd = index;
            const approachBefore = runStart > 0 ? distances[runStart - 1] : null;
            const approachAfter = runEnd + 1 < distances.length ? distances[runEnd + 1] : null;
            const isBridge = (
                approachBefore !== null &&
                approachAfter !== null &&
                approachBefore <= config.bridgeApproachMax &&
                approachAfter <= config.bridgeApproachMax
            );

            if (isBridge) {
                for (let transitionIndex = runStart; transitionIndex <= runEnd; transitionIndex += 1) {
                    bridgeTransitionIndexes.add(transitionIndex);
                }
                bridges.push({
                    fromSectionIndex: sections[runStart].sectionIndex,
                    toSectionIndex: sections[runEnd + 1].sectionIndex,
                    distances: distances.slice(runStart, runEnd + 1),
                    approachBefore,
                    approachAfter
                });
            }
            index += 1;
        }
        return { bridgeTransitionIndexes, bridges };
    }

    function getCoordinateAwareMqPlan(group, config) {
        const sections = buildSections(group, config);
        const startSectionIndex = Math.floor((config.startSourceIndex - 1) / getTypeSize(config.type));
        const mqBySection = new Map([[startSectionIndex, config.startMq]]);
        const gaps = [];
        const bridgePlan = detectBridgeTransitions(sections, config);

        for (let index = 1; index < sections.length; index += 1) {
            const left = sections[index - 1];
            const right = sections[index];
            const sourceAdvance = right.sectionIndex - left.sectionIndex;
            const distance = getSectionDistance(left, right);
            const coordinateAdvance = config.coordinateGapCheck && distance !== null && !bridgePlan.bridgeTransitionIndexes.has(index - 1)
                ? Math.max(1, Math.round(distance / config.normalStep))
                : 1;
            const mqAdvance = Math.max(sourceAdvance, coordinateAdvance);
            if (mqAdvance > sourceAdvance) {
                gaps.push({
                    fromSectionIndex: left.sectionIndex,
                    toSectionIndex: right.sectionIndex,
                    distance,
                    sourceAdvance,
                    mqAdvance,
                    skippedMqCount: mqAdvance - sourceAdvance
                });
            }
        }

        const anchorPosition = sections.findIndex((section) => section.sectionIndex >= startSectionIndex);
        if (anchorPosition === -1) return { mqBySection, gaps, bridges: bridgePlan.bridges };
        mqBySection.set(sections[anchorPosition].sectionIndex, config.startMq + sections[anchorPosition].sectionIndex - startSectionIndex);

        for (let index = anchorPosition + 1; index < sections.length; index += 1) {
            const left = sections[index - 1];
            const right = sections[index];
            const sourceAdvance = right.sectionIndex - left.sectionIndex;
            const distance = getSectionDistance(left, right);
            const coordinateAdvance = config.coordinateGapCheck && distance !== null && !bridgePlan.bridgeTransitionIndexes.has(index - 1)
                ? Math.max(1, Math.round(distance / config.normalStep))
                : 1;
            mqBySection.set(right.sectionIndex, mqBySection.get(left.sectionIndex) + Math.max(sourceAdvance, coordinateAdvance));
        }
        for (let index = anchorPosition - 1; index >= 0; index -= 1) {
            const left = sections[index];
            const right = sections[index + 1];
            const sourceAdvance = right.sectionIndex - left.sectionIndex;
            const distance = getSectionDistance(left, right);
            const coordinateAdvance = config.coordinateGapCheck && distance !== null && !bridgePlan.bridgeTransitionIndexes.has(index)
                ? Math.max(1, Math.round(distance / config.normalStep))
                : 1;
            mqBySection.set(left.sectionIndex, mqBySection.get(right.sectionIndex) - Math.max(sourceAdvance, coordinateAdvance));
        }
        return { mqBySection, gaps, bridges: bridgePlan.bridges };
    }

    function getPlannedMqIndex(config, sourceIndex) {
        const sectionIndex = Math.floor((sourceIndex - 1) / getTypeSize(config.type));
        return config.mqBySection?.get(sectionIndex) ?? getMqIndex(config.type, sourceIndex, config.startSourceIndex, config.startMq);
    }

    function buildFinalName(config, sourceIndex) {
        const mqIndex = getPlannedMqIndex(config, sourceIndex);
        return `${config.basePrefix}.MQ${pad2(mqIndex)}.${getSuffix(config.type, sourceIndex)}`;
    }

    function buildNormalizedName(config, sourceIndex) {
        return `${config.type}${pad2(config.pathNumber)}.${pad3(sourceIndex)}`;
    }

    function buildExplicitExName(group, config, record) {
        const mapping = config.exPlan?.mappingByRecord.get(record);
        if (!mapping) throw new Error(`Line ${record.lineNumber}: automatic EX mapping is unavailable.`);
        return `${config.basePrefix}.MQ${mapping.mqIndex}-${mapping.position}`;
    }

    function createCell(row, content) {
        const cell = document.createElement('td');
        if (content instanceof Node) cell.appendChild(content);
        else cell.textContent = content;
        row.appendChild(cell);
        return cell;
    }

    function createInput(type, role, value, className = '') {
        const input = document.createElement('input');
        input.type = type;
        input.dataset.role = role;
        input.value = value;
        input.className = className;
        return input;
    }

    function updateRowPreview(row) {
        const group = discoveredGroups[Number.parseInt(row.dataset.groupIndex, 10)];
        const config = getRowConfig(row);
        const preview = row.querySelector('[data-role="preview"]');
        if (!config || !group) {
            preview.textContent = 'Complete configuration';
            return;
        }
        if (group.isExplicitEx) {
            preview.classList.add('automatic-ex');
            preview.textContent = `${config.basePrefix || group.exBaseGroup}.MQ... (automatic anchor)`;
            return;
        }
        preview.classList.remove('automatic-ex');
        const firstIndex = group.minIndex;
        preview.textContent = `${buildNormalizedName(config, firstIndex)} -> ${buildFinalName(config, firstIndex)}`;
    }

    function renderMqSchematic() {
        mqSchematic.replaceChildren();
        let renderedGroups = 0;
        const previewConfigs = new Map();

        Array.from(groupsBody.querySelectorAll('tr')).forEach((row) => {
            if (!row.querySelector('[data-role="enabled"]').checked) return;
            const group = discoveredGroups[Number.parseInt(row.dataset.groupIndex, 10)];
            const config = getRowConfig(row, !group?.isExplicitEx);
            if (group && config) previewConfigs.set(group.sourceGroup, config);
        });

        Array.from(groupsBody.querySelectorAll('tr')).forEach((row) => {
            if (!row.querySelector('[data-role="enabled"]').checked) return;
            const group = discoveredGroups[Number.parseInt(row.dataset.groupIndex, 10)];
            const config = previewConfigs.get(group?.sourceGroup);
            if (
                !group || !config || config.startMq < 1 || config.startSourceIndex < 1 ||
                config.normalStep <= 0 || config.bridgeMinDistance <= 0 || config.bridgeApproachMax <= 0
            ) return;

            const measuredMqs = new Set();
            const bridgeMqs = new Set();
            let schematicNodes = null;
            let bridgeCount = 0;
            let displayName = `${group.sourceGroup} -> ${config.type}${pad2(config.pathNumber)}`;
            let summaryText = '';

            if (group.isExplicitEx) {
                const exPlan = getExplicitExPlan(group, config, previewConfigs);
                if (exPlan.error || !config.basePrefix) return;
                exPlan.mappingByRecord.forEach((mapping) => measuredMqs.add(mapping.mqIndex));
                exPlan.bridges.forEach((bridge) => bridgeMqs.add(bridge.reservedMqIndex));
                bridgeCount = exPlan.bridges.length;
                displayName = `${group.sourceGroup} -> ${config.basePrefix}.MQ...`;
                const measuredSourceIndexes = new Set(group.records.map((record) => record.sourceIndex));
                schematicNodes = [];
                let mqIndex = exPlan.anchor.mqIndex;
                exPlan.chunks.forEach((chunk) => {
                    chunk.sourceIndexes.forEach((sourceIndex, positionIndex) => {
                        const position = positionIndex + 1;
                        const measured = measuredSourceIndexes.has(sourceIndex);
                        schematicNodes.push({
                            label: `MQ${pad2(mqIndex)}-${position}`,
                            title: measured
                                ? `${config.basePrefix}.MQ${mqIndex}-${position}: proposed EX point for EX.${pad2(sourceIndex)}`
                                : `${config.basePrefix}.MQ${mqIndex}-${position}: missing EX.${pad2(sourceIndex)} position`,
                            missing: !measured,
                            bridge: false
                        });
                    });
                    if (chunk.bridgeAfterDistance !== undefined) {
                        schematicNodes.push({
                            label: `MQ${pad2(mqIndex + 1)}`,
                            title: `MQ${pad2(mqIndex + 1)}: reserved bridge MQ`,
                            missing: true,
                            bridge: true
                        });
                        mqIndex += 2;
                    } else {
                        mqIndex += 1;
                    }
                });
                const measuredPositionCount = schematicNodes.filter((node) => !node.missing).length;
                const missingPositionCount = schematicNodes.filter((node) => node.missing && !node.bridge).length;
                summaryText = `positions ${measuredPositionCount} | missing ${missingPositionCount} | bridges ${bridgeCount}`;
            } else {
                const plan = getCoordinateAwareMqPlan(group, config);
                config.mqBySection = plan.mqBySection;
                const sections = buildSections(group, config);
                sections.forEach((section) => {
                    const mqIndex = plan.mqBySection.get(section.sectionIndex);
                    if (Number.isInteger(mqIndex)) measuredMqs.add(mqIndex);
                });
                plan.bridges.forEach((bridge) => {
                    sections.forEach((section) => {
                        if (section.sectionIndex < bridge.fromSectionIndex || section.sectionIndex > bridge.toSectionIndex) return;
                        const mqIndex = plan.mqBySection.get(section.sectionIndex);
                        if (Number.isInteger(mqIndex)) bridgeMqs.add(mqIndex);
                    });
                });
                bridgeCount = plan.bridges.length;
            }
            if (measuredMqs.size === 0) return;

            const minimumMq = Math.min(...measuredMqs);
            const maximumMq = Math.max(...measuredMqs);
            const missingCount = maximumMq - minimumMq + 1 - measuredMqs.size;
            if (!summaryText) {
                summaryText = `MQ${pad2(minimumMq)}..MQ${pad2(maximumMq)} | measured ${measuredMqs.size} | missing ${missingCount} | bridges ${bridgeCount}`;
            }
            const wrapper = document.createElement('article');
            wrapper.className = 'schematic-group';

            const title = document.createElement('div');
            title.className = 'schematic-title';
            const name = document.createElement('span');
            name.textContent = displayName;
            const summary = document.createElement('span');
            summary.textContent = summaryText;
            title.append(name, summary);

            const lineWrap = document.createElement('div');
            lineWrap.className = 'mq-line-wrap';
            const line = document.createElement('div');
            line.className = 'mq-line';
            if (!schematicNodes) {
                schematicNodes = [];
                for (let mqIndex = minimumMq; mqIndex <= maximumMq; mqIndex += 1) {
                    schematicNodes.push({
                        label: `MQ${pad2(mqIndex)}`,
                        title: bridgeMqs.has(mqIndex)
                            ? `MQ${pad2(mqIndex)}: ${measuredMqs.has(mqIndex) ? 'measured bridge section' : 'reserved bridge MQ'}`
                            : measuredMqs.has(mqIndex)
                                ? `MQ${pad2(mqIndex)}: measured section`
                                : `MQ${pad2(mqIndex)}: inferred missing section`,
                        missing: !measuredMqs.has(mqIndex),
                        bridge: bridgeMqs.has(mqIndex)
                    });
                }
            }
            schematicNodes.forEach((schematicNode) => {
                const node = document.createElement('span');
                node.className = 'mq-node';
                if (schematicNode.missing) node.classList.add('missing');
                if (schematicNode.bridge) node.classList.add('bridge');
                node.title = schematicNode.title;
                const label = document.createElement('span');
                label.className = 'mq-node-label';
                label.textContent = schematicNode.label;
                node.appendChild(label);
                line.appendChild(node);
            });
            lineWrap.appendChild(line);
            wrapper.append(title, lineWrap);
            mqSchematic.appendChild(wrapper);
            renderedGroups += 1;
        });

        if (renderedGroups === 0) {
            const empty = document.createElement('p');
            empty.className = 'help';
            empty.textContent = 'Enable and complete a group configuration to display its MQ line.';
            mqSchematic.appendChild(empty);
        }
    }

    function renderGroups() {
        groupsBody.replaceChildren();
        discoveredGroups.forEach((group, groupIndex) => {
            const row = document.createElement('tr');
            row.dataset.groupIndex = String(groupIndex);

            const enabled = createInput('checkbox', 'enabled', '');
            enabled.checked = true;
            createCell(row, enabled);

            const source = document.createElement('span');
            source.className = 'source';
            source.textContent = group.sourceGroup;
            createCell(row, source);
            createCell(row, `${group.count} (${group.minIndex}..${group.maxIndex})`);

            const type = document.createElement('select');
            type.dataset.role = 'type';
            ['G', 'P', 'Q', 'QL'].forEach((value) => {
                const option = document.createElement('option');
                option.value = value;
                option.textContent = value;
                type.appendChild(option);
            });
            createCell(row, type);

            const pathNumber = createInput('number', 'pathNumber', String((groupIndex % 10) + 1));
            pathNumber.min = '1';
            pathNumber.max = '10';
            createCell(row, pathNumber);

            const defaultPrefix = document.getElementById('defaultBasePrefix').value.trim();
            const basePrefix = createInput('text', 'basePrefix', group.isExplicitEx ? (defaultPrefix || group.exBaseGroup) : defaultPrefix, 'base-prefix');
            basePrefix.placeholder = 'e.g. 3560';
            createCell(row, basePrefix);

            const startMq = createInput('number', 'startMq', '1');
            startMq.min = '1';
            const startMqCell = createCell(row, startMq);

            const startSourceIndex = createInput('hidden', 'startSourceIndex', String(group.minIndex));
            startMqCell.appendChild(startSourceIndex);

            const coordinateGapCheck = createInput('checkbox', 'coordinateGapCheck', '');
            coordinateGapCheck.checked = true;
            createCell(row, coordinateGapCheck);

            const normalStep = createInput('number', 'normalStep', '3');
            normalStep.min = '0.1';
            normalStep.step = '0.1';
            createCell(row, normalStep);

            const bridgeDetection = createInput('checkbox', 'bridgeDetection', '');
            bridgeDetection.checked = false;
            createCell(row, bridgeDetection);

            const bridgeMinDistance = createInput('number', 'bridgeMinDistance', '9');
            bridgeMinDistance.min = '0.1';
            bridgeMinDistance.step = '0.1';
            createCell(row, bridgeMinDistance);

            const bridgeApproachMax = createInput('number', 'bridgeApproachMax', '2.5');
            bridgeApproachMax.min = '0.1';
            bridgeApproachMax.step = '0.1';
            createCell(row, bridgeApproachMax);

            const preview = document.createElement('span');
            preview.dataset.role = 'preview';
            preview.className = 'preview';
            createCell(row, preview);

            if (group.isExplicitEx) {
                basePrefix.title = 'Editable output prefix for the automatic EX MQ names.';
                type.disabled = true;
                pathNumber.disabled = true;
                startMq.disabled = true;
                startSourceIndex.disabled = true;
                coordinateGapCheck.disabled = true;
                normalStep.disabled = true;
                bridgeDetection.checked = true;
                bridgeDetection.disabled = true;
                bridgeApproachMax.disabled = true;
                bridgeMinDistance.title = 'Large coordinate gaps at or above this distance split automatic EX bridge sections.';
            }

            row.addEventListener('input', () => {
                updateRowPreview(row);
                renderMqSchematic();
            });
            row.addEventListener('change', () => {
                updateRowPreview(row);
                renderMqSchematic();
            });
            groupsBody.appendChild(row);
            updateRowPreview(row);
        });
        renderMqSchematic();
    }

    function getRowConfig(row, requireBasePrefix = true) {
        const type = row.querySelector('[data-role="type"]').value;
        const pathNumber = Number.parseInt(row.querySelector('[data-role="pathNumber"]').value, 10);
        const basePrefix = row.querySelector('[data-role="basePrefix"]').value.trim();
        const startMq = Number.parseInt(row.querySelector('[data-role="startMq"]').value, 10);
        const startSourceIndex = Number.parseInt(row.querySelector('[data-role="startSourceIndex"]').value, 10);
        const coordinateGapCheck = row.querySelector('[data-role="coordinateGapCheck"]').checked;
        const normalStep = Number.parseFloat(row.querySelector('[data-role="normalStep"]').value);
        const bridgeDetection = row.querySelector('[data-role="bridgeDetection"]').checked;
        const bridgeMinDistance = Number.parseFloat(row.querySelector('[data-role="bridgeMinDistance"]').value);
        const bridgeApproachMax = Number.parseFloat(row.querySelector('[data-role="bridgeApproachMax"]').value);
        if (
            !type || !Number.isInteger(pathNumber) || (requireBasePrefix && !basePrefix) || !Number.isInteger(startMq) ||
            !Number.isInteger(startSourceIndex) || !Number.isFinite(normalStep) ||
            !Number.isFinite(bridgeMinDistance) || !Number.isFinite(bridgeApproachMax)
        ) return null;
        return {
            type, pathNumber, basePrefix, startMq, startSourceIndex, coordinateGapCheck, normalStep,
            bridgeDetection, bridgeMinDistance, bridgeApproachMax
        };
    }

    function collectConfigs() {
        const configs = new Map();
        const targetPaths = new Map();
        const errors = [];
        Array.from(groupsBody.querySelectorAll('tr')).forEach((row) => {
            if (!row.querySelector('[data-role="enabled"]').checked) return;
            const group = discoveredGroups[Number.parseInt(row.dataset.groupIndex, 10)];
            const config = getRowConfig(row, !group.isExplicitEx);
            if (!config) {
                errors.push(`${group.sourceGroup}: complete every configuration field.`);
                return;
            }
            if (group.isExplicitEx) {
                if (!config.basePrefix) {
                    errors.push(`${group.sourceGroup}: final base prefix is required.`);
                } else if (!SAFE_NAME_COMPONENT_PATTERN.test(config.basePrefix)) {
                    errors.push(`${group.sourceGroup}: final base prefix contains invalid characters.`);
                }
                if (config.bridgeMinDistance <= 0) {
                    errors.push(`${group.sourceGroup}: bridge minimum distance must be greater than 0 m.`);
                }
                configs.set(group.sourceGroup, config);
                return;
            }
            if (!SAFE_NAME_COMPONENT_PATTERN.test(config.basePrefix)) {
                errors.push(`${group.sourceGroup}: final base prefix contains invalid characters.`);
            }
            if (config.pathNumber < 1 || config.pathNumber > 10) {
                errors.push(`${group.sourceGroup}: path number must be from 1 to 10.`);
            }
            if (config.startMq < 1) {
                errors.push(`${group.sourceGroup}: start MQ must be at least 1.`);
            }
            if (config.startSourceIndex < 1 || config.startSourceIndex > 998) {
                errors.push(`${group.sourceGroup}: start source index must be from 1 to 998.`);
            }
            if (config.normalStep <= 0) {
                errors.push(`${group.sourceGroup}: normal coordinate step must be greater than 0 m.`);
            }
            if (config.bridgeMinDistance <= 0 || config.bridgeApproachMax <= 0) {
                errors.push(`${group.sourceGroup}: bridge distances must be greater than 0 m.`);
            }
            if (config.bridgeApproachMax >= config.bridgeMinDistance) {
                errors.push(`${group.sourceGroup}: bridge approach maximum must be less than bridge minimum distance.`);
            }
            const startSectionIndex = Math.floor((config.startSourceIndex - 1) / getTypeSize(config.type));
            if (!group.records.some((record) => Math.floor((record.sourceIndex - 1) / getTypeSize(config.type)) === startSectionIndex)) {
                errors.push(`${group.sourceGroup}: start source index must belong to a measured section.`);
            }
            const targetPath = `${config.type}${pad2(config.pathNumber)}`;
            if (targetPaths.has(targetPath)) {
                errors.push(`${group.sourceGroup}: target path ${targetPath} is already assigned to ${targetPaths.get(targetPath)}.`);
            } else {
                targetPaths.set(targetPath, group.sourceGroup);
            }
            const plan = getCoordinateAwareMqPlan(group, config);
            config.mqBySection = plan.mqBySection;
            config.coordinateGaps = plan.gaps;
            config.detectedBridges = plan.bridges;
            const minimumMq = Math.min(...config.mqBySection.values());
            if (minimumMq < 1) {
                errors.push(`${group.sourceGroup}: configuration maps some records below MQ01.`);
            }
            configs.set(group.sourceGroup, config);
        });
        configs.forEach((config, sourceGroup) => {
            const group = discoveredGroups.find((candidate) => candidate.sourceGroup === sourceGroup);
            if (!group?.isExplicitEx) return;
            const exPlan = getExplicitExPlan(group, config, configs);
            if (exPlan.error) {
                errors.push(exPlan.error);
                return;
            }
            config.exPlan = exPlan;
            config.detectedBridges = exPlan.bridges;
            config.coordinateGaps = [];
        });
        if (configs.size === 0) errors.push('Enable and configure at least one source group.');
        return { configs, errors };
    }

    function replaceFields(bytes, replacements) {
        const output = bytes.slice();
        replacements.forEach(({ record, newName }) => {
            const encodedName = ASCII.encode(newName);
            if (encodedName.length > record.fieldWidth) {
                throw new Error(`Line ${record.lineNumber}: ${newName} does not fit the ${record.fieldWidth}-character point field.`);
            }
            output.fill(32, record.fieldStart, record.fieldEnd);
            output.set(encodedName, record.fieldEnd - encodedName.length);
        });
        return output;
    }

    function applyQuadroHeightOffsets(bytes, replacements) {
        const output = bytes.slice();
        replacements.forEach(({ record, config }) => {
            if (!isQuadroPrism(config.type, record.sourceIndex) || record.heightStart === null || record.heightEnd === null) return;
            const raw = bytesToAscii(output.subarray(record.heightStart, record.heightEnd));
            const numericText = raw.trim();
            const height = Number.parseFloat(numericText);
            if (!Number.isFinite(height)) return;
            const decimals = numericText.includes('.') ? Math.max(numericText.split('.')[1].length, 2) : 2;
            const updated = (height - 0.04).toFixed(decimals);
            const width = record.heightEnd - record.heightStart;
            if (updated.length > width) {
                throw new Error(`Line ${record.lineNumber}: adjusted height ${updated} does not fit its fixed-width field.`);
            }
            output.fill(32, record.heightStart, record.heightEnd);
            output.set(ASCII.encode(updated), record.heightEnd - updated.length);
        });
        return output;
    }

    function buildReport(configs, replacements) {
        const lines = [
            'IPKT Group Path Renamer Report',
            `Generated: ${formatReportDate(new Date().toISOString())}`,
            `File: ${sourceFile.name}`,
            `Renamed records: ${replacements.length}`,
            ''
        ];
        configs.forEach((config, sourceGroup) => {
            const group = discoveredGroups.find((candidate) => candidate.sourceGroup === sourceGroup);
            if (group?.isExplicitEx) {
                lines.push(
                    `${sourceGroup} -> automatic EX mapping | coordinate anchor ${config.exPlan.anchor.sourceGroup} MQ${config.exPlan.anchor.mqIndex} | anchor distance ${config.exPlan.anchor.distance.toFixed(3)} m | four positions normally, two positions beside bridges`
                );
                lines.push(`  EX output prefix: ${config.basePrefix}`);
                lines.push(`  Detected EX bridges: ${config.exPlan.bridges.length}`);
                config.exPlan.bridges.forEach((bridge, bridgeIndex) => {
                    lines.push(
                        `  EX bridge ${bridgeIndex + 1}: after EX.${pad2(bridge.afterSourceIndex)} before EX.${pad2(bridge.beforeSourceIndex)} | distance ${bridge.distance.toFixed(3)} m | reserved MQ${pad2(bridge.reservedMqIndex)}`
                    );
                });
                return;
            }
            lines.push(
                `${sourceGroup} -> ${config.type}${pad2(config.pathNumber)} | final prefix ${config.basePrefix} | start MQ ${config.startMq} | start source index ${config.startSourceIndex} | coordinate gap check ${config.coordinateGapCheck ? `on (${config.normalStep} m step)` : 'off'}`
            );
            lines.push(
                `  Bridge detection: ${config.bridgeDetection ? `on (span >= ${config.bridgeMinDistance} m, approaches <= ${config.bridgeApproachMax} m)` : 'off'}`
            );
            lines.push(`  Detected separate bridges: ${(config.detectedBridges || []).length}`);
            (config.detectedBridges || []).forEach((bridge, bridgeIndex) => {
                lines.push(
                    `  Bridge ${bridgeIndex + 1} detected: section ${bridge.fromSectionIndex + 1} -> ${bridge.toSectionIndex + 1} | spans ${bridge.distances.map((distance) => distance.toFixed(3)).join(', ')} m | approaches ${bridge.approachBefore.toFixed(3)} / ${bridge.approachAfter.toFixed(3)} m | coordinate MQ skipping suppressed`
                );
            });
            (config.coordinateGaps || []).forEach((gap) => {
                lines.push(
                    `  Coordinate gap: section ${gap.fromSectionIndex + 1} -> ${gap.toSectionIndex + 1} | distance ${gap.distance.toFixed(3)} m | MQ advance ${gap.mqAdvance} | additional skipped MQs ${gap.skippedMqCount}`
                );
            });
        });
        lines.push('', 'Renames:');
        replacements.forEach(({ record, config, newName }) => {
            const group = discoveredGroups.find((candidate) => candidate.sourceGroup === record.sourceGroup);
            const normalizedName = group?.isExplicitEx ? newName : buildNormalizedName(config, record.sourceIndex);
            lines.push(`Line ${record.lineNumber}: ${record.pointId} -> ${normalizedName} -> ${newName}`);
        });
        return lines.join('\r\n');
    }

    async function discoverGroups() {
        const file = fileInput.files[0];
        const duplicateTolerance = Number.parseFloat(document.getElementById('coordinateTolerance').value);
        if (!file) return setStatus('Select an IPKT file first.', 'error');
        if (!file.name.toLowerCase().endsWith('.ipkt')) return setStatus('Only .ipkt files are supported.', 'error');
        if (file.size > MAX_FILE_SIZE_BYTES) return setStatus('The selected file is larger than the 10 MB limit.', 'error');
        if (!Number.isFinite(duplicateTolerance) || duplicateTolerance < 0 || duplicateTolerance > 1) {
            return setStatus('Duplicate tolerance must be a number from 0 to 1 meter.', 'error');
        }

        analyzeButton.disabled = true;
        downloadDuplicatesButton.disabled = true;
        setStatus('Reading the file, discovering groups, and checking duplicate coordinates...');
        try {
            sourceFile = file;
            sourceBytes = new Uint8Array(await file.arrayBuffer());
            const parsed = parseIpktBytes(sourceBytes);
            discoveredGroups = parsed.groups;
            latestOutput = null;
            exportCard.classList.add('hidden');
            const duplicateGroups = findDuplicateGroups(parsed.duplicateRecords, duplicateTolerance);
            duplicateGroups.sort((left, right) => left[0].lineNumber - right[0].lineNumber);
            latestDuplicateAnalysis = {
                fileName: file.name,
                generatedAt: new Date().toISOString(),
                tolerance: duplicateTolerance,
                records: parsed.duplicateRecords,
                skippedRecords: parsed.duplicateSkippedRecords,
                groups: duplicateGroups
            };
            renderDuplicateAnalysis(latestDuplicateAnalysis);

            if (discoveredGroups.length === 0) {
                summaryCard.classList.add('hidden');
                applyPrefixButton.disabled = true;
                return setStatus(`No point IDs ending in a numeric index were found. Duplicate check completed with ${duplicateGroups.length} groups.`, 'error');
            }

            document.getElementById('summaryFile').textContent = file.name;
            document.getElementById('summaryRecords').textContent = parsed.records.length.toLocaleString();
            document.getElementById('summaryGroups').textContent = parsed.groups.length.toLocaleString();
            document.getElementById('summarySkipped').textContent = parsed.skippedRecords.toLocaleString();
            summaryCard.classList.remove('hidden');
            applyPrefixButton.disabled = false;
            renderGroups();
            setStatus(`Discovered ${parsed.groups.length} source groups across ${parsed.records.length} numeric point records. Duplicate check found ${duplicateGroups.length} groups.`, 'success');
        } catch (error) {
            latestDuplicateAnalysis = null;
            duplicatesCard.classList.add('hidden');
            downloadDuplicatesButton.disabled = true;
            setStatus(`Could not analyze the file: ${error.message}`, 'error');
        } finally {
            analyzeButton.disabled = false;
        }
    }

    function buildRenamedFile() {
        warningsElement.replaceChildren();
        const { configs, errors } = collectConfigs();
        if (errors.length > 0) {
            errors.forEach((message) => {
                const item = document.createElement('li');
                item.textContent = message;
                warningsElement.appendChild(item);
            });
            exportCard.classList.add('hidden');
            return;
        }

        try {
            const replacements = [];
            const normalizedReplacements = [];
            discoveredGroups.forEach((group) => {
                const config = configs.get(group.sourceGroup);
                if (!config) return;
                group.records.forEach((record) => {
                    if (group.isExplicitEx) {
                        const newName = buildExplicitExName(group, config, record);
                        replacements.push({ record, config, newName });
                        normalizedReplacements.push({ record, newName });
                        return;
                    }
                    replacements.push({ record, config, newName: buildFinalName(config, record.sourceIndex) });
                    normalizedReplacements.push({ record, newName: buildNormalizedName(config, record.sourceIndex) });
                });
            });
            const renamedBytes = replaceFields(sourceBytes, replacements);
            latestOutput = {
                bytes: applyQuadroHeightOffsets(renamedBytes, replacements),
                normalizedBytes: replaceFields(sourceBytes, normalizedReplacements),
                report: buildReport(configs, replacements),
                renamedCount: replacements.length,
                coordinateSkippedMqCount: Array.from(configs.values()).reduce(
                    (sum, config) => sum + (config.coordinateGaps || []).reduce((gapSum, gap) => gapSum + gap.skippedMqCount, 0),
                    0
                ),
                detectedBridgeCount: Array.from(configs.values()).reduce(
                    (sum, config) => sum + (config.detectedBridges || []).length,
                    0
                ),
            };
            document.getElementById('exportSummary').textContent = `Ready: ${replacements.length} point IDs mapped across ${configs.size} configured groups. Coordinate checks preserved ${latestOutput.coordinateSkippedMqCount} additional skipped MQ positions and recognized ${latestOutput.detectedBridgeCount} bridge spans.`;
            exportCard.classList.remove('hidden');
            exportCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } catch (error) {
            const item = document.createElement('li');
            item.textContent = error.message;
            warningsElement.appendChild(item);
            exportCard.classList.add('hidden');
        }
    }

    function downloadBlob(blob, fileName) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    }

    function clearAll() {
        fileInput.value = '';
        sourceFile = null;
        sourceBytes = null;
        discoveredGroups = [];
        latestOutput = null;
        latestDuplicateAnalysis = null;
        groupsBody.replaceChildren();
        mqSchematic.replaceChildren();
        duplicateResults.replaceChildren();
        warningsElement.replaceChildren();
        summaryCard.classList.add('hidden');
        duplicatesCard.classList.add('hidden');
        exportCard.classList.add('hidden');
        applyPrefixButton.disabled = true;
        downloadDuplicatesButton.disabled = true;
        document.getElementById('coordinateTolerance').value = String(DEFAULT_DUPLICATE_TOLERANCE);
        setStatus('Select an IPKT file to begin.');
    }

    analyzeButton.addEventListener('click', discoverGroups);
    applyPrefixButton.addEventListener('click', () => {
        const value = document.getElementById('defaultBasePrefix').value.trim();
        groupsBody.querySelectorAll('[data-role="basePrefix"]').forEach((input) => {
            input.value = value;
            updateRowPreview(input.closest('tr'));
        });
        renderMqSchematic();
    });
    clearButton.addEventListener('click', clearAll);
    fileInput.addEventListener('change', () => {
        sourceFile = null;
        sourceBytes = null;
        discoveredGroups = [];
        latestOutput = null;
        latestDuplicateAnalysis = null;
        groupsBody.replaceChildren();
        mqSchematic.replaceChildren();
        duplicateResults.replaceChildren();
        warningsElement.replaceChildren();
        summaryCard.classList.add('hidden');
        duplicatesCard.classList.add('hidden');
        exportCard.classList.add('hidden');
        applyPrefixButton.disabled = true;
        downloadDuplicatesButton.disabled = true;
        if (fileInput.files[0]) setStatus(`Ready to analyze ${fileInput.files[0].name}.`);
    });
    renameButton.addEventListener('click', buildRenamedFile);
    document.getElementById('downloadNormalizedButton').addEventListener('click', () => {
        if (!latestOutput || !sourceFile) return;
        const name = `${getSafeDownloadBaseName(sourceFile.name)}_normalized.ipkt`;
        downloadBlob(new Blob([latestOutput.normalizedBytes], { type: 'application/octet-stream' }), name);
    });
    document.getElementById('downloadIpktButton').addEventListener('click', () => {
        if (!latestOutput || !sourceFile) return;
        const name = `${getSafeDownloadBaseName(sourceFile.name)}_renamed.ipkt`;
        downloadBlob(new Blob([latestOutput.bytes], { type: 'application/octet-stream' }), name);
    });
    document.getElementById('downloadReportButton').addEventListener('click', () => {
        if (!latestOutput || !sourceFile) return;
        const name = `${getSafeDownloadBaseName(sourceFile.name)}_rename_report.txt`;
        downloadBlob(new Blob([latestOutput.report], { type: 'text/plain;charset=utf-8' }), name);
    });
    downloadDuplicatesButton.addEventListener('click', () => {
        if (!latestDuplicateAnalysis) return;
        const name = `${getSafeDownloadBaseName(latestDuplicateAnalysis.fileName)}_duplicate_coordinates.txt`;
        downloadBlob(new Blob([buildDuplicateReport(latestDuplicateAnalysis)], { type: 'text/plain;charset=utf-8' }), name);
    });
