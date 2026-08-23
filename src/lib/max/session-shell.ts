import { SIGN_IN_GENERIC_ERROR } from "@/lib/auth/sign-in-messages";
import { PRODUCTION_APP_ORIGIN } from "@/lib/seo/app-origin";

export const MAX_SHELL_STATUS_NEUTRAL = "АудиоЛад открыт внутри MAX";
export const MAX_SHELL_STATUS_CONNECTING = "Подключение к MAX…";
export const MAX_SHELL_STATUS_VERIFIED = "Подключение к MAX подтверждено";
export const MAX_SHELL_LOGIN_CTA = "Войти в АудиоЛад";
export const MAX_SHELL_SIGNUP_HINT =
  "Создание аккаунта появится следующим этапом";
export const MAX_SHELL_LINKED_STATUS = "Аккаунт АудиоЛада подключён";
export const MAX_SHELL_SIGNED_IN_STATUS = "Вы вошли в АудиоЛад";
export const MAX_SHELL_LINKED_NO_SESSION =
  "Этот MAX уже связан с АудиоЛадом. Войдите в свой аккаунт для доступа к личным материалам.";
export const MAX_SHELL_EXPIRED =
  "Сессия MAX устарела. Закройте и снова откройте АудиоЛад.";
export const MAX_SHELL_IDENTITY_ALREADY_LINKED =
  "Этот MAX уже связан с другим аккаунтом АудиоЛада.";
export const MAX_SHELL_USER_ALREADY_HAS_MAX_IDENTITY =
  "Этот аккаунт АудиоЛада уже связан с другим MAX.";
export const MAX_SHELL_SERVER_ERROR =
  "Не удалось связать аккаунт. Попробуйте ещё раз.";
export const MAX_SHELL_SIGN_OUT_LABEL = "Выйти";
export const MAX_APEX_FORGOT_PASSWORD_HREF = `${PRODUCTION_APP_ORIGIN}/auth/forgot-password`;

export { SIGN_IN_GENERIC_ERROR };

export type MaxShellPhase =
  | "guest"
  | "verifying"
  | "guest_unlinked"
  | "logging_in"
  | "linking"
  | "linked_authenticated"
  | "linked_no_session"
  | "expired"
  | "identity_already_linked"
  | "user_already_has_max_identity"
  | "server_error";

export type MaxShellFormMode = "first_link" | "relogin";

export type MaxShellState = {
  phase: MaxShellPhase;
  submitting: boolean;
  loginError: string | null;
  formMode: MaxShellFormMode | null;
};

export type MaxShellEvent =
  | { type: "INIT_DATA_MISSING" }
  | { type: "VERIFY_START" }
  | { type: "VERIFY_SUCCESS"; linked: boolean; hasSession: boolean }
  | { type: "VERIFY_FAILURE" }
  | { type: "OPEN_LOGIN" }
  | { type: "LOGIN_START" }
  | { type: "LOGIN_FAILURE" }
  | { type: "LINK_START" }
  | { type: "LINK_SUCCESS" }
  | { type: "LINK_EXPIRED" }
  | { type: "LINK_IDENTITY_CONFLICT" }
  | { type: "LINK_USER_CONFLICT" }
  | { type: "LINK_SERVER_ERROR" }
  | { type: "SIGN_OUT" };

export type MaxShellView = {
  phase: MaxShellPhase;
  statusLine: string;
  showLoginCta: boolean;
  showLoginForm: boolean;
  showSignOut: boolean;
  signupHint: string | null;
  reloginNotice: string | null;
  errorMessage: string | null;
  conflictMessage: string | null;
  expiredMessage: string | null;
};

export const INITIAL_MAX_SHELL_STATE: MaxShellState = {
  phase: "guest",
  submitting: false,
  loginError: null,
  formMode: null,
};

function withForm(
  phase: MaxShellPhase,
  formMode: MaxShellFormMode,
  loginError: string | null = null,
  submitting = false,
): MaxShellState {
  return { phase, submitting, loginError, formMode };
}

