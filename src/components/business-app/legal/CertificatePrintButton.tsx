"use client";

/** «Скачать PDF»: печать страницы, в окне печати выбрать «Сохранить как PDF». */
export default function CertificatePrintButton() {
  return (
    <button
      type="button"
      className="business-app-btn business-app-btn-cta business-app-focus-ring"
      data-testid="venue-certificate-print"
      onClick={() => window.print()}
    >
      Скачать PDF или распечатать
    </button>
  );
}
