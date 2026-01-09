/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** API base URL for the Senate Data Worker */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
