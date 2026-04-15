import { useState } from "react"
import { login } from "../api/auth"
import { useNavigate } from "react-router-dom"

function Login() {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const navigate = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    setError("")

    try {
      const data = await login(username, password)

      // store token
      localStorage.setItem("token", data.access_token)

      navigate("/")
    } catch (err) {
      console.error(err)
      setError("Login failed")
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-warmbg">
      <form
        onSubmit={handleSubmit}
        className="bg-white p-6 rounded-xl shadow w-80 space-y-4"
      >
        <h2 className="text-lg font-semibold text-ocean text-center">
          Admin Login
        </h2>

        <input
          className="w-full border rounded-lg px-3 py-2"
          placeholder="Username"
          value={username}
          onChange={e => setUsername(e.target.value)}
        />

        <input
          type="password"
          className="w-full border rounded-lg px-3 py-2"
          placeholder="Password"
          value={password}
          onChange={e => setPassword(e.target.value)}
        />

        {error && (
          <p className="text-sm text-danger">{error}</p>
        )}

        <button className="w-full bg-ocean text-white rounded-lg py-2">
          Login
        </button>
      </form>
    </div>
  )
}

export default Login