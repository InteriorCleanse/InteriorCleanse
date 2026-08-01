'use client'

export function SpinIndicator({visible=true, className=''}:{visible?:boolean;className?:string}) {
  return <div aria-hidden="true" className={`spin-indicator ${visible?'is-visible':''} ${className}`}>
    <svg viewBox="0 0 120 120" role="img">
      <circle cx="60" cy="60" r="48" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="6 4" />
      <path d="M108 54l7 6-7 6" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
    <span>Drag to explore</span>
  </div>
}
