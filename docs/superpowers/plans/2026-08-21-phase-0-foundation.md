# Tuệ Nhi Phase 0 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Dựng repository, toolchain, nền tảng kiểm thử, app shell responsive và PWA installable cho ứng dụng nội bộ Tuệ Nhi mà chưa phụ thuộc vào Supabase staging.

**Architecture:** Một React SPA chạy bằng Vite, tổ chức theo feature và dùng React Router ở Data Mode. TanStack Query chỉ giữ cache trong memory; cấu hình Supabase được validate ở boundary nhưng client chưa được khởi tạo trong Phase 0. PWA chỉ precache app shell và static assets, không runtime-cache Auth, Data API, Storage hoặc report.

**Tech Stack:** Node 24.13.1, pnpm 11.19.0, React 19.2.8, TypeScript 6.0.3, Vite 8.2.2, Tailwind CSS 4.3.3, React Router 8.3.0, TanStack Query 5.101.4, Zod 4.4.3, Vitest 4.1.11, Testing Library, Playwright 1.62.1, vite-plugin-pwa 1.3.0, Supabase CLI 2.115.0.

**Spec:** docs/superpowers/specs/2026-08-21-internal-single-store-pos-design.md

## Global Constraints

- Đây là dự án mới hoàn toàn, độc lập với mọi repository hoặc schema khác.
- Nền tảng là web responsive, mobile-first và cài được như PWA.
- Giao diện và nội dung dùng tiếng Việt, nhận diện riêng “Tuệ Nhi”, không sao chép tài sản thương hiệu bên ngoài.
- Múi giờ nghiệp vụ cố định Asia/Ho_Chi_Minh; tiền hiển thị theo vi-VN và VND.
- Chỉ VITE_SUPABASE_URL và VITE_SUPABASE_PUBLISHABLE_KEY được phép đi vào browser bundle.
- Không dùng Supabase local hoặc Docker; Phase 0 không kết nối hay thay đổi Supabase Cloud.
- Không persist TanStack Query cache, báo cáo, signed URL hoặc dữ liệu nhạy cảm.
- Service worker chỉ cache app shell/icon/static asset; không runtime-cache request tới Supabase.
- TypeScript strict, lint/typecheck/unit/build phải sạch ở mỗi task.
- Mọi hành vi ứng dụng mới dùng red-green-refactor. Generated scaffolding và file cấu hình là ngoại lệ TDD đã được chủ dự án duyệt cùng phương án scaffold.
- Vercel bị hoãn theo yêu cầu chủ dự án; không tạo hoặc link Vercel project trong Phase 0.
- Không đưa .env, access token, database password, secret key hoặc giá trị credential vào Git, test output hay browser bundle.

---

### Task 1: Repository Toolchain and Testable React Bootstrap

**Files:**
- Create: package.json
- Create: pnpm-lock.yaml
- Create: .node-version
- Create: .editorconfig
- Create: .prettierrc.json
- Create: eslint.config.js
- Create: tsconfig.json
- Create: tsconfig.app.json
- Create: tsconfig.node.json
- Create: index.html
- Create: vite.config.ts
- Create: vitest.config.ts
- Create: src/vite-env.d.ts
- Create: src/test/setup.ts
- Create: src/styles/index.css
- Create: src/app/App.test.tsx
- Create: src/app/App.tsx
- Create: src/main.tsx

**Interfaces:**
- Consumes: Node 24.13.1 and pnpm 11.19.0 available on the workstation.
- Produces: App(): JSX.Element, pnpm scripts dev/build/typecheck/lint/test/check, and a clean lockfile consumed by all later tasks.

- [ ] **Step 1: Create the exact package manifest and configuration files**

Use this package.json exactly; package versions stay exact instead of ranges:

