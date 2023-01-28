import { RecipleClient, SlashCommandBuilder } from 'reciple';
import { BaseModule } from '../BaseModule.js';
import { HiddenPlayerOptions, LoginOptions } from './HiddenPlayer/classes/HiddenPlayer.js';
import utility, { Logger } from './utility.js';
import { codeBlock, escapeCodeBlock, inlineCode } from 'discord.js';
import { ChildProcess, exec, fork, spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { limitString, path } from 'fallout-utility';
import { inspect } from 'util';

var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);

export interface HiddenPlayerConfig {
    enabled: boolean;
    bot: HiddenPlayerOptions;
    loginOptions: Partial<LoginOptions>;
}

export class HiddenPlayerModule extends BaseModule {
    public bot!: ChildProcess;
    public logged: string = '';
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
                .addSubcommand(logs => logs
                    .setName('logs')
                    .setDescription('Get bot logs')
                )
                .addSubcommand(respawn => respawn
                    .setName('respawn')
                    .setDescription('Respawn HiddeplPlayer child process')
                )
                .setExecute(async ({ interaction }) => {
                    const command = interaction.options.getSubcommand() as `${'re'|'dis'}connect`|'chat'|'ping'|'logs'|'respawn';
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
                        case 'logs':
                            await interaction.editReply({ embeds: [utility.createSmallEmbed('Latest logs').setDescription(codeBlock(escapeCodeBlock(this.logged)))] });
                            break;
                        case 'respawn':
                            const pid = await this.newChildProcess();
                            await interaction.editReply({ embeds: [utility.createSmallEmbed(`Started new child process: ${inlineCode('PID ' + pid)}`, { useDescription: true })] });
                    }
                })
        ];

        return true;
    }

    public async onLoad(client: RecipleClient<boolean>): Promise<void> {
        this.newChildProcess();
    }

    public async onUnload(reason: unknown, client: RecipleClient<true>): Promise<void> {
        this.bot.kill();
    }

    public addLogs(logs: string): this {
        logs = `${this.logged}\n${logs.trim()}`.trim();

        this.logged = logs.split('\n').slice(-20).join('\n');

        return this;
    }

    public async killChildProcess(signal?: number|NodeJS.Signals, timeout: number = 10000): Promise<boolean> {
        if (!this.bot || this.bot.killed || !this.bot.connected) return true;

        this.logger.warn(`Killing PID ${this.bot.pid}`);

        this.bot.removeAllListeners();
        this.bot.kill(signal);

        return await (new Promise((res, rej) => {
            let resolved = false;

            const timer = setTimeout(() => {
                resolved = true;
                res(false);
            }, timeout);

            do {
                if (resolved || this.bot.killed) break;
            } while(!this.bot.killed);

            if (!resolved && this.bot.killed) {
                resolved = true;
                clearTimeout(timer);
                res(true);
            }
        }));
    }

    public async newChildProcess(respawnSelf: boolean = true): Promise<number|undefined> {
        if (!await this.killChildProcess('SIGTERM')) throw new Error(`Couldn't kill PID ${this.bot.pid}`);

        this.bot = fork('./HiddenPlayer/bot.js', { cwd: path.join(__dirname) });

        this.logged = '';
        this.logger.warn(`HiddenPlayer child process PID: ${this.bot.pid}`);

        this.bot.stdout?.on('data', async msg => {
            this.addLogs(msg.toString());
            this.logger.log(msg.toString());
        });

        this.bot.stderr?.on('data', async msg => {
            this.addLogs(msg.toString());
            this.logger.err(msg.toString());
        });

        this.bot.on('error', async error => {
            this.addLogs(inspect(error));
            this.logger.err(error);
        });

        this.bot.on('message', async msg => {
            this.addLogs(msg.toString());
            this.logger.log(msg.toString());
        });

        this.bot.once('exit', () => {
            this.logger.warn(`Child process exited with exit code: ${this.bot.exitCode || 'unknown'}`, `Respawning child process...`);
            this.newChildProcess();
        });

        this.bot.send({ type: 'login' });

        return this.bot.pid;
    } 
}

export default new HiddenPlayerModule();