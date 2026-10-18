# Contributing

## Setup
```bash
npm install                 # root workspace: packages/core + apps/web
cd apps/mobile && npm install
```

## Everyday commands
| Task | Command |
|---|---|
| Core unit tests | `npm test` |
| Web tests / typecheck / lint / build | `npm run test -w web`, `npm run typecheck`, `npm run lint`, `npm run build:web` |
| Web dev server | `npm run dev -w web` |
| Mobile typecheck / lint / doctor | `cd apps/mobile && npx tsc --noEmit && npx expo lint && npx expo-doctor` |
| Mobile dev build | `cd apps/mobile && npx eas-cli build --profile development --platform android` |

## Rules
- The grading maths lives in **one** place, `packages/core`. If you change `GRADE_FUNCTION` in `shader.ts`, mirror it in `grade.ts` and keep the tests green.
- Any change to where ads can appear must go through `packages/core/src/ads.ts` and its tests.
- No paywalls, IAP, subscriptions or watermarks. PRs adding a billing SDK will be closed.
- Mobile: add native packages with `npx expo install`. Never hand-edit `ios/` or `android/`; configure through `app.json` and plugins.
- Never commit secrets. Use `.env.example` files with empty values.
- Commits: short imperative subject lines.
