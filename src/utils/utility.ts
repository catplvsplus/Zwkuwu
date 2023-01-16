import { RecipleClient, cwd } from 'reciple';
import { Config, defaultconfig } from '../Config.js';
import { BaseModule } from '../BaseModule.js';
import { createLogger } from 'reciple';
import { PrismaClient } from '@prisma/client';
import { createReadFile, path } from 'fallout-utility';
import yml from 'yaml';
import lodash from 'lodash';
import { Collection, EmbedBuilder } from 'discord.js';
import { writeFileSync } from 'fs';

const { defaultsDeep } = lodash;

export type Logger = ReturnType<typeof createLogger>;

export class Utility extends BaseModule {
    public client!: RecipleClient<true>;
    public config: Config = defaultconfig;
    public prisma: PrismaClient = new PrismaClient();
    public logger!: Logger;

    get user() { return this.client.user; }

    public async onStart(client: RecipleClient<boolean>): Promise<boolean> {
        this.client = client;
        this.logger = client.logger.cloneLogger({ loggerName: 'Utility' });
        this.config = createReadFile(path.join(cwd, 'config/config.yml'), defaultconfig, {
            encodeFileData: data => yml.stringify(data),
            formatReadData: data => {
                const config: Config = defaultsDeep(yml.parse(data.toString()), defaultconfig);
                writeFileSync(path.join(cwd, 'config/config.yml'), yml.stringify(config));
                return config;
            }
        });

        this.logger.log('Config loaded:', this.config);

        return true;
    }

    public createSmallEmbed(content: string, options?: { useDescription?: true; positive?: boolean }|{ useDescription?: false; positive?: boolean; disableAvatar?: boolean; }): EmbedBuilder {
        const embed = new EmbedBuilder().setColor(options?.positive === false ? this.config.errorEmbedColor : this.config.embedColor);

        if (options?.useDescription === true) {
            embed.setDescription(content);
        } else {
            embed.setAuthor({ name: content, iconURL: (options as { disableAvatar?: boolean; })?.disableAvatar ? undefined : this.user.displayAvatarURL() })
        }

        return embed;
    }

    public async resolveFromCachedManager<V>(id: string, manager: { cache: Collection<string, V>; fetch(key: string): Promise<V> }): Promise<V> {
        return manager.cache.get(id) ?? manager.fetch(id);
    }

    public formatNumber(number: number): string {
        if (number >= 1000000000) return (number / 1000000000).toFixed(1).replace(/\.0$/, '') + 'B';
        if (number >= 1000000) return (number / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
        if (number >= 1000) return (number / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
        return String(number);
    }

    public isValidIP(ip: string): boolean {
        return /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(ip);
    }
}

export default new Utility();