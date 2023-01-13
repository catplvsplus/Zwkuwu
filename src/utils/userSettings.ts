import { RecipleClient } from 'reciple';
import { BaseModule } from '../BaseModule.js';
import { UserSettings } from '@prisma/client';
import utility from './utility.js';

export class UserSettingsModule extends BaseModule {
    public async onStart(client: RecipleClient<boolean>): Promise<boolean> {
        return true;
    }

    public async fetchUserSettings(userId: string): Promise<UserSettings> {
        const data = await utility.prisma.userSettings.findFirst({ where: { id: userId } });
        return data === null ? this.updateUserSettings(userId) : data;
    }

    public async updateUserSettings(id: string, newData?: Partial<UserSettings>): Promise<UserSettings> {
        return utility.prisma.userSettings.upsert({
            create: { id },
            update: { ...newData, id },
            where: { id }
        });
    }
}

export default new UserSettingsModule();