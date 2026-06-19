import { cva } from 'class-variance-authority'

const inputGroupAddonVariants = cva(
  "flex h-auto cursor-text items-center justify-center gap-2 py-2 text-sm font-medium text-muted-foreground select-none group-data-[disabled=true]/input-group:opacity-50 **:data-[slot=kbd]:rounded-3xl **:data-[slot=kbd]:bg-muted-foreground/10 **:data-[slot=kbd]:px-1.5 [&>svg:not([class*='size-'])]:size-4",
  {
    variants: {
      align: {
        'inline-start': 'order-first pl-3 has-[>button]:-ml-1 has-[>kbd]:-ml-1',
        'inline-end': 'order-last pr-3 has-[>button]:-mr-1 has-[>kbd]:-mr-1',
        'block-start':
          'order-first w-full justify-start px-3 pt-3 group-has-[>input]/input-group:pt-3.5 [.border-b]:pb-3.5',
        'block-end':
          'order-last w-full justify-start px-3 pb-3 group-has-[>input]/input-group:pb-3.5 [.border-t]:pt-3.5',
      },
    },
    defaultVariants: {
      align: 'inline-start',
    },
  },
)

const inputGroupButtonVariants = cva(
  'flex items-center gap-2 rounded-4xl text-sm shadow-none',
  {
    variants: {
      size: {
        xs: "h-6 gap-1 rounded-xl px-1.5 [&>svg:not([class*='size-'])]:size-3.5",
        sm: '',
        'icon-xs': 'size-6 rounded-xl p-0 has-[>svg]:p-0',
        'icon-sm': 'size-8 p-0 has-[>svg]:p-0',
      },
    },
    defaultVariants: {
      size: 'xs',
    },
  },
)

export { inputGroupAddonVariants, inputGroupButtonVariants }
