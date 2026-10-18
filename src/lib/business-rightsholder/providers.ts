// Provider choice for the primary rights-holder check (task 8d9cd0af).
// One check per account; it never confirms the whole catalogue and is never auto-verified.
import {
  RIGHTSHOLDER_EXAMPLES,
  SUNO_LINK_RE,
  type RightsholderEvidenceKind,
  type RightsholderExample,
} from "@/lib/business-rightsholder/examples";

export type RightsholderProvider = "suno" | "musicgpt" | "other";

export type ProviderTextField = {
  key: string;
  label: string;
  hint: string;
  placeholder: string;
  required: boolean;
  multiline?: boolean;
  /** Stored in ai_service_other instead of provider_details. */
  column?: "ai_service_other";
  requiredMessage?: string;
};

export type ProviderEvidenceSlot = {
  kind: RightsholderEvidenceKind;
  required: boolean;
  example: RightsholderExample;
};

export type ProviderConfig = {
  id: RightsholderProvider;
  label: string;
  intro: string;
  titleLabel: string;
  titlePlaceholder: string;
  link: { label: string; placeholder: string; hint: string; required: boolean; invalidMessage: string };
  fields: ProviderTextField[];
  evidence: ProviderEvidenceSlot[];
  /** Other: at least one of the optional slots must be filled. */
  minEvidence: number;
};

const MUSICGPT_LICENSE_EXAMPLE: RightsholderExample = {
  kind: "generation",
  label: "Лицензия или паспорт трека MusicGPT",
  title: "Пример (текстом): лицензия / паспорт трека MusicGPT",
  textExample: [
    "Файл: PDF, скачанный в MusicGPT на странице трека (кнопка загрузки лицензии / License), либо скриншот этой страницы.",
    "На документе видно: название трека – «Calm piano morning» (как в вашем продукте на АудиоЛад).",
    "Идентификатор трека или номер лицензии – например, LIC-XXXX (можно частично скрыть).",
    "Дата создания трека и аккаунт (e-mail можно частично скрыть).",
    "Тип использования / коммерческие права – как указано в документе MusicGPT.",
  ],
  hint: "Скачайте лицензию или паспорт трека в MusicGPT на странице этого трека. Если такой кнопки нет, ваш тариф может не включать эту функцию – тогда приложите скриншот страницы трека и опишите тариф ниже.",
};

const MUSICGPT_PLAN_EXAMPLE: RightsholderExample = {
  kind: "paid_period",
  label: "Тариф MusicGPT",
  title: "Пример (текстом): данные тарифа MusicGPT",
  textExample: [
    "Файл: скриншот раздела подписки/биллинга MusicGPT или квитанция об оплате (PDF).",
    "Видно название тарифа – например, «Pro» – и период оплаты, который покрывает дату создания трека.",
    "Номер карты, адрес и номер квитанции можно скрыть.",
  ],
  hint: "Скриншот или квитанция тарифа MusicGPT за период, когда создан трек. Номер карты и квитанции можно скрыть.",
};

const OTHER_PRIMARY_EXAMPLE: RightsholderExample = {
  kind: "generation",
  label: "Материалы создания",
  title: "Пример (текстом): материалы создания трека",
  textExample: [
    "Своя студия: скриншот проекта в DAW (например, Ableton / FL Studio / Logic) с названием проекта и дорожками, экспорт списка файлов проекта в PDF.",
    "Другой AI-сервис: скриншот страницы трека в сервисе с названием, датой создания и вашим аккаунтом.",
    "Название проекта или трека должно совпадать с треком в вашем продукте или быть понятно связано с ним.",
  ],
  hint: "Скриншот или PDF, по которому видно, что трек создан вами: проект в студии или страница трека в сервисе.",
};

const OTHER_SECONDARY_EXAMPLE: RightsholderExample = {
  kind: "paid_period",
  label: "Лицензия, условия или чек",
  title: "Пример (текстом): лицензия, условия сервиса или чек",
  textExample: [
    "Лицензия или условия сервиса, где сказано про коммерческое использование (PDF или скриншот нужного раздела).",
    "Или чек / квитанция оплаты тарифа, сэмплов, плагинов – за период создания трека.",
    "Личные данные и номера карт можно скрыть.",
  ],
  hint: "Необязательно, если первый файл уже всё показывает. Приложите лицензию/условия сервиса или чек.",
};

