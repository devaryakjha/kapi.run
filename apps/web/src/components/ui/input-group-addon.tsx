import * as React from 'react'
import type { VariantProps } from 'class-variance-authority'

import { inputGroupAddonVariants } from '#/components/ui/input-group-variants'
import { cn } from '#/lib/utils.ts'

function InputGroupAddon({
  className,
  align = 'inline-start',
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof inputGroupAddonVariants>) {
  return (
    <div
      data-slot="input-group-addon"
      data-align={align}
      className={cn(inputGroupAddonVariants({ align }), className)}
      {...props}
    />
  )
}

export { InputGroupAddon }
