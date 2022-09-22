import { ColorResolvable, EmbedBuilder } from 'discord.js';
import { AnyCommandHaltData, CommandHaltReason, cwd, RecipleClient, SlashCommandBuilder, SlashCommandHaltData } from 'reciple';
import BaseModule from '../BaseModule';
import { RecipleScriptWithInteractionEvents } from './InteractionEvents';
import ms from 'ms';
import path from 'path';
import yml from 'yaml';
import createConfig from '../_createConfig';

export interface UtilModuleConfig {
    embedColor: ColorResolvable;
    errorEmbedColor: ColorResolvable;
}

export class UtilModule extends BaseModule implements RecipleScriptWithInteractionEvents {
    public embedColor: ColorResolvable = 'Blue';
    public errorEmbedColor: ColorResolvable = 'Red';
    public client!: RecipleClient;

    public onStart(client: RecipleClient): boolean {
        this.client = client;

        const configPath: string = path.join(cwd, 'config/util/config.yml');
        const config: UtilModuleConfig = yml.parse(createConfig<UtilModuleConfig>(configPath, {
            embedColor: 'Blue',
            errorEmbedColor: 'Red'
        }));

        this.embedColor = config.embedColor;
        this.errorEmbedColor = config.errorEmbedColor;

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
}

export default new UtilModule();