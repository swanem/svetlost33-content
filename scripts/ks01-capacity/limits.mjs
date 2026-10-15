// Explicit additive implementation profile. Never selected by payload data.
export const KS01_PROFILE_ID = 'ks01-capacity-366-r1';
export const KS01_DECISION_SHA256 = '5452b8728adad35a1fc300ec04967a3b70d3cac3a175b06136c9aff39b0c781b';
export const SAINTS_LIMITS = Object.freeze({ bytes: 1572864, articles: 366, sources: 512, days: 366, wordsMin: 100, wordsMax: 200, proseScalars: 4000 });
export const CATALOG_LIMITS = Object.freeze({ bytes: 1048576, queryScalars: 128, results: 50 });
export const CATALOG_COLLECTION_LIMITS = Object.freeze({ sources: 512, subjects: 512, article_links: 512 });
