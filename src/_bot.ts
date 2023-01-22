import { HiddenPlayer } from './utils/HiddenPlayer/HiddenPlayer.js';

const bot = new HiddenPlayer({
    host: 'ourworld6.aternos.me',
    port: 40655,
    authentication: {
        type: 'Offline',
        username: 'HiddenPlayer'
    },
    leaveIfNotEmpty: {
        enabled: true,
        pingInterval: 5000
    },
    reconnect: {
        enabled: true,
        reconnectTimeout: 5000
    },
    firstMessages: {
        messages: ['/register someoneyouknow someoneyouknow', '/login someoneyouknow'],
        messageTimeout: 5000
    },
    version: '1.18'
});

await bot.login();