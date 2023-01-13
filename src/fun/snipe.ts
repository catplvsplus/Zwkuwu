import { MessageCommandBuilder, RecipleClient, SlashCommandBuilder } from 'reciple';
import { BaseModule } from '../BaseModule.js';
import { ActionRowBuilder, Base, BaseMessageOptions, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageActionRowComponentBuilder, User } from 'discord.js';
import utility from '../utils/utility.js';
import { SnipedMessages } from '@prisma/client';
import userSettings from '../utils/userSettings.js';

export interface SnipeConfig {
    ignoredWords: string[];
    ignoredUsers: string[];
}

export class SnipeModule extends BaseModule {
    public async onStart(client: RecipleClient<boolean>): Promise<boolean> {
        this.commands = [
            new SlashCommandBuilder()
                .setName('snipe')
                .setDescription('Snipe deleted messages')
                .setExecute(async ({ interaction }) => {
                    await interaction.deferReply();
                    await interaction.editReply(await this.snipeMessage(interaction.user, { channelId: interaction.channelId }));
                }),
            new MessageCommandBuilder()
                .setName('snipe')
                .setDescription('Snipe deleted messages')
                .setExecute(async ({ message }) => {
                    await message.reply(await this.snipeMessage(message.author, { channelId: message.channelId }));
                })
        ];

        this.interactions = [
            {
                type: 'Button',
                customId: 'snipe',
                handle: async interaction => {
                    await interaction.deferReply();
                    await interaction.editReply(await this.snipeMessage(interaction.user, { channelId: interaction.channelId }));
                }
            }
        ];

        return true;
    }

    public async onLoad(client: RecipleClient): Promise<void> {
        client.on('messageDelete', async (message) => {
            if (!message.inGuild()) return;
            if (utility.config.snipes.ignoredUsers.includes(message.author.id)) return;
            if (utility.config.snipes.ignoredWords.some(word => message.content.toLowerCase().includes(word.toLowerCase()))) return;

            const settings = await userSettings.fetchUserSettings(message.author.id);
            if (!settings?.allowSniping) return;

            await utility.prisma.snipedMessages.create({
                data: {
                    id: message.id,
                    authorId: message.author.id,
                    channelId: message.channel.id,
                    content: message.content,
                    attachmentCount: message.attachments.size,
                    edited: !!message.editedAt,
                    referencedUserId: message.reference ? (await message.fetchReference()).author.id : null
                }
            });
        });
    }

    public async snipeMessage(sniper: User, filter?: Partial<SnipedMessages>): Promise<BaseMessageOptions> {
        const settings = await userSettings.fetchUserSettings(sniper.id);

        if (!settings.allowSniping) return {
            embeds: [
                utility.createSmallEmbed('Enable your message sniping to use snipe command', { positive: false })
            ]
        };

        const data = await utility.prisma.snipedMessages.findFirst({
            where: filter,
            orderBy: { createdAt: 'desc' },
            take: 1
        });

        const deleted = data ? await utility.prisma.snipedMessages.delete({ where: { id: data.id } }).catch(() => null) : null;

        if (!data || !deleted) return {
            embeds: [
                utility.createSmallEmbed('No sniped messages found', { positive: false })
            ]
        };

        const user = await utility.resolveFromCachedManager(data.authorId, utility.client.users);

        return {
            embeds: [
                new EmbedBuilder()
                    .setAuthor({ name: user.tag, iconURL: user.displayAvatarURL() })
                    .setDescription(`${data.content + (data.edited ? ' (edited)' : '')}`)
                    .setTimestamp(data.createdAt)
                    .setColor(utility.config.embedColor)
            ],
            components: [
                this.getSnipeMessageComponents()
            ]
        };
    }

    public getSnipeMessageComponents(disabled: boolean = false): ActionRowBuilder<MessageActionRowComponentBuilder> {
        return new ActionRowBuilder<MessageActionRowComponentBuilder>()
            .setComponents(
                new ButtonBuilder()
                    .setCustomId('snipe')
                    .setLabel('Snipe')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(disabled)
            );
    }
}

export default new SnipeModule();