// Solmar's sound: everything is synthesized with WebAudio, no audio files.
// Engine hum, police sirens, gunshots, pickup blips, a mission jingle and a
// small sunny music loop. The context is created lazily on the first user
// gesture (browsers forbid sound before one), and every call is a no-op
// until then, so the title screen and the screenshot scenes stay silent.

export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let engineFilter = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenLfo = null;
  let musicTimer = null;
  let musicStep = 0;
  let muted = false;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
      return true;
    } catch {
      return false;
    }
  }

  function noiseBuffer(seconds) {
    const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  function blip(freq, dur, type, vol, when = 0) {
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  function noiseHit(dur, filterFreq, vol, when = 0) {
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(dur + 0.05);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  /** Continuous engine hum. speed01 is 0..1; 0 silences it. */
  function engine(speed01, on) {
    if (!ctx) return;
    if (!on || speed01 <= 0.01) {
      if (engineGain) engineGain.gain.setTargetAtTime(0, ctx.currentTime, 0.08);
      return;
    }
    if (!engineOsc) {
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 700;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
    }
    const freq = 55 + speed01 * 130;
    engineOsc.frequency.setTargetAtTime(freq, ctx.currentTime, 0.06);
    engineFilter.frequency.setTargetAtTime(500 + speed01 * 1400, ctx.currentTime, 0.08);
    engineGain.gain.setTargetAtTime(0.05 + speed01 * 0.06, ctx.currentTime, 0.08);
  }

  /** Two-tone police wail while any police car is close. */
  function siren(on) {
    if (!ctx) return;
    if (!on) {
      if (sirenGain) sirenGain.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
      return;
    }
    if (!sirenOsc) {
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'triangle';
      sirenOsc.frequency.value = 720;
      sirenLfo = ctx.createOscillator();
      sirenLfo.type = 'square';
      sirenLfo.frequency.value = 0.7;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 190;
      sirenLfo.connect(lfoGain);
      lfoGain.connect(sirenOsc.frequency);
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
      sirenLfo.start();
    }
    sirenGain.gain.setTargetAtTime(0.035, ctx.currentTime, 0.1);
  }

  function shot() {
    noiseHit(0.14, 2400, 0.5);
    blip(160, 0.09, 'square', 0.22);
  }

  function punch() {
    noiseHit(0.08, 900, 0.3);
  }

  function crash() {
    noiseHit(0.3, 500, 0.5);
    blip(70, 0.25, 'sine', 0.4);
  }

  function pickup() {
    blip(660, 0.09, 'sine', 0.3);
    blip(990, 0.14, 'sine', 0.3, 0.08);
  }

  function jingle() {
    const notes = [523, 659, 784, 1046];
    for (let i = 0; i < notes.length; i += 1) blip(notes[i], 0.22, 'triangle', 0.28, i * 0.11);
  }

  function denied() {
    blip(180, 0.16, 'square', 0.2);
  }

  // A sunny loop: Am – F – C – G, one bar each, bass on the beat, a soft
  // pluck on the off-beats and a hat tick. 112 bpm, eighth-note steps.
  const BASS = [110, 87.31, 130.81, 98];
  const CHORDS = [
    [220, 261.63, 329.63],
    [174.61, 220, 261.63],
    [196, 246.94, 293.66],
    [164.81, 196, 246.94],
  ];

  function music(on) {
    if (!ctx) return;
    if (!on) {
      if (musicTimer) {
        clearInterval(musicTimer);
        musicTimer = null;
      }
      return;
    }
    if (musicTimer) return;
    const stepDur = 60 / 112 / 2;
    musicTimer = setInterval(() => {
      if (!ctx || muted) return;
      const bar = Math.floor(musicStep / 8) % 4;
      const step = musicStep % 8;
      if (step === 0 || step === 4) blip(BASS[bar], 0.3, 'triangle', 0.2);
      if (step % 2 === 1) {
        const chord = CHORDS[bar];
        blip(chord[step % 3], 0.18, 'sine', 0.09);
      }
      if (step % 2 === 0) noiseHit(0.03, 6000, 0.05);
      musicStep += 1;
    }, stepDur * 1000);
  }

  function setMuted(m) {
    muted = m;
    if (master) master.gain.value = muted ? 0 : 0.5;
  }

  return { ensure, engine, siren, shot, punch, crash, pickup, jingle, denied, music, setMuted };
}
