import { RecipleClient, SlashCommandBuilder } from 'reciple';
import { BaseModule } from '../BaseModule.js';
import { DiscordScamLinks } from '@falloutstudios/djs-scam-links';
import utility from '../utils/utility.js';
import { EmbedBuilder, inlineCode } from 'discord.js';

export class AntiScamModule extends BaseModule {
    public scamLinks: DiscordScamLinks = new DiscordScamLinks();

    public async onStart(client: RecipleClient<boolean>): Promise<boolean> {
        this.commands = [
            new SlashCommandBuilder()
                .setName('scam-links')
                .setDescription('Manage scam links')
                .setRequiredMemberPermissions('ManageMessages')
                .addSubcommand(refresh => refresh
                    .setName('refresh')
                    .setDescription('Refresh scam domain cache')
                )
                .setExecute(async ({ interaction }) => {
                    const command = interaction.options.getSubcommand() as 'refresh';

                    await interaction.deferReply({ ephemeral: true });

                    switch (command) {
                        case 'refresh':
                            await this.scamLinks.refreshDomains();
                            await interaction.editReply({ embeds: [utility.createSmallEmbed(`Refreshed scam domain cache! ${this.scamLinks.allDomains.length} loaded`)] });
                            break;
                    }
                })
        ];

        await this.scamLinks.refreshDomains();
        await this.scamLinks.fetchDomainsFromUrl<{ domains: string[]; }>('https://raw.githubusercontent.com/nikolaischunk/discord-phishing-links/main/suspicious-list.json', {
            dataParser: data => data.domains
        });

        return true;
    }

    public async onLoad(client: RecipleClient<boolean>): Promise<void> {
        client.on('messageCreate', async message => {
            if (!message.inGuild() || message.author.bot) return;

            const match = this.scamLinks.getMatch(message.content);
            if (!match) return;

            await message.delete().catch(() => {});
            await message.channel.send({
                content: `Suspicious message from ${message.author}`,
                embeds: [
                    new EmbedBuilder()
                        .setAuthor({ name: `Anti sus links`, iconURL: message.member?.displayAvatarURL() })
                        .setDescription(`The url you sent contains ${inlineCode(match)} domain and is marked as suspicious <a:sussss:868475033088032769>`)
                        .setColor(utility.config.errorEmbedColor)
                ]
            });
        });
    }
}

export default new AntiScamModule();