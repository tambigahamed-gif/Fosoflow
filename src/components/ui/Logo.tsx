export function Logo({ light = false, compact = false }: { light?: boolean; compact?: boolean }) {
  return (
    <span
      role="img"
      aria-label="FasoFlow — Achète. Vends. Ça circule."
      className={`inline-flex items-center gap-2 overflow-hidden rounded-xl bg-white p-1 ring-1 ${light ? 'ring-white/30' : 'ring-black/5'}`}
    >
      <img
        src="/images/fasoflow-mark.png"
        alt=""
        aria-hidden="true"
        width="511"
        height="485"
        className="h-9 w-auto shrink-0 object-contain"
      />
      {!compact && (
        <img
          src="/images/fasoflow-wordmark.png"
          alt=""
          aria-hidden="true"
          width="973"
          height="278"
          className="h-8 w-auto max-w-[142px] object-contain"
        />
      )}
    </span>
  );
}
