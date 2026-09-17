export function formatTez(mutez: number): string {
  const tez = mutez / 1_000_000;
  const digits = tez >= 100 ? 0 : tez >= 1 ? 2 : 4;
  return `${tez.toLocaleString("en-US", { maximumFractionDigits: digits })} ꜩ`;
}

export function formatUsd(usd: number | null | undefined): string {
  if (usd == null || !Number.isFinite(usd)) return "";
  return usd.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: usd >= 100 ? 0 : 2 });
}

export const shortAddress = (a: string) => (a.length > 14 ? `${a.slice(0, 7)}…${a.slice(-4)}` : a);

export function formatDate(iso: string | number): string {
  const d = new Date(iso);
  return d.toISOString().slice(0, 16).replace("T", " ") + " UTC";
}

export function formatGap(ms: number): string {
  const abs = Math.abs(ms);
  const minutes = Math.round(abs / 60_000);
  if (minutes < 60) return `${minutes} min`;
  const hours = abs / 3_600_000;
  if (hours < 48) return `${hours.toFixed(hours < 10 ? 1 : 0)} h`;
  return `${Math.round(hours / 24)} days`;
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
