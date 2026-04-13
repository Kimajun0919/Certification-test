/**
 * StatusBadge — pill-shaped coloured label for payment & check-in status.
 *
 * Variants:
 *   success  → green
 *   warning  → yellow
 *   error    → red
 *   neutral  → gray
 */

interface Props {
  variant: 'success' | 'warning' | 'error' | 'neutral'
  label: string
  /** Optional small icon prefix (emoji or SVG string) */
  icon?: string
}

const styles: Record<Props['variant'], string> = {
  success: 'bg-green-100 text-green-800 ring-1 ring-green-200',
  warning: 'bg-yellow-100 text-yellow-800 ring-1 ring-yellow-200',
  error:   'bg-red-100   text-red-800   ring-1 ring-red-200',
  neutral: 'bg-gray-100  text-gray-600  ring-1 ring-gray-200',
}

export default function StatusBadge({ variant, label, icon }: Props) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${styles[variant]}`}
    >
      {icon && <span aria-hidden="true">{icon}</span>}
      {label}
    </span>
  )
}
