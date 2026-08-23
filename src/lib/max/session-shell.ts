import { SIGN_IN_GENERIC_ERROR } from "@/lib/auth/sign-in-messages";
import { PRODUCTION_APP_ORIGIN } from "@/lib/seo/app-origin";

export const MAX_SHELL_STATUS_NEUTRAL = "АудиоЛад открыт внутри MAX";
export const MAX_SHELL_STATUS_CONNECTING = "Подключение к MAX…";
export const MAX_SHELL_STATUS_VERIFIED = "Подключение к MAX подтверждено";
export const MAX_SHELL_LOGIN_CTA = "Войти в АудиоЛад";
export const MAX_SHELL_SIGNUP_CTA = "Создать аккаунт";
export const MAX_SHELL_SIGNUP_CREATED_LINKED = "Аккаунт создан и подключён";
export const MAX_SHELL_PENDING_CONFIRMATION =
  "Проверьте почту и подтвердите регистрацию";
export const MAX_SHELL_SWITCH_TO_LOGIN = "Уже есть аккаунт? Войти";
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
export const MAX_APEX_OFFER_HREF = `${PRODUCTION_APP_ORIGIN}/offer`;
export const MAX_APEX_PRIVACY_HREF = `${PRODUCTION_APP_ORIGIN}/privacy`;

export { SIGN_IN_GENERIC_ERROR };

export type MaxShellPhase =
  | "guest"
  | "verifying"
  | "guest_unlinked"
  | "logging_in"
  | "signup_form"
  | "signing_up"
  | "pending_confirmation"
  | "linking"
  | "linked_authenticated"
  | "linked_no_session"
  | "expired"
  | "identity_already_linked"
  | "user_already_has_max_identity"
  | "server_error";

export type MaxShellFormMode = "first_link" | "relogin" | "signup";

export type MaxShellSignupField =
  | "firstName"
  | "lastName"
  | "email"
  | "password"
  | "legalConsent"
  | "form";

export type MaxShellSignupError = {
  field: MaxShellSignupField;
  message: string;
};

export type MaxShellState = {
  phase: MaxShellPhase;
  submitting: boolean;
  loginError: string | null;
  signupError: MaxShellSignupError | null;
  formMode: MaxShellFormMode | null;
};

export type MaxShellEvent =
  | { type: "INIT_DATA_MISSING" }
  | { type: "VERIFY_START" }
  | { type: "VERIFY_SUCCESS"; linked: boolean; hasSession: boolean }
  | { type: "VERIFY_FAILURE" }
  | { type: "OPEN_LOGIN" }
  | { type: "OPEN_SIGNUP" }
  | { type: "LOGIN_START" }
  | { type: "LOGIN_FAILURE" }
  | { type: "SIGNUP_START" }
  | { type: "SIGNUP_FAILURE"; error: MaxShellSignupError }
  | { type: "SIGNUP_PENDING" }
  | { type: "SIGNUP_CLEAR_ERROR" }
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
  showSignupCta: boolean;
  showLoginForm: boolean;
  showSignupForm: boolean;
  showPendingConfirmation: boolean;
  showSwitchToLogin: boolean;
  showSwitchToSignup: boolean;
  showSignOut: boolean;
  reloginNotice: string | null;
  pendingMessage: string | null;
  errorMessage: string | null;
  conflictMessage: string | null;
  expiredMessage: string | null;
};

export const INITIAL_MAX_SHELL_STATE: MaxShellState = {
  phase: "guest",
  submitting: false,
  loginError: null,
  signupError: null,
  formMode: null,
};

function withForm(
  phase: MaxShellPhase,
  formMode: MaxShellFormMode,
  loginError: string | null = null,
  submitting = false,
  signupError: MaxShellSignupError | null = null,
): MaxShellState {
  return { phase, submitting, loginError, signupError, formMode };
}

function canOpenFirstLinkLogin(state: MaxShellState): boolean {
  return (
    state.phase === "guest_unlinked" ||
    state.phase === "signup_form" ||
    state.phase === "pending_confirmation" ||
    (state.phase === "logging_in" && state.formMode === "first_link")
  );
}

