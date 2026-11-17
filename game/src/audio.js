// WebAudio-only sound: every effect and the ambient music loop are synthesized, no audio files.

const NOTE = { C: 261.63, D: 293.66, E: 329.63, F: 349.23, G: 392.0, A: 440.0, B: 493.88 };

export function createAudio() {
  let ctx = null;
  let master = null;
  let musicTimer = null;
  let engineOsc = null;
  let engineGain = null;
  let muted = false;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      return true;
    } catch {
      return false;
    }
  }

  function tone(freq, dur, type, vol, when = 0, slideTo = 0) {
    if (!ctx || muted) return;
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  function noise(dur, vol, filterFreq, when = 0) {
    if (!ctx || muted) return;
    const t0 = ctx.currentTime + when;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.value = vol;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start(t0);
  }

  // A lazy two-bar island groove: bass line + soft plucked melody, looped on a timer.
  const BASS = [NOTE.C, NOTE.C, NOTE.G, NOTE.A, NOTE.F, NOTE.F, NOTE.G, NOTE.G];
  const MELODY = [NOTE.E, NOTE.G, NOTE.A, NOTE.G, NOTE.E, NOTE.D, NOTE.E, NOTE.C];
  let bar = 0;
  function startMusic() {
    if (!ensure() || musicTimer !== null) return;
    musicTimer = window.setInterval(() => {
      if (muted || !ctx) return;
      const step = bar % 8;
      tone(BASS[step] / 2, 0.42, 'triangle', 0.16);
      if (step % 2 === 0) tone(MELODY[step] * 2, 0.3, 'sine', 0.07);
      bar += 1;
    }, 300);
  }

  function startEngine() {
    if (!ensure() || engineOsc) return;
    engineOsc = ctx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 55;
    engineGain = ctx.createGain();
    engineGain.gain.value = 0.0;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 320;
    engineOsc.connect(filter);
    filter.connect(engineGain);
    engineGain.connect(master);
    engineOsc.start();
  }

  return {
    unlock() { if (ensure() && ctx.state === 'suspended') ctx.resume(); startMusic(); },
    setEngine(rpm01) {
      if (!ctx || !engineOsc) return;
      engineGain.gain.setTargetAtTime(muted ? 0 : 0.02 + rpm01 * 0.05, ctx.currentTime, 0.1);
      engineOsc.frequency.setTargetAtTime(50 + rpm01 * 130, ctx.currentTime, 0.1);
    },
    stopEngine() { if (engineGain) engineGain.gain.setTargetAtTime(0, ctx.currentTime, 0.1); },
    shoot() { noise(0.12, 0.5, 2400); tone(190, 0.09, 'square', 0.22, 0, 60); },
    punch() { noise(0.08, 0.35, 900); },
    crash() { noise(0.3, 0.6, 500); tone(90, 0.25, 'sine', 0.4, 0, 40); },
    pickup() { tone(660, 0.1, 'sine', 0.25); tone(990, 0.16, 'sine', 0.25, 0.08); },
    cash() { tone(880, 0.09, 'triangle', 0.25); tone(1174, 0.09, 'triangle', 0.25, 0.08); tone(1568, 0.22, 'triangle', 0.28, 0.16); },
    siren() { tone(700, 0.5, 'sine', 0.12, 0, 950); tone(950, 0.5, 'sine', 0.12, 0.5, 700); },
    busted() { tone(392, 0.25, 'square', 0.2); tone(311, 0.25, 'square', 0.2, 0.22); tone(233, 0.5, 'square', 0.22, 0.44); },
    wasted() { tone(220, 0.4, 'sawtooth', 0.25, 0, 110); tone(165, 0.7, 'sawtooth', 0.25, 0.35, 55); },
    click() { tone(1200, 0.04, 'square', 0.12); },
    denied() { tone(180, 0.15, 'square', 0.2); },
    engineStart() { if (ensure()) { startEngine(); tone(60, 0.4, 'sawtooth', 0.15, 0, 120); } },
    toggleMute() { muted = !muted; if (master) master.gain.value = muted ? 0 : 0.5; return muted; },
  };
}
