import { BrowserRouter, Route, Routes, Navigate } from 'react-router-dom'
import Navbar from '@/components/Navbar'
import HomePage from '@/pages/HomePage'
import QRPage from '@/pages/QRPage'
import ScannerPage from '@/pages/ScannerPage'
import AdminPage from '@/pages/AdminPage'

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <main className="flex-1">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/qr/:token" element={<QRPage />} />
            <Route path="/scanner" element={<ScannerPage />} />
            <Route path="/admin" element={<AdminPage />} />
            {/* Catch-all */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}
