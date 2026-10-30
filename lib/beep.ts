// Short beeps so the person scanning knows it worked without looking at the screen.

let audio: AudioContext | null = null

export function beep(kind: "ok" | "out" | "error" = "ok") {
  try {
    audio ??= new AudioContext()
    const osc = audio.createOscillator()
    const gain = audio.createGain()
    const length = kind === "error" ? 0.35 : 0.12
    osc.type = kind === "error" ? "square" : "sine"
    osc.frequency.value = kind === "error" ? 220 : kind === "out" ? 660 : 990
    gain.gain.setValueAtTime(0.08, audio.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + length)
    osc.connect(gain).connect(audio.destination)
    osc.start()
    osc.stop(audio.currentTime + length)
  } catch {
    // Sound is a nice-to-have.
  }
}
