import { z } from "zod";

// Allowed real email providers
const ALLOWED_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "yahoo.com",
  "yahoo.co.uk",
  "icloud.com",
  "me.com",
  "mac.com",
]);

// Common disposable / temporary email domains (and lookalikes)
const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com", "10minutemail.com", "guerrillamail.com", "guerrillamailblock.com",
  "tempmail.com", "temp-mail.org", "temp-mail.io", "tempmailo.com",
  "trashmail.com", "throwawaymail.com", "yopmail.com", "maildrop.cc",
  "getnada.com", "nada.email", "fakeinbox.com", "dispostable.com",
  "sharklasers.com", "grr.la", "spam4.me", "tempinbox.com",
  "mintemail.com", "mytemp.email", "moakt.com", "emailondeck.com",
  "tempr.email", "tmpmail.org", "mohmal.com", "mailnesia.com",
  "anonbox.net", "burnermail.io", "dropmail.me", "fakemail.net",
  // Gmail lookalikes
  "gmai1.com", "gmial.com", "gmaill.com", "gmal.com", "gnail.com",
  "gmail.co", "gmail.con", "gmaii.com",
]);

export type EmailValidationIssue =
  | "format"
  | "length"
  | "disposable"
  | "provider"
  | "plus_alias"
  | "leading_dot"
  | "trailing_dot"
  | "consecutive_dots"
  | "too_many_dots"
  | "short_dot_fragments"
  | "local_too_short";

export interface EmailValidationResult {
  ok: boolean;
  email: string;
  issues: EmailValidationIssue[];
  messages: string[];
}

const ISSUE_MESSAGES: Record<EmailValidationIssue, string> = {
  format: "Email address is not valid. Make sure it has an @ symbol and a domain (for example, you@gmail.com).",
  length: "Email address is too long. It must be 254 characters or fewer.",
  disposable: "Temporary or disposable email addresses are not allowed. Please use a permanent email.",
  provider: "We only accept Gmail, Outlook, Yahoo, or iCloud email addresses. Please use one of those providers.",
  plus_alias: "Email addresses with '+' (like user+tag@gmail.com) are not allowed. Please use your primary email without the '+' part.",
  leading_dot: "The part before @ cannot start with a dot. Remove the dot at the beginning.",
  trailing_dot: "The part before @ cannot end with a dot. Remove the dot at the end.",
  consecutive_dots: "The part before @ cannot have two dots in a row (..). Please remove the extra dot.",
  too_many_dots: "Too many dots in the part before @. Use a simpler email address with fewer dots.",
  short_dot_fragments: "The parts between dots in your email are too short. Use longer segments (at least 3 characters each).",
  local_too_short: "The part before @ is too short. It must be at least 3 characters.",
};

export function validateEmailDetailed(email: string): EmailValidationResult {
  const issues: EmailValidationIssue[] = [];
  const trimmed = email.trim().toLowerCase();

  // 1. Basic format
  if (!trimmed.includes("@") || trimmed.split("@").length !== 2) {
    issues.push("format");
  }

  // 2. Max length
  if (trimmed.length > 254) {
    issues.push("length");
  }

  const [localPart, domain] = trimmed.split("@");

  // 3. Domain checks
  if (domain) {
    if (DISPOSABLE_DOMAINS.has(domain)) {
      issues.push("disposable");
    } else if (!ALLOWED_DOMAINS.has(domain)) {
      issues.push("provider");
    }
  }

  // 4. Local part checks
  if (localPart !== undefined) {
    if (localPart.includes("+")) {
      issues.push("plus_alias");
    }
    if (localPart.startsWith(".")) {
      issues.push("leading_dot");
    }
    if (localPart.endsWith(".")) {
      issues.push("trailing_dot");
    }
    if (localPart.includes("..")) {
      issues.push("consecutive_dots");
    }
    const dotCount = (localPart.match(/\./g) ?? []).length;
    if (dotCount > 2) {
      issues.push("too_many_dots");
    }
    if (dotCount >= 2 && localPart.split(".").some((p) => p.length <= 2)) {
      issues.push("short_dot_fragments");
    }
    if (localPart.length < 3) {
      issues.push("local_too_short");
    }
  }

  const messages = [...new Set(issues)].map((i) => ISSUE_MESSAGES[i]);

  return {
    ok: issues.length === 0,
    email: trimmed,
    issues,
    messages,
  };
}

export function validateEmail(email: string): { ok: true; email: string } | { ok: false; error: string } {
  const r = validateEmailDetailed(email);
  if (r.ok) return { ok: true, email: r.email };
  return { ok: false, error: r.messages[0] ?? "Invalid email address" };
}
