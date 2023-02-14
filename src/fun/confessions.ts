import { RecipleClient, SlashCommandBuilder, ContextMenuCommandBuilder } from 'reciple';
import { BaseModule } from '../BaseModule.js';
import { ActionRowBuilder, ApplicationCommandType, ButtonBuilder, ButtonStyle, Embed, EmbedBuilder, Message, MessageActionRowComponentBuilder, MessageCreateOptions, ModalActionRowComponentBuilder, ModalBuilder, PermissionResolvable, TextBasedChannel, TextInputBuilder, TextInputStyle } from 'discord.js';
import utility from '../utils/utility.js';
import { getRandomKey } from 'fallout-utility';
import antiScam from '../moderation/antiScam.js';
import toxicMessages from '../moderation/toxicMessages.js';

export interface ConfessionsConfig {
    confessionsChannelId: string;
    titleAccessRequiredPermissions: PermissionResolvable;
    modalPlaceholders: string[];
    disableConfessionReply: boolean;
    filtering: {
        checkSuspiciousLinks: boolean;
        checkToxicity: boolean;
    };
}

export class ConfessionsModule extends BaseModule {
    public confessionsChannel!: TextBasedChannel;
    public titleAccessRequiredPermissions: PermissionResolvable = 'Administrator';

    get config() { return utility.config.confessions; }

    public async onStart(client: RecipleClient<boolean>): Promise<boolean> {
        this.commands = [
            new SlashCommandBuilder()
                .setName('confession')
                .setDescription('Manage your confessions')
                .addSubcommand(add => add
                    .setName('add')
                    .setDescription('Create new confession')
                )
                .setExecute(async ({ interaction }) => {
                    const allowTitle = interaction.inCachedGuild() && interaction.member.permissions.has(this.config.titleAccessRequiredPermissions);

                    await interaction.showModal(this.confessionModal({ allowTitle }));
                }),
            new ContextMenuCommandBuilder()
                .setName('Reply to confession')
                .setType(ApplicationCommandType.Message)
                .setExecute(async ({ interaction }) => {
                    if (!interaction.isMessageContextMenuCommand()) return;
                    const allowTitle = interaction.inCachedGuild() && interaction.member.permissions.has(this.config.titleAccessRequiredPermissions);

                    await interaction.showModal(this.confessionModal({ replyToId: interaction.targetId, allowTitle }))
                }),
            new ContextMenuCommandBuilder()
                .setName('Delete confession')
                .setType(ApplicationCommandType.Message)
                .setExecute(async ({ interaction }) => {
                    if (!interaction.isMessageContextMenuCommand()) return;
                    await interaction.deferReply({ ephemeral: true });

                    const targetId = interaction.targetId;
                    const targetData = await utility.prisma.confessions.findFirst({ where: { id: targetId } });

                    if (!targetData) {
                        await interaction.editReply({
                            embeds: [
                                utility.createSmallEmbed('Invalid confession message', { positive: false })
                            ]
                        });
                        return;
                    }

                    if (targetData.authorId !== interaction.user.id) {
                        await interaction.editReply({
                            embeds: [
                                utility.createSmallEmbed('You can only delete your own confessions', { positive: false })
                            ]
                        });
                        return;
                    }

                    await utility.prisma.confessions.delete({ where: { id: targetId } });
                    await interaction.targetMessage.delete();
                    await interaction.editReply({
                        embeds: [
                            utility.createSmallEmbed('Confession deleted')
                        ]
                    });
                })
        ];

        this.interactions = [
            {
                type: 'Button',
                customId: 'confession-create',
                handle: async interaction => {
                    const allowTitle = interaction.inCachedGuild() && interaction.member.permissions.has(this.config.titleAccessRequiredPermissions);
                    await interaction.showModal(this.confessionModal({ allowTitle }));
                }
            },
            {
                type: 'Button',
                customId: 'confession-reply',
                handle: async interaction => {
                    const allowTitle = interaction.inCachedGuild() && interaction.member.permissions.has(this.config.titleAccessRequiredPermissions);
                    const replyToId = interaction.message.id;

                    await interaction.showModal(this.confessionModal({ allowTitle, replyToId }));
                }
            },
            {
                type: 'ModalSubmit',
                customId: customId => customId.startsWith('confession-modal'),
                handle: async interaction => {
                    const allowTitle = interaction.inCachedGuild() && interaction.member.permissions.has(this.config.titleAccessRequiredPermissions);

                    const [action, type, replyToId] = interaction.customId.split('-');

                    const title = allowTitle ? interaction.fields.getTextInputValue('title') : '';
                    const content = interaction.fields.getTextInputValue('content');

                    let replyTo: Message|null = null;

                    await interaction.deferReply({ ephemeral: true });

                    if (!allowTitle && await this.isConfessionNotAllowed(content)) {
                        await interaction.editReply({
                            embeds: [
                                utility.createSmallEmbed('Confession content is not allowed', { positive: false })
                            ]
                        });
                        return;
                    }

                    if (replyToId) {
                        if (this.config.disableConfessionReply && !allowTitle) {
                            await interaction.editReply({
                                embeds: [
                                    utility.createSmallEmbed('Confession replies are disabled', { positive: false })
                                ]
                            });
                            return;
                        }

                        const targetConfessionData = await utility.prisma.confessions.findFirst({ where: { id: replyToId } });
                        if (!targetConfessionData) {
                            await interaction.editReply({
                                embeds: [
                                    utility.createSmallEmbed('Couldn\'t find reply target confession', { positive: false })
                                ]
                            });
                            return;
                        }

                        const channel = this.confessionsChannel.id !== interaction.channelId ? await utility.resolveFromCachedManager(targetConfessionData.channelId, client.channels) : this.confessionsChannel;

                        if (!channel?.isTextBased() || channel.isDMBased()) {
                            await interaction.editReply({
                                embeds: [
                                    utility.createSmallEmbed('Couldn\'t find valid target channel', { positive: false })
                                ]
                            });
                            return;
                        }

                        replyTo = await utility.resolveFromCachedManager(replyToId, channel.messages);
                        if (!replyTo) {
                            await interaction.editReply({
                                embeds: [
                                    utility.createSmallEmbed('Couldn\'t find target confession', { positive: false })
                                ]
                            });
                            return;
                        }
                    }

                    const messageData: MessageCreateOptions = {
                        embeds: [
                            new EmbedBuilder()
                                .setAuthor({ name: title || 'Anonymous', iconURL: client.user?.displayAvatarURL() })
                                .setDescription(content)
                                .setColor(utility.config.embedColor)
                                .addFields(replyTo && replyTo.channelId !== this.confessionsChannel.id ? [
                                    {
                                        name: 'Replied to',
                                        inline: true,
                                        value: `[Go to message](${replyTo.url})`
                                    }
                                ] : [])
                                .setTimestamp()
                        ],
                        components: [
                            new ActionRowBuilder<MessageActionRowComponentBuilder>()
                                .setComponents(
                                    new ButtonBuilder()
                                        .setCustomId('confession-create')
                                        .setLabel('Create Confession')
                                        .setStyle(ButtonStyle.Primary),
                                    ...(!this.config.disableConfessionReply
                                            ? [new ButtonBuilder()
                                                .setCustomId('confession-reply')
                                                .setLabel('Reply to Confession')
                                                .setStyle(ButtonStyle.Secondary)]
                                            : [])
                                )
                        ]
                    };

                    const confessionMessage = replyTo
                        ? replyTo.channel.id !== this.confessionsChannel.id
                            ? await this.confessionsChannel.send(messageData)
                            : await replyTo.reply(messageData)
                        : await this.confessionsChannel.send(messageData);

                    await utility.prisma.confessions.create({
                        data: {
                            id: confessionMessage.id,
                            authorId: interaction.user.id,
                            channelId: this.confessionsChannel.id,
                            content,
                            title,
                            referenceId: replyToId
                        }
                    });

                    await interaction.editReply({
                        embeds: [
                            utility.createSmallEmbed('Confession added')
                        ]
                    });
                }
            }
        ];

        return true;
    }