~~~json
{
  "name": "tuenhi-pos",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "packageManager": "pnpm@11.19.0",
  "engines": {
    "node": ">=24.13.1 <25",
    "pnpm": ">=11.19.0 <12"
  },
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "typecheck": "tsc -b --pretty false",
    "lint": "eslint .",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",
    "pwa:assets": "pwa-assets-generator --preset minimal-2023 public/logo.svg",
    "check": "pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build",
    "check:full": "pnpm check && pnpm test:e2e",
    "supabase": "supabase"
  },
  "dependencies": {
    "@hookform/resolvers": "5.9.1",
    "@supabase/supabase-js": "2.112.3",
    "@tanstack/react-query": "5.101.4",
    "react": "19.2.8",
    "react-dom": "19.2.8",
    "react-hook-form": "7.85.0",
    "react-router": "8.3.0",
    "zod": "4.4.3"
  },
  "devDependencies": {
    "@eslint/js": "10.0.1",
    "@playwright/test": "1.62.1",
    "@tailwindcss/vite": "4.3.3",
    "@tanstack/eslint-plugin-query": "5.101.4",
    "@testing-library/dom": "10.4.1",
    "@testing-library/jest-dom": "7.0.1",
    "@testing-library/react": "16.3.2",
    "@testing-library/user-event": "14.6.5",
    "@types/node": "24.13.3",
    "@types/react": "19.2.18",
    "@types/react-dom": "19.2.4",
    "@vite-pwa/assets-generator": "1.0.2",
    "@vitejs/plugin-react": "6.1.0",
    "@vitest/coverage-v8": "4.1.11",
    "eslint": "10.8.1",
    "eslint-plugin-react-hooks": "7.1.1",
    "eslint-plugin-react-refresh": "0.5.4",
    "globals": "17.11.0",
    "jsdom": "30.0.1",
    "prettier": "3.9.6",
    "supabase": "2.115.0",
    "tailwindcss": "4.3.3",
    "typescript": "6.0.3",
    "typescript-eslint": "8.67.0",
    "vite": "8.2.2",
    "vite-plugin-pwa": "1.3.0",
    "vitest": "4.1.11"
  },
  "pnpm": {
    "onlyBuiltDependencies": [
      "esbuild",
      "sharp",
      "supabase"
    ]
  }
}
~~~

Set .node-version to 24.13.1. Configure Prettier with semicolons, single quotes and trailing commas. Configure ESLint flat config with @eslint/js recommended, typescript-eslint recommended, React Hooks flat recommended, React Refresh Vite rules and TanStack Query flat recommended. Ignore dist, coverage, playwright-report and test-results.

Use strict TypeScript project references:

~~~json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" }
  ]
}
~~~

tsconfig.app.json must include src, target ES2023, lib ES2023/DOM/DOM.Iterable, jsx react-jsx, module ESNext, moduleResolution Bundler, strict true, noUncheckedIndexedAccess true, noFallthroughCasesInSwitch true and noEmit true. tsconfig.node.json must include vite.config.ts, vitest.config.ts and playwright.config.ts with the same strict/noEmit settings and Node types.

Use Vite with react() and tailwindcss(). Use Vitest with environment jsdom, globals true, setupFiles src/test/setup.ts, css true, restoreMocks true and coverage provider v8.

- [ ] **Step 2: Install dependencies and create the lockfile**

Run:

~~~bash
pnpm install
~~~

Expected: exit 0, pnpm-lock.yaml created, no unresolved peer-dependency error.

- [ ] **Step 3: Write the failing bootstrap component test**

Create src/app/App.test.tsx:

~~~tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('App', () => {
  it('renders the Tuệ Nhi product identity', () => {
    render(<App />);

    expect(screen.getByText('Tuệ Nhi')).toBeInTheDocument();
  });
});
~~~

Create src/test/setup.ts with only:

~~~ts
import '@testing-library/jest-dom/vitest';
~~~

- [ ] **Step 4: Run the bootstrap test and verify RED**

Run:

~~~bash
pnpm test -- src/app/App.test.tsx
~~~

Expected: FAIL because src/app/App.tsx does not exist.

