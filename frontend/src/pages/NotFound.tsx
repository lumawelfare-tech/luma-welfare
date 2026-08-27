import { Link } from 'react-router-dom'

export function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <div className="rounded-3xl border border-gray-200 bg-white p-10 shadow-sm">
        <div className="text-6xl font-extrabold text-gray-200">404</div>
        <h1 className="mt-4 text-xl font-bold text-gray-900">Page Not Found</h1>
        <p className="mt-2 text-sm text-gray-500">The page you are looking for does not exist or has been moved.</p>
        <Link to="/" className="mt-6 inline-block rounded-xl bg-luma-700 px-6 py-2.5 text-sm font-bold text-white hover:bg-luma-800 transition-colors">
          Go Home
        </Link>
      </div>
    </div>
  )
}
