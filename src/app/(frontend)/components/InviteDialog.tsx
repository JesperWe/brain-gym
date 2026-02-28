'use client'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'

interface InviteDialogProps {
  open: boolean
  fromName: string
  fromAvatar: string
  duration: number
  onAccept: () => void
  onDeny: () => void
}

export function InviteDialog({ open, fromName, fromAvatar, duration, onAccept, onDeny }: InviteDialogProps) {
  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        className="sm:max-w-sm border-glass-15 bg-glitch-bg-dark text-glitch-text"
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="text-white text-center">Challenge!</DialogTitle>
          <DialogDescription className="text-glitch-muted text-center">
            You&apos;ve been challenged to a match
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-3 py-4">
          <span className="text-5xl">{fromAvatar}</span>
          <span className="text-xl font-bold text-white">{fromName}</span>
          <span className="text-glitch-label">
            {duration} minute{duration > 1 ? 's' : ''} match
          </span>
        </div>

        <DialogFooter className="flex-row gap-3 sm:justify-center">
          <button
            className="flex-1 px-6 py-2.5 border-2 border-glitch-error rounded-xl bg-transparent text-glitch-error text-base font-bold cursor-pointer transition-all hover:bg-glitch-error/20"
            onClick={onDeny}
          >
            Deny
          </button>
          <button
            className="flex-1 px-6 py-2.5 border-none rounded-xl bg-linear-to-br from-glitch-accent-bold to-glitch-accent-purple text-white text-base font-bold cursor-pointer transition-all hover:translate-y-[-1px] hover:shadow-[0_4px_16px_rgba(99,102,241,0.4)]"
            onClick={onAccept}
          >
            Accept
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
