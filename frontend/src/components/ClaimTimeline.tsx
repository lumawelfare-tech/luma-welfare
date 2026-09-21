const claimTimeline = ['Draft', 'Submitted', 'Under Review', 'Approved', 'Paid'] as const

export type { ClaimTimelineProps } from './ClaimTimeline.types'

export function ClaimTimeline({ status }: { status: string }) {
  const currentIndex = claimTimeline.indexOf(status as (typeof claimTimeline)[number])
  const isRejected = status === 'Rejected'
  const isAdditionalInfo = status === 'Additional Information Required'
  const currentIdx = isRejected || isAdditionalInfo ? -1 : currentIndex

  return (
    <div className="w-full min-w-0 overflow-x-auto pb-1" role="group" aria-label={`Claim status: ${status}`}>
      <div className="flex min-w-[17.5rem] items-center gap-0 sm:min-w-0">
        {claimTimeline.map((step, i) => {
          const isActive = i <= currentIdx
          const isCurrent = i === currentIdx
          return (
            <div key={step} className="flex min-w-0 flex-1 items-center">
              <div className="flex max-w-full flex-shrink-0 flex-col items-center px-0.5">
                <div
                  className={`flex h-6 w-6 items-center justify-center rounded-full border-2 text-[9px] font-bold transition-colors sm:h-5 sm:w-5 sm:text-[8px] ${
                    isCurrent
                      ? 'border-luma-500 bg-luma-500 text-white'
                      : isActive
                        ? 'border-emerald-400 bg-emerald-400 text-white'
                        : 'border-gray-200 bg-white text-gray-300'
                  }`}
                >
                  {isActive && !isCurrent ? '✓' : (i + 1)}
                </div>
                <span
                  title={step}
                  className={`mt-1 max-w-[3.5rem] truncate text-center text-[10px] font-medium leading-tight sm:max-w-none sm:whitespace-nowrap sm:text-[9px] ${
                    isCurrent ? 'text-luma-700' : isActive ? 'text-emerald-600' : 'text-gray-400'
                  }`}
                >
                  {step}
                </span>
              </div>
              {i < claimTimeline.length - 1 && (
                <div className={`mx-0.5 h-0.5 flex-1 -mt-3 sm:mx-1 ${i < currentIdx ? 'bg-emerald-400' : 'bg-gray-200'}`} />
              )}
            </div>
          )
        })}
        {(isRejected || isAdditionalInfo) && (
          <div className="ml-1 flex max-w-[5.5rem] flex-shrink-0 flex-col items-center sm:max-w-none">
            <div
              className={`flex h-6 w-6 items-center justify-center rounded-full border-2 text-[9px] font-bold sm:h-5 sm:w-5 sm:text-[8px] ${
                isRejected ? 'border-red-400 bg-red-400 text-white' : 'border-orange-400 bg-orange-400 text-white'
              }`}
            >
              {isRejected ? '✗' : '!'}
            </div>
            <span
              title={status}
              className={`mt-1 truncate text-center text-[10px] font-medium leading-tight sm:whitespace-nowrap sm:text-[9px] ${
                isRejected ? 'text-red-600' : 'text-orange-600'
              }`}
            >
              {status}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
