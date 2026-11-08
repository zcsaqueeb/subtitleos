import { createFileRoute, useNavigate, useSearch, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/lib/supabase-safe";
import { acceptInvite } from "@/lib/workspaces.functions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Users } from "lucide-react";

const SearchSchema = z.object({ token: z.string().optional() });

export const Route = createFileRoute("/team/accept")({
  validateSearch: (s) => SearchSchema.parse(s),
  head: () => ({ meta: [
      { name: "description", content: "Accept an invitation to a shared SubtitleOS workspace." },
      { property: "og:title", content: "Accept invite \u2014 SubtitleOS" },
      { property: "og:description", content: "Accept an invitation to a shared SubtitleOS workspace." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
{ title: "Accept invite — SubtitleOS" }] }),
  component: AcceptInvitePage,
});

function AcceptInvitePage() {
  const { token } = useSearch({ from: "/team/accept" });
  const navigate = useNavigate();
  const acceptFn = useServerFn(acceptInvite);
  const [state, setState] = useState<"checking" | "needs-auth" | "ready" | "working" | "done" | "error">("checking");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    if (!token) {
      setState("error");
      setError("Missing invite token.");
      return;
    }
    supabase.auth.getUser().then(({ data }) => {
      if (!mounted) return;
      setState(data.user ? "ready" : "needs-auth");
    });
    return () => { mounted = false; };
  }, [token]);

  async function handleAccept() {
    if (!token) return;
    setState("working");
    try {
      const res = await acceptFn({ data: { token } });
      setState("done");
      setTimeout(() => navigate({ to: "/team" }), 800);
      void res;
    } catch (e: any) {
      setError(e.message ?? "Failed to accept invite");
      setState("error");
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md items-center p-6">
      <Card className="w-full p-6 text-center">
        <Users className="mx-auto mb-3 h-8 w-8 text-primary" />
        <h1 className="text-xl font-semibold">Workspace invitation</h1>
        {state === "checking" && <p className="mt-3 text-sm text-muted-foreground">Checking your invite…</p>}
        {state === "needs-auth" && (
          <>
            <p className="mt-3 text-sm text-muted-foreground">This invite link can't be used right now.</p>
            <Button asChild variant="outline" className="mt-4 w-full">
              <Link to="/">Go home</Link>
            </Button>
          </>
        )}

        {state === "ready" && (
          <>
            <p className="mt-3 text-sm text-muted-foreground">You're invited to join a workspace.</p>
            <Button onClick={handleAccept} className="mt-4 w-full">Accept invitation</Button>
          </>
        )}
        {state === "working" && <p className="mt-3 text-sm text-muted-foreground">Joining workspace…</p>}
        {state === "done" && <p className="mt-3 text-sm text-emerald-500">Joined! Redirecting…</p>}
        {state === "error" && (
          <>
            <p className="mt-3 text-sm text-destructive">{error}</p>
            <Button asChild variant="outline" className="mt-4 w-full">
              <Link to="/">Go home</Link>
            </Button>
          </>
        )}
      </Card>
    </div>
  );
}
