import { MessageCommandBuilder, RecipleClient, SlashCommandBuilder } from 'reciple';
import { EmbedBuilder, GuildMember, User } from 'discord.js';
import BaseModule from '../BaseModule';
import util from '../tools/util';
import ms from 'ms';

export class BanModule extends BaseModule {
    public onStart(client: RecipleClient<boolean>): boolean {
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
                            await this.banMember(member, interaction.user, reason ?? undefined, deleteMessagesTime ? await Promise.resolve(ms(deleteMessagesTime)).catch(() => undefined) : undefined)
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
                            await this.banMember(member, message.author, reason ?? undefined)
                        ]
                    });
                })
        ];

        return true;
    }

    public async banMember(member: GuildMember, moderator: User, reason?: string, deleteMessagesTime?: number): Promise<EmbedBuilder> {
        const banned = await member.ban({
            deleteMessageSeconds: deleteMessagesTime,
            reason: reason
        }).catch(() => null);

        if (!banned) return util.errorEmbed(`Failed to ban **${member}**`, true);

        return new EmbedBuilder()
            .setAuthor({ name: member.displayName, iconURL: member.displayAvatarURL() })
            .setDescription(reason || null)
            .setFooter({ text: `${moderator.tag} banned ${member.user.tag}`, iconURL: moderator.displayAvatarURL() })
            .setTimestamp();
    }
}

export default new BanModule();