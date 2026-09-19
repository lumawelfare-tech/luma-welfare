import { Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'

export function NotFound() {
  const reduceMotion = useReducedMotion()
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <motion.div
        className="glass-modal p-10"
        initial={reduceMotion ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="text-6xl font-extrabold text-luma-200">404</div>
        <h1 className="mt-4 text-xl font-bold text-gray-900">Page Not Found</h1>
        <p className="mt-2 text-sm text-gray-600">The page you are looking for does not exist or has been moved.</p>
        <Link to="/" className="mt-6 inline-block rounded-xl bg-luma-700 px-6 py-2.5 text-sm font-bold text-white hover:bg-luma-800 transition-colors">
          Go Home
        </Link>
      </motion.div>
    </div>
  )
}
