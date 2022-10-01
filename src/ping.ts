import { EmbedBuilder } from 'discord.js';
import { MessageCommandBuilder, RecipleClient, SlashCommandBuilder } from 'reciple';
import BaseModule from './BaseModule';
import util from './tools/util';
import ms from 'ms';

export class PingModule extends BaseModule {
    public async onStart(client: RecipleClient<boolean>): Promise<boolean> {
        this.commands = [
            new SlashCommandBuilder()
                .setName('ping')
                .setDescription('Show bot\'s ping')
                .setExecute(async data => {
                    await data.interaction.reply({ embeds: [this.getPing(client)] });
                }),
            new MessageCommandBuilder()
                .setName('ping')
                .setDescription('Show bot\'s ping')
                .setExecute(async data => {
                    await data.message.reply({ embeds: [this.getPing(client)] })
                })
        ];

        return true;
    }

    public getPing(client: RecipleClient<true>): EmbedBuilder {
        return util.smallEmbed(`Pong ┃ ${ms(client.ws.ping, { long: true })}`);
    }
}
{ long: true }
export default new PingModule();