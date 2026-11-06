import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { ZodError } from 'zod';
import { config } from './config';
import { requireAuth } from './auth';
import { HttpError } from './util';
import { groupsRouter } from './routes/groups';
import { examsRouter } from './routes/exams';
import { attemptsRouter } from './routes/attempts';

const app = express();
app.set('trust proxy', 1); // Render sits behind a proxy
app.use(helmet());
app.use(cors({ origin: config.CORS_ORIGINS.split(',').map((s) => s.trim()), credentials: false }));
app.use(express.json({ limit: '30mb' })); // handwritten-answer photos arrive as base64
app.use(rateLimit({ windowMs: 60_000, limit: 240, standardHeaders: true, legacyHeaders: false }));

app.get('/health', (_req, res) => res.json({ ok: true }));

app.use('/api', requireAuth);
app.use('/api/groups', groupsRouter);
app.use('/api', examsRouter);
app.use('/api', attemptsRouter);

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof ZodError) return res.status(400).json({ error: err.issues[0]?.message ?? 'Yanlış məlumat' });
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  if (err?.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'Fayl 10 MB-dan böyükdür' });
  if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'Şəkillər çox böyükdür' });
  console.error(err?.message ?? err);
  res.status(500).json({ error: 'Server xətası' });
});

app.listen(config.PORT, () => console.log(`API listening on :${config.PORT}`));
