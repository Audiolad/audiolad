"use client";

import { PERSONAL_MATERIAL_TYPE_OPTIONS } from "@/lib/personal-materials/client/status-labels";
import type {
  PersonalMaterialFormErrors,
  PersonalMaterialFormValues,
} from "@/lib/personal-materials/client/validation";

type AuthorDiagnosticsFormFieldsProps = {
  values: PersonalMaterialFormValues;
  errors: PersonalMaterialFormErrors;
  disabled?: boolean;
  readOnly?: boolean;
  idPrefix?: string;
  onChange: (field: keyof PersonalMaterialFormValues, value: string) => void;
};

export default function AuthorDiagnosticsFormFields({
  values,
  errors,
  disabled = false,
  readOnly = false,
  idPrefix = "diagnostics",
  onChange,
}: AuthorDiagnosticsFormFieldsProps) {
  const fieldClassName =
    "w-full min-w-0 rounded-[18px] border border-[#e4d7f4] bg-white px-4 py-3 text-[15px] outline-none focus:border-[#9a74d8] disabled:bg-[#faf7ff]";

  return (
    <div className="grid min-w-0 gap-4">
      <div className="block min-w-0">
        <label
          htmlFor={`${idPrefix}-material-type`}
          className="mb-2 block text-sm font-medium text-[#5f5484]"
        >
          Тип материала
        </label>
        <select
          id={`${idPrefix}-material-type`}
          value={values.materialType}
          disabled={disabled || readOnly}
          onChange={(event) => onChange("materialType", event.target.value)}
          className={fieldClassName}
        >
          {PERSONAL_MATERIAL_TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="grid min-w-0 gap-4 sm:grid-cols-2">
        <div className="block min-w-0">
          <label
            htmlFor={`${idPrefix}-client-first-name`}
            className="mb-2 block text-sm font-medium text-[#5f5484]"
          >
            Имя клиента
          </label>
          <input
            id={`${idPrefix}-client-first-name`}
            type="text"
            value={values.clientFirstName}
            disabled={disabled || readOnly}
            onChange={(event) => onChange("clientFirstName", event.target.value)}
            className={fieldClassName}
            autoComplete="off"
          />
          {errors.clientFirstName ? (
            <span className="mt-1 block text-sm text-[#b42318]">{errors.clientFirstName}</span>
          ) : null}
        </div>

        <div className="block min-w-0">
          <label
            htmlFor={`${idPrefix}-client-last-name`}
            className="mb-2 block text-sm font-medium text-[#5f5484]"
          >
            Фамилия клиента
          </label>
          <input
            id={`${idPrefix}-client-last-name`}
            type="text"
            value={values.clientLastName}
            disabled={disabled || readOnly}
            onChange={(event) => onChange("clientLastName", event.target.value)}
            className={fieldClassName}
            autoComplete="off"
          />
          {errors.clientLastName ? (
            <span className="mt-1 block text-sm text-[#b42318]">{errors.clientLastName}</span>
          ) : null}
        </div>
      </div>

      <div className="block min-w-0">
        <label
          htmlFor={`${idPrefix}-material-date`}
          className="mb-2 block text-sm font-medium text-[#5f5484]"
        >
          Дата диагностики
        </label>
        <input
          id={`${idPrefix}-material-date`}
          type="date"
          value={values.materialDate}
          disabled={disabled || readOnly}
          onChange={(event) => onChange("materialDate", event.target.value)}
          className={fieldClassName}
        />
        {errors.materialDate ? (
          <span className="mt-1 block text-sm text-[#b42318]">{errors.materialDate}</span>
        ) : null}
      </div>

      <div className="block min-w-0">
        <label htmlFor={`${idPrefix}-title`} className="mb-2 block text-sm font-medium text-[#5f5484]">
          Название
        </label>
        <input
          id={`${idPrefix}-title`}
          type="text"
          value={values.title}
          disabled={disabled || readOnly}
          onChange={(event) => onChange("title", event.target.value)}
          placeholder="Например: Энергетическая диагностика"
          className={fieldClassName}
        />
        {errors.title ? (
          <span className="mt-1 block text-sm text-[#b42318]">{errors.title}</span>
        ) : null}
      </div>

      <div className="block min-w-0">
        <label
          htmlFor={`${idPrefix}-description`}
          className="mb-2 block text-sm font-medium text-[#5f5484]"
        >
          Описание для клиента
        </label>
        <textarea
          id={`${idPrefix}-description`}
          value={values.description}
          disabled={disabled || readOnly}
          onChange={(event) => onChange("description", event.target.value)}
          placeholder="Этот текст увидит клиент перед прослушиванием."
          rows={4}
          className={`${fieldClassName} resize-y`}
        />
        {errors.description ? (
          <span className="mt-1 block text-sm text-[#b42318]">{errors.description}</span>
        ) : null}
      </div>

      <div className="block min-w-0">
        <label
          htmlFor={`${idPrefix}-recommendation`}
          className="mb-2 block text-sm font-medium text-[#5f5484]"
        >
          Персональная рекомендация
        </label>
        <textarea
          id={`${idPrefix}-recommendation`}
          value={values.personalRecommendation}
          disabled={disabled || readOnly}
          onChange={(event) => onChange("personalRecommendation", event.target.value)}
          placeholder="Можно добавить краткую персональную рекомендацию после диагностики."
          rows={4}
          className={`${fieldClassName} resize-y`}
        />
        {errors.personalRecommendation ? (
          <span className="mt-1 block text-sm text-[#b42318]">
            {errors.personalRecommendation}
          </span>
        ) : null}
      </div>
    </div>
  );
}
