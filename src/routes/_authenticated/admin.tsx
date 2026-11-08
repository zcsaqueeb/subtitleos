import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import {
  Loader2,
  Shield,
  ShieldAlert,
  Trash2,
  Users,
  FileText,
  Hash,
  Ban,
  CheckCircle2,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  ChevronLeft,
  ArrowUpDown,
  Download,
  Key,
  CreditCard,
  Clock,
  Mail,
  MailCheck,
  LogIn,
  Paperclip,
  X as XIcon,
  XCircle,
  Send,
  AlertTriangle,
  ShieldOff,
  Pencil,
  History,
} from "lucide-react";
import { supabase } from "@/lib/supabase-safe";
import { AppShell } from "@/components/app-shell";
import {
  getAdminOverview,
  setUserRole,
  setUserBanned,
  adminRevokeApiKey,
  listContactMessages,
  setContactMessageRead,
  listContactReplies,
  addContactReply,
  setContactMessageStatus,
  deleteContactReply,
  quarantineAttachment,
  releaseAttachment,
  deleteAttachment,
  renameAttachment,
  listContactAuditLog,
  grantUnlimitedAccess,
  listUnlimitedGrants,
  getPlatformDefaults,
  setPlatformDefaults,
  getGlobalStudioPromo,
  setGlobalStudioPromo,
  setTranscribeOverride,
  listTranscribeOverrides,
  listTranscribeOverrideAudit,
  getFeatureLocks,
  setFeatureLock,
} from "@/lib/admin.functions";



import { PROVIDERS as TRANSLATION_PROVIDERS, categorized as categorizedTranslation, CATEGORY_LABEL as TRANSLATION_CATEGORY_LABEL } from "@/lib/translation/registry";
import { categorizedTranscription, TRANSCRIPTION_CATEGORY_LABEL } from "@/lib/transcription/registry";
import { maskEmail } from "@/lib/mask";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type SortCol = "created_at" | "email" | "display_name" | "banned" | "roles";
type SortDir = "asc" | "desc";
type RoleFilter = "any" | "admin" | "moderator" | "user" | "none";
type StatusFilter = "any" | "active" | "banned";

const SORT_COLS: SortCol[] = ["created_at", "email", "display_name", "banned", "roles"];
const ROLE_FILTERS: RoleFilter[] = ["any", "admin", "moderator", "user", "none"];
const STATUS_FILTERS: StatusFilter[] = ["any", "active", "banned"];

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [
      { name: "description", content: "Review SubtitleOS administration, access requests, quarantine actions, and audit logs." },
      { property: "og:title", content: "Admin \u2014 SubtitleOS" },
      { property: "og:description", content: "Review SubtitleOS administration, access requests, quarantine actions, and audit logs." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
{ title: "Admin — SubtitleOS" }] }),
  validateSearch: (search: Record<string, unknown>) => {
    const sort = SORT_COLS.includes(search.sort as SortCol) ? (search.sort as SortCol) : "created_at";
    const dir: SortDir = search.dir === "asc" ? "asc" : "desc";
    const roleFilter = ROLE_FILTERS.includes(search.roleFilter as RoleFilter)
      ? (search.roleFilter as RoleFilter)
      : "any";
    const status = STATUS_FILTERS.includes(search.status as StatusFilter)
      ? (search.status as StatusFilter)
      : "any";
    return {
      q: typeof search.q === "string" ? search.q : "",
      page: Math.max(1, Number(search.page) || 1),
      perPage: Math.min(100, Math.max(1, Number(search.perPage) || 20)),
      sort,
      dir,
      roleFilter,
      status,
    };
  },
  component: AdminPage,
});

