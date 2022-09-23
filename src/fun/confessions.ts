import { Collection } from 'discord.js';
import { RecipleClient } from 'reciple';
import BaseModule from '../BaseModule';
import { Confession } from './Confessions/Confession';

export class ConfessionsModule extends BaseModule {
    public cache: Collection<string, Confession> = new Collection();

    public async onStart(client: RecipleClient<boolean>): Promise<boolean> {
        return true;
    }
}

export default new ConfessionsModule();