    public async onLoad(client: RecipleClient<boolean>): Promise<void> {
        const channel = await utility.resolveFromCachedManager(this.config.confessionsChannelId, client.channels);
        if (!channel?.isTextBased()) throw new Error('Confessions channel is not a valid text channel');

        this.confessionsChannel = channel;
    }

    public async isConfessionNotAllowed(content: string): Promise<boolean> {
        let isAllowed: boolean = true;

        if (this.config.filtering.checkSuspiciousLinks) isAllowed = antiScam.scamLinks.isMatch(content);
        if (this.config.filtering.checkToxicity) isAllowed = !isAllowed ? (await toxicMessages.isToxic(content)).isToxic : isAllowed;

        return isAllowed;
    }

    public confessionModal(options?: { replyToId?: string; allowTitle?: boolean; }): ModalBuilder {
        return new ModalBuilder()
            .setCustomId('confession-modal' + (options?.replyToId ? '-' + options?.replyToId : ''))
            .setTitle(options?.replyToId ? `Reply to a confession` : `Create a confession`)
            .setComponents(
                ...(options?.allowTitle
                        ? [new ActionRowBuilder<ModalActionRowComponentBuilder>()
                            .setComponents(
                                new TextInputBuilder()
                                    .setCustomId('title')
                                    .setLabel('Title')
                                    .setMaxLength(100)
                                    .setPlaceholder('Give your self an alias')
                                    .setStyle(TextInputStyle.Short)
                                    .setRequired(false)
                            )]
                        : []
                    ),
                new ActionRowBuilder<ModalActionRowComponentBuilder>()
                    .setComponents(
                        new TextInputBuilder()
                            .setCustomId('content')
                            .setLabel('Content')
                            .setMaxLength(2000)
                            .setPlaceholder(getRandomKey(this.config.modalPlaceholders))
                            .setStyle(TextInputStyle.Paragraph)
                            .setRequired(true)
                    )
            )
    }
}

export default new ConfessionsModule();