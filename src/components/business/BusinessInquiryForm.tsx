"use client";

import { useState, type FormEvent } from "react";

import {
  BUSINESS_INQUIRY_EMAIL,
  buildBusinessInquiryMailto,
  hasBusinessInquiryErrors,
  validateBusinessInquiry,
  type BusinessInquiryInput,
} from "@/lib/business/landing";

const EMPTY_INQUIRY: BusinessInquiryInput = {
  name: "",
  email: "",
  company: "",
  locations: "1",
  message: "",
};

export default function BusinessInquiryForm() {
  const [values, setValues] = useState<BusinessInquiryInput>(EMPTY_INQUIRY);
  const [errors, setErrors] = useState(validateBusinessInquiry(EMPTY_INQUIRY));
  const [attempted, setAttempted] = useState(false);

  function update<K extends keyof BusinessInquiryInput>(
    key: K,
    value: BusinessInquiryInput[K],
  ) {
    const next = { ...values, [key]: value };
    setValues(next);
    if (attempted) {
      setErrors(validateBusinessInquiry(next));
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validateBusinessInquiry(values);
    setErrors(nextErrors);
    setAttempted(true);

    if (hasBusinessInquiryErrors(nextErrors)) {
      return;
    }

    window.location.href = buildBusinessInquiryMailto(values);
  }

  return (
    <form className="business-form" onSubmit={onSubmit} noValidate>
      <label className="business-field">
        Имя
        <input
          name="name"
          autoComplete="name"
          value={values.name}
          aria-invalid={attempted && Boolean(errors.name)}
          onChange={(event) => update("name", event.target.value)}
        />
        {attempted && errors.name ? (
          <span className="business-field__error">{errors.name}</span>
        ) : null}
      </label>
      <label className="business-field">
        Электронная почта
        <input
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          value={values.email}
          aria-invalid={attempted && Boolean(errors.email)}
          onChange={(event) => update("email", event.target.value)}
        />
        {attempted && errors.email ? (
          <span className="business-field__error">{errors.email}</span>
        ) : null}
      </label>
      <label className="business-field">
        Компания
        <input
          name="company"
          autoComplete="organization"
          value={values.company}
          onChange={(event) => update("company", event.target.value)}
        />
      </label>
      <label className="business-field">
        Сколько точек подключить
        <input
          name="locations"
          type="number"
          inputMode="numeric"
          min={1}
          max={10000}
          step={1}
          value={values.locations}
          aria-invalid={attempted && Boolean(errors.locations)}
          onChange={(event) => update("locations", event.target.value)}
        />
        {attempted && errors.locations ? (
          <span className="business-field__error">{errors.locations}</span>
        ) : null}
      </label>
      <label className="business-field">
        Комментарий
        <textarea
          name="message"
          maxLength={1000}
          value={values.message}
          onChange={(event) => update("message", event.target.value)}
        />
        {attempted && errors.message ? (
          <span className="business-field__error">{errors.message}</span>
        ) : null}
      </label>
      <button type="submit" className="business-btn business-btn--primary">
        Открыть письмо с заявкой
      </button>
      <p className="business-note">
        Кнопка открывает почтовую программу с текстом заявки на{" "}
        <a href={`mailto:${BUSINESS_INQUIRY_EMAIL}`}>{BUSINESS_INQUIRY_EMAIL}</a>
        . Если почта не открылась, напишите на этот адрес сами.
      </p>
    </form>
  );
}
