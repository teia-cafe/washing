# Host your own copy

The wash-trade inspector is open source so that nobody has to take one site's
word for anything. You can read the code, check the method, and run your own
independent copy - with your own name on it - for free.

This guide assumes no prior experience. If you get stuck, open an issue on the
repository and describe where.

> **This is a recommendation, not a requirement.** teia.cafe runs its own copy at
> [washing.teia.cafe](https://washing.teia.cafe), hosted on teia.cafe's
> Cloudflare account. Hosting your own copy is entirely optional and separate
> from that site.

> **If you run a copy, you are its operator.** Please keep the About page and the
> notices that explain the tool reports data and does not accuse anyone. The MIT
> license lets you change anything, but those explanations exist to protect the
> people whose wallets are looked up - and you.

---

## Contents

1. [The easiest way: no installs, all in your browser](#1-the-easiest-way-no-installs-all-in-your-browser)
2. [Put your name on it](#2-put-your-name-on-it)
3. [Use your own domain name](#3-use-your-own-domain-name)
4. [Other free hosting options](#4-other-free-hosting-options)
5. [Run it on your own computer](#5-run-it-on-your-own-computer)
6. [Keep your copy up to date](#6-keep-your-copy-up-to-date)
7. [Settings reference](#7-settings-reference)

---

## 1. The easiest way: no installs, all in your browser

You will end up with a working site at `https://YOUR-NAME.github.io/washing/`.
It takes about ten minutes and costs nothing. All you need is a free
[GitHub](https://github.com) account.

### Step 1 - Make your own copy of the repository

1. Sign in to GitHub (or create a free account at <https://github.com/signup>).
2. Open <https://github.com/teia-cafe/washing>.
3. Click **Fork** (top right), then **Create fork**.

You now have your own copy at `https://github.com/YOUR-NAME/washing`. Nothing you
do there affects the original.

> Prefer a copy with no link back to the original? Instead of forking, click
> **Code > Download ZIP**, create a new empty repository on GitHub
> (**+ > New repository**), and upload the files. Forking is easier to keep up
> to date (section 6).

### Step 2 - Turn on GitHub Actions

Actions are GitHub's free build robots; they turn the code into a website.

1. In your copy, open the **Actions** tab.
2. GitHub disables workflows in new forks. Click
   **I understand my workflows, go ahead and enable them**.

### Step 3 - Turn on GitHub Pages

GitHub Pages is GitHub's free website hosting.

1. Open **Settings > Pages** (in the left sidebar).
2. Under **Build and deployment > Source**, choose **GitHub Actions**.

### Step 4 - Publish

1. Go back to the **Actions** tab.
2. Choose **Deploy to GitHub Pages** in the left list.
3. Click **Run workflow > Run workflow**.
4. Wait for the green tick (two or three minutes).
5. Open **Settings > Pages** again: the address of your site is shown at the top,
   usually `https://YOUR-NAME.github.io/washing/`.

From now on the site rebuilds by itself whenever the `main` branch changes.

---

## 2. Put your name on it

The header and footer show a site name and a link to the source code. Set your
own without editing any code:

1. Open **Settings > Secrets and variables > Actions > Variables**.
2. Click **New repository variable** and add:
   - `VITE_SITE_NAME` - for example `my-collective.art`
   - `VITE_SOURCE_URL` - `https://github.com/YOUR-NAME/washing`
3. Re-run **Deploy to GitHub Pages** (Actions tab).

All available settings are listed in [section 7](#7-settings-reference).

---

## 3. Use your own domain name

A domain such as `inspector.my-collective.art` is optional; the free
`github.io` address works fine.

### Buying a domain

Domains are sold by *registrars* and usually cost about 10-20 USD a year. Any
registrar works. A few well-known ones:

- [Cloudflare Registrar](https://www.cloudflare.com/products/registrar/) - sells at cost, no markup.
- [Porkbun](https://porkbun.com) - simple, inexpensive.
- [Namecheap](https://www.namecheap.com) - widely used, beginner friendly.

Watch for a cheap first year followed by a much higher renewal price, and turn on
the free "WHOIS privacy" option if it is offered.

If you already own a domain, you can use a *subdomain* of it (like
`inspector.your-domain.com`) at no extra cost.

### Pointing the domain at GitHub Pages

1. In your repository, open **Settings > Pages > Custom domain**, type your domain
   (for example `inspector.your-domain.com`) and click **Save**.
2. At your registrar (or wherever your domain's DNS is managed), add a record:
   - **For a subdomain** (`inspector.your-domain.com`): a `CNAME` record with name
     `inspector` and value `YOUR-NAME.github.io`.
   - **For a whole domain** (`your-domain.com`): four `A` records with name `@`
     and values `185.199.108.153`, `185.199.109.153`, `185.199.110.153`,
     `185.199.111.153`.
3. Wait - DNS changes can take from a few minutes to a few hours.
4. Back in **Settings > Pages**, tick **Enforce HTTPS** once it becomes available.
5. Re-run **Deploy to GitHub Pages** so the site is rebuilt for the new address.

GitHub's own guide has more detail:
<https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site>.

---

## 4. Other free hosting options

The inspector is a plain static website - just files, no server - so almost any
static host can serve it. These all have free plans and can connect to your
GitHub repository and rebuild on every change:

| Host | Build command | Output folder |
|---|---|---|
| [Cloudflare Pages](https://pages.cloudflare.com) | `npm run build` | `dist` |
| [Netlify](https://www.netlify.com) | `npm run build` | `dist` |
| [Vercel](https://vercel.com) | `npm run build` | `dist` |

When asked for a framework preset, choose **Vite**. Settings from section 7 go in
the host's *environment variables* screen. Each of these hosts also lets you add
a custom domain from its dashboard.

If you move to one of these hosts, you can turn GitHub Pages off again in
**Settings > Pages**.

---

## 5. Run it on your own computer

Useful if you want to change the code or try things before publishing.

### Install the tools (once)

1. **Node.js** - download the **LTS** version from <https://nodejs.org> and install it.
2. **Git** - <https://git-scm.com/downloads>. If you prefer not to use the command
   line, install [GitHub Desktop](https://desktop.github.com) instead; it includes Git.

### Get the code

With GitHub Desktop: **File > Clone repository**, pick `YOUR-NAME/washing`, and
choose a folder.

Or in a terminal:

```bash
git clone https://github.com/YOUR-NAME/washing.git
cd washing
```

### Start it

In a terminal, inside the `washing` folder:

```bash
npm install
npm run dev
```

Open the address it prints (usually <http://localhost:5173>). Changes you save in
`src/` show up in the browser straight away. Press `Ctrl+C` in the terminal to stop.

Other useful commands:

```bash
npm test         # run the tests for the detection rules
npm run lint     # check the code for common mistakes
npm run build    # build the site into dist/, exactly as it will be published
npm run preview  # serve that build locally to check it
```

To publish your changes, commit and push them to `main` (GitHub Desktop: **Commit
to main**, then **Push origin**); the deploy workflow does the rest.

---

## 6. Keep your copy up to date

When the original repository gets improvements:

1. Open your fork on GitHub.
2. Click **Sync fork > Update branch**.

GitHub rebuilds your site automatically. If you changed the same files yourself,
GitHub will ask you to resolve the differences first.

---

## 7. Settings reference

All settings are optional. Set them as **Actions variables** (section 2), in your
host's environment variables (section 4), or in a `.env.local` file when running
on your computer (copy `.env.example` as a starting point).

| Setting | What it does | Default |
|---|---|---|
| `VITE_SITE_NAME` | Name shown in the header and footer | `teia.cafe` |
| `VITE_SOURCE_URL` | Source code link in the footer | the teia-cafe repository |
| `VITE_TZKT_API` | TzKT API to read from (e.g. a test network) | `https://api.tzkt.io/v1` |
| `VITE_EXPLORER` | Where operation and wallet links point | `https://tzkt.io` |
| `BASE_PATH` | Sub-path the site is served from. The GitHub Pages workflow sets this for you. | `/` |

### Be kind to TzKT

Every lookup runs in the visitor's browser and queries [TzKT](https://tzkt.io), a
free service run for the whole Tezos community that limits how many requests one
visitor can make. The inspector already limits how many requests run at once,
slows down when TzKT pushes back, and tells visitors when a report may be
incomplete because of it (see the methodology's "Request limits"). Please do not
remove those safeguards or automate large
numbers of lookups; if you need heavy use, look at running your own TzKT
instance (<https://github.com/baking-bad/tzkt>) and set `VITE_TZKT_API` to it.
