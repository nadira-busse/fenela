export function getOrCreateDeviceId(): string {
  if (typeof window === "undefined") {
    throw new Error("getOrCreateDeviceId called on server");
  }

  const KEY = "fenela_device_id";
  let deviceId = localStorage.getItem(KEY);

  if (!deviceId) {
    deviceId = crypto.randomUUID();
    localStorage.setItem(KEY, deviceId);
  }

  return deviceId;
}
