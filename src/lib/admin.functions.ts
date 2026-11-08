import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const RoleEnum = z.enum(["admin", "moderator", "user"]);

async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin only");
}

const SortColEnum = z.enum(["created_at", "email", "display_name", "banned"]);
const RoleFilterEnum = z.enum(["any", "admin", "moderator", "user", "none"]);
const StatusFilterEnum = z.enum(["any", "active", "banned"]);

const overviewInputSchema = z.object({
  search: z.string().optional(),
  page: z.number().int().min(1).default(1),
  perPage: z.number().int().min(1).max(100).default(20),
  sort: SortColEnum.default("created_at"),
  dir: z.enum(["asc", "desc"]).default("desc"),
  roleFilter: RoleFilterEnum.default("any"),
  status: StatusFilterEnum.default("any"),
  exportAll: z.boolean().default(false),
});

export const getAdminOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => overviewInputSchema.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const search = (data.search ?? "").trim();
    const page = data.page;
    const perPage = data.perPage;
    const ascending = data.dir === "asc";

    // Resolve role filter to a set of user ids (if applicable)
    let restrictIds: string[] | null = null;
    let excludeIds: string[] | null = null;
    if (data.roleFilter === "admin" || data.roleFilter === "moderator") {
      const { data: rows } = await supabaseAdmin
        .from("user_roles")
        .select("user_id")
        .eq("role", data.roleFilter);
      restrictIds = Array.from(new Set((rows ?? []).map((r) => r.user_id)));
      if (restrictIds.length === 0) restrictIds = ["00000000-0000-0000-0000-000000000000"];
    } else if (data.roleFilter === "none" || data.roleFilter === "user") {
      const { data: rows } = await supabaseAdmin
        .from("user_roles")
        .select("user_id, role")
        .in("role", ["admin", "moderator"]);
      excludeIds = Array.from(new Set((rows ?? []).map((r) => r.user_id)));
    }

    let profilesQuery = supabaseAdmin
      .from("profiles")
      .select(
        "id, email, display_name, avatar_url, banned, hide_email, created_at, updated_at",
        { count: "exact" },
      )
      .order(data.sort, { ascending, nullsFirst: false });

    if (search) {
      const safe = search.replace(/[%_]/g, "");
      profilesQuery = profilesQuery.or(
        `email.ilike.%${safe}%,display_name.ilike.%${safe}%,id.ilike.%${safe}%`,
      );
    }
    if (data.status === "banned") profilesQuery = profilesQuery.eq("banned", true);
    else if (data.status === "active") profilesQuery = profilesQuery.eq("banned", false);
    if (restrictIds) profilesQuery = profilesQuery.in("id", restrictIds);
    if (excludeIds && excludeIds.length > 0) {
      profilesQuery = profilesQuery.not("id", "in", `(${excludeIds.join(",")})`);
    }

    if (!data.exportAll) {
      const from = (page - 1) * perPage;
      const to = from + perPage - 1;
      profilesQuery = profilesQuery.range(from, to);
    }

    const [
      profilesResult,
      globalCountResult,
      translations,
      roles,
      apiKeys,
    ] = await Promise.all([
      profilesQuery,
      supabaseAdmin.from("profiles").select("*", { count: "exact", head: true }),
      supabaseAdmin
        .from("translations")
        .select(
          "id, user_id, file_name, source_lang, target_lang, status, char_count, duration_ms, created_at, completed_at",
        )
        .order("created_at", { ascending: false }),
      supabaseAdmin.from("user_roles").select("user_id, role"),
      supabaseAdmin
        .from("api_keys")
        .select("id, user_id, name, key_prefix, last_used_at, usage_count, revoked, created_at"),
    ]);

    const authByUser: Record<
      string,
      { last_sign_in_at: string | null; email_confirmed_at: string | null; providers: string[] }
    > = {};
    try {
      let authPage = 1;
      const authPerPage = 1000;
      for (let i = 0; i < 10; i++) {
        const { data: authList, error: authErr } =
          await supabaseAdmin.auth.admin.listUsers({ page: authPage, perPage: authPerPage });
        if (authErr) break;
        const users = authList?.users ?? [];
        for (const u of users) {
          const identities = (u as any).identities ?? [];
          const providers = Array.from(
            new Set<string>(
              identities
                .map((i: any) => i.provider)
                .filter((p: any): p is string => typeof p === "string"),
            ),
          );
          authByUser[u.id] = {
            last_sign_in_at: u.last_sign_in_at ?? null,
            email_confirmed_at: (u as any).email_confirmed_at ?? null,
            providers: providers.length ? providers : ["email"],
          };
        }
        if (users.length < authPerPage) break;
        authPage++;
      }
    } catch {
      // If listUsers fails (e.g. service role missing), continue without auth meta.
    }

    const rolesByUser: Record<string, string[]> = {};
    for (const r of roles.data ?? []) {
      rolesByUser[r.user_id] = [...(rolesByUser[r.user_id] ?? []), r.role];
    }

    const txByUser: Record<string, number> = {};
    const charsByUser: Record<string, number> = {};
    const recentTxByUser: Record<string, Array<{
      id: string;
      file_name: string | null;
      source_lang: string;
      target_lang: string;
      status: string;
      char_count: number | null;
      created_at: string;
    }>> = {};
    const lastActivityByUser: Record<string, string> = {};
    const langPairs: Record<string, number> = {};
    let totalChars = 0;
    let completed = 0;
    let failed = 0;
    for (const t of translations.data ?? []) {
      txByUser[t.user_id] = (txByUser[t.user_id] ?? 0) + 1;
      charsByUser[t.user_id] = (charsByUser[t.user_id] ?? 0) + (t.char_count ?? 0);
      totalChars += t.char_count ?? 0;
      const key = `${t.source_lang}→${t.target_lang}`;
      langPairs[key] = (langPairs[key] ?? 0) + 1;
      if (t.status === "completed") completed++;
      else if (t.status === "failed") failed++;
      const arr = recentTxByUser[t.user_id] ?? [];
      if (arr.length < 5) {
        arr.push({
          id: t.id,
          file_name: t.file_name,
          source_lang: t.source_lang,
          target_lang: t.target_lang,
          status: t.status,
          char_count: t.char_count,
          created_at: t.created_at,
        });
        recentTxByUser[t.user_id] = arr;
      }
      const last = lastActivityByUser[t.user_id];
      if (!last || t.created_at > last) lastActivityByUser[t.user_id] = t.created_at;
    }

    const apiKeysByUser: Record<string, Array<{
      id: string;
      name: string;
      key_prefix: string;
      last_used_at: string | null;
      usage_count: number;
      revoked: boolean;
      created_at: string;
    }>> = {};
    for (const k of apiKeys.data ?? []) {
      const arr = apiKeysByUser[k.user_id] ?? [];
      arr.push({
        id: k.id,
        name: k.name,
        key_prefix: k.key_prefix,
        last_used_at: k.last_used_at,
        usage_count: k.usage_count ?? 0,
        revoked: !!k.revoked,
        created_at: k.created_at,
      });
      apiKeysByUser[k.user_id] = arr;
    }

    const users = (profilesResult.data ?? []).map((p) => ({
      ...p,
      roles: rolesByUser[p.id] ?? [],
      translation_count: txByUser[p.id] ?? 0,
      total_chars: charsByUser[p.id] ?? 0,
      last_activity_at: lastActivityByUser[p.id] ?? null,
      recent_translations: recentTxByUser[p.id] ?? [],
      api_keys: apiKeysByUser[p.id] ?? [],
      auth: authByUser[p.id] ?? {
        last_sign_in_at: null,
        email_confirmed_at: null,
        providers: [],
      },
    }));

    return {
      stats: {
        total_users: globalCountResult.count ?? 0,
        total_translations: translations.data?.length ?? 0,
        completed,
        failed,
        total_chars: totalChars,
      },
      pagination: {
        page,
        perPage,
        total: profilesResult.count ?? 0,
      },
      top_lang_pairs: Object.entries(langPairs)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([pair, count]) => ({ pair, count })),
      users,
    };
  });

