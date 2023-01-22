import { RecipleClient } from 'reciple';
import { BaseModule } from '../BaseModule.js';
import { HiddenPlayer } from './HiddenPlayer/HiddenPlayer.js';

export class HiddenPlayerModule extends BaseModule {
    public async onStart(client: RecipleClient<boolean>): Promise<boolean> {
        return true;
    }

    public async onLoad(client: RecipleClient<boolean>): Promise<void> {
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
    }
}

export default new HiddenPlayerModule();