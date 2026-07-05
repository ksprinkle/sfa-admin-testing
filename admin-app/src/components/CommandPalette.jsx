import { useEffect, useMemo, useRef, useState } from "react"

function normalizeText(value) {
  return String(value || "").trim().toLowerCase()
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function findSubsequencePositions(text, token) {
  const haystack = normalizeText(text)
  const needle = normalizeText(token).replace(/\s+/g, "")
  if (!haystack || !needle) return []

  const positions = []
  let cursor = 0

  for (const char of needle) {
    const index = haystack.indexOf(char, cursor)
    if (index < 0) return []
    positions.push(index)
    cursor = index + 1
  }

  return positions
}

function buildRangesFromPositions(positions) {
  if (!positions.length) return []

  const ranges = []
  let start = positions[0]
  let end = positions[0] + 1

  for (let index = 1; index < positions.length; index += 1) {
    const current = positions[index]
    if (current === end) {
      end += 1
      continue
    }

    ranges.push({ start, end })
    start = current
    end = current + 1
  }

  ranges.push({ start, end })
  return ranges
}

function mergeRanges(ranges) {
  if (!ranges.length) return []
  const sorted = [...ranges].sort((left, right) => left.start - right.start)
  const merged = [sorted[0]]

  for (let index = 1; index < sorted.length; index += 1) {
    const previous = merged[merged.length - 1]
    const current = sorted[index]

    if (current.start <= previous.end) {
      previous.end = Math.max(previous.end, current.end)
      continue
    }

    merged.push({ ...current })
  }

  return merged
}

function findRangesForText(text, query) {
  const source = String(text || "")
  const normalizedQuery = normalizeText(query)
  if (!source || !normalizedQuery) return []

  const tokens = normalizedQuery.split(/\s+/).filter(Boolean)
  if (!tokens.length) return []

  const lowered = source.toLowerCase()
  const ranges = []

  for (const token of tokens) {
    const tokenMatcher = new RegExp(escapeRegExp(token), "gi")
    let match = tokenMatcher.exec(lowered)

    if (match) {
      while (match) {
        ranges.push({ start: match.index, end: match.index + token.length })
        match = tokenMatcher.exec(lowered)
      }
      continue
    }

    const positions = findSubsequencePositions(source, token)
    ranges.push(...buildRangesFromPositions(positions))
  }

  return mergeRanges(ranges)
}

function scoreCommand(command, query) {
  const normalizedQuery = normalizeText(query)
  if (!normalizedQuery) {
    return { score: 1, labelRanges: [], descriptionRanges: [] }
  }

  const label = String(command.label || "")
  const description = String(command.description || "")
  const group = String(command.group || "")
  const labelLower = label.toLowerCase()
  const descriptionLower = description.toLowerCase()
  const groupLower = group.toLowerCase()
  const haystack = `${labelLower} ${descriptionLower} ${groupLower}`.trim()
  if (!haystack) return { score: 0, labelRanges: [], descriptionRanges: [] }

  const tokens = normalizedQuery.split(/\s+/).filter(Boolean)
  if (!tokens.length) return { score: 1, labelRanges: [], descriptionRanges: [] }

  let score = 0

  for (const token of tokens) {
    const tokenCompact = token.replace(/\s+/g, "")
    const inLabel = labelLower.indexOf(token)
    const inDescription = descriptionLower.indexOf(token)
    const inGroup = groupLower.indexOf(token)

    if (inLabel >= 0) {
      score += 70
      if (inLabel === 0) score += 25
      if (labelLower.startsWith(`${token} `) || labelLower.includes(` ${token}`)) score += 10
      continue
    }

    if (inDescription >= 0) {
      score += 45
      if (inDescription === 0) score += 8
      continue
    }

    if (inGroup >= 0) {
      score += 25
      continue
    }

    const fuzzyInLabel = findSubsequencePositions(label, tokenCompact)
    if (fuzzyInLabel.length) {
      score += 22 + Math.max(0, 8 - fuzzyInLabel.length)
      continue
    }

    const fuzzyInDescription = findSubsequencePositions(description, tokenCompact)
    if (fuzzyInDescription.length) {
      score += 14
      continue
    }

    const fuzzyInGroup = findSubsequencePositions(group, tokenCompact)
    if (fuzzyInGroup.length) {
      score += 8
      continue
    }

    return { score: 0, labelRanges: [], descriptionRanges: [] }
  }

  const labelRanges = findRangesForText(label, normalizedQuery)
  const descriptionRanges = findRangesForText(description, normalizedQuery)
  return { score, labelRanges, descriptionRanges }
}

function renderHighlightedText(text, ranges) {
  const source = String(text || "")
  if (!ranges?.length) return source

  const pieces = []
  let cursor = 0

  ranges.forEach((range, index) => {
    if (range.start > cursor) {
      pieces.push(<span key={`plain-${index}-${cursor}`}>{source.slice(cursor, range.start)}</span>)
    }

    pieces.push(
      <mark key={`mark-${index}-${range.start}`} className="rounded bg-amber-100 px-0.5 text-slate-900">
        {source.slice(range.start, range.end)}
      </mark>
    )
    cursor = range.end
  })

  if (cursor < source.length) {
    pieces.push(<span key={`tail-${cursor}`}>{source.slice(cursor)}</span>)
  }

  return pieces
}

export default function CommandPalette({
  isOpen,
  commands,
  onClose,
  onSelectCommand,
}) {
  const [query, setQuery] = useState("")
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef(null)
  const optionRefs = useRef(new Map())

  const filteredCommands = useMemo(() => {
    return (commands || [])
      .map((command) => {
        const result = scoreCommand(command, query)
        return { ...command, _score: result.score, _labelRanges: result.labelRanges, _descriptionRanges: result.descriptionRanges }
      })
      .filter((command) => command._score > 0)
      .sort((left, right) => right._score - left._score || String(left.label || "").localeCompare(String(right.label || "")))
  }, [commands, query])

  useEffect(() => {
    if (!isOpen) return

    const focusTimer = window.setTimeout(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    }, 0)

    return () => window.clearTimeout(focusTimer)
  }, [isOpen])

  const safeActiveIndex = filteredCommands.length
    ? Math.min(activeIndex, filteredCommands.length - 1)
    : 0
  const activeCommand = filteredCommands[safeActiveIndex]

  useEffect(() => {
    if (!isOpen) return

    const activeId = activeCommand?.id
    if (!activeId) return

    const element = optionRefs.current.get(activeId)
    if (!element) return

    element.scrollIntoView({ block: "nearest" })
  }, [isOpen, safeActiveIndex, activeCommand?.id])

  if (!isOpen) return null

  const handleKeyDown = (event) => {
    if (event.key === "Escape") {
      event.preventDefault()
      onClose?.()
      return
    }

    if (event.key === "ArrowDown") {
      event.preventDefault()
      setActiveIndex((current) => (filteredCommands.length ? (current + 1) % filteredCommands.length : 0))
      return
    }

    if (event.key === "ArrowUp") {
      event.preventDefault()
      setActiveIndex((current) => (filteredCommands.length ? (current - 1 + filteredCommands.length) % filteredCommands.length : 0))
      return
    }

    if (event.key === "Tab") {
      event.preventDefault()
      const delta = event.shiftKey ? -1 : 1
      setActiveIndex((current) => {
        if (!filteredCommands.length) return 0
        return (current + delta + filteredCommands.length) % filteredCommands.length
      })
      return
    }

    if (event.key === "Home") {
      event.preventDefault()
      setActiveIndex(0)
      return
    }

    if (event.key === "End") {
      event.preventDefault()
      setActiveIndex(Math.max(filteredCommands.length - 1, 0))
      return
    }

    if (event.key === "Enter") {
      if (!activeCommand) return
      event.preventDefault()
      onSelectCommand?.(activeCommand)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/40 p-3 pt-4 sm:p-4 sm:pt-20" role="presentation">
      <div className="absolute inset-0" aria-hidden="true" onClick={onClose} />

      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="command-palette-title"
        className="relative z-10 w-full max-w-2xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl"
      >
        <div className="border-b border-slate-200 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 id="command-palette-title" className="text-sm font-semibold text-slate-900">Command Palette</h2>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
              aria-label="Close command palette"
            >
              Close
            </button>
          </div>
          <label htmlFor="command-palette-input" className="sr-only">Search commands</label>
          <input
            id="command-palette-input"
            ref={inputRef}
            type="text"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setActiveIndex(0)
            }}
            onKeyDown={handleKeyDown}
            placeholder="Type a command..."
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-sky-400 focus:outline-none"
            aria-activedescendant={activeCommand ? `command-palette-option-${activeCommand.id}` : undefined}
            aria-controls="command-palette-listbox"
            aria-autocomplete="list"
            aria-haspopup="listbox"
            role="combobox"
            aria-expanded="true"
          />
          <p className="mt-2 text-xs text-slate-500">Use Up/Down or Tab to navigate, Enter to run, Esc to close.</p>
        </div>

        <div className="max-h-[min(60vh,420px)] overflow-y-auto" role="listbox" id="command-palette-listbox" aria-label="Available commands">
          {filteredCommands.length === 0 ? (
            <p className="px-3 py-4 text-sm text-slate-500">No commands match your search.</p>
          ) : (
            filteredCommands.map((command, index) => {
              const isActive = index === safeActiveIndex
              return (
                <button
                  key={command.id}
                  id={`command-palette-option-${command.id}`}
                  ref={(element) => {
                    if (element) {
                      optionRefs.current.set(command.id, element)
                    } else {
                      optionRefs.current.delete(command.id)
                    }
                  }}
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => onSelectCommand?.(command)}
                  className={`flex w-full items-start justify-between gap-4 border-b border-slate-100 px-3 py-3 text-left last:border-b-0 ${isActive ? "bg-sky-50" : "bg-white hover:bg-slate-50"}`}
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{renderHighlightedText(command.label, command._labelRanges)}</p>
                    {command.description ? <p className="mt-0.5 text-xs text-slate-600">{renderHighlightedText(command.description, command._descriptionRanges)}</p> : null}
                  </div>
                  {command.group ? (
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                      {command.group}
                    </span>
                  ) : null}
                </button>
              )
            })
          )}
        </div>
      </section>
    </div>
  )
}
