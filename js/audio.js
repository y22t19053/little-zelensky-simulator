/* Local, opt-in audio. Settings are separate from the game save. */
(function () {
  'use strict';
  const KEY = 'lzs_audio_v1';
  const DEFAULTS = { version: 1, music: false, sfx: false, musicVolume: 0.55, sfxVolume: 0.65 };
  const THEMES = { menu: 'menu', day: 'day', night: 'night', ending: 'ending' };
  let settings = load();
  let theme = 'menu';
  let primary = null;
  let secondary = null;
  let active = null;
  let fadeFrame = 0;
  let unlocked = false;
  const lastSfx = Object.create(null);

  function clamp(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : fallback;
  }
  function load() {
    try {
      const parsed = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (!parsed || typeof parsed !== 'object') return { ...DEFAULTS };
      return { version: 1, music: parsed.music === true, sfx: parsed.sfx === true, musicVolume: clamp(parsed.musicVolume, DEFAULTS.musicVolume), sfxVolume: clamp(parsed.sfxVolume, DEFAULTS.sfxVolume) };
    } catch (_) { return { ...DEFAULTS }; }
  }
  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch (_) { /* Audio remains usable without storage. */ }
  }
  function source(name) { return 'assets/audio/music/' + (THEMES[name] || THEMES.menu) + '.ogg'; }
  function makeAudio(name) {
    const audio = new Audio();
    audio.preload = 'none';
    audio.loop = true;
    audio.dataset.theme = name;
    audio.volume = 0;
    return audio;
  }
  function ensureAudio() {
    if (!primary) primary = makeAudio(theme);
    if (!secondary) secondary = makeAudio(theme);
    if (!active) active = primary;
  }
  function tryPlay(audio) {
    const promise = audio.play();
    if (promise && promise.catch) promise.catch(function () { /* Wait for the next user gesture. */ });
  }
  function cancelFade() { if (fadeFrame) cancelAnimationFrame(fadeFrame); fadeFrame = 0; }
  function setTheme(next) {
    if (!THEMES[next]) next = 'menu';
    if (theme === next && active && active.src) return;
    theme = next;
    if (!settings.music || !unlocked) return;
    ensureAudio();
    if (active.dataset.theme === next && active.src) { tryPlay(active); return; }
    const incoming = active === primary ? secondary : primary;
    const outgoing = active;
    incoming.src = source(next);
    incoming.dataset.theme = next;
    incoming.currentTime = 0;
    incoming.volume = 0;
    tryPlay(incoming);
    cancelFade();
    const start = performance.now();
    const from = outgoing.volume;
    const target = settings.musicVolume;
    function frame(now) {
      const progress = Math.min(1, (now - start) / 900);
      const eased = progress * progress * (3 - 2 * progress);
      incoming.volume = target * eased;
      outgoing.volume = from * (1 - eased);
      if (progress < 1) fadeFrame = requestAnimationFrame(frame);
      else { outgoing.pause(); outgoing.currentTime = 0; active = incoming; fadeFrame = 0; }
    }
    fadeFrame = requestAnimationFrame(frame);
  }
  function unlock() {
    unlocked = true;
    if (settings.music) {
      ensureAudio();
      if (!active.src) { active.src = source(theme); active.dataset.theme = theme; }
      active.volume = settings.musicVolume;
      tryPlay(active);
    }
  }
  function setMusicEnabled(value) {
    settings.music = Boolean(value); persist();
    if (!settings.music) {
      cancelFade();
      [primary, secondary].forEach(function (audio) { if (audio) audio.pause(); });
    } else { unlocked = true; unlock(); }
  }
  function setSfxEnabled(value) { settings.sfx = Boolean(value); persist(); if (value) unlocked = true; }
  function setMusicVolume(value) {
    settings.musicVolume = clamp(value, DEFAULTS.musicVolume); persist();
    if (active) active.volume = settings.musicVolume;
  }
  function setSfxVolume(value) { settings.sfxVolume = clamp(value, DEFAULTS.sfxVolume); persist(); }
  function playSfx(name) {
    if (!settings.sfx || settings.sfxVolume <= 0) return;
    const now = performance.now();
    if (lastSfx[name] && now - lastSfx[name] < 90) return;
    lastSfx[name] = now;
    const audio = new Audio('assets/audio/sfx/' + name + '.ogg');
    audio.preload = 'auto';
    audio.volume = settings.sfxVolume;
    tryPlay(audio);
  }
  document.addEventListener('pointerdown', function once() {
    document.removeEventListener('pointerdown', once);
    unlock();
  });
  document.addEventListener('keydown', function onceKey(event) {
    if (event.key === 'Tab' || event.key.indexOf('Arrow') === 0) return;
    document.removeEventListener('keydown', onceKey);
    unlock();
  });
  document.addEventListener('visibilitychange', function () {
    if (!active) return;
    if (document.hidden) active.pause();
    else if (settings.music && unlocked) tryPlay(active);
  });
  window.LZS_AUDIO = {
    getSettings: function () { return { ...settings }; },
    getTheme: function () { return theme; },
    setTheme,
    setMusicEnabled,
    setSfxEnabled,
    setMusicVolume,
    setSfxVolume,
    playSfx,
    unlock,
    storageKey: KEY
  };
}());