- [ ] **Step 5: Implement the minimal React bootstrap**

Create src/app/App.tsx:

~~~tsx
export function App() {
  return (
    <main>
      <p>Tuệ Nhi</p>
    </main>
  );
}
~~~

Create src/main.tsx:

~~~tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import './styles/index.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Không tìm thấy phần tử gốc của ứng dụng.');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
~~~

Create src/styles/index.css:

~~~css
@import "tailwindcss";

:root {
  font-family:
    Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,
    "Segoe UI", sans-serif;
  color: #0f172a;
  background: #f8fafc;
  font-synthesis: none;
  text-rendering: optimizeLegibility;
}

* {
  box-sizing: border-box;
}

html {
  min-width: 320px;
  min-height: 100%;
  background: #f8fafc;
}

body {
  min-width: 320px;
  min-height: 100vh;
  margin: 0;
}

button,
input,
select,
textarea {
  font: inherit;
}
~~~

Create index.html with lang vi, viewport including viewport-fit=cover, title Tuệ Nhi — Bán hàng & Kho, a Vietnamese description, theme-color #0f766e and div#root.

- [ ] **Step 6: Run the bootstrap test and verify GREEN**

Run:

~~~bash
pnpm test -- src/app/App.test.tsx
~~~

Expected: PASS with 1 test and no warning.

- [ ] **Step 7: Run the initial quality gate**

Run:

~~~bash
pnpm format
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm exec supabase --version
~~~

Expected: every command exits 0; Supabase CLI prints 2.115.0.

- [ ] **Step 8: Commit**

~~~bash
git add package.json pnpm-lock.yaml .node-version .editorconfig .prettierrc.json eslint.config.js tsconfig.json tsconfig.app.json tsconfig.node.json index.html vite.config.ts vitest.config.ts src
git commit -m "chore: bootstrap React toolchain"
~~~

### Task 2: Public Environment Boundary and Command Error Contract

**Files:**
- Create: .env.example
- Create: src/lib/config/supabase-public-config.test.ts
- Create: src/lib/config/supabase-public-config.ts
- Create: src/lib/errors/command-error.test.ts
- Create: src/lib/errors/command-error.ts
- Modify: src/vite-env.d.ts

**Interfaces:**
- Consumes: Zod 4.4.3 and Vitest configured by Task 1.
- Produces: parseSupabasePublicConfig(env): SupabasePublicConfig, BusinessErrorCode, CommandEnvelope<T>, and getBusinessErrorMessage(code).

- [ ] **Step 1: Write failing public-config tests**

Create src/lib/config/supabase-public-config.test.ts:

~~~ts
import { describe, expect, it } from 'vitest';
import { parseSupabasePublicConfig } from './supabase-public-config';

describe('parseSupabasePublicConfig', () => {
  it('returns only the browser-safe Supabase values', () => {
    expect(
      parseSupabasePublicConfig({
        VITE_SUPABASE_URL: 'https://sample.supabase.co',
        VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
        SUPABASE_DB_PASSWORD: 'database-secret',
      }),
    ).toEqual({
      url: 'https://sample.supabase.co',
      publishableKey: 'sb_publishable_test',
    });
  });

  it('rejects missing values without echoing submitted secrets', () => {
    const run = () =>
      parseSupabasePublicConfig({
        VITE_SUPABASE_URL: 'not-a-url',
        VITE_SUPABASE_PUBLISHABLE_KEY: 'secret-value',
      });

    expect(run).toThrow(
      'Thiếu hoặc sai cấu hình Supabase công khai: VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY.',
    );

    try {
      run();
    } catch (error) {
      expect(String(error)).not.toContain('secret-value');
    }
  });
});
~~~

- [ ] **Step 2: Run public-config tests and verify RED**

Run:

~~~bash
pnpm test -- src/lib/config/supabase-public-config.test.ts
~~~

Expected: FAIL because supabase-public-config.ts does not exist.

