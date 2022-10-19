import { cwd, RecipleClient } from 'reciple';
import BaseModule from './BaseModule';
import yml from 'yaml';
import createConfig from './_createConfig';
import path from 'path';
import { EmbedBuilder, escapeCodeBlock, TextBasedChannel, User } from 'discord.js';
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
        client.on('error', async err => this.reportException(err));
        client.on('debug', debug => this.logger.debug(debug));
        client.on('warn', warn => this.logger.debug(warn));

        this.logger.warn('Listening to uncaught error events!');

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

        client.once('recipleRegisterApplicationCommands', () => {
            client.commands.messageCommands.forEach(m => {
                m.setValidateOptions(true);

                if (m.halt) return;

                m.setHalt(data => util.haltCommand(data))
                this.logger.debug(`Added halt function to message command ${m.name}`)
            });
    
            client.commands.slashCommands.forEach(s => {
                if (s.halt) return;
    
                s.setHalt(data => util.haltCommand(data))
                this.logger.debug(`Added halt function to slash command ${s.name}`)
            });
        });
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