/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** API base URL for the Senate Data Worker */
  readonly VITE_API_URL?: string;
  /** Force fixture review mode for static preview deployments */
  readonly VITE_FORCE_E2E?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
