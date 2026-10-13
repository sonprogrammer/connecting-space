# Admin Query Cache Design

## Goal

Reuse valid administrator read data while navigating between admin menus, while preserving the existing API contracts and keeping administrator requests out of the browser HTTP cache.

## Context and constraints

- The shared admin `QueryClient` already configures `staleTime: 30_000` and `gcTime: 300_000`.
- Customer, project, and project-payment reads already use React Query. Their existing query keys include list/detail identifiers and list parameters, and their fetchers use `cache: "no-store"`.
- The inquiry dashboard list/detail, admin portfolio list, service-offering/FAQ reads, and inquiry reply-draft reads currently fetch directly from UI components. These reads do not share query cache between unmount/remount navigation.
- `/api/admin/inquiries` currently returns a plain list array (maximum 100 rows). It does not define group, sort, cursor/page, `asOf`, or total-count fields. This work must not invent them.
- Customer/project APIs define page-index pagination (`page`, `pageSize`, `total`, `totalPages`) but do not define an `asOf` snapshot token. Existing page navigation remains page-index based; no snapshot-consistency guarantee is added.
- The `asOf` value described in the request is a common API design for pinning subsequent pages to the first page's point-in-time view. It is not part of the inspected inquiry API contract, so this design neither sends nor synthesizes it.

## Selected approach

Use the existing shared React Query client for all admin GET data currently held in component-local fetch state, and retain the existing React Query implementation for customer/project/payment data. A small, domain-owned query-key/fetcher module per feature will expose stable keys and typed fetchers; query functions will use `cache: "no-store"` and preserve current authentication handling and user-facing errors.

Alternative: migrate only the dashboard inquiry list. This would fix one menu transition, but leave the same cache-loss behavior in portfolio, automation content, and reply-draft reads. The selected scope covers those remaining admin read paths without changing their APIs or UI flows.

Alternative: introduce infinite pagination or a client-side snapshot token for inquiries. This is rejected because the endpoint has no pagination or `asOf` contract, and fabricating either would risk duplicate or missing rows.

## Query identity and navigation behavior

- Query keys are namespaced by admin domain and distinguish list from detail. Every variable that changes a response (including entity ID and existing list page/search/status parameters) is part of the key.
- Dashboard inquiry list uses one stable list key. Inquiry detail and reply-draft queries use their entity IDs in separate detail keys.
- Portfolio, service offerings, and FAQs use separate list keys so their cached data cannot collide.
- Existing customer, project, and payment key factories remain authoritative; their keys continue to include existing list/detail inputs.
- Admin menu navigation does not clear the shared QueryClient. Returning to a successful query within 30 seconds reuses its cached result without an HTTP request. Stale entries may refetch under the existing query behavior; entries are eligible for garbage collection after five minutes unused.
- Manual refresh/retry continues to refetch the active query. Unauthorized responses keep the existing safe login redirect behavior where currently present; other failures remain visible and retryable.

## Mutation consistency

After a successful data-changing operation, invalidate only related admin queries, using shared key prefixes rather than component-local state updates as the source of truth:

- Inquiry status/reply/conversion changes invalidate inquiry list and affected inquiry detail/reply-draft data; conversion also invalidates customer/project lists where those records can change.
- Customer and project saves invalidate their corresponding list prefixes and update the saved detail cache from the returned entity as they do today.
- Payment/receipt mutations continue invalidating the affected payment detail; any changed project summary/list is invalidated only if its existing response includes the changed data.
- Portfolio, service-offering, and FAQ mutations invalidate their matching lists.
- Failed mutations do not invalidate caches.

No optimistic updates are required by this change. The active view should show cached data while a stale refetch runs, and show the existing error/retry UI if refresh fails.

## Counts and pagination

- For customer/project paginated responses, show the server-provided `pagination.total` as the overall result count and derive the visible/currently loaded count only from records actually present in the active query result. Do not label the current page length as the total.
- Keep page-index navigation and its API parameters. Each page is a distinct query cache entry, allowing return to a previously visited page within the cache window.
- Do not concatenate pages or add `useInfiniteQuery` for endpoints whose current contract has no continuation mechanism. The inquiry list retains its current server-defined array limit and has no invented overall count.
- No `asOf` propagation is added because none of these relevant contracts currently return one.

## Testing and acceptance

- Query/fetcher tests verify the query key changes for every response-shaping input, preserve `cache: "no-store"`, parse the existing response shapes, and expose errors without replacing them with fake rows.
- A QueryClient-backed navigation test mounts query A, visits query B, then revisits A within 30 seconds and verifies A's query function/HTTP fetch ran once. Use the same provider/client to reflect admin route navigation.
- Mutation tests verify successful changes invalidate the intended query prefixes and failures do not invalidate them.
- Pagination tests use the existing customer/project API contract with more than 25 records across pages. They verify `pagination.total` remains the overall count, current loaded/visible records are counted separately, and page results are not concatenated or duplicated by the UI. They do not assert snapshot consistency or `asOf` semantics.
- Existing loading, empty, error/retry, unauthorized, search/filter/page, and mutation behavior remains covered by focused tests and the repository suite.
- Run `npm test`, `npm run lint`, `npm run type-check`, `npm run build -- --webpack`, and `git diff --check` before PR creation. PR will document exact outputs and any manual browser checks; no remote DB, deployment, or merge is in scope.

## Explicitly out of scope

- Adding or changing API endpoints/contracts, including inquiry grouping/sorting, cursor pagination, snapshot consistency, or `asOf`.
- Backend, database, migration, deployment, or merge work.
- Reworking admin visual design or routing.
