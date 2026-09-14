// Builds dist/lichess-on-chesscom.user.js from src/userscript.js by inlining
// lichess assets (cburnett pieces + standard sounds) as data: URIs.
//
//   node build.mjs            # uses cached files in assets/, downloads missing ones
//   node build.mjs --refresh  # re-downloads everything from the lichess repo

import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const ASSETS = join(ROOT, 'assets');
const LILA = 'https://raw.githubusercontent.com/lichess-org/lila/master/public';

const PIECE_SET = 'cburnett';
const SOUND_SET = 'standard';

// chess.com piece class -> lichess file name
const PIECES = {
  wp: 'wP', wn: 'wN', wb: 'wB', wr: 'wR', wq: 'wQ', wk: 'wK',
  bp: 'bP', bn: 'bN', bb: 'bB', br: 'bR', bq: 'bQ', bk: 'bK',
};

// lichess sound names we embed (mapping from chess.com events lives in src/userscript.js)
// Note: the standard set has no check sound (Check.mp3 is a symlink to Silence.mp3);
// lichess plays the plain move/capture sound on check, so we map move-check -> Move.
const SOUNDS = ['Move', 'Capture', 'GenericNotify', 'LowTime', 'Error'];

const refresh = process.argv.includes('--refresh');

async function fetchAsset(relPath) {
  const local = join(ASSETS, relPath);
  if (!refresh) {
    try { await access(local); return readFile(local); } catch {}
  }
  const url = `${LILA}/${relPath}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  let buf = Buffer.from(await res.arrayBuffer());
  // Some lila assets are git symlinks (e.g. sound/standard/Check.mp3 -> ../Silence.mp3);
  // raw.githubusercontent.com serves the link target path as the file body.
  if (buf.length < 200 && /^[\w./-]+\.\w+$/.test(buf.toString().trim())) {
    const target = join(dirname(relPath), buf.toString().trim()).replace(/\\/g, '/');
    console.log(`${relPath} is a symlink -> ${target}`);
    buf = await fetchAsset(target);
  }
  await mkdir(dirname(local), { recursive: true });
  await writeFile(local, buf);
  console.log(`downloaded ${relPath} (${buf.length} bytes)`);
  return buf;
}

const pieces = {};
for (const [cls, file] of Object.entries(PIECES)) {
  const svg = await fetchAsset(`piece/${PIECE_SET}/${file}.svg`);
  pieces[cls] = `data:image/svg+xml;base64,${svg.toString('base64')}`;
}

const sounds = {};
for (const name of SOUNDS) {
  const mp3 = await fetchAsset(`sound/${SOUND_SET}/${name}.mp3`);
  sounds[name] = `data:audio/mpeg;base64,${mp3.toString('base64')}`;
}

const pkg = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8'));
let out = await readFile(join(ROOT, 'src', 'userscript.js'), 'utf8');
out = out
  .replace('__VERSION__', pkg.version)
  .replace('__PIECE_SET__', PIECE_SET)
  .replace('__SOUND_SET__', SOUND_SET)
  .replace('"__PIECES__"', JSON.stringify(pieces, null, 2))
  .replace('"__SOUNDS__"', JSON.stringify(sounds, null, 2));

await mkdir(join(ROOT, 'dist'), { recursive: true });
const outPath = join(ROOT, 'dist', 'lichess-on-chesscom.user.js');
await writeFile(outPath, out);
console.log(`wrote ${outPath} (${(out.length / 1024).toFixed(0)} KB)`);
