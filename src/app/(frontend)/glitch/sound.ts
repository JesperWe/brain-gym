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
  gain = 0.3,
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
  playTone(523, 0.1, "sine", 0.25);
  setTimeout(() => playTone(659, 0.1, "sine", 0.25), 80);
  setTimeout(() => playTone(784, 0.15, "sine", 0.25), 160);
}

export function playWrongSound() {
  playTone(200, 0.15, "sawtooth", 0.2);
  setTimeout(() => playTone(150, 0.2, "sawtooth", 0.2), 120);
}

export function playTimeoutSound() {
  playTone(440, 0.12, "triangle", 0.2);
  setTimeout(() => playTone(370, 0.12, "triangle", 0.2), 120);
  setTimeout(() => playTone(311, 0.25, "triangle", 0.2), 240);
}

export function playTadaSound() {
  playTone(523, 0.12, "sine", 0.3);
  setTimeout(() => playTone(659, 0.12, "sine", 0.3), 100);
  setTimeout(() => playTone(784, 0.12, "sine", 0.3), 200);
  setTimeout(() => playTone(1047, 0.3, "sine", 0.3), 300);
  setTimeout(() => playTone(784, 0.1, "triangle", 0.15), 350);
  setTimeout(() => playTone(1047, 0.4, "sine", 0.25), 450);
}

export function playGameOverSound() {
  const notes = [523, 494, 440, 392, 440, 494, 523];
  notes.forEach((n, i) =>
    setTimeout(() => playTone(n, 0.15, "sine", 0.2), i * 120),
  );
}

export function playPlayerJoinedSound() {
  playTone(880, 0.08, "sine", 0.15);
  setTimeout(() => playTone(1047, 0.12, "sine", 0.15), 70);
}

export function playChallengeSound() {
  playTone(784, 0.1, "sine", 0.2);
  setTimeout(() => playTone(988, 0.1, "sine", 0.2), 100);
  setTimeout(() => playTone(784, 0.1, "sine", 0.2), 200);
  setTimeout(() => playTone(1175, 0.15, "sine", 0.25), 300);
}
