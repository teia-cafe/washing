# Wash-trade inspector

An open-source tool that reports sale and transfer patterns for a Tezos wallet,
straight from public ledger data. teia.cafe runs it at
**[washing.teia.cafe](https://washing.teia.cafe)**; anyone can run their own copy.

Enter a wallet or `.tez` name and the inspector lists works sold between wallets
that appear to share an owner, purchases paid for with tez that came from the
seller's side, prices sent back to buyers, and works handed back after a sale.
Every pattern links to the operations it is built from, so it can be checked by
anyone.

## Why it exists

Wash trading - buying and selling the same asset, often between wallets
controlled by the same person, to create the appearance of demand or to move a
price - has become a widespread problem in NFT markets. There is little
regulation, no common way to tie a wallet to a person, and no oversight body.

On Tezos, artists usually use their wallet address as their public identity,
which makes self-trading patterns easier to see than in most industries -
especially high-volume trading on public leaderboards that seems to have no
purpose outside of itself. This tool lays out the public records so that
artists, collectors, curators and marketplaces can all look at the same data.

## What it is not

> **This tool reports data. It does not accuse anyone.**
>
> - A pattern is a sequence in public records, not a finding of wrongdoing or
>   evidence of guilt.
> - Wash trading is not necessarily illegal; in many places it is frowned upon
>   rather than against the law. Nothing here is legal advice.
> - Money and tokens move between people for legitimate reasons all the time:
>   gifts, prizes, collaborations, payment for other work, refunds, galleries or
>   friends acting for an artist, or an artist moving works between their own
>   wallets.
> - Grouping wallets by owner is an inference, and the records can be incomplete.
>
> teia.cafe makes no accusations and no recommendations about legal action based
> on these reports. The same applies to anyone operating their own copy.

## How it works

Everything is read from [TzKT](https://tzkt.io), a free public indexer of the
Tezos blockchain, directly in the visitor's browser. There is no backend and no
private data.

1. **Group wallets** that appear to share an owner, using `.tez` name ownership,
   "first funded by" links and tez flowing in both directions.
2. **Reconstruct sales** of the group's works from the ledger: token transfers,
   the operations they happened in, and the tez or wXTZ paid in those operations.
3. **Find patterns** between those sales and the group's direct tez transfers and
   token movements, each with a link strength (direct, close, loose).
4. **Show price context**: how each pattern's price compares with the
   collection's other sales at the time.

The full rules, thresholds and known limits are in
**[docs/METHODOLOGY.md](docs/METHODOLOGY.md)**, and on the site's Methodology page.

## Host your own copy

You can run an independent copy for free, without writing code: fork this
repository, enable GitHub Pages, and run the deploy workflow. The beginner guide
covers GitHub Pages, custom domains, other free hosts and running it on your own
computer: **[docs/SELF-HOSTING.md](docs/SELF-HOSTING.md)**.

This is a recommendation for transparency, not a requirement:
washing.teia.cafe itself is hosted by teia.cafe on Cloudflare.

## Development

Requires [Node.js](https://nodejs.org) (LTS).

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # tests for the detection rules
npm run lint
npm run build    # static site in dist/
```

Settings are build-time environment variables; see `.env.example` and
[docs/SELF-HOSTING.md#7-settings-reference](docs/SELF-HOSTING.md#7-settings-reference).

| Path | What |
|---|---|
| `src/lib/sales.ts` | Reconstructing sales from ledger records |
| `src/lib/links.ts` | Grouping wallets that appear to share an owner |
| `src/lib/detect.ts` | The pattern rules and their thresholds |
| `src/lib/detect.test.ts` | Tests pinning each rule |
| `src/lib/investigate.ts` | One lookup, start to finish |
| `src/components/` | The interface, About, Methodology and hosting pages |
| `.github/workflows/` | CI, and GitHub Pages for forks |

## Deployment (teia.cafe)

`washing.teia.cafe` is built and deployed by Cloudflare Workers Builds, which is
connected to this repository and redeploys on every push to `main`, using
`wrangler.jsonc`. Forks don't need that file; they use `pages.yml` instead.

## Contributing

Issues and pull requests are welcome - especially corrections to how the ledger
is read, and cases where a rule reports something it should not. If you believe
a report about your own wallet is wrong, please open an issue.

## License

[MIT](LICENSE)
