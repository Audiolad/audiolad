"use client";

import Image from "next/image";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";

export const SCHOOL_CERTIFICATE_SRC =
  "/school/certificate/school-audiopraktik-certificate.webp";

export const SCHOOL_CERTIFICATE_WIDTH = 1492;
export const SCHOOL_CERTIFICATE_HEIGHT = 1054;

const CERTIFICATE_ALT =
  "Пример именного сертификата об окончании Школы Аудиопрактик";

type SchoolCertificatePreviewProps = {
  className?: string;
};

export default function SchoolCertificatePreview({
  className,
}: SchoolCertificatePreviewProps) {
  const titleId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  const handleClose = useCallback(() => {
    setOpen(false);
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    const previousPaddingRight = document.body.style.paddingRight;
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (scrollbar > 0) {
      document.body.style.paddingRight = `${scrollbar}px`;
    }

    const triggerToRestore = triggerRef.current;

    window.setTimeout(() => {
      closeRef.current?.focus();
    }, 0);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        handleClose();
      }
    };

    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPaddingRight;
      document.removeEventListener("keydown", onKeyDown);
      triggerToRestore?.focus();
    };
  }, [open, handleClose]);

  function onBackdropClick(event: ReactMouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) {
      handleClose();
    }
  }

  function onPanelKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.stopPropagation();
      handleClose();
    }
  }

  return (
    <>
      <figure className={["school-cert", className].filter(Boolean).join(" ")}>
        <button
          ref={triggerRef}
          type="button"
          className="school-cert__trigger"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label="Открыть увеличенный просмотр сертификата"
          onClick={() => setOpen(true)}
        >
          <Image
            className="school-cert__image"
            src={SCHOOL_CERTIFICATE_SRC}
            alt={CERTIFICATE_ALT}
            width={SCHOOL_CERTIFICATE_WIDTH}
            height={SCHOOL_CERTIFICATE_HEIGHT}
            sizes="(min-width: 1024px) min(640px, 52vw), (min-width: 768px) min(520px, 80vw), 92vw"
            loading="lazy"
          />
        </button>
        <figcaption className="school-cert__caption">Пример сертификата</figcaption>
      </figure>

      {open ? (
        <div
          className="school-cert-modal"
          role="presentation"
          onMouseDown={onBackdropClick}
        >
          <div
            ref={panelRef}
            className="school-cert-modal__panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-label="Увеличенный просмотр именного сертификата Школы Аудиопрактик"
            onMouseDown={(event) => event.stopPropagation()}
            onKeyDown={onPanelKeyDown}
          >
            <span id={titleId} className="sr-only">
              Увеличенный просмотр именного сертификата Школы Аудиопрактик
            </span>

            <button
              ref={closeRef}
              type="button"
              className="school-cert-modal__close"
              aria-label="Закрыть просмотр сертификата"
              onClick={handleClose}
            >
              <span aria-hidden="true">×</span>
            </button>

            <div className="school-cert-modal__body">
              {/* Native img allows browser pinch-zoom in the scrollable modal. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className="school-cert-modal__image"
                src={SCHOOL_CERTIFICATE_SRC}
                alt={CERTIFICATE_ALT}
                width={SCHOOL_CERTIFICATE_WIDTH}
                height={SCHOOL_CERTIFICATE_HEIGHT}
              />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
