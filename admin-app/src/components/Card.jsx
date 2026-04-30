function Card({ header, children, className = "", bodyClassName = "" }) {
  const classes = [
    "card-fade-in bg-[var(--bg-card)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-4 transition-shadow duration-200 ease-out hover:shadow-[var(--shadow-md)] motion-reduce:transition-none",
    className,
  ]
    .filter(Boolean)
    .join(" ")

  return (
    <section className={classes}>
      {header ? <div className="mb-3">{header}</div> : null}
      <div className={bodyClassName}>{children}</div>
    </section>
  )
}

Card.Header = function CardHeader({ children, className = "" }) {
  return <div className={["text-sm font-semibold text-[var(--text-primary)]", className].filter(Boolean).join(" ")}>{children}</div>
}

Card.Body = function CardBody({ children, className = "" }) {
  return <div className={className}>{children}</div>
}

export default Card