export const PROVIDERS: Record<RightsholderProvider, ProviderConfig> = {
  suno: {
    id: "suno",
    label: "Suno",
    intro: "Покажите один свой трек из продукта и оплаченный период подписки Suno, в котором он создан.",
    titleLabel: "Название трека в Suno",
    titlePlaceholder: "Spa relaxation jazz background",
    link: {
      label: "Ссылка на трек в Suno",
      placeholder: "https://suno.com/s/…",
      hint: "Share → Copy link на странице трека.",
      required: true,
      invalidMessage: "Нужна ссылка вида https://suno.com/s/…",
    },
    fields: [
      {
        key: "paid_plan",
        label: "Тариф Suno",
        hint: "Например, Pro или Premier – как в квитанции.",
        placeholder: "Pro",
        required: false,
      },
    ],
    evidence: [
      { kind: "generation", required: true, example: RIGHTSHOLDER_EXAMPLES.generation },
      { kind: "paid_period", required: true, example: RIGHTSHOLDER_EXAMPLES.paid_period },
    ],
    minEvidence: 2,
  },
  musicgpt: {
    id: "musicgpt",
    label: "MusicGPT",
    intro: "Приложите скачанную лицензию или паспорт трека и данные тарифа MusicGPT.",
    titleLabel: "Название трека в MusicGPT",
    titlePlaceholder: "Calm piano morning",
    link: {
      label: "Ссылка на трек в MusicGPT (если есть)",
      placeholder: "https://…",
      hint: "Необязательно.",
      required: false,
      invalidMessage: "Нужна ссылка, начинающаяся с https://",
    },
    fields: [
      {
        key: "plan_name",
        label: "Тариф MusicGPT",
        hint: "Название тарифа, на котором создан трек. Скачивание лицензии доступно не на всех тарифах.",
        placeholder: "Pro",
        required: true,
        requiredMessage: "Укажите тариф MusicGPT",
      },
      {
        key: "license_refs",
        label: "Номер лицензии или ID трека",
        hint: "Если есть в документе.",
        placeholder: "LIC-…",
        required: false,
      },
      {
        key: "license_feature_note",
        label: "Если лицензии на тарифе нет",
        hint: "Опишите, что доступно на вашем тарифе вместо скачиваемой лицензии.",
        placeholder: "На тарифе Basic скачивания лицензии нет, прикладываю скриншот страницы трека",
        required: false,
        multiline: true,
      },
    ],
    evidence: [
      { kind: "generation", required: true, example: MUSICGPT_LICENSE_EXAMPLE },
      { kind: "paid_period", required: true, example: MUSICGPT_PLAN_EXAMPLE },
    ],
    minEvidence: 2,
  },
  other: {
    id: "other",
    label: "Другой сервис / своя студия",
    intro: "Назовите сервис или опишите, как сделан трек, и приложите любые подтверждения: лицензию или условия сервиса, файлы проекта, чеки.",
    titleLabel: "Название трека или проекта",
    titlePlaceholder: "Morning studio session",
    link: {
      label: "Ссылка на трек или проект (если есть)",
      placeholder: "https://…",
      hint: "Необязательно.",
      required: false,
      invalidMessage: "Нужна ссылка, начинающаяся с https://",
    },
    fields: [
      {
        key: "ai_service_other",
        column: "ai_service_other",
        label: "Сервис или как сделан трек",
        hint: "Например: «Udio» или «Своя студия, Ableton Live 12, живые инструменты».",
        placeholder: "Своя студия, Ableton Live 12",
        required: true,
        requiredMessage: "Укажите сервис или опишите, как сделан трек",
      },
      {
        key: "method_description",
        label: "Подробнее (необязательно)",
        hint: "Что вы делали сами, какие сэмплы/плагины/сервисы использовали и на каких условиях.",
        placeholder: "Записал партии сам, сэмплы из библиотеки по лицензии…",
        required: false,
        multiline: true,
      },
    ],
    evidence: [
      { kind: "generation", required: false, example: OTHER_PRIMARY_EXAMPLE },
      { kind: "paid_period", required: false, example: OTHER_SECONDARY_EXAMPLE },
    ],
    minEvidence: 1,
  },
};

export const PROVIDER_ORDER: RightsholderProvider[] = ["suno", "musicgpt", "other"];
export const HTTPS_LINK_RE = /^https:\/\/[^\s@]+$/;

export type ProviderFormValues = {
  provider: RightsholderProvider;
  trackTitle: string;
  trackUrl: string;
  fields: Record<string, string>;
  files: Partial<Record<RightsholderEvidenceKind, File | null>>;
};

/** Client-side mirror of business_onboarding_provider_error (the DB re-checks everything). */
export function validateProviderValues(
  values: ProviderFormValues,
  validateFile: (file: File | null) => string | null,
): Record<string, string> {
  const cfg = PROVIDERS[values.provider];
  const errors: Record<string, string> = {};
  if (!values.trackTitle.trim()) errors.trackTitle = `Укажите: ${cfg.titleLabel.toLowerCase()}`;
  const url = values.trackUrl.trim();
  if (cfg.link.required || url) {
    const re = values.provider === "suno" ? SUNO_LINK_RE : HTTPS_LINK_RE;
    if (!re.test(url)) errors.trackUrl = cfg.link.invalidMessage;
  }
  for (const f of cfg.fields) {
    const v = (values.fields[f.key] ?? "").trim();
    if (f.required && !v) errors[`field:${f.key}`] = f.requiredMessage ?? "Заполните поле";
    else if (v.length > (f.column ? 500 : 4000)) errors[`field:${f.key}`] = "Слишком длинный текст";
  }
  let provided = 0;
  for (const slot of cfg.evidence) {
    const file = values.files[slot.kind] ?? null;
    if (!file && !slot.required) continue;
    const message = validateFile(file);
    if (message) errors[slot.kind] = message;
    else provided += 1;
  }
  if (provided < cfg.minEvidence && !cfg.evidence.some((s) => errors[s.kind])) {
    errors[cfg.evidence[0].kind] = "Добавьте хотя бы один файл-подтверждение";
  }
  return errors;
}

/** Builds RPC args for author_business_verification_draft_v2. */
export function buildDraftDetails(values: ProviderFormValues) {
  const cfg = PROVIDERS[values.provider];
  const details: Record<string, string> = {};
  let other: string | null = null;
  for (const f of cfg.fields) {
    const v = (values.fields[f.key] ?? "").trim();
    if (!v) continue;
    if (f.column === "ai_service_other") other = v;
    else details[f.key] = v;
  }
  const url = values.trackUrl.trim();
  return { aiServiceOther: other, serviceTrackUrl: url ? url : null, providerDetails: details };
}

export function evidenceKindsToUpload(values: ProviderFormValues): RightsholderEvidenceKind[] {
  return PROVIDERS[values.provider].evidence.filter((s) => values.files[s.kind]).map((s) => s.kind);
}
