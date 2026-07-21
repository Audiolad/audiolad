export function resolvePasswordInputType(
  visible: boolean,
): "password" | "text" {
  return visible ? "text" : "password";
}

export function getPasswordToggleAriaLabel(visible: boolean): string {
  return visible ? "Скрыть пароль" : "Показать пароль";
}

export function togglePasswordVisibility(visible: boolean): boolean {
  return !visible;
}
