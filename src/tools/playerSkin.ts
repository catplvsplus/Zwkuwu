import { Collection } from 'discord.js';
import { RecipleClient } from 'reciple';
import BaseModule from '../BaseModule';
import { RawSkinData, SkinData } from './PlayerSkin/SkinData';
import util from './util';

export class PlayerSkinModule extends BaseModule {
    public cache: Collection<string, SkinData> = new Collection();

    public async onStart(client: RecipleClient<boolean>): Promise<boolean> {
        return true;
    }

    public async resolveSkinData(player: string): Promise<SkinData|undefined> {
        return this.cache.get(player) ?? this.fetchSkinData(player);
    }

    public async fetchSkinData(filter: string|Partial<RawSkinData>, cache: boolean = true): Promise<SkinData|undefined> {
        const data = await util.prisma.playerSkinData.findFirst({
            where: typeof filter === 'string'
                ? { player: filter }
                : filter
        });

        if (!data) return undefined;

        const skinData = new SkinData(this, data);
        if (cache) this.cache.set(skinData.player, skinData);

        return skinData;
    }

    public async createSkinData(data: RawSkinData): Promise<SkinData> {
        return new SkinData(this, await util.prisma.playerSkinData.create({ data }));
    }
}

export default new PlayerSkinModule();