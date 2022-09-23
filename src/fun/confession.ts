import { ActionRowBuilder, ApplicationCommandType, ButtonBuilder, ButtonStyle, Collection, ContextMenuCommandBuilder, EmbedBuilder, GuildTextBasedChannel, ModalBuilder, ModalSubmitInteraction, PermissionResolvable, RepliableInteraction, TextInputBuilder, TextInputStyle, User } from 'discord.js';
import { cwd, MessageCommandBuilder, RecipleClient, SlashCommandBuilder } from 'reciple';
import BaseModule from '../BaseModule';
import { InteractionEventType } from '../tools/InteractionEvents';
import util from '../tools/util';
import { Confession, RawConfession } from './Confessions/Confession';
import yml from 'yaml';
import createConfig from '../_createConfig';
import path from 'path';

export interface ConfessionOptions {
    title?: string|null;
    content: string;
    author: User;
    channel: GuildTextBasedChannel;
}

export interface ConfessionModuleConfig {
    confessionChannel: string;
    titleAccessRequiredPermissions: PermissionResolvable[];
}

export class ConfessionModule extends BaseModule {
    public cache: Collection<string, Confession> = new Collection();
    public config: ConfessionModuleConfig = ConfessionModule.getConfig();
    public confessionChannel!: GuildTextBasedChannel;

    public async onStart(client: RecipleClient<boolean>): Promise<boolean> {
        this.commands = [
            new SlashCommandBuilder()
                .setName('confess')
                .setDescription('Send an anonymous message to the confession channel')
                .setExecute(async data => {
                    const interaction = data.interaction;

                    if (!interaction.inCachedGuild()) return;
                    await interaction.showModal(this.confessionModal(interaction.memberPermissions?.has(this.config.titleAccessRequiredPermissions)));
                }),
        ];

        this.interactionEventHandlers = [
            {
                type: InteractionEventType.ContextMenu,
                commandName: 'Create Confession',
                handle: async interaction => {
                    if (!interaction.inCachedGuild() || !interaction.isContextMenuCommand()) return;
                    await interaction.showModal(this.confessionModal(interaction.memberPermissions?.has(this.config.titleAccessRequiredPermissions)));
                }
            },
            {
                type: InteractionEventType.Button,
                customId: id => id.startsWith('create-confession'),
                handle: async interaction => {
                    if (!interaction.inCachedGuild() || !interaction.isButton()) return;
                    await interaction.showModal(this.confessionModal(interaction.memberPermissions?.has(this.config.titleAccessRequiredPermissions), interaction.customId.split('-').pop()));
                }
            },
            {
                type: InteractionEventType.ContextMenu,
                commandName: 'Delete Confession',
                handle: async interaction => {
                    if (!interaction.inCachedGuild() || !interaction.isMessageContextMenuCommand()) return;

                    await interaction.deferReply({ ephemeral: true });
                    const confession = await this.resolveConfession(interaction.targetMessage.id);

                    if (!confession) {
                        await interaction.editReply({ embeds: [util.errorEmbed('Message is not a confession')] });
                        return;
                    }

                    if (confession.authorId !== interaction.user.id || interaction.memberPermissions.has(this.config.titleAccessRequiredPermissions)) {
                        await interaction.editReply({ embeds: [util.errorEmbed('You don\'t have permissions to delete this confession')] });
                        return;
                    }

                    await confession.delete();
                }
            },
            {
                type: InteractionEventType.ContextMenu,
                commandName: 'Edit Confession',
                handle: async interaction => {
                    if (!interaction.inCachedGuild() || !interaction.isMessageContextMenuCommand()) return;

                    await interaction.deferReply({ ephemeral: true });
                    const confession = await this.resolveConfession(interaction.targetMessage.id);

                    if (!confession) {
                        await interaction.editReply({ embeds: [util.errorEmbed('Message is not a confession')] });
                        return;
                    }

                    await interaction.showModal(this.confessionModal(interaction.memberPermissions?.has(this.config.titleAccessRequiredPermissions), confession.message.id));
                }
            },
            {
                type: InteractionEventType.ModalSubmit,
                customId: id => id.startsWith('create-confession'),
                handle: async interaction => {
                    if (!interaction.inCachedGuild() || !interaction.isModalSubmit()) return;
                    await this.confessionModalInteraction(interaction);
                }
            },
            {
                type: InteractionEventType.ModalSubmit,
                customId: id => id.startsWith('edit-confession-'),
                handle: async interaction => {
                    if (!interaction.inCachedGuild() || !interaction.isModalSubmit()) return;
                    await this.confessionModalInteraction(interaction, interaction.customId.split('-').pop()!)
                }
            }
        ];

        client.additionalApplicationCommands.push(
            new ContextMenuCommandBuilder()
                .setName('Delete Confession')
                .setType(ApplicationCommandType.Message),
            new ContextMenuCommandBuilder()
                .setName('Edit Confession')
                .setType(ApplicationCommandType.Message)
        );

        return true;
    }

