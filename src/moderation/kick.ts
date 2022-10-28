import { ActionRowBuilder, ApplicationCommandType, ContextMenuCommandBuilder, EmbedBuilder, GuildMember, ModalBuilder, PermissionFlagsBits, TextInputBuilder, TextInputStyle, User } from 'discord.js';
import { MessageCommandBuilder, RecipleClient, SlashCommandBuilder } from 'reciple';
import { InteractionEventType } from '../tools/InteractionEvents';
import { Logger } from 'fallout-utility';
import BaseModule from '../BaseModule';
import util from '../tools/util';

export class KickModule extends BaseModule {
    public logger!: Logger;

    public onStart(client: RecipleClient<boolean>): boolean {
        this.logger = client.logger.cloneLogger({ loggerName: `KickModule` });
        this.commands = [
            new SlashCommandBuilder()
                .setName('kick')
                .setDescription('Kick an annoying peice of shit')
                .setRequiredMemberPermissions('KickMembers')
                .addUserOption(user => user
                    .setName('member')
                    .setDescription('Kick this mf')
                    .setRequired(true)
                )
                .addStringOption(reason => reason
                    .setName('reason')
                    .setDescription('What\'s your problem with this monkey?')
                    .setRequired(false)
                )
                .setExecute(async data => {
                    const interaction = data.interaction;
                    const user = interaction.options.getUser('member', true);
                    const reason = interaction.options.getString('reason');

                    if (!interaction.inCachedGuild()) {
                        await interaction.reply({ embeds: [util.errorEmbed(`You're not in a server`)], ephemeral: true });
                        return;
                    }

                    const member = interaction.guild.members.cache.get(user.id);

                    if (!member) {
                        await interaction.reply({ embeds: [util.errorEmbed(`Member not found`)], ephemeral: true });
                        return;
                    }

                    await interaction.deferReply();
                    await interaction.editReply({
                        embeds: [
                            await this.kickMember(member, interaction.user, reason)
                        ]
                    });
                }),
            new MessageCommandBuilder()
                .setName('kick')
                .setDescription('Kick an annoying peice of shit')
                .setRequiredMemberPermissions('KickMembers')
                .addOptions(user => user
                    .setName('member')
                    .setDescription('Kick this mf')
                    .setRequired(true)
                    .setValidator(async value => !!await util.resolveMentionOrId(value)),
                reason => reason
                    .setName('reason')
                    .setDescription('What\'s your problem with this monkey?')
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
                            await this.kickMember(member, message.author, reason)
                        ]
                    });
                })
        ];

        this.interactionEventHandlers = [
            {
                type: InteractionEventType.ContextMenu,
                commandName: 'Kick',
                handle: async interaction => {
                    if (!interaction.isUserContextMenuCommand()) return;

                    await interaction.showModal(this.getContextMenuModal(interaction.targetUser))
                }
            },
            {
                type: InteractionEventType.ModalSubmit,
                customId: id => id.startsWith(`kick-modal-`),
                handle: async interaction => {
                    if (!interaction.isModalSubmit() || !interaction.inCachedGuild()) return;
                    if (!interaction.memberPermissions.has('KickMembers')) return;

                    await interaction.deferReply();

                    const user = await util.resolveMentionOrId(interaction.customId.split('-').pop()!);
                    const reason = interaction.fields.getTextInputValue('reason');

                    const member = user ? interaction.guild.members.resolve(user) : null;

                    if (!member) {
                        await interaction.editReply({ embeds: [util.errorEmbed(`Member not found`)] });
                        return;
                    }

                    await interaction.editReply({
                        embeds: [
                            await this.kickMember(member, interaction.user, reason)
                        ]
                    });
                }
            }
        ];

        client.commands.additionalApplicationCommands.push(
            new ContextMenuCommandBuilder()
                .setName('Kick')
                .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
                .setType(ApplicationCommandType.User)
        );

        return true;
    }

    public async kickMember(member: GuildMember, moderator: User, reason?: string|null): Promise<EmbedBuilder> {
        if (member.id == moderator.id) return util.errorEmbed(`You cannot kick yourself`);
        if (!member.kickable) return util.errorEmbed(`No permissions to kick ${member}`, true);

        const kicked = await member.kick(reason ? `${moderator.tag} — ${reason}` : undefined).catch(err => this.logger.err(err));

        if (!kicked) return util.errorEmbed(`Failed to kick ${member}`, true);

        return new EmbedBuilder()
            .setAuthor({ name: `Kicked ${member.displayName}`, iconURL: member.displayAvatarURL() })
            .setDescription(reason || null)
            .setFooter({ text: `${moderator.tag} kicked ${member.user.tag}`, iconURL: moderator.displayAvatarURL() })
            .setTimestamp();
    }
    
    public getContextMenuModal(user: User): ModalBuilder {
        return new ModalBuilder()
            .setTitle(`Kick ${user.tag}`)
            .setCustomId(`kick-modal-${user.id}`)
            .setComponents(
                new ActionRowBuilder<TextInputBuilder>()
                    .setComponents(
                        new TextInputBuilder()
                            .setCustomId(`reason`)
                            .setLabel(`Why?`)
                            .setPlaceholder(`Piece of shit`)
                            .setStyle(TextInputStyle.Paragraph)
                            .setRequired(false)
                    )
            );
    }
}

export default new KickModule();