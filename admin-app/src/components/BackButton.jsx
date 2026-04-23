import { useNavigate } from "react-router-dom"

export default function BackButton({ fallbackTo = "/dashboard", className = "", label = "Back" }) {
  const navigate = useNavigate()

  function handleBack() {
    if (window.history.length > 1) {
      navigate(-1)
      return
    }

    navigate(fallbackTo)
  }

  return (
    <button
      type="button"
      onClick={handleBack}
      className={`px-3 py-1 border border-gray-300 bg-white text-gray-700 rounded hover:bg-gray-50 text-sm ${className}`}
      title="Go back"
    >
      <span className="inline-flex items-center gap-1">
        <span aria-hidden="true">←</span>
        <span>{label}</span>
      </span>
    </button>
  )
}
