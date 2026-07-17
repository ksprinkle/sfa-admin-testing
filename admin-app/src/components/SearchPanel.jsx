function SearchPanel({ children, className = "" }) {
  const classes = ["flex gap-3 flex-wrap mb-4", className].filter(Boolean).join(" ")

  return <div className={classes}>{children}</div>
}

export default SearchPanel
