import { describe, expect, it } from "vitest";
import { detect, type DetectInput } from "./detect";
import type { Sale, TokenMove, Transfer } from "./types";

const TEZ = 1_000_000;
const H = 3_600_000;
const T0 = Date.parse("2022-03-01T00:00:00Z");

const ARTIST = "tz1artist000000000000000000000000000";
const VAULT = "tz1vault0000000000000000000000000000";
const BUYER = "tz1buyer0000000000000000000000000000";
const OTHER = "tz1other0000000000000000000000000000";
const COLLECTOR = "tz1collector000000000000000000000000";

let id = 0;
function sale(p: Partial<Sale> & { at: number; seller: string; buyer: string; tez: number }): Sale {
  const time = T0 + p.at;
  const price = p.tez * TEZ;
  return {
    id: ++id,
    opHash: `oo-sale-${id}`,
    timestamp: new Date(time).toISOString(),
    time,
    level: 1000 + id,
    kind: "list_buy",
    price,
    amount: 1,
    total: price,
    usd: p.tez * 3,
    fa2: p.fa2 ?? "KT1collection",
    tokenId: p.tokenId ?? String(id),
    tokenName: p.tokenName ?? `Work ${id}`,
    creators: p.creators ?? [ARTIST],
    seller: p.seller,
    buyer: p.buyer,
  };
}

function transfer(at: number, from: string, to: string, tez: number): Transfer {
  const time = T0 + at;
  return { id: ++id, opHash: `oo-tx-${id}`, timestamp: new Date(time).toISOString(), time, level: 1000 + id, from, to, amount: tez * TEZ, usdRate: 3 };
}

function move(at: number, from: string, to: string, fa2: string, tokenId: string): TokenMove {
  const time = T0 + at;
  return { id: ++id, opHash: `oo-move-${id}`, transactionId: id, timestamp: new Date(time).toISOString(), time, level: 1000 + id, from, to, fa2, tokenId, tokenName: null, amount: 1 };
}

function input(p: Partial<DetectInput>): DetectInput {
  return {
    side: new Set([ARTIST, VAULT]),
    associates: new Set(),
    sales: [],
    transfers: [],
    tokenMoves: [],
    name: (a) => a.slice(0, 8),
    balanceAt: async () => null,
    ...p,
  };
}

describe("self-trades", () => {
  it("flags a wallet buying from itself as definitive", async () => {
    const f = await detect(input({ sales: [sale({ at: 0, seller: ARTIST, buyer: ARTIST, tez: 50 })] }));
    expect(f).toHaveLength(1);
    expect(f[0].kind).toBe("self-trade");
    expect(f[0].strength).toBe("definitive");
  });

  it("flags a sale between two same-controller wallets as strong", async () => {
    const f = await detect(input({ sales: [sale({ at: 0, seller: ARTIST, buyer: VAULT, tez: 50 })] }));
    expect(f[0].strength).toBe("strong");
  });
});

describe("funded purchases", () => {
  it("links a transfer to a purchase of about that amount soon after", async () => {
    const f = await detect(
      input({
        transfers: [transfer(0, ARTIST, BUYER, 100)],
        sales: [sale({ at: 2 * H, seller: OTHER, buyer: BUYER, tez: 95 })],
        balanceAt: async () => 5 * TEZ,
      }),
    );
    expect(f).toHaveLength(1);
    expect(f[0].kind).toBe("funded-purchase");
    expect(f[0].strength).toBe("strong"); // held 5 ꜩ, spent 95
    expect(f[0].steps.map((s) => s.kind)).toEqual(["balance", "transfer", "sale"]);
  });

  it("is only supporting when the buyer could have paid anyway and the seller is outside", async () => {
    const f = await detect(
      input({
        transfers: [transfer(0, ARTIST, BUYER, 100)],
        sales: [sale({ at: 2 * H, seller: OTHER, buyer: BUYER, tez: 95 })],
        balanceAt: async () => 5000 * TEZ,
      }),
    );
    expect(f[0].strength).toBe("supporting");
  });

  it("ignores purchases far smaller than the transfer", async () => {
    const f = await detect(
      input({
        transfers: [transfer(0, ARTIST, BUYER, 1600)],
        sales: [sale({ at: 2 * H, seller: ARTIST, buyer: BUYER, tez: 7.77 })],
      }),
    );
    expect(f.filter((x) => x.kind === "funded-purchase")).toHaveLength(0);
  });

  it("ignores purchases outside the window", async () => {
    const f = await detect(
      input({
        transfers: [transfer(0, ARTIST, BUYER, 100)],
        sales: [sale({ at: 72 * H, seller: OTHER, buyer: BUYER, tez: 100 })],
      }),
    );
    expect(f).toHaveLength(0);
  });

  it("ignores works the investigated side did not create", async () => {
    const f = await detect(
      input({
        transfers: [transfer(0, ARTIST, BUYER, 100)],
        sales: [sale({ at: H, seller: OTHER, buyer: BUYER, tez: 100, creators: [OTHER] })],
      }),
    );
    expect(f).toHaveLength(0);
  });

  it("uses each purchase once", async () => {
    const f = await detect(
      input({
        transfers: [transfer(0, ARTIST, BUYER, 100), transfer(H, VAULT, BUYER, 100)],
        sales: [sale({ at: 2 * H, seller: OTHER, buyer: BUYER, tez: 100 })],
      }),
    );
    expect(f.filter((x) => x.kind === "funded-purchase")).toHaveLength(1);
  });
});

