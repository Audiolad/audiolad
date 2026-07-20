import { resolveUtmMediumFromForm } from "./channel-types";
import {
  isValidUtmMedium,
  isValidUtmSource,
  isValidCustomUtmMedium,
  normalizeUtmValue,
  validateNormalizedUtmValue,
} from "./utm-normalize";

export type CustomChannelFormInput = {
  label: string;
  utmSource: string;
  channelType: string;
  customTypeLabel: string;
};

export type CustomChannelFormErrors = {
  label?: string;
  utmSource?: string;
  channelType?: string;
  customTypeLabel?: string;
};

export type ResolvedCustomChannel = {
  label: string;
  utmSource: string;
  utmMedium: string;
};

export function resolveCustomChannelForm(
  input: CustomChannelFormInput,
): ResolvedCustomChannel | null {
  const errors = validateCustomChannelForm(input);

  if (Object.keys(errors).length > 0) {
    return null;
  }

  const label = input.label.trim();
  const utmSource = normalizeUtmValue(input.utmSource);
  const utmMedium = resolveUtmMediumFromForm(
    input.channelType,
    input.customTypeLabel,
  );

  return {
    label,
    utmSource,
    utmMedium,
  };
}

export function validateCustomChannelForm(
  input: CustomChannelFormInput,
): CustomChannelFormErrors {
  const errors: CustomChannelFormErrors = {};

  if (!input.label.trim()) {
    errors.label = "Введите название канала";
  }

  const sourceError = validateNormalizedUtmValue(input.utmSource);

  if (sourceError === "utm_value_empty") {
    errors.utmSource = "Не удалось сформировать UTM-источник";
  } else if (sourceError === "utm_value_invalid") {
    errors.utmSource =
      "UTM-значение может содержать только латинские буквы, цифры и дефисы";
  }

  if (!input.channelType.trim()) {
    errors.channelType = "Выберите тип канала";
  }

  if (input.channelType === "other") {
    if (!input.customTypeLabel.trim()) {
      errors.customTypeLabel = "Укажите свой тип канала";
    } else if (!isValidCustomUtmMedium(input.customTypeLabel)) {
      errors.customTypeLabel =
        "UTM-значение может содержать только латинские буквы, цифры и дефисы";
    }
  }

  return errors;
}

export function buildUtmSourceFromLabel(
  label: string,
  currentSource: string,
  sourceEditedManually: boolean,
): string {
  if (sourceEditedManually) {
    return currentSource;
  }

  return normalizeUtmValue(label);
}

export function isCustomChannelFormComplete(input: CustomChannelFormInput): boolean {
  return Object.keys(validateCustomChannelForm(input)).length === 0;
}

export function isResolvedCustomChannelValid(
  resolved: ResolvedCustomChannel,
): boolean {
  return (
    Boolean(resolved.label) &&
    isValidUtmSource(resolved.utmSource) &&
    isValidUtmMedium(resolved.utmMedium) &&
    resolved.utmMedium !== "other"
  );
}
