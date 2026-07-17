"use client";

import { useId } from "react";

export type TopicSelectorOption = {
  key: string;
  title: string;
  isActive: boolean;
  isArchived?: boolean;
};

type TopicSelectorProps = {
  options: TopicSelectorOption[];
  archivedTopics?: TopicSelectorOption[];
  value: string[];
  limit: number;
  disabled?: boolean;
  error?: string;
  onChange: (keys: string[]) => void;
};

export default function TopicSelector({
  options,
  archivedTopics = [],
  value,
  limit,
  disabled = false,
  error,
  onChange,
}: TopicSelectorProps) {
  const errorId = useId();
  const optionKeys = new Set(options.map((option) => option.key));
  const archivedKeySet = new Set(archivedTopics.map((topic) => topic.key));
  const activeSelectedCount = value.filter(
    (key) => optionKeys.has(key) && !archivedKeySet.has(key),
  ).length;
  const limitReached = activeSelectedCount >= limit;

  function toggleTopic(key: string) {
    if (disabled) {
      return;
    }

    if (value.includes(key)) {
      onChange(value.filter((item) => item !== key));
      return;
    }

    if (limitReached) {
      return;
    }

    onChange([...value, key]);
  }

  function removeArchivedTopic(key: string) {
    if (disabled) {
      return;
    }

    onChange(value.filter((item) => item !== key));
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm text-[#7d70a2]">
          Выберите до {limit} тем, которые лучше всего описывают эту практику.
        </p>
        <p className="text-sm font-medium text-[#5f3f9d]">
          Выбрано {activeSelectedCount} из {limit}
        </p>
      </div>

      <div
        className="flex flex-wrap gap-2"
        role="group"
        aria-describedby={error ? errorId : undefined}
      >
        {options.map((option) => {
          const isSelected = value.includes(option.key);
          const isDisabledOption = disabled || (!isSelected && limitReached);

          return (
            <button
              key={option.key}
              type="button"
              aria-pressed={isSelected}
              disabled={isDisabledOption}
              onClick={() => toggleTopic(option.key)}
              className={`inline-flex min-h-11 items-center rounded-full border px-4 py-2 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] disabled:cursor-not-allowed disabled:opacity-45 ${
                isSelected
                  ? "border-[#7042c5] bg-[#7042c5] text-white"
                  : "border-[#ddcfef] bg-white text-[#7042c5]"
              }`}
            >
              {option.title}
            </button>
          );
        })}
      </div>

      {archivedTopics.length > 0 ? (
        <div className="space-y-2 rounded-[18px] border border-[#ece6f5] bg-[#faf7ff] px-4 py-3">
          <p className="text-sm font-medium text-[#6d5f8d]">Архивные темы</p>
          <div className="flex flex-wrap gap-2">
            {archivedTopics.map((topic) => {
              const isSelected = value.includes(topic.key);

              return (
                <button
                  key={topic.key}
                  type="button"
                  aria-pressed={isSelected}
                  disabled={disabled}
                  onClick={() => removeArchivedTopic(topic.key)}
                  className={`inline-flex min-h-11 items-center rounded-full border px-4 py-2 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] disabled:cursor-not-allowed ${
                    isSelected
                      ? "border-[#b9adc9] bg-[#ede7f5] text-[#5f4d75]"
                      : "border-[#e4d7f4] bg-white text-[#9485b4]"
                  }`}
                >
                  {topic.title}
                  <span className="ml-2 text-xs text-[#8a7aa3]">Архивная тема</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {error ? (
        <p id={errorId} className="text-sm text-[#9b3d3d]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
