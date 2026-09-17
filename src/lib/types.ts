// Shapes shared by the data layer, the detectors and the UI.
//
// All amounts are in mutez (1 ꜩ = 1,000,000 mutez) until they reach the UI.

/** A marketplace sale, reconstructed from the ledger (see sales.ts). */
export interface Sale {
  id: number;
  opHash: string;
  timestamp: string;
  time: number;
  level: number;
  kind: string;
  /** Price per edition, mutez. */
  price: number;
  /** Editions sold in this sale. */
  amount: number;
  /** price x amount, mutez. */
  total: number;
  /** Historical USD value of `total`, when the indexer knows it. */
  usd: number | null;
  seller: string;
  buyer: string;
  fa2: string;
  tokenId: string;
  tokenName: string | null;
  creators: string[];
}

/** A plain tez transfer between two wallets - no contract call. */
export interface Transfer {
  id: number;
  opHash: string;
  timestamp: string;
  time: number;
  level: number;
  from: string;
  to: string;
  amount: number;
  /** XTZ/USD rate at that block. */
  usdRate: number | null;
}

/** A token moving between wallets. */
export interface TokenMove {
  id: number;
  opHash: string | null;
  transactionId: number | null;
  timestamp: string;
  time: number;
  level: number;
  from: string | null;
  to: string | null;
  fa2: string;
  tokenId: string;
  tokenName: string | null;
  amount: number;
}

export interface Account {
  address: string;
  alias: string | null;
  type: string;
  balance: number;
  firstActivityTime: string | null;
}

export interface Domain {
  name: string;
  owner: string;
  address: string | null;
  firstTime: string;
  lastLevel: number;
}

/* Patterns ------------------------------------------------------------------ */

/** How tightly a pattern's records are linked: direct, close or loose. */
export type Strength = "definitive" | "strong" | "supporting";

/** One ledger record in a pattern. */
export interface Step {
  time: string;
  kind: "sale" | "transfer" | "token" | "domain" | "balance" | "note";
  text: string;
  mutez?: number;
  usd?: number | null;
  from?: string;
  to?: string;
  /** Operation hash, for records that are operations. */
  opHash?: string;
  href?: string;
}

export type FindingKind =
  | "self-trade"
  | "funded-purchase"
  | "refunded-purchase"
  | "token-returned"
  | "buyback";

export interface Finding {
  id: string;
  kind: FindingKind;
  strength: Strength;
  title: string;
  /** Plain-language account of what the records show. */
  summary: string;
  steps: Step[];
  /** Wallets involved, the group's first. */
  wallets: string[];
  /** Sales this pattern concerns. */
  sales: Sale[];
  /** Recorded value of those sales, mutez. */
  mutez: number;
  usd: number | null;
  time: number;
  /** How the price compares with the collection's other sales at the time. */
  priceContext: { median: number; ratio: number; sampleSize: number } | null;
}

export type LinkEvidenceKind = "self" | "domain" | "first-funded" | "two-way-tez" | "funded-by";

export interface LinkEvidence {
  kind: LinkEvidenceKind;
  text: string;
  steps: Step[];
}

/** A wallet tied to the looked-up wallet by ledger records. */
export interface LinkedWallet {
  address: string;
  alias: string | null;
  /** "same-controller": grouped with the looked-up wallet by the detectors. */
  role: "investigated" | "same-controller" | "associate";
  evidence: LinkEvidence[];
  tezSent: number;
  tezReceived: number;
}

export interface Progress {
  step: string;
  detail?: string;
}
