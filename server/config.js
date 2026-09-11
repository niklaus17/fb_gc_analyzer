import 'dotenv/config';

function normalizeAccountId(value) {
  const trimmed = value.trim();
  return trimmed.startsWith('act_') ? trimmed : `act_${trimmed}`;
}

function accountNamesById() {
  return Object.fromEntries((process.env.META_AD_ACCOUNT_NAMES || '')
    .split(',')
    .map((pair) => pair.trim())
    .filter(Boolean)
    .map((pair) => {
      const [rawId, ...nameParts] = pair.split(':');
      return [normalizeAccountId(rawId), nameParts.join(':').trim()];
    })
    .filter(([, name]) => name));
}

export function getConfig() {
  return {
    databaseUrl: process.env.DATABASE_URL || 'postgresql://nicolaeniculita@localhost:5432/fb_gc_analyzer',
    metaApiVersion: process.env.META_API_VERSION || 'v24.0',
    metaAccessToken: process.env.META_ACCESS_TOKEN || '',
    metaAdAccountIds: (process.env.META_AD_ACCOUNT_IDS || '')
      .split(',').map((value) => value.trim()).filter(Boolean)
      .map(normalizeAccountId),
    metaAdAccountNames: accountNamesById(),
    port: Number(process.env.PORT || 3000),
  };
}
