# Android login recovery — 7 November 2026

The API accepts OTP and returns orders successfully. On a fresh install with an active order from a previous day and no saved GPS fix, PastOrderCard renders LiveOrderRoute with focusCurrentDestination. getDriverLocationAsPlace previously read location.coords.latitude while location was {}. The uncaught render error terminated the Android UI.

Reproduced on the official Android 16 ARM64 emulator using the actual application, providers, SDK resources and navigation, with synthetic auth/order transport. Native logs recorded the latitude TypeError in LiveOrderRoute/PastOrderCard and expo-updates-error-recovery FATAL. The same fixture after the fix displays the active order and all three tabs without a fatal or recovery fallback. No physical Samsung acceptance is claimed.

Missing/nonfinite/out-of-range positions now stay unknown. A missing GPS fix or map configuration shows a bounded placeholder; subsequent valid GPS can mount a map with a valid initial region. Valid zero is preserved, GeoJSON is longitude-first. Nearby distance stays unavailable until both coordinates are known. Driver movement handles position/heading independently without reassignment errors or location logging. A render recovery boundary retains session/photos and offers explicit retry/sign-out.

A related upload defect was confirmed with the actual SDK: React Native selects its Axios adapter, whose bearer header is in axiosInstance.defaults.headers while adapter.headers is empty. Native multipart requests now reuse the same adapter credentials, respect common/explicit overrides and fail before sending bytes if credentials are missing. JSON Content-Type and Content-Length are never copied onto multipart.

Validation: 22 focused tests pass (map/GPS/recovery, tracking lifecycle, delivery actions, multipart auth/pending photos). Android 16 synthetic native Pickup and Drop off compress the fixture to 211131 bytes, use real multipart boundaries and actual SDK authorization, verify stored SHA-256 and duplicate retry receipts. Local upload+replay measured 139/102 ms; these are local transport timings, not a production network performance claim. No real driver session, order mutation, upload or email was used for QA.

Pure JS hotfixes target the exact native receipts separately for 0.1.2 and 0.1.3. New APK uses the existing application ID and signing certificate. Existing native baseline checks and signed update protocol remain in force.
