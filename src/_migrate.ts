import { PrismaClient as NewPrismaClient } from '@prisma/client';
import { PrismaClient as OldPrismaClient } from '@prisma/old-schema';
import { Logger, path } from 'fallout-utility';
import { existsSync, readFileSync } from 'fs';

const newPrismaClient = new NewPrismaClient();
const oldPrismaClient = new OldPrismaClient();

const console = new Logger();

export async function migrateUserSettings(): Promise<void> {
    console.log(`Migrating user settings...`);

    const oldUserSettings = await oldPrismaClient.userSettings.findMany();

    for (const oldUserSettingsData of oldUserSettings) {
        await newPrismaClient.userSettings.create({
            data: oldUserSettingsData
        })
        .then(() => console.log(`Migrated user settings ${oldUserSettingsData.id}`))
        .catch(err => console.log(`Couldn't migrate user settings: `, err));
    }

    console.log(`Migrated ${oldUserSettings.length} user settings!`);
}

export async function migrateSnipes(): Promise<void> {
    console.log(`Migrating snipes...`);

    const oldSnipes = await oldPrismaClient.snipes.findMany();

    for (const oldSnipe of oldSnipes) {
        await newPrismaClient.snipedMessages.create({
            data: {
                id: oldSnipe.id,
                attachmentCount: oldSnipe.attachments,
                authorId: oldSnipe.authorId,
                channelId: oldSnipe.channelId,
                content: oldSnipe.content,
                createdAt: oldSnipe.createdAt,
                edited: oldSnipe.edited,
                referencedUserId: oldSnipe.repliedToUserId
            }
        })
        .then(() => console.log(`Migrated snipe ${oldSnipe.id}: ${oldSnipe.content}`))
        .catch(err => console.log(`Couldn't migrate snipe: `, err));
    }

    console.log(`Migrated ${oldSnipes.length} snipes!`);
}

export async function migrateConfessions(): Promise<void> {
    console.log(`Migrating confessions...`);

    const oldConfessions = await oldPrismaClient.confessions.findMany();

    for (const oldConfession of oldConfessions) {
        await newPrismaClient.confessions.create({
            data: {
                id: oldConfession.messageId,
                authorId: oldConfession.authorId,
                channelId: oldConfession.channelId,
                content: oldConfession.content,
                createdAt: oldConfession.createdAt,
                referenceId: null,
                title: oldConfession.title
            }
        })
        .then(() => console.log(`Migrated confession ${oldConfession.messageId}: ${oldConfession.content}`))
        .catch(err => console.log(`Couldn't migrate confession: `, err));
    }

    console.log(`Migrated ${oldConfessions.length} confessions!`);
}

export async function migrateMinecraftIPCache(): Promise<void> {
    console.log(`Migrating IP cache...`);

    const oldIPCache = await oldPrismaClient.minecraftIPCache.findMany();

    for (const oldIPCacheData of oldIPCache) {
        await newPrismaClient.minecraftIPCache.create({
            data: {
                host: `${oldIPCacheData.host}${oldIPCacheData.port ? ':' + oldIPCacheData.port : ''}`,
                proxy: oldIPCacheData.proxy,
                createdAt: oldIPCacheData.createdAt
            }
        })
        .then(() => console.log(`Migrated cached IP ${oldIPCacheData.id}: ${oldIPCacheData.host}${oldIPCacheData.port ? ':' + oldIPCacheData.port : ''} ${oldIPCacheData.proxy}`))
        .catch(err => console.log(`Couldn't migrate cached IP: `, err));
    }

    console.log(`Migrated ${oldIPCache.length} cached IP!`);
}

export async function migrateSavedMemberData(): Promise<void> {
    console.log(`Migrating saved members...`);

    const oldSavedMembers = await oldPrismaClient.savedMemberData.findMany();

    for (const oldSavedMember of oldSavedMembers) {
        await newPrismaClient.savedMemberData.create({
            data: oldSavedMember
        })
        .then(() => console.log(`Migrated Saved member ${oldSavedMember.id}`))
        .catch(err => console.log(`Couldn't migrate Saved member: `, err));
    }

    console.log(`Migrated ${oldSavedMembers.length} saved members`);
}

export async function migrateSkinData(): Promise<void> {
    console.log(`Migrate old skin data...`);

    const oldSkinsData = await oldPrismaClient.playerSkinData.findMany();

    for (const oldSkinData of oldSkinsData) {
        let fileBase64: string|null = null;

        if (oldSkinData.file) {
            const filePath = path.join('config/playerSkinData/skins/', oldSkinData.file);

            if (!existsSync(filePath)) {
                console.err(`Couldn't migrate skin data: ${filePath} doesn't exists`);
                continue;
            }

            fileBase64 = readFileSync(filePath, 'base64');
        }

        await newPrismaClient.playerSkinData.create({
            data: {
                username: oldSkinData.player,
                authorizedUserId: null,
                skinData: fileBase64,
                createdAt: oldSkinData.createdAt
            }
        })
        .then(() => console.log(`Migrated player skin data ${oldSkinData.player}`))
        .catch(err => console.log(`Couldn't migrate player skin data: `, err));
    }

    console.log(`Migrated ${oldSkinsData.length} skins`);
}