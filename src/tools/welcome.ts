import { cwd, RecipleClient } from 'reciple';
import BaseModule from '../BaseModule';
import yml from 'yaml';
import path from 'path';
import { EmbedBuilder, GuildMember, GuildTextBasedChannel, PartialGuildMember } from 'discord.js';
import util from './util';
import { SavedMemberData } from '@prisma/client';
import userSettingsManager from './userSettingsManager';
import snipeManager from '../fun/snipeManager';

export interface WelcomeModuleConfig {
    giveRoles: string[];
    guilds: string[];
    welcomeChannels: string[];
    leaveChannels: string[];
}

export class WelcomeModule extends BaseModule {
    public config: WelcomeModuleConfig = WelcomeModule.getConfig();
    public welcomeChannels: GuildTextBasedChannel[] = [];
    public leaveChannel: GuildTextBasedChannel[] = [];

    public async onStart(client: RecipleClient<boolean>): Promise<boolean> {
        client.on('guildMemberAdd', async member => {
            if (this.config.guilds.length && !this.config.guilds.includes(member.guild.id)) return;

            const embed = new EmbedBuilder()
                .setAuthor({ name: `Welcome ${member.user.tag}`, iconURL: member.displayAvatarURL() })
                .setTitle(`Welcome to ${member.guild.name}`)
                .setThumbnail(member.guild.iconURL())
                .setColor(util.embedColor);

            await member.roles.add(member.guild.roles.cache.filter(r => this.config.giveRoles.includes(r.id)));

            for (const channel of this.welcomeChannels) {
                await channel.send({ embeds: [embed] });
            }

            const memberData = await this.getMemberData(member);

            if (memberData?.nickname) await member.setNickname(memberData.nickname);
            if (memberData?.roles) {
                const roles = JSON.parse(memberData.roles) as string[];

                await Promise.all(member.guild.roles.cache.filter(r => roles.includes(r.id)).map(async r => member.roles.add(r).catch(() => null)));
            }

            await this.deleteMemberData(member);
        });

        client.on('guildMemberRemove', async member => {
            if (this.config.guilds.length && !this.config.guilds.includes(member.guild.id)) return;

            const embed = new EmbedBuilder().setAuthor({ name: `${member.user.tag} left the server`, iconURL: member.displayAvatarURL() });

            for (const channel of this.leaveChannel) {
                await channel.send({ embeds: [embed] });
            }

            await this.saveMemberData(member);
        });

        return true;
    }

    public async onLoad(client: RecipleClient<boolean>): Promise<void> {
        for (const channelId of this.config.welcomeChannels) {
            const channel = client.channels.cache.get(channelId) ?? await client.channels.fetch(channelId).catch(() => null);
            if (channel && !channel.isDMBased() && channel.isTextBased()) this.welcomeChannels.push(channel);
        }

        for (const channelId of this.config.leaveChannels) {
            const channel = client.channels.cache.get(channelId) ?? await client.channels.fetch(channelId).catch(() => null);
            if (channel && !channel.isDMBased() && channel.isTextBased()) this.leaveChannel.push(channel);
        }
    }

    public async deleteMemberData(member: GuildMember): Promise<void> {
        await util.prisma.savedMemberData.deleteMany({
            where: {
                id: member.id,
                guildId: member.guild.id
            }
        });
    }

    public async getMemberData(member: GuildMember): Promise<SavedMemberData|null> {
        return util.prisma.savedMemberData.findFirst({
            where: {
                id: member.id,
                guildId: member.guild.id
            }
        });
    }

    public async saveMemberData(member: GuildMember|PartialGuildMember): Promise<void> {
        const userSettings = await userSettingsManager.getOrCreateUserSettings(member.id);

        if (userSettings.cleanDataOnLeave) {
            await util.prisma.snipes.deleteMany({
                where: {
                    authorId: member.id
                }
            });

            snipeManager.cache.sweep(s => s.authorId === member.id);

            return;
        }

        await util.prisma.savedMemberData.create({
            data: {
                id: member.id,
                guildId: member.guild.id,
                roles: JSON.stringify(member.roles.cache.map(r => r.id)),
                nickname: member.nickname
            }
        });
    }

    public static getConfig(): WelcomeModuleConfig {
        return yml.parse(util.createConfig(path.join(cwd, 'config/welcome/config.yml'), <WelcomeModuleConfig>({
            giveRoles: ['000000000000000000', '000000000000000000', '000000000000000000'],
            guilds: [],
            welcomeChannels: ['000000000000000000', '000000000000000000', '000000000000000000'],
            leaveChannels: ['000000000000000000', '000000000000000000', '000000000000000000'],
        })));
    }
}

export default new WelcomeModule();