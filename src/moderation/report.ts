import { ActionRowBuilder, ApplicationCommandType, ButtonBuilder, ButtonStyle, ContextMenuCommandBuilder, EmbedBuilder, Message, MessageActionRowComponentBuilder, MessageCreateOptions, ModalActionRowComponent, ModalActionRowComponentBuilder, ModalBuilder, TextBasedChannel, TextInputBuilder, TextInputStyle } from 'discord.js';
import { cwd, RecipleClient } from 'reciple';
import BaseModule from '../BaseModule';
import { InteractionEventType } from '../tools/InteractionEvents';
import util from '../tools/util';
import yml from 'yaml';
import path from 'path';

export interface ReportModuleConfig {
    reportChannels: string[];
}

export class ReportModule extends BaseModule {
    public config: ReportModuleConfig = ReportModule.getConfig();
    public reportChannels: TextBasedChannel[] = [];

    public async onStart(client: RecipleClient<boolean>): Promise<boolean> {
        client.commands.additionalApplicationCommands.push(
            new ContextMenuCommandBuilder()
                .setName('Report')
                .setType(ApplicationCommandType.Message)
        );

        this.interactionEventHandlers = [
            {
                type: InteractionEventType.ContextMenu,
                commandName: 'Report',
                handle: async interaction => {
                    if (!interaction.isMessageContextMenuCommand()) return;

                    await interaction.showModal(
                        new ModalBuilder()
                            .setCustomId(`report-${interaction.targetMessage.id}`)
                            .setTitle(`Report ${interaction.targetMessage.author.tag}'s message`)
                            .setComponents(
                                new ActionRowBuilder<ModalActionRowComponentBuilder>()
                                    .setComponents(
                                        new TextInputBuilder()
                                            .setCustomId(`reason`)
                                            .setLabel(`Reason`)
                                            .setMaxLength(4000)
                                            .setPlaceholder(`So dumb like wtf`)
                                            .setRequired(false)
                                            .setStyle(TextInputStyle.Paragraph)
                                    )
                            )
                    )
                }
            },
            {
                type: InteractionEventType.ModalSubmit,
                customId: id => id.startsWith('report-'),
                handle: async interaction => {
                    if (!interaction.isModalSubmit()) return;

                    const id = interaction.customId.split('-')[1];
                    const message = interaction.channel?.messages.cache.get(id);

                    if (!message) {
                        await interaction.reply({ embeds: [util.errorEmbed(`Failed to send report`)], ephemeral: true });
                        return;
                    }

                    if (message.author.id === interaction.user.id) {
                        await interaction.reply({ embeds: [util.errorEmbed(`You cannot report your own message`)], ephemeral: true });
                        return;
                    }

                    await interaction.deferReply({ ephemeral: true });

                    await this.report({
                        embeds: [
                            new EmbedBuilder()
                                .setAuthor({ name: `${message.author.tag} (${message.author.id})`, iconURL: message.member?.displayAvatarURL() ?? message.author.displayAvatarURL() })
                                .setDescription(message.content || ' ')
                                .setColor(util.embedColor)
                                .setTitle(`Message report`)
                                .addFields(
                                    {
                                        name: `Reason`,
                                        value: interaction.fields.getTextInputValue('reason') || '*No reason provided*',
                                        inline: true
                                    },
                                    {
                                        name: `Reported by`,
                                        value: interaction.user.toString(),
                                        inline: true
                                    },
                                    {
                                        name: `Message author`,
                                        value: message.author.toString(),
                                        inline: true
                                    }
                                )
                                .setTimestamp()
                                .setFooter({
                                    text: `${interaction.user.tag} reported a message`,
                                    iconURL: interaction.user.displayAvatarURL()
                                })
                                .setURL(message.url),
                            ...message.embeds.map(e => new EmbedBuilder(e.data).setColor(util.errorEmbedColor).setURL(null).setAuthor({ ...e.author, name: `(Reported Embed) ${e.author?.name}`, }))
                        ],
                        components: [
                            new ActionRowBuilder<MessageActionRowComponentBuilder>()
                                .setComponents(
                                    new ButtonBuilder()
                                        .setStyle(ButtonStyle.Link)
                                        .setLabel(`Go to message`)
                                        .setURL(message.url)
                                )
                        ]
                    });

                    await interaction.editReply({ embeds: [util.smallEmbed(`Report sent!`)] });
                }
            }
        ];

        return true;
    }

    public async onLoad(client: RecipleClient<boolean>): Promise<void> {
        for (const channelId of this.config.reportChannels) {
            const channel = client.channels.cache.get(channelId) ?? await client.channels.fetch(channelId).catch(() => undefined);
            if (channel?.isTextBased()) this.reportChannels.push(channel);
        }
    }

    public async report(messageOptions: MessageCreateOptions): Promise<Message[]> {
        const messages: Message[] = [];

        for (const channel of this.reportChannels) {
            const message = await channel.send(messageOptions).catch(() => undefined);
            if (message) messages.push(message);
        }

        return messages;
    }

    public static getConfig(): ReportModuleConfig {
        return yml.parse(util.createConfig(path.join(cwd, 'config/report/config.yml'), <ReportModuleConfig>({
            reportChannels: ['00000000000000000000']
        })));
    }
}

export default new ReportModule();