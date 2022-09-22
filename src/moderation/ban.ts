import { MessageCommandBuilder, RecipleClient, SlashCommandBuilder } from 'reciple';
import { ActionRowBuilder, ApplicationCommandType, ContextMenuCommandBuilder, EmbedBuilder, GuildMember, ModalBuilder, PermissionsBitField, TextInputBuilder, TextInputStyle, User } from 'discord.js';
import BaseModule from '../BaseModule';
import util from '../tools/util';
import ms from 'ms';
import { InteractionEventType } from '../tools/InteractionEvents';
import { Logger } from 'fallout-utility';

export class BanModule extends BaseModule {
    public logger!: Logger;

    public onStart(client: RecipleClient<boolean>): boolean {
        this.logger = client.logger.cloneLogger({ loggerName: `BanModule` });

        this.commands = [
            new SlashCommandBuilder()
                .setName('ban')
                .setDescription('Ban hammer')
                .setRequiredMemberPermissions('BanMembers')
                .addUserOption(user => user
                    .setName('member')
                    .setDescription('Ban this bitch')
                    .setRequired(true)
                )
                .addStringOption(reason => reason
                    .setName('reason')
                    .setDescription('Reason why you hate this mf')
                    .setRequired(false)
                )
                .addStringOption(deleteMessages => deleteMessages
                    .setName('delete-messages')
                    .setDescription('Delete messages before what time?')
                    .setRequired(false)
                )
                .setExecute(async data => {
                    const interaction = data.interaction;
                    const user = interaction.options.getUser('member', true);
                    const reason = interaction.options.getString('reason');
                    const deleteMessagesTime = interaction.options.getString('delete-messages');

                    if (!interaction.inCachedGuild()) {
                        await interaction.reply({ embeds: [util.errorEmbed(`You're not in a server`)], ephemeral: true });
                        return;
                    }

                    const member = interaction.guild.members.cache.get(user.id);

                    if (!member) {
                        await interaction.reply({ embeds: [util.errorEmbed(`Member not found`)], ephemeral: true });
                        return;
                    }

                    await interaction.reply({
                        embeds: [
                            await this.banMember(member, interaction.user, reason, deleteMessagesTime ? await Promise.resolve(ms(deleteMessagesTime)).catch(() => undefined) : undefined)
                        ]
                    });
                }),
            new MessageCommandBuilder()
                .setName('ban')
                .setDescription('Ban hammer')
                .setRequiredMemberPermissions('BanMembers')
                .addOption(user => user
                    .setName('member')
                    .setDescription('Ban this bitch')
                    .setRequired(true)
                    .setValidator(async value => !!await util.resolveMentionOrId(value))
                )
                .addOption(reason => reason
                    .setName('reason')
                    .setDescription('Reason why you hate this mf')
                    .setRequired(false)
                )
                .setExecute(async data => {
                    const message = data.message;
                    const user = await util.resolveMentionOrId(data.options.getValue('member', true));
                    const reason = data.command.args.slice(1).join(' ');

                    if (!message.inGuild()) {
                        await message.reply({ embeds: [util.errorEmbed(`You're not in a server`)] });
                        return;
                    }

                    const member = user ? message.guild.members.resolve(user) : null;

                    if (!member) {
                        await message.reply({ embeds: [util.errorEmbed(`Member not found`)] });
                        return;
                    }

                    await message.reply({
                        embeds: [
                            await this.banMember(member, message.author, reason)
                        ]
                    });
                })
        ];

        this.interactionEventHandlers = [
            {
                type: InteractionEventType.ContextMenu,
                commandName: 'Ban',
                handle: async interaction => {
                    if (!interaction.isUserContextMenuCommand()) return;

                    await interaction.showModal(this.getContextMenuModal(interaction.targetUser))
                }
            },
            {
                type: InteractionEventType.ModalSubmit,
                customId: id => id.startsWith(`ban-modal-`),
                handle: async interaction => {
                    if (!interaction.isModalSubmit() || !interaction.inCachedGuild()) return;
                    if (!interaction.memberPermissions.has('BanMembers')) return;

                    await interaction.deferReply();

                    const user = await util.resolveMentionOrId(interaction.customId.split('-').pop()!);
                    const reason = interaction.fields.getTextInputValue('reason');
                    const deleteMessages = interaction.fields.getTextInputValue('delete-messages');

                    const member = user ? interaction.guild.members.resolve(user) : null;

                    if (!member) {
                        await interaction.editReply({ embeds: [util.errorEmbed(`Member not found`)] });
                        return;
                    }

                    await interaction.editReply({
                        embeds: [
                            await this.banMember(member, interaction.user, reason, deleteMessages ? await Promise.resolve(ms(deleteMessages)).catch(() => undefined) : undefined)
                        ]
                    });
                }
            }
        ];

        client.additionalApplicationCommands.push(
            new ContextMenuCommandBuilder()
                .setName('Ban')
                .setType(ApplicationCommandType.User)
        );

        return true;
    }

    public async banMember(member: GuildMember, moderator: User, reason?: string|null, deleteMessagesTime?: number): Promise<EmbedBuilder> {
        if (member.id == moderator.id) return util.smallEmbed(`You cannot ban yourself`);
        if (!member.manageable || !member.moderatable) return util.smallEmbed(`No permissions to ban ${member}`, true);
        
        const banned = await member.ban({
            deleteMessageSeconds: deleteMessagesTime,
            reason: reason ? `${moderator.tag} — ${reason}` : undefined
        }).catch(this.logger.err);

        if (!banned) return util.errorEmbed(`Failed to ban **${member}**`, true);

        return new EmbedBuilder()
            .setAuthor({ name: `Banned ${member.displayName}`, iconURL: member.displayAvatarURL() })
            .setDescription(reason || null)
            .setFooter({ text: `${moderator.tag} banned ${member.user.tag}`, iconURL: moderator.displayAvatarURL() })
            .setTimestamp();
    }

    public getContextMenuModal(user: User): ModalBuilder {
        return new ModalBuilder()
            .setTitle(`Ban ${user.tag}`)
            .setCustomId(`ban-modal-${user.id}`)
            .setComponents(
                new ActionRowBuilder<TextInputBuilder>()
                    .setComponents(
                        new TextInputBuilder()
                            .setCustomId(`reason`)
                            .setLabel(`Reason why you hate this mf`)
                            .setPlaceholder(`Annoying and stupid`)
                            .setStyle(TextInputStyle.Paragraph)
                            .setRequired(false)
                    ),
                new ActionRowBuilder<TextInputBuilder>()
                    .setComponents(
                        new TextInputBuilder()
                            .setCustomId(`delete-messages`)
                            .setLabel(`Delete messages before what time`)
                            .setPlaceholder(`1m, 1h, 1d or 1w`)
                            .setStyle(TextInputStyle.Short)
                            .setRequired(false)
                    )
            );
    }
}

export default new BanModule();