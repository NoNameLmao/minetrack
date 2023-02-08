const App = require('./lib/app')
const ServerRegistration = require('./lib/servers')
const logger = require('./lib/logger')
const config = require('./config')
const servers = require('./servers')
const tx2 = require('tx2')
const app = new App()
servers.forEach((serverIP, serverId) => {
    let hash = 0
    let server
    if (!serverIP.includes('/')) {
        server = {
            name: serverIP,
            ip: serverIP,
            type: 'PC'
        }
    } else {
        server = {
            name: serverIP.split('/')[0],
            ip: serverIP.split('/')[0],
            type: serverIP.split('/')[1]
        }
    }
    for (let i = server.name.length - 1; i >= 0; i--) hash = server.name.charCodeAt(i) + ((hash << 5) - hash)
    const color = Math.floor(Math.abs((Math.sin(hash) * 10000) % 1 * 16777216)).toString(16)
    server.color = '#' + Array(6 - color.length + 1).join('0') + color
    app.serverRegistrations.push(new ServerRegistration(app, serverId, server))
})
tx2.metric({
    name: 'Total Servers',
    value: app.serverRegistrations.length
})
if (!config.serverGraphDuration) {
    logger.log('warn', '"serverGraphDuration" is not defined in config.json - defaulting to 3 minutes!')
    config.serverGraphDuration = 3 * 60 * 10000
}
if (!config.logToDatabase) {
    logger.log('warn', 'Database logging is not enabled. You can enable it by setting "logToDatabase" to true in config.json. This requires sqlite3 to be installed.')
    app.handleReady()
} else {
    app.loadDatabase(() => {
        app.handleReady()
    })
}
