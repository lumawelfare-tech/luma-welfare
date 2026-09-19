import { useCallback, useEffect, useRef, useState } from 'react'
import { api, ApiError } from '../lib/api'
import { supabase } from '../lib/supabase'

export type PaymentUiStatus = 'pending' | 'success' | 'failed' | 'expired'

export function mapPaymentUiStatus(status: string, createdAt?: string | null): PaymentUiStatus {
  if (status === 'Completed') return 'success'
  if (status === 'Failed' || status === 'Cancelled' || status === 'Reversed') return 'failed'
  if (status === 'Timeout') return 'expired'
  if (status === 'Pending' || status === 'Processing') {
    if (createdAt) {
      const ageMs = Date.now() - new Date(createdAt).getTime()
      if (ageMs > 15 * 60 * 1000) return 'expired'
    }
    return 'pending'
  }
  return 'pending'
}

type TrackState = 'idle' | 'waiting' | 'success' | 'failed' | 'expired'

/**
 * Tracks an in-flight M-Pesa payment via Supabase Realtime + timeout fallback.
 * Does not alter initiate/callback server logic.
 */
export function usePaymentTracker(paymentId: string | null) {
  const [state, setState] = useState<TrackState>(paymentId ? 'waiting' : 'idle')
  const [receipt, setReceipt] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!paymentId) {
      setState('idle')
      return
    }

    setState('waiting')
    setReceipt(null)
    setMessage('Waiting for M-Pesa confirmation…')

    const channel = supabase
      .channel(`payment-${paymentId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'payments',
          filter: `id=eq.${paymentId}`,
        },
        (payload) => {
          const row = payload.new as { status?: string; mpesa_receipt?: string | null; created_at?: string }
          const ui = mapPaymentUiStatus(row.status ?? 'Pending', row.created_at)
          if (ui === 'success') {
            setState('success')
            setReceipt(row.mpesa_receipt ?? null)
            setMessage('Payment confirmed.')
          } else if (ui === 'failed') {
            setState('failed')
            setMessage('Payment failed. You can try again.')
          } else if (ui === 'expired') {
            setState('expired')
            setMessage('Payment expired. Please try again.')
          }
        },
      )
      .subscribe()

    timeoutRef.current = setTimeout(() => {
      setState((prev) => {
        if (prev === 'waiting') {
          setMessage('Payment timed out. Please try again.')
          return 'expired'
        }
        return prev
      })
    }, 5 * 60 * 1000)

    return () => {
      supabase.removeChannel(channel)
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [paymentId])

  return { state, receipt, message }
}

export async function initiateContributionPayment(opts: {
  subscriptionId: string
  phone?: string
}): Promise<{ paymentId: string; status: string; message?: string }> {
  const idempotencyKey = crypto.randomUUID()
  try {
    const d = await api<{
      paymentId?: string
      checkoutRequestId?: string
      status?: string
      message?: string
      code?: string
    }>('/payments/initiate', {
      method: 'POST',
      auth: true,
      body: {
        subscriptionId: opts.subscriptionId,
        phone: opts.phone,
        idempotencyKey,
      },
    })
    return {
      paymentId: d.paymentId ?? '',
      status: d.status ?? 'pending',
      message: d.message,
    }
  } catch (e) {
    if (e instanceof ApiError && e.code === 'PAYMENTS_DISABLED') {
      throw e
    }
    if (e instanceof ApiError && e.code === 'PAYMENT_IN_PROGRESS') {
      throw e
    }
    throw e
  }
}

export function usePendingPaymentGuard(hasPending: boolean) {
  const [blocked, setBlocked] = useState(hasPending)
  useEffect(() => {
    setBlocked(hasPending)
  }, [hasPending])
  const clear = useCallback(() => setBlocked(false), [])
  return { blocked, setBlocked, clear }
}
