// Logger only outputs in development.

type ConsoleMethod = 'log' | 'warn' | 'error' | 'table' | 'time' | 'timeEnd' | 'timeLog';

const isDev = process.env.NODE_ENV === 'development';
const noop = () => {};

function bind<K extends ConsoleMethod>(method: K): Console[K] {
    return isDev ? (console[method].bind(console) as Console[K]) : (noop as Console[K]);
}

export const logger = {
    log: bind('log'),
    warn: bind('warn'),
    error: bind('error'),
    table: bind('table'),
    time: bind('time'),
    timeEnd: bind('timeEnd'),
    timeLog: bind('timeLog'),
};
