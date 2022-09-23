import { TTScraper as TikTok } from 'tiktok-scraper-ts';
import { RecipleClient } from 'reciple';
import BaseModule from '../BaseModule';
import { replaceAll } from 'fallout-utility';
import util from '../tools/util';
import { EmbedBuilder } from 'discord.js';

export class TikTokScraperModule extends BaseModule {
    public scraper: TikTok = new TikTok();

    public async onStart(client: RecipleClient<boolean>): Promise<boolean> {
        client.on('messageCreate', async message => {
            if (!message.inGuild() || message.author.bot || message.author.system) return;

            const content = replaceAll(message.content, '\n', ' ').split(' ').filter(x => TikTokScraperModule.isTikTokDomain(x.trim()));
            if (!content.length) return;

            await message.channel.sendTyping().catch(() => {});

            const video = await this.scraper.video(content[0]).catch(() => null);

            if (!video) {
                client.logger.error(`An error occured while trying to fetch TikTok URL: ${content[0]}`);
                return;
            }

            const embed = new EmbedBuilder()
                .setAuthor({ name: video?.author ? `@${video?.author}` : 'Unknown Author' })
                .setDescription(video.description ? TikTokScraperModule.formatDescription(video.description) : ' ')
                .setFooter({ text: `💬 ${util.formatNumber(video.commentCount ?? 0)}  💖 ${util.formatNumber(video.likesCount ?? 0)}  👀 ${util.formatNumber(video.playCount ?? 0)}` })
                .setURL(video.downloadURL)
                .setColor(util.embedColor);

            const reply = await message.channel.send({
                content: `sent by **${message.author.tag}**`,
                embeds: [embed, ...(content.length > 1 ? [util.smallEmbed('You can only send one TikTok URL in a single message')] : [])],
                files: [
                    {
                        attachment: video.downloadURL,
                        name: video.id + '.' + video.format
                    }
                ]
            }).catch(() => null);

            if (reply) await message.suppressEmbeds().catch(() => null);
        });

        return true;
    }

    public static isTikTokDomain(url: string): boolean {
        return url.includes('tiktok.com') && url.includes('/video/') && !url.includes('vm.');
    }

    public static formatDescription(description: string): string {
        description = description.replace(/\B@\w+/g, '[`$&`](https://tiktok.com/$&)');
        description = description.replace(/\B#\w+/g, '`$&`');

        return description;
    }
}

export default new TikTokScraperModule();