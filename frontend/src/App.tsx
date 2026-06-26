import { FormEvent, useState } from 'react'
import './App.css'

const API_BASE = 'http://127.0.0.1:8000'

type LoginResponse = {
  refresh: string
  access: string
  username: string
  email: string
}

function App() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [loggedInUser, setLoggedInUser] = useState(
    localStorage.getItem('username') || '',
  )

  const handleLogin = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setMessage('')
    setLoading(true)

    try {
      const response = await fetch(`${API_BASE}/api/login/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username,
          password,
        }),
      })

      const data = await response.json()

      if (response.ok) {
        const loginData = data as LoginResponse

        localStorage.setItem('access', loginData.access)
        localStorage.setItem('refresh', loginData.refresh)
        localStorage.setItem('username', loginData.username)
        localStorage.setItem('email', loginData.email)

        setLoggedInUser(loginData.username)
        setMessage('Login successful.')
        setUsername('')
        setPassword('')
      } else {
        if (data.error) {
          setMessage(data.error)
        } else if (data.username || data.password) {
          setMessage('Username and password are required.')
        } else {
          setMessage('Login failed.')
        }
      }
    } catch {
      setMessage('Could not connect to server.')
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = async () => {
    const refresh = localStorage.getItem('refresh')
    const access = localStorage.getItem('access')

    try {
      await fetch(`${API_BASE}/api/logout/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${access}`,
        },
        body: JSON.stringify({ refresh }),
      })
    } catch (error) {
      console.error('Logout request failed:', error)
    } finally {
      localStorage.removeItem('access')
      localStorage.removeItem('refresh')
      localStorage.removeItem('username')
      localStorage.removeItem('email')

      setLoggedInUser('')
      setMessage('Logged out successfully.')
    }
  }

  return (
    <div className="app-container">
      <div className="login-card">
        <h1>Mini Discord</h1>

        {message && (
          <p
            className={
              message.toLowerCase().includes('successful')
                ? 'message success'
                : 'message error'
            }
          >
            {message}
          </p>
        )}

        {loggedInUser ? (
          <div className="logged-in-box">
            <p>
              You are logged in as <strong>{loggedInUser}</strong>
            </p>
            <button onClick={handleLogout} className="primary-button">
              Logout
            </button>
          </div>
        ) : (
          <form onSubmit={handleLogin} className="login-form">
            <div className="form-group">
              <label htmlFor="username">Username</label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter your username"
              />
            </div>

            <div className="form-group">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
              />
            </div>

            <button type="submit" disabled={loading} className="primary-button">
              {loading ? 'Logging in...' : 'Login'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

export default App
