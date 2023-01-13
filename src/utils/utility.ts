import { RecipleClient } from 'reciple';
import { Config, defaultconfig } from '../Config.js';
import { BaseModule } from '../BaseModule.js';

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