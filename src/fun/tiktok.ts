import { TTScraper } from 'tiktok-scraper-ts';
import { BaseModule } from '../BaseModule.js';
import utility from '../utils/utility.js';
import { RecipleClient } from 'reciple';
import { replaceAll } from 'fallout-utility';
import { EmbedBuilder } from 'discord.js';

export interface TiktokConfig {
    cookies: string;
}

export class TiktokModule extends BaseModule {
    public tiktokClient: TTScraper = new TTScraper(this.config.cookies || undefined);

    get config() { return utility.config.tiktok; }

    public async onStart(client: RecipleClient<boolean>): Promise<boolean> {
        return true;
    }

    public async onLoad(client: RecipleClient<boolean>): Promise<void> {
        client.on('messageCreate', async message => {
            if (!message.inGuild() || message.author.bot || message.author.system) return;

            const content = replaceAll(message.content, '\n', ' ').split(' ').filter(x => this.isTikTokDomain(x.trim()));
            if (!content.length) return;

            await message.channel.sendTyping().catch(() => {});

            const video = await this.tiktokClient.video(content[0]).catch(() => null);

            if (!video) {
                client.logger.error(`An error occured while trying to fetch TikTok URL: ${content[0]}`);
                return;
            }

            const embed = new EmbedBuilder()
                .setAuthor({ name: video?.author ? `@${video?.author}` : 'Unknown Author' })
                .setDescription(video.description ? this.formatDescription(video.description) : ' ')
                .setFooter({ text: `💬 ${utility.formatNumber(video.commentCount ?? 0)}  💖 ${utility.formatNumber(video.likesCount ?? 0)}  👀 ${utility.formatNumber(video.playCount ?? 0)}` })
                .setURL(video.downloadURL)
                .setColor(utility.config.embedColor);

            const reply = await message.channel.send({
                content: `sent by **${message.author.tag}**`,
                embeds: [embed, ...(content.length > 1 ? [utility.createSmallEmbed('You can only send one TikTok URL in a single message')] : [])],
                files: [
                    {
                        attachment: video.downloadURL,
                        name: `${message.author.id}-${message.id}` + '.' + video.format
                    }
                ]
            }).catch(() => null);

            if (reply) await message.suppressEmbeds().catch(() => null);
        });
    }

    public isTikTokDomain(url: string): boolean {
        return url.includes('tiktok.com') && url.includes('/video/') && !url.includes('vm.');
    }

    public formatDescription(description: string): string {
        let words = description.split(' ');

        words = words.map(word => word.startsWith('@') ? `[\`${word}\`](https://tiktok.com/${word})` : word);
        words = words.map(word => word.startsWith('#') ? `[\`${word}\`](https://tiktok.com/tag/${word.substring(1)})` : word);

        return words.join(' ').trim();
    }
}

export default new TiktokModule();