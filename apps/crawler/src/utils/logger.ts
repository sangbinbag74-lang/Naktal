type LogLevel = "info" | "warn" | "error";

function formatMessage(level: LogLevel, message: string): string {
  const timestamp = new Date().toISOString();
  return `[${timestamp}] [${level.toUpperCase()}] ${message}`;
}

export const logger = {
  info(message: string): void {
    console.error(formatMessage("info", message));
  },
  warn(message: string): void {
    console.error(formatMessage("warn", message));
  },
  error(message: string, err?: unknown): void {
    const errMsg = err instanceof Error ? ` | ${err.message}` : "";
    console.error(formatMessage("error", message + errMsg));
  },
};