describe("refunded purchases", () => {
  it("flags the price sent back to the buyer within a day as strong", async () => {
    const f = await detect(
      input({
        sales: [sale({ at: 0, seller: ARTIST, buyer: BUYER, tez: 77 })],
        transfers: [transfer(H, ARTIST, BUYER, 77)],
      }),
    );
    expect(f).toHaveLength(1);
    expect(f[0].kind).toBe("refunded-purchase");
    expect(f[0].strength).toBe("strong");
  });

  it("matches one sale when the buyer bought several", async () => {
    const f = await detect(
      input({
        sales: [
          sale({ at: 0, seller: ARTIST, buyer: BUYER, tez: 10 }),
          sale({ at: H, seller: ARTIST, buyer: BUYER, tez: 77 }),
        ],
        transfers: [transfer(3 * H, ARTIST, BUYER, 77)],
      }),
    );
    expect(f[0].sales).toHaveLength(1);
    expect(f[0].sales[0].price).toBe(77 * TEZ);
  });

  it("does not flag a payment unrelated in size", async () => {
    const f = await detect(
      input({
        sales: [sale({ at: 0, seller: ARTIST, buyer: BUYER, tez: 77 })],
        transfers: [transfer(H, ARTIST, BUYER, 5)],
      }),
    );
    expect(f).toHaveLength(0);
  });
});

describe("tokens returned", () => {
  it("flags a sold token given back without a sale", async () => {
    const s = sale({ at: 0, seller: ARTIST, buyer: BUYER, tez: 200, tokenId: "42" });
    const f = await detect(input({ sales: [s], tokenMoves: [move(5 * 24 * H, BUYER, VAULT, s.fa2, "42")] }));
    expect(f).toHaveLength(1);
    expect(f[0].kind).toBe("token-returned");
    expect(f[0].strength).toBe("strong");
  });

  it("does not count a move that is itself a sale", async () => {
    const s = sale({ at: 0, seller: ARTIST, buyer: BUYER, tez: 200, tokenId: "42" });
    const back = sale({ at: 24 * H, seller: BUYER, buyer: ARTIST, tez: 300, tokenId: "42" });
    const m = { ...move(24 * H, BUYER, ARTIST, s.fa2, "42"), opHash: back.opHash };
    const f = await detect(input({ sales: [s, back], tokenMoves: [m] }));
    expect(f.filter((x) => x.kind === "token-returned")).toHaveLength(0);
  });
});

describe("buybacks", () => {
  it("flags buying back higher from an associate within the window", async () => {
    const f = await detect(
      input({
        associates: new Set([COLLECTOR]),
        sales: [
          sale({ at: 0, seller: ARTIST, buyer: COLLECTOR, tez: 10, tokenId: "7" }),
          sale({ at: 30 * 24 * H, seller: COLLECTOR, buyer: ARTIST, tez: 40, tokenId: "7" }),
        ],
      }),
    );
    expect(f.map((x) => x.kind)).toContain("buyback");
  });

  it("ignores buybacks years later", async () => {
    const f = await detect(
      input({
        associates: new Set([COLLECTOR]),
        sales: [
          sale({ at: 0, seller: ARTIST, buyer: COLLECTOR, tez: 10, tokenId: "7" }),
          sale({ at: 900 * 24 * H, seller: COLLECTOR, buyer: ARTIST, tez: 40, tokenId: "7" }),
        ],
      }),
    );
    expect(f).toHaveLength(0);
  });
});

describe("price context", () => {
  it("compares a flagged price with the collection's other sales", async () => {
    const normal = [1, 2, 3, 4, 5].map((i) => sale({ at: i * H, seller: ARTIST, buyer: `tz1n${i}`, tez: 10 }));
    const flagged = sale({ at: 10 * H, seller: ARTIST, buyer: ARTIST, tez: 100 });
    const f = await detect(input({ sales: [...normal, flagged] }));
    expect(f[0].priceContext?.ratio).toBe(10);
    expect(f[0].priceContext?.sampleSize).toBe(5);
  });
});
