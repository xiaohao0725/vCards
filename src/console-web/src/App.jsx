import { Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Editor from './pages/Editor'
import Import from './pages/Import'
import Categories from './pages/Categories'
import { AuthProvider, useAuth } from './components/AuthContext'
import Layout from './components/Layout'

function ProtectedRoute({ children }) {
  const { token } = useAuth()
  if (!token) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/new" element={<Editor />} />
          <Route path="/:id/edit" element={<Editor />} />
          <Route path="/import" element={<Import />} />
          <Route path="/categories" element={<Categories />} />
        </Route>
      </Routes>
    </AuthProvider>
  )
}
