import { Link } from "react-router-dom"
import logo from "../assets/icon-512.png"

function Drawer({ isOpen, onClose }) {
  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40"
          onClick={onClose}
        />
      )}

      <div className="p-4 border-b flex items-center gap-3">
        <img src={logo} alt="Surfers For Autism" className="h-10" />
        <div>
          <h2 className="font-semibold text-ocean">
            Surfers Admin
          </h2>
          <p className="text-xs text-secondary">
            Event Management
          </p>
        </div>
     
        <nav className="p-4 space-y-4">
  <Link to="/" onClick={onClose} className="block">
    Dashboard
  </Link>

  <Link to="/events" onClick={onClose} className="block">
    Events
  </Link>

  <Link to="/participants" onClick={onClose} className="block">
    Participants
  </Link>
</nav>
      </div>
    </>
  )
}

export default Drawer