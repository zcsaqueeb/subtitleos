import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Users, Plus, Copy, Trash2, LogOut, Crown, Shield, Pencil, Eye } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import { PageHeading } from "@/components/workspace-ui";
import {
  listWorkspaces,
  createWorkspace,
  getWorkspaceDetail,
  inviteMember,
  revokeInvite,
  updateMemberRole,
  removeMember,
  leaveWorkspace,
  deleteWorkspace,
} from "@/lib/workspaces.functions";

export const Route = createFileRoute("/_authenticated/team")({
  head: () => ({ meta: [
      { name: "description", content: "Manage shared subtitle workspaces and team projects in SubtitleOS." },
      { property: "og:title", content: "Team workspaces \u2014 SubtitleOS" },
      { property: "og:description", content: "Manage shared subtitle workspaces and team projects in SubtitleOS." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
{ title: "Team workspaces — SubtitleOS" }] }),
  component: () => (
    <AppShell>
      <TeamPage />
    </AppShell>
  ),
});

const ROLE_ICON: Record<string, any> = { owner: Crown, admin: Shield, editor: Pencil, viewer: Eye };

function TeamPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const listFn = useServerFn(listWorkspaces);
  const createFn = useServerFn(createWorkspace);

  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ["workspaces"], queryFn: () => listFn(), retry: false });
  const items = data?.items ?? [];

  const [selected, setSelected] = useState<string | null>(null);
  const [newName, setNewName] = useState("");

  const create = useMutation({
    mutationFn: createFn,
    onSuccess: (res) => {
      toast.success(`Created “${res.workspace.name}”`);
      setNewName("");
      setSelected(res.workspace.id);
      qc.invalidateQueries({ queryKey: ["workspaces"] });
    },
    onError: (e: Error) => toast.error(e.message.includes("row-level security") ? "Workspace creation is not permitted for this account. Your individual studio remains available." : e.message),
  });

  return (
    <div className="space-y-6">
      <PageHeading eyebrow="Collaboration" title="Team workspaces" description="Your shared projects, members and invitations in one place." />
      {!user && <div className="border-l-2 border-primary py-2 pl-4 text-sm text-muted-foreground">Shared workspaces need an existing account session. The open app does not provide account access; your individual studio tools remain available without an account.</div>}
      {isError && <div role="alert" className="text-sm text-destructive">Workspaces couldn't be loaded. <Button variant="link" onClick={() => refetch()}>Try again</Button></div>}
      <div className="flex flex-wrap gap-6 border-b border-border pb-5"><div><p className="text-2xl font-semibold">{items.length}</p><p className="text-xs text-muted-foreground">Workspaces</p></div><div><p className="text-2xl font-semibold">{items.filter((w: any) => w.role === "owner" || w.role === "admin").length}</p><p className="text-xs text-muted-foreground">Managed by you</p></div></div>
      <section className="border-b border-border py-4">
        <div className="mb-3 text-sm font-medium">Create a new workspace</div>
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            if (!newName.trim()) return;
            create.mutate({ data: { name: newName.trim() } });
          }}
        >
          <Input
            placeholder="e.g. Acme Localization"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            maxLength={80}
            aria-label="Workspace name"
            disabled={!user}
          />
          <Button type="submit" disabled={!user || create.isPending || !newName.trim()}>
            <Plus className="mr-1 h-4 w-4" /> Create
          </Button>
        </form>
      </section>

      <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        <div className="min-w-0 space-y-3">
          <div className="px-2 py-1 text-xs uppercase tracking-wide text-muted-foreground">Your workspaces</div>
          <Input aria-label="Search workspaces" placeholder="Search workspaces…" value={search} onChange={e => setSearch(e.target.value)} />
          {isLoading ? (
            <div className="p-3 text-sm text-muted-foreground">Loading…</div>
          ) : items.length === 0 ? (
            <div className="p-3 text-sm text-muted-foreground">No workspaces yet.</div>
          ) : (
            <ul className="space-y-1">
              {items.filter((w: any) => w.name.toLowerCase().includes(search.toLowerCase())).map((w: any) => {
                const Icon = ROLE_ICON[w.role] ?? Users;
                const active = selected === w.id;
                return (
                  <li key={w.id}>
                    <Button variant="ghost"
                      aria-pressed={active}
                      onClick={() => setSelected(w.id)}
                      className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition ${
                        active ? "bg-primary/10 text-primary" : "hover:bg-muted"
                      }`}
                    >
                      <span className="truncate">{w.name}</span>
                      <Icon className="h-3.5 w-3.5 shrink-0 opacity-70" />
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="min-w-0">
          {selected ? (
            <WorkspaceDetail workspaceId={selected} onLeft={() => setSelected(null)} />
          ) : (
            <div className="flex flex-col items-center gap-3 py-12 text-center"><Users className="size-8 text-muted-foreground" /><h2 className="font-medium">{items.length ? "Choose a workspace" : "No shared workspaces"}</h2><p className="max-w-sm text-sm text-muted-foreground">{items.length ? "Members and invitations appear here." : "Existing account workspaces appear here when a session is available."}</p><Button asChild variant="outline"><Link to="/app">Open individual studio</Link></Button></div>
          )}
        </div>
      </div>
    </div>
  );
}

function WorkspaceDetail({ workspaceId, onLeft }: { workspaceId: string; onLeft: () => void }) {
  const qc = useQueryClient();
  const detailFn = useServerFn(getWorkspaceDetail);
  const inviteFn = useServerFn(inviteMember);
  const revokeFn = useServerFn(revokeInvite);
  const updateRoleFn = useServerFn(updateMemberRole);
  const removeFn = useServerFn(removeMember);
  const leaveFn = useServerFn(leaveWorkspace);
  const deleteFn = useServerFn(deleteWorkspace);

  const key = ["workspace", workspaceId];
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: key, queryFn: () => detailFn({ data: { id: workspaceId } }), retry: false });

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "editor" | "viewer">("editor");

  const invalidate = () => qc.invalidateQueries({ queryKey: key });

  const invite = useMutation({
    mutationFn: inviteFn,
    onSuccess: (res) => {
      const link = `${window.location.origin}/team/accept?token=${res.invite.token}`;
      navigator.clipboard.writeText(link).then(() => toast.success("Invite created — link copied to clipboard")).catch(() => toast.success("Invite created. Copy its link from Pending invites."));
      setEmail("");
      invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const revoke = useMutation({
    mutationFn: revokeFn,
    onSuccess: () => { toast.success("Invite revoked"); invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });

  const setRoleM = useMutation({
    mutationFn: updateRoleFn,
    onSuccess: () => { toast.success("Role updated"); invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: removeFn,
    onSuccess: () => { toast.success("Member removed"); invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });

  const leave = useMutation({
    mutationFn: leaveFn,
    onSuccess: () => { toast.success("Left workspace"); onLeft(); qc.invalidateQueries({ queryKey: ["workspaces"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: deleteFn,
    onSuccess: () => { toast.success("Workspace deleted"); onLeft(); qc.invalidateQueries({ queryKey: ["workspaces"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  if (isError) return <div role="alert" className="text-sm text-destructive">Workspace details couldn't be loaded. <Button variant="link" onClick={() => refetch()}>Try again</Button></div>;
  if (isLoading) return <Card className="p-6 text-sm text-muted-foreground">Loading…</Card>;
  if (!data) return <Card className="p-6 text-sm text-muted-foreground">Not found.</Card>;

  const { workspace, members, invites, myRole } = data;
  const canManage = myRole === "owner" || myRole === "admin";
  const isOwner = myRole === "owner";

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-lg font-semibold">{workspace.name}</div>
            <div className="text-xs text-muted-foreground">Your role: {myRole}</div>
          </div>
          <div className="flex gap-2">
            {!isOwner && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => confirm("Leave this workspace?") && leave.mutate({ data: { workspaceId } })}
              >
                <LogOut className="mr-1 h-4 w-4" /> Leave
              </Button>
            )}
            {isOwner && (
              <Button
                size="sm"
                variant="destructive"
                onClick={() => confirm(`Delete “${workspace.name}”? This cannot be undone.`) && del.mutate({ data: { workspaceId } })}
              >
                <Trash2 className="mr-1 h-4 w-4" /> Delete
              </Button>
            )}
          </div>
        </div>
      </Card>

      {canManage && (
        <Card className="p-4">
          <div className="mb-3 text-sm font-medium">Invite a member</div>
          <form
            className="flex flex-col gap-2 sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault();
              if (!email.trim()) return;
              invite.mutate({ data: { workspaceId, email: email.trim(), role } });
            }}
          >
            <Input
              type="email"
              placeholder="teammate@example.com"
              aria-label="Member email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Select value={role} onValueChange={(v) => setRole(v as any)}>
              <SelectTrigger className="sm:w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="editor">Editor</SelectItem>
                <SelectItem value="viewer">Viewer</SelectItem>
              </SelectContent>
            </Select>
            <Button type="submit" disabled={invite.isPending || !email.trim()}>
              <Plus className="mr-1 h-4 w-4" /> Invite
            </Button>
          </form>
          <p className="mt-2 text-xs text-muted-foreground">
            We'll generate a secure invite link and copy it to your clipboard. Share it with the invitee.
          </p>
        </Card>
      )}

      <Card className="p-4">
        <div className="mb-3 text-sm font-medium">Members ({members.length})</div>
        <div className="divide-y divide-border">
          {members.map((m: any) => {
            const Icon = ROLE_ICON[m.role] ?? Users;
            const label = m.profile?.display_name || m.profile?.email || m.user_id.slice(0, 8);
            const sub = m.profile?.email && m.profile?.display_name ? m.profile.email : null;
            const editable = canManage && m.role !== "owner";
            return (
              <div key={m.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm">
                    <Icon className="h-3.5 w-3.5 opacity-70" />
                    <span className="truncate">{label}</span>
                  </div>
                  {sub && <div className="truncate text-xs text-muted-foreground">{sub}</div>}
                </div>
                <div className="flex items-center gap-2">
                  {editable ? (
                    <Select
                      value={m.role}
                      onValueChange={(v) => setRoleM.mutate({ data: { memberId: m.id, role: v as any } })}
                    >
                      <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="editor">Editor</SelectItem>
                        <SelectItem value="viewer">Viewer</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <span className="text-xs text-muted-foreground capitalize">{m.role}</span>
                  )}
                  {editable && (
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Remove ${label}`}
                      title="Remove member"
                      onClick={() => confirm(`Remove ${label}?`) && remove.mutate({ data: { memberId: m.id } })}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {canManage && invites.length > 0 && (
        <Card className="p-4">
          <div className="mb-3 text-sm font-medium">Pending invites ({invites.length})</div>
          <div className="divide-y divide-border">
            {invites.map((inv: any) => {
              const link = `${typeof window !== "undefined" ? window.location.origin : ""}/team/accept?token=${inv.token}`;
              return (
                <div key={inv.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                  <div className="min-w-0">
                    <div className="truncate">{inv.email} <span className="text-xs text-muted-foreground">· {inv.role}</span></div>
                    <div className="text-xs text-muted-foreground">Expires {new Date(inv.expires_at).toLocaleDateString()}</div>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      title="Copy invite link"
                      aria-label="Copy invite link"
                      onClick={() => {
                        navigator.clipboard.writeText(link).then(() => toast.success("Invite link copied")).catch(() => toast.error("Could not copy the invite link"));
                      }}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      title="Revoke"
                      aria-label="Revoke invite"
                      onClick={() => revoke.mutate({ data: { inviteId: inv.id } })}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
