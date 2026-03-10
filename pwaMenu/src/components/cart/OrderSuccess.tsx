import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

interface OrderSuccessProps {
  orderId: string | null
}

/**
 * PWAM-010: Order success confirmation with animation
 * Shows animated checkmark and order details
 */
export default function OrderSuccess({ orderId }: OrderSuccessProps) {
  const { t } = useTranslation()
  const displayId = orderId?.slice(-6).toUpperCase() ?? '------'
  const [showCheck, setShowCheck] = useState(false)
  const [showText, setShowText] = useState(false)

  // Staggered animation for better visual feedback
  useEffect(() => {
    const checkTimer = setTimeout(() => setShowCheck(true), 100)
    const textTimer = setTimeout(() => setShowText(true), 400)

    return () => {
      clearTimeout(checkTimer)
      clearTimeout(textTimer)
    }
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-dark-bg px-4">
      {/* Animated checkmark circle */}
      <div
        className={`w-24 h-24 rounded-full bg-green-500/20 flex items-center justify-center mb-6 transition-all duration-500 ${
          showCheck ? 'scale-100 opacity-100' : 'scale-50 opacity-0'
        }`}
      >
        <svg
          className={`w-12 h-12 text-green-500 transition-all duration-300 ${
            showCheck ? 'scale-100' : 'scale-0'
          }`}
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M5 13l4 4L19 7"
            className={showCheck ? 'animate-draw-check' : ''}
          />
        </svg>
      </div>

      {/* Text content with fade-in */}
      <div
        className={`text-center transition-all duration-500 ${
          showText ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
        }`}
      >
        <h2 className="text-2xl font-bold text-white mb-2">
          {t('cart.orderSent', 'Pedido enviado')}
        </h2>
        <p className="text-dark-muted mb-4">
          {t('cart.orderSentDescription', 'Tu pedido fue enviado a cocina')}
        </p>
        <div className="inline-flex items-center gap-2 bg-dark-elevated rounded-lg px-4 py-2">
          <span className="text-dark-muted text-sm">
            {t('cart.orderNumber', 'Pedido')}:
          </span>
          <span className="text-white font-mono font-semibold">#{displayId}</span>
        </div>
      </div>

      {/* Animated dots to indicate processing */}
      <div
        className={`mt-6 flex items-center gap-1 transition-all duration-500 ${
          showText ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <span className="text-dark-muted text-sm">
          {t('cart.preparingOrder', 'Preparando tu orden')}
        </span>
        <span className="flex gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" style={{ animationDelay: '0ms' }} />
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" style={{ animationDelay: '200ms' }} />
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" style={{ animationDelay: '400ms' }} />
        </span>
      </div>
    </div>
  )
}
