// Client-side shape of the logged-in operator (session identity for nav/display).
// Authentication is server-side against the DB — the client never receives a passcode.
// NOTE: a hardcoded OPERATOR_ACCOUNTS list of plaintext credentials used to live here
// and shipped in the JS bundle. It was dead (never imported) and has been removed;
// real accounts live in the database (see lib/seed.ts + lib/db.ts).
export interface OperatorUser {
  username: string;
  passcode?: string;
  role: string;
  name: string;
  allowedPaths: string[];
  isFirstLogin?: boolean;
  tenantId?: string;
}
