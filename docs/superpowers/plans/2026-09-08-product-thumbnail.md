# Product Thumbnail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show each product's private primary image as a resilient thumbnail on the Hàng hóa list.

**Architecture:** Extract the existing signed-URL query behavior into one reusable presentation component and reuse it both in the image manager and catalog list. The component caches URLs below their ten-minute expiry, renders a small neutral fallback for a missing or failed image, and never changes Storage policy or exposes a public URL.

**Tech Stack:** React 19, TanStack Query, TypeScript, Vitest/Testing Library, Supabase Storage signed URLs.

**Spec:** `docs/superpowers/specs/2026-09-08-purchase-entry-and-product-thumbnail-design.md`

## Global Constraints

- Read `primaryImagePath` only from the existing catalog DTO; do not add a migration or a new catalog RPC.
- Keep `product-images` private and create URLs solely through `ProductImageApi.createSignedUrl`.
- Use 48 × 48 px `object-cover` thumbnails with product-name alt text.
- A missing path or URL error renders **Chưa có ảnh**, with no toast and no broken image icon.
- Cache URL queries below the existing ten-minute URL expiry; invalidate/refetch after the existing product image change callback.
- Do not add dependencies or make Cloud/Storage policy changes.

---

## File structure

| Path | Responsibility |
| --- | --- |
| `src/features/catalog/components/ProductImageThumbnail.tsx` | Reusable private signed-image/fallback presentation component. |
| `src/features/catalog/components/ProductImageThumbnail.test.tsx` | URL loading, fallback and product-name accessibility tests. |
| `src/features/catalog/components/ProductImageManager.tsx` | Reuse the shared signed-image component for detail gallery items. |
| `src/features/catalog/components/ProductCatalogList.tsx` | Render the primary thumbnail in each list row instead of the placeholder. |
| `src/features/catalog/pages/ProductListPage.test.tsx` | Verify list integration with an image path and fallback. |

### Task 1: Extract a reusable private image thumbnail

**Files:**
- Create: `src/features/catalog/components/ProductImageThumbnail.tsx`
- Create: `src/features/catalog/components/ProductImageThumbnail.test.tsx`
- Modify: `src/features/catalog/components/ProductImageManager.tsx`
- Modify: `src/features/catalog/components/ProductImageManager.test.tsx`
- Test: `src/features/catalog/components/ProductImageThumbnail.test.tsx`

**Interfaces:**
- Consumes: `ProductImageApi.createSignedUrl(objectPath)` and TanStack Query.
- Produces: `ProductImageThumbnail({ objectPath, alt, api?, className? })` that is safe for the catalog list and product gallery.

- [ ] **Step 1: Write failing thumbnail component tests.**

Render the component with an API mock resolving `https://signed.example/image`. Assert the eventual `<img>` has that source and `alt="Ảnh chính của Sản phẩm A"`. Add one null-path case asserting **Chưa có ảnh**, one rejected URL case asserting the same fallback, and one pending case asserting `aria-label="Đang tải ảnh sản phẩm"`. Assert the rejected case never calls a toast callback because the component has none.

- [ ] **Step 2: Run the component suite and confirm it fails because the component does not exist.**

Run: `pnpm vitest run src/features/catalog/components/ProductImageThumbnail.test.tsx`

Expected: FAIL with missing module/component.

- [ ] **Step 3: Implement the component and replace the image-manager-local signed image.**

Implement this public prop type:

```ts
type ProductImageThumbnailProps = {
  objectPath: string | null;
  alt: string;
  api?: ProductImageApi;
  className?: string;
};
```

Return the neutral **Chưa có ảnh** block immediately when `objectPath` is null. Otherwise use query key `['catalog', 'product-image-url', objectPath]`, `staleTime: 8 * 60 * 1000`, a loading square, and a query-error fallback. Render an `<img>` with `object-cover`, never expose object storage paths in the DOM, and preserve the gallery's existing large-grid sizing through `className`.

Replace local `SignedImage` in `ProductImageManager` with this component; pass `image.objectPath`, `alt="Ảnh sản phẩm"`, the existing API, and its gallery size classes. Keep upload/remove behavior unchanged.

- [ ] **Step 4: Run focused component tests.**

Run: `pnpm vitest run src/features/catalog/components/ProductImageThumbnail.test.tsx src/features/catalog/components/ProductImageManager.test.tsx && pnpm typecheck`

Expected: PASS.

- [ ] **Step 5: Commit the shared signed-image component.**

```bash
git add src/features/catalog/components/ProductImageThumbnail.tsx src/features/catalog/components/ProductImageThumbnail.test.tsx src/features/catalog/components/ProductImageManager.tsx src/features/catalog/components/ProductImageManager.test.tsx
git commit -m "refactor: share private product image thumbnail"
```

### Task 2: Show the primary thumbnail in Hàng hóa and verify regression behavior

**Files:**
- Modify: `src/features/catalog/components/ProductCatalogList.tsx`
- Modify: `src/features/catalog/pages/ProductListPage.test.tsx`
- Test: `src/features/catalog/pages/ProductListPage.test.tsx`

**Interfaces:**
- Consumes: Task 1 `ProductImageThumbnail` and existing `ProductCatalogItem.primaryImagePath`.
- Produces: a 48 × 48 px primary-image cell per catalog row with safe fallback.

- [ ] **Step 1: Write failing catalog list integration tests.**

Extend the list-page API fixture with an item whose `primaryImagePath` is `products/id/primary.webp`. Mock the thumbnail API to resolve a signed URL and assert the row contains `alt="Ảnh chính của Sản phẩm A"`. Add a null-path item and assert its row contains **Chưa có ảnh**. Keep the existing price, stock-state, pagination and search expectations intact.

- [ ] **Step 2: Run the list-page suite and confirm it fails because the placeholder is still rendered.**

Run: `pnpm vitest run src/features/catalog/pages/ProductListPage.test.tsx`

Expected: FAIL because the catalog row still contains the literal placeholder **Ảnh**.

- [ ] **Step 3: Integrate the thumbnail in `ProductCatalogList`.**

Replace the fixed placeholder block in `ProductRow` with:

```tsx
<ProductImageThumbnail
  objectPath={item.primaryImagePath}
  alt={`Ảnh chính của ${item.name}`}
  className="h-12 w-12 rounded-lg"
/>
```

Preserve the existing five-column desktop grid and skeleton geometry. Do not fetch/create signed URLs at page level and do not modify catalog API data shapes.

- [ ] **Step 4: Run regression checks.**

Run: `pnpm vitest run src/features/catalog/pages/ProductListPage.test.tsx src/features/catalog/components/ProductImageThumbnail.test.tsx && pnpm lint && pnpm typecheck`

Expected: PASS; loading/error thumbnails occupy the same 48 × 48 area and the existing list controls remain unchanged.

- [ ] **Step 5: Commit the catalog thumbnail integration.**

```bash
git add src/features/catalog/components/ProductCatalogList.tsx src/features/catalog/pages/ProductListPage.test.tsx
git commit -m "feat: show primary images in product catalog"
```
