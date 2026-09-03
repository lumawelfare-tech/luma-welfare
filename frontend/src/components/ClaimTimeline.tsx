const claimTimeline = ['Draft', 'Submitted', 'Under Review', 'Approved', 'Paid']

export type { ClaimTimelineProps } from './ClaimTimeline.types'

export function ClaimTimeline({ status }: { status: string }) {
  const currentIndex = claimTimeline.indexOf(status)
  const isRejected = status === 'Rejected'
  const isAdditionalInfo = status === 'Additional Information Required'
  const currentIdx = isRejected || isAdditionalInfo ? -1 : currentIndex

  return (
    <div className="flex items-center gap-0 w-full" role="group" aria-label={`Claim status: ${status}`}>
      {claimTimeline.map((step, i) => {
        const isActive = i <= currentIdx
        const isCurrent = i === currentIdx
        return (
          <div key={step} className="flex items-center flex-1">
            <div className="flex flex-col items-center flex-shrink-0">
              <div className={`flex h-5 w-5 items-center justify-center rounded-full text-[8px] font-bold border-2 transition-colors ${
                isCurrent
                  ? 'border-luma-500 bg-luma-500 text-white'
                  : isActive
                    ? 'border-emerald-400 bg-emerald-400 text-white'
                    : 'border-gray-200 bg-white text-gray-300'
              }`}>
                {isActive && !isCurrent ? '✓' : (i + 1)}
              </div>
              <span className={`text-[9px] mt-1 whitespace-nowrap font-medium ${isCurrent ? 'text-luma-700' : isActive ? 'text-emerald-600' : 'text-gray-400'}`}>
                {step}
              </span>
            </div>
            {i < claimTimeline.length - 1 && (
              <div className={`flex-1 h-0.5 mx-1 -mt-3 ${i < currentIdx ? 'bg-emerald-400' : 'bg-gray-200'}`} />
            )}
          </div>
        )
      })}
      {(isRejected || isAdditionalInfo) && (
        <div className="flex flex-col items-center flex-shrink-0 ml-1">
          <div className={`flex h-5 w-5 items-center justify-center rounded-full text-[8px] font-bold border-2 ${
            isRejected ? 'border-red-400 bg-red-400 text-white' : 'border-orange-400 bg-orange-400 text-white'
          }`}>
            {isRejected ? '✗' : '!'}
          </div>
          <span className={`text-[9px] mt-1 whitespace-nowrap font-medium ${isRejected ? 'text-red-600' : 'text-orange-600'}`}>
            {status}
          </span>
        </div>
      )}
    </div>
  )
}
