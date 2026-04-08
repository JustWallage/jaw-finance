/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DEV_USER_EMAIL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