export const setUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      targetUserId: z.string().uuid(),
      role: RoleEnum,
      grant: z.boolean(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (data.grant) {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .insert({ user_id: data.targetUserId, role: data.role });
      if (error && !error.message.includes("duplicate")) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .delete()
        .eq("user_id", data.targetUserId)
        .eq("role", data.role);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const setUserBanned = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ targetUserId: z.string().uuid(), banned: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ banned: data.banned })
      .eq("id", data.targetUserId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminRevokeApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ keyId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("api_keys")
      .update({ revoked: true })
      .eq("id", data.keyId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============================================================
// Contact messages inbox
// ============================================================

export const listContactMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        filter: z.enum(["all", "unread", "read"]).default("all"),
        status: z.enum(["any", "new", "in_progress", "resolved"]).default("any"),
        search: z.string().trim().max(200).default(""),
        dateFrom: z.string().datetime().optional(),
        dateTo: z.string().datetime().optional(),
        page: z.number().int().min(1).default(1),
        perPage: z.number().int().min(1).max(100).default(20),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const from = (data.page - 1) * data.perPage;
    const to = from + data.perPage - 1;
    let q = supabase
      .from("contact_messages")
      .select("id, email, message, handled, status, created_at, user_id, attachments", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);
    if (data.filter === "unread") q = q.eq("handled", false);
    if (data.filter === "read") q = q.eq("handled", true);
    if (data.status !== "any") q = q.eq("status", data.status);
    if (data.dateFrom) q = q.gte("created_at", data.dateFrom);
    if (data.dateTo) q = q.lte("created_at", data.dateTo);
    if (data.search) {
      const term = data.search.replace(/[%,]/g, " ");
      const like = `%${term}%`;
      q = q.or(`email.ilike.${like},message.ilike.${like}`);
    }
    const { data: rows, error, count: total } = await q;
    if (error) throw new Error(error.message);
    const ids = (rows ?? []).map((r) => r.id);
    const counts: Record<string, number> = {};
    if (ids.length > 0) {
      const { data: replyRows } = await supabase
        .from("contact_replies")
        .select("message_id")
        .in("message_id", ids);
      for (const r of replyRows ?? []) {
        counts[r.message_id] = (counts[r.message_id] ?? 0) + 1;
      }
    }
    const messages = await Promise.all(
      (rows ?? []).map(async (r) => {
        const rawAtts = Array.isArray(r.attachments)
          ? (r.attachments as Array<Record<string, unknown>>)
          : [];
        const atts = rawAtts
          .filter((a) => typeof a?.path === "string")
          .map((a) => ({
            path: String(a.path),
            name: String(a.name ?? "file"),
            size: Number(a.size ?? 0),
            type: String(a.type ?? "application/octet-stream"),
            quarantined: Boolean(a.quarantined),
            scan_reason: typeof a.scan_reason === "string" ? a.scan_reason : null,
          }));
        const signed = await signAttachments(supabase, atts);
        const merged = signed.map((s, i) => ({
          ...s,
          quarantined: atts[i].quarantined,
          scan_reason: atts[i].scan_reason,
        }));
        const hasQuarantined = atts.some((a) => a.quarantined);
        return { ...r, reply_count: counts[r.id] ?? 0, attachments: merged, has_quarantined: hasQuarantined };
      }),
    );
    const { count: unread } = await supabase
      .from("contact_messages")
      .select("id", { count: "exact", head: true })
      .eq("handled", false);
    return {
      messages,
      unread: unread ?? 0,
      total: total ?? 0,
      page: data.page,
      perPage: data.perPage,
    };
  });