function AdminPage() {
  return (
    <AppShell>
      <Admin />
    </AppShell>
  );
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function relTime(iso: string | null | undefined) {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}

function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function Admin() {
  const queryClient = useQueryClient();
  const fetchOverview = useServerFn(getAdminOverview);
  const setRoleFn = useServerFn(setUserRole);
  const banFn = useServerFn(setUserBanned);
  const revokeKeyFn = useServerFn(adminRevokeApiKey);
  const navigate = Route.useNavigate();
  const searchParams = Route.useSearch();
  // Admins see full emails by default; toggle masks if needed (e.g. screen-share).
  const [masked, setMasked] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [inputValue, setInputValue] = useState(searchParams.q);
  const [pendingRole, setPendingRole] = useState<{
    userId: string;
    userLabel: string;
    role: "admin" | "moderator";
    grant: boolean;
  } | null>(null);
  const [pendingBan, setPendingBan] = useState<{
    userId: string;
    userLabel: string;
    banned: boolean;
  } | null>(null);

  const onSort = (col: SortCol, dir: SortDir) => {
    navigate({ to: ".", search: (prev) => ({ ...prev, sort: col, dir, page: 1 }) });
  };

  useEffect(() => {
    setInputValue(searchParams.q);
  }, [searchParams.q]);

  useEffect(() => {
    if (inputValue === searchParams.q) return;
    const t = setTimeout(() => {
      navigate({ to: ".", search: (prev) => ({ ...prev, q: inputValue, page: 1 }) });
    }, 300);
    return () => clearTimeout(t);
  }, [inputValue, searchParams.q, navigate]);

  // Server fetch — roles sort is applied client-side on the current page
  const serverSort = searchParams.sort === "roles" ? "created_at" : searchParams.sort;
  const { data, isLoading, error } = useQuery({
    queryKey: [
      "admin",
      "overview",
      searchParams.q,
      searchParams.page,
      searchParams.perPage,
      serverSort,
      searchParams.dir,
      searchParams.roleFilter,
      searchParams.status,
    ],
    queryFn: () =>
      fetchOverview({
        data: {
          search: searchParams.q,
          page: searchParams.page,
          perPage: searchParams.perPage,
          sort: serverSort,
          dir: searchParams.dir,
          roleFilter: searchParams.roleFilter,
          status: searchParams.status,
        },
      }),
    retry: false,
  });

  const [exporting, setExporting] = useState(false);
  async function exportCSV() {
    try {
      setExporting(true);
      const all = await fetchOverview({
        data: {
          search: searchParams.q,
          page: 1,
          perPage: 100,
          sort: serverSort,
          dir: searchParams.dir,
          roleFilter: searchParams.roleFilter,
          status: searchParams.status,
          exportAll: true,
        },
      });
      const headers = [
        "id",
        "email",
        "display_name",
        "roles",
        "banned",
        "created_at",
        "last_sign_in_at",
        "email_confirmed_at",
        "providers",
        "translations",
        "total_chars",
      ];
      const esc = (v: unknown) => {
        const s = v == null ? "" : String(v);
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const rows = all.users.map((u: any) =>
        [
          u.id,
          u.email ?? "",
          u.display_name ?? "",
          (u.roles ?? []).join("|") || "user",
          u.banned ? "true" : "false",
          u.created_at ?? "",
          u.auth?.last_sign_in_at ?? "",
          u.auth?.email_confirmed_at ?? "",
          (u.auth?.providers ?? []).join("|"),
          u.translation_count ?? 0,
          u.total_chars ?? 0,
        ]
          .map(esc)
          .join(","),
      );
      const csv = [headers.join(","), ...rows].join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `users-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${all.users.length} users`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }

  const roleMut = useMutation({
    mutationFn: setRoleFn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "overview"] });
      toast.success("Role updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const banMut = useMutation({
    mutationFn: banFn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "overview"] });
      toast.success("User updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const revokeKeyMut = useMutation({
    mutationFn: revokeKeyFn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "overview"] });
      toast.success("API key revoked");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-8 text-center">
        <Shield className="mx-auto h-8 w-8 text-destructive" />
        <h2 className="mt-3 font-display text-2xl">Admins only</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {error instanceof Error ? error.message : "You don't have access to this area."}
        </p>
      </div>
    );
  }

  const stats = [
    { label: "Users", value: data.stats.total_users, icon: Users },
    { label: "Translations", value: data.stats.total_translations, icon: FileText },
    { label: "Completed", value: data.stats.completed, icon: CheckCircle2 },
    { label: "Total chars", value: data.stats.total_chars.toLocaleString(), icon: Hash },
  ];

  const totalPages = Math.max(1, Math.ceil((data.pagination.total || 0) / data.pagination.perPage));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl sm:text-4xl">Admin</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Users, usage, roles. All in one place.
        </p>
      </div>

      {/* stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="rounded-2xl border border-border bg-card/40 p-4 backdrop-blur"
          >
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <s.icon className="h-3.5 w-3.5 text-gold" /> {s.label}
            </div>
            <div className="mt-2 font-display text-3xl">{s.value}</div>
          </motion.div>
        ))}
      </div>

      {/* lang pairs */}
      <div className="rounded-2xl border border-border bg-card/40 p-5 backdrop-blur">
        <h2 className="font-display text-xl">Top language pairs</h2>
        {data.top_lang_pairs.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No data yet.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {data.top_lang_pairs.map((p) => {
              const max = data.top_lang_pairs[0].count;
              const pct = (p.count / max) * 100;
              return (
                <li key={p.pair} className="flex items-center gap-3">
                  <span className="w-28 font-mono text-xs uppercase">{p.pair}</span>
                  <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ duration: 0.7, ease: "easeOut" }}
                      className="absolute inset-y-0 left-0 bg-gradient-to-r from-gold to-[oklch(0.6_0.18_60)]"
                    />
                  </div>
                  <span className="w-10 text-right text-xs text-muted-foreground">{p.count}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* contact inbox */}
      <ContactInbox />

      {/* access grants — admin can grant unlimited access to any email */}
      <AccessGrants />

      {/* platform default providers */}
      <PlatformDefaults />


      {/* global studio promo — free Studio for everyone for a window */}
      <GlobalStudioPromoAdmin />

      {/* admin can lock/unlock individual product features */}
      <FeatureLocksAdmin />

      {/* per-user transcribe quota overrides */}
      <TranscribeOverridesAdmin />






      {/* users */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card/40 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
          <h2 className="font-display text-xl">Users</h2>
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Search email, name, or id…"
              className="w-full max-w-xs rounded-lg border border-border bg-background/40 px-3 py-1.5 text-xs focus:border-gold/60 focus:outline-none"
            />
            <select
              value={searchParams.roleFilter}
              onChange={(e) =>
                navigate({
                  to: ".",
                  search: (prev) => ({
                    ...prev,
                    roleFilter: e.target.value as RoleFilter,
                    page: 1,
                  }),
                })
              }
              className="rounded-lg border border-border bg-background/40 px-2 py-1.5 text-xs focus:border-gold/60 focus:outline-none"
              title="Filter by role"
            >
              <option value="any">All roles</option>
              <option value="admin">Admins only</option>
              <option value="moderator">Mods only</option>
              <option value="none">No staff role</option>
            </select>
            <select
              value={searchParams.status}
              onChange={(e) =>
                navigate({
                  to: ".",
                  search: (prev) => ({
                    ...prev,
                    status: e.target.value as StatusFilter,
                    page: 1,
                  }),
                })
              }
              className="rounded-lg border border-border bg-background/40 px-2 py-1.5 text-xs focus:border-gold/60 focus:outline-none"
              title="Filter by status"
            >
              <option value="any">All status</option>
              <option value="active">Active</option>
              <option value="banned">Banned</option>
            </select>
            <select
              value={searchParams.perPage}
              onChange={(e) =>
                navigate({
                  to: ".",
                  search: (prev) => ({
                    ...prev,
                    perPage: Number(e.target.value),
                    page: 1,
                  }),
                })
              }
              className="rounded-lg border border-border bg-background/40 px-2 py-1.5 text-xs focus:border-gold/60 focus:outline-none"
            >
              <option value={10}>10 / page</option>
              <option value={20}>20 / page</option>
              <option value={50}>50 / page</option>
            </select>
            <button
              onClick={exportCSV}
              disabled={exporting}
              className="inline-flex items-center gap-1 rounded-lg border border-gold/40 bg-gold/10 px-3 py-1.5 text-xs text-gold transition hover:bg-gold/20 disabled:opacity-50"
              title="Export current filters to CSV"
            >
              {exporting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
              Export CSV
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground">
              <tr className="border-b border-border">
                <th className="px-3 py-3 w-8"></th>
                <SortableTh col="display_name" label="User" sort={searchParams.sort} dir={searchParams.dir} onSort={onSort} />
                <SortableTh col="roles" label="Roles" sort={searchParams.sort} dir={searchParams.dir} onSort={onSort} />
                <th className="px-3 py-3 text-right">Translations</th>
                <th className="px-3 py-3 text-right">Chars</th>
                <SortableTh col="created_at" label="Signed up" sort={searchParams.sort} dir={searchParams.dir} onSort={onSort} />
                <SortableTh col="banned" label="Status" sort={searchParams.sort} dir={searchParams.dir} onSort={onSort} />
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                const rank = (roles: string[]) =>
                  roles.includes("admin") ? 3 : roles.includes("moderator") ? 2 : 1;
                const list =
                  searchParams.sort === "roles"
                    ? [...data.users].sort((a, b) =>
                        searchParams.dir === "asc"
                          ? rank(a.roles) - rank(b.roles)
                          : rank(b.roles) - rank(a.roles),
                      )
                    : data.users;
                return list;
              })().map((u) => {
                const isOpen = !!expanded[u.id];
                return (
                  <>
                    <tr key={u.id} className="border-b border-border last:border-0">
                      <td className="px-3 py-3 align-top">
                        <button
                          onClick={() => setExpanded((m) => ({ ...m, [u.id]: !m[u.id] }))}
                          className="rounded p-1 hover:bg-accent"
                          title={isOpen ? "Hide details" : "Show details"}
                        >
                          {isOpen ? (
                            <ChevronDown className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          {u.avatar_url ? (
                            <img
                              src={u.avatar_url}
                              alt=""
                              className="h-7 w-7 rounded-full border border-border object-cover"
                            />
                          ) : (
                            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-[10px] uppercase text-muted-foreground">
                              {(u.display_name ?? u.email ?? "?").slice(0, 2)}
                            </div>
                          )}
                          <div>
                            <div className="font-medium">{u.display_name ?? "—"}</div>
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <span className="font-mono select-all">
                                {masked[u.id] ? maskEmail(u.email) : u.email}
                              </span>
                              <button
                                onClick={() =>
                                  setMasked((r) => ({ ...r, [u.id]: !r[u.id] }))
                                }
                                className="rounded p-0.5 hover:bg-accent"
                                title={masked[u.id] ? "Show full email" : "Mask email"}
                              >
                                {masked[u.id] ? (
                                  <Eye className="h-3 w-3" />
                                ) : (
                                  <EyeOff className="h-3 w-3" />
                                )}
                              </button>
                              {u.auth.email_confirmed_at ? (
                                <MailCheck
                                  className="h-3 w-3 text-emerald-400"
                                  aria-label="Email confirmed"
                                />
                              ) : (
                                <Mail
                                  className="h-3 w-3 text-amber-400"
                                  aria-label="Email unconfirmed"
                                />
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <RoleToggles
                          roles={u.roles}
                          onToggle={(role, grant) =>
                            setPendingRole({
                              userId: u.id,
                              userLabel: u.display_name ?? u.email ?? u.id,
                              role,
                              grant,
                            })
                          }
                        />
                      </td>
                      <td className="px-3 py-3 text-right font-mono">{u.translation_count}</td>
                      <td className="px-3 py-3 text-right font-mono">
                        {u.total_chars.toLocaleString()}
                      </td>
                      <td className="px-3 py-3 text-xs text-muted-foreground" title={fmtDate(u.created_at)}>
                        {relTime(u.created_at)}
                      </td>
                      <td className="px-3 py-3">
                        {u.banned ? (
                          <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-[10px] uppercase text-destructive">
                            banned
                          </span>
                        ) : (
                          <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] uppercase text-emerald-300">
                            active
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() =>
                              setPendingBan({
                                userId: u.id,
                                userLabel: u.display_name ?? u.email ?? u.id,
                                banned: !u.banned,
                              })
                            }
                            className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs ${
                              u.banned
                                ? "border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10"
                                : "border-destructive/40 text-destructive hover:bg-destructive/10"
                            }`}
                          >
                            <Ban className="h-3 w-3" /> {u.banned ? "Unban" : "Ban"}
                          </button>
                        </div>
                      </td>
                    </tr>

                    <AnimatePresence initial={false}>
                      {isOpen && (
                        <tr key={`${u.id}-details`} className="border-b border-border bg-background/30">
                          <td colSpan={8} className="px-5 py-4">
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              exit={{ opacity: 0, height: 0 }}
                              className="grid gap-4 md:grid-cols-3"
                            >
                              {/* Account meta */}
                              <div className="space-y-2 rounded-xl border border-border bg-card/40 p-3">
                                <div className="text-xs font-semibold uppercase text-muted-foreground">
                                  Account
                                </div>
                                <DetailRow
                                  icon={<Hash className="h-3 w-3" />}
                                  label="User id"
                                  value={<span className="font-mono text-[10px] break-all">{u.id}</span>}
                                />
                                <DetailRow
                                  icon={<Clock className="h-3 w-3" />}
                                  label="Signed up"
                                  value={fmtDate(u.created_at)}
                                />
                                <DetailRow
                                  icon={<LogIn className="h-3 w-3" />}
                                  label="Last sign-in"
                                  value={
                                    <span title={fmtDate(u.auth.last_sign_in_at)}>
                                      {relTime(u.auth.last_sign_in_at)}
                                    </span>
                                  }
                                />
                                <DetailRow
                                  icon={<MailCheck className="h-3 w-3" />}
                                  label="Email confirmed"
                                  value={u.auth.email_confirmed_at ? "Yes" : "No"}
                                />
                                <DetailRow
                                  icon={<Shield className="h-3 w-3" />}
                                  label="Providers"
                                  value={
                                    u.auth.providers.length ? (
                                      <div className="flex flex-wrap gap-1">
                                        {u.auth.providers.map((p) => (
                                          <span
                                            key={p}
                                            className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase"
                                          >
                                            {p}
                                          </span>
                                        ))}
                                      </div>
                                    ) : (
                                      "—"
                                    )
                                  }
                                />
                                <DetailRow
                                  icon={<EyeOff className="h-3 w-3" />}
                                  label="Email hidden by user"
                                  value={u.hide_email ? "Yes" : "No"}
                                />
                              </div>

                              <div className="space-y-2 rounded-xl border border-border bg-card/40 p-3">
                                <div className="mt-3 flex items-center justify-between">
                                  <div className="text-xs font-semibold uppercase text-muted-foreground">
                                    API keys ({u.api_keys.length})
                                  </div>
                                  <span
                                    className="inline-flex items-center gap-1 text-[10px] text-amber-300"
                                    title="Full keys are never stored. The database only keeps a one-way hash plus the public prefix shown here. Even an admin or a DB leak cannot recover the original key."
                                  >
                                    <ShieldAlert className="h-3 w-3" /> hashed
                                  </span>
                                </div>
                                {u.api_keys.length === 0 ? (
                                  <div className="text-xs text-muted-foreground">None.</div>
                                ) : (
                                  <ul className="space-y-1">
                                    {u.api_keys.slice(0, 5).map((k) => (
                                      <li
                                        key={k.id}
                                        className="flex items-center justify-between gap-2 rounded-md bg-background/40 px-2 py-1 text-xs"
                                      >
                                        <span className="flex min-w-0 items-center gap-1.5 truncate">
                                          <Key className="h-3 w-3 text-gold" />
                                          <span className="truncate">{k.name}</span>
                                          <span className="font-mono text-[10px] text-muted-foreground select-all">
                                            {k.key_prefix}••••••••
                                          </span>
                                        </span>
                                        <div className="flex items-center gap-2">
                                          <span className="text-[10px] text-muted-foreground">
                                            {k.revoked ? "revoked" : `${k.usage_count} uses`}
                                          </span>
                                          {!k.revoked && (
                                            <button
                                              onClick={() => {
                                                if (
                                                  confirm(
                                                    `Revoke API key "${k.name}"? This is immediate and cannot be undone — the user will need to issue a new key.`,
                                                  )
                                                ) {
                                                  revokeKeyMut.mutate({ data: { keyId: k.id } });
                                                }
                                              }}
                                              className="inline-flex items-center gap-1 rounded border border-destructive/40 px-1.5 py-0.5 text-[10px] text-destructive hover:bg-destructive/10"
                                              title="Revoke this API key"
                                            >
                                              <Trash2 className="h-3 w-3" /> Revoke
                                            </button>
                                          )}
                                        </div>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </div>

                              {/* Recent translations */}
                              <div className="space-y-2 rounded-xl border border-border bg-card/40 p-3">
                                <div className="text-xs font-semibold uppercase text-muted-foreground">
                                  Recent translations
                                </div>
                                {u.recent_translations.length === 0 ? (
                                  <div className="text-xs text-muted-foreground">None yet.</div>
                                ) : (
                                  <ul className="space-y-1">
                                    {u.recent_translations.map((t) => (
                                      <li
                                        key={t.id}
                                        className="rounded-md bg-background/40 px-2 py-1.5 text-xs"
                                      >
                                        <div className="flex items-center justify-between gap-2">
                                          <span className="flex items-center gap-1.5 truncate">
                                            <FileText className="h-3 w-3 text-gold" />
                                            <span className="truncate">
                                              {t.file_name ?? "untitled"}
                                            </span>
                                          </span>
                                          <span className="font-mono text-[10px] uppercase text-muted-foreground">
                                            {t.source_lang}→{t.target_lang}
                                          </span>
                                        </div>
                                        <div className="mt-0.5 flex items-center justify-between text-[10px] text-muted-foreground">
                                          <span>
                                            {t.status} · {(t.char_count ?? 0).toLocaleString()} chars
                                          </span>
                                          <span title={fmtDate(t.created_at)}>{relTime(t.created_at)}</span>
                                        </div>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                            </motion.div>
                          </td>
                        </tr>
                      )}
                    </AnimatePresence>
                  </>
                );
              })}
            </tbody>
          </table>
          {data.users.length === 0 && (
            <div className="px-5 py-8 text-center text-sm text-muted-foreground">
              {searchParams.q ? `No users match "${searchParams.q}".` : "No users found."}
            </div>
          )}
        </div>

        {/* Pagination */}
        {data.pagination.total > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3">
            <div className="text-xs text-muted-foreground">
              Showing{" "}
              {(data.pagination.page - 1) * data.pagination.perPage + 1}
              –
              {Math.min(data.pagination.page * data.pagination.perPage, data.pagination.total)} of{" "}
              {data.pagination.total}
            </div>
            <div className="flex items-center gap-2">
              <button
                disabled={data.pagination.page <= 1}
                onClick={() =>
                  navigate({ to: ".", search: (prev) => ({ ...prev, page: prev.page - 1 }) })
                }
                className="inline-flex items-center gap-1 rounded-lg border border-border bg-background/40 px-3 py-1.5 text-xs transition hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronRight className="h-3 w-3 rotate-180" /> Previous
              </button>
              <span className="text-xs text-muted-foreground">
                Page {data.pagination.page} / {totalPages}
              </span>
              <button
                disabled={data.pagination.page >= totalPages}
                onClick={() =>
                  navigate({ to: ".", search: (prev) => ({ ...prev, page: prev.page + 1 }) })
                }
                className="inline-flex items-center gap-1 rounded-lg border border-border bg-background/40 px-3 py-1.5 text-xs transition hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next <ChevronRight className="h-3 w-3" />
              </button>
            </div>
          </div>
        )}
      </div>

      <AlertDialog open={!!pendingRole} onOpenChange={(o) => !o && setPendingRole(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingRole?.grant ? "Grant" : "Revoke"} {pendingRole?.role} role
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingRole?.grant ? (
                <>
                  Give <span className="font-medium text-foreground">{pendingRole?.userLabel}</span>{" "}
                  the <span className="font-mono">{pendingRole?.role}</span> role?{" "}
                  {pendingRole?.role === "admin" &&
                    "Admins can manage all users, roles, bans, and API keys."}
                </>
              ) : (
                <>
                  Remove the <span className="font-mono">{pendingRole?.role}</span> role from{" "}
                  <span className="font-medium text-foreground">{pendingRole?.userLabel}</span>?
                  Access is revoked immediately.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!pendingRole) return;
                roleMut.mutate({
                  data: {
                    targetUserId: pendingRole.userId,
                    role: pendingRole.role,
                    grant: pendingRole.grant,
                  },
                });
                setPendingRole(null);
              }}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!pendingBan} onOpenChange={(o) => !o && setPendingBan(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingBan?.banned ? "Ban" : "Unban"} user
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingBan?.banned ? "Ban" : "Unban"}{" "}
              <span className="font-medium text-foreground">{pendingBan?.userLabel}</span>?
              {pendingBan?.banned && " They will lose access immediately."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!pendingBan) return;
                banMut.mutate({
                  data: { targetUserId: pendingBan.userId, banned: pendingBan.banned },
                });
                setPendingBan(null);
              }}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function RoleToggles({
  roles,
  onToggle,
}: {
  roles: string[];
  onToggle: (role: "admin" | "moderator", grant: boolean) => void;
}) {
  const ROLES: Array<{ key: "admin" | "moderator"; label: string; cls: string }> = [
    { key: "admin", label: "Admin", cls: "bg-gold/15 text-gold border-gold/40" },
    { key: "moderator", label: "Mod", cls: "bg-sky-500/15 text-sky-300 border-sky-500/40" },
  ];
  return (
    <div className="flex flex-wrap gap-1">
      {ROLES.map((r) => {
        const has = roles.includes(r.key);
        return (
          <button
            key={r.key}
            onClick={() => onToggle(r.key, !has)}
            className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide transition ${
              has
                ? r.cls
                : "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground"
            }`}
            title={has ? `Revoke ${r.label}` : `Grant ${r.label}`}
          >
            {has ? "✓ " : "+ "}
            {r.label}
          </button>
        );
      })}
      {roles.length === 0 && (
        <span className="self-center text-[10px] text-muted-foreground">user</span>
      )}
    </div>
  );
}

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 text-xs">
      <span className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        {label}
      </span>
      <span className="text-right text-foreground/90">{value}</span>
    </div>
  );
}

