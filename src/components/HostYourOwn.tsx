import { SOURCE_URL } from "@/config";

/** The short version of docs/SELF-HOSTING.md, with a link to the full guide. */
export function HostYourOwn() {
  const guide = `${SOURCE_URL}/blob/main/docs/SELF-HOSTING.md`;
  return (
    <article className="page">
      <h1>Host your own copy</h1>
      <p className="lede">
        The inspector is open source so that nobody has to take one site&apos;s word for anything. Anyone can read the code, check
        the method, and run an independent copy for free - no coding needed for the basic setup.
      </p>
      <p className="notice" role="note">
        This is a recommendation, not a requirement. teia.cafe runs its own copy at washing.teia.cafe on its own hosting; a copy
        you host is separate from it, and you are its operator. Please keep the About page and the notices that explain the tool
        reports data and does not accuse anyone.
      </p>

      <section>
        <h2>The easiest way: in your browser, about ten minutes</h2>
        <ol>
          <li>
            Create a free account at <a href="https://github.com/signup">github.com</a>, open{" "}
            <a href="https://github.com/teia-cafe/washing">teia-cafe/washing</a> and click <strong>Fork</strong>.
          </li>
          <li>
            In your copy, open the <strong>Actions</strong> tab and enable workflows.
          </li>
          <li>
            In <strong>Settings &gt; Pages</strong>, set the source to <strong>GitHub Actions</strong>.
          </li>
          <li>
            Back in <strong>Actions</strong>, run <strong>Deploy to GitHub Pages</strong>. When it finishes, your site is live at{" "}
            <code>https://YOUR-NAME.github.io/washing/</code>.
          </li>
        </ol>
      </section>

      <section>
        <h2>Your own name and domain</h2>
        <ul>
          <li>
            Set the name in the header and footer with repository variables (<strong>Settings &gt; Secrets and variables &gt; Actions
            &gt; Variables</strong>), no code changes needed.
          </li>
          <li>
            A custom domain costs roughly 10-20 USD a year from a registrar such as Cloudflare Registrar, Porkbun or Namecheap, or
            use a subdomain of a domain you already own. Point it at GitHub Pages in <strong>Settings &gt; Pages &gt; Custom
            domain</strong>.
          </li>
          <li>Prefer another free host? Cloudflare Pages, Netlify and Vercel all work: build with <code>npm run build</code>, publish <code>dist</code>.</li>
        </ul>
      </section>

      <section>
        <h2>On your own computer</h2>
        <p>Install Node.js (LTS) and Git or GitHub Desktop, clone your copy, then:</p>
        <pre>
          <code>{"npm install\nnpm run dev"}</code>
        </pre>
      </section>

      <p>
        The full step-by-step guide - with DNS records, other hosts, keeping your copy updated and every setting - is in{" "}
        <a href={guide}>docs/SELF-HOSTING.md</a>.
      </p>
    </article>
  );
}
