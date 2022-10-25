import { Collection, UserResolvable } from 'discord.js';
import { RecipleClient } from 'reciple';
import BaseModule from '../BaseModule';
import { RawUserSettings, UserSettings } from './UserSettings/UserSettings';
import util from './util';

export class UserSettingsManagerModule extends BaseModule {
    public cache: Collection<string, UserSettings<true>> = new Collection();
    public onStart(client: RecipleClient<boolean>): boolean | Promise<boolean> {
        client.on('guildMemberRemove', async member => {
            const settings = await this.resolveUserSettings(member.id).catch(() => null);
            if (settings?.cleanDataOnLeave) {
                await settings.delete();
            }
        });

        return true;
    }

    public async getOrCreateUserSettings(id: string): Promise<UserSettings<true>> {
        return (await this.resolveUserSettings(id)) ?? this.createUserSettings(id);
    }

    public async resolveUserSettings(id: string): Promise<UserSettings<true>|undefined> {
        return this.cache.get(id) ?? this.fetchUserSettings(id).catch(() => undefined);
    }

    public async fetchUserSettings(filter: string|Partial<RawUserSettings>, cache: boolean = true): Promise<UserSettings<true>> {
        const data = await util.prisma.userSettings.findFirstOrThrow({
            where: typeof filter === 'string'
                ? { id: filter }
                : filter
        });

        const userSettings = await (new UserSettings(this, data)).fetch();
        if (cache) this.cache.set(userSettings.id, userSettings);

        return userSettings;
    }

    public async createUserSettings(user: UserResolvable, settings?: Partial<Omit<RawUserSettings, 'id'>>): Promise<UserSettings<true>> {
        const id = typeof user === 'string' ? user : user.id;
        const data = await util.prisma.userSettings.upsert({
            create: {
                ...settings,
                id
            },
            update: {
                ...settings,
                id
            },
            where: { id }
        });

        const userSettings = await (new UserSettings(this, data)).fetch();
        this.cache.set(userSettings.id, userSettings);

        return userSettings;
    }
}

export default new UserSettingsManagerModule();