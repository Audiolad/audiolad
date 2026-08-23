#!/usr/bin/env node
/**
 * One-shot listener welcome: Web + MAX share signUpAction;
 * login / verify / link must not send; dedupe is per user id.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { signUpAction } from "../src/app/(platform)/auth/sign-up/actions.ts";
import {
  onNewListenerCreated,
  type OnNewListenerCreatedInput,
} from "../src/lib/email/on-new-listener-created.ts";
import {
  buildListenerWelcomeDedupKey,
  LISTENER_WELCOME_MESSAGE_TYPE,
} from "../src/lib/email/operational-deliveries.ts";
import {
  loginAndLinkMaxSession,
  verifyMaxSession,
} from "../src/lib/max/session-shell-client.ts";
import type { SendWelcomeEmailResult } from "../src/lib/email/send-welcome-email.ts";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

const VALID_SIGNUP = {
  firstName: "Анна",
  lastName: "Иванова",
  email: "new-listener@yandex.ru",
  password: "password123",
  legalConsent: true,
  marketingConsent: false,
  next: null,
};

const USER_ID = "11111111-2222-4333-8444-555555555555";

function readRepo(...segments: string[]) {
  return readFileSync(join(repoRoot, ...segments), "utf8");
}

function createDeliveryTable() {
  const rows = new Map<
    string,
    {
      id: string;
      dedup_key: string;
      message_type: string;
      application_id: null;
      recipient_email: string;
      status: string;
      last_error: string | null;
      sent_at: string | null;
    }
  >();
  const inserts: Array<Record<string, unknown>> = [];

  function resolveBy(column: string, value: unknown) {
    for (const row of rows.values()) {
      if ((row as Record<string, unknown>)[column] === value) {
        return row;
      }
    }
    return null;
  }

  function client() {
    return {
      from(table: string) {
        assert.equal(table, "operational_email_deliveries");

        return {
          select(_columns?: string) {
            return {
              eq(column: string, value: unknown) {
                const row = resolveBy(column, value);
                return {
                  async maybeSingle() {
                    return { data: row, error: null };
                  },
                  async single() {
                    return { data: row, error: row ? null : { message: "missing" } };
                  },
                };
              },
            };
          },
          insert(values: Record<string, unknown>) {
            inserts.push(values);
            const dedupKey = String(values.dedup_key ?? "");
            if (rows.has(dedupKey)) {
              const error = { code: "23505", message: "duplicate key" };
              return {
                select() {
                  return {
                    async single() {
                      return { data: null, error };
                    },
                  };
                },
              };
            }

            const row = {
              id: `del-${rows.size + 1}`,
              dedup_key: dedupKey,
              message_type: String(values.message_type ?? ""),
              application_id: null,
              recipient_email: String(values.recipient_email ?? ""),
              status: String(values.status ?? "pending"),
              last_error: null,
              sent_at: null,
            };
            rows.set(dedupKey, row);

            return {
              select() {
                return {
                  async single() {
                    return { data: row, error: null };
                  },
                };
              },
            };
          },
          update(patch: Record<string, unknown>) {
            return {
              async eq(column: string, value: unknown) {
                const row = resolveBy(column, value);
                if (row) {
                  Object.assign(row, patch);
                }
                return { data: row, error: row ? null : { message: "missing" } };
              },
            };
          },
        };
      },
    };
  }

  return { client, rows, inserts };
}

function createSendMock() {
  const calls: Array<{ toEmail: string; userName: string }> = [];
  async function send(input: {
    toEmail: string;
    userName: string;
  }): Promise<SendWelcomeEmailResult> {
    calls.push({ toEmail: input.toEmail, userName: input.userName });
    return { ok: true, providerMessageId: `mock-${calls.length}` };
  }
  return { send, calls };
}

function createSignUpClient(result: {
  user?: { id?: string; email?: string | null } | null;
  session?: unknown;
  error?: { message: string } | null;
}) {
  const signUpCalls: unknown[] = [];
  return {
    signUpCalls,
    createClient: async () => ({
      auth: {
        async signUp(args: unknown) {
          signUpCalls.push(args);
          return {
            data: {
              user: result.user === undefined ? null : result.user,
              session: result.session ?? null,
            },
            error: result.error ?? null,
          };
        },
      },
      async rpc() {
        return { error: null };
      },
    }),
  };
}

async function runSignUp(options: {
  user?: { id?: string; email?: string | null } | null;
  session?: unknown;
  error?: { message: string } | null;
  input?: Partial<typeof VALID_SIGNUP>;
  send: (input: { toEmail: string; userName: string }) => Promise<SendWelcomeEmailResult>;
  createDeliveryClient: () => ReturnType<ReturnType<typeof createDeliveryTable>["client"]>;
}) {
  const auth = createSignUpClient({
    user: options.user,
    session: options.session,
    error: options.error,
  });

  const result = await signUpAction(
    { ...VALID_SIGNUP, ...options.input },
    {
      createClient: auth.createClient,
      onNewListenerCreated: (input: OnNewListenerCreatedInput) =>
        onNewListenerCreated(input, {
          sendWelcomeEmail: options.send,
          createDeliveryClient: options.createDeliveryClient as never,
        }),
    },
  );

  return { result, signUpCalls: auth.signUpCalls };
}

function testDedupKey() {
  assert.equal(LISTENER_WELCOME_MESSAGE_TYPE, "listener_welcome");
  assert.equal(
    buildListenerWelcomeDedupKey(USER_ID),
    `listener_welcome:${USER_ID}`,
  );
  assert.equal(
    buildListenerWelcomeDedupKey(`  ${USER_ID}  `),
    `listener_welcome:${USER_ID}`,
  );
}

async function testWebStyleSignUpSendsOnce() {
  const delivery = createDeliveryTable();
  const welcome = createSendMock();

  const { result } = await runSignUp({
    user: { id: USER_ID, email: "new-listener@yandex.ru" },
    session: { access_token: "web-session" },
    send: welcome.send,
    createDeliveryClient: delivery.client,
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.hasSession, true);
  }
  assert.equal(welcome.calls.length, 1);
  assert.deepEqual(welcome.calls[0], {
    toEmail: "new-listener@yandex.ru",
    userName: "Анна",
  });
  assert.equal(delivery.inserts.length, 1);
  assert.equal(delivery.inserts[0]?.message_type, LISTENER_WELCOME_MESSAGE_TYPE);
  assert.equal(
    delivery.inserts[0]?.dedup_key,
    buildListenerWelcomeDedupKey(USER_ID),
  );
  assert.equal(delivery.inserts[0]?.application_id, null);
}

async function testMaxStyleSignUpUsesInputEmailWhenUserEmailMissing() {
  const delivery = createDeliveryTable();
  const welcome = createSendMock();

  const { result } = await runSignUp({
    user: { id: USER_ID },
    session: { access_token: "max-session" },
    send: welcome.send,
    createDeliveryClient: delivery.client,
  });

  assert.equal(result.ok, true);
  assert.equal(welcome.calls.length, 1);
  assert.equal(welcome.calls[0]?.toEmail, "new-listener@yandex.ru");
  assert.equal(welcome.calls[0]?.userName, "Анна");
}

async function testLoginAndLinkDoesNotSend() {
  const welcome = createSendMock();
  const signInCalls: unknown[] = [];

  const event = await loginAndLinkMaxSession(
    { email: "existing@yandex.ru", password: "password123" },
    {
      readInitData: () => "user=%7B%22id%22%3A1%7D",
      getAuthClient: () => ({
        auth: {
          async signInWithPassword(credentials) {
            signInCalls.push(credentials);
            return { error: null };
          },
          async getUser() {
            return { data: { user: { id: USER_ID } } };
          },
          async signOut() {
            return {};
          },
        },
      }),
      fetch: async () =>
        new Response(JSON.stringify({ ok: true, linked: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    },
  );

  assert.equal(event.type, "LINK_SUCCESS");
  assert.equal(signInCalls.length, 1);
  assert.equal(welcome.calls.length, 0);
}

async function testVerifyAndLinkAndSecondCreateDoNotSendAgain() {
  const delivery = createDeliveryTable();
  const welcome = createSendMock();
  const deps = {
    sendWelcomeEmail: welcome.send,
    createDeliveryClient: delivery.client as never,
  };

  const first = await onNewListenerCreated(
    { userId: USER_ID, email: "new-listener@yandex.ru", firstName: "Анна" },
    deps,
  );
  assert.deepEqual(first, { ok: true, status: "sent" });
  assert.equal(welcome.calls.length, 1);

  const second = await onNewListenerCreated(
    { userId: USER_ID, email: "new-listener@yandex.ru", firstName: "Анна" },
    deps,
  );
  assert.deepEqual(second, { ok: true, status: "already_sent" });
  assert.equal(welcome.calls.length, 1);

  const verifyEvent = await verifyMaxSession({
    readInitData: () => "user=%7B%22id%22%3A1%7D",
    getAuthClient: () => ({
      auth: {
        async signInWithPassword() {
          return { error: null };
        },
        async getUser() {
          return { data: { user: { id: USER_ID } } };
        },
        async signOut() {
          return {};
        },
      },
    }),
    fetch: async () =>
      new Response(JSON.stringify({ ok: true, linked: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
  });
  assert.equal(verifyEvent.type, "VERIFY_SUCCESS");
  assert.equal(welcome.calls.length, 1);

  const raced = createDeliveryTable();
  raced.rows.set(buildListenerWelcomeDedupKey(USER_ID), {
    id: "claimed",
    dedup_key: buildListenerWelcomeDedupKey(USER_ID),
    message_type: LISTENER_WELCOME_MESSAGE_TYPE,
    application_id: null,
    recipient_email: "new-listener@yandex.ru",
    status: "pending",
    last_error: null,
    sent_at: null,
  });
  const racedSend = createSendMock();
  const claimed = await onNewListenerCreated(
    { userId: USER_ID, email: "new-listener@yandex.ru", firstName: "Анна" },
    {
      sendWelcomeEmail: racedSend.send,
      createDeliveryClient: raced.client as never,
    },
  );
  assert.deepEqual(claimed, { ok: true, status: "already_sent" });
  assert.equal(racedSend.calls.length, 0);
}

async function testSignUpAuthErrorDoesNotSend() {
  const delivery = createDeliveryTable();
  const welcome = createSendMock();

  const { result } = await runSignUp({
    user: null,
    error: { message: "User already registered" },
    send: welcome.send,
    createDeliveryClient: delivery.client,
  });

  assert.equal(result.ok, false);
  assert.equal(welcome.calls.length, 0);
  assert.equal(delivery.inserts.length, 0);
}

async function testSignUpWithoutUserIdDoesNotSend() {
  const delivery = createDeliveryTable();
  const welcome = createSendMock();

  const { result } = await runSignUp({
    user: null,
    session: null,
    send: welcome.send,
    createDeliveryClient: delivery.client,
  });

  assert.equal(result.ok, true);
  assert.equal(welcome.calls.length, 0);
}

async function testWelcomeThrowDoesNotFailSignUp() {
  const delivery = createDeliveryTable();

  const { result } = await runSignUp({
    user: { id: USER_ID },
    session: { access_token: "t" },
    send: async () => {
      throw new Error("smtp exploded");
    },
    createDeliveryClient: delivery.client,
  });

  assert.equal(result.ok, true);
  assert.equal(delivery.inserts.length, 1);
}

function testSourceGuards() {
  const action = readRepo(
    "src",
    "app",
    "(platform)",
    "auth",
    "sign-up",
    "actions.ts",
  );
  const hook = readRepo("src", "lib", "email", "on-new-listener-created.ts");
  const shell = readRepo("src", "lib", "max", "session-shell-client.ts");
  const loginPage = readRepo("src", "app", "(platform)", "auth", "sign-in", "page.tsx");
  const verify = readRepo("src", "app", "api", "max", "session", "verify", "route.ts");
  const link = readRepo("src", "app", "api", "max", "session", "link", "route.ts");
  const touch = readRepo("src", "lib", "max", "touch-external-identity.ts");
  const linkHelper = readRepo("src", "lib", "max", "link-external-identity.ts");
  const bridge = readRepo("src", "components", "max", "MaxBridgeScript.tsx");

  assert.match(action, /onNewListenerCreated/);
  assert.match(action, /emailValidation\.normalizedEmail/);
  assert.doesNotMatch(action, /data\.user\?\.email/);
  assert.match(action, /signup_welcome_email_failed/);
  assert.match(hook, /sendWelcomeEmail/);
  assert.match(hook, /userName: firstName/);
  assert.match(hook, /listener_welcome:/);

  assert.match(bridge, /signUp: signUpAction/);
  assert.doesNotMatch(shell, /onNewListenerCreated|sendWelcomeEmail/);

  for (const [label, source] of [
    ["sign-in page", loginPage],
    ["session-shell-client", shell],
    ["verify route", verify],
    ["link route", link],
    ["touch helper", touch],
    ["link helper", linkHelper],
  ] as const) {
    assert.doesNotMatch(
      source,
      /sendWelcomeEmail|onNewListenerCreated/,
      `${label} must not send welcome`,
    );
  }
}

async function main() {
  testDedupKey();
  await testWebStyleSignUpSendsOnce();
  await testMaxStyleSignUpUsesInputEmailWhenUserEmailMissing();
  await testLoginAndLinkDoesNotSend();
  await testVerifyAndLinkAndSecondCreateDoNotSendAgain();
  await testSignUpAuthErrorDoesNotSend();
  await testSignUpWithoutUserIdDoesNotSend();
  await testWelcomeThrowDoesNotFailSignUp();
  testSourceGuards();
  console.log("listener-welcome-unit: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
