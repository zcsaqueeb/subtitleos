import { useEffect, useState } from "react";
import { WifiOff, Wifi } from "lucide-react";

/**
 * Shows an in-flow banner when the browser loses its internet connection,
 * and a brief "back online" confirmation when it returns.
 */
export function OfflineBanner() {
  const [online, setOnline] = useState(true);
  const [wasOffline, setWasOffline] = useState(false);

  useEffect(() => {
    setOnline(navigator.onLine);
    const goOffline = () => {
      setOnline(false);
      setWasOffline(true);
    };
    const goOnline = () => setOnline(true);
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, []);

  // Hide the "back online" note after a few seconds.
  useEffect(() => {
    if (!online || !wasOffline) return;
    const t = window.setTimeout(() => setWasOffline(false), 4000);
    return () => window.clearTimeout(t);
  }, [online, wasOffline]);

  if (online && !wasOffline) return null;

  return (
    <div
      role={online ? "status" : "alert"}
      className={`relative z-40 flex items-center justify-center gap-2 px-4 py-2 text-center text-sm font-medium ${
        online
          ? "bg-primary text-primary-foreground"
          : "bg-destructive text-destructive-foreground"
      }`}
    >
      {online ? (
        <>
          <Wifi className="h-4 w-4 shrink-0" aria-hidden />
          You're back online.
        </>
      ) : (
        <>
          <WifiOff className="h-4 w-4 shrink-0" aria-hidden />
          No internet connection. Online requests are unavailable. Keep this page open to preserve selected media.
        </>
      )}
    </div>
  );
}
