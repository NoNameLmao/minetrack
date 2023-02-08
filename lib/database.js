const sqlite = require('sqlite3')
const logger = require('./logger')
const config = require('../config')
const { TimeTracker } = require('./time')
class Database {
    constructor(app) {
        this._app = app
        this._sql = new sqlite.Database('database.sql')
    }
    getDailyDatabase() {
        if (!config.createDailyDatabaseCopy) return
        const date = new Date()
        const fileName = `database_copy_${date.getDate()}-${date.getMonth() + 1}-${date.getFullYear()}.sql`
        if (fileName !== this._currentDatabaseCopyFileName) {
            if (this._currentDatabaseCopyInstance) this._currentDatabaseCopyInstance.close()
            this._currentDatabaseCopyInstance = new sqlite.Database(fileName)
            this._currentDatabaseCopyFileName = fileName
            this._currentDatabaseCopyInstance.serialize(() => {
                this._currentDatabaseCopyInstance.run('CREATE TABLE IF NOT EXISTS pings (timestamp BIGINT NOT NULL, ip TINYTEXT, playerCount MEDIUMINT)', err => {
                    if (err) {
                        logger.log('error', 'Cannot create initial table for daily database')
                        throw err
                    }
                })
            })
        }
        return this._currentDatabaseCopyInstance
    }
    ensureIndexes(callback) {
        const handleError = err => {
            if (err) {
                logger.log('error', 'Cannot create table or table index')
                throw err
            }
        }
        this._sql.serialize(() => {
            this._sql.run('CREATE TABLE IF NOT EXISTS pings (timestamp BIGINT NOT NULL, ip TINYTEXT, playerCount MEDIUMINT)', handleError)
            this._sql.run('CREATE TABLE IF NOT EXISTS players_record (timestamp BIGINT, ip TINYTEXT NOT NULL PRIMARY KEY, playerCount MEDIUMINT)', handleError)
            this._sql.run('CREATE INDEX IF NOT EXISTS ip_index ON pings (ip, playerCount)', handleError)
            this._sql.run('CREATE INDEX IF NOT EXISTS timestamp_index on PINGS (timestamp)', [], err => {
                handleError(err)
                callback()
            })
        })
    }
    /** @param {number} graphDuration */
    loadGraphPoints(graphDuration, callback) {
        const endTime = TimeTracker.getEpochMillis()
        const startTime = endTime - graphDuration
        this.getRecentPings(startTime, endTime, pingData => {
            const relativeGraphData = []
            for (const row of pingData) {
                let graphData = relativeGraphData[row.ip]
                if (!graphData) relativeGraphData[row.ip] = graphData = [[], []]
                graphData[0].push(row.timestamp)
                graphData[1].push(row.playerCount)
            }
            Object.keys(relativeGraphData).forEach(ip => {
                for (const serverRegistration of this._app.serverRegistrations) {
                    if (serverRegistration.data.ip === ip) {
                        const graphData = relativeGraphData[ip]
                        serverRegistration.loadGraphPoints(startTime, graphData[0], graphData[1])
                        break
                    }
                }
            })
            if (Object.keys(relativeGraphData).length > 0) {
                const serverIp = Object.keys(relativeGraphData)[0]
                const timestamps = relativeGraphData[serverIp][0]
                this._app.timeTracker.loadGraphPoints(startTime, timestamps)
            }
            callback()
        })
    }
    loadRecords(callback) {
        let completedTasks = 0
        this._app.serverRegistrations.forEach(serverRegistration => {
            serverRegistration.findNewGraphPeak()
            this.getRecord(serverRegistration.data.ip, (hasRecord, playerCount, timestamp) => {
                if (hasRecord) {
                    serverRegistration.recordData = {
                        playerCount,
                        timestamp: TimeTracker.toSeconds(timestamp)
                    }
                } else {
                    this.getRecordLegacy(serverRegistration.data.ip, (hasRecordLegacy, playerCountLegacy, timestampLegacy) => {
                        let newTimestamp = null
                        let newPlayerCount = null
                        if (hasRecordLegacy) {
                            newTimestamp = timestampLegacy
                            newPlayerCount = playerCountLegacy
                        }
                        serverRegistration.recordData = {
                            playerCount: newPlayerCount,
                            timestamp: TimeTracker.toSeconds(newTimestamp)
                        }
                        const statement = this._sql.prepare('INSERT INTO players_record (timestamp, ip, playerCount) VALUES (?, ?, ?)')
                        statement.run(newTimestamp, serverRegistration.data.ip, newPlayerCount, err => {
                            if (err) {
                                logger.error(`Cannot insert initial player count record of ${serverRegistration.data.ip}`)
                                throw err
                            }
                        })
                        statement.finalize()
                    })
                }
                if (++completedTasks === this._app.serverRegistrations.length) callback()
            })
        })
    }
    getRecentPings(startTime, endTime, callback) {
        this._sql.all('SELECT * FROM pings WHERE timestamp >= ? AND timestamp <= ?', [
            startTime,
            endTime
        ], (err, data) => {
            if (err) {
                logger.log('error', 'Cannot get recent pings')
                throw err
            }
            callback(data)
        })
    }
    getRecord(ip, callback) {
        this._sql.all('SELECT playerCount, timestamp FROM players_record WHERE ip = ?', [
            ip
        ], (err, data) => {
            if (err) {
                logger.log('error', `Cannot get ping record for ${ip}`)
                throw err
            }
            if (data[0] === undefined) {
                callback(false)
                return
            }
            const playerCount = data[0].playerCount
            const timestamp = data[0].timestamp
            callback(true, playerCount, timestamp)
        })
    }
    getRecordLegacy(ip, callback) {
        this._sql.all('SELECT MAX(playerCount), timestamp FROM pings WHERE ip = ?', [
            ip
        ], (err, data) => {
            if (err) {
                logger.log('error', `Cannot get legacy ping record for ${ip}`)
                throw err
            }
            const playerCount = data[0]['MAX(playerCount)']
            const timestamp = data[0].timestamp
            if (playerCount !== null) callback(true, playerCount, timestamp)
            else callback(false)
        })
    }
    insertPing(ip, timestamp, unsafePlayerCount) {
        this._insertPingTo(ip, timestamp, unsafePlayerCount, this._sql)
        const dailyDatabase = this.getDailyDatabase()
        if (dailyDatabase) {
            this._insertPingTo(ip, timestamp, unsafePlayerCount, dailyDatabase)
        }
    }
    _insertPingTo(ip, timestamp, unsafePlayerCount, db) {
        const statement = db.prepare('INSERT INTO pings (timestamp, ip, playerCount) VALUES (?, ?, ?)')
        statement.run(timestamp, ip, unsafePlayerCount, err => {
            if (err) {
                logger.error(`Cannot insert ping record of ${ip} at ${timestamp}`)
                throw err
            }
        })
        statement.finalize()
    }
    updatePlayerCountRecord(ip, playerCount, timestamp) {
        const statement = this._sql.prepare('UPDATE players_record SET timestamp = ?, playerCount = ? WHERE ip = ?')
        statement.run(timestamp, playerCount, ip, err => {
            if (err) {
                logger.error(`Cannot update player count record of ${ip} at ${timestamp}`)
                throw err
            }
        })
        statement.finalize()
    }
    initOldPingsDelete(callback) {
        logger.info('Deleting old pings..')
        this.deleteOldPings(() => {
            const oldPingsCleanupInterval = config.oldPingsCleanup.interval || 3600000
            if (oldPingsCleanupInterval > 0) setInterval(() => this.deleteOldPings(), oldPingsCleanupInterval)
            callback()
        })
    }
    deleteOldPings(callback) {
        const oldestTimestamp = TimeTracker.getEpochMillis() - config.graphDuration
        const deleteStart = TimeTracker.getEpochMillis()
        const statement = this._sql.prepare('DELETE FROM pings WHERE timestamp < ?;')
        statement.run(oldestTimestamp, err => {
            if (err) {
                logger.error('Cannot delete old pings')
                throw err
            } else {
                const deleteTook = TimeTracker.getEpochMillis() - deleteStart
                logger.info(`Old pings deleted in ${deleteTook}ms`)
                if (callback) callback()
            }
        })
        statement.finalize()
    }
}
module.exports = Database
