import { Link } from "react-router-dom"
import { useEffect, useMemo, useRef, useState } from "react"

function buildHighlightedText(text, query) {
  const source = String(text || "")
  const needle = String(query || "").trim()

  if (!needle) return source

  const lowerSource = source.toLowerCase()
  const lowerNeedle = needle.toLowerCase()
  const index = lowerSource.indexOf(lowerNeedle)

  if (index < 0) return source

  const before = source.slice(0, index)
  const match = source.slice(index, index + needle.length)
  const after = source.slice(index + needle.length)

  return (
    <>
      {before}
      <mark className="rounded bg-amber-100 px-0.5 text-slate-900">{match}</mark>
      {after}
    </>
  )
}

function GlobalSearch({
  query,
  debouncedQuery,
  sections,
  loading = false,
  errorMessage = "",
  onQueryChange,
  onSelect,
}) {
  const rootRef = useRef(null)
  const inputRef = useRef(null)
  const [isOpen, setIsOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)

  const flatResults = useMemo(() => {
    return sections.flatMap((section) =>
      section.items.map((item) => ({
        ...item,
        sectionLabel: section.label,
      }))
    )
  }, [sections])

  useEffect(() => {
    function handlePointerDown(event) {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        setIsOpen(false)
      }
    }

    document.addEventListener("pointerdown", handlePointerDown)
    return () => document.removeEventListener("pointerdown", handlePointerDown)
  }, [])

  const visibleActiveIndex = flatResults.length > 0 ? Math.min(activeIndex, flatResults.length - 1) : -1

  const handleSelect = (item) => {
    if (!item) return
    onSelect(item)
    setIsOpen(false)
    setActiveIndex(-1)
    inputRef.current?.blur()
  }

  const normalizedQuery = query.trim()
  const normalizedDebouncedQuery = String(debouncedQuery || "").trim()
  const isDebouncing = Boolean(normalizedQuery && normalizedQuery !== normalizedDebouncedQuery)
  const showDropdown = isOpen && (normalizedQuery.length > 0 || loading || flatResults.length > 0 || Boolean(errorMessage))
  const showResults = !loading && !isDebouncing && flatResults.length > 0
  const showEmptyState = !loading && !isDebouncing && !errorMessage && normalizedDebouncedQuery.length > 0 && flatResults.length === 0
  const activeResultId = visibleActiveIndex >= 0 ? `global-search-option-${flatResults[visibleActiveIndex]?.id}` : undefined

  return (
    <div ref={rootRef} className="relative w-full max-w-[460px]">
      <label className="sr-only" htmlFor="global-search-input">
        Global search
      </label>

      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/75" aria-hidden="true">
          <svg viewBox="0 0 20 20" className="h-4 w-4 fill-none stroke-current stroke-[1.8]">
            <circle cx="8.5" cy="8.5" r="5.5" />
            <path d="M12.5 12.5 17 17" strokeLinecap="round" />
          </svg>
        </span>

        <input
          ref={inputRef}
          id="global-search-input"
          type="search"
          role="combobox"
          value={query}
          onFocus={() => setIsOpen(true)}
          onChange={(event) => {
            onQueryChange(event.target.value)
            setIsOpen(true)
            setActiveIndex(0)
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setIsOpen(false)
              return
            }

            if (!flatResults.length) return

            if (event.key === "ArrowDown") {
              event.preventDefault()
              setIsOpen(true)
              setActiveIndex((current) => (current + 1) % flatResults.length)
              return
            }

            if (event.key === "ArrowUp") {
              event.preventDefault()
              setIsOpen(true)
              setActiveIndex((current) => (current <= 0 ? flatResults.length - 1 : current - 1))
              return
            }

            if (event.key === "Enter" && visibleActiveIndex >= 0) {
              event.preventDefault()
              handleSelect(flatResults[visibleActiveIndex])
            }
          }}
          placeholder="Search events, participants, volunteers, sessions"
          className="w-full rounded-2xl border border-white/25 bg-white/15 py-2.5 pl-9 pr-10 text-sm text-white placeholder:text-white/70 shadow-inner outline-none transition focus:border-white/45 focus:bg-white/20"
          aria-label="Search events, participants, volunteers, and sessions"
          aria-expanded={showDropdown}
          aria-autocomplete="list"
          aria-controls="global-search-results"
          aria-activedescendant={activeResultId}
        />

        {query ? (
          <button
            type="button"
            onClick={() => {
              onQueryChange("")
              setIsOpen(true)
              setActiveIndex(-1)
              inputRef.current?.focus()
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full px-2 py-1 text-xs font-semibold text-white/85 hover:bg-white/15 hover:text-white"
            aria-label="Clear global search"
          >
            Clear
          </button>
        ) : null}
      </div>

      {showDropdown ? (
        <div
          id="global-search-results"
          className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-50 overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-2xl"
        >
          {errorMessage ? (
            <div className="border-b border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-800">
              {errorMessage}
            </div>
          ) : null}

          {loading || isDebouncing ? (
            <div className="px-4 py-4 text-sm text-slate-600">
              Searching existing data...
            </div>
          ) : null}

          {showEmptyState ? (
            <div className="px-4 py-4 text-sm text-slate-600">
              No matches yet. Try an event title, participant name, volunteer email, or session name.
            </div>
          ) : null}

          {showResults ? (
            <div className="max-h-[420px] overflow-y-auto py-2" role="listbox" aria-label="Global search results">
              {sections.map((section) =>
                section.items.length ? (
                  <div key={section.label} className="px-2 py-1" role="group" aria-label={section.label}>
                    <div className="flex items-center justify-between px-2 pb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                      <span>{section.label}</span>
                      <span>{section.items.length}</span>
                    </div>
                    <div className="space-y-1">
                      {section.items.map((item) => {
                        const absoluteIndex = flatResults.findIndex((candidate) => candidate.id === item.id && candidate.kind === item.kind)
                        const isActive = absoluteIndex === visibleActiveIndex
                        return (
                          <Link
                            key={item.id}
                            id={`global-search-option-${item.id}`}
                            role="option"
                            aria-selected={isActive}
                            to={item.to}
                            onClick={(event) => {
                              event.preventDefault()
                              handleSelect(item)
                            }}
                            onMouseDown={(event) => event.preventDefault()}
                            className={`flex w-full items-start gap-3 rounded-xl px-3 py-2 text-left transition ${isActive ? "bg-sky-50 ring-1 ring-sky-200" : "hover:bg-slate-50"}`}
                          >
                            <span className={`mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${item.badgeClass || "bg-slate-100 text-slate-700"}`}>
                              {item.badgeLabel || item.kind.charAt(0).toUpperCase()}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-semibold text-slate-900">{buildHighlightedText(item.title, normalizedDebouncedQuery)}</span>
                              <span className="block truncate text-xs text-slate-600">{buildHighlightedText(item.subtitle, normalizedDebouncedQuery)}</span>
                              {item.detail ? <span className="mt-0.5 block truncate text-[11px] text-slate-500">{buildHighlightedText(item.detail, normalizedDebouncedQuery)}</span> : null}
                            </span>
                          </Link>
                        )
                      })}
                    </div>
                  </div>
                ) : null
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

export default GlobalSearch