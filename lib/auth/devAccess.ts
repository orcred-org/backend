import { UserRole } from "@/types";

const DEV_FULL_ACCESS_EMAILS = new Set(
  (process.env.DEV_FULL_ACCESS_EMAILS ?? "anshika.sswal@gmail.com")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
);

export function isDevFullAccess(email: string | undefined | null): boolean {
  if (process.env.NODE_ENV === "production") return false;
  if (!email) return false;
  return DEV_FULL_ACCESS_EMAILS.has(email.toLowerCase());
}

export function allowsRole(
  session: { email: string; role: UserRole } | null,
  required: UserRole,
): session is { email: string; role: UserRole } {
  if (!session) return false;
  if (isDevFullAccess(session.email)) return true;
  return session.role === required;
}
