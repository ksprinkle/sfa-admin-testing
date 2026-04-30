function AppLayout({
  title,
  releaseTag,
  profile,
  onSignOut,
  buildFingerprint,
  showHeader = true,
  children,
  footer,
}) {
  return (
    <div className="min-h-screen bg-[var(--bg-page)]">
      {showHeader && (
        <header
          className="rounded-b-lg text-white shadow-[0_2px_10px_rgba(15,23,42,0.14)]"
          style={{ background: "linear-gradient(120deg, #155799 0%, #159957 100%)" }}
        >
          <div className="mx-auto flex w-full max-w-[1100px] items-center justify-between px-5 py-4">
            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold">{title}</h1>
              {releaseTag ? <p className="text-xs text-white/80">{releaseTag}</p> : null}
            </div>

            {profile ? (
              <div className="flex items-center gap-3">
                <span className="hidden max-w-[260px] truncate text-sm text-white/90 sm:inline">{profile.email}</span>
                <button
                  type="button"
                  onClick={onSignOut}
                  className="rounded-md border border-white/35 bg-white/10 px-3 py-1.5 text-sm font-medium text-white hover:bg-white/20"
                >
                  Sign out
                </button>
              </div>
            ) : null}
          </div>
        </header>
      )}

      <main className="mx-auto w-full max-w-[1100px] px-4 py-6">{children}</main>

      {showHeader && buildFingerprint ? (
        <div className="fixed bottom-16 right-2 z-40 rounded-full border border-slate-200 bg-white/95 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-600 shadow-sm backdrop-blur">
          Build {buildFingerprint}
        </div>
      ) : null}

      {footer}
    </div>
  )
}

export default AppLayout