- [ ] **Step 3: Implement the public environment boundary**

Create src/lib/config/supabase-public-config.ts:

~~~ts
import { z } from 'zod';

const supabasePublicConfigSchema = z.object({
  VITE_SUPABASE_URL: z
    .url()
    .refine((value) => {
      const url = new URL(value);
      return (
        url.protocol === 'https:' && url.hostname.endsWith('.supabase.co')
      );
    }),
  VITE_SUPABASE_PUBLISHABLE_KEY: z.string().trim().min(1),
});

export interface SupabasePublicConfig {
  url: string;
  publishableKey: string;
}

export function parseSupabasePublicConfig(
  env: Record<string, unknown>,
): SupabasePublicConfig {
  const result = supabasePublicConfigSchema.safeParse(env);

  if (!result.success) {
    throw new Error(
      'Thiếu hoặc sai cấu hình Supabase công khai: VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY.',
    );
  }

  return {
    url: result.data.VITE_SUPABASE_URL,
    publishableKey: result.data.VITE_SUPABASE_PUBLISHABLE_KEY,
  };
}
~~~

Create .env.example with empty values only:

~~~dotenv
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_ACCESS_TOKEN=
SUPABASE_DB_PASSWORD=
SUPABASE_PROJECT_ID=
~~~

Extend src/vite-env.d.ts with readonly string declarations for the two VITE_ variables only. Do not declare CLI secrets on ImportMetaEnv.

- [ ] **Step 4: Run public-config tests and verify GREEN**

Run:

~~~bash
pnpm test -- src/lib/config/supabase-public-config.test.ts
~~~

Expected: PASS with 2 tests.

- [ ] **Step 5: Write failing command-error tests**

Create src/lib/errors/command-error.test.ts:

~~~ts
import { describe, expect, it } from 'vitest';
import { getBusinessErrorMessage } from './command-error';

describe('getBusinessErrorMessage', () => {
  it('maps PRICE_CHANGED to actionable Vietnamese copy', () => {
    expect(getBusinessErrorMessage('PRICE_CHANGED')).toBe(
      'Giá bán đã thay đổi. Vui lòng kiểm tra và xác nhận lại giỏ hàng.',
    );
  });

  it('uses safe generic copy for an unknown server code', () => {
    expect(getBusinessErrorMessage('SERVER_DETAIL_NOT_FOR_USERS')).toBe(
      'Không thể hoàn tất thao tác. Vui lòng thử lại.',
    );
  });
});
~~~

- [ ] **Step 6: Run command-error tests and verify RED**

Run:

~~~bash
pnpm test -- src/lib/errors/command-error.test.ts
~~~

Expected: FAIL because command-error.ts does not exist.

- [ ] **Step 7: Implement the command envelope and Vietnamese error map**

Create src/lib/errors/command-error.ts with:

~~~ts
export const businessErrorMessages = {
  AUTH_REQUIRED: 'Vui lòng đăng nhập để tiếp tục.',
  ACCOUNT_INACTIVE: 'Tài khoản đã bị khóa.',
  PERMISSION_DENIED: 'Bạn không có quyền thực hiện thao tác này.',
  INVALID_STATE: 'Chứng từ đã thay đổi. Vui lòng tải lại dữ liệu.',
  PRICE_CHANGED:
    'Giá bán đã thay đổi. Vui lòng kiểm tra và xác nhận lại giỏ hàng.',
  INSUFFICIENT_STOCK: 'Tồn kho không đủ để hoàn tất hóa đơn.',
  RETURN_QTY_EXCEEDED: 'Số lượng trả vượt quá số lượng còn được phép trả.',
  RETURN_NOTHING_ACCEPTED: 'Cần chấp nhận ít nhất một sản phẩm trả lại.',
  ORIGINAL_INVOICE_REQUIRED: 'Vui lòng chọn hóa đơn gốc.',
  STALE_STOCK_COUNT: 'Tồn kho đã thay đổi. Vui lòng kiểm tra và đếm lại.',
  DUPLICATE_REQUEST: 'Yêu cầu đã được xử lý trước đó.',
  NETWORK_OUTCOME_UNKNOWN:
    'Chưa xác định được kết quả. Hệ thống sẽ kiểm tra lại giao dịch.',
  VALIDATION_ERROR: 'Dữ liệu chưa hợp lệ. Vui lòng kiểm tra lại.',
} as const;

