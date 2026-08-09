// Validates a caller-supplied `next` redirect target for the auth flow.
//
// Only a single, relative, internal path is accepted. Everything else
// (absolute URLs, protocol-relative URLs, backslash tricks some browsers
// normalize to a protocol-relative URL) falls back to a safe default
// instead of creating an open redirect.

const DEFAULT_SAFE_PATH = "/";

// Exactly one leading "/", not followed by another "/" or "\", and no
// whitespace (which would also let a "\n" split a Location header).
const INTERNAL_PATH_PATTERN = /^\/(?!\/|\\)\S*$/;

export function safeRedirectPath(
  candidate: string | null | undefined,
  fallback: string = DEFAULT_SAFE_PATH
): string {
  if (!candidate) {
    return fallback;
  }

  if (!INTERNAL_PATH_PATTERN.test(candidate)) {
    return fallback;
  }

  if (candidate.includes("://")) {
    return fallback;
  }

  return candidate;
}
