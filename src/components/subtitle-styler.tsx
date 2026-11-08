import { useEffect, useState, type CSSProperties } from "react";
import { Palette, RotateCcw } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export type SubtitleStyle = {
  enabled: boolean;
  fontFamily: string;
  fontSize: number; // px
  fontWeight: number;
  italic: boolean;
  color: string;
  bgColor: string;
  bgOpacity: number; // 0..1
  outline: number; // px
  outlineColor: string;
  letterSpacing: number; // px
  animation: "none" | "fade" | "slide-up" | "pop" | "typewriter";
};

export const FONT_OPTIONS = [
  { id: "inherit", label: "App default" },
  { id: "system-ui", label: "System UI" },
  { id: "'Inter', sans-serif", label: "Inter" },
  { id: "'Roboto', sans-serif", label: "Roboto" },
  { id: "'Open Sans', sans-serif", label: "Open Sans" },
  { id: "'Poppins', sans-serif", label: "Poppins" },
  { id: "'Montserrat', sans-serif", label: "Montserrat" },
  { id: "Georgia, serif", label: "Georgia" },
  { id: "'Times New Roman', serif", label: "Times New Roman" },
  { id: "'Courier New', monospace", label: "Courier" },
  { id: "'Comic Sans MS', cursive", label: "Comic Sans" },
  { id: "Impact, sans-serif", label: "Impact" },
];

export const ANIM_OPTIONS = [
  { id: "none", label: "None" },
  { id: "fade", label: "Fade in" },
  { id: "slide-up", label: "Slide up" },
  { id: "pop", label: "Pop in" },
  { id: "typewriter", label: "Typewriter" },
] as const;

export const DEFAULT_SUBTITLE_STYLE: SubtitleStyle = {
  enabled: false,
  fontFamily: "inherit",
  fontSize: 18,
  fontWeight: 500,
  italic: false,
  color: "#ffffff",
  bgColor: "#000000",
  bgOpacity: 0.8,
  outline: 0,
  outlineColor: "#000000",
  letterSpacing: 0,
  animation: "none",
};

const STORAGE_KEY = "subtitle-style:v1";

export function useSubtitleStyle() {
  const [style, setStyle] = useState<SubtitleStyle>(DEFAULT_SUBTITLE_STYLE);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setStyle({ ...DEFAULT_SUBTITLE_STYLE, ...JSON.parse(raw) });
    } catch {
      // ignore
    }
  }, []);
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(style)); } catch { /* ignore */ }
  }, [style]);
  return [style, setStyle] as const;
}

