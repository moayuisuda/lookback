# shared/i18n

Shared i18n primitives used by renderer, backend, and Electron main.

## Files
- `locales/en.ts`: English dictionary (source of truth for keys)
- `locales/zh.ts`: Chinese dictionary (must cover all keys)
- `types.ts`: `Locale`, `I18nKey`, and i18n descriptor types
- `t.ts`: `t(locale, key, params?)` interpolation helper
