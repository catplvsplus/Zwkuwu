import { GuildMember } from 'discord.js';
import { replaceAll, trimChars } from 'fallout-utility';
import { RecipleClient } from 'reciple';
import BaseModule from '../BaseModule';
import userSettingsManager from '../tools/userSettingsManager';

export class QuismosEventModule extends BaseModule {
    public async onStart(client: RecipleClient<boolean>): Promise<boolean> {
        return true;
    }

    public async onLoad(client: RecipleClient<boolean>): Promise<void> {
        client.once('recipleRegisterApplicationCommands', async () => {
            const guilds = client.guilds.cache.toJSON();

            for (const guild of guilds) {
                const members = guild.members.cache.toJSON();

                for (const member of members) {
                    if ((await userSettingsManager.resolveUserSettings(member.id))?.allowSeasonalNicknames === false) continue;

                    (!this.isQuismosSeason() ? this.removeNickname(member) : this.setMemberNickname(member))
                        .then(name => client.logger.debug(`Set ${member.user.tag} nickname to '${name}'`))
                        .catch(err => client.logger.debug(`Cannot set ${member.user.tag} nickname`, err));
                }
            }
        });

        client.on('guildMemberUpdate', async (old, member) => {
            if (!this.isQuismosSeason() || (await userSettingsManager.resolveUserSettings(member.id))?.allowSeasonalNicknames === false) return;
            if (member.displayName.includes('🎄')) return;

            await this.setMemberNickname(member)
                .then(name => client.logger.debug(`Set ${member.user.tag} nickname to '${name}'`))
                .catch(err => client.logger.debug(`Cannot set ${member.user.tag} nickname`, err));
        });
    }

    public async setMemberNickname(member: GuildMember): Promise<string> {
        let name = member.displayName;

        if (name.includes('🎄')) return name;

        name = (name.startsWith('!') ? '!🎄 ' : '🎄 ') + trimChars(name, '!');

        await member.setNickname(name, 'Quismos season');

        return name;
    }

    public async removeNickname(member: GuildMember): Promise<string|null> {
        let name = member.nickname;
        if (!name) return name;

        name = replaceAll(name, '🎄', '').trim();
        name = name === member.user.username ? null : name;

        await member.setNickname(name, 'Goodbye santa');

        return name;
    }

    public isQuismosSeason(): boolean {
        const date = new Date();
        return date.getMonth() === 11 && date.getDate() <= 25;
    }
}

export default new QuismosEventModule();