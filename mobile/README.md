# WashLink mobile

The native customer and washer app, built with React Native, Expo and Expo Router. It isn't a WebView of the website. It calls the same Supabase backend through the same `@washlink/shared` client as the web app. Admin and shop accounts are sent to the website.

## Set up

```bash
npm install
```

Copy `.env.example` to `.env` and fill in the public Supabase URL and anon key. Never put a service role key here, because everything in this app ships to phones.

## Run

A development build is needed for maps and push. Expo Go may not include what they need.

```bash
npx expo start
```

To check screens in a browser against the local test stack, run this from the repository root:

```bash
node scripts/supabase-test/b2c-mobile-preview.mjs
```

The browser preview replaces maps and the keychain with stand-ins, so it can't verify either.

## Check

```bash
npm run typecheck
```

```bash
npm test
```

```bash
npm run doctor
```

## Build

Builds run on Expo's servers and need an Expo account. iOS also needs an Apple Developer account.

```bash
npm install -g eas-cli
```

```bash
eas init
```

```bash
eas build --profile preview --platform android
```

```bash
eas build --profile production --platform ios
```

Set these in EAS environment variables, not in source control:

| Name | Purpose |
| --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` | Backend address |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Public key, limited by database rules |
| `EAS_PROJECT_ID` | Needed for push tokens |
| `GOOGLE_MAPS_ANDROID_API_KEY` | Android maps. Without it, the map is blank on Android |

## Before store release

- Replace the default icon and splash with real logo files. None exist in the repository yet.
- Confirm the bundle ID `com.washlink.app` is the one you want. It is hard to change after release.
- Add in-app account deletion, which both stores require. See `docs/b2c/FINAL_REPORT.md`.
- Test on real Android and iPhone devices.
