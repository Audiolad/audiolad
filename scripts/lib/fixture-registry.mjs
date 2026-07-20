/**
 * UUID-based fixture registry with FK-safe cleanup and signal handling.
 *
 * SIGKILL cannot be handled — document in production-fixture-policy.md.
 */
import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";

import {
  assertFixtureWritesAllowed,
  isTestDatabaseFlagSet,
  TEST_DATABASE_ENV,
} from "./fixture-context.mjs";

const CLEANUP_ORDER = [
  "analytics_event",
  "promotion_campaign",
  "promo_page_product",
  "promo_page",
  "audio_item",
  "practice",
  "author_member",
  "author",
  "profile",
  "auth_identity",
  "auth_user",
];

export class FixtureRegistry {
  #entries = [];
  #cleanedUp = false;
  #cleanupInProgress = false;
  #signalHandlersInstalled = false;
  #sqlFile;
  #sqlScalar;
  #runId;
  #guardOptions;

  constructor({ sqlFile, sqlScalar, runId = randomUUID().slice(0, 8), guardOptions = null } = {}) {
    if (typeof sqlFile !== "function" || typeof sqlScalar !== "function") {
      throw new Error("FixtureRegistry requires sqlFile and sqlScalar functions");
    }
    this.#sqlFile = sqlFile;
    this.#sqlScalar = sqlScalar;
    this.#runId = runId;
    this.#guardOptions = guardOptions;
  }

  get runId() {
    return this.#runId;
  }

