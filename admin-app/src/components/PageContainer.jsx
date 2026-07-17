function PageContainer({ children, className = "" }) {
  const classes = ["px-4 py-4 max-w-5xl mx-auto", className].filter(Boolean).join(" ")

  return <div className={classes}>{children}</div>
}

export default PageContainer
