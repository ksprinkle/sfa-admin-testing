import logo from "../assets/icon-192.png"

function TopBar({ title, onMenuClick }) {
  return (
    <div className="bg-ocean-dark text-white h-14 flex items-center justify-between px-4 shadow-md">
      <button onClick={onMenuClick} className="text-xl">
        ☰
      </button>

      <div className="flex items-center gap-2">
        <img
          src={logo}
          alt="Surfers For Autism"
          className="h-6 brightness-0 invert"
        />
        <h1 className="font-semibold text-base">{title}</h1>
      </div>

      <div className="text-xl">👤</div>
    </div>
  )
}

export default TopBar