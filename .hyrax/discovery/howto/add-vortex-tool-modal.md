<!-- synced from Hyrax discovery — this file will be overwritten on next sync -->
---
title: Add a new advertising-tool modal to the vortex frontend
description: Add a new feature modal to the vortex UI following the existing *ToolsModal
  / *Tool naming and composition pattern.
---

# Add a new advertising-tool modal to the vortex frontend

The vortex frontend has a large family of modal components for individual advertising/account tools, all following a `*Modal` / `*Tool` naming convention, visible in the symbol table: `AdvertisingToolsModal`, `BmMetaToolModal`, `CardsToolsModal`, `CcFromBmModal`, `FundsToolsModal`, `IBANToolModal`, `MetaAdsOneWayModal`, `MetaCardAdderModal`, `MiniMeta2Modal`, `PayPalToolModal`, `ProxyToolsModal`, `RemovePaymentModal`, `AddFundsModal`, `AddPrimaryModal`, `BmCreatorModal`, `CreateAdAccTool`, `CreateBmTool`, `InviterUserModal`.

Steps:
1. Identify the closest existing modal to your new tool by function (e.g. an account/BM-related tool vs a payment/card-related tool vs a proxy-related tool) and treat it as your template.
2. Reuse shared building blocks already present in the symbol table rather than re-implementing them: `InputField`, `PasswordInput`, `CookieInput`, `Select`, `ProgressBar`, `Loader`, `ResultBox`, `ResultRow`, `LogBox`, `Feedback`.
3. If the tool needs country/quantity/plan selection, reuse the existing constant sets already defined in the codebase (`COUNTRIES`, `QUANTITY_PRESETS`, `PLAN_DEFAULTS`, `PLAN_COLORS`) instead of redefining them.
4. If the tool talks to the Facebook/Meta APIs, go through `FacebookApiService` rather than calling `fetch`/`axios` directly, matching how other Meta-related modals are structured.
5. Wire the new modal into whatever parent panel/menu lists the other `*ToolsModal` entries (e.g. `AdvertisingToolsModal`, `ProxyToolsModal`) so it is reachable from the same UI surface as its siblings.