function canOpenSignup(state: MaxShellState): boolean {
  if (state.formMode === "relogin" || state.phase === "linked_no_session") {
    return false;
  }
  return (
    state.phase === "guest_unlinked" ||
    state.phase === "logging_in" ||
    state.phase === "signup_form" ||
    (state.phase === "server_error" && state.formMode === "first_link")
  );
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
        signupError: null,
        formMode: null,
      };
    case "VERIFY_SUCCESS":
      if (event.linked && event.hasSession) {
        return {
          phase: "linked_authenticated",
          submitting: false,
          loginError: null,
          signupError: null,
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
        signupError: null,
        formMode: null,
      };
    case "OPEN_LOGIN":
      if (!canOpenFirstLinkLogin(state) && state.phase !== "logging_in") {
        return state;
      }
      if (state.formMode === "relogin" || state.phase === "linked_no_session") {
        return state;
      }
      return withForm("logging_in", "first_link");
    case "OPEN_SIGNUP":
      if (!canOpenSignup(state)) {
        return state;
      }
      return withForm("signup_form", "signup");
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
        signupError: null,
      };
    case "LOGIN_FAILURE":
      return withForm(
        state.formMode === "relogin" ? "linked_no_session" : "logging_in",
        state.formMode === "relogin" ? "relogin" : "first_link",
        SIGN_IN_GENERIC_ERROR,
      );
    case "SIGNUP_START":
      if (state.phase !== "signup_form") {
        return state;
      }
      return {
        phase: "signing_up",
        submitting: true,
        loginError: null,
        signupError: null,
        formMode: "signup",
      };
    case "SIGNUP_FAILURE":
      return withForm(
        "signup_form",
        "signup",
        null,
        false,
        event.error,
      );
    case "SIGNUP_PENDING":
      return {
        phase: "pending_confirmation",
        submitting: false,
        loginError: null,
        signupError: null,
        formMode: "signup",
      };
    case "SIGNUP_CLEAR_ERROR":
      if (state.phase !== "signup_form" || !state.signupError) {
        return state;
      }
      return { ...state, signupError: null };
    case "LINK_START":
      return {
        phase: "linking",
        submitting: true,
        loginError: null,
        signupError: null,
        formMode: state.formMode ?? "first_link",
      };
    case "LINK_SUCCESS":
      return {
        phase: "linked_authenticated",
        submitting: false,
        loginError: null,
        signupError: null,
        formMode: state.formMode === "signup" ? "signup" : null,
      };
    case "LINK_EXPIRED":
      return {
        phase: "expired",
        submitting: false,
        loginError: null,
        signupError: null,
        formMode: state.formMode,
      };
    case "LINK_IDENTITY_CONFLICT":
      return {
        phase: "identity_already_linked",
        submitting: false,
        loginError: null,
        signupError: null,
        formMode: state.formMode,
      };
    case "LINK_USER_CONFLICT":
      return {
        phase: "user_already_has_max_identity",
        submitting: false,
        loginError: null,
        signupError: null,
        formMode: state.formMode,
      };
    case "LINK_SERVER_ERROR":
      return withForm(
        "server_error",
        state.formMode === "signup" ? "first_link" : (state.formMode ?? "first_link"),
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
    showSignupCta: false,
    showLoginForm: false,
    showSignupForm: false,
    showPendingConfirmation: false,
    showSwitchToLogin: false,
    showSwitchToSignup: false,
    showSignOut: false,
    reloginNotice: null,
    pendingMessage: null,
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
        showSignupCta: true,
      };
    case "logging_in":
    case "server_error":
      return {
        ...empty,
        statusLine: MAX_SHELL_STATUS_VERIFIED,
        showLoginForm: true,
        showSwitchToSignup: state.formMode !== "relogin",
        reloginNotice:
          state.formMode === "relogin" ? MAX_SHELL_LINKED_NO_SESSION : null,
      };
    case "signup_form":
    case "signing_up":
      return {
        ...empty,
        statusLine: MAX_SHELL_STATUS_VERIFIED,
        showSignupForm: true,
        showSwitchToLogin: true,
      };
    case "pending_confirmation":
      return {
        ...empty,
        statusLine: MAX_SHELL_STATUS_VERIFIED,
        showPendingConfirmation: true,
        showSwitchToLogin: true,
        pendingMessage: MAX_SHELL_PENDING_CONFIRMATION,
      };
    case "linking":
      if (state.formMode === "signup") {
        return {
          ...empty,
          statusLine: MAX_SHELL_STATUS_VERIFIED,
          showSignupForm: true,
        };
      }
      return {
        ...empty,
        statusLine: MAX_SHELL_STATUS_VERIFIED,
        showLoginForm: true,
        showSwitchToSignup: state.formMode !== "relogin",
        reloginNotice:
          state.formMode === "relogin" ? MAX_SHELL_LINKED_NO_SESSION : null,
      };
    case "linked_authenticated":
      return {
        ...empty,
        statusLine:
          state.formMode === "signup"
            ? MAX_SHELL_SIGNUP_CREATED_LINKED
            : MAX_SHELL_LINKED_STATUS,
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

export const canStartMaxSignupFlow = canStartMaxLoginFlow;
