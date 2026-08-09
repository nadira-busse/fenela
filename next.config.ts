import type { NextConfig } from "next";

// The browser Supabase client (src/lib/supabase/client.ts) calls the
// Supabase Auth REST API directly from the browser, so its origin must be
// allowed by connect-src or every auth request is blocked by CSP. Only
// added when configured, so environments without Supabase set up keep the
// stricter default.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const connectSrc = ["'self'", supabaseUrl].filter(Boolean).join(" ");

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: https:",
              "font-src 'self' data:",
              `connect-src ${connectSrc}`,
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
