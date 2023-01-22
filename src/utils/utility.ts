import { AnyCommandHaltData, CommandHaltReason, CommandType, RecipleClient, SlashCommandHaltData, cwd } from 'reciple';
import { Config, defaultconfig } from '../Config.js';
import { BaseModule } from '../BaseModule.js';
import { createLogger } from 'reciple';
import { PrismaClient } from '@prisma/client';
import { createReadFile, path } from 'fallout-utility';
import express, { Express } from 'express';
import yml from 'yaml';
import lodash from 'lodash';
import { BaseMessageOptions, Collection, EmbedBuilder } from 'discord.js';
import { writeFileSync } from 'fs';
import axios from 'axios';
import anticrash from '../anticrash.js';
import ms from 'ms';

const { defaultsDeep } = lodash;

export type Logger = ReturnType<typeof createLogger>;
export type DoNothing<T> = T;

export class Utility extends BaseModule {
    public client!: RecipleClient<true>;
    public prisma: PrismaClient = new PrismaClient();
    public express: Express = express();
    public logger!: Logger;

    public config: Config = createReadFile(path.join(cwd, 'config/config.yml'), defaultconfig, {
        encodeFileData: data => yml.stringify(data),
        formatReadData: data => {
            const config: Config = defaultsDeep(yml.parse(data.toString()), defaultconfig);
            writeFileSync(path.join(cwd, 'config/config.yml'), yml.stringify(config));
            return config;
        }
    });

    get user() { return this.client.user; }

    public async onStart(client: RecipleClient<boolean>): Promise<boolean> {
        this.client = client;
        this.logger = client.logger.cloneLogger({ loggerName: 'Utility' });

        this.logger.log('Config loaded:', this.config);

        return true;
    }

    public async onLoad(client: RecipleClient<boolean>): Promise<void> {
        const port = this.config.expressPort || process.env.EXPRESS_PORT || 5133;

        this.express.listen(port, () => this.logger.warn('Server is listening on port ' + port));
    }

    public createSmallEmbed(content: string, options?: { useDescription?: true; positive?: boolean }|{ useDescription?: false; positive?: boolean; disableAvatar?: boolean; }): EmbedBuilder {
        const embed = new EmbedBuilder().setColor(options?.positive === false ? this.config.errorEmbedColor : this.config.embedColor);

        if (options?.useDescription === true) {
            embed.setDescription(content);
        } else {
            embed.setAuthor({ name: content, iconURL: (options as { disableAvatar?: boolean; })?.disableAvatar ? undefined : this.user.displayAvatarURL() })
        }

        return embed;
    }

    public isSlashCommandHaltData(haltData: AnyCommandHaltData): haltData is SlashCommandHaltData {
        return haltData.executeData.builder.type === CommandType.SlashCommand;
    }

    public async haltCommand(haltData: AnyCommandHaltData): Promise<boolean> {
        const repliable = (message: BaseMessageOptions) => this.isSlashCommandHaltData(haltData)
            ? haltData.executeData.interaction.deferred && !haltData.executeData.interaction.replied
                ? haltData.executeData.interaction.editReply(message)
                : haltData.executeData.interaction.deferred && haltData.executeData.interaction.replied
                    ? haltData.executeData.interaction.followUp(message)
                    : haltData.executeData.interaction.reply(message)
            : haltData.executeData.message.reply(message);

        const replyBase = { ephemeral: this.config.ephemeralHaltMessages, failtIfNotExists: false };

        switch (haltData.reason) {
            case CommandHaltReason.Cooldown:
                await repliable({
                    ...replyBase,
                    embeds: [
                        this.createSmallEmbed(`Wait \`${ms(haltData.expireTime - Date.now(), { long: true })}\` to execute this command.`)
                    ]
                });

                return true;
            case CommandHaltReason.Error:
                await repliable({
                    ...replyBase,
                    embeds: [
                        this.createSmallEmbed(`An error occured executing this command.`, { positive: false })
                    ]
                });

                await anticrash.report(haltData.error);

                return true;
            case CommandHaltReason.InvalidArguments:
                await repliable({
                    ...replyBase,
                    embeds: [
                        this.createSmallEmbed(`Invalid command argumentst${haltData.invalidArguments.length > 1 ? 's' : ''} ${haltData.invalidArguments.map(m => `\`${m.name}\``).join(' ')}`, { positive: false })
                    ]
                });

                return true;
            case CommandHaltReason.MissingArguments:
                await repliable({
                    ...replyBase,
                    embeds: [
                        this.createSmallEmbed(`Missing required command argument${haltData.missingArguments.length > 1 ? 's' : ''} ${haltData.missingArguments.map(m => `\`${m.name}\``).join(' ')}`, { positive: false })
                    ]
                });

                return true;
            case CommandHaltReason.MissingBotPermissions:
                await repliable({
                    ...replyBase,
                    embeds: [
                        this.createSmallEmbed(`${this.client.user?.tag} doesn't have enough permissions in this channel.`, { positive: false })
                    ]
                });

                return true;
            case CommandHaltReason.MissingMemberPermissions:
                await repliable({
                    ...replyBase,
                    embeds: [
                        this.createSmallEmbed(`You do not have enough permissions to this command.`, { positive: false })
                    ]
                });

                return true;
        }
    }

    public async downloadBuffer(url: string, method: 'GET'|'POST'): Promise<Buffer> {
        const http = await axios({ url, method, responseType: 'arraybuffer' });
        return http.data;
    }

    public async resolveFromCachedManager<V>(id: string, manager: { cache: Collection<string, V>; fetch(key: string): Promise<V|null> }): Promise<V> {
        const data = manager.cache.get(id) ?? await manager.fetch(id);
        if (data === null) throw new Error(`Couldn't fetch (${id}) from manager`);
        return data;
    }

    public formatNumber(number: number): string {
        if (number >= 1000000000) return (number / 1000000000).toFixed(1).replace(/\.0$/, '') + 'B';
        if (number >= 1000000) return (number / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
        if (number >= 1000) return (number / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
        return String(number);
    }

    public isValidIP(ip: string): boolean {
        return /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(ip);
    }
}

export default new Utility();