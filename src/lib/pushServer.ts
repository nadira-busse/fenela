import webpush from "web-push";

export function configureWebPush() {
  const publicKey = process.env.WEB_PUSH_PUBLIC_KEY;
  const privateKey = process.env.WEB_PUSH_PRIVATE_KEY;
  const subject = process.env.WEB_PUSH_SUBJECT;

  if (!publicKey || !privateKey || !subject) {
    throw new Error("Missing WEB_PUSH env vars");
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  return { publicKey };
}