// ============================================================
// Attachment quarantine / release / delete + audit log
// ============================================================

async function loadMessageAttachments(supabase: any, messageId: string) {
  const { data, error } = await supabase
    .from("contact_messages")
    .select("attachments")
    .eq("id", messageId)
    .single();
  if (error) throw new Error(error.message);
  const raw = Array.isArray(data?.attachments) ? (data.attachments as any[]) : [];
  return raw;
}

async function writeAuditLog(
  supabase: any,
  messageId: string,
  actorId: string,
  action: string,
  details: Record<string, unknown>,
) {
  await supabase.from("contact_audit_log").insert({
    message_id: messageId,
    actor_id: actorId,
    action,
    details,
  });
}

export const quarantineAttachment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      messageId: z.string().uuid(),
      path: z.string().min(1).max(500),
      reason: z.string().trim().max(200).default("Manually flagged"),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const atts = await loadMessageAttachments(supabase, data.messageId);
    const next = atts.map((a) =>
      a?.path === data.path
        ? { ...a, quarantined: true, scan_reason: data.reason }
        : a,
    );
    const { error } = await supabase
      .from("contact_messages")
      .update({ attachments: next })
      .eq("id", data.messageId);
    if (error) throw new Error(error.message);
    await writeAuditLog(supabase, data.messageId, userId, "quarantine_attachment", {
      path: data.path,
      reason: data.reason,
    });
    return { ok: true };
  });

