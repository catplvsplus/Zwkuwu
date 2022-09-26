import { cwd, RecipleClient } from 'reciple';
import BaseModule from './BaseModule';
import yml from 'yaml';
import createConfig from './_createConfig';
import path from 'path';
import { EmbedBuilder, escapeCodeBlock, Message, TextBasedChannel, User } from 'discord.js';
import util from './tools/util';
import { Logger } from 'fallout-utility';

export interface AntiCrashModuleConfig {
    sendTo: string[];
}

export class AntiCrashModule extends BaseModule {
    public config: AntiCrashModuleConfig = AntiCrashModule.getConfig();
    public sendTo: (User|TextBasedChannel)[] = [];
    public logger!: Logger;

    public async onStart(client: RecipleClient<boolean>): Promise<boolean> {
        this.logger = client.logger.cloneLogger({ loggerName: 'AnticrashModule' });

        return true;
    }

    public async onLoad(client: RecipleClient<boolean>): Promise<void> {
        process.on('uncaughtException', async err => this.reportException(err));
        process.on('unhandledRejection', async err => this.reportException(err));
        client.on('shardError', async err => this.reportException(err));
        client.on('error', async err => this.reportException(err));

        for (const channelId of this.config.sendTo) {
            const channel = client.channels.cache.get(channelId) ?? await client.channels.fetch(channelId).catch(() => null);

            if (channel) {
                if (!channel.isTextBased()) continue;

                this.sendTo.push(channel);
                continue;
            }

            const user = client.users.cache.get(channelId) ?? await client.users.fetch(channelId).catch(() => null);
            if (user) this.sendTo.push(user);
        }

        client.commands.messageCommands.forEach(m => !m.halt ? m.setHalt(data => util.haltCommand(data)) : null);
        client.commands.slashCommands.forEach(s => !s.halt ? s.setHalt(data => util.haltCommand(data)) : null);
    }

    public async reportException(error: unknown): Promise<void> {
        this.logger.err(error);

        const embed = new EmbedBuilder()
            .setAuthor({ name: `Caught Crash Error`, iconURL: util.client.user?.displayAvatarURL() })
            .setColor(util.errorEmbedColor)
            .setDescription('```\n'+ escapeCodeBlock(error instanceof Error ? error.stack ?? error.name + ': ' + error.message : String(error)) +'\n```')
            .setTimestamp();

        for (const channel of this.sendTo) {
            await channel.send({ embeds: [embed] }).catch(() => {});
        }
    }

    public static getConfig(): AntiCrashModuleConfig {
        return yml.parse(createConfig(path.join(cwd, 'config/anticrash/config.yml'), <AntiCrashModuleConfig>({
            sendTo: ['000000000000000000', '000000000000000000']
        })));
    }
}

export default new AntiCrashModule();