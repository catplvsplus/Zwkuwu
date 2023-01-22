import { RecipleClient, SlashCommandBuilder } from 'reciple';
import { BaseModule } from '../BaseModule.js';
import { HiddenPlayer, HiddenPlayerOptions, LoginOptions } from './HiddenPlayer/HiddenPlayer.js';
import utility from './utility.js';
import { disconnect } from 'process';
import { inlineCode } from 'discord.js';
import ms from 'ms';

export interface HiddenPlayerConfig {
    enabled: boolean;
    bot: HiddenPlayerOptions;
    loginOptions: Partial<LoginOptions>;
}

export class HiddenPlayerModule extends BaseModule {
    public bot!: HiddenPlayer;

    get config() { return utility.config.hiddenplayer; }

    public async onStart(client: RecipleClient<boolean>): Promise<boolean> {

        this.bot = new HiddenPlayer(this.config.bot);
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
                .addSubcommand(ping => ping
                    .setName('ping')
                    .setDescription('Get bot latency')
                )
                .setExecute(async ({ interaction }) => {
                    const command = interaction.options.getSubcommand() as `${'re'|'dis'}connect`|'chat'|'ping';
                    const reason = interaction.options.getString('reason');

                    await interaction.deferReply({ ephemeral: true });

                    switch (command) {
                        case 'disconnect':
                            await this.bot.destroy(reason || undefined);
                            await interaction.editReply({ embeds: [utility.createSmallEmbed(`HiddenPlayer disconnected: ${inlineCode(reason || 'No reason')}`, { useDescription: true })] });
                            break;
                        case 'reconnect':
                            await this.bot.reconnect();
                            await interaction.editReply({ embeds: [utility.createSmallEmbed(`HiddenPlayer reconnecting`)] });
                            break;
                        case 'chat':
                            this.bot.bot?.chat(interaction.options.getString('message', true));
                            await interaction.editReply({ embeds: [utility.createSmallEmbed(`Message sent to chat`)] });
                            break;
                        case 'ping':
                            await interaction.editReply({ embeds: [utility.createSmallEmbed(`Bot ping ${inlineCode(ms(this.bot.bot?._client.latency ?? 0, { long: true }))}`, { useDescription: true })] });
                            break;
                    }
                })
        ];

        return true;
    }

    public async onLoad(client: RecipleClient<boolean>): Promise<void> {
        await this.bot.login(this.config.loginOptions);
    }
}

export default new HiddenPlayerModule();