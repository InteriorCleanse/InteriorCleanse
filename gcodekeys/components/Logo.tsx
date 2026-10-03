export function LogoIcon({ size = 38 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 128 128" aria-label="GCode Keys" role="img">
      <defs>
        <linearGradient id="gk" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6bffbb" />
          <stop offset=".55" stopColor="#15e37a" />
          <stop offset="1" stopColor="#06a957" />
        </linearGradient>
      </defs>
      <path d="M20 6 H108 L122 20 V108 L108 122 H20 L6 108 V20 Z" fill="#04100b" stroke="rgba(21,227,122,0.35)" strokeWidth="2" />
      <circle cx="54" cy="52" r="26" fill="none" stroke="url(#gk)" strokeWidth="11" />
      <rect x="54" y="45" width="40" height="14" fill="#04100b" />
      <rect x="58" y="46" width="20" height="11" rx="1" fill="url(#gk)" />
      <rect x="48" y="74" width="12" height="40" rx="2" fill="url(#gk)" />
      <rect x="59" y="86" width="13" height="7" fill="#04100b" />
      <rect x="59" y="99" width="9" height="7" fill="#04100b" />
      <rect x="92" y="30" width="12" height="17" rx="1" fill="#6bffbb" />
    </svg>
  )
}

export function Wordmark() {
  return (
    <b>
      G<i>CODE</i> KEYS
    </b>
  )
}
