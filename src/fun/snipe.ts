import { Collection, EmbedBuilder, Message, TextBasedChannel, User } from 'discord.js';
import { Logger } from 'fallout-utility';
import { MessageCommandBuilder, RecipleClient, SlashCommandBuilder } from 'reciple';
import BaseModule from '../BaseModule';
import util from '../tools/util';
import { RawSnipedMessage, SnipedMessage } from './Snipe/SnipedMessage';

export class SnipeModule extends BaseModule {
    public cache: Collection<string, SnipedMessage> = new Collection();
    public logger!: Logger;

    public async onStart(client: RecipleClient<boolean>): Promise<boolean> {
        this.logger = client.logger.cloneLogger({ loggerName: 'MessageSniper' });
        this.commands = [
            new SlashCommandBuilder()
                .setName('snipe')
                .setDescription('Snipe recently deleted message')
                .setExecute(async data => {
                    const interaction = data.interaction;
                    if (!interaction.channel) return;

                    await interaction.reply({
                        embeds: [
                            await this.snipe(interaction.channel, interaction.user)
                        ]
                    });
                }),
            new MessageCommandBuilder()
                .setName('snipe')
                .setDescription('Snipe recently deleted message')
                .setExecute(async data => {
                    const message = data.message;

                    await message.reply({
                        embeds: [
                            await this.snipe(message.channel, message.author)
                        ]
                    });
                })
        ];

        return true;
    }

    public async onLoad(client: RecipleClient<boolean>): Promise<void> {
        client.on('messageDelete', async message => {
            if (!message.content && !message.editedAt && !message.attachments.size) return;
            if (!message.inGuild() || message.author.bot || message.author.system) return;

            await this.snipeMessage(message).catch(err => this.logger.err(err));
        });

        client.on('cacheSweep', () => {
            this.cache.sweep(s => s.deleted);
        });
    }

    public async snipe(channel: TextBasedChannel, sniper?: User): Promise<EmbedBuilder> {
        const snipedMessage = await this.fetchSnipedMessage({ channelId: channel.id });
        if (!snipedMessage) return util.smallEmbed(`No snipes found in this channel`);

        const embed = snipedMessage.toEmbed();
        if (sniper) embed.setFooter({ text: `Sniped by ${sniper.tag}`, iconURL: sniper.displayAvatarURL() });

        await snipedMessage.delete();
        return embed;
    }

    public async resolveSnipedMessage(id: string): Promise<SnipedMessage<true>|undefined> {
        return this.cache.get(id) ?? this.fetchSnipedMessage(id);
    }

    public async fetchSnipedMessage(filter: string|Partial<RawSnipedMessage>, cache: boolean = true): Promise<SnipedMessage<true>|undefined> {
        const find = await util.prisma.snipes.findFirst({
            where: typeof filter === 'string'
                ? { id: filter }
                : filter,
            orderBy: {
                createdAt: `desc`
            },
        });

        if (!find) return undefined;
        const snipedMessage = await (new SnipedMessage(this, find)).fetch();

        if (cache) this.cache.set(snipedMessage.id, snipedMessage);
        return snipedMessage;
    }

    public async snipeMessage(message: Message): Promise<SnipedMessage<true>> {
        const snipeData: RawSnipedMessage = {
            id: message.id,
            authorId: message.author.id,
            channelId: message.channel.id,
            content: message.content,
            attachments: message.attachments.size,
            repliedToUserId: message.reference ? (await message.fetchReference()).author.id : null,
            edited: !!message.editedAt,
            createdAt: message.createdAt,
        };

        await util.prisma.snipes.create({ data: snipeData });
        return (await this.fetchSnipedMessage(message.id))!;
    }
}

export default new SnipeModule();