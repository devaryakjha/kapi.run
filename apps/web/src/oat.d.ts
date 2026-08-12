declare module '@knadh/oat/js/toast.js' {
  type ToastPlacement =
    | 'top-left'
    | 'top-center'
    | 'top-right'
    | 'bottom-left'
    | 'bottom-center'
    | 'bottom-right'

  type ToastVariant = 'info' | 'success' | 'warning' | 'danger'

  interface ToastOptions {
    duration?: number
    placement?: ToastPlacement
    variant?: ToastVariant
  }

  export function toast(
    message: string,
    title?: string,
    options?: ToastOptions,
  ): HTMLOutputElement
}
