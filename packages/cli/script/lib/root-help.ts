/**
 * Render the top-level help of the full CLI, for `src/generated/root-help.json`
 * (see `script/generate-root-help.ts`).
 */

import { run } from "@stricli/core";
import type { SentryContext } from "../../src/context.js";
import { getAppIdentity } from "../../src/lib/app-identity.js";
import type { CliApplication } from "../../src/lib/application.js";
import { type RootHelp, summarizeRootCommands } from "../../src/lib/help.js";
import type { RouteMap } from "../../src/lib/introspect.js";
import type { CliRoutes } from "../../src/lib/route-registry.js";

/**
 * What `sentry --help` prints with `app`, with or without ANSI colors.
 *
 * Stricli colors help when the stream's color depth is at least 4.
 */
export async function renderUsage(
  app: CliApplication,
  ansiColor: boolean,
): Promise<string> {
  let output = "";
  const stream = {
    write: (chunk: string) => {
      output += chunk;
    },
    getColorDepth: () => (ansiColor ? 8 : 1),
  };
  const context = { process: { stdout: stream, stderr: stream, env: {} } };
  await run(app, ["--help"], context as unknown as SentryContext);
  return output;
}

/** The precomputed top-level help of `app`, which is built from `routes`. */
export async function buildRootHelp(
  app: CliApplication,
  routes: CliRoutes,
): Promise<RootHelp> {
  return {
    name: getAppIdentity().name,
    commands: summarizeRootCommands(routes as unknown as RouteMap),
    usage: {
      plain: await renderUsage(app, false),
      color: await renderUsage(app, true),
    },
  };
}
