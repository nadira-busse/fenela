// Exported so src/lib/localOwner.ts's explicit sign-out cleanup can remove
// it without duplicating the literal key string.
export const DEVICE_ID_KEY = "fenela_device_id";

export function getOrCreateDeviceId(): string {
  if (typeof window === "undefined") {
    throw new Error("getOrCreateDeviceId called on server");
  }

  let deviceId = localStorage.getItem(DEVICE_ID_KEY);

  if (!deviceId) {
    deviceId = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, deviceId);
  }

  return deviceId;
}

// Non-creating counterpart for callers that must not mint a new device
// identity just to check whether one already exists — e.g. sign-out
// cleanup, which has nothing to clean up for a browser that never
// registered a device.
export function getDeviceId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(DEVICE_ID_KEY);
}

// For an authenticated subscribe response, /api/push/subscribe returns a
// server-verified Postgres devices.id instead of the raw client-generated
// id; that becomes the id every subsequent
// schedule/cancel call must send, so it needs to overwrite the local
// cache. A stale cached id from a previous account on this same browser
// is naturally replaced this same way: the server rejects
// it as not-owned and issues a fresh one instead of reassigning it.
export function setDeviceId(deviceId: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(DEVICE_ID_KEY, deviceId);
}
