import { EmbedBuilder, Guild, User } from 'discord.js';
import { Logger } from 'fallout-utility';
import { MessageCommandBuilder, RecipleClient, SlashCommandBuilder } from 'reciple';
import BaseModule from '../BaseModule';
import util from '../tools/util';

export class UnbanModule extends BaseModule {
    public logger!: Logger;

    public async onStart(client: RecipleClient<boolean>): Promise<boolean> {
        this.logger = client.logger.cloneLogger({ loggerName: `BanModule` });
        this.commands = [
            new SlashCommandBuilder()
                .setName('unban')
                .setDescription('Unban someone')
                .setRequiredMemberPermissions('BanMembers')
                .addStringOption(user => user
                    .setName('user')
                    .setDescription('Unban this user')
                    .setAutocomplete(true)
                    .setRequired(true)
                )
                .addStringOption(reason => reason
                    .setName('reason')
                    .setDescription('Why?')
                    .setRequired(false)    
                )
                .setExecute(async data => {
                    const interaction = data.interaction;
                    const userResolvable = util.getMentionId(interaction.options.getString('user', true));
                    const reason = interaction.options.getString('reason');

                    if (!interaction.inCachedGuild()) {
                        await interaction.reply({ embeds: [util.errorEmbed(`You're not in a server`)] });
                        return;
                    }

                    await interaction.deferReply();
                    await interaction.editReply({
                        embeds: [
                            await this.unbanUser(interaction.guild, interaction.user, userResolvable, reason)
                        ]
                    });
                }),
            new MessageCommandBuilder()
                .setName('unban')
                .setDescription('Unban someone')
                .setRequiredMemberPermissions('BanMembers')
                .addOption(user => user
                    .setName('user')
                    .setDescription('Unban this user')
                    .setRequired(true)
                    .setValidator(async value => !!await util.resolveMentionOrId(value))
                )
                .setExecute(async data => {
                    const message = data.message;
                    const userResolvable = util.getMentionId(data.options.getValue('user', true));
                    const reason = data.command.args.slice(1).join(' ');

                    if (!message.inGuild()) {
                        await message.reply({ embeds: [util.errorEmbed(`You're not in a server`)] });
                        return;
                    }

                    await message.reply({
                        embeds: [
                            await this.unbanUser(message.guild, message.author, userResolvable, reason)
                        ]
                    });
                })
        ];

        return true;
    }

    public async unbanUser(guild: Guild, moderator: User, query: string, reason?: string|null): Promise<EmbedBuilder> {
        const user = await util.resolveMentionOrId(query).then(u => u?.id).catch(() => null) || query;
        const bannedUser = guild.bans.cache.find(u => u.user.id == user || u.user.tag == user) || await guild.bans.fetch(user).catch(() => null);
        if (!bannedUser) return util.errorEmbed(`User **${query}** not found`, true);

        const unbanned = await guild.bans.remove(user, reason ? `${moderator.tag} — ${reason}` : undefined).catch(this.logger.err);
        if (!unbanned) return util.errorEmbed(`Failed to unban **${query}**`, true);

        return new EmbedBuilder()
            .setAuthor({ name: `Unbanned ${unbanned.tag}`, iconURL: unbanned?.displayAvatarURL() })
            .setDescription(reason ?? null)
            .setFooter({ text: `${moderator.tag} unbanned ${unbanned.tag}`, iconURL: moderator.displayAvatarURL() })
            .setColor(util.embedColor)
            .setTimestamp();
    }
}