interface ForfeitScreenProps {
  forfeitBy: { name: string; avatar: string }
}

export function ForfeitScreen({ forfeitBy }: ForfeitScreenProps) {
  return (
    <div className="glitch-game">
      <div className="w-full max-w-[520px] px-4 py-6 text-center">
        <div className="text-6xl mb-4">{forfeitBy.avatar}</div>
        <h1 className="text-2xl font-bold text-white mb-2">{forfeitBy.name} gave up!</h1>
        <p className="text-glitch-muted">Returning to home...</p>
      </div>
    </div>
  )
}
