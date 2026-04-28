import { useState } from "react"

function EventActionsDropdown({ onEdit, onArchive, onCancel, onDelete }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">

      <button
        onClick={(e) => {
          e.stopPropagation()
          setOpen(!open)
        }}
        className="text-gray-500 hover:text-gray-700 p-2 rounded hover:bg-gray-100"
      >
         ⋮
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-36 bg-white shadow rounded border text-sm z-10">

          <button
            onClick={(e) => {
              e.stopPropagation()
              onEdit()
              setOpen(false)
            }}
            className="block w-full text-left px-3 py-2 hover:bg-gray-100"
          >
            Edit
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation()
              onArchive()
              setOpen(false)
            }}
            className="block w-full text-left px-3 py-2 hover:bg-gray-100"
          >
            Archive
          </button>

          {onCancel && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onCancel()
                setOpen(false)
              }}
              className="block w-full text-left px-3 py-2 text-amber-700 hover:bg-gray-100"
            >
              Cancel
            </button>
          )}

          <button
            onClick={(e) => {
              e.stopPropagation()
              onDelete()
              setOpen(false)
            }}
            className="block w-full text-left px-3 py-2 text-red-600 hover:bg-gray-100"
          >
            Delete
          </button>

        </div>
      )}

    </div>
  )
}

export default EventActionsDropdown