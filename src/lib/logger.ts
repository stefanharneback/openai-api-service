type LogPayload = Record<string, unknown>;

const formatEntry = (
  level: string,
  message: string,
  data?: LogPayload,
): string => {
  const entry: LogPayload = {
    level,
    msg: message,
    time: new Date().toISOString(),
    ...data,
  };

  return JSON.stringify(entry);
};

export const log = {
  info(message: string, data?: LogPayload): void {
    process.stdout.write(`${formatEntry("info", message, data)}\n`);
  },
  warn(message: string, data?: LogPayload): void {
    process.stdout.write(`${formatEntry("warn", message, data)}\n`);
  },
  error(message: string, data?: LogPayload): void {
    process.stderr.write(`${formatEntry("error", message, data)}\n`);
  },
};
