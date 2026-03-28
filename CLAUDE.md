# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Dev server on localhost:8080
npm run build        # Production build
npm run build:dev    # Development build
npm run lint         # ESLint
npm run preview      # Preview production build
npm run test         # Vitest unit tests
npm run test:watch   # Vitest in watch mode
```

## Architecture

**Stack**: React 18 + TypeScript, Vite (SWC), Tailwind CSS, shadcn-ui, Supabase (PostgreSQL), React Query v5, React Router v6.

**Environment**: Requires `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env` (Supabase project already configured).

### Directory Structure

- `src/pages/` — One file per route. Large pages like `AdminSettings.tsx` (~56KB) manage complex multi-tab UIs.
- `src/components/` — Shared components. `ui/` contains shadcn-ui primitives. `ProtectedModule.tsx` gates content by role/permission.
- `src/services/` — Business logic and DB access. `storageService.ts` (~33KB) is the primary data layer, combining LocalStorage caching with Supabase sync. `adminSupabaseService.ts` handles admin operations. `paymentService.ts` handles Mercado Pago/PIX integration.
- `src/hooks/` — Custom hooks. `useAuth.tsx` manages user sessions and company context. `usePermissions.tsx` provides role-based access checks. `useI18n.tsx` handles PT-BR / ES-PY localization. `useRealtimeData.ts` manages Supabase real-time subscriptions.
- `src/lib/dbSchema.ts` (~50KB) — Complete TypeScript data models mirroring the Supabase schema.
- `src/types/index.ts` — Core domain types (Company, User, Transaction, Contract, BankAccount, etc.).
- `src/layouts/` — `AppLayout.tsx` wraps the main app with sidebar navigation. `AdminLayout.tsx` wraps the admin panel.
- `src/i18n/` — Translation files for PT-BR and ES-PY.
- `supabase/` — Supabase config and SQL functions (edge functions, RPC procedures, trial logic).

### Key Architectural Patterns

**Data Flow**: Components call hooks → hooks use `storageService` → service reads from LocalStorage cache or fetches from Supabase → React Query manages caching and invalidation.

**Auth**: Two separate auth systems — `useAuth` for regular users, `useAdminAuth` for platform admin. Both use Supabase Auth under the hood.

**Multi-tenancy**: Data is scoped per `company_id`. Company settings (currency, exchange rates, active modules) live in the `Company` object surfaced via `useAuth`.

**Role-Based Access Control**: 5 roles — `proprietario`, `administrador`, `financeiro`, `cobrador`, `visualizador`. Permissions are checked via `usePermissions` and enforced in `ProtectedModule`. Each user also has granular per-module boolean flags stored on the User record.

**Multi-Currency**: BRL (Real), PYG (Guaraní), USD. Exchange rates are stored on the Company and used in `src/utils/currencyConversion.ts`. Currency priority and active currencies are configurable per company.

**Digital Contracts**: Contracts support client + company signature capture (via `SignaturePad`), public signing URLs with expiration tokens, and PDF export via jsPDF.

**Payment Integration**: Mercado Pago (credit card + PIX) via `paymentService.ts`. Recent git history shows active work on this module.

**Localization**: Portuguese (BR) and Spanish (PY) via `useI18n` hook. Language is set per company.

### Application Modules

The app has these main route-level modules, all gated by role permissions:

| Route | Purpose |
|---|---|
| `/dashboard` | Financial overview, period filtering, multi-currency summaries |
| `/financeiro` | Receivables/payables management |
| `/caixa` | Cash flow movements and bank transfers |
| `/contas-bancarias` | Bank account management |
| `/clientes` | Person management (PF/PJ, clients and suppliers) |
| `/categorias` | Transaction categories |
| `/contratos` | Contract lifecycle with digital signatures |
| `/configuracoes` | Company settings, exchange rates, trial |
| `/relatorios` | Financial reports |
| `/auditoria` | Audit log |
| `/cobradores` | Debt collector management |
| `/admin/*` | Platform admin panel (separate auth) |

### Deployment

- Hosted on **Vercel**. `vercel.json` rewrites all routes to `index.html` (SPA).
- Backend is fully managed by **Supabase** (no custom server).