export type BusinessErrorCode = keyof typeof businessErrorMessages;

export interface CommandError {
  code: string;
  message: string;
  details: Record<string, unknown>;
}

export type CommandEnvelope<T> =
  | {
      ok: true;
      data: T;
      error: null;
      correlationId: string;
    }
  | {
      ok: false;
      data: null;
      error: CommandError;
      correlationId: string;
    };

const genericBusinessErrorMessage =
  'Không thể hoàn tất thao tác. Vui lòng thử lại.';

export function getBusinessErrorMessage(code: string): string {
  if (code in businessErrorMessages) {
    return businessErrorMessages[code as BusinessErrorCode];
  }

  return genericBusinessErrorMessage;
}
~~~

- [ ] **Step 8: Run Task 2 tests and quality checks**

Run:

~~~bash
pnpm test -- src/lib/config/supabase-public-config.test.ts src/lib/errors/command-error.test.ts
pnpm check
~~~

Expected: 4 focused tests PASS and the full check exits 0.

- [ ] **Step 9: Commit**

~~~bash
git add .env.example src/vite-env.d.ts src/lib
git commit -m "feat: add safe runtime boundaries"
~~~

### Task 3: Responsive Application Shell, Navigation and Offline Banner

**Files:**
- Create: src/app/app-routes.tsx
- Create: src/app/AppProviders.tsx
- Create: src/app/layout/AppShell.test.tsx
- Create: src/app/layout/AppShell.tsx
- Create: src/app/layout/navigation-items.ts
- Create: src/app/pages/DashboardPage.tsx
- Create: src/app/pages/FoundationSectionPage.tsx
- Create: src/app/use-online-status.test.tsx
- Create: src/app/use-online-status.ts
- Create: src/lib/query/create-query-client.ts
- Modify: src/app/App.tsx
- Modify: src/styles/index.css

**Interfaces:**
- Consumes: App() bootstrap from Task 1 and the in-memory-only cache constraint.
- Produces: appRoutes, AppProviders, AppShell, navigationItems and useOnlineStatus() consumed by every later feature phase.

- [ ] **Step 1: Write failing app-shell route tests**

Create src/app/layout/AppShell.test.tsx:

