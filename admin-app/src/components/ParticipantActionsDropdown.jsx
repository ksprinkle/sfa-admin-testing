import { useState, useRef, useEffect } from "react"

export default function ParticipantActionsDropdown({
  participant,
  onVerifyWaiver,
  onCheckIn,
  onPromote,
  onRemove
}) {
  const [open, setOpen] = useState(false)
  const dropdownRef = useRef(null)

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setOpen(false)
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [])

  return (
    <div ref={dropdownRef} className="relative">
      <button
        className={`px-2 py-1 text-lg ${open ? "rotate-90" : ""}`}
        onClick={() => setOpen(!open)}
      >
        ⋮
      </button>

      {open && (
        <div className="absolute right-0 mt-1 bg-white border rounded shadow-md z-10">

          {!participant.waiver_verified && (
            <button
              className="block w-full text-left px-4 py-2 hover:bg-gray-100"
              onClick={() => {
                onVerifyWaiver(participant.id)
                setOpen(false)
              }}
            >
              Verify Waiver
            </button>
          )}
          
          {!participant.checked_in && !participant.is_waitlisted && (
            <button
              className="block w-full text-left px-4 py-2 hover:bg-gray-100"
              onClick={() => {
                onCheckIn(participant.id)
                setOpen(false)
              }}
            >
              Check In
            </button>
          )}

          {participant.is_waitlisted && (
            <button
              className="block w-full text-left px-4 py-2 hover:bg-gray-100"
              onClick={() => {
                onPromote(participant.id)
                setOpen(false)
              }}
            >
              Promote
            </button>
          )}

          <button
            className="block w-full text-left px-4 py-2 text-red-600 hover:bg-gray-100"
            onClick={() => {
              onRemove(participant)
              setOpen(false)
            }}
          >
            Remove
          </button>

        </div>
      )}
    </div>
  )
}