import { RecipleClient, SlashCommandBuilder } from 'reciple';
import { BaseModule } from '../BaseModule.js';
import { HiddenPlayerOptions, LoginOptions } from './HiddenPlayer/classes/HiddenPlayer.js';
import utility, { Logger } from './utility.js';
import { inlineCode } from 'discord.js';
import { ChildProcess, exec, fork, spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { path } from 'fallout-utility';

var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);

export interface HiddenPlayerConfig {
    enabled: boolean;
    bot: HiddenPlayerOptions;
    loginOptions: Partial<LoginOptions>;
}

export class HiddenPlayerModule extends BaseModule {
    public bot: ChildProcess = fork('./HiddenPlayer/bot.js', { cwd: path.join(__dirname) });
    public logger!: Logger;

    get config() { return utility.config.hiddenplayer; }

    public async onStart(client: RecipleClient<boolean>): Promise<boolean> {
        this.logger = client.logger.cloneLogger({ loggerName: 'HiddenPlayer' });
        this.commands = [
            new SlashCommandBuilder()
                .setName('hiddenplayer')
                .setDescription('Control some of HiddenPlayer\'s settings')
                .setRequiredMemberPermissions('Administrator')
                .addSubcommand(disconnect => disconnect
                    .setName('disconnect')
                    .setDescription('Disconnect HiddenPlayer')
                    .addStringOption(reason => reason
                        .setName('reason')
                        .setDescription('Disconnect reason')
                    )
                )
                .addSubcommand(reconnect => reconnect
                    .setName('reconnect')
                    .setDescription('Reconnect HiddenPlayer')
                )
                .addSubcommand(chat => chat
                    .setName('chat')
                    .setDescription('Send message to chat')
                    .addStringOption(message => message
                        .setName('message')
                        .setDescription('Message to send')
                        .setRequired(true)
                    )
                )
                .setExecute(async ({ interaction }) => {
                    const command = interaction.options.getSubcommand() as `${'re'|'dis'}connect`|'chat'|'ping';
                    const reason = interaction.options.getString('reason');

                    await interaction.deferReply({ ephemeral: true });

                    switch (command) {
                        case 'disconnect':
                            this.bot.send({ type: 'disconnect', reason: reason || null });
                            await interaction.editReply({ embeds: [utility.createSmallEmbed(`HiddenPlayer disconnected: ${inlineCode(reason || 'No reason')}`, { useDescription: true })] });
                            break;
                        case 'reconnect':
                            this.bot.send({ type: 'reconnect' });
                            await interaction.editReply({ embeds: [utility.createSmallEmbed(`HiddenPlayer reconnecting`)] });
                            break;
                        case 'chat':
                            this.bot.send({ type: 'chat', message: interaction.options.getString('message', true) });
                            await interaction.editReply({ embeds: [utility.createSmallEmbed(`Message sent to chat`)] });
                            break;
                    }
                })
        ];

        this.bot.stdout?.on('data', async msg => this.logger.log(msg.toString()));
        this.bot.stderr?.on('data', async msg => this.logger.err(msg.toString()));
        this.bot.on('message', async msg => `[Message] `+this.logger.log(msg.toString()));

        return true;
    }

    public async onLoad(client: RecipleClient<boolean>): Promise<void> {
        this.bot.send({ type: 'login' });
    }

    public async onUnload(reason: unknown, client: RecipleClient<true>): Promise<void> {
        this.bot.kill();
    }
}

export default new HiddenPlayerModule();