~~~tsx
import { render, screen, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { appRoutes } from '../app-routes';

describe('AppShell', () => {
  it('renders the five required navigation destinations', () => {
    const router = createMemoryRouter(appRoutes, {
      initialEntries: ['/'],
    });

    render(<RouterProvider router={router} />);

    expect(
      screen.getByRole('heading', { name: 'Tổng quan' }),
    ).toBeInTheDocument();

    const mobileNavigation = screen.getByRole('navigation', {
      name: 'Điều hướng di động',
    });

    for (const label of [
      'Tổng quan',
      'Hàng hóa',
      'Bán hàng',
      'Hóa đơn',
      'Nhiều hơn',
    ]) {
      expect(
        within(mobileNavigation).getByRole('link', { name: label }),
      ).toBeInTheDocument();
    }
  });

  it('renders the sales foundation page at /pos', () => {
    const router = createMemoryRouter(appRoutes, {
      initialEntries: ['/pos'],
    });

    render(<RouterProvider router={router} />);

    expect(
      screen.getByRole('heading', { name: 'Bán hàng' }),
    ).toBeInTheDocument();
  });
});
~~~

- [ ] **Step 2: Run app-shell tests and verify RED**

Run:

~~~bash
pnpm test -- src/app/layout/AppShell.test.tsx
~~~

Expected: FAIL because app-routes.tsx does not exist.

- [ ] **Step 3: Implement routes, providers and responsive shell**

Create navigationItems with exactly:

~~~ts
export const navigationItems = [
  { to: '/', label: 'Tổng quan', end: true },
  { to: '/products', label: 'Hàng hóa', end: false },
  { to: '/pos', label: 'Bán hàng', end: false },
  { to: '/sales', label: 'Hóa đơn', end: false },
  { to: '/more', label: 'Nhiều hơn', end: false },
] as const;
~~~

Create appRoutes as RouteObject[] with AppShell as the root element and these children:

- index: DashboardPage with h1 Tổng quan.
- products: FoundationSectionPage title Hàng hóa.
- pos: FoundationSectionPage title Bán hàng.
- sales: FoundationSectionPage title Hóa đơn.
- more: FoundationSectionPage title Nhiều hơn.
- star route: FoundationSectionPage title Không tìm thấy trang.

FoundationSectionPage receives title and description props and renders one h1. Its copy states that the corresponding module will be activated in its approved phase, without using unfinished markers in the source.

AppShell requirements:

- Brand text Tuệ Nhi and subtitle Bán hàng & Kho.
- Desktop nav has aria-label Điều hướng máy tính and classes hidden lg:flex.
- Mobile bottom nav has aria-label Điều hướng di động and classes fixed bottom-0 lg:hidden.
- Mobile links have a minimum 44px touch target and account for env(safe-area-inset-bottom).
- Main content reserves bottom-nav space on mobile and removes it on desktop.
- NavLink uses both text and a visible active marker, never color alone.
- Outlet is inside main.
- The shell does not render cost, revenue, authentication or sample business data.

Create createQueryClient():

~~~ts
import { QueryClient } from '@tanstack/react-query';

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: 1,
        refetchOnWindowFocus: false,
      },
      mutations: {
        retry: false,
      },
    },
  });
}
~~~

AppProviders owns one QueryClient instance with useState(createQueryClient), wraps children in QueryClientProvider and does not configure persistence.

Update App to createBrowserRouter(appRoutes) once at module scope and render RouterProvider inside AppProviders.

- [ ] **Step 4: Run app-shell tests and verify GREEN**

Run:

~~~bash
pnpm test -- src/app/layout/AppShell.test.tsx
~~~

Expected: PASS with 2 tests and no router warning.

- [ ] **Step 5: Write the failing online-status test**

Create src/app/use-online-status.test.tsx:

~~~tsx
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useOnlineStatus } from './use-online-status';

function setNavigatorOnline(value: boolean) {
  Object.defineProperty(window.navigator, 'onLine', {
    configurable: true,
    value,
  });
}

describe('useOnlineStatus', () => {
  it('tracks browser offline and online events', () => {
    setNavigatorOnline(true);
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current).toBe(true);

    act(() => {
      setNavigatorOnline(false);
      window.dispatchEvent(new Event('offline'));
    });
    expect(result.current).toBe(false);

    act(() => {
      setNavigatorOnline(true);
      window.dispatchEvent(new Event('online'));
    });
    expect(result.current).toBe(true);
  });
});
~~~

- [ ] **Step 6: Run online-status test and verify RED**

Run:

~~~bash
pnpm test -- src/app/use-online-status.test.tsx
~~~

Expected: FAIL because use-online-status.ts does not exist.

- [ ] **Step 7: Implement online status and the offline banner**

Create src/app/use-online-status.ts:

~~~ts
import { useSyncExternalStore } from 'react';

function subscribe(callback: () => void) {
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);

  return () => {
    window.removeEventListener('online', callback);
    window.removeEventListener('offline', callback);
  };
}

function getSnapshot() {
  return window.navigator.onLine;
}

export function useOnlineStatus() {
  return useSyncExternalStore(subscribe, getSnapshot, () => true);
}
~~~

Use the hook in AppShell. When offline, render role=status with:

~~~text
Bạn đang ngoại tuyến. Các thao tác ghi sổ sẽ bị khóa.
~~~

Do not queue or auto-submit any command.

- [ ] **Step 8: Run Task 3 tests and quality checks**

Run:

~~~bash
pnpm test -- src/app/layout/AppShell.test.tsx src/app/use-online-status.test.tsx
pnpm check
~~~

Expected: 3 focused tests PASS and the full check exits 0.

- [ ] **Step 9: Commit**

~~~bash
git add src/app src/lib/query src/styles/index.css
git commit -m "feat: add responsive application shell"
~~~

### Task 4: Installable PWA, Browser Smoke Tests, CI and Setup Documentation

**Files:**
- Create: public/logo.svg
- Create: public/favicon.svg
- Create generated: public/favicon.ico
- Create generated: public/pwa-64x64.png
- Create generated: public/pwa-192x192.png
- Create generated: public/pwa-512x512.png
- Create generated: public/maskable-icon-512x512.png
- Create generated: public/apple-touch-icon-180x180.png
- Create: playwright.config.ts
- Create: e2e/app-shell.spec.ts
- Create: .github/workflows/ci.yml
- Create: README.md
- Modify: index.html
- Modify: vite.config.ts

**Interfaces:**
- Consumes: Responsive shell from Task 3 and package scripts from Task 1.
- Produces: manifest.webmanifest, generated service worker, installable icons, cross-viewport browser smoke coverage and a CI quality gate.

- [ ] **Step 1: Write the failing browser/PWA smoke test**

Create playwright.config.ts:

~~~ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'mobile-chromium',
      use: { ...devices['Pixel 7'] },
    },
    {
      name: 'desktop-chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'pnpm preview --host 127.0.0.1',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
  },
});
~~~

Create e2e/app-shell.spec.ts:

~~~ts
import { expect, test } from '@playwright/test';

test('serves the app shell and an installable manifest', async ({
  page,
  request,
}, testInfo) => {
  await page.goto('/');

  await expect(
    page.getByRole('heading', { name: 'Tổng quan' }),
  ).toBeVisible();

  const mobileNavigation = page.getByRole('navigation', {
    name: 'Điều hướng di động',
  });
  const desktopNavigation = page.getByRole('navigation', {
    name: 'Điều hướng máy tính',
  });

  if (testInfo.project.name === 'mobile-chromium') {
    await expect(mobileNavigation).toBeVisible();
    await expect(desktopNavigation).toBeHidden();
  } else {
    await expect(desktopNavigation).toBeVisible();
    await expect(mobileNavigation).toBeHidden();
  }

  const response = await request.get('/manifest.webmanifest');
  expect(response.ok()).toBe(true);

  const manifest = (await response.json()) as {
    name: string;
    short_name: string;
    display: string;
    theme_color: string;
    icons: Array<{ sizes: string }>;
  };

  expect(manifest).toMatchObject({
    name: 'Tuệ Nhi - Bán hàng & Kho',
    short_name: 'Tuệ Nhi',
    display: 'standalone',
    theme_color: '#0f766e',
  });
  expect(manifest.icons.map((icon) => icon.sizes)).toEqual(
    expect.arrayContaining(['192x192', '512x512']),
  );
});
~~~

- [ ] **Step 2: Install Chromium and run the browser test to verify RED**

Run:

~~~bash
pnpm exec playwright install chromium
pnpm build
pnpm test:e2e
~~~

Expected: FAIL because /manifest.webmanifest is not generated.

- [ ] **Step 3: Create original branding and generate PWA assets**

Create public/logo.svg as an original geometric mark:

~~~svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-labelledby="title">
  <title id="title">Tuệ Nhi</title>
  <rect width="512" height="512" rx="112" fill="#0f766e"/>
  <circle cx="256" cy="256" r="144" fill="#f0fdfa"/>
  <path d="M228 156h56v72h72v56h-72v72h-56v-72h-72v-56h72z" fill="#0f766e"/>