export const releaseAttachment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ messageId: z.string().uuid(), path: z.string().min(1).max(500) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const atts = await loadMessageAttachments(supabase, data.messageId);
    const next = atts.map((a) =>
      a?.path === data.path
        ? { ...a, quarantined: false, scan_reason: null }
        : a,
    );
    const { error } = await supabase
      .from("contact_messages")
      .update({ attachments: next })
      .eq("id", data.messageId);
    if (error) throw new Error(error.message);
    await writeAuditLog(supabase, data.messageId, userId, "release_attachment", {
      path: data.path,
    });
    return { ok: true };
  });

export const deleteAttachment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ messageId: z.string().uuid(), path: z.string().min(1).max(500) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const atts = await loadMessageAttachments(supabase, data.messageId);
    const target = atts.find((a) => a?.path === data.path);
    const next = atts.filter((a) => a?.path !== data.path);
    const { error } = await supabase
      .from("contact_messages")
      .update({ attachments: next })
      .eq("id", data.messageId);
    if (error) throw new Error(error.message);
    // best-effort storage removal
    try {
      await supabase.storage.from("contact-attachments").remove([data.path]);
    } catch {
      /* ignore */
    }
    await writeAuditLog(supabase, data.messageId, userId, "delete_attachment", {
      path: data.path,
      name: target?.name ?? null,
    });
    return { ok: true };
  });

export const renameAttachment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      messageId: z.string().uuid(),
      path: z.string().min(1).max(500),
      name: z.string().trim().min(1).max(200),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    // Sanitize: strip path separators and control chars, collapse whitespace
    const safeName = data.name
      .replace(/[\\/\u0000-\u001f]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 200);
    if (!safeName) throw new Error("Invalid filename");
    const atts = await loadMessageAttachments(supabase, data.messageId);
    const target = atts.find((a) => a?.path === data.path);
    if (!target) throw new Error("Attachment not found");
    const oldName = target?.name ?? null;
    const next = atts.map((a) =>
      a?.path === data.path ? { ...a, name: safeName } : a,
    );
    const { error } = await supabase
      .from("contact_messages")
      .update({ attachments: next })
      .eq("id", data.messageId);
    if (error) throw new Error(error.message);
    await writeAuditLog(supabase, data.messageId, userId, "rename_attachment", {
      path: data.path,
      old_name: oldName,
      new_name: safeName,
    });
    return { ok: true, name: safeName };
  });

export const listContactAuditLog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ messageId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { data: rows, error } = await supabase
      .from("contact_audit_log")
      .select("id, action, details, actor_id, created_at")
      .eq("message_id", data.messageId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    const actorIds = Array.from(new Set((rows ?? []).map((r) => r.actor_id).filter(Boolean)));
    const actors: Record<string, { display_name: string | null; email: string | null }> = {};
    if (actorIds.length > 0) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, display_name, email")
        .in("id", actorIds as string[]);
      for (const p of profs ?? []) {
        actors[p.id] = { display_name: p.display_name, email: p.email };
      }
    }
    return {
      entries: (rows ?? []).map((r) => ({
        ...r,
        actor: r.actor_id ? actors[r.actor_id] ?? null : null,
      })),
    };
  });


export const setContactMessageRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), read: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { error } = await supabase
      .from("contact_messages")
      .update({ handled: data.read })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getUnreadContactCount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    // Don't throw for non-admins; just return 0 so the badge silently hides.
    const { data: roleRow } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) return { unread: 0 };
    const { count } = await supabase
      .from("contact_messages")
      .select("id", { count: "exact", head: true })
      .eq("handled", false);
    return { unread: count ?? 0 };
  });

