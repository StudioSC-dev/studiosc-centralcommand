/**
 * Refuse to proceed if wrangler dev is listening on port 8787. Applying D1
 * migrations against a running miniflare silently drops the change AND its
 * d1_migrations row — a trap that has fired twice (migrations 0012 and 0014).
 */
import { createConnection } from "node:net";

const port = 8787;
const sock = createConnection(port, "127.0.0.1");
sock.on("connect", () => {
  sock.destroy();
  console.error(
    `\n  ✖  Port ${port} is listening — stop \`wrangler dev\` before applying migrations.\n` +
      `     Applying while miniflare runs silently drops the change and its d1_migrations row.\n`,
  );
  process.exit(1);
});
sock.on("error", () => process.exit(0));
