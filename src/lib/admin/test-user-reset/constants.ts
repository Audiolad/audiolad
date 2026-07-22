/** Hardcoded allowlisted test user email — never accept from client input. */
export const TEST_USER_RESET_EMAIL = "audiolad@mail.ru";

export const TEST_USER_RESET_NORMALIZED_EMAIL = "audiolad@mail.ru";

export const TEST_USER_RESET_CONFIRMATION_PHRASE =
  `СБРОСИТЬ ${TEST_USER_RESET_EMAIL}` as const;

export const TEST_USER_RESET_OPERATION = "test_user_reset" as const;

export const TEST_USER_RESET_AUDIT_TARGET_MARKER =
  "allowlisted:audiolad@mail.ru" as const;
