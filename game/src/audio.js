// All sound is synthesized with WebAudio — no audio files. Engine hum, police sirens,
// gunshots, punches, pickups, a mission jingle and a looping bass groove. The context
// starts on the first user gesture (the title button), as browsers require.

// One master level for every sound; mute flips it to 0 in setMuted.
const MASTER_VOLUME = 0.5;

export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let engineFilter = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenLfo = null;
  let muted = false;
  let musicTimer = null;
  let musicStep = 0;

  // A laid-back coastal bassline, one bar of eight notes, looped.
  // Eight steps at 260 ms a step is a ~2.1 s bar, about 115 BPM in eighth notes.
  const BASS = [55, 0, 55, 65.4, 49, 0, 58.3, 73.4];
  const HAT = [0, 1, 0, 1, 0, 1, 0, 1];
  const MUSIC_STEP_MS = 260;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : MASTER_VOLUME;
      master.connect(ctx.destination);
      // Engine: a low sawtooth through a lowpass, pitch follows speed.
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 50;
      engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 320;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      // Siren: a triangle that wails between two tones on an LFO.
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'triangle';
      sirenOsc.frequency.value = 750;
      sirenLfo = ctx.createOscillator();
      sirenLfo.type = 'square';
      sirenLfo.frequency.value = 0.55;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 180;
      sirenLfo.connect(lfoGain);
      lfoGain.connect(sirenOsc.frequency);
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
      sirenLfo.start();
    } catch {
      ctx = null;
      return false;
    }
    return true;
  }

  function blip(freq, dur, type, vol, slideTo) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    gain.gain.setValueAtTime(vol || 0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  function noiseBurst(dur, vol, filterFreq) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const len = Math.floor(ctx.sampleRate * dur);
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq || 1200;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol || 0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start(t);
  }

  function startMusic() {
    if (!ctx || musicTimer !== null) return;
    musicTimer = window.setInterval(() => {
      if (!ctx || ctx.state !== 'running') return;
      const note = BASS[musicStep % BASS.length];
      if (note > 0) blip(note, 0.24, 'triangle', 0.16);
      if (HAT[musicStep % HAT.length]) noiseBurst(0.05, 0.05, 6000);
      musicStep += 1;
    }, MUSIC_STEP_MS);
  }

  return {
    /** Call from a user gesture; starts the context and the music loop. */
    unlock() {
      if (!ensure()) return;
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      startMusic();
    },
    setMuted(value) {
      muted = value;
      if (master) master.gain.value = muted ? 0 : MASTER_VOLUME;
    },
    isMuted() {
      return muted;
    },
    /** Silence the continuous sounds (engine + siren) at once, e.g. on BUSTED. */
    silence() {
      if (!ctx) return;
      engineGain.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
      sirenGain.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
    },
    /** Engine hum follows driving: speed 0..40, on = in a car. */
    setEngine(speed, on) {
      if (!ctx) return;
      const t = ctx.currentTime;
      engineGain.gain.setTargetAtTime(on ? 0.05 + Math.min(0.09, speed * 0.002) : 0, t, 0.1);
      engineOsc.frequency.setTargetAtTime(48 + speed * 3.2, t, 0.08);
      engineFilter.frequency.setTargetAtTime(280 + speed * 22, t, 0.1);
    },
    setSiren(on) {
      if (!ctx) return;
      sirenGain.gain.setTargetAtTime(on ? 0.045 : 0, ctx.currentTime, 0.2);
    },
    gunshot() {
      noiseBurst(0.16, 0.5, 900);
      blip(160, 0.1, 'square', 0.18, 60);
    },
    punch() {
      noiseBurst(0.08, 0.25, 500);
      blip(90, 0.12, 'sine', 0.3, 45);
    },
    crash() {
      noiseBurst(0.35, 0.5, 700);
    },
    explosion() {
      noiseBurst(0.8, 0.6, 400);
      blip(70, 0.7, 'sine', 0.4, 30);
    },
    pickup() {
      blip(880, 0.09, 'sine', 0.22);
      window.setTimeout(() => blip(1318, 0.14, 'sine', 0.22), 90);
    },
    cash() {
      blip(1046, 0.08, 'triangle', 0.2);
      window.setTimeout(() => blip(1568, 0.16, 'triangle', 0.2), 80);
    },
    missionComplete() {
      [523, 659, 784, 1046].forEach((freq, i) => {
        window.setTimeout(() => blip(freq, 0.22, 'triangle', 0.24), i * 110);
      });
    },
    denied() {
      blip(220, 0.15, 'square', 0.15, 180);
    },
  };
}
