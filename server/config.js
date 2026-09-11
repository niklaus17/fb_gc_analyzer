import 'dotenv/config';

export function getConfig() {
  return {
    databaseUrl: process.env.DATABASE_URL || 'postgresql://nicolaeniculita@localhost:5432/fb_gc_analyzer',
    metaApiVersion: process.env.META_API_VERSION || 'v24.0',
    metaAccessToken: process.env.META_ACCESS_TOKEN || '',
    metaAdAccountIds: (process.env.META_AD_ACCOUNT_IDS || '')
      .split(',').map((value) => value.trim()).filter(Boolean)
      .map((value) => value.startsWith('act_') ? value : `act_${value}`),
    port: Number(process.env.PORT || 3000),
  };
}
