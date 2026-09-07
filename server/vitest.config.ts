import { randomBytes } from "node:crypto";

import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

process.env.TICKET_SECRET ??= randomBytes(48).toString("base64url");

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: {
        configPath: "./wrangler.jsonc"
      }
    })
  ],
  test: {
    include: ["test/**/*.test.ts"],
    // Logs tardios de fechamento do Worker usam stdout diretamente;
    // evita RPC de console pendente durante o teardown do pool.
    disableConsoleIntercept: true,
    testTimeout: 15_000,
    hookTimeout: 15_000
  }
});
