/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the Central Command API. */
  readonly VITE_API_BASE_URL?: string;
  /** Portfolio site URL shown in Settings → About (optional). */
  readonly VITE_PORTFOLIO_URL?: string;
  /** Contact email shown in Settings → About (optional; kept out of source). */
  readonly VITE_CONTACT_EMAIL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
