export interface Config {
    site: {
        port: number,
        ip: string
    },
    rates: {
        pingAll: number,
        connectTimeout: number
    },
    oldPingsCleanup: {
        enabled: boolean,
        interval: number
    },
    logFailedPings: boolean,
    logToDatabase: boolean,
    graphDuration: number,
    serverGraphDuration: number,
    skipSrvTimeout: number
}
export interface MinecraftVersionNames {
    [version: string]: string
}
