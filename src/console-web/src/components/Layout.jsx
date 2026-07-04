import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from './AuthContext'

export default function Layout() {
  const { username, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div className="console-layout">
      <nav className="console-nav">
        <div className="nav-left">
          <span className="nav-logo">vCards Console</span>
          <NavLink to="/" end>联系人</NavLink>
          <NavLink to="/new">新建</NavLink>
          <NavLink to="/import">导入</NavLink>
          <NavLink to="/categories">分类</NavLink>
        </div>
        <div className="nav-right">
          <span className="nav-user">{username}</span>
          <button onClick={handleLogout} className="btn-link">退出</button>
        </div>
      </nav>
      <main className="console-main">
        <Outlet />
      </main>
    </div>
  )
}
