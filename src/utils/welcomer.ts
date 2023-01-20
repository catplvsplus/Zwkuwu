import { RecipleClient } from 'reciple';
import { BaseModule } from '../BaseModule.js';
import { BaseMessageOptions, EmbedBuilder, GuildMember, Message, PartialGuildMember } from 'discord.js';
import utility from './utility.js';
import userSettings from './userSettings.js';

export interface WelcomerConfig {
    guilds: {
        guildId: string;
        welcomeChannelIds: string[];
        leaveChannelIds: string[];
        ignoreBots?: boolean;
    }[];
    ignoreBots: boolean;
}

export class WelcomerModule extends BaseModule {
    get config() { return utility.config.welcomer; }

    public async onStart(client: RecipleClient<boolean>): Promise<boolean> {
        return true;
    }

    public async onLoad(client: RecipleClient<boolean>): Promise<void> {
        client.on('guildMemberAvailable', async member => {
            const welcomerData = this.config.guilds.find(i => i.guildId === member.guild.id);
            if (!welcomerData) return;
            if ((welcomerData.ignoreBots ?? this.config.ignoreBots) && member.user.bot) return;

            await this.sendWelcomeMessage(member, welcomerData.welcomeChannelIds);

            if (member.user.bot) return;
            const savedData = await utility.prisma.savedMemberData.findFirst({ where: { id: member.id, guildId: member.guild.id } });
            if (!savedData) return;

            await utility.prisma.savedMemberData.deleteMany({ where: { id: member.id, guildId: member.guild.id } });

            if (savedData.nickname) await member.setNickname(savedData.nickname);
            if (savedData.roles) await member.roles.add(JSON.parse(savedData.roles));
        });

        client.on('guildMemberRemove', async member => {
            const welcomerData = this.config.guilds.find(i => i.guildId === member.guild.id);
            if (!welcomerData) return;
            if ((welcomerData.ignoreBots ?? this.config.ignoreBots) && member.user.bot) return;

            await this.sendLeaveMessage(member, welcomerData.leaveChannelIds);

            if (member.user.bot) return;
            const settings = await userSettings.fetchUserSettings(member.id);
            if (settings.cleanDataOnLeave) return;

            const roles = JSON.stringify(member.roles.cache.toJSON().map(r => r.id));
            const nickname = member.nickname;

            await utility.prisma.savedMemberData.create({
                data: {
                    id: member.id,
                    guildId: member.guild.id,
                    roles,
                    nickname
                }
            });
        });
    }

    public async sendWelcomeMessage(member: GuildMember|PartialGuildMember, channelIds: string[]): Promise<Message[]> {
        return Promise.all(channelIds.map(async channelId => {
            const channel = await utility.resolveFromCachedManager(channelId, utility.client.channels);
            if (!channel?.isTextBased() || channel.isDMBased()) throw new Error(`Cannot find valid guild based text channel with id (${channelId})`);

            return channel.send({
                embeds: [
                    new EmbedBuilder()
                        .setAuthor({ name: `${member.displayName} joined the server`, iconURL: member.displayAvatarURL() })
                        .setColor(utility.config.embedColor)
                ]
            });
        }));
    }

    public async sendLeaveMessage(member: GuildMember|PartialGuildMember, channelIds: string[]): Promise<Message[]> {
        return Promise.all(channelIds.map(async channelId => {
            const channel = await utility.resolveFromCachedManager(channelId, utility.client.channels);
            if (!channel?.isTextBased() || channel.isDMBased()) throw new Error(`Cannot find valid guild based text channel with id (${channelId})`);

            return channel.send({
                embeds: [
                    new EmbedBuilder()
                        .setAuthor({ name: `${member.displayName} left the server`, iconURL: member.displayAvatarURL() })
                        .setColor('Grey')
                ]
            });
        }));
    }
}

export default new WelcomerModule();