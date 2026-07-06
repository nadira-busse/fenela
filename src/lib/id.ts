export function makeId(prefix = "id") {
  const randomUUID = globalThis.crypto?.randomUUID;

  if (typeof randomUUID === "function") {
    return `${prefix}_${randomUUID.call(globalThis.crypto)}`;
  }

  const rand = Math.random().toString(36).slice(2, 10);
  const ts = Date.now().toString(36);

  return `${prefix}_${ts}_${rand}`;
}
