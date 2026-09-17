import { SOURCE_URL } from "@/config";
import { BUYBACK_WINDOW, FUNDING_WINDOW, REFUND_WINDOW, RETURN_WINDOW } from "@/lib/detect";

const hours = (ms: number) => Math.round(ms / 3_600_000);
const days = (ms: number) => Math.round(ms / 86_400_000);

/**
 * The methodology, in the app. The full version with every rule spelled out is
 * docs/METHODOLOGY.md; the time windows here come from the detector constants
 * so the two cannot drift apart on those.
 */
export function Method() {
  const doc = `${SOURCE_URL}/blob/main/docs/METHODOLOGY.md`;
  return (
    <article className="page method">
      <h1>Methodology</h1>
      <p className="lede">
        How the inspector turns public ledger records into the patterns it reports - written so anyone can check the reasoning,
        reproduce a report by hand, or disagree with a rule and change it. The complete version, with every threshold, is{" "}
        <a href={doc}>docs/METHODOLOGY.md</a> in the repository.
      </p>

      <section>
        <h2>1. What a report is</h2>
        <p>
          A list of sequences found in public records, each with links to the operations it is built from. It is not a finding of
          wrongdoing, not evidence of guilt and not legal advice. Wash trading is not necessarily illegal, and money and tokens move
          between people for legitimate reasons. See <a href="#/about">About</a>.
        </p>
      </section>

      <section>
        <h2>2. Data sources</h2>
        <p>
          Everything comes from <a href="https://api.tzkt.io">TzKT</a>, a free public indexer of the Tezos blockchain: accounts
          and balances (including balances at past blocks), direct tez transfers, token transfers, .tez names, and the USD rate
          recorded with each operation. There is no private data and no server of our own - your browser queries TzKT directly,
          a few requests at a time.
        </p>
        <p>
          TzKT limits how many requests one visitor or network can make, and a busy wallet takes a few hundred. When TzKT pushes
          back, the tool pauses, slows down and retries, and tells you it is doing so. If some queries still cannot be completed,
          the report is marked as possibly incomplete - missing data can mean fewer patterns or wallets grouped differently - and
          running the lookup again after a few minutes gives fuller results. Queries the report cannot fairly do without, such as
          the details that keep exchanges from being grouped as the same owner, stop the lookup instead.
        </p>
      </section>

      <section>
        <h2>3. Grouping wallets that appear to share an owner</h2>
        <p>The tool looks for three kinds of tie between the wallet you looked up and the wallets it exchanged tez with:</p>
        <ul>
          <li>
            <strong>Domain</strong> - one wallet owns a .tez name that points at the other.
          </li>
          <li>
            <strong>First funded</strong> - a wallet&apos;s very first tez came from the looked-up wallet, or the other way round.
          </li>
          <li>
            <strong>Tez in both directions</strong> - at least 10 tez each way.
          </li>
        </ul>
        <p>
          A wallet joins <strong>the group</strong> (&quot;likely the same owner&quot;) with a domain tie; or when it funded the
          looked-up wallet first and tez moved both ways; or when the looked-up wallet funded it first, tez moved both ways, and it
          sent back at least 50 tez and at least half of what it received. Weaker ties are listed as connected, not grouped.
          Exchanges and payment services are ignored. These are signs of a shared owner, not proof.
        </p>
      </section>

      <section>
        <h2>4. Reading sales from the ledger</h2>
        <p>
          Tezos has no &quot;sale&quot; record. A sale is an operation in which a marketplace contract moves a token to the buyer
          and pays out tez or wXTZ. For every wallet in the group, the tool takes each transfer of a token whose metadata lists the
          wallet as a creator or minter - plus works made through a collaboration contract the wallet shares in - finds the
          operation it happened in, and fetches the payments in that operation. Paid mints of open editions count as sales. The
          price is what the buyer paid the marketplace, or - for accepted offers and settled auctions - what the marketplace paid
          out. The seller is the wallet the token came from; for escrowed listings and open editions, the artist (or collab
          contract) who was paid, never a platform fee wallet. A transfer with no payment is kept as a token movement, not a sale.
        </p>
        <p>
          Checked against objkt.com&apos;s own index for 12 wallets with 10,562 sales between them: 98.9% were found, with the
          price within 3% on 99.1% of those. Not covered: works with neither creator nor minter metadata (fxhash generative
          tokens, some Rarible mints), and sales whose proceeds stay inside the marketplace contract until withdrawn (Versum).
        </p>
      </section>

      <section>
        <h2>5. The patterns</h2>
        <p>
          Each pattern carries a <strong>link strength</strong> - how tightly its records connect, not how likely anything is to
          be wrong: <strong>Direct</strong> (the ledger shows it on its own), <strong>Close</strong> (a short chain of checkable
          records) or <strong>Loose</strong> (the same shape with a looser link).
        </p>
        <ul>
          <li>
            <strong>Within the group</strong> - buyer and seller are both in the group. Direct when they are the same address,
            close otherwise.
          </li>
          <li>
            <strong>Purchase after a transfer</strong> - the group sends a wallet tez and within {hours(FUNDING_WINDOW)} hours it
            buys the group&apos;s works for 60-110% of that amount. Close when its balance just before the transfer was below the
            price or the seller was also in the group; loose otherwise.
          </li>
          <li>
            <strong>Transfer after a sale</strong> - the group sells works and within {days(REFUND_WINDOW)} days sends the buyer
            80-110% of the price. Close within 24 hours; loose otherwise.
          </li>
          <li>
            <strong>Work returned</strong> - a buyer transfers a work back to the group with no payment in that operation. Close
            within {days(RETURN_WINDOW)} days of the sale; loose otherwise.
          </li>
          <li>
            <strong>Buyback</strong> - the group sells a work to a wallet it exchanges tez with, then buys it back from that
            wallet within {days(BUYBACK_WINDOW)} days for at least 1.5x. Always loose.
          </li>
        </ul>
        <p>
          Each pattern also shows how its price compares with the median price of the collection&apos;s other sales in the 60
          days either side, leaving out sales that are part of a pattern.
        </p>
      </section>

      <section>
        <h2>6. What the tool cannot see</h2>
        <ul>
          <li>Money routed through exchanges, bridges, contracts or several intermediate wallets.</li>
          <li>Who owns a wallet - grouping is an inference.</li>
          <li>Why money or a token moved - no record says.</li>
          <li>Anything an indexer has missed or mislabelled, and sales of works without creator metadata.</li>
        </ul>
        <p>No result - including &quot;no patterns found&quot; - is a statement about anyone&apos;s conduct.</p>
      </section>

      <section>
        <h2>7. Checking a report yourself</h2>
        <p>
          Every step links to its operation on tzkt.io: open it and confirm the sender, receiver, amount and time. &quot;Download
          records (JSON)&quot; saves everything a report was built from. The rules live in <code>src/lib/detect.ts</code> and{" "}
          <code>src/lib/links.ts</code>, with tests in <code>src/lib/detect.test.ts</code>; if you think one is wrong, open an issue
          or a pull request on <a href={SOURCE_URL}>GitHub</a>.
        </p>
      </section>
    </article>
  );
}
