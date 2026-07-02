'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

export default function PaymentCallbackPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [status, setStatus] = useState('Processing your payment...')

  useEffect(() => {
    const reference = searchParams.get('reference')
    if (!reference) {
      setStatus('No payment reference found.')
      return
    }

    // Verify the payment
    fetch(`/api/payments/verify/${reference}`, { credentials: 'include' })
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          setStatus('Payment successful! Redirecting...')
          setTimeout(() => router.push('/dashboard/student/courses'), 2000)
        } else {
          setStatus('Payment verification failed. Please contact support.')
        }
      })
      .catch(() => setStatus('Error verifying payment. Please try again.'))
  }, [searchParams, router])

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
        <p className="text-lg font-medium text-gray-700">{status}</p>
      </div>
    </div>
  )
}