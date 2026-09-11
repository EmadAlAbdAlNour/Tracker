import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import router from "./routes";
import { logger } from "./lib/logger";
import { sendErrorResponse } from "./lib/errors";

const app: Express = express();
app.set("trust proxy", 1);

const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: "RATE_LIMITED", message: "Too many requests" } },
  keyGenerator: (req) => ipKeyGenerator(req.ip ?? "unknown"),
});

const locationRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: "RATE_LIMITED", message: "Location tracking rate limit exceeded" } },
  keyGenerator: (req) => ipKeyGenerator(req.ip ?? "unknown"),
});

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.disable("x-powered-by");
const corsAllowed = process.env.CORS_ALLOWED_ORIGINS?.split(',').map(s => s.trim()).filter(Boolean) ?? [];

// Log CORS configuration (public information only; no secrets logged)
if (corsAllowed.length > 0) {
  logger.info(`CORS configured with ${corsAllowed.length} allowed origins`);
} else {
  logger.warn('CORS_ALLOWED_ORIGINS not configured; browser requests will be rejected by default');
}

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g., mobile apps, curl, server-to-server)
      if (!origin) return callback(null, true);
      // If no origins configured, deny browser access by default (return false, not error)
      if (corsAllowed.length === 0) return callback(null, false);
      if (corsAllowed.includes(origin)) return callback(null, true);
      return callback(null, false);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  }),
);
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use("/api/auth", authRateLimit);
app.use("/api/drivers", locationRateLimit);
app.use("/api", router);

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (error && typeof error === "object" && "statusCode" in error && "code" in error && "message" in error) {
    return sendErrorResponse(res, error as { statusCode?: number; code?: string; message?: string; details?: unknown });
  }

  console.error(error);
  return sendErrorResponse(res, { statusCode: 500, code: "INTERNAL_SERVER_ERROR", message: "Internal server error" });
});

export default app;
