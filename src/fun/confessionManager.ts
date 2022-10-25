import { ActionRowBuilder, ApplicationCommandType, ButtonBuilder, ButtonStyle, Collection, ContextMenuCommandBuilder, EmbedBuilder, GuildTextBasedChannel, ModalBuilder, ModalSubmitInteraction, PermissionResolvable, TextInputBuilder, TextInputStyle, User } from 'discord.js';
import { cwd, RecipleClient, SlashCommandBuilder } from 'reciple';
import BaseModule from '../BaseModule';
import { InteractionEventType } from '../tools/InteractionEvents';
import util from '../tools/util';
import { Confession, RawConfession } from './Confessions/Confession';
import yml from 'yaml';
import path from 'path';

export interface ConfessionOptions {
    title?: string|null;
    content: string;
    author: User;
    channel: GuildTextBasedChannel;
}

export interface ConfessionManagerModuleConfig {
    confessionChannel: string;
    titleAccessRequiredPermissions: PermissionResolvable[];
}

export class ConfessionManagerModule extends BaseModule {
    public cache: Collection<string, Confession> = new Collection();
    public config: ConfessionManagerModuleConfig = ConfessionManagerModule.getConfig();
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
                customId: 'create-confession',
                handle: async interaction => {
                    if (!interaction.inCachedGuild() || !interaction.isButton()) return;
                    await interaction.showModal(this.confessionModal(interaction.memberPermissions?.has(this.config.titleAccessRequiredPermissions)));
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

                    if (confession.author.id !== interaction.user.id || !interaction.memberPermissions.has(this.config.titleAccessRequiredPermissions)) {
                        await interaction.editReply({ embeds: [util.errorEmbed('You don\'t have permissions to delete this confession')] });
                        return;
                    }

                    await confession.delete();
                    await interaction.editReply({ embeds: [util.smallEmbed('Confession deleted')] });
                }
            },
            {
                type: InteractionEventType.ModalSubmit,
                customId: 'create-confession',
                handle: async interaction => {
                    if (!interaction.inCachedGuild() || !interaction.isModalSubmit()) return;
                    await this.confessionModalInteraction(interaction);
                }
            }
        ];

        client.commands.additionalApplicationCommands.push(
            new ContextMenuCommandBuilder()
                .setName('Delete Confession')
                .setType(ApplicationCommandType.Message),
            new ContextMenuCommandBuilder()
                .setName('Create Confession')
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
        return this.cache.get(id) ?? this.fetchConfession(id).catch(() => undefined);
    }

    public async fetchConfession(filter: string|Partial<RawConfession>, cache: boolean = true): Promise<Confession<true>> {
        const find = await util.prisma.confessions.findFirstOrThrow({
            where: typeof filter === 'string'
                ? { id: filter }
                : filter,
            orderBy: {
                createdAt: 'desc'
            },
        });

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

    public async confessionModalInteraction(interaction: ModalSubmitInteraction, channel?: GuildTextBasedChannel): Promise<void> {
        const title = interaction.memberPermissions?.has(this.config.titleAccessRequiredPermissions) ? (interaction.fields.getTextInputValue('title') || null) : null;
        const content = interaction.fields.getTextInputValue('content');

        await interaction.deferReply({ ephemeral: true });
        await this.confess({
            author: interaction.user,
            channel: channel ?? this.confessionChannel,
            title: title,
            content
        });

        await interaction.editReply({ embeds: [util.smallEmbed('Confession added')] });
    }

    public confessionModal(allowTitle: boolean = false): ModalBuilder {
        return new ModalBuilder()
            .setCustomId(`create-confession`)
            .setTitle('Create Confession')
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
                                .setRequired(false)
                                .setStyle(TextInputStyle.Short)
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
                    )
            )
    }

    public static getConfig(): ConfessionManagerModuleConfig {
        return yml.parse(util.createConfig(path.join(cwd, 'config/confession/config.yml'), <ConfessionManagerModuleConfig>({
            confessionChannel: '000000000000000000',
            titleAccessRequiredPermissions: ['ManageChannels']
        })));
    }
}

export default new ConfessionManagerModule();