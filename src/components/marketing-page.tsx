import logoUrl from "@/assets/logo.png";
import { Link } from "@tanstack/react-router";
import { motion } from "motion/react";
import { ArrowLeft, Sparkles } from "lucide-react";
import { ReactNode } from "react";

export function MarketingPage({
  eyebrow,
  title,
  lede,
  children,
}: {
  eyebrow: string;
  title: ReactNode;
  lede?: string;
  children: ReactNode;
}) {
  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_0%,oklch(0.82_0.15_80/0.15),transparent)]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,transparent,oklch(0.05_0_0)_85%)]" />
      </div>

      <header className="sticky top-0 z-50">
        <div className="mx-auto mt-3 max-w-6xl px-4">
          <div className="glass flex items-center justify-between rounded-2xl px-4 py-3">
            <Link to="/" className="flex items-center gap-2">
              <img src={logoUrl} alt="" width={32} height={32} className="size-8 shrink-0 rounded-lg" />
<span className="font-display text-xl">SubtitleOS</span>
            </Link>
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Home
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 pt-16 pb-24 sm:pt-24">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/50 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            <Sparkles className="h-3 w-3 text-gold" /> {eyebrow}
          </div>
          <h1 className="mt-5 font-display text-5xl leading-tight tracking-tight sm:text-6xl">
            {title}
          </h1>
          {lede && <p className="mt-5 text-lg text-muted-foreground">{lede}</p>}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
          className="mt-12 max-w-none text-foreground/80 [&_h2]:mt-12 [&_h2]:mb-3 [&_h2]:font-display [&_h2]:text-3xl [&_h2]:tracking-tight [&_h2]:text-foreground [&_h3]:mt-8 [&_h3]:mb-2 [&_h3]:font-display [&_h3]:text-xl [&_h3]:text-foreground [&_p]:my-4 [&_p]:leading-relaxed [&_ul]:my-4 [&_ul]:list-disc [&_ul]:pl-6 [&_li]:my-1.5 [&_a]:text-gold [&_a]:underline-offset-4 hover:[&_a]:underline [&_strong]:text-foreground [&_code]:rounded [&_code]:bg-card [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-xs [&_pre]:my-4 [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:border [&_pre]:border-border [&_pre]:bg-card/60 [&_pre]:p-4 [&_pre]:text-xs [&_pre_code]:bg-transparent [&_pre_code]:p-0"
        >
          {children}
        </motion.div>
      </main>

      <footer className="border-t border-border py-8">
        <div className="mx-auto max-w-6xl px-4 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} SubtitleOS. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
