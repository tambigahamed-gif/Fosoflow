export function Logo({ light = false, compact = false }: { light?: boolean; compact?: boolean }) {
  return <span className="inline-flex items-center gap-2.5">
    <svg viewBox="0 0 44 44" className="h-10 w-10 shrink-0" role="img" aria-label="">
      <rect x="1" y="1" width="42" height="42" rx="15" fill={light ? '#fff' : '#155B46'} />
      <path d="M11 26.5c3.2-7.5 7.1-11 11-11 4.9 0 8.4 3.5 11 10.8M11 17.5c3.2 7.5 7.1 11 11 11 4.9 0 8.4-3.5 11-10.8" fill="none" stroke={light ? '#155B46' : '#F8F5EC'} strokeWidth="2.7" strokeLinecap="round" />
      <circle cx="11" cy="22" r="2.3" fill="#E0AE3C" /><circle cx="33" cy="22" r="2.3" fill="#C9503B" />
    </svg>
    {!compact && <span className={`font-display text-[1.28rem] font-extrabold tracking-tight ${light ? 'text-white' : 'text-faso-ink'}`}>Faso<span className={light ? 'text-faso-saffron' : 'text-faso-forest'}>Flow</span></span>}
  </span>;
}
