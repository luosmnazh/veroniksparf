export function Monogram({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 128 128" aria-label="Veroniks" role="img">
      <path
        d="M28 24 h72 v38 c0 24 -16 37 -36 44 c-20 -7 -36 -20 -36 -44 z"
        fill="#1E3328"
        stroke="#C9A45C"
        strokeWidth="2.5"
      />
      <path
        d="M34 30 h60 v31 c0 20 -13 31 -30 37 c-17 -6 -30 -17 -30 -37 z"
        fill="none"
        stroke="#8C7340"
        strokeWidth="1"
      />
      <path d="M44 40 h15 l7 28 l7 -28 h13 l-14 46 h-13 z" fill="#C9A45C" />
      <circle cx="64" cy="33" r="2.2" fill="#C9A45C" />
    </svg>
  );
}
