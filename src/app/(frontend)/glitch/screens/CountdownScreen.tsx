interface CountdownScreenProps {
  countdownValue: number
}

export function CountdownScreen({ countdownValue }: CountdownScreenProps) {
  return (
    <div className="glitch-game">
      <div
        className="w-full min-w-[500px] max-w-[520px] px-4 py-6 countdown-screen"
        key={countdownValue}
      >
        <div className="countdown-number">{countdownValue}</div>
      </div>
    </div>
  )
}
