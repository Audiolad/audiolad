#!/usr/bin/env node

import {
  AUTHOR_APPLICATION_COLUMNS,
  formatApplicationContactSummary,
  mapApplicationContactUpdatePayload,
  mapApplicationInsertPayload,
  mapApplicationUpdatePayload,
} from "../src/lib/author-applications/queries.ts";
import { rowToFormValues } from "../src/lib/author-applications/validation.ts";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function parseSelectColumns(selectSql) {
  return selectSql
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function testSelectColumnsMatchCurrentSchema() {
  const columns = parseSelectColumns(AUTHOR_APPLICATION_COLUMNS);

  assert(!columns.includes("contact"), "select must not reference legacy contact column");
  assert(columns.includes("contact_email"), "select must include contact_email");
  assert(columns.includes("contact_details"), "select must include contact_details");
}

function testWritePayloadsUseCurrentContactFields() {
  const values = {
    displayName: "Автор",
    selectedDirections: ["Медитации"],
    directionOther: "",
    direction: "Медитации",
    about: "Описание автора достаточной длины для проверки.",
    contactEmail: "author@yandex.ru",
    contactDetails: "+7 900 000-00-00",
    hasReadyMaterials: true,
    wantsTraining: false,
    interestedInSchool: false,
    consentPersonalData: true,
  };

  const insert = mapApplicationInsertPayload("user-id", values, "submitted");
  assert(insert.contact_email === values.contactEmail, "insert uses contact_email");
  assert(insert.contact_details === values.contactDetails, "insert uses contact_details");
  assert(!("contact" in insert), "insert must not write legacy contact");

  const update = mapApplicationUpdatePayload(values, null, "submitted");
  assert(update.contact_email === values.contactEmail, "update uses contact_email");
  assert(update.contact_details === values.contactDetails, "update uses contact_details");
  assert(!("contact" in update), "update must not write legacy contact");

  const contactUpdate = mapApplicationContactUpdatePayload(values);
  assert(
    contactUpdate.contact_email === values.contactEmail,
    "contact-only update uses contact_email",
  );
  assert(
    contactUpdate.contact_details === values.contactDetails,
    "contact-only update uses contact_details",
  );
  assert(!("contact" in contactUpdate), "contact-only update must not write legacy contact");
}

function testLegacyRowsMapThroughContactDetails() {
  const values = rowToFormValues(
    {
      display_name: "Автор",
      direction: "Медитации",
      about: "Описание автора достаточной длины для проверки.",
      contact_email: "legacy@yandex.ru",
      contact_details: "+7 900 000-00-00",
      has_ready_materials: true,
      consent_personal_data: true,
    },
    { fallbackContactEmail: "fallback@yandex.ru" },
  );

  assert(values.contactEmail === "legacy@yandex.ru", "stored email preferred");
  assert(values.contactDetails === "+7 900 000-00-00", "stored details preserved");

  const emptyDetails = rowToFormValues(
    {
      display_name: "Автор",
      direction: "Медитации",
      about: "Описание автора достаточной длины для проверки.",
      contact_email: null,
      contact_details: null,
      has_ready_materials: false,
      consent_personal_data: true,
    },
    { fallbackContactEmail: "fallback@yandex.ru" },
  );

  assert(
    emptyDetails.contactEmail === "fallback@yandex.ru",
    "fallback email used when contact_email empty",
  );
  assert(emptyDetails.contactDetails === "", "empty contact_details stays empty");
}

function testContactSummaryUsesCurrentFields() {
  assert(
    formatApplicationContactSummary({
      contact_email: "author@yandex.ru",
      contact_details: "MAX: @author",
    }) === "author@yandex.ru · MAX: @author",
    "summary combines email and details",
  );

  assert(
    formatApplicationContactSummary({
      contact_email: "author@yandex.ru",
      contact_details: null,
    }) === "author@yandex.ru",
    "summary handles email-only rows",
  );
}

function main() {
  testSelectColumnsMatchCurrentSchema();
  testWritePayloadsUseCurrentContactFields();
  testLegacyRowsMapThroughContactDetails();
  testContactSummaryUsesCurrentFields();
  console.log("author-applications-schema-regression-unit: all tests passed");
}

main();
