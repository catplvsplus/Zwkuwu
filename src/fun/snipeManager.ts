import { ActionRowBuilder, ButtonBuilder, ButtonStyle, Collection, EmbedBuilder, Message, MessageActionRowComponentBuilder, TextBasedChannel, User } from 'discord.js';
import { MessageCommandBuilder, RecipleClient, SlashCommandBuilder } from 'reciple';
import { RawSnipedMessage, SnipedMessage } from './Snipe/SnipedMessage';
import { InteractionEventType } from '../tools/InteractionEvents';
import { Logger } from 'fallout-utility';
import BaseModule from '../BaseModule';
import util from '../tools/util';
import userSettingsManager from '../tools/userSettingsManager';

export class SnipeManagerModule extends BaseModule {
    public cache: Collection<string, SnipedMessage> = new Collection();
    public logger!: Logger;

    public async onStart(client: RecipleClient<boolean>): Promise<boolean> {
        this.logger = client.logger.cloneLogger({ loggerName: 'MessageSniper' });

        const snipeButton = new ActionRowBuilder<MessageActionRowComponentBuilder>()
            .setComponents(
                new ButtonBuilder()
                    .setCustomId('snipe-message')
                    .setLabel('Snipe')
                    .setStyle(ButtonStyle.Secondary)
            );

        this.commands = [
            new SlashCommandBuilder()
                .setName('snipe')
                .setDescription('Snipe deleted messages')
                .setExecute(async data => {
                    const interaction = data.interaction;
                    if (!interaction.channel) return;

                    await interaction.deferReply();
                    await interaction.editReply({
                        embeds: [
                            await this.snipe(interaction.channel, interaction.user)
                        ],
                        components: [snipeButton]
                    });
                }),
            new MessageCommandBuilder()
                .setName('snipe')
                .setDescription('Snipe deleted messages')
                .setExecute(async data => {
                    const message = data.message;

                    await message.reply({
                        embeds: [
                            await this.snipe(message.channel, message.author)
                        ],
                        components: [snipeButton]
                    });
                })
        ];

        this.interactionEventHandlers = [
            {
                type: InteractionEventType.Button,
                customId: `snipe-message`,
                handle: async interaction => {
                    if (!interaction.isButton() || !interaction.inCachedGuild() || !interaction.channel) return;

                    const message = interaction.message;

                    await interaction.deferReply();
                    await message.edit({ components: [] });

                    await interaction.editReply({
                        embeds: [
                            await this.snipe(interaction.channel, interaction.user)
                        ],
                        components: [snipeButton]
                    });
                }
            }
        ];

        return true;
    }

    public async onLoad(client: RecipleClient<boolean>): Promise<void> {
        client.on('messageDelete', async message => {
            if (!message.content && !message.editedAt && !message.attachments.size) return;
            if (!message.inGuild() || message.author.bot || message.author.system) return;

            const userSettings = await userSettingsManager.getOrCreateUserSettings(message.author.id);

            if (userSettings.allowSniping) await this.snipeMessage(message).catch(err => this.logger.err(err));
        });

        client.on('cacheSweep', () => {
            this.cache.sweep(s => s.deleted);
        });
    }

    public async snipe(channel: TextBasedChannel, sniper: User): Promise<EmbedBuilder> {
        const snipedMessage = await this.fetchSnipedMessage({ channelId: channel.id });
        const userSettings = await userSettingsManager.getOrCreateUserSettings(sniper.id);

        if (!snipedMessage) return util.smallEmbed(`${sniper.tag} ┃ No snipes found in this channel`);
        if (!userSettings.allowSniping) return util.smallEmbed(`${sniper.tag} ┃ Enable message sniping to use this command`);

        const embed = snipedMessage.toEmbed();
        if (sniper) embed.setFooter({ text: `Sniped by ${sniper.tag}`, iconURL: sniper.displayAvatarURL() });

        await snipedMessage.delete();
        return embed;
    }

    public async resolveSnipedMessage(id: string): Promise<SnipedMessage<true>|undefined> {
        return this.cache.get(id) ?? this.fetchSnipedMessage(id).catch(() => undefined);
    }

    public async fetchSnipedMessage(filter: string|Partial<RawSnipedMessage>, cache: boolean = true): Promise<SnipedMessage<true>> {
        const find = await util.prisma.snipes.findFirstOrThrow({
            where: typeof filter === 'string'
                ? { id: filter }
                : filter,
            orderBy: {
                createdAt: `desc`
            },
        });

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
            repliedToUserId: (message.reference ? (await message.fetchReference()).author?.id : null) || null,
            edited: !!message.editedAt,
            createdAt: message.createdAt,
        };

        await util.prisma.snipes.create({ data: snipeData });
        return (await this.fetchSnipedMessage(message.id))!;
    }
}

export default new SnipeManagerModule();