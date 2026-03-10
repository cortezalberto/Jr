import { useState, useCallback, useActionState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { LogIn, AlertCircle } from 'lucide-react'
import { Button, Input } from '../components/ui'
import { useAuthStore, selectIsAuthenticated, selectAuthError } from '../stores/authStore'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

type FormState = {
  errors?: {
    email?: string
    password?: string
  }
  message?: string
  isSuccess?: boolean
}

export function LoginPage() {
  useDocumentTitle('Iniciar Sesion')

  const navigate = useNavigate()
  const isAuthenticated = useAuthStore(selectIsAuthenticated)
  const authError = useAuthStore(selectAuthError)
  const login = useAuthStore((s) => s.login)
  const clearError = useAuthStore((s) => s.clearError)

  const [formData, setFormData] = useState({
    email: '',
    password: '',
  })

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/', { replace: true })
    }
  }, [isAuthenticated, navigate])

  // Clear error on unmount
  useEffect(() => {
    return () => clearError()
  }, [clearError])

  const submitAction = useCallback(
    async (_prevState: FormState, formData: FormData): Promise<FormState> => {
      const email = formData.get('email') as string
      const password = formData.get('password') as string

      // Basic validation
      const errors: FormState['errors'] = {}
      if (!email || !email.includes('@')) {
        errors.email = 'Email invalido'
      }
      if (!password || password.length < 4) {
        errors.password = 'La contrasena debe tener al menos 4 caracteres'
      }

      if (Object.keys(errors).length > 0) {
        return { errors, isSuccess: false }
      }

      const success = await login(email, password)
      if (success) {
        return { isSuccess: true }
      }

      return { isSuccess: false, message: 'Error de autenticacion' }
    },
    [login]
  )

  const [state, formAction, isPending] = useActionState<FormState, FormData>(
    submitAction,
    { isSuccess: false }
  )

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const { name, value } = e.target
      setFormData((prev) => ({ ...prev, [name]: value }))
      // Clear error when user starts typing
      if (authError) {
        clearError()
      }
    },
    [authError, clearError]
  )

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg-secondary)] px-4">
      <div className="w-full max-w-md">
        {/* Logo Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-[var(--primary-500)] to-[var(--primary-600)] rounded-2xl shadow-[var(--shadow-primary)] mb-4">
            <span className="text-[var(--text-inverse)] font-bold text-2xl">B</span>
          </div>
          <h1
            className="text-2xl font-bold text-[var(--text-primary)]"
            style={{ fontFamily: 'var(--font-heading)' }}
          >
            Buen Sabor
          </h1>
          <p className="text-[var(--text-tertiary)] mt-2">Panel de Administracion</p>
        </div>

        {/* Login Form */}
        <div className="bg-[var(--bg-primary)] border border-[var(--border-default)] rounded-xl p-8 shadow-[var(--shadow-lg)]">
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-6">
            Iniciar Sesion
          </h2>

          {/* Error Alert */}
          {(authError || state.message) && (
            <div className="mb-6 p-4 bg-[var(--danger-bg)] border border-[var(--danger-border)] rounded-lg flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-[var(--danger-icon)] shrink-0 mt-0.5" />
              <p className="text-sm text-[var(--danger-text)]">
                {authError || state.message}
              </p>
            </div>
          )}

          <form action={formAction} className="space-y-5">
            <Input
              label="Email"
              name="email"
              type="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="usuario@ejemplo.com"
              error={state.errors?.email}
              autoComplete="email"
              autoFocus
            />

            <Input
              label="Contrasena"
              name="password"
              type="password"
              value={formData.password}
              onChange={handleChange}
              placeholder="Tu contrasena"
              error={state.errors?.password}
              autoComplete="current-password"
            />

            <Button
              type="submit"
              className="w-full"
              isLoading={isPending}
              leftIcon={<LogIn className="w-4 h-4" />}
            >
              Iniciar Sesion
            </Button>
          </form>

          {/* Demo Credentials */}
          <div className="mt-6 pt-6 border-t border-[var(--border-default)]">
            <p className="text-xs text-[var(--text-muted)] mb-3">
              Credenciales de prueba:
            </p>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between text-[var(--text-tertiary)]">
                <span>Admin:</span>
                <code className="text-[var(--primary-500)]">admin@demo.com / admin123</code>
              </div>
              <div className="flex justify-between text-[var(--text-tertiary)]">
                <span>Manager:</span>
                <code className="text-[var(--primary-500)]">manager@demo.com / manager123</code>
              </div>
              <div className="flex justify-between text-[var(--text-tertiary)]">
                <span>Cocina:</span>
                <code className="text-[var(--primary-500)]">kitchen@demo.com / kitchen123</code>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-[var(--text-muted)] mt-6">
          Sistema de Gestion de Restaurantes
        </p>
      </div>
    </div>
  )
}

export default LoginPage
