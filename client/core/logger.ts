export default class Logger {
    env: string;

    constructor(env: any) {
        this.env = env;
    }

    log(...args: any) {
        if (this.env === 'development') {
            console.log(...args);
        }
    }
    warn(...args: any) {
        if (this.env === 'development') {
            console.warn(...args);
        }
    }

    error(...args: any) {
        if (this.env === 'development') {
            console.error(...args);
        }
    }
}

export const logger = new Logger(process.env.NODE_ENV);
