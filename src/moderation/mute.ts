import { Logger } from 'fallout-utility';
import { RecipleClient } from 'reciple';
import BaseModule from '../BaseModule';

export class MuteModule extends BaseModule {
    public logger!: Logger;

    public async onStart(client: RecipleClient<boolean>): Promise<boolean> {
        this.logger = client.logger.cloneLogger({ loggerName: 'MuteModule' });

        return true;
    }
}