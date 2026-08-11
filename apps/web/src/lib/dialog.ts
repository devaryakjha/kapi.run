export function isOutsideDialog(
  rect: Pick<DOMRect, 'bottom' | 'left' | 'right' | 'top'>,
  clientX: number,
  clientY: number,
) {
  return (
    clientX < rect.left ||
    clientX > rect.right ||
    clientY < rect.top ||
    clientY > rect.bottom
  )
}

export function bindDismissibleDialog(dialog: HTMLDialogElement) {
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault()
    dialog.close()
  })

  dialog.addEventListener('click', (event) => {
    if (
      event.target === dialog &&
      isOutsideDialog(dialog.getBoundingClientRect(), event.clientX, event.clientY)
    ) {
      dialog.close()
    }
  })
}
