"use client";

import Script from "next/script";
import { useCallback, useRef, useState } from "react";

import { signUpAction } from "@/app/(platform)/auth/sign-up/actions";
import {
  MAX_WEB_APP_SCRIPT_SRC,
  readMaxBridgeSnapshot,
  readMaxInitData,
  type MaxBridgeSnapshot,
} from "@/lib/max/bridge";
import {
  loginAndLinkMaxSession,
  signOutMaxSession,
  signUpAndLinkMaxSession,
  verifyMaxSession,
} from "@/lib/max/session-shell-client";
import {
  INITIAL_MAX_SHELL_STATE,
  MAX_SHELL_LOGIN_CTA,
  MAX_SHELL_SIGN_OUT_LABEL,
  MAX_SHELL_SIGNUP_CTA,
  reduceMaxShell,
  viewMaxShell,
  type MaxShellEvent,
  type MaxShellState,
} from "@/lib/max/session-shell";

import MaxLoginForm from "./MaxLoginForm";
import MaxSignupForm from "./MaxSignupForm";

/**
 * Loads official MAX Bridge CDN only on the MAX entry surface.
 * Does not perform a separate messenger init. Missing `WebApp` is normal
 * in a regular browser and must not throw.
 *
 * When `window.WebApp.initData` is non-empty, POSTs the raw string to the
 * verifier. Never treats initDataUnsafe / platform / version as verified
 * identity. Does not display user id, query_id, or raw initData. Does not
 * write the database from the browser; missing initData skips POST and
 * never starts the MAX login-link or signup-link flow.
 *
 * Signup reuses the apex `signUpAction` (same legal bar) and stays inside
 * this shell. It does not navigate to /auth/* or /my-practices.
 */

export {
  MAX_SHELL_STATUS_CONNECTING,
  MAX_SHELL_STATUS_NEUTRAL,
  MAX_SHELL_STATUS_VERIFIED,
} from "@/lib/max/session-shell";

const CLEARS_PASSWORD = new Set<MaxShellEvent["type"]>([
  "SIGNUP_FAILURE",
  "SIGNUP_PENDING",
  "LINK_SUCCESS",
  "LINK_EXPIRED",
  "LINK_IDENTITY_CONFLICT",
  "LINK_USER_CONFLICT",
  "LINK_SERVER_ERROR",
]);

export default function MaxBridgeScript() {
  const [snapshot, setSnapshot] = useState<MaxBridgeSnapshot>(() =>
    readMaxBridgeSnapshot(),
  );
  const [shell, setShell] = useState<MaxShellState>(INITIAL_MAX_SHELL_STATE);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [legalConsent, setLegalConsent] = useState(false);
  const [marketingConsent, setMarketingConsent] = useState(false);
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

  const handleOpenSignup = useCallback(() => {
    applyEvent({ type: "OPEN_SIGNUP" });
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

  const handleSignup = useCallback(() => {
    const generation = ++actionGeneration.current;
    applyEvent({ type: "SIGNUP_START" });

    void (async () => {
      const event = await signUpAndLinkMaxSession(
        {
          firstName,
          lastName,
          email,
          password,
          legalConsent,
          marketingConsent,
        },
        { signUp: signUpAction },
        {
          onSessionCreated: () => {
            if (generation === actionGeneration.current) {
              applyEvent({ type: "LINK_START" });
            }
          },
        },
      );
      if (generation !== actionGeneration.current) {
        return;
      }
      if (CLEARS_PASSWORD.has(event.type)) {
        setPassword("");
      }
      applyEvent(event);
    })();
  }, [
    applyEvent,
    email,
    firstName,
    lastName,
    legalConsent,
    marketingConsent,
    password,
  ]);

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
      {view.pendingMessage ? (
        <p className="mt-4 max-w-sm text-sm leading-6 text-[#4a3d73]">
          {view.pendingMessage}
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
      {view.showLoginCta || view.showSignupCta ? (
        <div className="mt-6 flex w-full max-w-sm flex-col gap-3">
          {view.showLoginCta ? (
            <button
              type="button"
              onClick={handleOpenLogin}
              className="primary-cta primary-cta--form"
            >
              {MAX_SHELL_LOGIN_CTA}
            </button>
          ) : null}
          {view.showSignupCta ? (
            <button
              type="button"
              onClick={handleOpenSignup}
              className="w-full rounded-full border border-[#7042c5] px-5 py-4 text-[17px] font-medium text-[#7042c5]"
            >
              {MAX_SHELL_SIGNUP_CTA}
            </button>
          ) : null}
        </div>
      ) : null}
      {view.showSignupForm ? (
        <MaxSignupForm
          firstName={firstName}
          lastName={lastName}
          email={email}
          password={password}
          legalConsent={legalConsent}
          marketingConsent={marketingConsent}
          submitting={shell.submitting}
          signupError={shell.signupError}
          onFirstNameChange={setFirstName}
          onLastNameChange={setLastName}
          onEmailChange={setEmail}
          onPasswordChange={setPassword}
          onLegalConsentChange={setLegalConsent}
          onMarketingConsentChange={setMarketingConsent}
          onClearSignupError={() => applyEvent({ type: "SIGNUP_CLEAR_ERROR" })}
          onSubmit={handleSignup}
          onSwitchToLogin={handleOpenLogin}
        />
      ) : null}
      {view.showPendingConfirmation ? (
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
          {view.showSwitchToSignup ? (
            <button
              type="button"
              onClick={handleOpenSignup}
              className="mt-4 text-sm font-medium text-[#7042c5]"
            >
              {MAX_SHELL_SIGNUP_CTA}
            </button>
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
