# FullSend Driver Android beta

First release scope: email-code sign-in to the existing FullSend Fleetbase instance,
with the server connection bound into the signed app. Drivers do not enter a server,
API key or connection configuration. An active existing driver profile and its email
address in Fleetbase are required. Installing the app does not create an account.

## Android 0.1.1 interface

The bottom navigation is Orders, Dash and Account. Orders opens first. The global
Navigator/version header is hidden on Android; screen-specific back/close controls
remain available. Dash has the existing Online/Offline availability action with an
explicit explanation and a separate tracking indicator. Failed availability changes
retain the previous confirmed setting. GPS permission/start/session/upload errors
are shown separately; an upload error clears after the native service acknowledges
a successful upload. Existing Orders and Account screen contents are unchanged.

Focused tests cover status changes, duplicate requests, refusal, permission and
upload recovery. The actual Dash and tab navigation are visually checked on an
Android emulator using a separate QA package with synthetic states and no network
or driver session. QA fixtures are outside the release source and APK. Real road,
battery and operational acceptance remain pending as described below.

## Source and verification

Fork of Fleetbase Navigator v2.0.12 (`0da77ce050ad4621efc0ede115c6e2692cda2c8e`).
Original AGPL license and notices are preserved in LICENSE.md. Modified Android
source is public in this repository; the release tag identifies its exact source.

The client uses POST `/v1/navigator/auth/email` and `/v1/navigator/auth/verify`.
The Fleetbase change is merged in appcraft-ltd/fleetbase-dwc PR #6 and deployed as
`75286de76b8b119dda1cc3a0a2af7ffcec7b08cc`. It reuses existing Users, Drivers,
VerificationCodes, mail transport and personal access tokens. Codes are stored
hashed, expire in ten minutes, lock after three wrong guesses and are consumed
atomically with token issuance. No profile/account creation or shared API key.

Focused disposable MySQL/Redis proof passes hashing, expiry, replay, guess limits,
owner/company drift, inactive/deleted/no-driver refusal and token ownership; mail
is captured. Live health/send-to-synthetic-identity/invalid-code checks return
200/202/422. No real driver emails, order writes, test accounts or deliveries were
created for QA. Client tests cover the actual email form and tracking/permission
guards. Android native compilation and signed release build pass. The signed app
installs and opens its email screen on an Android 15 arm64 emulator. A real-driver
email login and road/battery validation remain operator acceptance; they are not
claimed as completed QA.

## GPS without Transistorsoft on Android

Android autolinking excludes both Transistorsoft packages. Their Android Gradle
hooks and license metadata are removed. Our Kotlin module uses Google Play
services Location and an Android location foreground service. An online driver
with precise location permission sees a persistent sharing notification. Offline
or logout stops the service and erases its in-memory token. It uses the existing
driver-track endpoint, accepts HTTPS only and refuses redirects. It never starts
at boot; after force-stop, device restart or process termination the driver must
reopen the app. Disconnected devices resume with a current fix after moving; this
version does not promise complete offline route history or Transistorsoft's
motion/battery behavior. The existing iOS adapter retains its original dependency;
this is an Android release only.

## Build and configuration

Use Node 22 and Yarn 3.6.4, JDK 17+, Android SDK 36 and the pinned NDK. Copy
`.env.dwc.example` to `.env`. It supplies only the approved public addresses and
app identity. Keep `INSTANCE_LOCKED=true` and `FLEETBASE_KEY` empty. No instance,
mail, signing or company API secret belongs in that file or in the APK.

Signing uses the four existing ANDROID_NAVIGATOR_APP_UPLOAD_* environment variables
or gitignored android/local.properties. The private signing material is retained
separately by the operator and must be preserved for subsequent APK updates.

The first build targets arm64-v8a, Android 7.0+ (SDK 24), application ID
`com.fullsendcargo.navigator`. This first beta has no configured Firebase push or
Google Maps client key. Email sign-in and native GPS do not require either; map
rendering/push configuration and the full operational driver workflow are separate
follow-ups. External navigation apps can still be launched by existing Navigator
features. No Google Maps or push acceptance is claimed.

The human authorized this task's existing Fleetbase Railway deployment on
2026-11-06. CargoDept remains on Render and was not changed by this release.
