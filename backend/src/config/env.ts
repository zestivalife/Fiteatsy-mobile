import 'dotenv/config';

export const env = {
  port: Number(process.env.PORT ?? 4001),
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/nuetra',
  openAiApiKey: process.env.OPENAI_API_KEY ?? ''
};