// ============================================================
// Contact replies (threaded)
// ============================================================

const attachmentSchema = z.object({
  path: z.string().min(1).max(500),
  name: z.string().min(1).max(255),
  size: z.number().int().min(0).max(20 * 1024 * 1024),
  type: z.string().max(150).default("application/octet-stream"),
});

async function signAttachments(
  supabase: any,
  atts: Array<z.infer<typeof attachmentSchema>>,
) {
  if (!atts || atts.length === 0) return [];
  const out: Array<
    z.infer<typeof attachmentSchema> & { url: string | null }
  > = [];
  for (const a of atts) {
    const { data: signed } = await supabase.storage
      .from("contact-attachments")
      .createSignedUrl(a.path, 3600);
    out.push({ ...a, url: signed?.signedUrl ?? null });
  }
  return out;
}

export const listContactReplies = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ messageId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { data: replies, error } = await supabase
      .from("contact_replies")
      .select(
        "id, message_id, author_id, body, channel, attachments, created_at",
      )
      .eq("message_id", data.messageId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    const authorIds = Array.from(
      new Set((replies ?? []).map((r) => r.author_id)),
    );
    let authors: Record<
      string,
      { display_name: string | null; email: string | null }
    > = {};
    if (authorIds.length > 0) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, display_name, email")
        .in("id", authorIds);
      for (const p of profs ?? []) {
        authors[p.id] = { display_name: p.display_name, email: p.email };
      }
    }
    const result = [] as any[];
    for (const r of replies ?? []) {
      const raw = Array.isArray(r.attachments) ? r.attachments : [];
      const atts = raw
        .map((a: any) => attachmentSchema.safeParse(a))
        .filter((x: any) => x.success)
        .map((x: any) => x.data);
      result.push({
        ...r,
        author: authors[r.author_id] ?? null,
        attachments: await signAttachments(supabase, atts),
      });
    }
    return { replies: result };
  });

export const addContactReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        messageId: z.string().uuid(),
        body: z.string().trim().min(0).max(5000),
        channel: z.enum(["note", "email"]).default("note"),
        setStatus: z.enum(["new", "in_progress", "resolved"]).optional(),
        attachments: z.array(attachmentSchema).max(10).default([]),
      })
      .refine((v) => v.body.length > 0 || v.attachments.length > 0, {
        message: "Reply must have text or at least one attachment.",
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { data: reply, error } = await supabase
      .from("contact_replies")
      .insert({
        message_id: data.messageId,
        author_id: userId,
        body: data.body,
        channel: data.channel,
        attachments: data.attachments,
      })
      .select(
        "id, message_id, author_id, body, channel, attachments, created_at",
      )
      .single();
    if (error) throw new Error(error.message);
    const nextStatus = data.setStatus ?? "in_progress";
    await supabase
      .from("contact_messages")
      .update({ handled: true, status: nextStatus })
      .eq("id", data.messageId);
    return { reply };
  });

export const setContactMessageStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["new", "in_progress", "resolved"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { error } = await supabase
      .from("contact_messages")
      .update({ status: data.status })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteContactReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { error } = await supabase
      .from("contact_replies")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============================================================
// Grant unlimited access (admin) — any email, temporary or permanent
// ============================================================

export const grantUnlimitedAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        email: z.string().trim().email().max(320),
        // null = revoke; number of days from now; or "permanent" => year 9999
        durationDays: z.number().int().min(0).max(36500).nullable().optional(),
        permanent: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const normalized = data.email.toLowerCase();
    const { data: profile, error: pErr } = await supabaseAdmin
      .from("profiles")
      .select("id, email")
      .ilike("email", normalized)
      .maybeSingle();
    if (pErr) throw new Error(pErr.message);
    if (!profile) throw new Error(`No user found with email ${data.email}`);

    let unlimited_until: string | null;
    if (data.permanent) {
      unlimited_until = new Date("9999-12-31T00:00:00Z").toISOString();
    } else if (data.durationDays == null || data.durationDays === 0) {
      unlimited_until = null;
    } else {
      unlimited_until = new Date(
        Date.now() + data.durationDays * 24 * 60 * 60 * 1000,
      ).toISOString();
    }

    const { error: uErr } = await supabaseAdmin
      .from("profiles")
      .update({ unlimited_until })
      .eq("id", profile.id);
    if (uErr) throw new Error(uErr.message);

    return { ok: true, userId: profile.id, email: profile.email, unlimited_until };
  });

