import { useEffect, useState } from "react";
import { LEGAL_CONTACT } from "./legalConfig";
import { t, type Locale } from "./i18n";

const COOKIE_KEY = "tank-check-cookie-ok";

export type LegalPage = "impressum" | "datenschutz" | null;

export function CookieBanner({ locale }: { locale: Locale }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(COOKIE_KEY)) setVisible(true);
    } catch {
      setVisible(true);
    }
  }, []);

  if (!visible) return null;

  function accept() {
    try {
      localStorage.setItem(COOKIE_KEY, "1");
    } catch {
      /* Speichern fehlgeschlagen – Banner trotzdem schließen */
    }
    setVisible(false);
  }

  return (
    <div
      role="dialog"
      aria-label={t(locale, "cookieAria")}
      className="fixed inset-x-0 bottom-0 z-[60] border-t border-[var(--color-moss)]/15 bg-[var(--color-paper)]/95 px-5 py-4 shadow-[0_-12px_40px_-20px_rgba(26,46,31,0.45)] backdrop-blur-sm"
    >
      <div className="mx-auto flex max-w-lg flex-col gap-3 sm:flex-row sm:items-end sm:gap-4">
        <p className="flex-1 text-sm leading-snug text-[var(--color-ink)]/80">
          {t(locale, "cookieText")}
        </p>
        <button
          type="button"
          onClick={accept}
          className="shrink-0 rounded-xl bg-[var(--color-moss-deep)] px-4 py-2.5 text-sm font-semibold text-[var(--color-paper)]"
        >
          {t(locale, "cookieOk")}
        </button>
      </div>
    </div>
  );
}

export function LegalLinks({
  locale,
  onOpen,
}: {
  locale: Locale;
  onOpen: (page: LegalPage) => void;
}) {
  return (
    <nav className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs" aria-label={t(locale, "legalNav")}>
      <button
        type="button"
        className="text-[var(--color-moss)] underline-offset-2 hover:underline"
        onClick={() => onOpen("impressum")}
      >
        {t(locale, "impressum")}
      </button>
      <button
        type="button"
        className="text-[var(--color-moss)] underline-offset-2 hover:underline"
        onClick={() => onOpen("datenschutz")}
      >
        {t(locale, "privacy")}
      </button>
    </nav>
  );
}

export function LegalModal({
  page,
  locale,
  onClose,
}: {
  page: LegalPage;
  locale: Locale;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!page) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [page, onClose]);

  if (!page) return null;

  const title = page === "impressum" ? t(locale, "impressum") : t(locale, "privacy");

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label={t(locale, "close")}
        className="absolute inset-0 bg-[var(--color-moss-deep)]/40"
        onClick={onClose}
      />
      <aside
        role="dialog"
        aria-label={title}
        className="relative z-10 flex max-h-[85dvh] w-full max-w-lg flex-col rounded-t-3xl border border-[var(--color-moss)]/15 bg-[var(--color-paper)] shadow-xl sm:rounded-3xl"
      >
        <div className="flex items-center justify-between border-b border-[var(--color-moss)]/10 px-5 py-4">
          <p className="font-display text-xl font-bold text-[var(--color-moss-deep)]">{title}</p>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm text-[var(--color-ink)]/70"
          >
            {t(locale, "close")}
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 text-sm leading-relaxed text-[var(--color-ink)]/85">
          {page === "impressum" ? (
            <ImpressumBody locale={locale} />
          ) : (
            <DatenschutzBody locale={locale} />
          )}
        </div>
      </aside>
    </div>
  );
}

function ImpressumBody({ locale }: { locale: Locale }) {
  const { name, street, city, country, email } = LEGAL_CONTACT;
  return (
    <div className="space-y-4">
      <p>{t(locale, "impressumIntro")}</p>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-moss)]">
          {t(locale, "operator")}
        </p>
        <p className="mt-1 whitespace-pre-line">
          {name}
          {street ? `\n${street}` : ""}
          {city ? `\n${city}` : ""}
          {`\n${country}`}
        </p>
        {email ? (
          <p className="mt-2">
            {t(locale, "emailLabel")}{" "}
            <a className="text-[var(--color-moss)] underline" href={`mailto:${email}`}>
              {email}
            </a>
          </p>
        ) : (
          <p className="mt-2 text-xs text-[var(--color-ink)]/55">{t(locale, "contactHint")}</p>
        )}
      </div>
      <p className="text-xs text-[var(--color-ink)]/55">{t(locale, "impressumDisclaimer")}</p>
    </div>
  );
}

function DatenschutzBody({ locale }: { locale: Locale }) {
  return (
    <div className="space-y-4">
      <p>{t(locale, "privacyIntro")}</p>
      <section>
        <h2 className="font-semibold text-[var(--color-moss-deep)]">
          {t(locale, "privacyPurposeTitle")}
        </h2>
        <p className="mt-1">{t(locale, "privacyPurpose")}</p>
      </section>
      <section>
        <h2 className="font-semibold text-[var(--color-moss-deep)]">
          {t(locale, "privacyLocalTitle")}
        </h2>
        <p className="mt-1">{t(locale, "privacyLocal")}</p>
      </section>
      <section>
        <h2 className="font-semibold text-[var(--color-moss-deep)]">
          {t(locale, "privacyLocTitle")}
        </h2>
        <p className="mt-1">{t(locale, "privacyLoc")}</p>
      </section>
      <section>
        <h2 className="font-semibold text-[var(--color-moss-deep)]">
          {t(locale, "privacyExtTitle")}
        </h2>
        <p className="mt-1">{t(locale, "privacyExt")}</p>
      </section>
      <section>
        <h2 className="font-semibold text-[var(--color-moss-deep)]">
          {t(locale, "privacyHostTitle")}
        </h2>
        <p className="mt-1">{t(locale, "privacyHost")}</p>
      </section>
      <section>
        <h2 className="font-semibold text-[var(--color-moss-deep)]">
          {t(locale, "privacyRightsTitle")}
        </h2>
        <p className="mt-1">{t(locale, "privacyRights")}</p>
      </section>
      <p className="text-xs text-[var(--color-ink)]/55">{t(locale, "privacyFooter")}</p>
    </div>
  );
}
