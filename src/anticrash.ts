import { RecipleClient, RecipleModule } from 'reciple';
import { BaseModule } from './BaseModule.js';
import utility, { Logger } from './utils/utility.js';
import { EmbedBuilder, TextBasedChannel, escapeCodeBlock } from 'discord.js';

export interface AnticrashConfig {
    errorReportsChannelIds: string[];
    reportToUsers: string[];
}

export class AnticrashModule extends BaseModule {
    public logger?: Logger;
    public reportChannels: TextBasedChannel[] = [];

    get config() { return utility.config.anticrash; }

    public async onStart(client: RecipleClient<boolean>): Promise<boolean> {
        this.logger = client.logger?.clone({ name: 'AntiCrash' });

        return true;
    }

    public async onLoad(client: RecipleClient<boolean>): Promise<void> {
        process.on('unhandledRejection', err => this.report(err));
        process.on('uncaughtException', err => this.report(err));

        client.on('error', err => this.report(err));
        client.on('debug', debug => this.logger?.debug(debug));
        client.on('warn', warn => this.logger?.debug(warn));

        this.logger?.warn(`Listening to process error events!`);

        client.once('recipleRegisterApplicationCommands', () => {
            client.commands.messageCommands.forEach(m => {
                m.setValidateOptions(true);

                if (m.halt) return;

                m.setHalt(data => utility.haltCommand(data))
                this.logger?.debug(`Added halt function to message command ${m.name}`)
            });

            client.commands.slashCommands.forEach(s => {
                if (s.halt) return;

                s.setHalt(data => utility.haltCommand(data))
                this.logger?.debug(`Added halt function to slash command ${s.name}`)
            });
        });

        for (const channelId of this.config.errorReportsChannelIds) {
            const channel = await utility.resolveFromCachedManager(channelId, client.channels).catch(() => null);
            if (channel?.isTextBased()) this.reportChannels.push(channel);
        }

        for (const userId of this.config.reportToUsers) {
            const user = await utility.resolveFromCachedManager(userId, client.users).catch(() => null);
            if (!user?.dmChannel) await user?.createDM().catch(() => null);
            if (user?.dmChannel) this.reportChannels.push(user.dmChannel);
        }
    }

    public async report(error: unknown): Promise<void> {
        this.logger?.error(error);

        const embed = new EmbedBuilder()
            .setAuthor({ name: `Caught Crash Error`, iconURL: utility.client.user?.displayAvatarURL() })
            .setColor(utility.config.errorEmbedColor)
            .setDescription('```\n'+ escapeCodeBlock(error instanceof Error ? error.stack ?? error.name + ': ' + error.message : String(error)) +'\n```')
            .setTimestamp();

        for (const channel of this.reportChannels) {
            await channel?.send({
                embeds: [embed]
            }).catch(err => this.logger?.debug(`Failed to send error report to ${channel.id}:`, err));
        }
    }
}

export default new AnticrashModule();