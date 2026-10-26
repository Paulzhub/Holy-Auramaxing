/**
 * The scroll story's still pictures (storyboard "From chains to freedom",
 * D-118). They are the first paint, the no-JavaScript and reduced-motion
 * version, and what the 3D scene (Phase 9b) fades in over. Decorative:
 * every one is aria-hidden, and the words around it carry the meaning.
 */

type Variant = "whole" | "heavy" | "cracked" | "broken" | "light" | "dawn";

const LINK = { rx: 29, w: 130, h: 58 };

function Chain({ count, y }: { count: number; y: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => {
        const x = -40 + i * 95;
        return i % 2 === 0 ? (
          <rect key={i} x={x} y={y} width={LINK.w} height={LINK.h} rx={LINK.rx} />
        ) : (
          <rect key={i} x={x} y={y + 22} width={LINK.w} height={14} rx={7} />
        );
      })}
    </>
  );
}

export function StoryArt({ variant, className }: { variant: Variant; className?: string }) {
  const common = {
    className: `story-art story-art--${variant} ${className ?? ""}`,
    "aria-hidden": true,
    focusable: false,
  };

  if (variant === "dawn") {
    return (
      <svg viewBox="0 0 400 160" {...common}>
        <path d="M110 150 A 90 90 0 0 1 290 150 Z" className="story-art__sun" />
        <g className="story-art__rays">
          <path d="M200 40 V 22" />
          <path d="M128 72 L 114 58" />
          <path d="M272 72 L 286 58" />
          <path d="M92 118 L 74 112" />
          <path d="M308 118 L 326 112" />
        </g>
        <rect x="0" y="148" width="400" height="3" className="story-art__horizon" />
      </svg>
    );
  }

  if (variant === "light") {
    const dots = [
      [40, 140, 3],
      [80, 110, 2],
      [120, 90, 2.5],
      [160, 128, 2],
      [190, 70, 1.8],
      [220, 104, 3],
      [250, 54, 2],
      [280, 92, 2.6],
      [310, 40, 1.6],
      [340, 120, 3],
      [370, 76, 2],
      [60, 60, 1.6],
      [140, 30, 1.4],
      [300, 140, 2.2],
    ] as const;
    return (
      <svg viewBox="0 0 400 160" {...common}>
        <g className="story-art__light">
          {dots.map(([cx, cy, r]) => (
            <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} />
          ))}
        </g>
      </svg>
    );
  }

  if (variant === "broken") {
    return (
      <svg viewBox="0 0 400 160" {...common}>
        <g className="story-art__chain">
          <rect x="30" y="40" width="110" height="50" rx="25" transform="rotate(-24 85 65)" />
          <rect x="150" y="96" width="110" height="12" rx="6" transform="rotate(16 205 102)" />
          <path d="M300 40 h 34 a 25 25 0 0 1 0 50 h -24" transform="rotate(-18 320 65)" />
          <path d="M230 30 h -30 a 25 25 0 0 0 0 50 h 22" transform="rotate(22 210 55)" />
        </g>
        <g className="story-art__light">
          <circle cx="190" cy="66" r="3" />
          <circle cx="262" cy="52" r="2" />
          <circle cx="150" cy="40" r="2" />
        </g>
      </svg>
    );
  }

  if (variant === "cracked") {
    return (
      <svg viewBox="0 0 400 160" {...common}>
        <circle cx="200" cy="80" r="60" className="story-art__glow" />
        <g className="story-art__chain">
          <rect x="-30" y="51" width="130" height="58" rx="29" />
          <rect x="65" y="73" width="100" height="14" rx="7" />
          <path d="M190 51 H 170 A 29 29 0 0 0 170 109 H 186" />
          <path d="M210 51 H 230 A 29 29 0 0 1 230 109 H 214" />
          <rect x="235" y="73" width="100" height="14" rx="7" />
          <rect x="300" y="51" width="130" height="58" rx="29" />
        </g>
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 960 120" preserveAspectRatio="xMidYMid slice" {...common}>
      <g className="story-art__chain" transform={variant === "heavy" ? "translate(0 18)" : undefined}>
        <Chain count={11} y={30} />
      </g>
    </svg>
  );
}
