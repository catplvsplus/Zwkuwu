import { PrismaClient, UserSettings as PrismaUserSettings } from '@prisma/client';
import { If, User } from 'discord.js';
import { RecipleClient } from 'reciple';
import { UserSettingsManagerModule } from '../userSettingsManager';
import util from '../util';

export interface RawUserSettings extends PrismaUserSettings {};

export class UserSettings<Fetched extends boolean = boolean> implements RawUserSettings {
    private _user: User|null = null;
    private _id: string;
    private _allowSniping: boolean;
    private _allowNewLevelPing: boolean;
    private _cleanDataOnLeave: boolean;
    private _deleted: boolean = false;

    readonly userSettingsManager: UserSettingsManagerModule;
    readonly client: RecipleClient;
    readonly prisma: PrismaClient;

    get user() { return this._user as If<Fetched, User>; }
    get id() { return this._id; }
    get allowSniping() { return this._allowSniping; }
    get allowNewLevelPing() { return this._allowNewLevelPing; }
    get cleanDataOnLeave() { return this._cleanDataOnLeave; }
    get deleted() { return this._deleted; }

    constructor(userSettingsManager: UserSettingsManagerModule, rawUserSettings: Partial<RawUserSettings> & { id: string; }) {
        this.userSettingsManager = userSettingsManager;
        this.client = util.client;
        this.prisma = util.prisma;

        this._id = rawUserSettings.id;
        this._allowSniping = rawUserSettings.allowSniping ?? true;
        this._allowNewLevelPing = rawUserSettings.allowNewLevelPing ?? true;
        this._cleanDataOnLeave = rawUserSettings.cleanDataOnLeave ?? false;

        this._user = this.client.users.cache.get(this.id) || null;
    }

    public async fetch(): Promise<UserSettings<true>> {
        const data = await this.prisma.userSettings.findFirst({
            where: { id: this.id }
        });

        if (!data) {
            await this.delete();
            throw new Error('No user settings found');
        }

        this._allowSniping = data.allowSniping;
        this._allowNewLevelPing = data.allowNewLevelPing;
        this._cleanDataOnLeave = data.cleanDataOnLeave;

        this._user = await this.client.users.fetch(this.id);

        return this as UserSettings<true>;
    }

    public async delete(): Promise<void> {
        await this.prisma.userSettings.delete({
            where: { id: this.id }
        });

        this._deleted = true;
        this.userSettingsManager.cache.sweep(u => u.deleted);
    }

    public async update(data: Partial<Omit<RawUserSettings, 'id'>>): Promise<this> {
        await this.prisma.userSettings.upsert({
            create: {
                ...data,
                id: this.id
            },
            update: {
                ...data,
                id: this.id
            },
            where: { id: this.id }
        });

        this._allowSniping = data.allowSniping ?? this._allowSniping;
        this._allowNewLevelPing = data.allowNewLevelPing ?? this._allowNewLevelPing;
        this._cleanDataOnLeave = data.cleanDataOnLeave ?? this._cleanDataOnLeave;

        return this;
    }

    public isFetched(): this is UserSettings<true> {
        return this._user !== null;
    }
}