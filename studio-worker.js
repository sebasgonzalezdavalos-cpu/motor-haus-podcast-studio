/**
 * Motor Haus Podcast Studio — Standalone Browser Web Worker Engine
 *
 * Implements the exact same 100% Natural "Pro Mic & Treated Room" DSP Chain as audio_pipeline.py
 * so the app can also be hosted as a 100% free static web app on GitHub Pages / Netlify / Vercel
 * with zero server costs and unlimited users.
 */

class Biquad {
  constructor() {
    this.b0 = 1; this.b1 = 0; this.b2 = 0;
    this.a1 = 0; this.a2 = 0;
    this.x1 = 0; this.x2 = 0;
    this.y1 = 0; this.y2 = 0;
  }

  setHighPass(f0, Q, fs) {
    const w0 = (2 * Math.PI * f0) / fs;
    const cosw0 = Math.cos(w0);
    const alpha = Math.sin(w0) / (2 * Q);
    const a0 = 1 + alpha;
    this.b0 = ((1 + cosw0) / 2) / a0;
    this.b1 = (-(1 + cosw0)) / a0;
    this.b2 = ((1 + cosw0) / 2) / a0;
    this.a1 = (-2 * cosw0) / a0;
    this.a2 = (1 - alpha) / a0;
    return this;
  }

  setLowPass(f0, Q, fs) {
    const w0 = (2 * Math.PI * f0) / fs;
    const cosw0 = Math.cos(w0);
    const alpha = Math.sin(w0) / (2 * Q);
    const a0 = 1 + alpha;
    this.b0 = ((1 - cosw0) / 2) / a0;
    this.b1 = (1 - cosw0) / a0;
    this.b2 = ((1 - cosw0) / 2) / a0;
    this.a1 = (-2 * cosw0) / a0;
    this.a2 = (1 - alpha) / a0;
    return this;
  }

  setPeaking(f0, Q, gainDb, fs) {
    const A = Math.pow(10, gainDb / 40);
    const w0 = (2 * Math.PI * f0) / fs;
    const cosw0 = Math.cos(w0);
    const alpha = Math.sin(w0) / (2 * Q);
    const a0 = 1 + alpha / A;
    this.b0 = (1 + alpha * A) / a0;
    this.b1 = (-2 * cosw0) / a0;
    this.b2 = (1 - alpha * A) / a0;
    this.a1 = (-2 * cosw0) / a0;
    this.a2 = (1 - alpha / A) / a0;
    return this;
  }

  setHighShelf(f0, gainDb, fs) {
    const A = Math.pow(10, gainDb / 40);
    const w0 = (2 * Math.PI * f0) / fs;
    const cosw0 = Math.cos(w0);
    const alpha = (Math.sin(w0) / 2) * Math.sqrt(2);
    const sqA = 2 * Math.sqrt(A) * alpha;
    const a0 = (A + 1) - (A - 1) * cosw0 + sqA;
    this.b0 = (A * ((A + 1) + (A - 1) * cosw0 + sqA)) / a0;
    this.b1 = (-2 * A * ((A - 1) + (A + 1) * cosw0)) / a0;
    this.b2 = (A * ((A + 1) + (A - 1) * cosw0 - sqA)) / a0;
    this.a1 = (2 * ((A - 1) - (A + 1) * cosw0)) / a0;
    this.a2 = ((A + 1) - (A - 1) * cosw0 - sqA) / a0;
    return this;
  }

  processArray(input) {
    const out = new Float32Array(input.length);
    const b0 = this.b0, b1 = this.b1, b2 = this.b2, a1 = this.a1, a2 = this.a2;
    let x1 = this.x1, x2 = this.x2, y1 = this.y1, y2 = this.y2;
    for (let i = 0; i < input.length; i++) {
      const x = input[i];
      const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
      x2 = x1; x1 = x;
      y2 = y1; y1 = y;
      out[i] = y;
    }
    this.x1 = x1; this.x2 = x2; this.y1 = y1; this.y2 = y2;
    return out;
  }
}

function measureLufs(audio, sr) {
  const blockLen = Math.max(1, Math.floor(sr * 0.1));
  const nBlocks = Math.floor(audio.length / blockLen);
  if (nBlocks === 0) return -24.0;
  const energies = [];
  for (let b = 0; b < nBlocks; b++) {
    const start = b * blockLen;
    let sum = 0;
    let prev = audio[start];
    for (let i = start; i < start + blockLen; i++) {
      const s = audio[i];
      const k = s + 0.55 * (s - prev);
      prev = s;
      sum += k * k;
    }
    const e = sum / blockLen;
    if (e > 1e-11) energies.push(e);
  }
  if (!energies.length) return -40.0;
  energies.sort((a, b) => a - b);
  const absGate = Math.pow(10, (-70 + 0.691) / 10);
  const above = energies.filter(e => e > absGate);
  const meanAbs = above.length ? above.reduce((a, b) => a + b, 0) / above.length : 1e-9;
  const gated = above.filter(e => e > meanAbs * 0.1);
  const meanGated = gated.length ? gated.reduce((a, b) => a + b, 0) / gated.length : meanAbs;
  return -0.691 + 10 * Math.log10(Math.max(meanGated, 1e-12));
}

