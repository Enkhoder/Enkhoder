import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';



//////// CONSTANTS ////////

const ROWS = 7;
const COLUMNS = 53;
const CELL_COUNT = ROWS * COLUMNS;

const FPS = 15;
const LOOP_FRAMES = 60 * FPS;

const CELL_SIZE = 10;
const CELL_GAP = 3;
const CELL_RADIUS = 2;
const CELL_PITCH = CELL_SIZE + CELL_GAP;

const EMPTY_LIGHT = '#EFF2F5';
const EMPTY_DARK = '#151B23';
const TEXT_LIGHT = '#1F2328';
const TEXT_DARK = '#E6EDF3';

const PREVIEW_LABEL_HEIGHT = 18;
const PREVIEW_LABEL_GAP = 8;
const PREVIEW_BLOCK_GAP = 24;

const OUTPUT_DIR = 'dist';
const OUTPUT_PATH = `${OUTPUT_DIR}/life.svg`;
const PREVIEW_PATH = `${OUTPUT_DIR}/configurations.svg`;

const LOOP_ID = 'l';

const DEAD = 0;
const FIRE = 1;
const ICE = 2;
const DEAD_CELL = { type: DEAD, shade: 0 };
const MUTATION_AGE = 9;
const MAX_PERIOD = 15;
const POPULATION_FLOOR = 0.1;
const REFILL_DENSITY = 0.1;

const GITHUB_USER = 'Enkhoder';

const GRADIENT_START = [(360 + 50) / 360, 0.5, 0.62];
const GRADIENT_END = [350 / 360, 0.6, 0.62];
const GRADIENT_LENGTH = 6;
const FADE_STEPS = 85;
const PALETTE = {
    [FIRE]: trailOf(fireColor),
    [ICE]: trailOf(t => iceColor(1 - t))
};
const SURROUNDING = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];



//////// COLORS ////////

function fireColor(t) {
    const progress = Math.min(1, Math.max(0, t));
    const [hue, lightness, saturation] = GRADIENT_START.map((start, i) => start + (GRADIENT_END[i] - start) * progress);
    return toHex(hlsToRgb(wrap(hue, 1), lightness, saturation).map(channel => Math.trunc(channel * 255)));
}


function iceColor(t) {
    return toHex(fireColor(t).slice(1).match(/../g).map(pair => 255 - parseInt(pair, 16)));
}


function hlsToRgb(hue, lightness, saturation) {
    const high = lightness <= 0.5 ? lightness * (1 + saturation) : lightness + saturation - lightness * saturation;
    const low = 2 * lightness - high;
    return [hue + 1 / 3, hue, hue - 1 / 3].map(channelHue => hueChannel(low, high, wrap(channelHue, 1)));
}


function hueChannel(low, high, hue) {
    if (hue < 1 / 6) {
        return low + (high - low) * hue * 6;
    }

    if (hue < 0.5) {
        return high;
    }

    if (hue < 2 / 3) {
        return low + (high - low) * (2 / 3 - hue) * 6;
    }

    return low;
}


function trailOf(colorAt) {
    const gradient = Array.from(
        { length: GRADIENT_LENGTH },
        (_, i) => colorAt((1 - Math.E / (Math.E + i)) / (1 - Math.E / (Math.E + GRADIENT_LENGTH - 1)))
    );
    const fade = Array.from(
        { length: FADE_STEPS - 1 },
        (_, i) => gradient.at(-1) + toHex([Math.floor(255 * Math.E / (Math.E + i + 1))]).slice(1)
    );
    return [...gradient, ...fade];
}


function toHex(bytes) {
    return `#${bytes.map(byte => byte.toString(16).padStart(2, '0').toUpperCase()).join('')}`;
}



//////// CONTRIBUTIONS ////////

