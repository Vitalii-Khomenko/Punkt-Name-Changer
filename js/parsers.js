// --- Parsing Logic ---

function buildCoordinateMap(text, filename) {
    coordinateMap.clear();
    const isLqp = filename.toLowerCase().endsWith('.lqp');
    const lines = text.split('\n');

    if (isLqp) {
        let buffer = [];
        let inBlock = false;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line.startsWith('-----')) {
                if (buffer.length >= 2) parseLqpBlock(buffer);
                buffer = [];
                inBlock = true;
            } else if (inBlock && line.length > 0) {
                buffer.push(line);
            }
        }

        if (buffer.length >= 2) parseLqpBlock(buffer);
    } else {
        lines.forEach(line => {
            const yxzIndex = line.indexOf('|YXZ|');
            if (yxzIndex > -1) {
                const preYxz = line.substring(0, yxzIndex);
                const lastPipeIndex = preYxz.lastIndexOf('|');

                if (lastPipeIndex > -1) {
                    const idPart = preYxz.substring(lastPipeIndex + 1);
                    const id = idPart.trim();

                    const postYxz = line.substring(yxzIndex + 5);
                    const parts = postYxz.split('|');
                    if (parts.length >= 2) {
                        const y = parseFloat(parts[0].trim());
                        const x = parseFloat(parts[1].trim());
                        if (id && !isNaN(y) && !isNaN(x)) {
                            coordinateMap.set(id, { y, x });
                        }
                    }
                }
                return;
            }

            if (line.includes('PID:')) {
                const pipeParts = line.split('|');
                let pid = null, y = null, x = null;
                let isHeader = false;

                pipeParts.forEach(part => {
                    const trimmed = part.trim();
                    if (trimmed.startsWith('PID:')) {
                        pid = trimmed.substring(4).trim();
                    } else if (trimmed.startsWith('Y:')) {
                        y = parseFloat(trimmed.substring(2).trim());
                    } else if (trimmed.startsWith('X:')) {
                        x = parseFloat(trimmed.substring(2).trim());
                    } else if (trimmed.startsWith('CODE:')) {
                        const code = trimmed.substring(5).trim();
                        if (code === 'iGeo') isHeader = true;
                    }
                });

                if (pid && !isNaN(y) && !isNaN(x) && !isHeader) {
                    coordinateMap.set(pid, { y, x });
                }
            }
        });
    }
}

function parseLqpBlock(buffer) {
    try {
        const idLine = buffer[0].trim().split(/\s+/);
        const coordLine = buffer[1].trim().split(/\s+/);

        if (idLine.length > 0 && coordLine.length >= 2) {
            const id = idLine[0];
            const y = parseFloat(coordLine[0]);
            const x = parseFloat(coordLine[1]);

            if (!isNaN(y) && !isNaN(x)) {
                coordinateMap.set(id, { y, x });
            }
        }
    } catch (e) {
        console.warn('Skipped LQP block due to parse error', buffer);
    }
}
