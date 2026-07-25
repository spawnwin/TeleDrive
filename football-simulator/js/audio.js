const SFX = (() => {
  let ctx = null;
  let crowdNode = null;
  let unlocked = false;

  function ensure() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(freq, dur, type = 'sine', gain = 0.18, glideTo = null) {
    const c = ensure();
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, c.currentTime);
    if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, c.currentTime + dur);
    g.gain.setValueAtTime(gain, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
    osc.connect(g).connect(c.destination);
    osc.start();
    osc.stop(c.currentTime + dur);
  }

  function noiseBurst(dur, gain = 0.2, filterFreq = 1200) {
    const c = ensure();
    const bufSize = c.sampleRate * dur;
    const buf = c.createBuffer(1, bufSize, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufSize);
    const src = c.createBufferSource();
    src.buffer = buf;
    const filt = c.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = filterFreq;
    const g = c.createGain();
    g.gain.value = gain;
    src.connect(filt).connect(g).connect(c.destination);
    src.start();
  }

  return {
    unlock() { if (!unlocked) { ensure(); unlocked = true; } },
    kick() { tone(180, 0.12, 'triangle', 0.22, 90); noiseBurst(0.06, 0.12, 2000); },
    pass() { tone(420, 0.08, 'sine', 0.12, 300); },
    whistle() { tone(1600, 0.35, 'square', 0.1, 1500); },
    goal() {
      [0, 0.12, 0.24].forEach((t, i) => setTimeout(() => tone(520 + i * 180, 0.28, 'sawtooth', 0.16), t * 1000));
      noiseBurst(0.6, 0.12, 3000);
    },
    ultra() { tone(220, 0.5, 'sawtooth', 0.15, 880); },
    tackle() { noiseBurst(0.15, 0.25, 500); },
    postHit() { tone(900, 0.15, 'square', 0.15, 300); },
    crowdAmbience(start) {
      const c = ensure();
      if (start && !crowdNode) {
        const bufSize = 2 * c.sampleRate;
        const buf = c.createBuffer(1, bufSize, c.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1) * 0.5;
        const src = c.createBufferSource();
        src.buffer = buf; src.loop = true;
        const filt = c.createBiquadFilter();
        filt.type = 'bandpass'; filt.frequency.value = 700; filt.Q.value = 0.6;
        const g = c.createGain();
        g.gain.value = 0.035;
        src.connect(filt).connect(g).connect(c.destination);
        src.start();
        crowdNode = { src, g };
      } else if (!start && crowdNode) {
        try { crowdNode.src.stop(); } catch (e) {}
        crowdNode = null;
      }
    }
  };
})();
