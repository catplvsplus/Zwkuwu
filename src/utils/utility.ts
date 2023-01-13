import { RecipleClient } from 'reciple';
import { BaseModule } from '../BaseModule.js';
import { Config, defaultconfig } from './config.js';

export class Utility extends BaseModule {
    public client!: RecipleClient<true>;
    public config: Config = defaultconfig;

    get logger() { return this.client.logger; }
    get user() { return this.client.user; }

    public async onStart(client: RecipleClient<boolean>): Promise<boolean> {
        this.client = client;

        return true;
    }
}

export default new Utility();