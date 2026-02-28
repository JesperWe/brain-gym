let audioCtx: AudioContext | null = null;

function getAudioCtx(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  return audioCtx;
}

export function resumeAudio() {
  const ctx = getAudioCtx();
  if (ctx.state === "suspended") ctx.resume();
}

export function playTone(
  freq: number,
  duration: number,
  type: OscillatorType = "sine",
  gain = 0.6,
) {
  const ctx = getAudioCtx();
  const osc = ctx.createOscillator();
  const vol = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  vol.gain.value = gain;
  vol.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
  osc.connect(vol);
  vol.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + duration);
}

export function playCorrectSound() {
  playTone(523, 0.1, "sine", 0.5);
  setTimeout(() => playTone(659, 0.1, "sine", 0.5), 80);
  setTimeout(() => playTone(784, 0.15, "sine", 0.5), 160);
}

export function playWrongSound() {
  playTone(200, 0.15, "sawtooth", 0.4);
  setTimeout(() => playTone(150, 0.2, "sawtooth", 0.4), 120);
}

export function playTimeoutSound() {
  playTone(440, 0.12, "triangle", 0.4);
  setTimeout(() => playTone(370, 0.12, "triangle", 0.4), 120);
  setTimeout(() => playTone(311, 0.25, "triangle", 0.4), 240);
}

export function playTadaSound() {
  playTone(523, 0.12, "sine", 0.6);
  setTimeout(() => playTone(659, 0.12, "sine", 0.6), 100);
  setTimeout(() => playTone(784, 0.12, "sine", 0.6), 200);
  setTimeout(() => playTone(1047, 0.3, "sine", 0.6), 300);
  setTimeout(() => playTone(784, 0.1, "triangle", 0.3), 350);
  setTimeout(() => playTone(1047, 0.4, "sine", 0.5), 450);
}

export function playGameOverSound() {
  const notes = [523, 494, 440, 392, 440, 494, 523];
  notes.forEach((n, i) =>
    setTimeout(() => playTone(n, 0.15, "sine", 0.4), i * 120),
  );
}

export function playPlayerJoinedSound() {
  const ctx = getAudioCtx();
  const osc = ctx.createOscillator();
  const vol = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(800, ctx.currentTime);
  osc.frequency.linearRampToValueAtTime(1400, ctx.currentTime + 0.6);
  vol.gain.setValueAtTime(0.35, ctx.currentTime);
  vol.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
  osc.connect(vol);
  vol.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.8);
}

export function playChallengeSound() {
  playTone(784, 0.1, "sine", 0.4);
  setTimeout(() => playTone(988, 0.1, "sine", 0.4), 100);
  setTimeout(() => playTone(784, 0.1, "sine", 0.4), 200);
  setTimeout(() => playTone(1175, 0.15, "sine", 0.5), 300);
}
