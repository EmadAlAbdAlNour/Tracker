import app from "./app";
import { logger } from "./lib/logger";
import { getEnv } from "./config/env";

const env = getEnv();

app.listen(env.port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port: env.port }, "Server listening");
});
