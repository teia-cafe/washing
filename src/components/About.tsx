import { SITE_NAME, SOURCE_URL } from "@/config";

/** Why the inspector exists, and - just as prominently - what it is not. */
export function About() {
  return (
    <article className="page">
      <h1>About the wash-trade inspector</h1>

      <section>
        <h2>Why this tool exists</h2>
        <p>
          Wash trading - buying and selling the same asset, often between wallets controlled by the same person, to create the
          appearance of demand or to move a price - has become a widespread problem in NFT markets. There is little regulation,
          no common way to tie a wallet to a person, and no oversight body watching these markets.
        </p>
        <p>
          Art on Tezos has one feature that makes these patterns easier to see than in most industries: artists usually use their
          wallet address as their public identity. Their works, sales and transfers are all tied to an address people recognise.
          When high-volume trading shows up on public leaderboards but seems to have no purpose outside of itself - the same
          works and the same money circling between the same few wallets - it is often worth a closer look.
        </p>
        <p>
          This tool reads those public records and lays them out, so that anyone - artists, collectors, curators, marketplaces -
          can look at the same data and check it for themselves.
        </p>
      </section>

      <section className="disclaimer">
        <h2>What this tool is not</h2>
        <ul>
          <li>
            <strong>It reports data. It does not judge.</strong> The operators of {SITE_NAME} do not accuse any person, wallet or
            artwork of wrongdoing, do not draw conclusions from these reports, and make no recommendations about legal action.
          </li>
          <li>
            <strong>Wash trading is not necessarily illegal.</strong> In many places it is frowned upon rather than against the
            law, and rules differ between countries and marketplaces. Nothing here is legal advice.
          </li>
          <li>
            <strong>Moving money and tokens is not a sign of guilt.</strong> People send tez and tokens to each other for
            legitimate reasons all the time: gifts, prizes, collaborations, payment for other work, refunds for a sale that went
            wrong, galleries or friends acting for an artist, or an artist moving works between their own wallets. Every pattern
            this tool reports has ordinary explanations like these.
          </li>
          <li>
            <strong>The records can be incomplete and the tool can be wrong.</strong> It only sees what public indexers expose,
            it infers which wallets share an owner, and it can miss or misread sales. That is why every pattern links to the
            underlying operations: verify them instead of trusting the summary.
          </li>
        </ul>
      </section>

      <section>
        <h2>Transparency</h2>
        <p>
          The inspector is open source under the MIT license. The full methodology is on the <a href="#/methodology">Methodology</a>{" "}
          page, the code is on <a href={SOURCE_URL}>GitHub</a>, and anyone can run their own copy - see{" "}
          <a href="#/host">Host your own</a>. If you believe a report about your own wallet is wrong, or the tool reads the
          records incorrectly, please <a href={`${SOURCE_URL}/issues`}>open an issue</a>.
        </p>
      </section>
    </article>
  );
}
