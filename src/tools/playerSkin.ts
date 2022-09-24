import { Collection } from 'discord.js';
import { Logger } from 'fallout-utility';
import { cwd, RecipleClient } from 'reciple';
import BaseModule from '../BaseModule';
import { RawSkinData, SkinData } from './PlayerSkin/SkinData';
import express, { Express } from 'express';
import util from './util';
import yml from 'yaml';
import createConfig from '../_createConfig';
import path from 'path';

export interface PlayerSkinModuleConfig {
    port: string;
    routes: {
        head: string;
        skin: string;
    }
}

export class PlayerSkinModule extends BaseModule {
    public config: PlayerSkinModuleConfig = PlayerSkinModule.getConfig();
    public cache: Collection<string, SkinData> = new Collection();
    public logger!: Logger;
    public server: Express = express();

    public async onStart(client: RecipleClient<boolean>): Promise<boolean> {
        this.logger = client.logger.cloneLogger({ loggerName: 'PlayerSkinModule' });

        this.server.listen(this.config.port || process.env.PORT, () => this.logger.warn('Server is listening on port ' + (this.config.port || process.env.PORT)));
        this.server.get(path.join('/', this.config.routes.head, ':player'), async (req, res) => {
            res.send('WTF');
        });
        this.server.get(path.join('/', this.config.routes.skin, ':player'), async (req, res) => {
            res.send('WTF');
        });

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

    public static getConfig(): PlayerSkinModuleConfig {
        return yml.parse(createConfig(path.join(cwd, 'config/playerSkinData/config.yml'), <PlayerSkinModuleConfig>({
            port: '',
            routes: {
                head: '/head',
                skin: '/skin'
            }
        })));
    }
}

export default new PlayerSkinModule();