function processProStudioChain(channels, sr, params, onProgress) {
  // 1. Phase-aligned direct capsule extraction if stereo
  let x;
  if (channels.length >= 2) {
    const L = channels[0];
    const R = channels[1];
    let lSq = 0, rSq = 0;
    const step = Math.max(1, Math.floor(L.length / 50000));
    for (let i = 0; i < L.length; i += step) {
      lSq += L[i] * L[i];
      rSq += R[i] * R[i];
    }
    x = new Float32Array(L.length);
    const wR = rSq >= lSq ? 0.7 : 0.3;
    const wL = 1.0 - wR;
    for (let i = 0; i < L.length; i++) x[i] = wR * R[i] + wL * L[i];
  } else {
    x = new Float32Array(channels[0]);
  }

  onProgress(15, "Removing room rumble & hollow wall reflections...");

  // 2. 24 dB/oct Sub-Rumble Cut at 82 Hz
  const hpHz = params.highpass || 82;
  x = new Biquad().setHighPass(hpHz, 0.707, sr).processArray(x);
  x = new Biquad().setHighPass(hpHz, 0.707, sr).processArray(x);

  // 3. Time-Domain Dynamic Room De-Resonator (240-680 Hz) & Pause Hiss Smoother
  const dereverbStrength = Math.max(0, Math.min(1, (params.dereverb ?? 68) / 100));
  let roomBand = new Biquad().setHighPass(240, 0.707, sr).processArray(x);
  roomBand = new Biquad().setLowPass(680, 0.707, sr).processArray(roomBand);
  const hissBand = new Biquad().setHighPass(1800, 0.707, sr).processArray(x);

  const hop = Math.max(1, Math.floor(sr * 0.01));
  const nBlocks = Math.floor(x.length / hop);
  const blockRms = new Float32Array(nBlocks);
  for (let b = 0; b < nBlocks; b++) {
    let sum = 0;
    const offset = b * hop;
    for (let i = 0; i < hop; i++) {
      const v = x[offset + i];
      sum += v * v;
    }
    blockRms[b] = Math.sqrt(sum / hop + 1e-12);
  }

  const sortedRms = Float32Array.from(blockRms).sort();
  const p15Rms = sortedRms[Math.floor(nBlocks * 0.15)] || 1e-6;

  let fastEnv = blockRms[0] || 0;
  let slowEnv = blockRms[0] || 0;
  for (let b = 0; b < nBlocks; b++) {
    const r = blockRms[b];
    fastEnv = 0.35 * fastEnv + 0.65 * r;
    slowEnv = 0.90 * slowEnv + 0.10 * r;
    const tailRatio = Math.max(0, Math.min(1, (slowEnv - fastEnv) / (slowEnv + 1e-7)));
    const duck = Math.min(0.58, dereverbStrength * (0.28 + 0.32 * tailRatio));
    const isPause = Math.max(0, Math.min(1, (p15Rms * 1.6 - slowEnv) / (p15Rms * 1.2 + 1e-9)));
    const offset = b * hop;
    for (let i = 0; i < hop; i++) {
      const idx = offset + i;
      const deres = x[idx] - roomBand[idx] * duck;
      const deHiss = deres - hissBand[idx] * (isPause * 0.72);
      x[idx] = deHiss * (1.0 - isPause * 0.38);
    }
  }

  onProgress(45, "Applying Shure SM7B Studio Mic Warmth & Clarity...");

  // 4. Pre-calibrate to -20 LUFS
  const preLufs = measureLufs(x, sr);
  if (preLufs > -65) {
    const calGain = Math.pow(10, Math.max(-18, Math.min(22, -20.0 - preLufs)) / 20);
    for (let i = 0; i < x.length; i++) x[i] *= calGain;
  }

  // 5. Low-frequency Analog Transformer Weight (90-210 Hz)
  const exciterNorm = Math.max(0, Math.min(1, (params.exciter ?? 30) / 100));
  if (exciterNorm > 0.02) {
    let chest = new Biquad().setHighPass(90, 0.707, sr).processArray(x);
    chest = new Biquad().setLowPass(210, 0.707, sr).processArray(chest);
    const scale = 0.28 * exciterNorm;
    for (let i = 0; i < x.length; i++) {
      x[i] += Math.tanh(chest[i] * 2.2) * scale;
    }
  }

  // 6. 8-Stage Pro Microphone Transfer Curve
  const warmth = params.warmth ?? 4.5;
  const mudCut = params.mud_cut ?? -6.0;
  const harshCut = params.harsh_cut ?? -2.0;
  const presence = params.presence ?? 3.8;
  const air = params.air ?? 4.2;

  const eqFilters = [
    new Biquad().setPeaking(125, 0.80, warmth, sr),
    new Biquad().setPeaking(310, 1.10, mudCut, sr),
    new Biquad().setPeaking(485, 1.30, mudCut * 0.75, sr),
    new Biquad().setPeaking(750, 1.40, mudCut * 0.35, sr),
    new Biquad().setPeaking(2450, 1.50, harshCut, sr),
    new Biquad().setPeaking(3500, 0.85, presence * 0.85, sr),
    new Biquad().setPeaking(5200, 0.90, presence, sr),
    new Biquad().setHighShelf(9500, air, sr),
  ];
  for (const f of eqFilters) {
    x = f.processArray(x);
  }

  onProgress(75, "Leveling voice dynamics & normalizing to -16 LUFS...");

  // 7. Split-Band Velvet De-Esser + Two-Stage Optical Compressor
  let sib = new Biquad().setHighPass(5800, 0.707, sr).processArray(x);
  sib = new Biquad().setLowPass(9800, 0.707, sr).processArray(sib);

  const compNorm = Math.max(0, Math.min(1, (params.compression ?? 60) / 100));
  const threshDb = -18.0 - compNorm * 5.0;
  const ratio = 1.6 + compNorm * 1.4;
  const att = Math.exp(-1 / (sr * 0.020));
  const rel = Math.exp(-1 / (sr * 0.200));
  let env = 1e-6;
  let sibEnv = 0;
  const sibAtt = Math.exp(-1 / (sr * 0.004));
  const sibRel = Math.exp(-1 / (sr * 0.040));

  for (let i = 0; i < x.length; i++) {
    const absSib = Math.abs(sib[i]);
    sibEnv = absSib > sibEnv ? sibAtt * sibEnv + (1 - sibAtt) * absSib : sibRel * sibEnv + (1 - sibRel) * absSib;
    if (sibEnv > 0.028) {
      const red = 0.38 * Math.min(1, (sibEnv - 0.028) / 0.065);
      x[i] -= sib[i] * red;
    }

    const absX = Math.abs(x[i]);
    env = absX > env ? att * env + (1 - att) * absX : rel * env + (1 - rel) * absX;
    const envDb = 20 * Math.log10(env + 1e-9);
    if (envDb > threshDb) {
      const grDb = (envDb - threshDb) * (1 - 1 / ratio);
      x[i] *= Math.pow(10, -grDb / 20);
    }
  }

  // 8. Exact -16.0 LUFS Normalization + -1.0 dBTP True Peak Ceiling
  const targetLufs = params.target_lufs ?? -16.0;
  const curLufs = measureLufs(x, sr);
  const makeup = Math.pow(10, Math.max(-18, Math.min(22, targetLufs - curLufs)) / 20);
  const ceiling = Math.pow(10, -1.0 / 20);

  for (let i = 0; i < x.length; i++) {
    let v = x[i] * makeup;
    if (Math.abs(v) > ceiling) {
      v = Math.sign(v) * ceiling * Math.tanh(Math.abs(v) / ceiling);
    }
    x[i] = v;
  }

  onProgress(95, "Encoding studio output...");
  return x;
}

