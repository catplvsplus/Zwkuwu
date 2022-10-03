import { RecipleClient } from 'reciple';
import BaseModule from '../BaseModule';

export class ZombieConnectionHandlerModule extends BaseModule {
    public lastPing: number = 0;
    public checkInterval: number = 50000;
    public timer?: NodeJS.Timer;

    public async onStart(client: RecipleClient<boolean>): Promise<boolean> {
        return true;
    }

    public async onLoad(client: RecipleClient<boolean>): Promise<void> {
        this.timer = setInterval(() => this.checkLastPing(client), this.checkInterval);
    }

    public checkLastPing(client: RecipleClient<boolean>): number {
        if (client.ws.ping === this.lastPing) {
            client.logger.error(`Exiting process! Client ws ping is a zombie connection.`);
            process.exit(1);
        }

        this.lastPing = client.ws.ping;
        return this.lastPing;
    }
}

export default new ZombieConnectionHandlerModule();