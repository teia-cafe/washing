import { useState } from "react";
import { ACCESS_PASSWORD } from "@/config";

/**
 * An optional front-end password prompt, off unless VITE_ACCESS_PASSWORD is
 * set. It is not security - the password ends up in the site's JavaScript -
 * just a door that keeps casual visitors out while a copy is being prepared.
 * Once entered, it is remembered in this browser.
 */

const STORE = "washing.unlocked";

function remembered(): boolean {
  try {
    return localStorage.getItem(STORE) === ACCESS_PASSWORD;
  } catch {
    return false;
  }
}

export function PasswordGate({ children }: { children: React.ReactNode }) {
  const [unlocked, setUnlocked] = useState<boolean>(() => !ACCESS_PASSWORD || remembered());
  const [value, setValue] = useState("");
  const [wrong, setWrong] = useState(false);

  if (unlocked) return <>{children}</>;

  return (
    <main className="page-wrap">
      <form
        className="gate"
        onSubmit={(e) => {
          e.preventDefault();
          if (value.trim() !== ACCESS_PASSWORD) {
            setWrong(true);
            return;
          }
          try {
            localStorage.setItem(STORE, ACCESS_PASSWORD);
          } catch {
            // Private windows can refuse storage; it just asks again next time.
          }
          setUnlocked(true);
        }}
      >
        <h1>Private preview</h1>
        <p className="muted">Enter the password to continue.</p>
        <label htmlFor="wti-password">Password</label>
        <input
          id="wti-password"
          type="password"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setWrong(false);
          }}
          autoComplete="off"
          autoFocus
        />
        <button className="wti-btn" type="submit" disabled={!value.trim()}>
          Continue
        </button>
        {wrong ? (
          <p className="gate-error" role="alert">
            That password is not right.
          </p>
        ) : null}
      </form>
    </main>
  );
}
