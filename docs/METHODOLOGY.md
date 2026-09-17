# Methodology

This document describes exactly how the wash-trade inspector turns public ledger
records into the patterns it reports. It is written so that anyone can check
the reasoning, reproduce a report by hand, or disagree with a rule and change it.

The code is the final reference. Every threshold below is defined as a named
constant in `src/lib/detect.ts` or `src/lib/links.ts`, and
`src/lib/detect.test.ts` pins the behaviour of each rule.

> **What a report is and is not.** A report lists sequences found in public
> records. It is not a finding of wrongdoing, not evidence of guilt, and not
> legal advice. Wash trading is not necessarily illegal, and money and tokens
> move between people for legitimate reasons. The operators of any site running
> this tool - including teia.cafe - make no accusations and no recommendations
> about legal action. See [the About page](../src/components/About.tsx) for the
> full statement.

---

## 1. Data sources

Everything comes from **[TzKT](https://api.tzkt.io)**, a free, public indexer of
the Tezos blockchain. There is no private data, no scraping of marketplaces, and
no server of our own: the browser of the person doing the lookup queries TzKT
directly.

| What | TzKT endpoint |
|---|---|
| Account alias, balance | `/v1/accounts` |
| Balance at a past block | `/v1/accounts/{address}/balance_history/{level}` |
| Direct tez transfers | `/v1/operations/transactions` |
| Token transfers | `/v1/tokens/transfers` |
| .tez names | `/v1/domains` |
| USD value at the time | the `quote=usd` rate TzKT attaches to each operation |

Requests are rate-limited in the browser (at most 6 at once to TzKT) and retried
with backoff when TzKT answers "too many requests".

## 2. The wallet you look up

You enter a `tz1`/`tz2`/`tz3` address or a `.tez` name. A name is resolved to the
address it currently points at.

## 3. Direct tez transfers

For the wallet, the tool fetches every **plain tez transfer** it sent or received:

- `amount > 0`,
- no contract entrypoint (a plain transfer, not a contract call),
- for received transfers, not an internal operation (so marketplace payouts,
  which are part of sales, are excluded here),
- both sides are wallets (`tz...`), not contracts.

These are the transfers used for grouping wallets (section 4) and for the
"purchase after a transfer" and "transfer after a sale" patterns (section 6).

## 4. Grouping wallets that appear to share an owner

Activity often spans more than one address. The tool looks for three kinds of
ties between the looked-up wallet (W) and the wallets it has exchanged tez with:

| Tie | Rule |
|---|---|
| **Domain** | One wallet owns a `.tez` name that points at the other. |
| **First funded** | The very first tez a wallet ever received came from W - or W's very first tez came from it. Checked for up to 150 counterparties, largest recipients first. |
| **Tez in both directions** | At least 10 tez sent from W to the wallet **and** at least 10 tez sent back. |

A wallet is placed **in the group** ("likely the same owner") when any of these
holds:

1. it has a **domain** tie; or
2. it sent W its first tez **and** tez moved in both directions; or
3. W sent it its first tez, tez moved in both directions, **and** it sent back at
   least 50 tez and at least half of what it received.

Other tied wallets are listed as **connected** but not grouped.

Wallets are ignored entirely when TzKT labels them as a custodial exchange or
payment service (Coinbase, Kraken, Binance, MoonPay and similar), because money
through those says nothing about who controls what. Contracts are ignored too.

The history of up to 8 grouped wallets is fetched as well, so their sales and
transfers count as part of the group.

**Limit:** these ties are signs of a shared owner, not proof. A friend can own a
`.tez` name for someone; a gallery can fund a collector's wallet.

## 5. Reconstructing sales from the ledger

There is no "sale" record on Tezos. A sale is an operation in which a marketplace
contract moves a token to the buyer and moves tez (or wXTZ, wrapped tez) out to
the seller, the creator's royalty and the platform. For each wallet in the group:

1. **Works.** Every transfer of a token whose metadata lists the wallet as a
   creator (`token.metadata.creators`), excluding mints.
2. **Operations.** The operation each transfer happened in: block level, operation
   counter, hash, and who started it.
3. **Payments.** For operations run by a contract (a marketplace), the tez that
   moved in them, fetched per batch of blocks and narrowed to those marketplace
   contracts and the wallets that started the operations, then matched to each
   operation by hash. wXTZ transfers are fetched for operations that moved no tez.
4. **Price.** If the buyer paid the marketplace in the same operation (buying a
   listing), the price is what the buyer paid. Otherwise (accepted offers, settled
   auctions - the money was held in advance) it is what the marketplace paid out.
   When one operation sold several tokens, the price is split by editions.
5. **Seller.** The wallet the token came from - or, when the marketplace held the
   token in escrow, the wallet the marketplace paid the most.

A token transfer in an operation with no payment is not a sale. Those are kept
as **token movements** (gifts, moves between own wallets, hand-backs).

**Accuracy check.** For a wallet with about 6,000 sales of its works, the
reconstructed sales were compared with objkt.com's own sales index: every sale of
a token with creator metadata was found, the price matched on 99.9% of them, and
the seller on 99.6% (most differences were sales where objkt names a sale
contract and the ledger names the artist who was paid).

**Limit:** works in collections that do not record a creator in token metadata
(fxhash generative tokens, some Rarible mints) are not covered.

## 6. The patterns

"The group" is the looked-up wallet plus the wallets grouped with it (section 4).
"The group's works" are tokens created by any wallet in the group.

Each pattern has a **link strength** describing how tightly its records connect -
not how likely anything is to be wrong:

- **Direct** - the ledger shows it on its own.
- **Close** - a short chain of records that can each be checked.
- **Loose** - the same shape with a looser link.

### 6.1 Within the group

A sale where the buyer and seller are both in the group.

- **Direct** when buyer and seller are the same address.
- **Close** when they are different wallets in the group.

### 6.2 Purchase after a transfer

A wallet in the group sends tez to a wallet outside it, and within **48 hours**
that wallet buys the group's works for a total of **60-110% of the transfer**
(plus 1 tez of tolerance). Each purchase is matched to at most one transfer.

The recipient's balance at the block **before** the transfer is shown.

- **Close** when that balance was below the price of the first purchase, or when
  the seller was also in the group.
- **Loose** otherwise.

### 6.3 Transfer after a sale

The group sells works to a buyer, and within **7 days** a wallet in the group
sends that buyer **80-110% of the price** (plus 1 tez of tolerance). The tool
matches either all the buyer's purchases in that window or a single sale -
whichever the transfer amount matches more closely. Each sale is matched once.

- **Close** when the transfer came within **24 hours** of the sale.
- **Loose** otherwise.

### 6.4 Work returned

A buyer who bought a work from the group later transfers that same token back to
a wallet in the group, in an operation with **no payment**.

- **Close** when this happened within **30 days** of the sale.
- **Loose** otherwise.

### 6.5 Buyback

The group sells a work to a wallet it has exchanged tez with directly, then buys
the same token back from that wallet within **180 days** for **at least 1.5x**
the earlier price.

- Always **Loose**.

## 7. Price context

For each pattern, the tool compares the highest price per edition among its sales
with the **median price per edition** of the same collection's other sales in the
**60 days** before and after. Sales that are part of any pattern are left out of
the median. A comparison is shown only when there are at least **3** other sales.

This shows where a sale sat relative to the rest of the market. It does not show
why.

## 8. What the tool cannot see

- Money routed through exchanges, bridges, contracts or several intermediate
  wallets. Only direct wallet-to-wallet tez transfers are considered.
- Ownership. Grouping is an inference.
- Intent. No record says why money or a token moved.
- Anything an indexer has missed or mislabelled.
- Sales of works without creator metadata (section 5).

No result - including "no patterns found" - is a statement about anyone's
conduct.

## 9. Reproducing a report

Every step in a pattern links to its operation on [tzkt.io](https://tzkt.io).
To check a pattern by hand, open each operation and confirm the sender, receiver,
amount and time. "Download records (JSON)" saves everything the report was built
from, and "Copy report" gives a plain-text version with the same links.

## 10. Changing the rules

The rules are deliberately simple and conservative. If you think a threshold is
wrong, change the constant in `src/lib/detect.ts` or `src/lib/links.ts`, update
the tests in `src/lib/detect.test.ts`, and update this document so it stays
accurate. Suggestions are welcome as issues or pull requests.
