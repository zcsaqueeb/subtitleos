import { useNavigate, useRouter } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  /** Fallback destination if there's no browser history (e.g. opened in new tab). */
  fallback?: { to: string; hash?: string };
  label?: string;
  className?: string;
};

/**
 * Smart back button: uses browser history when available, otherwise falls
 * back to a known route. Works consistently across the entire app.
 */
export function BackButton({ fallback = { to: "/" }, label = "Back", className }: Props) {
  const router = useRouter();
  const navigate = useNavigate();
  const onClick = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.history.back();
    } else {
      navigate({ to: fallback.to, hash: fallback.hash } as never);
    }
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground",
        className,
      )}
      aria-label={label}
    >
      <ArrowLeft className="h-4 w-4" /> {label}
    </button>
  );
}
