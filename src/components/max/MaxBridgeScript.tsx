"use client";

import Script from "next/script";
import { useCallback, useRef, useState } from "react";

import {
  MAX_WEB_APP_SCRIPT_SRC,
  readMaxBridgeSnapshot,
  readMaxInitData,
  type MaxBridgeSnapshot,
} from "@/lib/max/bridge";
import {
  loginAndLinkMaxSession,
  signOutMaxSession,
  verifyMaxSession,
} from "@/lib/max/session-shell-client";
import {
  INITIAL_MAX_SHELL_STATE,
  MAX_SHELL_LOGIN_CTA,
  MAX_SHELL_SIGN_OUT_LABEL,
  reduceMaxShell,
  viewMaxShell,
  type MaxShellEvent,
  type MaxShellState,
} from "@/lib/max/session-shell";

import MaxLoginForm from "./MaxLoginForm";

/**
 * Loads official MAX Bridge CDN only on the MAX entry surface.
 * Does not perform a separate messenger init. Missing `WebApp` is normal
 * in a regular browser and must not throw.
 *
 * When `window.WebApp.initData` is non-empty, POSTs the raw string to the
 * verifier. Never treats initDataUnsafe / platform / version as verified
 * identity. Does not display user id, query_id, or raw initData. Does not
 * write the database from the browser; missing initData skips POST and
 * never starts the MAX login-link flow.
 */

export {
  MAX_SHELL_STATUS_CONNECTING,
  MAX_SHELL_STATUS_NEUTRAL,
  MAX_SHELL_STATUS_VERIFIED,
} from "@/lib/max/session-shell";

export default function MaxBridgeScript() {
  const [snapshot, setSnapshot] = useState<MaxBridgeSnapshot>(() =>
    readMaxBridgeSnapshot(),
  );
  const [shell, setShell] = useState<MaxShellState>(INITIAL_MAX_SHELL_STATE);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const actionGeneration = useRef(0);

  const applyEvent = useCallback((event: MaxShellEvent) => {
    setShell((current) => reduceMaxShell(current, event));
  }, []);

  const refreshAndVerify = useCallback(() => {
    setSnapshot(readMaxBridgeSnapshot());

    if (!readMaxInitData()) {
      applyEvent({ type: "INIT_DATA_MISSING" });
      return;
    }

    const generation = ++actionGeneration.current;
    applyEvent({ type: "VERIFY_START" });

    void (async () => {
      const event = await verifyMaxSession();
      if (generation !== actionGeneration.current) {
        return;
      }
      applyEvent(event);
    })();
  }, [applyEvent]);

  const handleOpenLogin = useCallback(() => {
    applyEvent({ type: "OPEN_LOGIN" });
  }, [applyEvent]);

  const handleLogin = useCallback(() => {
    const generation = ++actionGeneration.current;
    applyEvent({ type: "LOGIN_START" });

    void (async () => {
      const event = await loginAndLinkMaxSession(
        { email, password },
        undefined,
        {
          onPasswordAccepted: () => {
            if (generation === actionGeneration.current) {
              applyEvent({ type: "LINK_START" });
            }
          },
        },
      );
      if (generation !== actionGeneration.current) {
        return;
      }
      applyEvent(event);
    })();
  }, [applyEvent, email, password]);

  const handleSignOut = useCallback(() => {
    const generation = ++actionGeneration.current;
    void (async () => {
      const event = await signOutMaxSession();
      if (generation !== actionGeneration.current) {
        return;
      }
      applyEvent(event);
    })();
  }, [applyEvent]);

  const view = viewMaxShell(shell);

  return (
    <>
      <Script
        src={MAX_WEB_APP_SCRIPT_SRC}
        strategy="afterInteractive"
        onReady={refreshAndVerify}
        onError={refreshAndVerify}
      />
      <p
        hidden
        data-max-in-max={snapshot.inMax ? "true" : "false"}
        data-max-platform={snapshot.platform ?? ""}
        data-max-version={snapshot.version ?? ""}
      />
      <p className="mt-8 text-sm font-medium text-[#7042c5]">{view.statusLine}</p>
      {view.reloginNotice ? (
        <p className="mt-4 max-w-sm text-sm leading-6 text-[#4a3d73]">
          {view.reloginNotice}
        </p>
      ) : null}
      {view.expiredMessage ? (
        <p className="mt-4 max-w-sm text-sm leading-6 text-[#b34f63]">
          {view.expiredMessage}
        </p>
      ) : null}
      {view.conflictMessage ? (
        <p className="mt-4 max-w-sm text-sm leading-6 text-[#b34f63]">
          {view.conflictMessage}
        </p>
      ) : null}
      {view.errorMessage ? (
        <p className="mt-4 max-w-sm text-sm leading-6 text-[#b34f63]">
          {view.errorMessage}
        </p>
      ) : null}
      {view.showLoginCta ? (
        <button
          type="button"
          onClick={handleOpenLogin}
          className="primary-cta primary-cta--form mt-6"
        >
          {MAX_SHELL_LOGIN_CTA}
        </button>
      ) : null}
      {view.showLoginForm ? (
        <>
          <MaxLoginForm
            email={email}
            password={password}
            submitting={shell.submitting}
            onEmailChange={setEmail}
            onPasswordChange={setPassword}
            onSubmit={handleLogin}
          />
          {view.signupHint ? (
            <p className="mt-4 max-w-sm text-sm leading-6 text-[#7d70a2]">
              {view.signupHint}
            </p>
          ) : null}
        </>
      ) : null}
      {view.showSignOut ? (
        <button
          type="button"
          onClick={handleSignOut}
          className="mt-6 text-sm font-medium text-[#7042c5]"
        >
          {MAX_SHELL_SIGN_OUT_LABEL}
        </button>
      ) : null}
    </>
  );
}
