import { afterEach, describe, expect, test } from "vitest";
import { loadAppForArgs, selectApp } from "../../src/app-for-args.js";
import { app, routes } from "../../src/app.js";
import rootHelp from "../../src/generated/root-help.json";
import { ROUTE_LOADERS } from "../../src/generated/route-loaders.js";
import { withEnv } from "../../src/lib/env.js";
import {
  printCustomHelp,
  renderRootUsage,
  setRootHelp,
} from "../../src/lib/help.js";
import { setRoutes } from "../../src/lib/route-registry.js";
import { buildRootHelp, renderUsage } from "../../script/lib/root-help.js";
import { envWithoutAgent, useTestConfigDir } from "../helpers.js";

describe("ROUTE_LOADERS", () => {
  test("loads every top-level route of app.ts, in its order", async () => {
    const entries = routes.getAllEntries();
    expect(Object.keys(ROUTE_LOADERS)).toEqual(
      entries.map((entry) => entry.name.original),
    );
    for (const entry of entries) {
      expect(await ROUTE_LOADERS[entry.name.original]!()).toBe(entry.target);
    }
  });
});

describe("selectApp", () => {
  const env = {};

  test.each([
    [
      ["issue", "list"],
      ["help", "issue"],
    ],
    [
      ["auth", "status", "--json"],
      ["help", "auth"],
    ],
    // The list command checks the singular route's subcommands
    [
      ["projects", "view", "cli"],
      ["help", "projects", "project"],
    ],
    [
      ["sourcemaps", "upload"],
      ["help", "sourcemaps"],
    ],
    // Global flags before the route name, with and without values
    [
      ["--verbose", "--log-level", "debug", "issue", "list"],
      ["help", "issue"],
    ],
    [
      ["--fields=id", "--no-json", "-v", "org", "list"],
      ["help", "org"],
    ],
    // A value flag missing its value doesn't take the next flag
    [
      ["--org", "--json", "auth", "status"],
      ["help", "auth"],
    ],
    // `--version` prints the version before any command runs
    [["--version"], ["help"]],
    [["--verbose", "--version"], ["help"]],
    [["--version", "--help"], ["help"]],
  ])("%j loads %j", (args, expected) => {
    expect(selectApp(args, env)).toEqual({ routes: expected, rootHelp: false });
  });

  test.each([
    [[]],
    [["--verbose"]],
    [["--help"]],
    [["-h"]],
    [["--log-level", "debug", "--help"]],
    [["help"]],
    [["help", "--verbose"]],
    // The help command's own help
    [["help", "--help"]],
  ])("%j prints the precomputed top-level help", (args) => {
    expect(selectApp(args, env)).toEqual({ routes: ["help"], rootHelp: true });
  });

  test.each([
    [["--json"]],
    [["--help", "--json"]],
    [["--fields", "name"]],
    [["help", "--json"]],
    [["help", "--fields=name"]],
    // `--help` before a route name
    [["--help", "issue"]],
    // Flags the route scanner doesn't accept before the route name
    [["--unknown", "issue", "list"]],
    [["--helpAll"]],
    [["--", "issue"]],
    // An unknown name needs every route for the suggestions
    [["isue", "list"]],
    [["__proto__"]],
    // These read the whole command tree
    [["help", "issue"]],
    [["help", "--log-level", "debug"]],
    [["schema"]],
    [["cli", "setup"]],
  ])("%j loads the full application", (args) => {
    expect(selectApp(args, env)).toBeUndefined();
  });

  test("JSON output from the environment loads the full application", () => {
    expect(selectApp([], { SENTRY_OUTPUT_FORMAT: "json" })).toBeUndefined();
    expect(
      selectApp(["help"], { SENTRY_OUTPUT_FORMAT: "json" }),
    ).toBeUndefined();
  });
});

describe("root-help.json", () => {
  test("matches the help of the full application", async () => {
    expect(rootHelp).toEqual(await buildRootHelp(app, routes));
  });
});

describe("top-level help from the precomputed copy", () => {
  useTestConfigDir("app-for-args-test-");

  afterEach(() => {
    setRootHelp(undefined);
    setRoutes(routes);
  });

  /** Render `render` with the full routes, then with only `help` loaded. */
  async function renderBoth(render: () => string | undefined) {
    setRoutes(routes);
    const full = render();
    const loaded = await loadAppForArgs(["help"]);
    expect(
      loaded.routes.getAllEntries().map((entry) => entry.name.original),
    ).toEqual(["help"]);
    return { full, precomputed: render() };
  }

  test.each([{ overview: true }, { overview: false }])(
    "printCustomHelp(%j) prints the same commands",
    async (options) => {
      const { full, precomputed } = await withEnv(envWithoutAgent(), () =>
        renderBoth(() => printCustomHelp(options)),
      );
      expect(precomputed).toBe(full);
    },
  );

  test.each([false, true])(
    "`--help` prints the full application's text (ansiColor: %s)",
    async (ansiColor) => {
      const full = await renderUsage(app, ansiColor);
      const loaded = await loadAppForArgs(["--help"]);
      expect(await renderUsage(loaded.app, ansiColor)).toBe(full);
    },
  );

  test("is only for the top level", async () => {
    await loadAppForArgs(["help"]);
    expect(renderRootUsage(["sentry", "help"], false)).toBeUndefined();
  });
});

describe("loadAppForArgs", () => {
  test("builds the application with only the routes it needs", async () => {
    const loaded = await loadAppForArgs(["projects", "view", "cli"]);

    expect(
      loaded.routes
        .getAllEntries()
        .map((entry) => [entry.name.original, entry.hidden]),
    ).toEqual([
      ["help", false],
      ["projects", true],
      ["project", false],
    ]);
    expect(loaded.routes.getRoutingTargetForInput("project")).toBe(
      routes.getRoutingTargetForInput("project"),
    );
  });

  test("loads no command for `--version`", async () => {
    const loaded = await loadAppForArgs(["--version"]);

    expect(
      loaded.routes.getAllEntries().map((entry) => entry.name.original),
    ).toEqual(["help"]);
  });

  test("loads app.ts for the full application", async () => {
    expect((await loadAppForArgs(["--help", "--json"])).routes).toBe(routes);
  });
});
