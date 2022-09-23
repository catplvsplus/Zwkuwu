import { cwd, RecipleClient } from 'reciple';
import BaseModule from '../BaseModule';
import yml from 'yaml';
import path from 'path';
import createConfig from '../_createConfig';
import { channel } from 'diagnostics_channel';
import { ThreadAutoArchiveDuration } from 'discord.js';

export interface AnnouncementThreadModuleConfig {
    announcementChannels: string[];
    autoArchiveDuration: keyof typeof ThreadAutoArchiveDuration;
    fallbackTitle: string;
    useEmbedAsTitle: boolean;
    ignoreBots: boolean;
}

export class AnnouncementThreadModule extends BaseModule {
    public config: AnnouncementThreadModuleConfig = AnnouncementThreadModule.getConfig();

    public async onStart(client: RecipleClient<boolean>): Promise<boolean> {
        client.on('messageCreate', async message => {
            if (!this.config.announcementChannels.includes(message.channel.id) || this.config.ignoreBots && (message.author.bot || message.author.system)) return;

            const title = (message.embeds.length ? message.embeds[0].title : null) || this.config.fallbackTitle;

            await message.startThread({
                name: title,
                autoArchiveDuration: ThreadAutoArchiveDuration[this.config.autoArchiveDuration],
                reason: `Announcement thread`
            });
        });

        return true;
    }

    public static getConfig(): AnnouncementThreadModuleConfig {
        return yml.parse(createConfig(path.join(cwd, 'config/announcementThread/config.yml'), <AnnouncementThreadModuleConfig>({
            announcementChannels: ['0000000000000000000', '0000000000000000000', '0000000000000000000'],
            autoArchiveDuration: 'ThreeDays',
            fallbackTitle: 'Announcement',
            useEmbedAsTitle: true,
            ignoreBots: false
        })))
    }
}

export default new AnnouncementThreadModule();