</svg>
~~~

Run:

~~~bash
pnpm pwa:assets
~~~

Expected: favicon.ico, pwa-64x64.png, pwa-192x192.png, pwa-512x512.png, maskable-icon-512x512.png and apple-touch-icon-180x180.png are generated under public.

- [ ] **Step 4: Enable the PWA manifest and static-only service worker**

Add VitePWA to vite.config.ts with registerType autoUpdate, includeAssets for favicon.ico/favicon.svg/apple-touch-icon-180x180.png, and:

~~~ts
VitePWA({
  registerType: 'autoUpdate',
  includeAssets: [
    'favicon.ico',
    'favicon.svg',
    'apple-touch-icon-180x180.png',
  ],
  manifest: {
    name: 'Tuệ Nhi - Bán hàng & Kho',
    short_name: 'Tuệ Nhi',
    description: 'Ứng dụng bán hàng và quản lý kho nội bộ Tuệ Nhi.',
    lang: 'vi',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#f8fafc',
    theme_color: '#0f766e',
    icons: [
      {
        src: 'pwa-64x64.png',
        sizes: '64x64',
        type: 'image/png',
      },
      {
        src: 'pwa-192x192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: 'pwa-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: 'maskable-icon-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  },
  workbox: {
    cleanupOutdatedCaches: true,
    runtimeCaching: [],
  },
})
~~~

Copy public/logo.svg to public/favicon.svg using the same original SVG content. Add favicon.ico, favicon.svg and apple-touch-icon head links to index.html. Keep theme-color exactly #0f766e.

- [ ] **Step 5: Run the browser test and verify GREEN**

Run:

~~~bash
pnpm build
pnpm test:e2e
~~~

Expected: PASS in mobile-chromium and desktop-chromium. The production build contains manifest.webmanifest and a generated service worker.

- [ ] **Step 6: Add the CI quality gate**

Create .github/workflows/ci.yml:

~~~yaml
name: CI

on:
  push:
  pull_request:

permissions:
  contents: read

jobs:
  quality:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - name: Checkout
        uses: actions/checkout@v6

      - name: Setup pnpm
        uses: pnpm/setup@v2

      - name: Setup Node.js
        uses: actions/setup-node@v7
        with:
          node-version-file: .node-version
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Run static and unit checks
        run: pnpm check

      - name: Install Chromium
        run: pnpm exec playwright install --with-deps chromium

      - name: Run browser smoke tests
        run: pnpm test:e2e
~~~

- [ ] **Step 7: Document setup and security boundaries**

Create README.md with these concrete sections:

1. Product scope: internal, single store, single logical warehouse, no lot/expiry tracking.
2. Requirements: Node 24.13.1 and pnpm 11.19.0.
3. Local frontend commands: pnpm install, pnpm dev, pnpm check, pnpm test:e2e.
4. Environment variables: distinguish the two VITE_ browser variables from the three CLI-only Supabase variables.
5. Cloud workflow: no Supabase local/Docker; migrations will be pushed to dedicated staging beginning in Phase 1.
6. PWA cache boundary: app shell/static assets only; financial/API responses are network-only.
7. Deployment: Vercel intentionally deferred.
8. Links to the approved spec and this Phase 0 plan.

Do not include real project IDs, URLs, passwords, keys, employee credentials or example secrets.

- [ ] **Step 8: Run the complete Phase 0 verification**

Run:

~~~bash
pnpm check
pnpm test:e2e
pnpm exec supabase --version
git status --short
~~~

Expected:

- format, lint, typecheck, unit tests and build all pass.
- both Playwright projects pass.
- Supabase CLI prints 2.115.0.
- git status shows only the intended Phase 0 files.

- [ ] **Step 9: Commit**

~~~bash
git add public playwright.config.ts e2e .github/workflows/ci.yml README.md index.html vite.config.ts
git commit -m "feat: make the foundation installable"
~~~
