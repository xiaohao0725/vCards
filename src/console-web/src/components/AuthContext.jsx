import { createContext, useContext, useState, useCallback } from 'react'
import { setToken, getToken, api } from '../api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [token, setTokenState] = useState(() => getToken())
  const [username, setUsername] = useState(() => localStorage.getItem('username') || '')

  const login = useCallback(async (user, pass) => {
    const data = await api.login(user, pass)
    setTokenState(data.token)
    setUsername(data.username)
    setToken(data.token)
    localStorage.setItem('username', data.username)
    return data
  }, [])

  const logout = useCallback(() => {
    setTokenState(null)
    setUsername('')
    setToken(null)
    localStorage.removeItem('username')
  }, [])

  return (
    <AuthContext.Provider value={{ token, username, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
