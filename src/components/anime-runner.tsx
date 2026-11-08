import { motion } from "motion/react";

type Props = {
  label?: string;
  size?: "sm" | "md" | "lg";
};

/**
 * Anime-style chibi character running loader.
 * Pure SVG + Motion — no external assets.
 */
export function AnimeRunner({ label = "Loading…", size = "md" }: Props) {
  const dims = size === "sm" ? 64 : size === "lg" ? 160 : 112;

  return (
    <div className="flex flex-col items-center justify-center gap-3">
      <div
        className="relative overflow-hidden rounded-xl"
        style={{ width: dims * 2.2, height: dims }}
      >
        {/* sky gradient */}
        <div className="absolute inset-0 bg-gradient-to-b from-gold/5 via-transparent to-gold/10" />

        {/* parallax ground stripes */}
        <motion.div
          className="absolute bottom-2 left-0 flex h-[2px] w-[200%] gap-3"
          animate={{ x: ["0%", "-50%"] }}
          transition={{ duration: 0.6, repeat: Infinity, ease: "linear" }}
        >
          {Array.from({ length: 20 }).map((_, i) => (
            <span key={i} className="h-full w-6 shrink-0 rounded-full bg-gold/40" />
          ))}
        </motion.div>

        {/* dust puffs */}
        {[0, 0.15, 0.3].map((delay, i) => (
          <motion.span
            key={i}
            className="absolute bottom-2 left-[42%] h-1.5 w-1.5 rounded-full bg-gold/30"
            animate={{
              x: [-2, -14, -22],
              y: [0, -4, 0],
              opacity: [0.7, 0.3, 0],
              scale: [0.6, 1, 1.4],
            }}
            transition={{ duration: 0.7, repeat: Infinity, delay, ease: "easeOut" }}
          />
        ))}

        {/* runner — bobs in place */}
        <motion.div
          className="absolute left-1/2 -translate-x-1/2"
          style={{ bottom: 6, width: dims * 0.55, height: dims * 0.85 }}
          animate={{ y: [0, -4, 0, -2, 0] }}
          transition={{ duration: 0.5, repeat: Infinity, ease: "easeInOut" }}
        >
          <svg viewBox="0 0 100 140" className="h-full w-full">
            <defs>
              <linearGradient id="hairGrad" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--gold, 45 90% 60%))" />
                <stop offset="100%" stopColor="#8a5a00" />
              </linearGradient>
              <linearGradient id="shirtGrad" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#1f2937" />
                <stop offset="100%" stopColor="#0b1220" />
              </linearGradient>
            </defs>

            {/* scarf flutter */}
            <motion.path
              d="M55 56 Q75 56 88 50 Q80 60 60 64 Z"
              fill="#e94560"
              animate={{ d: [
                "M55 56 Q75 56 88 50 Q80 60 60 64 Z",
                "M55 56 Q78 60 92 58 Q82 66 60 66 Z",
                "M55 56 Q75 56 88 50 Q80 60 60 64 Z",
              ] }}
              transition={{ duration: 0.6, repeat: Infinity, ease: "easeInOut" }}
            />

            {/* head */}
            <circle cx="50" cy="36" r="20" fill="#ffe0bd" />
            {/* hair — spiky anime */}
            <path
              d="M30 36 Q28 18 44 14 Q50 6 60 14 Q74 18 70 36 Q66 24 58 24 Q54 18 50 24 Q44 22 40 28 Q34 28 30 36 Z"
              fill="url(#hairGrad)"
            />
            {/* side bangs */}
            <path d="M32 34 L36 44 L40 34 Z" fill="url(#hairGrad)" />
            <path d="M60 34 L64 46 L68 34 Z" fill="url(#hairGrad)" />

            {/* eyes (big anime style) */}
            <ellipse cx="43" cy="40" rx="2.4" ry="3.6" fill="#0b1220" />
            <ellipse cx="57" cy="40" rx="2.4" ry="3.6" fill="#0b1220" />
            <circle cx="43.6" cy="38.8" r="0.9" fill="#fff" />
            <circle cx="57.6" cy="38.8" r="0.9" fill="#fff" />
            {/* blush */}
            <circle cx="38" cy="46" r="2" fill="#ffb3b3" opacity="0.7" />
            <circle cx="62" cy="46" r="2" fill="#ffb3b3" opacity="0.7" />
            {/* mouth */}
            <path d="M47 48 Q50 51 53 48" stroke="#0b1220" strokeWidth="1.2" fill="none" strokeLinecap="round" />

            {/* torso */}
            <path d="M36 56 L64 56 L62 92 L38 92 Z" fill="url(#shirtGrad)" />
            {/* belt */}
            <rect x="38" y="88" width="24" height="4" fill="hsl(var(--gold, 45 90% 60%))" />

            {/* arms — swing opposite to legs */}
            <motion.g
              style={{ transformOrigin: "40px 60px" }}
              animate={{ rotate: [-40, 40, -40] }}
              transition={{ duration: 0.5, repeat: Infinity, ease: "easeInOut" }}
            >
              <rect x="34" y="58" width="8" height="22" rx="4" fill="#ffe0bd" />
            </motion.g>
            <motion.g
              style={{ transformOrigin: "60px 60px" }}
              animate={{ rotate: [40, -40, 40] }}
              transition={{ duration: 0.5, repeat: Infinity, ease: "easeInOut" }}
            >
              <rect x="58" y="58" width="8" height="22" rx="4" fill="#ffe0bd" />
            </motion.g>

            {/* legs — running cycle */}
            <motion.g
              style={{ transformOrigin: "44px 92px" }}
              animate={{ rotate: [45, -45, 45] }}
              transition={{ duration: 0.5, repeat: Infinity, ease: "easeInOut" }}
            >
              <rect x="40" y="92" width="8" height="28" rx="3" fill="#0b1220" />
              <rect x="38" y="118" width="14" height="6" rx="2" fill="hsl(var(--gold, 45 90% 60%))" />
            </motion.g>
            <motion.g
              style={{ transformOrigin: "56px 92px" }}
              animate={{ rotate: [-45, 45, -45] }}
              transition={{ duration: 0.5, repeat: Infinity, ease: "easeInOut" }}
            >
              <rect x="52" y="92" width="8" height="28" rx="3" fill="#0b1220" />
              <rect x="50" y="118" width="14" height="6" rx="2" fill="hsl(var(--gold, 45 90% 60%))" />
            </motion.g>
          </svg>
        </motion.div>

        {/* speed lines */}
        {[0, 0.1, 0.2, 0.3].map((delay, i) => (
          <motion.span
            key={`s${i}`}
            className="absolute h-[2px] w-8 rounded-full bg-gold/50"
            style={{ top: `${20 + i * 14}%`, right: 4 }}
            animate={{ x: [0, -dims * 1.8], opacity: [0, 1, 0] }}
            transition={{ duration: 0.5, repeat: Infinity, delay, ease: "easeIn" }}
          />
        ))}
      </div>

      {label && (
        <span className="text-sm text-muted-foreground">
          {label}
        </span>
      )}
    </div>
  );
}
