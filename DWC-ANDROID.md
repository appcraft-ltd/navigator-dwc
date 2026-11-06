# FullSend Driver Android fork

Status: **draft source; not a driver release**. No production login, phone GPS
acceptance, signed APK, or public APK download is claimed.

Upstream: Fleetbase Navigator v2.0.12,
`0da77ce050ad4621efc0ede115c6e2692cda2c8e`. Original AGPL license and notices
remain in LICENSE.md. The corresponding modified source remains in this fork.

## First-install flow

The signed build supplies the approved HTTPS API and socket addresses. Drivers
enter their email, then the six-digit code sent by Fleetbase. There is no
connection-config step. Incoming configuration links are ignored. No organization
API credential, server mail key or signing credential belongs in the APK.

Copy `.env.dwc.example` to `.env` and supply the approved public host values.
The example supplies the approved public Fleetbase API/socket addresses.
Firebase push is disabled until an actual Firebase client is provisioned; the
example contains no fake production push credentials. Google Maps requires an
Android-restricted Maps key before map acceptance. The in-app location-sharing
notification does not require Firebase.

## Email API contract awaiting the server implementation

`POST /v1/navigator/auth/email` accepts `{email}`. The server must select only an
existing active driver in the configured organization, throttle IP and identity,
and send a short-lived verification code through its existing email transport.
Return the same `{status: "ok"}` for unavailable identities; no account creation.

`POST /v1/navigator/auth/verify` accepts `{email, code}`. Enforce organization,
active-user/driver ownership, expiry, bounded guesses and atomic single-use
consumption using the existing VerificationCode and personal access token models.
Return `{driver: {...existingDriverResource, token}}` only after verification.
There must be no test/bypass code, arbitrary company selector, new auth service,
embedded shared API key, or automatic retry. These endpoints are **not present
in the current deployed server**; they need an owned Fleetbase change and focused
server tests before this client can be released. The client is not made ready
merely by compiling it.

## Android location without Transistorsoft

Android autolinking excludes both Transistorsoft packages. Their Gradle hooks and
license metadata are removed from the Android build. The Android adapter uses
our Kotlin module and Google Play services Location, with a native `location`
foreground service. The existing iOS adapter still uses its original dependency;
this work makes no iOS release claim.

Only an authenticated online driver with granted precise location permission can
start the service from the open application. Android displays a persistent
notification. Offline/logout erases the native session and stops tracking. The
native service posts to the existing driver track endpoint using that driver's
token, refuses HTTP/redirects, and keeps coordinates and credentials in memory.
It never starts at boot. Force-stop, device restart or process termination needs
the driver to reopen the app. An offline device sends a new current fix after
reconnecting; this version does not promise complete offline route history,
Transistorsoft motion detection, or equal battery performance.

## Verification and release boundary

Focused client tests cover identity validation, token-only session acceptance,
refusal/uncertain-request handling, and permission/online/logout tracking guards.
Native compilation and actual Android foreground/background/offline/logout/
permission-revocation testing are separate required checks. Publish a signed APK
only after the actual server email flow and a phone smoke pass. Keep its signing
key outside source and outside react-native-config; preserve it for updates.

On 2026-11-06 the human explicitly authorized access to the existing Fleetbase
Railway deployment and release of email sign-in support for this task. CargoDept
remains on Render. The earlier automatic Railway denial was resolved by that
explicit approval; it is not a current release blocker.
