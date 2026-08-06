/**
 * Lightweight school-page media coordination (audio invitation ↔ VK stories).
 * Not a global media bus — only events used by school landing components.
 */

export const SCHOOL_STOP_AUDIO_EVENT = "audiolad:school-stop-audio";
export const SCHOOL_STOP_VIDEO_EVENT = "audiolad:school-stop-video";

export function requestStopSchoolAudio(): void {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(new Event(SCHOOL_STOP_AUDIO_EVENT));
}

export function requestStopSchoolVideos(): void {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(new Event(SCHOOL_STOP_VIDEO_EVENT));
}
