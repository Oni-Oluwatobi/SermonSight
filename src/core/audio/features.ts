/**
 * Audio frame feature extraction (self-contained copy used inside the
 * AudioWorklet — worklet modules cannot import bundled modules reliably).
 * Mirrors FrameFeatures in shared/ipc.
 */

export interface WorkletFeatures {
  t: number
  rms: number
  db: number
  zcr: number
  centroid: number
  flatness: number
  flux: number
  voiced: number
}

const WINDOW = 512

/** In-place iterative radix-2 FFT. re/im length must be a power of two. */
function fft(re: Float32Array, im: Float32Array): void {
  const n = re.length
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      const tr = re[i]
      re[i] = re[j]
      re[j] = tr
      const ti = im[i]
      im[i] = im[j]
      im[j] = ti
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len
    const wr = Math.cos(ang)
    const wi = Math.sin(ang)
    for (let i = 0; i < n; i += len) {
      let cr = 1
      let ci = 0
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k]
        const ui = im[i + k]
        const vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci
        const vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr
        re[i + k] = ur + vr
        im[i + k] = ui + vi
        re[i + k + len / 2] = ur - vr
        im[i + k + len / 2] = ui - vi
        const ncr = cr * wr - ci * wi
        ci = cr * wi + ci * wr
        cr = ncr
      }
    }
  }
}

export function computeFeatures(samples: Float32Array, sampleRate: number, timeMs: number): WorkletFeatures {
  const n = samples.length || 1
  let sum = 0
  let zc = 0
  for (let i = 0; i < samples.length; i++) {
    sum += samples[i] * samples[i]
    if (i > 0 && (samples[i] >= 0) !== (samples[i - 1] >= 0)) zc++
  }
  const rms = Math.sqrt(sum / n)
  const db = 20 * Math.log10(Math.max(rms, 1e-7))
  const zcr = zc / n

  // spectral features on a Hann-windowed frame (zero-padded to WINDOW)
  const re = new Float32Array(WINDOW)
  const im = new Float32Array(WINDOW)
  const len = Math.min(samples.length, WINDOW)
  for (let i = 0; i < len; i++) {
    const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (len - 1 || 1))
    re[i] = samples[i] * w
  }
  fft(re, im)

  const bins = WINDOW / 2
  let magSum = 0
  let weighted = 0
  let logSum = 0
  let nonzero = 0
  const mags = new Float32Array(bins)
  for (let k = 1; k < bins; k++) {
    const m = Math.hypot(re[k], im[k])
    mags[k] = m
    magSum += m
    weighted += m * k
    if (m > 1e-8) {
      logSum += Math.log(m)
      nonzero++
    }
  }
  const centroid = magSum > 1e-9 ? (weighted / magSum) * (sampleRate / WINDOW) : 0
  const flatness =
    nonzero > 0 && magSum > 1e-9 ? Math.exp(logSum / nonzero) / (magSum / Math.max(nonzero, 1)) : 1

  return {
    t: timeMs,
    rms,
    db,
    zcr,
    centroid,
    flatness: Math.min(Math.max(flatness, 0), 1),
    flux: 0,
    voiced: zcr < 0.25 && rms > 1e-4 ? 1 : 0
  }
}
