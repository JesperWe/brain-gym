// ZzFX v1.3.2 - Zuper Zmall Zound Zynth by Frank Force
// https://github.com/KilledByAPixel/ZzFX - MIT License
// Inlined to avoid SSR AudioContext issue from the zzfx npm package.

export type ZzfxParams = (number | undefined)[]

export function zzfxPlay(ctx: AudioContext, params: ZzfxParams) {
  const sampleRate = 44100
  const PI2 = Math.PI * 2
  const abs = Math.abs
  const sign = (v: number) => (v < 0 ? -1 : 1)

  let [
    volume = 1,
    randomness = 0.05,
    frequency = 220,
    attack = 0,
    sustain = 0,
    release = 0.1,
    shape = 0,
    shapeCurve = 1,
    slide = 0,
    deltaSlide = 0,
    pitchJump = 0,
    pitchJumpTime = 0,
    repeatTime = 0,
    noise = 0,
    modulation = 0,
    bitCrush = 0,
    delay = 0,
    sustainVolume = 1,
    decay = 0,
    tremolo = 0,
    filter = 0,
  ] = params.map((v) => v ?? undefined) as number[]

  let startSlide = (slide *= (500 * PI2) / sampleRate / sampleRate)
  let startFrequency = (frequency *=
    ((1 + randomness * 2 * Math.random() - randomness) * PI2) / sampleRate)
  let modOffset = 0
  let repeat = 0
  let crush = 0
  let jump: number = 1

  const minAttack = 9
  attack = attack * sampleRate || minAttack
  decay *= sampleRate
  sustain *= sampleRate
  release *= sampleRate
  delay *= sampleRate
  deltaSlide *= (500 * PI2) / sampleRate ** 3
  modulation *= PI2 / sampleRate
  pitchJump *= PI2 / sampleRate
  pitchJumpTime *= sampleRate
  repeatTime = (repeatTime * sampleRate) | 0

  const masterVolume = 0.3
  volume *= masterVolume

  // biquad filter
  const quality = 2
  const w = ((PI2 * abs(filter) * 2) / sampleRate)
  const cos = Math.cos(w)
  const alpha = Math.sin(w) / 2 / quality
  const a0 = 1 + alpha
  const a1 = (-2 * cos) / a0
  const a2 = (1 - alpha) / a0
  const b0 = (1 + sign(filter) * cos) / 2 / a0
  const b1 = -(sign(filter) + cos) / a0
  const b2 = b0
  let x2 = 0, x1 = 0, y2 = 0, y1 = 0

  const b: number[] = []
  let t = 0
  let i = 0
  let s = 0
  let f: number

  const length = (attack + decay + sustain + release + delay) | 0
  for (; i < length; b[i++] = s * volume) {
    if (!(++crush % ((bitCrush * 100) | 0))) {
      s = shape
        ? shape > 1
          ? shape > 2
            ? shape > 3
              ? shape > 4
                ? ((t / PI2) % 1 < shapeCurve / 2 ? 1 : -1)
                : Math.sin(t ** 3)
              : Math.max(Math.min(Math.tan(t), 1), -1)
            : 1 - ((((2 * t) / PI2) % 2) + 2) % 2
          : 1 - 4 * abs(Math.round(t / PI2) - t / PI2)
        : Math.sin(t)

      s =
        (repeatTime ? 1 - tremolo + tremolo * Math.sin((PI2 * i) / repeatTime) : 1) *
        (shape > 4 ? s : sign(s) * abs(s) ** shapeCurve) *
        (i < attack
          ? i / attack
          : i < attack + decay
            ? 1 - ((i - attack) / decay) * (1 - sustainVolume)
            : i < attack + decay + sustain
              ? sustainVolume
              : i < length - delay
                ? ((length - i - delay) / release) * sustainVolume
                : 0)

      s = delay
        ? s / 2 +
          (delay > i ? 0 : ((i < length - delay ? 1 : (length - i) / delay) * b[(i - delay) | 0]) / 2 / volume)
        : s

      if (filter) s = y1 = b2 * x2 + b1 * (x2 = x1) + b0 * (x1 = s) - a2 * y2 - a1 * (y2 = y1)
    }

    f = (frequency += slide += deltaSlide) * Math.cos(modulation * modOffset++)
    t += f + f * noise * Math.sin(i ** 5)

    if (jump && ++jump > pitchJumpTime) {
      frequency += pitchJump
      startFrequency += pitchJump
      jump = 0
    }

    if (repeatTime && !(++repeat % repeatTime)) {
      frequency = startFrequency
      slide = startSlide
      jump ||= 1
    }
  }

  // Play the generated samples
  const buffer = ctx.createBuffer(1, b.length, sampleRate)
  buffer.getChannelData(0).set(b)
  const source = ctx.createBufferSource()
  source.buffer = buffer
  const gain = ctx.createGain()
  gain.gain.value = 1
  source.connect(gain).connect(ctx.destination)
  source.start()
  return source
}
