import { cwd, RecipleClient } from 'reciple';
import BaseModule from '../BaseModule';
import yml from 'yaml';
import path from 'path';
import { GuildTextBasedChannel } from 'discord.js';
import wildcardMatch from 'wildcard-match';
import { escapeRegExp, replaceAll } from 'fallout-utility';
import util from '../tools/util';

export interface MinecraftBannedWordsModuleConfig {
    bannedWords: {
        word: string;
        punishments: string[];
    }[];
    applicationId: string;
    consoleChannel: string;
    gameChatsChannel: string;
}

export class MinecraftBannedWordsModule extends BaseModule {
    public config: MinecraftBannedWordsModuleConfig = MinecraftBannedWordsModule.getConfig();
    public consoleChannel!: GuildTextBasedChannel;
    public gameChatsChannel!: GuildTextBasedChannel;

    public async onStart(client: RecipleClient<boolean>): Promise<boolean> {
        client.on('messageCreate', async message => {
            if (message.channel.id !== this.config.gameChatsChannel || message.applicationId !== this.config.applicationId) return;

            const matches = this.config.bannedWords.filter(word => wildcardMatch(word.word)(message.content));
            if (!matches.length) return;

            const commands: string[] = [];
            matches.forEach(word => commands.push(...word.punishments.map(cmd => replaceAll(cmd, ['$1', '$2'].map(s => escapeRegExp(s)), [message.author.username, word.word]))));

            for (const command of commands) {
                await this.consoleChannel.send(command);
            }
        });

        return true;
    }

    public async onLoad(client: RecipleClient<boolean>): Promise<void> {
        const consoleChannel = client.channels.cache.get(this.config.consoleChannel) ?? await client.channels.fetch(this.config.consoleChannel).catch(() => null);
        const gameChatsChannel = client.channels.cache.get(this.config.gameChatsChannel) ?? await client.channels.fetch(this.config.gameChatsChannel).catch(() => null);

        if ((!consoleChannel || consoleChannel.isDMBased() || !consoleChannel.isTextBased()) || (!gameChatsChannel || gameChatsChannel.isDMBased() || !gameChatsChannel.isTextBased())) throw new Error("Invalid console or game chats channel id");
        if (!consoleChannel.permissionsFor(client.user!)?.has('SendMessages')) throw new Error("Cannot send message to console channel");

        this.consoleChannel = consoleChannel;
        this.gameChatsChannel = gameChatsChannel;
    }

    public static getConfig(): MinecraftBannedWordsModuleConfig {
        return yml.parse(util.createConfig(path.join(cwd, 'config/minecraftBannedWords/config.yml'), <MinecraftBannedWordsModuleConfig>({
            bannedWords: [
                {
                    word: 'you\'re ugly',
                    punishments: [
                        'kick $1 banned word'
                    ]
                }
            ],
            applicationId: '0000000000000000000',
            consoleChannel: '0000000000000000000',
            gameChatsChannel: '0000000000000000000'
        })));
    }
}

export default new MinecraftBannedWordsModule();