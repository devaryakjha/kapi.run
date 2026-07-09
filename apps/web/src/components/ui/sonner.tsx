import { Toaster as SonnerToaster } from 'sonner'

export function Toaster() {
  return (
    <SonnerToaster
      position="top-center"
      duration={2500}
      toastOptions={{
        style: {
          background: 'var(--background)',
          color: 'var(--foreground)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-xl)',
          fontSize: '13px',
        },
      }}
    />
  )
}
