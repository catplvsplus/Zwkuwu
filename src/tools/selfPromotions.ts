import { Collection } from 'discord.js';
import { RecipleClient } from 'reciple';
import BaseModule from '../BaseModule';
import { SelfPromotion } from './SelfPromotions/SelfPromotion';

export class SelfPromotionsModule extends BaseModule {
    public cache: Collection<string, SelfPromotion> = new Collection();

    public async onStart(client: RecipleClient<boolean>): Promise<boolean> {
        return true;
    }
}