export function reduceMaxShell(
  state: MaxShellState,
  event: MaxShellEvent,
): MaxShellState {
  switch (event.type) {
    case "INIT_DATA_MISSING":
    case "VERIFY_FAILURE":
      return INITIAL_MAX_SHELL_STATE;
    case "VERIFY_START":
      return {
        phase: "verifying",
        submitting: false,
        loginError: null,
        formMode: null,
      };
    case "VERIFY_SUCCESS":
      if (event.linked && event.hasSession) {
        return {
          phase: "linked_authenticated",
          submitting: false,
          loginError: null,
          formMode: null,
        };
      }
      if (event.linked) {
        return withForm("linked_no_session", "relogin");
      }
      return {
        phase: "guest_unlinked",
        submitting: false,
        loginError: null,
        formMode: null,
      };
    case "OPEN_LOGIN":
      if (state.phase !== "guest_unlinked") {
        return state;
      }
      return withForm("logging_in", "first_link");
    case "LOGIN_START":
      if (
        state.phase !== "logging_in" &&
        state.phase !== "linked_no_session" &&
        state.phase !== "server_error"
      ) {
        return state;
      }
      return {
        ...state,
        submitting: true,
        loginError: null,
      };
    case "LOGIN_FAILURE":
      return withForm(
        state.formMode === "relogin" ? "linked_no_session" : "logging_in",
        state.formMode ?? "first_link",
        SIGN_IN_GENERIC_ERROR,
      );
    case "LINK_START":
      return {
        phase: "linking",
        submitting: true,
        loginError: null,
        formMode: state.formMode ?? "first_link",
      };
    case "LINK_SUCCESS":
      return {
        phase: "linked_authenticated",
        submitting: false,
        loginError: null,
        formMode: null,
      };
    case "LINK_EXPIRED":
      return {
        phase: "expired",
        submitting: false,
        loginError: null,
        formMode: state.formMode,
      };
    case "LINK_IDENTITY_CONFLICT":
      return {
        phase: "identity_already_linked",
        submitting: false,
        loginError: null,
        formMode: state.formMode,
      };
    case "LINK_USER_CONFLICT":
      return {
        phase: "user_already_has_max_identity",
        submitting: false,
        loginError: null,
        formMode: state.formMode,
      };
    case "LINK_SERVER_ERROR":
      return withForm(
        "server_error",
        state.formMode ?? "first_link",
        MAX_SHELL_SERVER_ERROR,
      );
    case "SIGN_OUT":
      if (
        state.phase === "linked_authenticated" ||
        state.phase === "identity_already_linked"
      ) {
        return withForm("linked_no_session", "relogin");
      }
      if (state.phase === "user_already_has_max_identity") {
        return withForm("logging_in", "first_link");
      }
      return state;
    default: {
      const _exhaustive: never = event;
      return _exhaustive;
    }
  }
}

export function viewMaxShell(state: MaxShellState): MaxShellView {
  const empty: MaxShellView = {
    phase: state.phase,
    statusLine: MAX_SHELL_STATUS_NEUTRAL,
    showLoginCta: false,
    showLoginForm: false,
    showSignOut: false,
    signupHint: null,
    reloginNotice: null,
    errorMessage: state.loginError,
    conflictMessage: null,
    expiredMessage: null,
  };

  switch (state.phase) {
    case "guest":
      return empty;
    case "verifying":
      return { ...empty, statusLine: MAX_SHELL_STATUS_CONNECTING };
    case "guest_unlinked":
      return {
        ...empty,
        statusLine: MAX_SHELL_STATUS_VERIFIED,
        showLoginCta: true,
      };
    case "logging_in":
    case "linking":
    case "server_error":
      return {
        ...empty,
        statusLine: MAX_SHELL_STATUS_VERIFIED,
        showLoginForm: true,
        signupHint:
          state.formMode === "relogin" ? null : MAX_SHELL_SIGNUP_HINT,
        reloginNotice:
          state.formMode === "relogin" ? MAX_SHELL_LINKED_NO_SESSION : null,
      };
    case "linked_authenticated":
      return {
        ...empty,
        statusLine: MAX_SHELL_LINKED_STATUS,
        showSignOut: true,
      };
    case "linked_no_session":
      return {
        ...empty,
        statusLine: MAX_SHELL_STATUS_VERIFIED,
        showLoginForm: true,
        reloginNotice: MAX_SHELL_LINKED_NO_SESSION,
      };
    case "expired":
      return {
        ...empty,
        statusLine: MAX_SHELL_STATUS_VERIFIED,
        expiredMessage: MAX_SHELL_EXPIRED,
      };
    case "identity_already_linked":
      return {
        ...empty,
        statusLine: MAX_SHELL_STATUS_VERIFIED,
        showSignOut: true,
        conflictMessage: MAX_SHELL_IDENTITY_ALREADY_LINKED,
      };
    case "user_already_has_max_identity":
      return {
        ...empty,
        statusLine: MAX_SHELL_STATUS_VERIFIED,
        showSignOut: true,
        conflictMessage: MAX_SHELL_USER_ALREADY_HAS_MAX_IDENTITY,
      };
    default: {
      const _exhaustive: never = state.phase;
      return _exhaustive;
    }
  }
}

export function canStartMaxLoginFlow(initData: string | null): boolean {
  return typeof initData === "string" && initData.trim().length > 0;
}
