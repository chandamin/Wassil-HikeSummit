import { NavLink, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import {
  LayoutDashboard,
  Users,
  Repeat,
  Package,
  ChevronLeft,
  ChevronRight,
  LogOut,
  ShieldUser
} from 'lucide-react'
import Switch from 'react-switch'
import { removeToken } from '../utils/auth'
import AdminSettings from '../pages/AdminSettings'

const navItems = [
  { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
  { name: 'Selling Plans', path: '/selling-plans', icon: Package },
  { name: 'Subscriptions', path: '/subscriptions', icon: Repeat },
  { name: 'Settings', path: '/settings', icon: ShieldUser },
]

function Sidebar({ environment = 'sandbox', setEnvironment, collapsed, onToggle }) {
  // const [collapsed, setCollapsed] = useState(false)
  const navigate = useNavigate()

  const isLive = environment === 'live'

  const handleLogout = () => {
    removeToken()
    navigate('/login', { replace: true })
  }

  const handleEnvironmentToggle = (checked) => {
    const newEnv = checked ? 'live' : 'sandbox';
    localStorage.setItem('adminEnvironment', newEnv);
    setEnvironment?.(newEnv);
  }



  return (
    <>
    {/* Mobile overlay: closes sidebar when tapping outside */}
      {!collapsed && (
        <div 
          className="fixed inset-0 bg-black/40 z-30 lg:hidden transition-opacity" 
          onClick={onToggle} 
          aria-hidden="true"
        />
      )}
    <aside
  className={`fixed inset-y-0 left-0 z-40 flex flex-col h-screen bg-gradient-to-b from-gray-900 via-gray-800 to-gray-900 transition-all duration-300 ease-in-out ${collapsed ? 'w-20' : 'w-64'}`}
>
  {/* Toggle Button */}
  <button
    onClick={onToggle}
    className="absolute -right-3 top-6 bg-gray-700 hover:bg-gray-600 text-white p-1 rounded-full shadow z-50"
  >
    {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
  </button>

  {/* Header (fixed height, never scrolls) */}
  <div className="shrink-0 px-4 pt-6 pb-2">
    {!collapsed ? (
      <>
        <h1 className="text-white text-xl font-bold">Nomade Horizon</h1>
        <p className="text-gray-400 text-sm">Subscriptions At Convenience</p>
      </>
    ) : (
      <h1 className="text-white text-xl font-bold text-center">A</h1>
    )}
  </div>

  {/* Env Toggle (shrink-0 keeps it fixed) */}
  <div className="shrink-0 px-4 py-2">
    {/* Your existing toggle code here */}
  </div>

  {/* Nav: fills remaining space, strictly no scroll */}
  <nav className="flex-1 px-3 py-2 space-y-1 overflow-hidden">
    {navItems.map(({ name, path, icon: Icon }) => (
      <NavLink
        key={name}
        to={path}
        className={({ isActive }) =>
          `flex items-center gap-3 px-3 py-2.5 rounded-lg transition ${
            isActive ? 'bg-gray-700 text-white' : 'text-gray-300 hover:bg-gray-700 hover:text-white'
          }`
        }
      >
        <Icon size={20} />
        {!collapsed && <span className="text-sm font-medium">{name}</span>}
      </NavLink>
    ))}
  </nav>

  {/* Logout: pinned to bottom, no absolute positioning */}
  <div className="shrink-0 px-3 pb-4">
    <button
      onClick={handleLogout}
      className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg transition text-gray-300 hover:bg-gray-700 hover:text-white"
    >
      <LogOut size={20} />
      {!collapsed && <span className="text-sm font-medium">Logout</span>}
    </button>
  </div>
</aside>
    </>
  )
}

export default Sidebar


