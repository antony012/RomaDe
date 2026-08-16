import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import express from 'express';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/setup-app';

const expressApp = express();
let ready: Promise<void> | null = null;

function ensureApp(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      const app = await NestFactory.create(
        AppModule,
        new ExpressAdapter(expressApp),
      );
      setupApp(app);
      await app.init();
    })();
  }
  return ready;
}

export default async function handler(
  req: express.Request,
  res: express.Response,
): Promise<void> {
  await ensureApp();
  expressApp(req, res);
}
