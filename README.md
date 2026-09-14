# Lichess pieces & sounds on chess.com

A Tampermonkey userscript that makes chess.com look and sound like lichess.org:

- **Pieces**: lichess's default `cburnett` set, on the main board and the promotion picker
  (live, daily, puzzles, analysis, game review — anything rendered with `<wc-chess-board>`).
- **Sounds**: lichess's `standard` sound set. Chess.com keeps deciding *which* event happened
  (move, capture, castle, low time, ...); the script swaps the audio file that gets played.

Board colours, highlights, captured-piece strips and the settings preview are left alone.

Everything is embedded in one self-contained `.user.js` (~42 KB) — no requests to lichess at runtime.

## Install

1. Install [Tampermonkey](https://www.tampermonkey.net/) in Chrome or Brave.
2. Chromium-based browsers need **Developer mode** enabled for userscripts to run:
   go to `chrome://extensions` (or `brave://extensions`) and switch on **Developer mode** (top right).
3. Open `dist/lichess-on-chesscom.user.js` in the browser (drag the file onto a tab, or
   `file:///…/dist/lichess-on-chesscom.user.js`). Tampermonkey shows an install dialog — click **Install**.
4. In chess.com **Settings → Board and Pieces**, keep sounds **on** and the sound theme on **Default**.
   The script intercepts the default theme's files; if chess.com sounds are off there is nothing to swap.
5. Reload chess.com.

Reinstall the same way after every rebuild (Tampermonkey detects it as an update).

## Toggling

Click the Tampermonkey icon while on chess.com. The script menu has two entries,
**Pieces: ON/OFF** and **Sounds: ON/OFF**. Clicking one flips it and reloads the page.
Settings persist across reloads (`GM_setValue`).

## Sound mapping

| chess.com event                                          | lichess sound   |
| -------------------------------------------------------- | --------------- |
| `move-self`, `move-opponent`, `castle`, `promote`, `premove`, `move-check` | `Move`          |
| `capture`                                                | `Capture`       |
| `game-start`, `game-end`, `notify`                       | `GenericNotify` |
| `tenseconds`                                             | `LowTime`       |
| `illegal`                                                | `Error`         |

`move-check` maps to `Move` because lichess's standard set has no check sound
(`Check.mp3` is a symlink to `Silence.mp3`); on lichess a check just sounds like the move.

Sounds not in the table (puzzle "correct"/"result" jingles, UI clicks, event notifications) pass
through unchanged. Set `PASS_THROUGH_UNMAPPED = false` in `src/userscript.js` to silence them.

## Rebuilding

```sh
node build.mjs            # uses assets/ cache, downloads anything missing
node build.mjs --refresh  # re-download every asset from the lichess repo
```

`build.mjs` pulls the SVGs and MP3s from `lichess-org/lila` (`public/piece/cburnett`,
`public/sound/standard`), caches them under `assets/`, base64-inlines them into
`src/userscript.js` and writes `dist/lichess-on-chesscom.user.js`.

To use a different piece set or sound theme, change `PIECE_SET` / `SOUND_SET` in `build.mjs`
(names as in the lila repo, e.g. `merida`, `alpha`, `piano`, `nes`) and rebuild.
Bump `version` in `package.json` so Tampermonkey picks the change up as an update.

## How it works

- **Pieces**: chess.com injects a `<style id="board-styles-…">` per board with
  `#board-… .piece.wp { background-image: url(…/wp.png) }`. The script adds a stylesheet
  overriding `.piece.wp`, `.promotion-piece.wp` and `.vfx .element.wp` (and the other 11 codes)
  with `!important` data-URI SVGs.
- **Sounds**: chess.com plays audio with [Howler](https://howlerjs.com/) in Web Audio mode,
  which downloads `https://assets-ds.chess.com/sounds/<group>/<name>-<hash>.mp3` via
  `XMLHttpRequest` and decodes it. The script wraps `XMLHttpRequest.prototype.open` (and
  `fetch`) and redirects matching sound URLs to `blob:` URLs of the lichess files, so Howler
  decodes and plays lichess audio at whatever volume chess.com's slider is set to.

## Credits & licences

- Script: MIT.
- Pieces: **cburnett** by Colin M.L. Burnett, [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/),
  distributed by [lichess.org](https://github.com/lichess-org/lila/tree/master/public/piece/cburnett).
- Sounds: lichess.org `standard` sound set, from
  [lichess-org/lila](https://github.com/lichess-org/lila/tree/master/public/sound/standard).
- Not affiliated with lichess.org or chess.com.
