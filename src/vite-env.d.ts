/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ATTOM_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
