import { RecipleClient, SlashCommandBuilder } from 'reciple';
import { EmbedBuilder } from 'discord.js';
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

                    if (!member.manageable || !member.bannable) {
                        await interaction.reply({ embeds: [util.errorEmbed(`No permissions to ban **${member}**`, true)], ephemeral: true });
                        return;
                    }

                    const banned = await member.ban({
                        deleteMessageSeconds: deleteMessagesTime ? await Promise.resolve(ms(deleteMessagesTime)).catch(() => undefined) : undefined,
                        reason: reason ? `${interaction.user} — ${reason}` : undefined
                    }).catch(() => null);

                    if (!banned) {
                        await interaction.reply({ embeds: [util.errorEmbed(`Failed to ban **${member}**`, true)], ephemeral: true });
                        return;
                    }

                    await interaction.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setAuthor({ name: member.displayName, iconURL: member.displayAvatarURL() })
                                .setDescription(reason)
                                .setFooter({ text: `${interaction.user.tag} banned ${member.user.tag}`, iconURL: interaction.user.displayAvatarURL() })
                                .setTimestamp()
                        ]
                    });
                })
        ];

        return true;
    }
}

export default new BanModule();