    public async onLoad(client: RecipleClient<boolean>): Promise<void> {
        const confessionChannel = client.channels.cache.get(this.config.confessionChannel) ?? await client.channels.fetch(this.config.confessionChannel).catch(() => null);
        if (!confessionChannel || confessionChannel.isDMBased() || !confessionChannel.isTextBased()) throw new Error('Invalid confession channel');

        this.confessionChannel = confessionChannel;
    }

    public async confess(options: ConfessionOptions): Promise<Confession<true>> {
        const message = await options.channel.send({
            embeds: [
                new EmbedBuilder()
                    .setAuthor({ name: options.title || 'Anonymous', iconURL: util.client.user?.displayAvatarURL() })
                    .setDescription(options.content || null)
                    .setColor(util.embedColor)
                    .setTimestamp()
            ],
            components: [
                new ActionRowBuilder<ButtonBuilder>()
                    .setComponents(
                        new ButtonBuilder()
                            .setCustomId('create-confession')
                            .setLabel('Add confession')
                            .setStyle(ButtonStyle.Secondary)
                    )
            ]
        });

        return this.createConfession({
            id: message.id,
            title: options.title ?? null,
            content: options.content,
            authorId: options.author.id,
            channelId: options.channel.id,
            messageId: message.id
        });
    }

    public async resolveConfession(id: string): Promise<Confession<true>|undefined> {
        return this.cache.get(id) ?? this.fetchConfession(id);
    }

    public async fetchConfession(filter: string|Partial<RawConfession>, cache: boolean = true): Promise<Confession<true>|undefined> {
        const find = await util.prisma.confessions.findFirst({
            where: typeof filter === 'string'
                ? { id: filter }
                : filter,
            orderBy: {
                createdAt: 'desc'
            },
        });

        if (!find) return undefined;
        const confession = await (new Confession(this, find)).fetch();

        if (cache) this.cache.set(confession.id, confession);
        return confession;
    }

    public async createConfession(data: Omit<RawConfession, 'edited' | 'createdAt'>): Promise<Confession<true>> {
        const newData = await util.prisma.confessions.create({
            data: {
                ...data
            }
        });

        const confession = await (new Confession(this, newData)).fetch();

        this.cache.set(confession.id, confession);
        return confession;
    }

    public async confessionModalInteraction(interaction: ModalSubmitInteraction, editId?: string, channel?: GuildTextBasedChannel): Promise<void> {
        const title = interaction.fields.getTextInputValue('title') || null;
        const content = interaction.fields.getTextInputValue('content');

        await interaction.deferReply({ ephemeral: true });

        if (editId) {

            const confession = await this.resolveConfession(editId);

            if (!confession) {
                await interaction.editReply({ embeds: [util.errorEmbed(`Cannot find confession id`)] });
                return;
            }

            if (confession.author.id !== interaction.user.id || interaction.memberPermissions?.has(this.config.titleAccessRequiredPermissions)) {
                await interaction.editReply({ embeds: [util.errorEmbed(`You don't have permission to edit this confession`)] });
                return;
            }

            await confession.edit({
                title,
                content
            });

            return;
        }

        await this.confess({
            author: interaction.user,
            channel: channel ?? this.confessionChannel,
            title: title,
            content
        });
    }

    public confessionModal(allowTitle: boolean = false, id?: string, values?: Pick<ConfessionOptions, 'title' | 'content'>): ModalBuilder {
        return new ModalBuilder()
            .setCustomId((values ? `edit` : `create`) + `-confession${id ? '-' + id : ''}`)
            .setTitle((values ? 'Edit' : 'Create') + ' Confession')
            .setComponents(
                ...(allowTitle
                    ? [
                        new ActionRowBuilder<TextInputBuilder>()
                        .setComponents(
                            new TextInputBuilder()
                                .setCustomId('title')
                                .setLabel(`Title`)
                                .setPlaceholder(`Anonymouse`)
                                .setMaxLength(100)
                                .setStyle(TextInputStyle.Short)
                                .setValue(values?.title ?? '')
                        )
                        ]
                    : []
                ),
                new ActionRowBuilder<TextInputBuilder>()
                    .setComponents(
                        new TextInputBuilder()
                            .setCustomId('content')
                            .setLabel('Confession')
                            .setPlaceholder(`I'm a pretty boss ass bitch`)
                            .setMaxLength(3000)
                            .setStyle(TextInputStyle.Paragraph)
                            .setValue(values ? values.content || ' ' : ' ')
                    )
            )
    }

    public static getConfig(): ConfessionModuleConfig {
        return yml.parse(createConfig(path.join(cwd, 'config/confession/config.yml'), <ConfessionModuleConfig>({
            confessionChannel: '000000000000000000',
            titleAccessRequiredPermissions: ['ManageChannels']
        })));
    }
}

export default new ConfessionModule();