async function contributionGraph(username) {
    const response = await fetch(`https://github.com/users/${username}/contributions`);
    if (!response.ok) {
        throw new Error(`Failed to fetch contributions for ${username}: HTTP ${response.status}`);
    }

    const tags = (await response.text()).match(/<td[^>]*data-date[^>]*>/g) ?? [];
    if (tags.length === 0) {
        throw new Error(`No contribution cells found for ${username}`);
    }

    const days = tags
        .map(tag => ({ date: tag.match(/data-date="([^"]+)"/)[1], active: Number(tag.match(/data-level="(\d)"/)[1]) > 0 }))
        .sort((a, b) => a.date.localeCompare(b.date));
    const pattern = new Array(CELL_COUNT).fill('.');
    days.forEach((day, i) => {
        pattern[indexOfDay(i)] = day.active ? 'O' : '.';
    });
    return {
        name: `My graph · ${days.filter(day => day.active).length} active days`,
        rows: Array.from({ length: ROWS }, (_, row) => pattern.slice(row * COLUMNS, (row + 1) * COLUMNS).join('')),
        dayCount: days.length,
        date: days.at(-1).date
    };
}



//////// BOARD ////////

function createGrid(dayCount) {
    const grid = { dayCount, exists: Array.from({ length: CELL_COUNT }, (_, index) => dayOf(index) < dayCount) };
    grid.neighbors = Array.from(
        { length: CELL_COUNT },
        (_, index) => SURROUNDING.map(([rowOffset, columnOffset]) => offsetIndex(grid, index, rowOffset, columnOffset))
    );
    return grid;
}


function dayOf(index) {
    return (index % COLUMNS) * ROWS + Math.floor(index / COLUMNS);
}


function wrap(value, size) {
    return ((value % size) + size) % size;
}


function indexOfDay(day) {
    return (day % ROWS) * COLUMNS + Math.floor(day / ROWS);
}


function offsetIndex(grid, index, rowOffset, columnOffset) {
    return indexOfDay(wrap(dayOf(index) + rowOffset + columnOffset * ROWS, grid.dayCount));
}


function seedState(grid, graph, roles) {
    const pattern = graph.rows.join('');
    const cells = Array.from(
        { length: CELL_COUNT },
        (_, index) => (pattern[index] === 'O' && grid.exists[index] ? spawn(roles.born) : DEAD_CELL)
    );
    return { cells, ages: cells.map(cell => (isAlive(cell) ? 1 : 0)) };
}



//////// CELLS ////////

function isAlive(cell) {
    return cell.type !== DEAD && cell.shade === 0;
}


function rolesOf(date) {
    const even = Number(date.slice(8, 10)) % 2 === 0;
    return { born: even ? ICE : FIRE, mutated: even ? FIRE : ICE };
}


function spawn(type) {
    return { type, shade: 0 };
}


function fade(cell) {
    if (cell.type === DEAD || cell.shade + 1 === PALETTE[cell.type].length) {
        return DEAD_CELL;
    }

    return { type: cell.type, shade: cell.shade + 1 };
}



//////// SIMULATION ////////

function liveNext(grid, live, index) {
    const neighbors = grid.neighbors[index].filter(neighbor => live[neighbor]).length;
    return grid.exists[index] && (neighbors === 3 || (neighbors === 2 && live[index]));
}


function lifeStep(grid, live) {
    return live.map((_, index) => liveNext(grid, live, index));
}


function evolve(grid, state, roles) {
    const live = state.cells.map(isAlive);
    const cells = state.cells.map((cell, index) => {
        if (!liveNext(grid, live, index)) {
            return fade(cell);
        }

        return isAlive(cell) ? cell : spawn(roles.born);
    });
    const ages = cells.map((cell, index) => (isAlive(cell) ? state.ages[index] + 1 : 0));
    const mutating = ages.flatMap((age, index) => (age === MUTATION_AGE ? [index] : []));
    const doomed = new Set(mutating.length ? stillLifeCells(grid, cells.map(isAlive), mutating) : []);
    for (const index of doomed) {
        cells[index] = fade(spawn(roles.mutated));
        ages[index] = 0;
    }

    for (const index of mutating.filter(index => !doomed.has(index))) {
        for (const nearby of [index, ...grid.neighbors[index]]) {
            if (isAlive(cells[nearby])) {
                cells[nearby] = spawn(roles.mutated);
            }
        }
    }

    return { cells, ages };
}


function simulateLoop(grid, start, seed, date) {
    const roles = rolesOf(date);
    const frames = [start];
    let seen = new Set([serialize(start.cells)]);
    let ended = hasEnded(grid, start.cells);
    let refills = 0;
    let restarts = 0;
    while (frames.length < LOOP_FRAMES) {
        let state;
        if (ended) {
            state = restartState(seed, frames.at(-1));
            seen = new Set();
            restarts++;
        }

        else {
            state = evolve(grid, frames.at(-1), roles);
            if (state.cells.filter(isAlive).length <= POPULATION_FLOOR * grid.dayCount) {
                state = refill(grid, state, date, refills++);
            }
        }

        const key = serialize(state.cells);
        ended = seen.has(key) || hasEnded(grid, state.cells);
        seen.add(key);
        frames.push(state);
    }

    return { frames, refills, restarts };
}


function refill(grid, state, date, number) {
    const bytes = hashBytes(`${date}#${number}`, grid.dayCount);
    const cells = [...state.cells];
    const ages = [...state.ages];
    for (let day = 0; day < grid.dayCount; day++) {
        const index = indexOfDay(day);
        if (bytes[day] < REFILL_DENSITY * 256 && !isAlive(cells[index])) {
            cells[index] = spawn(rolesOf(date).born);
            ages[index] = 1;
        }
    }

    return { cells, ages };
}


function hashBytes(text, count) {
    const bytes = [];
    for (let block = 0; bytes.length < count; block++) {
        bytes.push(...createHash('sha1').update(`${text}#${block}`).digest());
    }

    return bytes;
}


function hasEnded(grid, cells) {
    const live = cells.map(isAlive);
    const liveCount = live.filter(Boolean).length;
    return liveCount === 0 || settledGroups(grid, live).flat().length === liveCount;
}


function restartState(seed, end) {
    return {
        cells: end.cells.map((cell, index) => (isAlive(seed.cells[index]) ? seed.cells[index] : fade(cell))),
        ages: seed.ages
    };
}


function loopFrames(grid, seed, date) {
    let start = seed;
    for (; ;) {
        const loop = simulateLoop(grid, start, seed, date);
        const next = restartState(seed, loop.frames.at(-1));
        if (fingerprint(next.cells) === fingerprint(start.cells)) {
            return { ...loop, frames: loop.frames.map(frame => frame.cells) };
        }

        start = next;
    }
}


function fingerprint(cells) {
    return cells.map(cell => `${cell.type}.${cell.shade}`).join(',');
}


function serialize(cells) {
    return cells.map(cell => (isAlive(cell) ? 1 : 0)).join('');
}



//////// STILL LIFES AND OSCILLATORS ////////

function stillLifeCells(grid, live, mutating) {
    return settledGroups(grid, live, 1)
        .filter(members => members.some(({ index }) => mutating.includes(index)))
        .flatMap(members => members.map(({ index }) => index));
}


function settledGroups(grid, live, periods = MAX_PERIOD) {
    const futures = [lifeStep(grid, live)];
    while (futures.length < periods) {
        futures.push(lifeStep(grid, futures.at(-1)));
    }

    const visited = new Array(CELL_COUNT).fill(false);
    const found = [];
    live.forEach((alive, start) => {
        if (visited[start] || !alive) {
            return;
        }

        visited[start] = true;
        const members = [{ index: start, row: 0, column: 0 }];
        for (let i = 0; i < members.length; i++) {
            for (const [rowOffset, columnOffset] of SURROUNDING) {
                const neighbor = offsetIndex(grid, members[i].index, rowOffset, columnOffset);
                if (!visited[neighbor] && live[neighbor]) {
                    visited[neighbor] = true;
                    members.push({ index: neighbor, row: members[i].row + rowOffset, column: members[i].column + columnOffset });
                }
            }
        }

        const period = futures.findIndex(future => isRecurring(grid, live, future, members)) + 1;
        if (period && oscillatesAlone(grid, members, period, futures.length)) {
            found.push(members);
        }
    });
    return found;
}


function isRecurring(grid, live, future, members) {
    return members.every(({ index }) => [index, ...grid.neighbors[index]]
        .every(nearby => future[nearby] === live[nearby]));
}


function oscillatesAlone(grid, members, period, limit) {
    const start = new Array(CELL_COUNT).fill(false);
    for (const { index } of members) {
        start[index] = true;
    }

    let alone = start;
    for (let generation = 1; generation <= limit; generation++) {
        alone = lifeStep(grid, alone);
        if (generation >= period && alone.every((alive, index) => alive === start[index])) {
            return true;
        }
    }

    return false;
}



//////// RENDERING ////////

function colorOf(cell) {
    return cell.type === DEAD ? 'transparent' : PALETTE[cell.type][cell.shade];
}


function seconds(frame) {
    return +(frame / FPS).toFixed(4);
}


function loopTime(frame) {
    return `${LOOP_ID}.begin+${seconds(frame)}`;
}


function preLoopTime(frame, count) {
    return `${+(seconds(frame) - seconds(count)).toFixed(4)}`;
}


function cellEvents(frames, index) {
    return frames.flatMap((cells, frame) => {
        const cell = cells[index];
        const previous = frames.at(frame - 1)[index];
        if (cell.type === DEAD || cell.shade > 1 || (cell.shade === 0 && isAlive(previous) && previous.type === cell.type)) {
            return [];
        }

        return [{ frame, type: cell.type, birth: cell.shade === 0 }];
    });
}


function aliveAnimation(events, type, count) {
    const begins = [];
    const ends = [];
    events.forEach((event, i) => {
        if (!event.birth || event.type !== type) {
            return;
        }

        begins.push(loopTime(event.frame));
        if (i + 1 < events.length) {
            ends.push(loopTime(events[i + 1].frame));
            return;
        }

        begins.unshift(preLoopTime(event.frame, count));
        ends.push(loopTime(events[0].frame), loopTime(count + events[0].frame));
    });
    if (!begins.length) {
        return [];
    }

    return [`<set attributeName="fill" to="${PALETTE[type][0]}" begin="${begins.join(';')}" end="${ends.join(';')}"/>`];
}


function trailAnimation(events, type, count) {
    const deaths = events.filter(event => !event.birth && event.type === type).map(event => event.frame);
    if (!deaths.length) {
        return [];
    }

    const trail = PALETTE[type].slice(1);
    const carried = deaths.at(-1) + trail.length > count ? [preLoopTime(deaths.at(-1), count)] : [];
    const begins = [...carried, ...deaths.map(frame => loopTime(frame))];
    return [
        `<animate attributeName="fill" values="${trail.join(';')}" dur="${seconds(trail.length)}" calcMode="discrete"`
        + ` begin="${begins.join(';')}"/>`
    ];
}


function renderCell(frames, index) {
    const x = (index % COLUMNS) * CELL_PITCH;
    const y = Math.floor(index / COLUMNS) * CELL_PITCH;
    const shape = `x="${x}" y="${y}" width="${CELL_SIZE}" height="${CELL_SIZE}" rx="${CELL_RADIUS}"`;
    const base = `<rect class="cell" ${shape} fill="currentColor"/>`;
    const colors = frames.map(cells => colorOf(cells[index]));
    if (colors.every(color => color === colors[0])) {
        return colors[0] === 'transparent' ? base : `${base}\n<rect ${shape} fill="${colors[0]}"/>`;
    }

    const events = cellEvents(frames, index);
    const animations = [FIRE, ICE].flatMap(type => [
        ...aliveAnimation(events, type, frames.length),
        ...trailAnimation(events, type, frames.length)
    ]);
    return `${base}\n<rect ${shape} fill="transparent">${animations.join('')}</rect>`;
}


function renderSvg(grid, frames) {
    const width = COLUMNS * CELL_PITCH - CELL_GAP;
    const height = ROWS * CELL_PITCH - CELL_GAP;
    const cells = grid.exists.flatMap((exists, index) => (exists ? [renderCell(frames, index)] : []));
    return [
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
        '<style>',
        `.cell { color: ${EMPTY_LIGHT}; }`,
        `@media (prefers-color-scheme: dark) { .cell { color: ${EMPTY_DARK}; } }`,
        '</style>',
        `<rect width="0" height="0"><set id="${LOOP_ID}" attributeName="x" to="0" dur="${seconds(frames.length)}s"`
        + ` begin="0s;${LOOP_ID}.end"/></rect>`,
        ...cells,
        '</svg>'
    ].join('\n');
}


function renderPreviews(grid, graphs, date) {
    const width = COLUMNS * CELL_PITCH - CELL_GAP;
    const gridHeight = ROWS * CELL_PITCH - CELL_GAP;
    const block = PREVIEW_LABEL_HEIGHT + PREVIEW_LABEL_GAP + gridHeight;
    const height = graphs.length * block + (graphs.length - 1) * PREVIEW_BLOCK_GAP;
    const blocks = graphs.map((graph, i) => renderPreview(grid, graph, date, i * (block + PREVIEW_BLOCK_GAP)));
    return [
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
        '<style>',
        `.cell { fill: ${EMPTY_LIGHT}; }`,
        `.live { fill: ${PALETTE[rolesOf(date).born][0]}; }`,
        `text { fill: ${TEXT_LIGHT}; font: 600 13px system-ui, -apple-system, "Segoe UI", sans-serif; }`,
        `@media (prefers-color-scheme: dark) { .cell { fill: ${EMPTY_DARK}; } text { fill: ${TEXT_DARK}; } }`,
        '</style>',
        ...blocks,
        '</svg>'
    ].join('\n');
}


function renderPreview(grid, graph, date, top) {
    const seed = seedState(grid, graph, rolesOf(date));
    const { refills, restarts } = loopFrames(grid, seed, date);
    const label = `<text x="0" y="${top + 13}">${graph.name} · ${refills} refills, ${restarts} restarts`
        + ` per 60 s loop on this ${grid.dayCount}-day graph</text>`;
    const cells = seed.cells.flatMap((cell, index) => {
        if (!grid.exists[index]) {
            return [];
        }

        const x = (index % COLUMNS) * CELL_PITCH;
        const y = top + PREVIEW_LABEL_HEIGHT + PREVIEW_LABEL_GAP + Math.floor(index / COLUMNS) * CELL_PITCH;
        const kind = isAlive(cell) ? 'live' : 'cell';
        return [`<rect class="${kind}" x="${x}" y="${y}" width="${CELL_SIZE}" height="${CELL_SIZE}" rx="${CELL_RADIUS}"/>`];
    });
    return [label, ...cells].join('\n');
}



//////// MAIN CONTROL FLOW ////////

async function main() {
    const graph = await contributionGraph(GITHUB_USER);
    const grid = createGrid(graph.dayCount);
    const date = graph.date;
    const seed = seedState(grid, graph, rolesOf(date));
    const previews = [graph];
    const { frames, refills, restarts } = loopFrames(grid, seed, date);

    mkdirSync(OUTPUT_DIR, { recursive: true });
    writeFileSync(OUTPUT_PATH, renderSvg(grid, frames));
    writeFileSync(PREVIEW_PATH, renderPreviews(grid, previews, date));
    console.log(
        `Wrote ${OUTPUT_PATH} (${graph.name}): `
        + `${frames.length}-frame loop (${frames.length / FPS} s), ${refills} refills, ${restarts} restarts`
    );
    console.log(`Wrote ${PREVIEW_PATH}: ${previews.length} graphs on a ${grid.dayCount}-day board`);
}


await main();