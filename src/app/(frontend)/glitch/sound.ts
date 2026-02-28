import { zzfxPlay, type ZzfxParams } from './zzfx'

let audioCtx: AudioContext | null = null
let listenerAdded = false

function getAudioCtx(): AudioContext {
  if (!audioCtx || audioCtx.state === 'closed') {
    audioCtx = new AudioContext()
    // Browsers suspend AudioContext until a user gesture. Register a one-time
    // listener so any click/tap/keypress unlocks audio for sounds triggered by
    // non-interactive events (e.g. playerJoined, challenge).
    if (typeof document !== 'undefined' && !listenerAdded) {
      listenerAdded = true
      const unlock = () => {
        if (audioCtx?.state === 'suspended') audioCtx.resume()
        document.removeEventListener('click', unlock)
        document.removeEventListener('touchstart', unlock)
        document.removeEventListener('keydown', unlock)
      }
      document.addEventListener('click', unlock)
      document.addEventListener('touchstart', unlock)
      document.addEventListener('keydown', unlock)
    }
  }
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
// Each sound is an array of { delay (ms), sound (ZzfxParams) } for sequenced playback.
type SoundStep = { delay: number; sound: ZzfxParams }
// prettier-ignore
const sounds = {
  correct:       [{ delay: 0, sound: [2,,378,.01,.14,.08,,1.9,-20,-45,,,,,,,.13,.51,.05] as ZzfxParams }],
  wrong:         [{ delay: 0, sound: [1.1,,94,.01,,.26,2,1.2,,,-25,.01,,,0.7,,.22,.96,.06,,-627] as ZzfxParams }],
  timeout:       [{ delay: 0, sound: [.4,,97,.05,.22,.23,5,.8214,,-1,,,,.5,,.2,,.31,.15,,663] as ZzfxParams }],
  bonus:         [{ delay: 0, sound: [1.5,,523,.01,.1,.3,1,1.5,,,880,.05,.1,,,,,.5] as ZzfxParams }],
  gameOver:      [{ delay: 0, sound: [2.1,0,130.8128,.01,.82,.31,2,2.7,,,,,,.4,,,.06,.41,.12] as ZzfxParams }],
  countdown3:    [{ delay: 0, sound: [1,,330,.01,.01,.1,1,1.2,,,,,,,,,,.5] as ZzfxParams }],
  countdown2:    [{ delay: 0, sound: [1,,440,.01,.01,.1,1,1.2,,,,,,,,,,.5] as ZzfxParams }],
  countdown1:    [{ delay: 0, sound: [1,,554,.01,.01,.15,1,1.2,,,,,,,,,,.5] as ZzfxParams }],
  playerJoined:  [{ delay: 0, sound: [.8,,284,.02,.19,.13,1,2.9,21,,,,,,56,,,.68,.3,,486] as ZzfxParams }],
  challenge:     [{ delay: 0, sound: [,,75,.01,.08,.18,3,.7,7,12,,,,.2,,.1,.18,.47,.07,,-1548] as ZzfxParams }],
  youWin:        [
    { delay: 0,   sound: [2,.1,925,,.07,2,,4.1,,,,,.9,,2,.1] as ZzfxParams },
    { delay: 300, sound: [1.5,0,523,.02,.2,.5,,.8,,,,,.1,,,.1] as ZzfxParams },
    { delay: 650, sound: [1.2,0,659,.02,.25,.6,,.7,,,,,.12,,,.1] as ZzfxParams },
    { delay: 1000, sound: [1.8,0,783,.05,.3,.9,,1.2,,,,,.15,,,.05] as ZzfxParams },
  ],
} as const satisfies Record<string, readonly SoundStep[]>

// Eagerly create the AudioContext so the unlock listener is registered
// before any sound needs to play.
if (typeof document !== 'undefined') getAudioCtx()

export type SoundEffect = keyof typeof sounds

export function playSound(name: SoundEffect) {
  const ctx = getAudioCtx()
  if (ctx.state === 'suspended') ctx.resume()
  const steps = sounds[name]
  for (const step of steps) {
    if (step.delay === 0) {
      zzfxPlay(ctx, [...step.sound])
    } else {
      setTimeout(() => zzfxPlay(ctx, [...step.sound]), step.delay)
    }
  }
}
