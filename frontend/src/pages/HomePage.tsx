import { Link } from 'react-router-dom'

export default function HomePage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] px-4 text-center">
      <div className="mb-6 text-7xl" aria-hidden="true">🎟</div>
      <h1 className="text-4xl font-bold text-gray-900 mb-3">EventQR</h1>
      <p className="text-lg text-gray-500 max-w-md mb-10">
        Streamlined QR-based event check-in. Scan, validate, attend.
      </p>

      <div className="grid gap-4 sm:grid-cols-2 w-full max-w-md">
        <Link
          to="/admin"
          className="card flex flex-col items-center gap-3 hover:border-blue-200 hover:shadow-md transition-all cursor-pointer"
        >
          <span className="text-4xl" aria-hidden="true">🗂</span>
          <div>
            <p className="font-semibold text-gray-900">Admin Dashboard</p>
            <p className="text-sm text-gray-500 mt-0.5">Manage users &amp; payments</p>
          </div>
        </Link>

        <Link
          to="/scanner"
          className="card flex flex-col items-center gap-3 hover:border-blue-200 hover:shadow-md transition-all cursor-pointer"
        >
          <span className="text-4xl" aria-hidden="true">📷</span>
          <div>
            <p className="font-semibold text-gray-900">QR Scanner</p>
            <p className="text-sm text-gray-500 mt-0.5">Check in attendees at the door</p>
          </div>
        </Link>
      </div>
    </div>
  )
}
