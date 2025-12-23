/**
 * Logger will only output for development env only
 */
export default class Logger {
    log: typeof console.log;
    warn: typeof console.warn;
    error: typeof console.error;
    table: typeof console.table;
    time: typeof console.time;
    timeEnd: typeof console.timeEnd;
    timeLog: typeof console.timeLog;

    constructor(env: any) {
        if (env === 'development') {
            // Bind console methods directly to preserve call stack location
            this.log = console.log.bind(console);
            this.warn = console.warn.bind(console);
            this.error = console.error.bind(console);
            this.table = console.table.bind(console);
            this.time = console.time.bind(console);
            this.timeEnd = console.timeEnd.bind(console);
            this.timeLog = console.timeLog.bind(console);
        } else {
            // No-op functions for non-development
            this.log = () => {};
            this.warn = () => {};
            this.error = () => {};
            this.table = () => {};
            this.time = () => {};
            this.timeEnd = () => {};
            this.timeLog = () => {};
        }
    }
}

export const logger = new Logger(process.env.NODE_ENV);
