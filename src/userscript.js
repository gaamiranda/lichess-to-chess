// ==UserScript==
// @name         Lichess pieces & sounds on chess.com
// @namespace    https://github.com/goncalomiranda/lichess-on-chesscom
// @version      __VERSION__
// @description  Replaces chess.com's pieces with the lichess "__PIECE_SET__" set and its move sounds with the lichess "__SOUND_SET__" sound set.
// @author       Gonçalo Miranda
// @license      MIT (script); pieces: cburnett by Colin M.L. Burnett, CC BY-SA 3.0; sounds: lichess.org
// @match        https://www.chess.com/*
// @run-at       document-start
// @noframes
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        unsafeWindow
// ==/UserScript==

(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Config
  // ---------------------------------------------------------------------------

  // chess.com board sound name -> lichess sound name. `null` keeps chess.com's
  // own sound for that event. Any chess.com sound not listed here (puzzle
  // feedback, UI clicks, event notifications...) is left untouched; set
  // PASS_THROUGH_UNMAPPED to false to silence those instead.
  const SOUND_MAP = {
    'move-self': 'Move',
    'move-opponent': 'Move',
    'castle': 'Move',
    'promote': 'Move',
    'premove': 'Move',
    'capture': 'Capture',
    'move-check': null, // lichess "standard" has no check sound, so keep chess.com's
    'game-start': 'GenericNotify',
    'game-end': 'GenericNotify',
    'notify': 'GenericNotify',
    'tenseconds': 'LowTime',
    'illegal': 'Error',
  };
  const PASS_THROUGH_UNMAPPED = true;

  // Inlined by build.mjs: { wp: 'data:image/svg+xml;base64,...', ... }
  const PIECES = "__PIECES__";
  // Inlined by build.mjs: { Move: 'data:audio/mpeg;base64,...', ... }
  const SOUNDS = "__SOUNDS__";

  // ---------------------------------------------------------------------------
  // Settings + Tampermonkey menu
  // ---------------------------------------------------------------------------

  const hasGM = typeof GM_getValue === 'function';
  const getSetting = (key, def) => (hasGM ? GM_getValue(key, def) : def);
  const setSetting = (key, val) => hasGM && GM_setValue(key, val);

  const piecesOn = getSetting('piecesOn', true);
  const soundsOn = getSetting('soundsOn', true);

  if (typeof GM_registerMenuCommand === 'function') {
    GM_registerMenuCommand(`Pieces: ${piecesOn ? 'ON' : 'OFF'} (click to toggle)`, () => {
      setSetting('piecesOn', !piecesOn);
      location.reload();
    });
    GM_registerMenuCommand(`Sounds: ${soundsOn ? 'ON' : 'OFF'} (click to toggle)`, () => {
      setSetting('soundsOn', !soundsOn);
      location.reload();
    });
  }

  // ---------------------------------------------------------------------------
  // Pieces: chess.com injects `<style id="board-styles-*">` with rules like
  //   #board-xyz .piece.wp, #board-xyz .promotion-piece.wp, #board-xyz .vfx .element.wp { background-image: url(...wp.png) }
  // We override those with !important data-URI backgrounds.
  // ---------------------------------------------------------------------------

  if (piecesOn) {
    const css = Object.entries(PIECES)
      .map(([cls, uri]) =>
        `.piece.${cls}, .promotion-piece.${cls}, .vfx .element.${cls} { background-image: url("${uri}") !important; }`
      )
      .join('\n');

    const style = document.createElement('style');
    style.id = 'lichess-pieces-on-chesscom';
    style.textContent = css;

    const mount = () => {
      if (!style.isConnected) (document.head || document.documentElement).appendChild(style);
    };
    if (document.documentElement) mount();
    else document.addEventListener('DOMContentLoaded', mount, { once: true });
    // Re-mount if anything ever replaces <head>.
    document.addEventListener('DOMContentLoaded', mount, { once: true });
  }

  // ---------------------------------------------------------------------------
  // Sounds: chess.com plays sounds with Howler in Web Audio mode, which fetches
  // each file via XMLHttpRequest from assets-ds.chess.com/sounds/<group>/<name>-<hash>.mp3
  // and decodes it with decodeAudioData. We redirect those requests to blob:
  // URLs holding the lichess files, so Howler decodes and plays our audio at
  // whatever volume chess.com asked for. fetch() is hooked too, in case they
  // ever switch loaders.
  // ---------------------------------------------------------------------------

  if (soundsOn) {
    const win = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;

    const blobUrls = {};
    const dataUriToBlobUrl = (uri) => {
      const [meta, b64] = uri.split(',');
      const mime = meta.slice(5, meta.indexOf(';'));
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return URL.createObjectURL(new Blob([bytes], { type: mime }));
    };
    const soundUrl = (name) => (blobUrls[name] ||= dataUriToBlobUrl(SOUNDS[name]));

    // Tiny valid silent WAV (44-byte header, 0 samples) for silenced sounds.
    let silentUrl;
    const silence = () => {
      if (!silentUrl) {
        const b = new Uint8Array([
          82, 73, 70, 70, 36, 0, 0, 0, 87, 65, 86, 69, 102, 109, 116, 32, 16, 0, 0, 0, 1, 0, 1, 0,
          68, 172, 0, 0, 136, 88, 1, 0, 2, 0, 16, 0, 100, 97, 116, 97, 0, 0, 0, 0,
        ]);
        silentUrl = URL.createObjectURL(new Blob([b], { type: 'audio/wav' }));
      }
      return silentUrl;
    };

    const SOUND_PATH = /\/sounds\/[^?#]*\/([^/?#]+)\.(?:mp3|ogg|webm|wav)(?:[?#]|$)/i;

    // Returns a replacement URL, or null to leave the request alone.
    const redirect = (url) => {
      if (typeof url !== 'string') return null;
      const m = SOUND_PATH.exec(url);
      if (!m) return null;
      const base = m[1];
      const key = base in SOUND_MAP ? base : base.replace(/-[0-9a-f]{6,8}$/i, '');
      if (!(key in SOUND_MAP)) return PASS_THROUGH_UNMAPPED ? null : silence();
      const lichessName = SOUND_MAP[key];
      return lichessName && SOUNDS[lichessName] ? soundUrl(lichessName) : null;
    };

    const XHR = win.XMLHttpRequest;
    const origOpen = XHR.prototype.open;
    XHR.prototype.open = function (method, url, ...rest) {
      const r = redirect(url);
      return origOpen.call(this, method, r || url, ...rest);
    };

    const origFetch = win.fetch;
    win.fetch = function (input, init) {
      const url = typeof input === 'string' ? input : input && input.url;
      const r = redirect(url);
      return origFetch.call(this, r || input, init);
    };
  }
})();
