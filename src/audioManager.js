const SOUND_SOURCES = {
  turn: "/1.mp3",
  waiting: "/2.mp3",
  deal: "/3.mp3",
  call: "/call.mp3",
};

let audioContext = null;
let preloadPromise = null;
let unlockInstalled = false;
const decodedBuffers = new Map();
const fallbackAudio = new Map();

const getAudioContext = () => {
  if (audioContext || typeof window === "undefined") return audioContext;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;

  try {
    audioContext = new AudioContextClass();
  } catch (_) {
    audioContext = null;
  }
  return audioContext;
};

const prepareFallbacks = () => {
  if (typeof Audio === "undefined") return;
  Object.entries(SOUND_SOURCES).forEach(([name, source]) => {
    if (fallbackAudio.has(name)) return;
    const audio = new Audio(source);
    audio.preload = "auto";
    audio.load?.();
    fallbackAudio.set(name, audio);
  });
};

export const preloadGameSounds = () => {
  if (preloadPromise) return preloadPromise;
  prepareFallbacks();

  const context = getAudioContext();
  if (!context || typeof fetch !== "function") {
    preloadPromise = Promise.resolve();
    return preloadPromise;
  }

  preloadPromise = Promise.all(
    Object.entries(SOUND_SOURCES).map(async ([name, source]) => {
      try {
        const response = await fetch(source);
        if (!response.ok) return;
        const encodedAudio = await response.arrayBuffer();
        const buffer = await context.decodeAudioData(encodedAudio);
        decodedBuffers.set(name, buffer);
      } catch (_) {
        // The preloaded HTMLAudio element remains available as a fallback.
      }
    })
  ).then(() => undefined);

  return preloadPromise;
};

export const unlockGameAudio = () => {
  const context = getAudioContext();
  if (context?.state === "suspended") {
    context.resume().catch(() => {});
  }
};

export const installGameAudioUnlock = () => {
  if (unlockInstalled || typeof window === "undefined") return;
  unlockInstalled = true;

  const unlock = () => {
    unlockGameAudio();
    window.removeEventListener("pointerdown", unlock, true);
    window.removeEventListener("touchstart", unlock, true);
    window.removeEventListener("keydown", unlock, true);
  };

  window.addEventListener("pointerdown", unlock, true);
  window.addEventListener("touchstart", unlock, true);
  window.addEventListener("keydown", unlock, true);
};

export const playGameSound = (name) => {
  try {
    const context = getAudioContext();
    const buffer = decodedBuffers.get(name);

    if (context?.state === "running" && buffer) {
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(context.destination);
      source.start(0);
      return;
    }

    const audio = fallbackAudio.get(name);
    if (!audio) {
      preloadGameSounds();
      return;
    }
    audio.currentTime = 0;
    audio.play().catch(() => {});
  } catch (_) {
    // Sound must never delay or break gameplay.
  }
};

