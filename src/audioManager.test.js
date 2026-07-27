test("preloads decoded sounds and starts playback without awaiting it", async () => {
  jest.resetModules();
  const start = jest.fn();
  const createBufferSource = jest.fn(() => ({
    connect: jest.fn(),
    start,
    buffer: null,
  }));
  const decodeAudioData = jest.fn(async () => ({ decoded: true }));
  const load = jest.fn();

  window.AudioContext = jest.fn(() => ({
    state: "running",
    destination: {},
    decodeAudioData,
    createBufferSource,
    resume: jest.fn(() => Promise.resolve()),
  }));
  global.Audio = jest.fn(() => ({
    preload: "",
    currentTime: 0,
    load,
    play: jest.fn(() => Promise.resolve()),
  }));
  global.fetch = jest.fn(async () => ({
    ok: true,
    arrayBuffer: async () => new ArrayBuffer(8),
  }));

  const { playGameSound, preloadGameSounds } = require("./audioManager");
  await preloadGameSounds();
  const result = playGameSound("turn");

  expect(result).toBeUndefined();
  expect(global.fetch).toHaveBeenCalledTimes(4);
  expect(decodeAudioData).toHaveBeenCalledTimes(4);
  expect(createBufferSource).toHaveBeenCalledTimes(1);
  expect(start).toHaveBeenCalledWith(0);
  expect(load).toHaveBeenCalledTimes(4);
});

