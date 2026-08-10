// src/lib/pushClient.ts

import { getOrCreateDeviceId, setDeviceId } from "@/lib/device";

export async function ensureServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    throw new Error("Service workers are not supported on this device.");
  }

  const existing = await navigator.serviceWorker.getRegistration();
  if (existing) return existing;

  return navigator.serviceWorker.register("/sw.js");
}

export function getNotificationPermission(): NotificationPermission | "unsupported" {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }

  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!("Notification" in window)) {
    throw new Error("Notifications are not supported on this device.");
  }

  if (Notification.permission === "granted") return "granted";
  return await Notification.requestPermission();
}

export async function fetchPublicVapidKey(): Promise<string> {
  const res = await fetch("/api/push/public-key");
  const data = await res.json().catch(() => ({}));

  if (!res.ok || data?.ok === false || typeof data?.publicKey !== "string") {
    throw new Error(data?.error ?? "Failed to fetch public VAPID key.");
  }

  return data.publicKey;
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");

  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;
}

export async function subscribeToPush(publicKey: string): Promise<PushSubscription> {
  const reg = await ensureServiceWorker();

  const existing = await reg.pushManager.getSubscription();
  if (existing) return existing;

  return await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });
}

export async function saveSubscriptionToServer(sub: PushSubscription) {
  const deviceId = getOrCreateDeviceId();

  const res = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      subscription: sub.toJSON(),
      deviceId,
    }),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok || data?.ok === false) {
    throw new Error(data?.error ?? "Failed to save subscription.");
  }

  // For an authenticated caller, the server may return a different,
  // ownership-verified device id than the one just sent (Phase 4D §9/§10)
  // — every subsequent schedule/cancel call must use that one.
  const effectiveDeviceId =
    typeof data?.deviceId === "string" && data.deviceId.length > 0 ? data.deviceId : deviceId;

  if (effectiveDeviceId !== deviceId) {
    setDeviceId(effectiveDeviceId);
  }

  return { deviceId: effectiveDeviceId, data };
}

export async function enablePushForCurrentDevice() {
  const permission = await requestNotificationPermission();

  if (permission !== "granted") {
    return { ok: false as const, permission };
  }

  const publicKey = await fetchPublicVapidKey();
  const subscription = await subscribeToPush(publicKey);
  const saved = await saveSubscriptionToServer(subscription);

  return {
    ok: true as const,
    permission,
    deviceId: saved.deviceId,
  };
}