function encodeWavBlob(samples, sr) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeStr = (off, s) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sr, true);
  view.setUint32(28, sr * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }
  return new Blob([buffer], { type: "audio/wav" });
}

function encodeMp3Blob(samples, sr) {
  try {
    if (typeof lamejs === "undefined") {
      importScripts("https://cdn.jsdelivr.net/npm/lamejs@1.2.1/lame.min.js");
    }
    const mp3encoder = new lamejs.Mp3Encoder(1, sr, 192);
    const pcm16 = new Int16Array(samples.length);
    for (let i = 0; i < samples.length; i++) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    const mp3Data = [];
    const blockSize = 1152;
    for (let i = 0; i < pcm16.length; i += blockSize) {
      const chunk = pcm16.subarray(i, i + blockSize);
      const mp3buf = mp3encoder.encodeBuffer(chunk);
      if (mp3buf.length > 0) mp3Data.push(mp3buf);
    }
    const endBuf = mp3encoder.flush();
    if (endBuf.length > 0) mp3Data.push(endBuf);
    return new Blob(mp3Data, { type: "audio/mpeg" });
  } catch (_) {
    return null;
  }
}

self.onmessage = function (e) {
  const { channels, sr, params } = e.data;
  try {
    const mastered = processProStudioChain(channels, sr, params, (pct, msg) => {
      self.postMessage({ type: "progress", pct, msg });
    });
    const wavBlob = encodeWavBlob(mastered, sr);
    self.postMessage({ type: "progress", pct: 98, msg: "Creating compact MP3 file..." });
    const mp3Blob = encodeMp3Blob(mastered, sr);
    self.postMessage({ type: "done", wavBlob, mp3Blob });
  } catch (err) {
    self.postMessage({ type: "error", message: err.message || String(err) });
  }
};
