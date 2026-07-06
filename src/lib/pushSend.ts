import type { PushSubscription } from "web-push";
import webpush from "web-push";

import { configureWebPush } from "@/lib/pushServer";

export type PushPayload = {
  title: string;
  body: string;
  url: string;
};

export async function sendPush(subscription: PushSubscription, payload: PushPayload) {
  configureWebPush();

  const message = JSON.stringify(payload);
  await webpush.sendNotification(subscription, message);
}
