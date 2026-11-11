# Assigned orders on the opening screen

Previously Android's opening Runs screen listed only manifests. Orders assigned individually were behind a plain-looking “Standalone orders” button, even when the driver had active assignments. That separation made the empty-runs message misleading.

The opening screen and tab are now Assignments. Its active view reads the existing driver-filtered orders API across all dates and displays order references, status, pickup, drop-off and a direct Open order action alongside runs. Run members stay in their existing run flow. Past runs and run pagination remain available. Opening an order uses the existing Order screen; it does not accept, start or modify the order.

Both lists refresh on focus, foreground, pull-to-refresh and the existing active-screen timer. They load independently. A failed request displays an explicit error and preserves any already loaded same-session rows; an empty message requires successful empty results from both sources. Driver/adapter scope and request sequence checks prevent late results from another session replacing the current list. No schema, backend, native dependency, assignment or status changes.

Verification: focused component tests cover six active orders with no runs, earlier-day orders, direct order/run navigation, run-member exclusion, independent failure/retry, malformed responses, history and stale driver responses. The actual screen renders in a local web harness with synthetic assignments at 390px and 320px without overflow. Physical-driver acceptance is not claimed.
