import 'dotenv/config';

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'si', 'on'].includes(value.toLowerCase());
}

export const config = {
  env: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 4000),
  databaseUrl:
    process.env.DATABASE_URL ?? 'postgres://cubo:cubo@127.0.0.1:5432/money_adventure',
  jwtSecret: process.env.JWT_SECRET ?? 'my-money-adventure-dev-secret-cambiami',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '30d',
  parentSessionMinutes: Number(process.env.PARENT_SESSION_MINUTES ?? 30),
  corsOrigin: process.env.CORS_ORIGIN ?? '*',
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? '',
  anthropicModel: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-5',
  coachAiEnabled: bool(process.env.COACH_AI_ENABLED, true),
  seedOnBoot: bool(process.env.SEED_ON_BOOT, false),
} as const;

export const isTest = config.env === 'test';
