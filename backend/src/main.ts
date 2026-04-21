import { ValidationPipe } from '@nestjs/common';
import 'dotenv/config';
import { json, urlencoded, type NextFunction, type Request, type Response } from 'express';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import configuration from './config/configuration';

async function bootstrap() {
  const cfg = configuration();
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // CORS must be enabled before static middleware so `/kaizen-files/*` responses include ACAO headers.
  app.enableCors({ origin: true });
  // Rendered-slide exports send large base64 payloads; default Express JSON limit is too small.
  app.use(json({ limit: '50mb' }));
  app.use(urlencoded({ extended: true, limit: '50mb' }));

  // `express.static` responses still need explicit ACAO headers for browser `fetch()` downloads from Vite.
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (!req.path.startsWith('/kaizen-files/')) return next();

    const origin = String(req.headers.origin || '');
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader(
        'Access-Control-Allow-Headers',
        'Authorization, Content-Type, Accept, X-Requested-With',
      );
      res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition, Content-Type, Content-Length');
    }

    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,OPTIONS');
      return res.status(204).end();
    }

    return next();
  });

  app.useStaticAssets(cfg.uploadRoot, { prefix: '/kaizen-files/' });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  await app.listen(cfg.port);
}
void bootstrap();
