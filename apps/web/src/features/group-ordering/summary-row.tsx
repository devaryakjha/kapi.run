import { cn } from '#/lib/utils'

export function SummaryRow({
  label,
  value,
  strong,
}: {
  label: string
  value: string
  strong?: boolean
}) {
  return (
    <div className="flex justify-between text-[13px] leading-4.5 text-muted-foreground">
      <span>{label}</span>
      <span
        className={cn('font-mono', strong && 'font-medium text-foreground')}
      >
        {value}
      </span>
    </div>
  )
}
