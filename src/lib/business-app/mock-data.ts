import type { BusinessPointState } from "./point-state";

export type BusinessOwnerMock = {
  firstName: string;
};

export type BusinessLocationMock = {
  name: string;
  type: string;
};

export type BusinessTrackMock = {
  title: string;
  program: string;
  description: string;
  currentSeconds: number;
  durationSeconds: number;
};

export type BusinessScheduleBlockMock = {
  start: string;
  end: string;
  name: string;
  current?: boolean;
};

export type BusinessHomeMock = {
  owner: BusinessOwnerMock;
  location: BusinessLocationMock;
  currentTrack: BusinessTrackMock;
  schedule: BusinessScheduleBlockMock[];
  musicReserveHours: Record<BusinessPointState, number>;
  stoppedMinutes: number;
};

export const BUSINESS_HOME_MOCK: BusinessHomeMock = {
  owner: {
    firstName: "Марина",
  },
  location: {
    name: "Beauty Line",
    type: "Салон красоты",
  },
  currentTrack: {
    title: "Тихий свет",
    program: "Premium Beauty",
    description: "Спокойная, современная атмосфера",
    currentSeconds: 134,
    durationSeconds: 268,
  },
  schedule: [
    {
      start: "09:00",
      end: "12:00",
      name: "Мягкое утро",
    },
    {
      start: "12:00",
      end: "17:00",
      name: "Beauty Day",
      current: true,
    },
    {
      start: "17:00",
      end: "21:00",
      name: "Premium Evening",
    },
  ],
  musicReserveHours: {
    healthy: 42,
    autonomous: 31,
    stopped: 42,
  },
  stoppedMinutes: 14,
};

export function formatTrackTime(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