function SortableTh({
  col,
  label,
  sort,
  dir,
  onSort,
}: {
  col: SortCol;
  label: string;
  sort: SortCol;
  dir: SortDir;
  onSort: (col: SortCol, dir: SortDir) => void;
}) {
  const active = sort === col;
  const nextDir: SortDir = active && dir === "desc" ? "asc" : "desc";
  return (
    <th className="px-3 py-3">
      <button
        onClick={() => onSort(col, nextDir)}
        className={`inline-flex items-center gap-1 uppercase transition hover:text-foreground ${
          active ? "text-foreground" : ""
        }`}
        title={`Sort by ${label}`}
      >
        {label}
        {active ? (
          dir === "asc" ? (
            <ChevronUp className="h-3 w-3" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          )
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-40" />
        )}
      </button>
    </th>
  );
}

function ContactInbox() {
  const fetchMessages = useServerFn(listContactMessages);
  const [filter, setFilter] = useState<"all" | "unread" | "read">("unread");
  const [statusFilter, setStatusFilter] = useState<
    "any" | "new" | "in_progress" | "resolved"
  >("any");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Reset to page 1 whenever filters change.
  useEffect(() => {
    setPage(1);
  }, [filter, statusFilter, search, dateFrom, dateTo, perPage]);

  const queryArgs = {
    filter,
    status: statusFilter,
    search,
    dateFrom: dateFrom ? new Date(dateFrom).toISOString() : undefined,
    dateTo: dateTo
      ? new Date(new Date(dateTo).getTime() + 24 * 60 * 60 * 1000 - 1).toISOString()
      : undefined,
    page,
    perPage,
  };

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["admin", "contact-messages", queryArgs],
    queryFn: () => fetchMessages({ data: queryArgs }),
  });

  const hasFilters =
    !!search || statusFilter !== "any" || !!dateFrom || !!dateTo || filter !== "all";

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const startIdx = total === 0 ? 0 : (page - 1) * perPage + 1;
  const endIdx = Math.min(page * perPage, total);

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card/40 backdrop-blur">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
        <div className="flex items-center gap-2">
          <Mail className="h-4 w-4 text-gold" />
          <h2 className="font-display text-xl">Messages</h2>
          {data && data.unread > 0 && (
            <span className="rounded-full bg-gold/15 px-2 py-0.5 text-xs font-medium text-gold">
              {data.unread} unread
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-border bg-background/40 p-0.5 text-xs">
          {(["unread", "all", "read"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-md px-2.5 py-1 capitalize transition ${
                filter === f ? "bg-gold/15 text-gold" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-3 text-xs">
        <input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search email or message…"
          className="min-w-[200px] flex-1 rounded-lg border border-border bg-background/40 px-3 py-1.5 focus:border-gold/60 focus:outline-none"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as any)}
          className="rounded-lg border border-border bg-background/40 px-2 py-1.5 focus:border-gold/60 focus:outline-none"
          title="Filter by status"
        >
          <option value="any">All statuses</option>
          <option value="new">New</option>
          <option value="in_progress">In progress</option>
          <option value="resolved">Resolved</option>
        </select>
        <label className="flex items-center gap-1 text-muted-foreground">
          From
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="rounded-lg border border-border bg-background/40 px-2 py-1 focus:border-gold/60 focus:outline-none"
          />
        </label>
        <label className="flex items-center gap-1 text-muted-foreground">
          To
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="rounded-lg border border-border bg-background/40 px-2 py-1 focus:border-gold/60 focus:outline-none"
          />
        </label>
        {hasFilters && (
          <button
            onClick={() => {
              setSearchInput("");
              setSearch("");
              setStatusFilter("any");
              setDateFrom("");
              setDateTo("");
              setFilter("all");
            }}
            className="rounded-md border border-border px-2 py-1 text-muted-foreground transition hover:bg-accent hover:text-foreground"
          >
            Clear
          </button>
        )}
        {data && (
          <span className="ml-auto text-muted-foreground">
            {total === 0
              ? "0 results"
              : `${startIdx}–${endIdx} of ${total}`}
          </span>
        )}
      </div>
      {isLoading ? (
        <div className="flex h-32 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : !data || data.messages.length === 0 ? (
        <div className="px-5 py-10 text-center text-sm text-muted-foreground">
          No messages match your filters.
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {data.messages.map((m: any) => (
            <ContactMessageRow key={m.id} m={m} />
          ))}
        </ul>
      )}
      {data && total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <span>Rows per page</span>
            <select
              value={perPage}
              onChange={(e) => setPerPage(Number(e.target.value))}
              className="rounded-md border border-border bg-background/40 px-2 py-1 focus:border-gold/60 focus:outline-none"
            >
              {[10, 20, 50, 100].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            {isFetching && <Loader2 className="h-3 w-3 animate-spin" />}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 transition hover:bg-accent hover:text-foreground disabled:opacity-40"
            >
              <ChevronLeft className="h-3 w-3" /> Prev
            </button>
            <span className="tabular-nums">
              Page {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 transition hover:bg-accent hover:text-foreground disabled:opacity-40"
            >
              Next <ChevronRight className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

type ContactStatus = "new" | "in_progress" | "resolved";

const STATUS_META: Record<
  ContactStatus,
  { label: string; cls: string }
> = {
  new: { label: "New", cls: "bg-gold/15 text-gold border-gold/30" },
  in_progress: {
    label: "In progress",
    cls: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  },
  resolved: {
    label: "Resolved",
    cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  },
};

function ContactMessageRow({ m }: { m: any }) {
  const queryClient = useQueryClient();
  const setReadFn = useServerFn(setContactMessageRead);
  const fetchReplies = useServerFn(listContactReplies);
  const addReplyFn = useServerFn(addContactReply);
  const setStatusFn = useServerFn(setContactMessageStatus);
  const deleteReplyFn = useServerFn(deleteContactReply);
  const quarantineFn = useServerFn(quarantineAttachment);
  const releaseFn = useServerFn(releaseAttachment);
  const deleteAttFn = useServerFn(deleteAttachment);
  const renameFn = useServerFn(renameAttachment);
  const fetchAudit = useServerFn(listContactAuditLog);
  const [auditOpen, setAuditOpen] = useState(false);

  const unread = !m.handled;
  const status: ContactStatus = (m.status as ContactStatus) ?? "new";
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [pending, setPending] = useState<
    Array<{ path: string; name: string; size: number; type: string }>
  >([]);
  const [uploading, setUploading] = useState(false);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    if (pending.length + files.length > 10) {
      toast.error("Max 10 attachments per reply.");
      return;
    }
    setUploading(true);
    const next = [...pending];
    for (const file of Array.from(files)) {
      if (file.size > 20 * 1024 * 1024) {
        toast.error(`${file.name} exceeds 20MB.`);
        continue;
      }
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${m.id}/${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}-${safeName}`;
      const { error } = await supabase.storage
        .from("contact-attachments")
        .upload(path, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: file.type || "application/octet-stream",
        });
      if (error) {
        toast.error(`Upload failed: ${file.name}`);
        continue;
      }
      next.push({
        path,
        name: file.name,
        size: file.size,
        type: file.type || "application/octet-stream",
      });
    }
    setPending(next);
    setUploading(false);
  }

  async function removePending(idx: number) {
    const att = pending[idx];
    if (!att) return;
    await supabase.storage.from("contact-attachments").remove([att.path]);
    setPending((p) => p.filter((_, i) => i !== idx));
  }

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["admin", "contact-messages"] });
    queryClient.invalidateQueries({ queryKey: ["admin", "unread-contact"] });
    queryClient.invalidateQueries({
      queryKey: ["admin", "contact-replies", m.id],
    });
  };

  const repliesQ = useQuery({
    queryKey: ["admin", "contact-replies", m.id],
    queryFn: () => fetchReplies({ data: { messageId: m.id } }),
    enabled: open,
  });

  const readMut = useMutation({
    mutationFn: setReadFn,
    onSuccess: invalidateAll,
    onError: (e: Error) => toast.error(e.message),
  });
  const statusMut = useMutation({
    mutationFn: setStatusFn,
    onSuccess: invalidateAll,
    onError: (e: Error) => toast.error(e.message),
  });
  const addMut = useMutation({
    mutationFn: addReplyFn,
    onSuccess: () => {
      setBody("");
      setPending([]);
      invalidateAll();
      toast.success("Reply saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const deleteMut = useMutation({
    mutationFn: deleteReplyFn,
    onSuccess: invalidateAll,
    onError: (e: Error) => toast.error(e.message),
  });

  const auditInvalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["admin", "contact-messages"] });
    queryClient.invalidateQueries({ queryKey: ["admin", "contact-audit", m.id] });
  };
  const quarantineMut = useMutation({
    mutationFn: quarantineFn,
    onSuccess: () => {
      toast.success("Attachment quarantined");
      auditInvalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const releaseMut = useMutation({
    mutationFn: releaseFn,
    onSuccess: () => {
      toast.success("Attachment released");
      auditInvalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const deleteAttMut = useMutation({
    mutationFn: deleteAttFn,
    onSuccess: () => {
      toast.success("Attachment deleted");
      auditInvalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const renameMut = useMutation({
    mutationFn: renameFn,
    onSuccess: () => {
      toast.success("Attachment renamed");
      auditInvalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const auditQ = useQuery({
    queryKey: ["admin", "contact-audit", m.id],
    queryFn: () => fetchAudit({ data: { messageId: m.id } }),
    enabled: auditOpen,
  });

  function openMailto(prefill?: string) {
    const subject = `Re: Your message to SubtitleOS`;
    const quoted = m.message
      .split("\n")
      .map((l: string) => `> ${l}`)
      .join("\n");
    const text =
      prefill && prefill.trim().length > 0
        ? prefill
        : `Hi,\n\nThanks for reaching out.\n\n\n---\nOn ${fmtDate(
            m.created_at,
          )}, you wrote:\n${quoted}`;
    window.location.href = `mailto:${encodeURIComponent(
      m.email,
    )}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
  }

  return (
    <li className={`px-5 py-4 transition ${unread ? "bg-gold/[0.03]" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {unread && (
              <span
                aria-label="unread"
                className="h-2 w-2 shrink-0 rounded-full bg-gold"
              />
            )}
            <a
              href={`mailto:${m.email}`}
              className="truncate text-sm font-medium hover:text-gold"
            >
              {m.email}
            </a>
            <span
              className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${STATUS_META[status].cls}`}
            >
              {STATUS_META[status].label}
            </span>
            <span className="text-xs text-muted-foreground">
              · {relTime(m.created_at)}
            </span>
            {m.reply_count > 0 && (
              <span className="inline-flex items-center gap-1 rounded-md border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                <MailCheck className="h-3 w-3" />
                {m.reply_count} {m.reply_count === 1 ? "reply" : "replies"}
              </span>
            )}
          </div>
          <p className="mt-1.5 whitespace-pre-wrap break-words text-sm text-foreground/80">
            {m.message}
          </p>
          {Array.isArray((m as any).attachments) && (m as any).attachments.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-2">
              {((m as any).attachments as Array<{
                path: string; name: string; size: number; type: string;
                url: string | null; quarantined?: boolean; scan_reason?: string | null;
              }>).map((a) => {
                const isImg = a.type.startsWith("image/") && !a.quarantined;
                return (
                  <li
                    key={a.path}
                    className={`group relative overflow-hidden rounded-lg border ${
                      a.quarantined
                        ? "border-destructive/40 bg-destructive/5"
                        : "border-border bg-background/60"
                    }`}
                    title={a.quarantined ? `Quarantined: ${a.scan_reason ?? "flagged by scanner"}` : `${a.name} · ${fmtBytes(a.size)}`}
                  >
                    {isImg && a.url ? (
                      <a href={a.url} target="_blank" rel="noopener noreferrer" className="block">
                        <img
                          src={a.url}
                          alt={a.name}
                          loading="lazy"
                          className="h-20 w-20 object-cover transition group-hover:opacity-90"
                        />
                      </a>
                    ) : (
                      <div className="flex h-20 w-32 items-center justify-center px-2 text-center">
                        {a.quarantined ? (
                          <AlertTriangle className="h-5 w-5 text-destructive" />
                        ) : (
                          <Paperclip className="h-5 w-5 text-muted-foreground" />
                        )}
                      </div>
                    )}
                    <div className="border-t border-border bg-background/80 px-2 py-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="max-w-[140px] truncate text-[11px]" title={a.name}>{a.name}</span>
                        {a.url ? (
                          <a
                            href={a.url}
                            download={a.name}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[10px] text-gold hover:underline"
                          >
                            Download
                          </a>
                        ) : (
                          <span className="text-[10px] text-muted-foreground">no link</span>
                        )}
                      </div>
                      <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                        <span>{fmtBytes(a.size)}</span>
                        {a.quarantined && (
                          <span className="font-medium uppercase tracking-wide text-destructive">Quarantine</span>
                        )}
                      </div>
                      <div className="mt-1 flex items-center justify-end gap-1">
                        <button
                          onClick={() => {
                            const next = window.prompt("Rename attachment", a.name);
                            if (next == null) return;
                            const trimmed = next.trim();
                            if (!trimmed || trimmed === a.name) return;
                            renameMut.mutate({
                              data: { messageId: m.id, path: a.path, name: trimmed },
                            });
                          }}
                          disabled={renameMut.isPending}
                          className="inline-flex items-center gap-1 rounded border border-border bg-background/60 px-1.5 py-0.5 text-[10px] text-muted-foreground transition hover:bg-accent hover:text-foreground disabled:opacity-50"
                          title="Rename attachment"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                        {a.quarantined ? (
                          <button
                            onClick={() =>
                              releaseMut.mutate({ data: { messageId: m.id, path: a.path } })
                            }
                            disabled={releaseMut.isPending}
                            className="inline-flex items-center gap-1 rounded border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-300 transition hover:bg-emerald-500/20 disabled:opacity-50"
                            title="Release attachment (mark safe)"
                          >
                            <ShieldOff className="h-3 w-3" /> Release
                          </button>
                        ) : (
                          <button
                            onClick={() => {
                              const reason =
                                window.prompt(
                                  "Quarantine reason",
                                  "Manually flagged as suspicious",
                                ) ?? "";
                              if (!reason.trim()) return;
                              quarantineMut.mutate({
                                data: { messageId: m.id, path: a.path, reason: reason.trim() },
                              });
                            }}
                            disabled={quarantineMut.isPending}
                            className="inline-flex items-center gap-1 rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-300 transition hover:bg-amber-500/20 disabled:opacity-50"
                            title="Quarantine attachment"
                          >
                            <ShieldAlert className="h-3 w-3" /> Quarantine
                          </button>
                        )}
                        <button
                          onClick={() => {
                            if (!window.confirm(`Delete "${a.name}"? This cannot be undone.`)) return;
                            deleteAttMut.mutate({
                              data: { messageId: m.id, path: a.path },
                            });
                          }}
                          disabled={deleteAttMut.isPending}
                          className="inline-flex items-center gap-1 rounded border border-destructive/40 bg-destructive/10 px-1.5 py-0.5 text-[10px] text-destructive transition hover:bg-destructive/20 disabled:opacity-50"
                          title="Delete attachment"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
            <button
              onClick={() => setOpen((o) => !o)}
              className="inline-flex items-center gap-1 text-muted-foreground transition hover:text-foreground"
            >
              {open ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
              {open ? "Hide thread" : "Open thread"}
            </button>
            <button
              onClick={() => setAuditOpen((o) => !o)}
              className="inline-flex items-center gap-1 text-muted-foreground transition hover:text-foreground"
              title="Audit log"
            >
              <History className="h-3 w-3" />
              {auditOpen ? "Hide audit" : "Audit log"}
            </button>
            {m.has_quarantined && (
              <span className="inline-flex items-center gap-1 rounded-md border border-destructive/40 bg-destructive/10 px-1.5 py-0.5 text-[10px] uppercase text-destructive">
                <AlertTriangle className="h-3 w-3" /> Quarantined attachments
              </span>
            )}
          </div>
          <AnimatePresence initial={false}>
            {auditOpen && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="mt-2 rounded-lg border border-border bg-background/40 p-3 text-xs">
                  {auditQ.isLoading ? (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" /> Loading audit log…
                    </div>
                  ) : auditQ.data && auditQ.data.entries.length > 0 ? (
                    <ul className="space-y-1.5">
                      {auditQ.data.entries.map((entry: any) => (
                        <li
                          key={entry.id}
                          className="flex flex-wrap items-baseline gap-2 border-b border-border/40 pb-1 last:border-b-0 last:pb-0"
                        >
                          <span className="font-mono text-[10px] text-muted-foreground">
                            {fmtDate(entry.created_at)}
                          </span>
                          <span className="font-medium text-foreground">
                            {entry.action.replace(/_/g, " ")}
                          </span>
                          <span className="text-muted-foreground">
                            by {entry.actor?.display_name ?? entry.actor?.email ?? "system"}
                          </span>
                          {entry.details?.name && (
                            <span className="text-muted-foreground">· {String(entry.details.name)}</span>
                          )}
                          {entry.details?.path && !entry.details?.name && (
                            <span className="truncate text-muted-foreground">· {String(entry.details.path)}</span>
                          )}
                          {entry.details?.reason && (
                            <span className="text-amber-300">· {String(entry.details.reason)}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <span className="text-muted-foreground">No audit entries yet.</span>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <div className="flex shrink-0 flex-col gap-1.5">
          <select
            value={status}
            onChange={(e) =>
              statusMut.mutate({
                data: { id: m.id, status: e.target.value as ContactStatus },
              })
            }
            disabled={statusMut.isPending}
            className="rounded-md border border-border bg-background/40 px-2 py-1 text-xs focus:border-gold/60 focus:outline-none"
            title="Change status"
          >
            <option value="new">New</option>
            <option value="in_progress">In progress</option>
            <option value="resolved">Resolved</option>
          </select>
          <button
            onClick={() =>
              readMut.mutate({ data: { id: m.id, read: unread } })
            }
            disabled={readMut.isPending}
            className="inline-flex items-center justify-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground transition hover:bg-accent hover:text-foreground disabled:opacity-50"
            title={unread ? "Mark as read" : "Mark as unread"}
          >
            {unread ? (
              <>
                <MailCheck className="h-3 w-3" /> Mark read
              </>
            ) : (
              <>
                <Mail className="h-3 w-3" /> Mark unread
              </>
            )}
          </button>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-4 space-y-3 border-l-2 border-gold/30 pl-4">
              {repliesQ.isLoading ? (
                <div className="py-4 text-center">
                  <Loader2 className="mx-auto h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              ) : repliesQ.data && repliesQ.data.replies.length > 0 ? (
                <ul className="space-y-3">
                  {repliesQ.data.replies.map((r: any) => (
                    <li
                      key={r.id}
                      className="rounded-lg border border-border bg-background/40 p-3"
                    >
                      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-foreground">
                            {r.author?.display_name ??
                              r.author?.email ??
                              "Admin"}
                          </span>
                          <span
                            className={`rounded-md border px-1.5 py-0.5 text-[10px] uppercase ${
                              r.channel === "email"
                                ? "border-gold/30 bg-gold/10 text-gold"
                                : "border-border text-muted-foreground"
                            }`}
                          >
                            {r.channel === "email" ? "Email" : "Note"}
                          </span>
                          <span>· {relTime(r.created_at)}</span>
                        </div>
                        <button
                          onClick={() =>
                            deleteMut.mutate({ data: { id: r.id } })
                          }
                          className="rounded p-1 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
                          title="Delete reply"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                      {r.body && (
                        <p className="mt-1.5 whitespace-pre-wrap break-words text-sm">
                          {r.body}
                        </p>
                      )}
                      {Array.isArray(r.attachments) && r.attachments.length > 0 && (
                        <ul className="mt-2 flex flex-wrap gap-1.5">
                          {r.attachments.map((a: any) => (
                            <li key={a.path}>
                              <a
                                href={a.url ?? "#"}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background/60 px-2 py-1 text-xs text-foreground/80 transition hover:border-gold/40 hover:text-gold"
                                title={`${a.name} · ${fmtBytes(a.size)}`}
                              >
                                <Paperclip className="h-3 w-3" />
                                <span className="max-w-[200px] truncate">{a.name}</span>
                                <span className="text-muted-foreground">
                                  {fmtBytes(a.size)}
                                </span>
                              </a>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">No replies yet.</p>
              )}

              <div className="rounded-lg border border-border bg-background/40 p-3">
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Write a reply or internal note…"
                  rows={3}
                  className="w-full resize-y rounded-md border border-border bg-background/40 px-3 py-2 text-sm focus:border-gold/60 focus:outline-none"
                />
                {pending.length > 0 && (
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {pending.map((a, i) => (
                      <li
                        key={a.path}
                        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background/60 px-2 py-1 text-xs"
                      >
                        <Paperclip className="h-3 w-3 text-muted-foreground" />
                        <span className="max-w-[180px] truncate">{a.name}</span>
                        <span className="text-muted-foreground">
                          {fmtBytes(a.size)}
                        </span>
                        <button
                          onClick={() => removePending(i)}
                          className="rounded text-muted-foreground transition hover:text-destructive"
                          title="Remove"
                        >
                          <XIcon className="h-3 w-3" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
                  <label
                    className={`inline-flex cursor-pointer items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground transition hover:bg-accent hover:text-foreground ${
                      uploading ? "opacity-50" : ""
                    }`}
                    title="Attach files (max 10, 20MB each)"
                  >
                    {uploading ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Paperclip className="h-3 w-3" />
                    )}
                    Attach
                    <input
                      type="file"
                      multiple
                      hidden
                      onChange={(e) => {
                        void handleFiles(e.target.files);
                        e.target.value = "";
                      }}
                    />
                  </label>
                  <div className="flex-1" />
                  <button
                    onClick={() => {
                      const text = body.trim();
                      if (!text && pending.length === 0) {
                        toast.error("Write something or attach a file.");
                        return;
                      }
                      addMut.mutate({
                        data: {
                          messageId: m.id,
                          body: text,
                          channel: "note",
                          attachments: pending,
                        },
                      });
                    }}
                    disabled={
                      addMut.isPending ||
                      uploading ||
                      (!body.trim() && pending.length === 0)
                    }
                    className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs text-foreground/80 transition hover:bg-accent disabled:opacity-50"
                    title="Save as internal note (not sent)"
                  >
                    <FileText className="h-3 w-3" /> Save note
                  </button>
                  <button
                    onClick={() => {
                      const text = body.trim();
                      if (!text && pending.length === 0) {
                        toast.error("Write something or attach a file.");
                        return;
                      }
                      if (text) openMailto(text);
                      addMut.mutate({
                        data: {
                          messageId: m.id,
                          body: text,
                          channel: "email",
                          attachments: pending,
                        },
                      });
                    }}
                    disabled={
                      addMut.isPending ||
                      uploading ||
                      (!body.trim() && pending.length === 0)
                    }
                    className="inline-flex items-center gap-1 rounded-md border border-gold/40 bg-gold/10 px-2.5 py-1 text-xs text-gold transition hover:bg-gold/20 disabled:opacity-50"
                    title="Open your email client and log this reply (attach files manually in your mail app)"
                  >
                    <Mail className="h-3 w-3" /> Send via email
                  </button>
                  <button
                    onClick={() =>
                      statusMut.mutate({
                        data: { id: m.id, status: "resolved" },
                      })
                    }
                    disabled={statusMut.isPending || status === "resolved"}
                    className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-300 transition hover:bg-emerald-500/20 disabled:opacity-50"
                  >
                    <CheckCircle2 className="h-3 w-3" /> Resolve
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
}


function AccessGrants() {
  const qc = useQueryClient();
  const grantsQ = useQuery({
    queryKey: ["admin-unlimited-grants"],
    queryFn: () => listUnlimitedGrants(),
  });
  const grantFn = useServerFn(grantUnlimitedAccess);
  const [email, setEmail] = useState("");
  const [mode, setMode] = useState<"7" | "30" | "365" | "permanent" | "revoke">("30");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    try {
      const payload =
        mode === "permanent"
          ? { email: email.trim(), permanent: true }
          : mode === "revoke"
            ? { email: email.trim(), durationDays: null }
            : { email: email.trim(), durationDays: Number(mode) };
      await grantFn({ data: payload });
      toast.success(
        mode === "revoke"
          ? `Revoked unlimited access for ${email}`
          : `Granted unlimited access to ${email}`,
      );
      setEmail("");
      qc.invalidateQueries({ queryKey: ["admin-unlimited-grants"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update access");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(targetEmail: string) {
    setBusy(true);
    try {
      await grantFn({ data: { email: targetEmail, durationDays: null } });
      toast.success(`Revoked unlimited access for ${targetEmail}`);
      qc.invalidateQueries({ queryKey: ["admin-unlimited-grants"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to revoke");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card/40 backdrop-blur">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div>
          <h2 className="text-lg font-semibold">Access grants</h2>
          <p className="text-xs text-muted-foreground">
            Grant any user (by email) unlimited access — temporary or permanent. Admin-only.
          </p>
        </div>
        <Shield className="h-5 w-5 text-gold" />
      </div>

      <form onSubmit={submit} className="flex flex-wrap items-end gap-3 border-b border-border px-5 py-4">
        <div className="flex-1 min-w-[220px]">
          <label className="text-xs text-muted-foreground">User email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="someone@gmail.com"
            className="mt-1 w-full rounded-lg border border-border bg-background/40 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Duration</label>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as typeof mode)}
            className="mt-1 rounded-lg border border-border bg-background/40 px-3 py-2 text-sm"
          >
            <option value="1">1 day</option>
            <option value="3">3 days</option>
            <option value="7">7 days</option>
            <option value="14">14 days</option>
            <option value="30">30 days</option>
            <option value="60">60 days</option>
            <option value="90">90 days</option>
            <option value="180">180 days</option>
            <option value="365">1 year</option>
            <option value="730">2 years</option>
            <option value="permanent">Permanent</option>
            <option value="revoke">Revoke access</option>
          </select>
        </div>
        <button
          type="submit"
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-lg bg-gold px-4 py-2 text-sm font-medium text-background transition hover:bg-gold/90 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          Apply
        </button>
      </form>

      <div className="px-5 py-4">
        <div className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Active grants</div>
        {grantsQ.isLoading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : (grantsQ.data?.grants ?? []).length === 0 ? (
          <div className="text-sm text-muted-foreground">No active grants.</div>
        ) : (
          <ul className="divide-y divide-border">
            {grantsQ.data!.grants.map((g) => (
              <li key={g.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <div className="min-w-0">
                  <div className="truncate font-medium">{g.email ?? g.id}</div>
                  <div className="text-xs text-muted-foreground">
                    {g.permanent
                      ? "Permanent"
                      : g.active
                        ? `Active until ${fmtDate(g.unlimited_until)}`
                        : `Expired ${relTime(g.unlimited_until)}`}
                  </div>
                </div>
                <button
                  onClick={() => g.email && revoke(g.email)}
                  disabled={busy || !g.email}
                  className="inline-flex items-center gap-1 rounded-lg border border-border bg-background/40 px-3 py-1.5 text-xs transition hover:bg-accent disabled:opacity-50"
                >
                  <XIcon className="h-3 w-3" /> Revoke
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function PlatformDefaults() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["admin-platform-defaults"],
    queryFn: () => getPlatformDefaults(),
  });
  const saveFn = useServerFn(setPlatformDefaults);
  const [tx, setTx] = useState<string>("");
  const [stt, setStt] = useState<string>("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (q.data) {
      setTx(q.data.translationProviderId ?? "");
      setStt(q.data.transcriptionProviderId ?? "");
    }
  }, [q.data]);

  async function save() {
    setBusy(true);
    try {
      await saveFn({
        data: {
          translationProviderId: tx || null,
          transcriptionProviderId: stt || null,
        },
      });
      toast.success("Saved default providers");
      qc.invalidateQueries({ queryKey: ["admin-platform-defaults"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setBusy(false);
    }
  }

  const txGroups = categorizedTranslation();
  const sttGroups = categorizedTranscription();

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card/40 backdrop-blur">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div>
          <h2 className="text-lg font-semibold">Default providers</h2>
          <p className="text-xs text-muted-foreground">
            Platform-wide defaults for new users (and users who haven't picked their own). Admin-only.
          </p>
        </div>
        <Shield className="h-5 w-5 text-gold" />
      </div>

      <div className="grid gap-4 px-5 py-4 md:grid-cols-2">
        <div>
          <label className="text-xs uppercase tracking-wide text-muted-foreground">
            Default translation provider
          </label>
          <select
            value={tx}
            onChange={(e) => setTx(e.target.value)}
            className="mt-2 w-full rounded-lg border border-border bg-background/40 px-3 py-2 text-sm"
          >
            <option value="">— None (use built-in Lovable AI) —</option>
            {txGroups.map((g) => (
              <optgroup key={g.category} label={TRANSLATION_CATEGORY_LABEL[g.category]}>
                {g.items.map(({ id, spec }) => (
                  <option key={id} value={id} disabled={!spec.implemented}>
                    {spec.label}
                    {!spec.implemented ? " (soon)" : ""}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs uppercase tracking-wide text-muted-foreground">
            Default speech-to-text provider
          </label>
          <select
            value={stt}
            onChange={(e) => setStt(e.target.value)}
            className="mt-2 w-full rounded-lg border border-border bg-background/40 px-3 py-2 text-sm"
          >
            <option value="">— None (use built-in Lovable AI) —</option>
            {sttGroups.map((g) => (
              <optgroup key={g.category} label={TRANSCRIPTION_CATEGORY_LABEL[g.category]}>
                {g.items.map((p) => (
                  <option key={p.id} value={p.id} disabled={!p.implemented}>
                    {p.label}
                    {!p.implemented ? " (soon)" : ""}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
        <button
          onClick={save}
          disabled={busy || q.isLoading}
          className="inline-flex items-center gap-2 rounded-lg bg-gold px-4 py-2 text-sm font-medium text-background transition hover:bg-gold/90 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          Save defaults
        </button>
      </div>
    </div>
  );
}


function GlobalStudioPromoAdmin() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["admin-global-promo"],
    queryFn: () => getGlobalStudioPromo(),
  });
  const saveFn = useServerFn(setGlobalStudioPromo);

  const [active, setActive] = useState(false);
  const [expiresAt, setExpiresAt] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!q.data) return;
    setActive(q.data.rawActive);
    setExpiresAt(q.data.expiresAt ? q.data.expiresAt.slice(0, 16) : "");
    setMessage(q.data.message ?? "");
  }, [q.data]);

  async function save() {
    setBusy(true);
    try {
      await saveFn({
        data: {
          active,
          expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
          message: message.trim(),
        },
      });
      toast.success(active ? "Free Studio access enabled for everyone" : "Promo disabled");
      qc.invalidateQueries({ queryKey: ["admin-global-promo"] });
      qc.invalidateQueries({ queryKey: ["usage"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setBusy(false);
    }
  }

  function quickWindow(days: number) {
    const d = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    setExpiresAt(d.toISOString().slice(0, 16));
    setActive(true);
  }

  const liveActive = q.data?.active ?? false;

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card/40 backdrop-blur">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div>
          <h2 className="text-lg font-semibold">Global Studio promo</h2>
          <p className="text-xs text-muted-foreground">
            Temporarily upgrade <strong>every signed-in user</strong> to Studio (unlimited files, all
            languages, transcription, paid providers) for the window below. Great for launches, beta
            invites, or word-of-mouth pushes.
          </p>
        </div>
        <span
          className={
            "rounded-full px-2 py-0.5 text-xs " +
            (liveActive
              ? "bg-emerald-500/15 text-emerald-300"
              : "bg-muted text-muted-foreground")
          }
        >
          {liveActive ? "Live" : "Off"}
        </span>
      </div>

      <div className="grid gap-4 px-5 py-4 md:grid-cols-2">
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
          />
          Enable free Studio for everyone
        </label>

        <div>
          <label className="text-xs uppercase tracking-wide text-muted-foreground">
            Expires at (optional — leave blank for open-ended)
          </label>
          <input
            type="datetime-local"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-background/40 px-3 py-2 text-sm"
          />
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            {[1, 3, 7, 14, 30].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => quickWindow(d)}
                className="rounded-full border border-border bg-background/40 px-2.5 py-1 hover:bg-background/60"
              >
                +{d}d
              </button>
            ))}
            <button
              type="button"
              onClick={() => setExpiresAt("")}
              className="rounded-full border border-border bg-background/40 px-2.5 py-1 hover:bg-background/60"
            >
              Clear
            </button>
          </div>
        </div>

        <div className="md:col-span-2">
          <label className="text-xs uppercase tracking-wide text-muted-foreground">
            Banner message (shown to users while promo is active)
          </label>
          <input
            type="text"
            placeholder="🎉 Studio is free for everyone this week!"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-background/40 px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
        <button
          onClick={save}
          disabled={busy || q.isLoading}
          className="inline-flex items-center gap-2 rounded-lg bg-gold px-4 py-2 text-sm font-medium text-background transition hover:bg-gold/90 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          Save promo
        </button>
      </div>
    </div>
  );
}

// ============================================================
// Transcribe quota overrides — per-user admin overrides + audit
// ============================================================

function TranscribeOverridesAdmin() {
  const qc = useQueryClient();
  const listQ = useQuery({
    queryKey: ["admin-transcribe-overrides"],
    queryFn: () => listTranscribeOverrides(),
  });
  const auditQ = useQuery({
    queryKey: ["admin-transcribe-override-audit"],
    queryFn: () => listTranscribeOverrideAudit(),
  });
  const saveFn = useServerFn(setTranscribeOverride);

  const [email, setEmail] = useState("");
  const [mode, setMode] = useState<"unlimited" | "custom" | "free_days" | "clear">("unlimited");
  const [days, setDays] = useState<string>("");
  const [daily, setDaily] = useState<string>("");
  const [monthly, setMonthly] = useState<string>("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    try {
      await saveFn({
        data: {
          email: email.trim(),
          mode,
          dailyLimit: daily ? Number(daily) : null,
          monthlyLimit: monthly ? Number(monthly) : null,
          days: days ? Number(days) : null,
          reason: reason.trim() || undefined,
        },
      });
      toast.success(
        mode === "clear" ? `Cleared override for ${email}` : `Updated transcribe quota for ${email}`,
      );
      setEmail(""); setDays(""); setDaily(""); setMonthly(""); setReason("");
      qc.invalidateQueries({ queryKey: ["admin-transcribe-overrides"] });
      qc.invalidateQueries({ queryKey: ["admin-transcribe-override-audit"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update override");
    } finally {
      setBusy(false);
    }
  }

  async function clearFor(targetEmail: string) {
    setBusy(true);
    try {
      await saveFn({ data: { email: targetEmail, mode: "clear" } });
      toast.success(`Cleared override for ${targetEmail}`);
      qc.invalidateQueries({ queryKey: ["admin-transcribe-overrides"] });
      qc.invalidateQueries({ queryKey: ["admin-transcribe-override-audit"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to clear");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card/40 backdrop-blur">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div>
          <h2 className="text-lg font-semibold">Transcribe quota overrides</h2>
          <p className="text-xs text-muted-foreground">
            Per-user override: unlimited, custom daily/monthly caps, or free-for-N-days. Every change is audited.
          </p>
        </div>
        <Shield className="h-5 w-5 text-gold" />
      </div>

      <form onSubmit={submit} className="grid gap-3 border-b border-border px-5 py-4 md:grid-cols-2">
        <div>
          <label className="text-xs text-muted-foreground">User email</label>
          <input
            type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="someone@gmail.com"
            className="mt-1 w-full rounded-lg border border-border bg-background/40 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Mode</label>
          <select
            value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}
            className="mt-1 w-full rounded-lg border border-border bg-background/40 px-3 py-2 text-sm"
          >
            <option value="unlimited">Unlimited</option>
            <option value="custom">Custom daily / monthly limits</option>
            <option value="free_days">Free unlimited for N days</option>
            <option value="clear">Clear override</option>
          </select>
        </div>

        {mode === "custom" && (
          <>
            <div>
              <label className="text-xs text-muted-foreground">Daily limit (blank = default 30)</label>
              <input
                type="number" min={0} value={daily} onChange={(e) => setDaily(e.target.value)}
                placeholder="e.g. 100"
                className="mt-1 w-full rounded-lg border border-border bg-background/40 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Monthly limit (blank = default 900)</label>
              <input
                type="number" min={0} value={monthly} onChange={(e) => setMonthly(e.target.value)}
                placeholder="e.g. 3000"
                className="mt-1 w-full rounded-lg border border-border bg-background/40 px-3 py-2 text-sm"
              />
            </div>
          </>
        )}

        {(mode === "free_days" || mode === "custom" || mode === "unlimited") && (
          <div>
            <label className="text-xs text-muted-foreground">
              Expires in days {mode === "free_days" ? "(required)" : "(optional — blank = no expiry)"}
            </label>
            <input
              type="number" min={0} value={days} onChange={(e) => setDays(e.target.value)}
              placeholder="e.g. 7"
              className="mt-1 w-full rounded-lg border border-border bg-background/40 px-3 py-2 text-sm"
            />
          </div>
        )}

        <div className="md:col-span-2">
          <label className="text-xs text-muted-foreground">Reason (audit note)</label>
          <input
            type="text" value={reason} onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Partner trial, beta tester, support refund"
            className="mt-1 w-full rounded-lg border border-border bg-background/40 px-3 py-2 text-sm"
          />
        </div>

        <div className="md:col-span-2">
          <button
            type="submit" disabled={busy}
            className="inline-flex items-center gap-2 rounded-lg bg-gold px-4 py-2 text-sm font-medium text-background transition hover:bg-gold/90 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Apply override
          </button>
        </div>
      </form>

      <div className="border-b border-border px-5 py-4">
        <div className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Active overrides</div>
        {listQ.isLoading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : (listQ.data?.overrides ?? []).length === 0 ? (
          <div className="text-sm text-muted-foreground">No overrides set.</div>
        ) : (
          <ul className="divide-y divide-border">
            {listQ.data!.overrides.map((o) => (
              <li key={o.user_id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <div className="min-w-0">
                  <div className="truncate font-medium">{o.email ?? o.user_id}</div>
                  <div className="text-xs text-muted-foreground">
                    {o.unlimited
                      ? "Unlimited"
                      : `Custom · daily ${o.daily_limit ?? "default"} · monthly ${o.monthly_limit ?? "default"}`}
                    {o.expires_at ? ` · until ${fmtDate(o.expires_at)}` : " · no expiry"}
                    {!o.active ? " · (expired)" : ""}
                    {o.reason ? ` · ${o.reason}` : ""}
                  </div>
                </div>
                <button
                  onClick={() => o.email && clearFor(o.email)}
                  disabled={busy || !o.email}
                  className="inline-flex items-center gap-1 rounded-lg border border-border bg-background/40 px-3 py-1.5 text-xs transition hover:bg-accent disabled:opacity-50"
                >
                  <XIcon className="h-3 w-3" /> Clear
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="px-5 py-4">
        <div className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Audit log (last 100)</div>
        {auditQ.isLoading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : (auditQ.data?.entries ?? []).length === 0 ? (
          <div className="text-sm text-muted-foreground">No audit entries yet.</div>
        ) : (
          <ul className="divide-y divide-border max-h-80 overflow-auto">
            {auditQ.data!.entries.map((e: any) => (
              <li key={e.id} className="py-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{e.action}</span>
                  <span className="text-muted-foreground">{relTime(e.created_at)}</span>
                </div>
                <div className="mt-0.5 text-muted-foreground">
                  target: {e.payload?.email ?? e.target_user_id}
                  {e.payload?.reason ? ` · ${e.payload.reason}` : ""}
                  {e.payload?.expires_at ? ` · expires ${fmtDate(e.payload.expires_at)}` : ""}
                  {typeof e.payload?.daily_limit === "number" ? ` · daily ${e.payload.daily_limit}` : ""}
                  {typeof e.payload?.monthly_limit === "number" ? ` · monthly ${e.payload.monthly_limit}` : ""}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

const FEATURE_LOCK_OPTIONS: { id: "voice_dubbing" | "voice_cloning" | "lipsync" | "ai_summaries" | "transcribe" | "batch_translate"; label: string; description: string }[] = [
  { id: "voice_dubbing", label: "Voice Dubbing", description: "Re-voice transcripts in any language." },
  { id: "voice_cloning", label: "Voice Cloning", description: "Upload a consent sample to clone a voice (ElevenLabs)." },
  { id: "lipsync", label: "Built-in Lip-sync", description: "Sync.so end-to-end lip-sync renders." },
  { id: "ai_summaries", label: "AI Summaries", description: "Video & audio summaries." },
  { id: "transcribe", label: "Transcription", description: "Speech-to-text for video & audio." },
  { id: "batch_translate", label: "Batch Translate (ZIP)", description: "Bulk subtitle translation." },
];

function FeatureLocksAdmin() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin-feature-locks"], queryFn: () => getFeatureLocks() });
  const saveFn = useServerFn(setFeatureLock);
  const [drafts, setDrafts] = useState<Record<string, { locked: boolean; message: string }>>({});
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!q.data) return;
    const next: Record<string, { locked: boolean; message: string }> = {};
    for (const f of FEATURE_LOCK_OPTIONS) {
      const cur = (q.data.locks as any)?.[f.id] ?? {};
      next[f.id] = { locked: !!cur.locked, message: cur.message ?? "" };
    }
    setDrafts(next);
  }, [q.data]);

  async function save(featureId: string) {
    const d = drafts[featureId];
    if (!d) return;
    setBusy(featureId);
    try {
      await saveFn({ data: { featureId: featureId as any, locked: d.locked, message: d.message } });
      toast.success(d.locked ? "Feature locked" : "Feature unlocked");
      qc.invalidateQueries({ queryKey: ["admin-feature-locks"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card/40 backdrop-blur">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div>
          <h2 className="text-lg font-semibold">Feature locks</h2>
          <p className="text-xs text-muted-foreground">
            Temporarily disable a feature for everyone. Admins always bypass locks so you can keep testing.
          </p>
        </div>
        <ShieldOff className="h-5 w-5 text-muted-foreground" />
      </div>
      <div className="divide-y divide-border">
        {FEATURE_LOCK_OPTIONS.map((f) => {
          const d = drafts[f.id] ?? { locked: false, message: "" };
          const liveLocked = !!(q.data?.locks as any)?.[f.id]?.locked;
          return (
            <div key={f.id} className="grid gap-3 px-5 py-4 md:grid-cols-[1fr_auto] md:items-center">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{f.label}</span>
                  <span
                    className={
                      "rounded-full px-2 py-0.5 text-[10px] " +
                      (liveLocked
                        ? "bg-amber-500/15 text-amber-300"
                        : "bg-emerald-500/15 text-emerald-300")
                    }
                  >
                    {liveLocked ? "Locked" : "Unlocked"}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">{f.description}</p>
                <input
                  type="text"
                  placeholder="Optional message shown to users (e.g. “Back at 9pm UTC”)"
                  value={d.message}
                  onChange={(e) => setDrafts((s) => ({ ...s, [f.id]: { ...d, message: e.target.value } }))}
                  className="mt-2 w-full rounded-lg border border-border bg-background/40 px-3 py-1.5 text-xs"
                  maxLength={200}
                />
              </div>
              <div className="flex items-center gap-2 justify-self-end">
                <label className="inline-flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={d.locked}
                    onChange={(e) => setDrafts((s) => ({ ...s, [f.id]: { ...d, locked: e.target.checked } }))}
                  />
                  Lock
                </label>
                <button
                  type="button"
                  onClick={() => save(f.id)}
                  disabled={busy === f.id}
                  className="rounded-lg border border-border bg-background/40 px-3 py-1.5 text-xs hover:bg-background/60 disabled:opacity-50"
                >
                  {busy === f.id ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