export const listUnlimitedGrants = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("id, email, display_name, unlimited_until")
      .not("unlimited_until", "is", null)
      .order("unlimited_until", { ascending: false });
    if (error) throw new Error(error.message);
    const now = Date.now();
    return {
      grants: (data ?? []).map((g) => ({
        ...g,
        active: g.unlimited_until ? new Date(g.unlimited_until).getTime() > now : false,
        permanent: g.unlimited_until ? new Date(g.unlimited_until).getUTCFullYear() >= 9999 : false,
      })),
    };
  });

// ============================================================================
// Platform default providers (Translation + STT)
// ============================================================================

const platformDefaultsSchema = z.object({
  translationProviderId: z.string().min(1).nullable().optional(),
  transcriptionProviderId: z.string().min(1).nullable().optional(),
});

export const getPlatformDefaults = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("app_settings")
    .select("key, value")
    .in("key", ["default_translation_provider", "default_transcription_provider"]);
  const map = new Map((data ?? []).map((r: any) => [r.key, r.value]));
  return {
    translationProviderId:
      (map.get("default_translation_provider") as any)?.providerId ?? null,
    transcriptionProviderId:
      (map.get("default_transcription_provider") as any)?.providerId ?? null,
  };
});

export const setPlatformDefaults = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => platformDefaultsSchema.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    async function upsertOrDelete(key: string, providerId: string | null | undefined) {
      if (providerId === undefined) return;
      if (providerId === null) {
        await supabaseAdmin.from("app_settings").delete().eq("key", key);
        return;
      }
      await supabaseAdmin
        .from("app_settings")
        .upsert(
          { key, value: { providerId }, updated_by: userId, updated_at: new Date().toISOString() },
          { onConflict: "key" },
        );
    }

    await upsertOrDelete("default_translation_provider", data.translationProviderId);
    await upsertOrDelete("default_transcription_provider", data.transcriptionProviderId);
    return { ok: true };
  });

// ============================================================================
// Global Studio Promo — admin can grant Studio-tier (paid) access to ALL users
// for a window of time. Useful for launch promos / "free week" campaigns.
// ============================================================================

const promoSchema = z.object({
  active: z.boolean(),
  expiresAt: z.string().datetime().nullable().optional(),
  message: z.string().trim().max(200).default(""),
});

export const getGlobalStudioPromo = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("app_settings")
    .select("value, updated_at")
    .eq("key", "global_studio_promo")
    .maybeSingle();
  const raw = (data?.value ?? null) as null | { active?: boolean; expiresAt?: string | null; message?: string };
  const expired = raw?.expiresAt ? new Date(raw.expiresAt).getTime() < Date.now() : false;
  return {
    active: !!raw?.active && !expired,
    rawActive: !!raw?.active,
    expiresAt: raw?.expiresAt ?? null,
    message: raw?.message ?? "",
    updatedAt: data?.updated_at ?? null,
  };
});

export const setGlobalStudioPromo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => promoSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const value = {
      active: data.active,
      expiresAt: data.expiresAt ?? null,
      message: data.message ?? "",
    };
    await supabaseAdmin
      .from("app_settings")
      .upsert(
        { key: "global_studio_promo", value, updated_by: userId, updated_at: new Date().toISOString() },
        { onConflict: "key" },
      );
    return { ok: true, ...value };
  });

// ============================================================================
// Transcribe quota overrides — per-user admin override + audit log
// ============================================================================

const transcribeOverrideSchema = z.object({
  email: z.string().trim().email().max(320),
  mode: z.enum(["unlimited", "custom", "free_days", "clear"]),
  dailyLimit: z.number().int().min(0).max(100000).nullable().optional(),
  monthlyLimit: z.number().int().min(0).max(1000000).nullable().optional(),
  days: z.number().int().min(0).max(36500).nullable().optional(),
  reason: z.string().trim().max(500).optional(),
});

