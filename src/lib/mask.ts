export function maskEmail(_email: string | null | undefined): string {
  // Privacy-first: never reveal any portion of the email address.
  return "Hidden for privacy";
}
