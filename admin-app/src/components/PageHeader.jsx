function PageHeader({ title, description }) {
  return (
    <>
      <h1 className="text-xl font-bold text-ocean mb-1">{title}</h1>
      {description ? <p className="text-sm text-slate-500 mb-4">{description}</p> : null}
    </>
  )
}

export default PageHeader
