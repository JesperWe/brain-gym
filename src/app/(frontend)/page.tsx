import Link from 'next/link'
import { Zap } from 'lucide-react'

import { Button } from '@/components/ui/button'

export default function HomePage() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-8 p-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <Zap className="size-12 text-primary" />
        <h1 className="text-4xl font-bold tracking-tight">Maths Glitch</h1>
        <p className="max-w-md text-muted-foreground">
          Test your mental maths with timed multiplication and division
          challenges. How fast can you go?
        </p>
      </div>

      <Button asChild size="lg" className="text-base">
        <Link href="/glitch">Glitch or Bonus</Link>
      </Button>
    </div>
  )
}
