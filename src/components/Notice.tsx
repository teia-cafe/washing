/**
 * The short version of what the inspector is and is not, shown before every
 * lookup and at the top of every result. The long version is on the About page.
 */
export function Notice({ compact = false }: { compact?: boolean }) {
  return (
    <aside className="notice" role="note">
      <strong>This tool reports public ledger data. It does not accuse anyone.</strong>{" "}
      {compact ? (
        <>
          A pattern is not evidence of wrongdoing, money and tokens move between people for legitimate reasons, and wash
          trading is not necessarily illegal. No recommendation about legal action is made.{" "}
        </>
      ) : (
        <>
          A pattern is a sequence in the records, not a finding of guilt. Money and tokens move between people for
          legitimate reasons, wash trading is not necessarily illegal, and the records can be incomplete. The operators of this
          site make no accusations and no recommendations about legal action.{" "}
        </>
      )}
      <a href="#/about">Read more</a>
    </aside>
  );
}
