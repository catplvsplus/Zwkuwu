import { RecipleClient } from 'reciple';
import BaseModule from '../BaseModule';

export class ZombieConnectionHandlerModule extends BaseModule {
    public lastPing: number = -1;
    public checkInterval: number = 10000;
    public maxMatchedPings: number = 8;
    public matchedPings: number = 0;
    public timer?: NodeJS.Timer;

    public async onStart(client: RecipleClient<boolean>): Promise<boolean> {
        return true;
    }

    public async onLoad(client: RecipleClient<boolean>): Promise<void> {
        this.timer = setInterval(() => this.checkLastPing(client), this.checkInterval);
    }

    public checkLastPing(client: RecipleClient<boolean>): number {
        if (client.ws.ping === this.lastPing) {
            this.matchedPings++;

            if (this.matchedPings >= this.maxMatchedPings) {
                client.logger.error(`Exiting process! Client ws ping is a zombie connection.`);
                process.exit(1);
            }
        } else {
            this.matchedPings = 0;
        }

        this.lastPing = client.ws.ping;
        client.logger.debug(`Current ping: ${this.lastPing}; Matched: ${this.matchedPings}/${this.maxMatchedPings}`);

        return this.lastPing;
    }
}

export default new ZombieConnectionHandlerModule();