import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ColorResolvable, EmbedBuilder, Message } from 'discord.js';
import { cwd, MessageCommandBuilder, RecipleClient, SlashCommandBuilder } from 'reciple';
import BaseModule from '../BaseModule';
import yml from 'yaml';
import { NewPingResult, ping } from 'minecraft-protocol';
import createConfig from '../_createConfig';
import path from 'path';
import util from '../tools/util';
import console from 'console';

export interface MinecraftIPConfig {
    servers: { host: string; port?: number; description?: string; }[];
    serverOnlineColor: ColorResolvable;
    serverOfflineColor: ColorResolvable;
    pingingServerColor: ColorResolvable;
}

interface ServerPingResult extends NewPingResult {
    status: string;
    online: boolean;
}

export class MinecraftIP extends BaseModule {
    public config: MinecraftIPConfig = MinecraftIP.getConfig();

    public async onStart(client: RecipleClient<boolean>): Promise<boolean> {
        this.commands = [
            new SlashCommandBuilder()
                .setName('ip')
                .setDescription('Ping minecraft server')
                .setExecute(async data => {
                    const interaction = data.interaction;
                    if (!interaction.inCachedGuild()) return;

                    await interaction.reply({ embeds: [ util.smallEmbed('Loading...') ] });
                    const message = await interaction.fetchReply();
                    if (!message) return;

                    const reply = await this.pingServers(message, true);
                    this.addCollector(reply, interaction.user.id);
                }),
            new MessageCommandBuilder()
                .setName('ip')
                .setDescription('Ping minecraft server')
                .setExecute(async data => {
                    const message = data.message;
                    const reply = await this.pingServers(message);
                    this.addCollector(reply, message);
                })
        ];

        return true;
    }

    public async pingServers(message: Message, edit: boolean = false): Promise<Message> {
        const embeds = this.config.servers.map(s => util.smallEmbed(`Pinging ┃ ${this.makeIP(s)}`).setColor(this.config.pingingServerColor));
        const reply = await (
            edit
                ? message.edit({ content: ' ', embeds, components: [] })
                : message.reply({ content: ' ', embeds, components: [] })
        );

        for (const server of this.config.servers) {
            const status = await this.getServerStatus(server.host, server.port ?? 25565);
            const embed = util.smallEmbed(`${status.online ? 'Online' : 'Offline'} ┃ ${this.makeIP(server)}`).setDescription(server.description || null);

            if (status.online) {
                embed.setColor(this.config.serverOnlineColor);
            } else {
                embed.setColor(this.config.serverOfflineColor);
            }

            embeds[this.config.servers.indexOf(server)] = embed;
            await reply.edit({ embeds });
        }

        await reply.edit({
            components: [
                new ActionRowBuilder<ButtonBuilder>()
                    .setComponents(
                        new ButtonBuilder()
                            .setCustomId('mcip-reload')
                            .setLabel('Reload')
                            .setStyle(ButtonStyle.Success),
                        new ButtonBuilder()
                            .setCustomId('mcip-delete')
                            .setLabel('Delete')
                            .setStyle(ButtonStyle.Secondary)
                    )
            ]
        });

        return reply;
    }

    public addCollector(message: Message, command?: Message|string): void {
        const collector = message.createMessageComponentCollector({
            filter: component => component.customId == 'mcip-delete' || component.customId == 'mcip-reload',
            time: 20000
        });

        let deleted = false;

        collector.on('collect', async interaction => {
            if (command && (typeof command == 'string' ? interaction.user.id !== command : interaction.user.id !== command.author.id)) {
                await interaction.reply({ embeds: [util.errorEmbed('This is not your command')], ephemeral: true });
                return;
            }

            if (!interaction.deferred) await interaction.deferUpdate();

            switch (interaction.customId) {
                case 'mcip-delete':
                    deleted = true;
                    await message.delete();
                    if (typeof command !== 'string') await command?.delete();
                    break;
                case 'mcip-reload':
                    await this.pingServers(message, true);
                    break;
            }

            collector.resetTimer();
        });

        collector.on('end', () => {
            if (!deleted) message.edit({ components: [] });
        });
    }

    public makeIP(data: { host: string; port?: number; }): string {
        return data.host + (data.port ? ':' + data.port : '');
    }

    public async getServerStatus(host: string, port: number) {
        const response = await ping({ host, port, closeTimeout: 5000 })
        .then(result => {
            const res = {
                ...result,
                status: !(result as NewPingResult).players?.max ? 'Offline' : 'Online',
                online: !(result as NewPingResult).players?.max ? false : true
            } as ServerPingResult;

            if (res.status == 'Offline') res.version.name = 'Unknown';
            return res;
        })
        .catch(() => {
            return {
                players: { max: 0, online: 0 },
                status: 'Error Pinging',
                version: {
                    name: 'Unknown',
                    protocol: 0
                },
                online: false
            }  as ServerPingResult;
        });

        return {
            players: { max: response.players?.max ?? 0, online: response.players?.online ?? 0 },
            status: response.status || 'Can\'t Connect',
            version: response.version.name,
            online: response.online
        };
    }

    public static getConfig(): MinecraftIPConfig {
        return yml.parse(createConfig(path.join(cwd, 'config/minecraftIP/config.yml'), <MinecraftIPConfig>({
            servers: [{
                host: 'play.ourmcworld.gq',
                port: 25565,
                description: ''
            }],
            pingingServerColor: 'Grey',
            serverOfflineColor: 'Red',
            serverOnlineColor: 'Green'
        })));
    }
}

export default new MinecraftIP();