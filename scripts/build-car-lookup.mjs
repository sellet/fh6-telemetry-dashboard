#!/usr/bin/env node
/**
 * Fetch the FM23 car list and regenerate `shared/carLookup.ts`.
 *
 *   npm run update-cars
 *
 * The generated file is committed to the repo so production builds never need
 * to reach the network. Re-run when the upstream CSV is updated.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE_URL = 'https://raw.githubusercontent.com/AmiralPatate/FM23Data/main/modelexport.csv';
const OUT_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'shared',
  'carLookup.ts',
);

function parseLine(line) {
  const cells = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      cells.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  cells.push(cur);
  return cells.map((s) => s.trim());
}

function escSingle(s) {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

async function main() {
  console.log(`fetching ${SOURCE_URL}`);
  const res = await fetch(SOURCE_URL);
  if (!res.ok) throw new Error(`fetch failed: HTTP ${res.status}`);
  const csv = await res.text();

  const lines = csv.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length < 2) throw new Error('CSV looks empty');
  const header = parseLine(lines[0]);
  const idx = {
    ordinal: header.indexOf('Ordinal'),
    make: header.indexOf('Make'),
    model: header.indexOf('Model'),
    year: header.indexOf('Year'),
  };
  for (const [k, v] of Object.entries(idx)) {
    if (v < 0) throw new Error(`missing column "${k}" in CSV header: ${header.join(',')}`);
  }

  const entries = new Map();
  for (let i = 1; i < lines.length; i += 1) {
    const cells = parseLine(lines[i]);
    const ordinal = Number(cells[idx.ordinal]);
    if (!Number.isFinite(ordinal) || ordinal <= 0) continue;
    const make = cells[idx.make] ?? '';
    const model = cells[idx.model] ?? '';
    const year = Number(cells[idx.year]) || 0;
    if (!make && !model) continue;
    entries.set(ordinal, { ordinal, make, model, year });
  }

  const sorted = [...entries.values()].sort((a, b) => a.ordinal - b.ordinal);
  console.log(`parsed ${sorted.length} cars`);

  const body = sorted
    .map(
      (e) =>
        `  ${e.ordinal}: { make: '${escSingle(e.make)}', model: '${escSingle(e.model)}', year: ${e.year} },`,
    )
    .join('\n');

  const out =
    `// AUTO-GENERATED — do not edit by hand.\n` +
    `// Source: ${SOURCE_URL}\n` +
    `// Regenerate with: npm run update-cars\n` +
    `//\n` +
    `// ${sorted.length} cars (Forza FM23 dataset, best-effort coverage for FH6).\n\n` +
    `export interface CarEntry {\n` +
    `  make: string;\n` +
    `  model: string;\n` +
    `  year: number;\n` +
    `}\n\n` +
    `export const CAR_LOOKUP: Record<number, CarEntry> = {\n` +
    body +
    `\n};\n`;

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, out);
  console.log(`wrote ${OUT_PATH} (${out.length} bytes)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
