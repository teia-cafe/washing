import { useEffect, useState } from "react";
import { About } from "@/components/About";
import { HostYourOwn } from "@/components/HostYourOwn";
import { Method } from "@/components/Method";
import { PasswordGate } from "@/components/PasswordGate";
import { WashTradeInspector } from "@/components/WashTradeInspector";
import { SITE_NAME, SOURCE_URL } from "@/config";

/**
 * The site: the inspector plus its explanation pages. Pages are addressed with
 * "#/about"-style links so the whole site is static files that work at any
 * path - a domain root or a GitHub Pages sub-path alike.
 */

type Route = "inspector" | "about" | "methodology" | "host";

const ROUTES: Record<string, Route> = {
  "#/about": "about",
  "#/methodology": "methodology",
  "#/host": "host",
};

// Anything else - including in-page anchors like #patterns - is the inspector.
const routeOf = (hash: string): Route => ROUTES[hash] ?? "inspector";

const NAV: { route: Route; href: string; label: string }[] = [
  { route: "inspector", href: "#/", label: "Inspector" },
  { route: "about", href: "#/about", label: "About" },
  { route: "methodology", href: "#/methodology", label: "Methodology" },
  { route: "host", href: "#/host", label: "Host your own" },
];

export function App() {
  const [route, setRoute] = useState<Route>(() => routeOf(window.location.hash));

  useEffect(() => {
    const onHash = () => {
      const next = routeOf(window.location.hash);
      setRoute(next);
      if (next !== "inspector") window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    const label = NAV.find((n) => n.route === route)?.label;
    document.title = route === "inspector" ? "Wash-trade inspector" : `${label} · Wash-trade inspector`;
  }, [route]);

  return (
    <div className="wti">
      <header className="site-header">
        <div className="site-header-inner">
          <a className="site-brand" href="#/">
            wash-trade inspector
            <span>by {SITE_NAME}</span>
          </a>
          <nav className="site-nav" aria-label="Pages">
            {NAV.map((n) => (
              <a key={n.route} href={n.href} aria-current={route === n.route ? "page" : undefined}>
                {n.label}
              </a>
            ))}
            <a href={SOURCE_URL}>Source ↗</a>
          </nav>
        </div>
      </header>

      <PasswordGate>
        {/* Kept mounted while reading other pages, so a lookup in progress is not lost. */}
        <div hidden={route !== "inspector"}>
          <WashTradeInspector />
        </div>
        <main className="page-wrap" hidden={route === "inspector"}>
          {route === "about" ? <About /> : null}
          {route === "methodology" ? <Method /> : null}
          {route === "host" ? <HostYourOwn /> : null}
        </main>
      </PasswordGate>

      <footer className="site-footer">
        <div className="site-footer-inner">
          <p>
            This tool reports public ledger data. A pattern is not evidence of wrongdoing, wash trading is not necessarily illegal,
            and the operators of {SITE_NAME} make no accusations and no recommendations about legal action.{" "}
            <a href="#/about">About</a>
          </p>
          <p className="faint">
            Open source (MIT) · <a href={SOURCE_URL}>source code</a> · data from <a href="https://tzkt.io">TzKT</a>
          </p>
        </div>
      </footer>
    </div>
  );
}
