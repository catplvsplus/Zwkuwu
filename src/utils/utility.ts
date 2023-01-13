import { RecipleClient, cwd } from 'reciple';
import { Config, defaultconfig } from '../Config.js';
import { BaseModule } from '../BaseModule.js';
import { createLogger } from 'reciple';
import { PrismaClient } from '@prisma/client';
import { createReadFile, path } from 'fallout-utility';
import yml from 'yaml';
import lodash from 'lodash';
import { Collection, EmbedBuilder } from 'discord.js';

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
            formatReadData: data => defaultsDeep(yml.parse(data.toString()), defaultconfig)
        });

        this.logger.log('Config loaded:', this.config);

        return true;
    }

    public createSmallEmbed(content: string, options?: { useDescription?: true; }|{ useDescription?: false; disableAvatar?: boolean; }): EmbedBuilder {
        const embed = new EmbedBuilder().setColor(this.config.embedColor);

        if (options?.useDescription === true) {
            embed.setDescription(content);
        } else {
            embed.setAuthor({ name: content, iconURL: (options as { disableAvatar?: boolean; })?.disableAvatar ? this.user.displayAvatarURL() : undefined })
        }

        return embed;
    }

    public async resolveFromCachedManager<V>(id: string, manager: { cache: Collection<string, V>; fetch(key: string): Promise<V> }): Promise<V> {
        return manager.cache.get(id) ?? manager.fetch(id);
    }
}

export default new Utility();