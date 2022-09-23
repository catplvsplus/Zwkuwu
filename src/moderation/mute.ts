import { EmbedBuilder, GuildMember, User } from 'discord.js';
import { Logger } from 'fallout-utility';
import ms from 'ms';
import { MessageCommandBuilder, RecipleClient, SlashCommandBuilder } from 'reciple';
import BaseModule from '../BaseModule';
import util from '../tools/util';

export class MuteModule extends BaseModule {
    public logger!: Logger;

    public async onStart(client: RecipleClient<boolean>): Promise<boolean> {
        this.logger = client.logger.cloneLogger({ loggerName: 'MuteModule' });
        this.commands = [
            new SlashCommandBuilder()
                .setName('mute')
                .setDescription('Mute someone')
                .setRequiredMemberPermissions('ModerateMembers')
                .addUserOption(member => member
                    .setName('member')
                    .setDescription('Mute this annoying piece of shit')
                    .setRequired(true)
                )
                .addStringOption(duration => duration
                    .setName('duration')
                    .setDescription('How long? 1m? 1h? or 1d?')
                    .setRequired(true)
                )
                .addStringOption(reason => reason
                    .setName('reason')
                    .setDescription('Say fuck off')
                    .setRequired(false)    
                )
                .setExecute(async data => {
                    const interaction = data.interaction;
                    const user = interaction.options.getUser('member', true);
                    const duration = interaction.options.getString('duration', true);
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
                            await this.mute(member, interaction.user, ms(duration), reason)
                        ]
                    });
                }),
            new MessageCommandBuilder()
                .setName('mute')
                .setDescription('Mute someone')
                .setRequiredMemberPermissions('ModerateMembers')
                .addOption(member => member
                    .setName('member')
                    .setDescription('Mute this annoying piece of shit')
                    .setRequired(true)
                    .setValidator(value => !!util.resolveMentionOrId(value))    
                )
                .addOption(duration => duration
                    .setName('duration')
                    .setDescription('How long? 1m? 1h? or 1d?')
                    .setRequired(true)
                    .setValidator(async value => !!(await Promise.resolve(ms(value)).catch(() => false)))
                )
                .addOption(reason => reason
                    .setName('reason')
                    .setDescription('Say fuck off')
                    .setRequired(false)
                )
                .setExecute(async data => {
                    const message = data.message;
                    const user = await util.resolveMentionOrId(data.options.getValue('member', true));
                    const duration = data.options.getValue('duration', true);
                    const reason = data.command.args.slice(2).join(' ');

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
                            await this.mute(member, message.author, ms(duration), reason)
                        ]
                    });
                }),
            new SlashCommandBuilder()
                .setName('unmute')
                .setDescription('Forgive muted member')
                .setRequiredMemberPermissions('ModerateMembers')
                .addUserOption(member => member
                    .setName('member')
                    .setDescription('Unmute this annoying piece of shit')
                    .setRequired(true)
                )
                .addStringOption(reason => reason
                    .setName('reason')
                    .setDescription('Why?')
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
                            await this.unmute(member, interaction.user, reason)
                        ]
                    });
                }),
            new MessageCommandBuilder()
                .setName('unmute')
                .setDescription('Forgive muted member')
                .setRequiredMemberPermissions('ModerateMembers')
                .addOption(member => member
                    .setName('member')
                    .setDescription('Mute this annoying piece of shit')
                    .setRequired(true)
                    .setValidator(value => !!util.resolveMentionOrId(value))    
                )
                .addOption(reason => reason
                    .setName('reason')
                    .setDescription('Why?')
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
                            await this.unmute(member, message.author, reason)
                        ]
                    });
                })
        ];

        return true;
    }

    public async mute(member: GuildMember, moderator: User, time: number, reason?: string|null): Promise<EmbedBuilder> {
        if (!member.moderatable) return util.errorEmbed(`No permissions to unmute ${member}`, true);

        const mute = await member.timeout(time, reason ? `${moderator.tag} — ${reason}` : undefined).catch(err => this.logger.err(err));
        if (!mute) return util.errorEmbed(`Can't mute ${member}`, true);

        return new EmbedBuilder()
            .setAuthor({ name: `Muted ${mute.displayName}`, iconURL: mute.displayAvatarURL() })
            .setDescription(reason || null)
            .setFooter({ text: `${moderator.tag} muted ${mute.user.tag} | ${ms(time, { long: true })}`, iconURL: mute.displayAvatarURL() })
            .setTimestamp();
    }

    public async unmute(member: GuildMember, moderator: User, reason?: string|null): Promise<EmbedBuilder> {
        if (!member.moderatable) return util.errorEmbed(`No permissions to unmute ${member}`, true);
        if (!member.isCommunicationDisabled()) return util.errorEmbed(`${member} is not muted`, true);

        const unmute = await member.timeout(null, reason ? `${moderator.tag} — ${reason}` : undefined).catch(err => this.logger.err(err));
        if (!unmute) return util.errorEmbed(`Can't unmute ${member}`, true);

        return new EmbedBuilder()
            .setAuthor({ name: `Unmuted ${unmute.displayName}`, iconURL: unmute.displayAvatarURL() })
            .setDescription(reason || null)
            .setFooter({ text: `${moderator.tag} unmuted ${unmute.user.tag}`, iconURL: unmute.displayAvatarURL() })
            .setTimestamp()
            .setColor(util.embedColor);
    }
}

export default new MuteModule();