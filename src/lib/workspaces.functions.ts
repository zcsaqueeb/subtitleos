import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { supabase: any; userId: string; claims?: any };

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "workspace";
}

export const listWorkspaces = createServerFn({ method: "GET" })
  .handler(async () => {
    const { getOptionalUser } = await import("./optional-auth.server");
    const auth = await getOptionalUser();
    if (!auth) return { items: [] as any[] };
    const { supabase, userId } = auth as unknown as Ctx;
    const { data: members, error } = await supabase
      .from("workspace_members")
      .select("role, workspace_id, workspaces:workspace_id(id, name, slug, owner_id, created_at)")
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    const items = (members ?? [])
      .filter((m: any) => m.workspaces)
      .map((m: any) => ({ ...m.workspaces, role: m.role }));
    return { items };
  });

export const createWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ name: z.string().min(1).max(80) }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    const base = slugify(data.name);
    const slug = `${base}-${Math.random().toString(36).slice(2, 7)}`;
    const { data: ws, error } = await supabase
      .from("workspaces")
      .insert({ name: data.name, slug, owner_id: userId })
      .select("id, name, slug, owner_id, created_at")
      .single();
    if (error) throw new Error(error.message);
    const { error: mErr } = await supabase
      .from("workspace_members")
      .insert({ workspace_id: ws.id, user_id: userId, role: "owner" });
    if (mErr) throw new Error(mErr.message);
    return { workspace: { ...ws, role: "owner" as const } };
  });

export const getWorkspaceDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    const { data: ws, error } = await supabase
      .from("workspaces")
      .select("id, name, slug, owner_id, created_at")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!ws) throw new Error("Workspace not found");

    const { data: members } = await supabase
      .from("workspace_members")
      .select("id, user_id, role, created_at")
      .eq("workspace_id", data.id)
      .order("created_at");

    // Enrich with profile emails (best-effort)
    const ids = (members ?? []).map((m: any) => m.user_id);
    let profilesById = new Map<string, any>();
    if (ids.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, email, display_name, avatar_url")
        .in("id", ids);
      profilesById = new Map((profs ?? []).map((p: any) => [p.id, p]));
    }
    const membersEnriched = (members ?? []).map((m: any) => ({
      ...m,
      profile: profilesById.get(m.user_id) ?? null,
    }));

    const { data: invites } = await supabase
      .from("workspace_invites")
      .select("id, email, role, token, expires_at, accepted_at, created_at")
      .eq("workspace_id", data.id)
      .is("accepted_at", null)
      .order("created_at", { ascending: false });

    const myRole = (members ?? []).find((m: any) => m.user_id === userId)?.role ?? null;
    return { workspace: ws, members: membersEnriched, invites: invites ?? [], myRole };
  });

const RoleSchema = z.enum(["admin", "editor", "viewer"]);

export const inviteMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      workspaceId: z.string().uuid(),
      email: z.string().email().max(255),
      role: RoleSchema.default("editor"),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    const email = data.email.toLowerCase().trim();
    const { data: invite, error } = await supabase
      .from("workspace_invites")
      .insert({
        workspace_id: data.workspaceId,
        email,
        role: data.role,
        invited_by: userId,
      })
      .select("id, email, role, token, expires_at")
      .single();
    if (error) throw new Error(error.message);
    return { invite };
  });

export const revokeInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ inviteId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase } = context as Ctx;
    const { error } = await supabase.from("workspace_invites").delete().eq("id", data.inviteId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateMemberRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ memberId: z.string().uuid(), role: RoleSchema }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context as Ctx;
    const { error } = await supabase
      .from("workspace_members")
      .update({ role: data.role })
      .eq("id", data.memberId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removeMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ memberId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase } = context as Ctx;
    const { error } = await supabase.from("workspace_members").delete().eq("id", data.memberId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const leaveWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ workspaceId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    const { error } = await supabase
      .from("workspace_members")
      .delete()
      .eq("workspace_id", data.workspaceId)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ workspaceId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase } = context as Ctx;
    const { error } = await supabase.from("workspaces").delete().eq("id", data.workspaceId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const acceptInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ token: z.string().min(8).max(128) }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context as Ctx;
    const userEmail = String(claims?.email ?? "").toLowerCase();
    const { data: invite, error } = await supabase
      .from("workspace_invites")
      .select("id, workspace_id, email, role, expires_at, accepted_at")
      .eq("token", data.token)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!invite) throw new Error("Invite not found");
    if (invite.accepted_at) throw new Error("Invite already used");
    if (new Date(invite.expires_at).getTime() < Date.now()) throw new Error("Invite expired");
    if (userEmail && invite.email.toLowerCase() !== userEmail) {
      throw new Error(`This invite is for ${invite.email}. Sign in with that email to accept.`);
    }
    // Add membership via admin to bypass member-insert RLS (which only allows self-owner inserts)
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: mErr } = await supabaseAdmin
      .from("workspace_members")
      .upsert(
        { workspace_id: invite.workspace_id, user_id: userId, role: invite.role },
        { onConflict: "workspace_id,user_id" },
      );
    if (mErr) throw new Error(mErr.message);
    await supabaseAdmin
      .from("workspace_invites")
      .update({ accepted_at: new Date().toISOString() })
      .eq("id", invite.id);
    return { workspaceId: invite.workspace_id };
  });
