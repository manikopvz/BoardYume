import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { JSDOM } from 'jsdom';

const ROOT = resolve(import.meta.dirname, '..');

test('game DOM khởi động không lỗi, render HUD/world và lưu được trạng thái', async () => {
  const dom = new JSDOM('<!doctype html><div id="app"></div>', { url: 'https://example.test/BoardYume/', pretendToBeVisual: true });
  Object.defineProperty(dom.window.HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 1440 });
  Object.defineProperty(dom.window.HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 900 });
  dom.window.HTMLElement.prototype.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, right: 1440, bottom: 900, width: 1440, height: 900, toJSON() {} });
  const originals = new Map();
  const expose = (key, value) => {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  };
  expose('window', dom.window);
  expose('document', dom.window.document);
  expose('navigator', dom.window.navigator);
  expose('localStorage', dom.window.localStorage);
  expose('HTMLElement', dom.window.HTMLElement);
  expose('HTMLInputElement', dom.window.HTMLInputElement);
  expose('HTMLTextAreaElement', dom.window.HTMLTextAreaElement);
  expose('HTMLSelectElement', dom.window.HTMLSelectElement);
  expose('CustomEvent', dom.window.CustomEvent);
  expose('Event', dom.window.Event);
  expose('EventTarget', dom.window.EventTarget);
  expose('requestAnimationFrame', (callback) => setTimeout(() => callback(performance.now()), 4));
  expose('cancelAnimationFrame', (handle) => clearTimeout(handle));
  expose('fetch', async () => ({ ok: true, status: 200, json: async () => JSON.parse(readFileSync(resolve(ROOT, 'public/assets/manifest.json'), 'utf8')) }));

  let game;
  try {
    const { bootGame } = await import(`../src/game/boot.js?test=${Date.now()}`);
    game = await bootGame(dom.window.document.querySelector('#app'));
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 35));
    assert.equal(game.state.version, 3);
    assert.equal(dom.window.document.querySelectorAll('.toolbelt__slot').length, 7);
    assert.ok(dom.window.document.querySelectorAll('.world-entity--tile').length > 30);
    assert.ok(dom.window.document.querySelector('.world-entity--player img[src]'));
    assert.ok(Object.keys(game.manifest.assets).length > 700);
    assert.equal(game.save().ok, true);
    assert.ok(dom.window.localStorage.getItem('board-yume-save'));
  } finally {
    game?.destroy();
    dom.window.close();
    for (const [key, descriptor] of originals) {
      if (descriptor === undefined) delete globalThis[key];
      else Object.defineProperty(globalThis, key, descriptor);
    }
  }
});