export const setTranscribeOverride = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => transcribeOverrideSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    await assertAdmin(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const normalized = data.email.toLowerCase();
    const { data: profile, error: pErr } = await supabaseAdmin
      .from("profiles").select("id, email").ilike("email", normalized).maybeSingle();
    if (pErr) throw new Error(pErr.message);
    if (!profile) throw new Error(`No user found with email ${data.email}`);

    const expiresAt =
      data.days && data.days > 0
        ? new Date(Date.now() + data.days * 86400_000).toISOString()
        : null;

    let action = "clear";
    let payload: Record<string, unknown> = { reason: data.reason ?? null };

    if (data.mode === "clear") {
      await supabaseAdmin.from("transcribe_overrides").delete().eq("user_id", profile.id);
    } else {
      const row = {
        user_id: profile.id,
        unlimited: data.mode === "unlimited" || data.mode === "free_days",
        daily_limit: data.mode === "custom" ? (data.dailyLimit ?? null) : null,
        monthly_limit: data.mode === "custom" ? (data.monthlyLimit ?? null) : null,
        expires_at: expiresAt,
        reason: data.reason ?? null,
        created_by: userId,
      };
      action = data.mode;
      payload = { ...row };
      await supabaseAdmin
        .from("transcribe_overrides")
        .upsert(row, { onConflict: "user_id" });
    }

    await supabaseAdmin.from("transcribe_override_audit").insert({
      actor_id: userId,
      target_user_id: profile.id,
      action,
      payload: { email: profile.email, ...payload },
    });

    return { ok: true, userId: profile.id, email: profile.email };
  });

export const listTranscribeOverrides = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    await assertAdmin(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("transcribe_overrides")
      .select("user_id, unlimited, daily_limit, monthly_limit, expires_at, reason, updated_at")
      .order("updated_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    const ids = (data ?? []).map((r: any) => r.user_id);
    let emails = new Map<string, string>();
    if (ids.length) {
      const { data: profs } = await supabaseAdmin
        .from("profiles").select("id, email").in("id", ids);
      emails = new Map((profs ?? []).map((p: any) => [p.id, p.email]));
    }
    const now = Date.now();
    return {
      overrides: (data ?? []).map((r: any) => ({
        ...r,
        email: emails.get(r.user_id) ?? null,
        active: !r.expires_at || new Date(r.expires_at).getTime() > now,
      })),
    };
  });

export const listTranscribeOverrideAudit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    await assertAdmin(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("transcribe_override_audit")
      .select("id, actor_id, target_user_id, action, payload, created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return { entries: data ?? [] };
  });

// ============================================================================
// Feature locks — admin can lock/unlock product features (Voice Dubbing, etc.)
// Stored as app_settings.feature_locks = { [featureId]: { locked, message } }
// Admins always bypass locks (enforced in feature-locks.server.ts).
// ============================================================================

const FEATURE_ID_ENUM = z.enum([
  "voice_dubbing",
  "voice_cloning",
  "lipsync",
  "ai_summaries",
  "transcribe",
  "batch_translate",
]);

const featureLockSchema = z.object({
  featureId: FEATURE_ID_ENUM,
  locked: z.boolean(),
  message: z.string().trim().max(200).optional().default(""),
});

export const getFeatureLocks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    await assertAdmin(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("app_settings")
      .select("value, updated_at")
      .eq("key", "feature_locks")
      .maybeSingle();
    const map = (data?.value ?? {}) as Record<string, { locked?: boolean; message?: string }>;
    return { locks: map, updatedAt: data?.updated_at ?? null };
  });

export const setFeatureLock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => featureLockSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    await assertAdmin(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing } = await supabaseAdmin
      .from("app_settings")
      .select("value")
      .eq("key", "feature_locks")
      .maybeSingle();
    const current = ((existing?.value ?? {}) as Record<string, { locked?: boolean; message?: string }>) || {};
    current[data.featureId] = { locked: data.locked, message: data.message ?? "" };
    await supabaseAdmin
      .from("app_settings")
      .upsert(
        { key: "feature_locks", value: current, updated_by: userId, updated_at: new Date().toISOString() },
        { onConflict: "key" },
      );
    return { ok: true, locks: current };
  });