function hexToRgba(hex: string, alpha: number) {
  const m = hex.replace("#", "");
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function subtitleCssVars(s: SubtitleStyle): CSSProperties {
  if (!s.enabled) return {};
  const shadow = s.outline > 0
    ? `${s.outline}px 0 0 ${s.outlineColor}, -${s.outline}px 0 0 ${s.outlineColor}, 0 ${s.outline}px 0 ${s.outlineColor}, 0 -${s.outline}px 0 ${s.outlineColor}`
    : undefined;
  return {
    fontFamily: s.fontFamily === "inherit" ? undefined : s.fontFamily,
    fontSize: `${s.fontSize}px`,
    fontWeight: s.fontWeight,
    fontStyle: s.italic ? "italic" : "normal",
    color: s.color,
    backgroundColor: hexToRgba(s.bgColor, s.bgOpacity),
    letterSpacing: `${s.letterSpacing}px`,
    textShadow: shadow,
    lineHeight: 1.35,
  };
}

export function subtitleAnimClass(s: SubtitleStyle): string {
  if (!s.enabled || s.animation === "none") return "";
  switch (s.animation) {
    case "fade": return "animate-[subFade_240ms_ease-out]";
    case "slide-up": return "animate-[subSlideUp_260ms_ease-out]";
    case "pop": return "animate-[subPop_220ms_cubic-bezier(.34,1.56,.64,1)]";
    case "typewriter": return "animate-[subFade_120ms_ease-out]";
    default: return "";
  }
}

export function SubtitleStylerButton({
  style,
  onChange,
}: {
  style: SubtitleStyle;
  onChange: (s: SubtitleStyle) => void;
}) {
  const set = <K extends keyof SubtitleStyle>(k: K, v: SubtitleStyle[K]) =>
    onChange({ ...style, [k]: v });

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
            style.enabled
              ? "border-gold/50 bg-gold/10 text-gold"
              : "border-border bg-card hover:bg-accent"
          }`}
          title="Subtitle styling"
        >
          <Palette className="h-3.5 w-3.5" />
          Style {style.enabled ? "· on" : ""}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[320px] p-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium">Subtitle styling</div>
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={style.enabled}
              onChange={(e) => set("enabled", e.target.checked)}
            />
            Enable
          </label>
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Off by default. Toggle on to apply your custom look to the live preview.
        </p>

        <div className={`mt-3 space-y-3 ${style.enabled ? "" : "opacity-50 pointer-events-none"}`}>
          <Row label="Font">
            <select
              value={style.fontFamily}
              onChange={(e) => set("fontFamily", e.target.value)}
              className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs"
            >
              {FONT_OPTIONS.map((f) => (
                <option key={f.id} value={f.id}>{f.label}</option>
              ))}
            </select>
          </Row>

          <div className="grid grid-cols-2 gap-2">
            <Row label={`Size ${style.fontSize}px`}>
              <input type="range" min={10} max={48} value={style.fontSize}
                onChange={(e) => set("fontSize", Number(e.target.value))}
                className="w-full accent-gold" />
            </Row>
            <Row label={`Weight ${style.fontWeight}`}>
              <input type="range" min={300} max={900} step={100} value={style.fontWeight}
                onChange={(e) => set("fontWeight", Number(e.target.value))}
                className="w-full accent-gold" />
            </Row>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Row label="Text color">
              <input type="color" value={style.color}
                onChange={(e) => set("color", e.target.value)}
                className="h-8 w-full rounded-md border border-border bg-background" />
            </Row>
            <Row label="Background">
              <input type="color" value={style.bgColor}
                onChange={(e) => set("bgColor", e.target.value)}
                className="h-8 w-full rounded-md border border-border bg-background" />
            </Row>
          </div>

          <Row label={`Background opacity ${Math.round(style.bgOpacity * 100)}%`}>
            <input type="range" min={0} max={1} step={0.05} value={style.bgOpacity}
              onChange={(e) => set("bgOpacity", Number(e.target.value))}
              className="w-full accent-gold" />
          </Row>

          <div className="grid grid-cols-2 gap-2">
            <Row label={`Outline ${style.outline}px`}>
              <input type="range" min={0} max={4} value={style.outline}
                onChange={(e) => set("outline", Number(e.target.value))}
                className="w-full accent-gold" />
            </Row>
            <Row label="Outline color">
              <input type="color" value={style.outlineColor}
                onChange={(e) => set("outlineColor", e.target.value)}
                className="h-8 w-full rounded-md border border-border bg-background" />
            </Row>
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs">
              <input type="checkbox" checked={style.italic}
                onChange={(e) => set("italic", e.target.checked)} />
              Italic
            </label>
            <div className="flex-1" />
            <span className="text-[11px] text-muted-foreground">Spacing</span>
            <input type="range" min={-1} max={4} step={0.5} value={style.letterSpacing}
              onChange={(e) => set("letterSpacing", Number(e.target.value))}
              className="w-24 accent-gold" />
          </div>

          <Row label="Animation">
            <select
              value={style.animation}
              onChange={(e) => set("animation", e.target.value as SubtitleStyle["animation"])}
              className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs"
            >
              {ANIM_OPTIONS.map((a) => (
                <option key={a.id} value={a.id}>{a.label}</option>
              ))}
            </select>
          </Row>
        </div>

        <div className="mt-3 flex justify-between">
          <button
            type="button"
            onClick={() => onChange(DEFAULT_SUBTITLE_STYLE)}
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="h-3 w-3" /> Reset
          </button>
          <span className="text-[11px] text-muted-foreground">Saved to this device</span>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
