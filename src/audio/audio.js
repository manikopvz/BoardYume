const STORAGE_KEY = 'boardYume.audio.v1';

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, Number(value) || 0));

const withBase = (path) => {
  const base = import.meta.env?.BASE_URL || '/';
  return `${base.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
};

export const AUDIO_PATHS = Object.freeze({
  music: Object.freeze({
    day: 'assets/audio/music/day-garden.ogg',
    night: 'assets/audio/music/night-garden.ogg',
  }),
  ambience: Object.freeze({
    rain: 'assets/audio/sfx/rain.ogg',
    birds: 'assets/audio/sfx/birds.ogg',
    wind: 'assets/audio/sfx/wind.ogg',
    insects: 'assets/audio/sfx/insects.ogg',
  }),
  sfx: Object.freeze({
    footstep: 'assets/audio/sfx/footstep.ogg',
    hoe: 'assets/audio/sfx/hoe.ogg',
    water: 'assets/audio/sfx/water.ogg',
    seed: 'assets/audio/sfx/seed.ogg',
    harvest: 'assets/audio/sfx/harvest.ogg',
    chop: 'assets/audio/sfx/chop.ogg',
    mine: 'assets/audio/sfx/mine.ogg',
    pickup: 'assets/audio/sfx/pickup.ogg',
    build: 'assets/audio/sfx/build.ogg',
    complete: 'assets/audio/sfx/complete.ogg',
    click: 'assets/audio/sfx/click.ogg',
    buy: 'assets/audio/sfx/buy.ogg',
    sell: 'assets/audio/sfx/sell.ogg',
  }),
});

const DEFAULT_SETTINGS = Object.freeze({ musicVolume: 0.55, sfxVolume: 0.78, muted: false });

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    return {
      musicVolume: clamp(saved?.musicVolume ?? DEFAULT_SETTINGS.musicVolume),
      sfxVolume: clamp(saved?.sfxVolume ?? DEFAULT_SETTINGS.sfxVolume),
      muted: Boolean(saved?.muted ?? DEFAULT_SETTINGS.muted),
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function createTrack(path, { loop = false, preload = 'metadata' } = {}) {
  if (typeof Audio === 'undefined') {
    return {
      loop,
      preload,
      volume: 0,
      paused: true,
      currentTime: 0,
      playbackRate: 1,
      async play() { this.paused = false; },
      pause() { this.paused = true; },
      cloneNode() { return createTrack(path, { loop, preload }); },
    };
  }
  const audio = new Audio(withBase(path));
  audio.loop = loop;
  audio.preload = preload;
  audio.playsInline = true;
  return audio;
}

/**
 * Local HTMLAudioElement mixer. It intentionally creates no AudioContext so the
 * game remains cheap on mobile and every sound is sourced from a real file.
 */
export class AudioManager extends EventTarget {
  constructor() {
    super();
    this.settings = loadSettings();
    this.unlocked = false;
    this.scene = { isNight: false, raining: false };
    this.desiredMusic = 'day';
    this.currentMusic = null;
    this.fadeToken = 0;
    this.unlockCleanup = null;

    this.music = Object.fromEntries(
      Object.entries(AUDIO_PATHS.music).map(([name, path]) => [name, createTrack(path, { loop: true, preload: 'auto' })]),
    );
    this.ambience = Object.fromEntries(
      Object.entries(AUDIO_PATHS.ambience).map(([name, path]) => [name, createTrack(path, { loop: true })]),
    );
    this.sfx = Object.fromEntries(
      Object.entries(AUDIO_PATHS.sfx).map(([name, path]) => [name, createTrack(path, { preload: 'auto' })]),
    );

    Object.values(this.music).forEach((track) => { track.volume = 0; });
    Object.values(this.ambience).forEach((track) => { track.volume = 0; });
  }

  installFirstInteractionUnlock(target = document) {
    if (this.unlocked || this.unlockCleanup) return this.unlockCleanup || (() => {});
    const events = ['pointerdown', 'touchstart', 'keydown'];
    const unlock = () => { void this.unlock(); };
    events.forEach((eventName) => target.addEventListener(eventName, unlock, { once: true, passive: true }));
    this.unlockCleanup = () => {
      events.forEach((eventName) => target.removeEventListener(eventName, unlock));
      this.unlockCleanup = null;
    };
    return this.unlockCleanup;
  }

  async unlock() {
    if (this.unlocked) return true;
    this.unlockCleanup?.();
    this.unlocked = true;
    await this.#applyScene({ immediate: true });
    this.dispatchEvent(new CustomEvent('unlocked'));
    return true;
  }

  getSettings() {
    return { ...this.settings };
  }

  setMusicVolume(value) {
    this.settings.musicVolume = clamp(value);
    this.#persist();
    this.#applyVolumes();
  }

  setSfxVolume(value) {
    this.settings.sfxVolume = clamp(value);
    this.#persist();
    this.#applyVolumes();
  }

  setMuted(muted) {
    this.settings.muted = Boolean(muted);
    this.#persist();
    this.#applyVolumes();
  }

  toggleMuted() {
    this.setMuted(!this.settings.muted);
    return this.settings.muted;
  }

  async setScene({ isNight = this.scene.isNight, raining = this.scene.raining } = {}) {
    const next = { isNight: Boolean(isNight), raining: Boolean(raining) };
    const changed = next.isNight !== this.scene.isNight || next.raining !== this.scene.raining;
    this.scene = next;
    this.desiredMusic = next.isNight ? 'night' : 'day';
    if (this.unlocked && changed) await this.#applyScene();
  }

  async playMusic(theme, { immediate = false } = {}) {
    if (!(theme in this.music)) return false;
    this.desiredMusic = theme;
    if (!this.unlocked) return false;

    const incoming = this.music[theme];
    const outgoing = this.currentMusic;
    if (outgoing === incoming && !incoming.paused) {
      this.#applyVolumes();
      return true;
    }

    const token = ++this.fadeToken;
    incoming.volume = immediate ? this.#musicTarget() : 0;
    try {
      await incoming.play();
    } catch {
      return false;
    }
    this.currentMusic = incoming;

    if (immediate) {
      if (outgoing && outgoing !== incoming) outgoing.pause();
      this.#applyVolumes();
      return true;
    }

    const startedAt = performance.now();
    const duration = 1100;
    const fade = (now) => {
      if (token !== this.fadeToken) return;
      const progress = clamp((now - startedAt) / duration);
      incoming.volume = this.#musicTarget() * progress;
      if (outgoing && outgoing !== incoming) outgoing.volume = this.#musicTarget() * (1 - progress);
      if (progress < 1) requestAnimationFrame(fade);
      else if (outgoing && outgoing !== incoming) outgoing.pause();
    };
    requestAnimationFrame(fade);
    return true;
  }

  playSfx(name, { volume = 1, playbackRate = 1 } = {}) {
    const source = this.sfx[name];
    if (!source || !this.unlocked || this.settings.muted) return null;
    const voice = source.cloneNode(true);
    voice.volume = clamp(volume) * this.settings.sfxVolume;
    voice.playbackRate = clamp(playbackRate, 0.65, 1.5);
    voice.play().catch(() => {});
    return voice;
  }

  stopAll() {
    this.fadeToken += 1;
    [...Object.values(this.music), ...Object.values(this.ambience)].forEach((track) => {
      track.pause();
      track.currentTime = 0;
    });
    this.currentMusic = null;
  }

  destroy() {
    this.unlockCleanup?.();
    this.stopAll();
  }

  async #applyScene({ immediate = false } = {}) {
    await this.playMusic(this.desiredMusic, { immediate });
    const desiredAmbience = new Set(['wind']);
    desiredAmbience.add(this.scene.isNight ? 'insects' : 'birds');
    if (this.scene.raining) desiredAmbience.add('rain');

    await Promise.all(Object.entries(this.ambience).map(async ([name, track]) => {
      if (!desiredAmbience.has(name)) {
        track.pause();
        track.currentTime = 0;
        return;
      }
      track.volume = this.#ambienceTarget(name);
      try { await track.play(); } catch { /* First-input handler will retry on the next scene change. */ }
    }));
  }

  #musicTarget() {
    if (this.settings.muted) return 0;
    return this.settings.musicVolume * (this.scene.raining ? 0.72 : 1);
  }

  #ambienceTarget(name) {
    if (this.settings.muted) return 0;
    const mix = { rain: 0.52, birds: 0.26, wind: 0.17, insects: 0.25 };
    return this.settings.sfxVolume * (mix[name] || 0.2);
  }

  #applyVolumes() {
    Object.values(this.music).forEach((track) => {
      track.volume = track === this.currentMusic ? this.#musicTarget() : 0;
    });
    Object.entries(this.ambience).forEach(([name, track]) => {
      track.volume = this.#ambienceTarget(name);
    });
    this.dispatchEvent(new CustomEvent('settingschange', { detail: this.getSettings() }));
  }

  #persist() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings)); } catch { /* Private mode can reject storage. */ }
  }
}

export const audioManager = new AudioManager();
