// The Supabase gateway already verifies the JWT's signature and expiry
// before this function runs (functions are deployed with JWT verification
// on, the default). So it's safe to just decode the payload locally to pull
// out the caller's user id — no extra network round trip to /auth/v1/user.
export function getUserId(req: Request): string | null {
  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    return typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
}
