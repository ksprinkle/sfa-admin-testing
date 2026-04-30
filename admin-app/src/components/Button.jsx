const variantClasses = {
  primary: "bg-[var(--color-primary)] text-white hover:brightness-95 hover:shadow-sm",
  success: "bg-[var(--color-success)] text-white hover:brightness-95 hover:shadow-sm",
  warning: "bg-[var(--color-warning)] text-white hover:brightness-95 hover:shadow-sm",
  danger: "bg-[var(--color-danger)] text-white hover:brightness-95 hover:shadow-sm",
  neutral: "bg-slate-600 text-white hover:bg-slate-700 hover:shadow-sm",
}

function Button({
  variant = "primary",
  type = "button",
  className = "",
  disabled = false,
  children,
  ...props
}) {
  const resolvedVariant = variantClasses[variant] ? variant : "primary"

  const classes = [
    "inline-flex items-center justify-center rounded-[var(--radius-md)] px-4 py-2 text-sm font-medium transition-colors transition-shadow duration-200 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-[var(--color-primary)] disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none",
    variantClasses[resolvedVariant],
    className,
  ]
    .filter(Boolean)
    .join(" ")

  return (
    <button type={type} className={classes} disabled={disabled} {...props}>
      {children}
    </button>
  )
}

export default Button
