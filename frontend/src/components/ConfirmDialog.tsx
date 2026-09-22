import { useEffect, useRef } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Icon } from './Icon'
import { lumaModal } from '../lib/lumaMotion'
import { useFocusTrap } from '../hooks/useFocusTrap'

type ConfirmDialogProps = {
  open: boolean
  title: string
  message: string | React.ReactNode
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'danger' | 'warning' | 'primary'
  loading?: boolean
  /** When true, Confirm stays disabled (e.g. typed confirmation not met). */
  confirmDisabled?: boolean
  onConfirm: () => void
  onCancel: () => void
}

const variantStyles = {
  danger: {
    icon: 'warning',
    iconBg: 'bg-red-100',
    iconColor: 'text-red-600',
    confirmBg: 'bg-red-600 hover:bg-red-700',
  },
  warning: {
    icon: 'warning',
    iconBg: 'bg-amber-100',
    iconColor: 'text-amber-600',
    confirmBg: 'bg-amber-600 hover:bg-amber-700',
  },
  primary: {
    icon: 'check-circle',
    iconBg: 'bg-luma-100',
    iconColor: 'text-luma-600',
    confirmBg: 'bg-luma-700 hover:bg-luma-800',
  },
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  loading = false,
  confirmDisabled = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const reduceMotion = useReducedMotion()
  useFocusTrap(panelRef, open)

  useEffect(() => {
    if (open) {
      setTimeout(() => cancelRef.current?.focus(), 50)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, onCancel])

  const v = variantStyles[variant]

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-[2px]"
          role="presentation"
          initial={reduceMotion ? false : lumaModal.backdrop.initial}
          animate={lumaModal.backdrop.animate}
          exit={reduceMotion ? undefined : lumaModal.backdrop.exit}
          transition={lumaModal.backdrop.transition(Boolean(reduceMotion))}
          onClick={onCancel}
        >
          <motion.div
            ref={panelRef}
            className="glass-modal w-full max-w-md"
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            onClick={(e) => e.stopPropagation()}
            initial={reduceMotion ? false : lumaModal.panel.initial}
            animate={lumaModal.panel.animate}
            exit={reduceMotion ? undefined : lumaModal.panel.exit}
            transition={lumaModal.panel.transition(Boolean(reduceMotion))}
          >
            <div className="px-6 py-5">
              <div className="flex items-start gap-3">
                <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full ${v.iconBg}`}>
                  <Icon name={v.icon} className={`h-5 w-5 ${v.iconColor}`} aria-hidden="true" />
                </div>
                <div className="flex-1">
                  <h3 id="confirm-title" className="text-lg font-semibold text-gray-900">{title}</h3>
                  <div className="mt-1 text-sm text-gray-600">{message}</div>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-white/50 px-6 py-4">
              <button
                ref={cancelRef}
                type="button"
                onClick={onCancel}
                disabled={loading}
                className="rounded-lg border border-white/60 bg-white/50 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-white/80 disabled:opacity-50 transition-colors"
              >
                {cancelLabel}
              </button>
              <button
                type="button"
                onClick={onConfirm}
                disabled={loading || confirmDisabled}
                className={`rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${v.confirmBg}`}
              >
                {loading ? 'Processing…' : confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
