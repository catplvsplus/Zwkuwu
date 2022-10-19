import { AnyCommandHaltData, CommandHaltReason, cwd, RecipleClient, SlashCommandBuilder, SlashCommandHaltData } from 'reciple';
import { ColorResolvable, EmbedBuilder, EmojiResolvable, User,UserMention, UserResolvable } from 'discord.js';
import BaseModule from '../BaseModule';
import path from 'path';
import yml from 'yaml';
import ms from 'ms';
import { PrismaClient } from '@prisma/client';
import anticrash from '../anticrash';
import { getRandomKey, Logger } from 'fallout-utility';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';

export interface UtilModuleConfig {
    embedColor: ColorResolvable;
    errorEmbedColor: ColorResolvable;
    mentionReactions: EmojiResolvable[];
}

export class UtilModule extends BaseModule {
    public embedColor: ColorResolvable = 'Blue';
    public errorEmbedColor: ColorResolvable = 'Red';
    public prisma: PrismaClient = new PrismaClient();
    public client!: RecipleClient;
    public logger!: Logger;

    public onStart(client: RecipleClient): boolean {
        this.client = client;
        this.logger = client.logger.cloneLogger({ loggerName: 'UtilModule' });

        const configPath: string = path.join(cwd, 'config/util/config.yml');
        const config: UtilModuleConfig = yml.parse(this.createConfig<UtilModuleConfig>(configPath, {
            embedColor: 'Blue',
            errorEmbedColor: 'Red',
            mentionReactions: []
        }));

        this.embedColor = config.embedColor;
        this.errorEmbedColor = config.errorEmbedColor;

        this.client.on('recipleCommandExecute', data => {
            const isSlashCommand = SlashCommandBuilder.isSlashCommandBuilder(data.builder);
            const author = SlashCommandBuilder.isSlashCommandExecuteData(data)
                ? data.interaction.user
                : data.message.author;

            this.logger.debug(`${author.tag} (${author.id}): Executed a ${isSlashCommand ? 'slash' : 'message'} command "${data.builder.name}"`);
        });

        this.client.on('recipleCommandHalt', data => {
            this.logger.debug(`A command halt triggered for "${data.executeData.builder.name}": ${Object.keys(CommandHaltReason)[data.reason]}`);
        });

        this.client.on('messageCreate', async message => {
            if (!message.mentions.parsedUsers.has(client.user?.id || '')) return;
            if (message.author.bot || !message.content || !config.mentionReactions?.length) return;

            const emoji = getRandomKey<EmojiResolvable>(config.mentionReactions);
            await message.react(emoji).catch(this.logger.err);
        });

        return true;
    }

    public smallEmbed(text: string, useDescription: boolean = false, color: ColorResolvable = this.embedColor): EmbedBuilder {
        const embed = new EmbedBuilder().setColor(color);

        if (useDescription) {
            embed.setDescription(text);
        } else {
            embed.setAuthor({ name: text, iconURL: this.client.user?.displayAvatarURL() });
        }

        return embed;
    }

    public errorEmbed(text: string, useDescription: boolean = false): EmbedBuilder {
        return this.smallEmbed(text, useDescription, this.errorEmbedColor);
    }

    public async haltCommand(haltData: AnyCommandHaltData): Promise<true> {
        const repliable = this.isSlashCommandHalt(haltData) ? haltData.executeData.interaction : haltData.executeData.message;
        const replyBase = { ephemeral: true, failtIfNotExists: false };

        switch (haltData.reason) {
            case CommandHaltReason.Cooldown:
                repliable.reply({ ...replyBase, embeds: [this.errorEmbed(`**Wait** \`${ms((haltData.expireTime - Date.now()), { long: true })}\` **to execute this command**`, true)] });
                return true;
            case CommandHaltReason.Error:
                const replyOptions = { ...replyBase, embeds: [this.errorEmbed(`An error occured`)] };

                if (this.isSlashCommandHalt(haltData)) {
                    haltData.executeData.interaction.followUp(replyOptions);
                } else {
                    repliable.reply(replyOptions);
                }

                await anticrash.reportException(haltData.error).catch(() => {});
                return true;
            case CommandHaltReason.InvalidArguments:
                repliable.reply({ ...replyBase, embeds: [this.errorEmbed(`Invalid command argument${haltData.invalidArguments.length > 1 ? 's' : ''} ${haltData.invalidArguments.map(m => `\`${m.name}\``).join(' ')}`, true)] });
                return true;
            case CommandHaltReason.MissingArguments:
                repliable.reply({ ...replyBase, embeds: [this.errorEmbed(`Missing required argument${haltData.missingArguments.length > 1 ? 's' : ''} ${haltData.missingArguments.map(m => `\`${m.name}\``).join(' ')}`, true)] });
                return true;
            case CommandHaltReason.MissingBotPermissions:
                repliable.reply({ ...replyBase, embeds: [this.errorEmbed(`Not enough bot permissions`)] });
                return true;
            case CommandHaltReason.MissingMemberPermissions:
                repliable.reply({ ...replyBase, embeds: [this.errorEmbed(`You do not have enough permissions to execute this command`)] });
                return true;
        }
    }

    public isSlashCommandHalt(halt: AnyCommandHaltData): halt is SlashCommandHaltData {
        return SlashCommandBuilder.isSlashCommandExecuteData(halt.executeData);
    }

    public formatNumber(number: number): string {
        if (number >= 1000000000) return (number / 1000000000).toFixed(1).replace(/\.0$/, '') + 'B';
        if (number >= 1000000) return (number / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
        if (number >= 1000) return (number / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
        return String(number);
    }

    public getMentionId(user: UserResolvable|UserMention): string {
        return typeof user === 'string'
            ? user.match(/<@!?(\d{17,19})>/)?.[1] ?? user
            : user.id;
    }

    public async resolveMentionOrId(user: UserResolvable|UserMention): Promise<User|null> {
        const id = this.getMentionId(user);

        return this.client.users.cache.find(user => user.id === id || user.tag.toLowerCase() === id.toLowerCase()) ?? this.client.users.fetch(id).catch(() => null);
    }

    public sliceIntoChunks<T>(arr: T[], chunkSize: number) {
        const res: T[][] = [];

        for (let i = 0; i < arr.length; i += chunkSize) {
            const chunk = arr.slice(i, i + chunkSize);
            res.push(chunk);
        }

        return res;
    }

    public createConfig<T extends any>(configPath: string, defaultData: T): string {
        if (existsSync(configPath)) return readFileSync(configPath, 'utf8');

        const filename = path.extname(configPath);
        const data = typeof defaultData === 'object' && (filename == '.yml' || filename == '.yaml') ? yml.stringify(defaultData) : defaultData;

        mkdirSync(path.dirname(configPath), { recursive: true });
        writeFileSync(configPath, typeof data === 'object' ? JSON.stringify(data, null, 2) : `${data}`);
        if (existsSync(configPath)) return readFileSync(configPath, 'utf8');

        throw new Error(`Failed to create config file at ${configPath}`);
    }
}

export default new UtilModule();