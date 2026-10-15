// Explicit caller opt-in. Default v1 parsers and all transport remain unchanged.
import * as saints from './ks01-capacity/saints.mjs';
import * as catalog from './ks01-capacity/catalog.mjs';
import * as browser from './ks01-capacity/browser.mjs';
import { KS01_PROFILE_ID, KS01_DECISION_SHA256, SAINTS_LIMITS, CATALOG_LIMITS, CATALOG_COLLECTION_LIMITS } from './ks01-capacity/limits.mjs';

export const KS01_CAPACITY_PROFILE = Object.freeze({
  id: KS01_PROFILE_ID,
  decision_sha256: KS01_DECISION_SHA256,
  limits: Object.freeze({ saints: SAINTS_LIMITS, catalog: Object.freeze({ ...CATALOG_LIMITS, ...CATALOG_COLLECTION_LIMITS }) }),
  saints: Object.freeze({ parseSaintsPayload: saints.parseSaintsPayload, validateSaintsPayload: saints.validateSaintsPayload, evaluateSaintsDay: saints.evaluateSaintsDay }),
  catalog: Object.freeze({ parseCatalogPayload: catalog.parseCatalogPayload, validateCatalogPayload: catalog.validateCatalogPayload,
    evaluateCatalog: catalog.evaluateCatalog, resolveCatalogDay: catalog.resolveCatalogDay, searchCatalog: catalog.searchCatalog,
    catalogDependencies: catalog.catalogDependencies, normalizeCatalogQuery: catalog.normalizeCatalogQuery }),
  browser: Object.freeze({ parseCalendarBrowserPayload: browser.parseCalendarBrowserPayload, validateCalendarBrowserPayload: browser.validateCalendarBrowserPayload,
    evaluateCalendarBrowser: browser.evaluateCalendarBrowser, upcomingBrowserFeasts: browser.upcomingBrowserFeasts,
    resolveBrowserArchiveDay: browser.resolveBrowserArchiveDay, calendarBrowserDependencies: browser.calendarBrowserDependencies }),
});

// This is a validator/resolver API, not release authorization. The caller must
// independently authenticate bytes and enforce reviewed whole-release min_clients.
