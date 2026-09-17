import { opHref, walletHref } from "@/lib/api";
import { formatTez, shortAddress } from "@/lib/format";
import type { Finding, LinkedWallet } from "@/lib/types";

const ROLE_LABEL: Record<LinkedWallet["role"], string> = {
  investigated: "Wallet looked up",
  "same-controller": "Likely the same owner",
  associate: "Connected",
};

function WalletCard({ wallet, findingCount }: { wallet: LinkedWallet; findingCount: number }) {
  return (
    <div className="wallet">
      <div className="wallet-head">
        <div>
          <span className="wallet-name">{wallet.alias ?? shortAddress(wallet.address)}</span>
          <span className={`badge badge-role-${wallet.role}`}>{ROLE_LABEL[wallet.role]}</span>
          <div>
            <a className="mono" href={walletHref(wallet.address)} target="_blank" rel="noreferrer" style={{ wordBreak: "break-all" }}>
              {wallet.address}
            </a>
          </div>
        </div>
        {wallet.role !== "investigated" ? (
          <div className="wallet-flows">
            received {formatTez(wallet.tezSent)} · sent back {formatTez(wallet.tezReceived)}
            {findingCount ? ` · in ${findingCount} pattern${findingCount === 1 ? "" : "s"}` : ""}
          </div>
        ) : null}
      </div>
      {wallet.evidence.length ? (
        <ul>
          {wallet.evidence.map((e, i) => {
            const op = e.steps.find((s) => s.opHash)?.opHash;
            const href = op ? opHref(op) : e.steps[0]?.href;
            return (
              <li key={i}>
                {e.text}
                {href ? (
                  <>
                    {" "}
                    <a href={href} target="_blank" rel="noreferrer">
                      record ↗
                    </a>
                  </>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

export function LinkedWallets({ links, findings }: { links: LinkedWallet[]; findings: Finding[] }) {
  const inFindings = (a: string) => findings.filter((f) => f.wallets.includes(a)).length;
  const side = links.filter((l) => l.role !== "associate");
  const associates = links
    .filter((l) => l.role === "associate")
    .sort((a, b) => inFindings(b.address) - inFindings(a.address) || b.tezSent + b.tezReceived - (a.tezSent + a.tezReceived));

  return (
    <>
      <div className="wallets">
        {side.map((w) => (
          <WalletCard key={w.address} wallet={w} findingCount={inFindings(w.address)} />
        ))}
      </div>
      {associates.length ? (
        <details className="associates">
          <summary>
            {associates.length} other connected wallet{associates.length === 1 ? "" : "s"} - tied by first funding or tez in both
            directions, but not grouped with it
          </summary>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Wallet</th>
                  <th>Ties</th>
                  <th className="num">Received from side</th>
                  <th className="num">Sent back</th>
                  <th className="num">Patterns</th>
                </tr>
              </thead>
              <tbody>
                {associates.map((w) => (
                  <tr key={w.address}>
                    <td>
                      <a href={walletHref(w.address)} target="_blank" rel="noreferrer" title={w.address}>
                        {w.alias ?? shortAddress(w.address)}
                      </a>
                    </td>
                    <td>{w.evidence.map((e) => e.kind.replace(/-/g, " ")).join(", ")}</td>
                    <td className="num">{formatTez(w.tezSent)}</td>
                    <td className="num">{formatTez(w.tezReceived)}</td>
                    <td className="num">{inFindings(w.address) || ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ) : null}
    </>
  );
}
