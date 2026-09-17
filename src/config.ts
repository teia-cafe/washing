// Settings for a deployment. Every value can be overridden at build time with
// an environment variable (see .env.example), so a self-hosted copy needs no
// code changes.

const env = import.meta.env;

const value = (v: string | undefined, fallback: string) => (v === undefined || v === "" ? fallback : v);

/** TzKT API base for the Tezos network being read. */
export const TZKT_BASE = value(env.VITE_TZKT_API, "https://api.tzkt.io/v1");

/** Where operation hashes and wallets link to for anyone to check. */
export const EXPLORER_BASE = value(env.VITE_EXPLORER, "https://tzkt.io");

/**
 * Optional front-end password prompt. Empty (the default) means no prompt. It
 * is not security: the value ends up in the site's JavaScript, readable by
 * anyone who looks.
 */
export const ACCESS_PASSWORD = value(env.VITE_ACCESS_PASSWORD, "");

/** Name shown in the header and footer - change it when hosting your own copy. */
export const SITE_NAME = value(env.VITE_SITE_NAME, "teia.cafe");

/** Where the source code lives, linked from the footer. */
export const SOURCE_URL = value(env.VITE_SOURCE_URL, "https://github.com/teia-cafe/washing");