  register(type, id, meta = {}) {
    if (!id) {
      throw new Error(`fixture registry: missing id for ${type}`);
    }
    this.#entries.push({
      type,
      id: String(id),
      meta,
      order: CLEANUP_ORDER.indexOf(type),
    });
    console.log(`[fixture-registry] registered ${type}=${id}`);
    return id;
  }

  installSignalHandlers() {
    if (this.#signalHandlersInstalled) return;
    this.#signalHandlersInstalled = true;

    const onSignal = (signal) => {
      console.error(`[fixture-registry] received ${signal}, running cleanup`);
      const code = this.cleanupSync({ signal });
      process.exit(code);
    };

    process.once("SIGINT", () => onSignal("SIGINT"));
    process.once("SIGTERM", () => onSignal("SIGTERM"));
  }

  cleanupSync({ signal = null } = {}) {
    if (this.#guardOptions) {
      assertFixtureWritesAllowed(this.#guardOptions);
    } else if (process.env[TEST_DATABASE_ENV] === "1") {
      assertFixtureWritesAllowed({
        scriptName: "FixtureRegistry.cleanupSync",
        supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321",
        dockerExec: Boolean(this.#guardOptions?.dockerExec),
        dockerContainer:
          this.#guardOptions?.dockerContainer ??
          process.env.AUDIOLAD_TEST_DOCKER_CONTAINER ??
          "supabase-db-staging",
      });
    }

    if (this.#cleanedUp) {
      return 0;
    }
    if (this.#cleanupInProgress) {
      return 1;
    }

    this.#cleanupInProgress = true;
    let incomplete = false;

    try {
      const sorted = [...this.#entries].sort(
        (a, b) => a.order - b.order || a.type.localeCompare(b.type),
      );

      for (const entry of sorted) {
        try {
          this.#deleteOne(entry);
        } catch (error) {
          incomplete = true;
          console.error(
            `[fixture-registry] cleanup failed for ${entry.type}=${entry.id}:`,
            error instanceof Error ? error.message : error,
          );
        }
      }

      for (const entry of this.#entries) {
        const remaining = this.#countRemaining(entry);
        if (remaining > 0) {
          incomplete = true;
          console.error(
            `[fixture-registry] still present after cleanup ${entry.type}=${entry.id} (count=${remaining})`,
          );
        }
      }

      this.#cleanedUp = !incomplete;
      if (this.#cleanedUp) {
        console.log(
          `[fixture-registry] cleanup complete (${this.#entries.length} entries${signal ? `, signal=${signal}` : ""})`,
        );
        return 0;
      }

      console.error("[fixture-registry] cleanup incomplete");
      return 2;
    } finally {
      this.#cleanupInProgress = false;
    }
  }

  async cleanup() {
    return this.cleanupSync();
  }

  async runWithCleanup(fn) {
    this.installSignalHandlers();
    let testError = null;
    let cleanupCode = 0;

    try {
      await fn(this);
    } catch (error) {
      testError = error;
    } finally {
      cleanupCode = this.cleanupSync();
    }

    if (testError) {
      console.error("[fixture-registry] test failed:", testError);
      process.exit(cleanupCode !== 0 ? cleanupCode : 1);
    }

    if (cleanupCode !== 0) {
      process.exit(cleanupCode);
    }
  }

  #deleteOne(entry) {
    const id = entry.id;
    switch (entry.type) {
      case "analytics_event":
        this.#sqlFile(`DELETE FROM public.analytics_events WHERE id = '${id}'::uuid;`);
        break;
      case "analytics_events_by_session":
        this.#sqlFile(
          `DELETE FROM public.analytics_events WHERE anonymous_session_id = ${this.#sqlLiteral(entry.meta.sessionId)};`,
        );
        break;
      case "promotion_campaign":
        this.#sqlFile(`DELETE FROM public.promotion_campaigns WHERE id = '${id}'::uuid;`);
        break;
      case "practice":
        this.#sqlFile(`DELETE FROM public.practices WHERE id = '${id}'::uuid;`);
        break;
      case "author_member":
        this.#sqlFile(
          `DELETE FROM public.author_members WHERE author_id = '${entry.meta.authorId ?? id}'::uuid AND user_id = '${entry.meta.userId ?? id}'::uuid;`,
        );
        break;
      case "author":
        this.#sqlFile(`DELETE FROM public.authors WHERE id = '${id}'::uuid;`);
        break;
      case "profile":
        this.#sqlFile(`DELETE FROM public.profiles WHERE id = '${id}'::uuid;`);
        break;
      case "auth_identity":
        this.#sqlFile(`DELETE FROM auth.identities WHERE id = '${id}'::uuid;`);
        break;
      case "auth_user":
        this.#sqlFile(`DELETE FROM auth.users WHERE id = '${id}'::uuid;`);
        break;
      default:
        throw new Error(`unsupported fixture type: ${entry.type}`);
    }
    console.log(`[fixture-registry] deleted ${entry.type}=${id}`);
  }

  #countRemaining(entry) {
    switch (entry.type) {
      case "analytics_event":
        return Number(
          this.#sqlScalar(`SELECT COUNT(*) FROM public.analytics_events WHERE id = '${entry.id}'::uuid`),
        );
      case "analytics_events_by_session":
        return Number(
          this.#sqlScalar(
            `SELECT COUNT(*) FROM public.analytics_events WHERE anonymous_session_id = ${this.#sqlLiteral(entry.meta.sessionId)}`,
          ),
        );
      case "promotion_campaign":
        return Number(
          this.#sqlScalar(
            `SELECT COUNT(*) FROM public.promotion_campaigns WHERE id = '${entry.id}'::uuid`,
          ),
        );
      case "practice":
        return Number(
          this.#sqlScalar(`SELECT COUNT(*) FROM public.practices WHERE id = '${entry.id}'::uuid`),
        );
      case "author":
        return Number(
          this.#sqlScalar(`SELECT COUNT(*) FROM public.authors WHERE id = '${entry.id}'::uuid`),
        );
      case "auth_user":
        return Number(
          this.#sqlScalar(`SELECT COUNT(*) FROM auth.users WHERE id = '${entry.id}'::uuid`),
        );
      default:
        return 0;
    }
  }

  #sqlLiteral(value) {
    return `'${String(value).replace(/'/g, "''")}'`;
  }
}

export function createSqlHelpers(dockerContainer = "supabase-db") {
  if (!isTestDatabaseFlagSet()) {
    console.error(`BLOCKED: createSqlHelpers requires ${TEST_DATABASE_ENV}=1`);
    process.exit(1);
  }

  assertFixtureWritesAllowed({
    scriptName: "createSqlHelpers",
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321",
    dockerExec: true,
    dockerContainer,
  });

  function sqlFile(content) {
    return execSync(
      `docker exec -i ${dockerContainer} psql -U postgres -d postgres -v ON_ERROR_STOP=1`,
      { input: content, encoding: "utf8" },
    );
  }

  function sqlScalar(query) {
    const oneLine = query.replace(/\s+/g, " ").trim();
    return execSync(
      `docker exec ${dockerContainer} psql -U postgres -d postgres -tAc ${JSON.stringify(oneLine)}`,
      { encoding: "utf8" },
    ).trim();
  }

  return { sqlFile, sqlScalar };
}
