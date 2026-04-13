import { Link, useLocation } from 'react-router-dom'

const links = [
  { to: '/admin',   label: 'Admin',   icon: '🗂' },
  { to: '/scanner', label: 'Scanner', icon: '📷' },
]

export default function Navbar() {
  const { pathname } = useLocation()

  return (
    <header className="bg-white border-b border-gray-100 shadow-sm">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 flex h-14 items-center justify-between">
        {/* Logo / brand */}
        <Link to="/" className="flex items-center gap-2 font-bold text-blue-600 text-lg">
          <span aria-hidden="true">🎟</span>
          <span>EventQR</span>
        </Link>

        {/* Nav links */}
        <nav className="flex items-center gap-1">
          {links.map(({ to, label, icon }) => {
            const active = pathname.startsWith(to)
            return (
              <Link
                key={to}
                to={to}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  active
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <span aria-hidden="true">{icon}</span>
                {label}
              </Link>
            )
          })}
        </nav>
      </div>
    </header>
  )
}
