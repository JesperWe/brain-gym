import { zzfxPlay, type ZzfxParams } from './zzfx'

let audioCtx: AudioContext | null = null

function getAudioCtx(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext()
  return audioCtx
}

export function resumeAudio() {
  const ctx = getAudioCtx()
  if (ctx.state === 'suspended') ctx.resume()
}

// Sound effect definitions — designed with https://killedbyapixel.github.io/ZzFX/
// Params: [volume, randomness, frequency, attack, sustain, release, shape, shapeCurve,
//   slide, deltaSlide, pitchJump, pitchJumpTime, repeatTime, noise, modulation,
//   bitCrush, delay, sustainVolume, decay, tremolo, filter]
// prettier-ignore
const sounds = {
  correct:       [2,,378,.01,.14,.08,,1.9,-20,-45,,,,,,,.13,.51,.05] as ZzfxParams,
  wrong:         [1.1,,94,.01,,.26,2,1.2,,,-25,.01,,,0.7,,.22,.96,.06,,-627] as ZzfxParams,
  timeout:       [.4,,97,.05,.22,.23,5,.8214,,-1,,,,.5,,.2,,.31,.15,,663] as ZzfxParams,
  bonus:         [1.5,,523,.01,.1,.3,1,1.5,,,880,.05,.1,,,,,.5] as ZzfxParams,
  gameOver:      [2.1,0,130.8128,.01,.82,.31,2,2.7,,,,,,.4,,,.06,.41,.12] as ZzfxParams,
  countdown3:    [1,,330,.01,.01,.1,1,1.2,,,,,,,,,,.5] as ZzfxParams,
  countdown2:    [1,,440,.01,.01,.1,1,1.2,,,,,,,,,,.5] as ZzfxParams,
  countdown1:    [1,,554,.01,.01,.15,1,1.2,,,,,,,,,,.5] as ZzfxParams,
  playerJoined:  [.8,,284,.02,.19,.13,1,2.9,21,,,,,,56,,,.68,.3,,486] as ZzfxParams,
  challenge:     [,,75,.01,.08,.18,3,.7,7,12,,,,.2,,.1,.18,.47,.07,,-1548] as ZzfxParams,
} as const

export type SoundEffect = keyof typeof sounds

export function playSound(name: SoundEffect) {
  zzfxPlay(getAudioCtx(), [...sounds[name]])
}
