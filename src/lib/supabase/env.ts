// Public (browser-safe) Supabase configuration.
//
// Read as literal `process.env.NEXT_PUBLIC_*` member expressions (not a
// dynamic lookup) so Next.js can inline these values into client bundles.
// A dynamic `process.env[name]` lookup would work on the server but resolve
// to `undefined` in browser code.

export type SupabasePublicEnv = {
  url: string;
  publishableKey: string;
};

export function getSupabasePublicEnv(): SupabasePublicEnv {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    throw new Error(
      "Missing required Supabase configuration: NEXT_PUBLIC_SUPABASE_URL and " +
        "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must both be set."
    );
  }

  return { url, publishableKey };
}
