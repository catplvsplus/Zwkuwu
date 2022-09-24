import { Collection } from 'discord.js';
import { Logger } from 'fallout-utility';
import { cwd, RecipleClient } from 'reciple';
import BaseModule from '../BaseModule';
import { RawSkinData, SkinData } from './PlayerSkin/SkinData';
import express, { Express, Response } from 'express';
import util from './util';
import yml from 'yaml';
import createConfig from '../_createConfig';
import path from 'path';
import axios from 'axios';
import { mkdirSync, readFileSync } from 'fs';

export interface PlayerSkinModuleConfig {
    port: string;
    fallbackSkin: string;
    routes: {
        head: string;
        skin: string;
    }
}

export class PlayerSkinModule extends BaseModule {
    public config: PlayerSkinModuleConfig = PlayerSkinModule.getConfig();
    public cache: Collection<string, SkinData> = new Collection();
    public fallbackSkin?: Buffer;
    public logger!: Logger;
    public server: Express = express();

    public async onStart(client: RecipleClient<boolean>): Promise<boolean> {
        this.logger = client.logger.cloneLogger({ loggerName: 'PlayerSkinModule' });

        await this.readFallbackSkin();

        this.server.listen(this.config.port || process.env.PORT, () => this.logger.warn('Server is listening on port ' + (this.config.port || process.env.PORT)));
        this.server.get(path.join('/', this.config.routes.head, ':player/:scale?') as `${string}:player/:scale?`, async (req, res) => {
            const player: SkinData|undefined = await this.resolveSkinData(req.params.player);
            const scale = !isNaN(Number(req.params.scale)) ? Number(req.params.scale) : 1;
            if (scale > 300) return res.status(403).send({ error: 'Maximum scale exceeded' });
            if (!player) return this.sendSkin(res, true);

            return this.sendSkin(res, true, player.hasSkin() ? { buffer: await player.getHead(scale), file: player.file } : undefined);
        });

        this.server.get(path.join('/', this.config.routes.skin, ':player') as `${string}:player`, async (req, res) => {
            const player: SkinData|undefined = await this.resolveSkinData(req.params.player);

            if (!player) return this.sendSkin(res);

            return this.sendSkin(res, false, player.hasSkin() ? { buffer: readFileSync(player.filePath), file: player.file } : undefined);
        });

        return true;
    }

    public async sendSkin(res: Response, head?: boolean, skin?: { buffer: Buffer; file: string; }): Promise<void> {
        if (!skin) {
            if (this.fallbackSkin) {
                res.contentType('image/png');
                res.set('Content-Disposition', `inline; filename="steve.png"`);
                res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
                res.send(head ? SkinData.getHead(this.fallbackSkin) : this.fallbackSkin);
                return;
            }

            res.status(404).send({ error: 'No skin data found' });
            return;
        }

        res.contentType('image/png');
        res.set('Content-Disposition', `inline; filename="${skin.file}.png"`);
        res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.send(head ? SkinData.getHead(skin.buffer) : skin.buffer);
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

    public async readFallbackSkin(useCache: boolean = true): Promise<Buffer|null> {
        if (this.fallbackSkin && useCache) return this.fallbackSkin;

        const fileHttp = await axios({ url: this.config.fallbackSkin, method: 'GET', responseType: 'arraybuffer' }).catch(() => null);
        if (!fileHttp) return null;

        const buffer = Buffer.from(fileHttp.data);
        this.fallbackSkin = buffer;

        return this.fallbackSkin;
    }

    public static getConfig(): PlayerSkinModuleConfig {
        mkdirSync(path.join(cwd, 'config/playerSkinData/skins'), { recursive: true });

        return yml.parse(createConfig(path.join(cwd, 'config/playerSkinData/config.yml'), <PlayerSkinModuleConfig>({
            port: '',
            fallbackSkin: 'https://s.namemc.com/i/59e3a240bd150317.png',
            routes: {
                head: '/head',
                skin: '/skin'
            }
        })));
    }
}

export default new PlayerSkinModule();