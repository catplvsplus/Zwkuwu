import { MessageCommandBuilder, RecipleClient, SlashCommandBuilder } from 'reciple';
import { BaseModule } from '../BaseModule.js';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, Collection, ColorResolvable, GuildChannel, GuildChannelEditOptions, Message, MessageActionRowComponentBuilder, MessageComponentBuilder } from 'discord.js';
import utility from '../utils/utility.js';
import minecraftProtocol, { NewPingResult } from 'minecraft-protocol';

const { ping } = minecraftProtocol;

export interface SrvStatusConfig {
    servers: ({
        name?: string;
        description?: string;
        host: string;
        port?: number;
        statusChannel?: {
            channelId: string;
            onlineStatus: string|GuildChannelEditOptions;
            offlineStatus: string|GuildChannelEditOptions;
        }
    } & Partial<Omit<SrvStatusConfig, 'servers'>>)[];
    pingTimeout: number;
    updateIntervalMs: number;
    embedColor: {
        online: ColorResolvable;
        offline: ColorResolvable;
        pending: ColorResolvable;
    }
}

export type Server = SrvStatusConfig['servers'][0] & {
    statusChannel?: {
        channel: GuildChannel;
    } & SrvStatusConfig['servers'][0]['statusChannel'];
    status: 'Online'|'Offline';
    lastStatus?: Server['status'];
    updateInterval: NodeJS.Timer;
    lastPing?: {
        motd?: string;
        version?: string;
        latency?: number;
        players: {
            max: number;
            online: number;
        };
        pingAt: Date;
    };
};

export class SrvStatusModule extends BaseModule {
    readonly servers: Collection<string, Server> = new Collection();

    get config() { return utility.config.srvStatus; }

    public async onStart(client: RecipleClient<boolean>): Promise<boolean> {
        this.commands = [
            new SlashCommandBuilder()
                .setName('ip')
                .setDescription('View server status')
                .setExecute(async ({ interaction }) => {
                    await interaction.reply({ embeds: [utility.createSmallEmbed('Fetching servers...')] });
                    this.addCollector(await this.createServerStatusMessage(await interaction.fetchReply(), true));
                }),
            new MessageCommandBuilder()
                .setName('ip')
                .setDescription('View server status')
                .setExecute(async ({ message }) => {
                    this.addCollector(await this.createServerStatusMessage(message));
                })
        ];

        return true;
    }

    public async onLoad(client: RecipleClient<boolean>): Promise<void> {
        this.config.servers.map(async (server) => {
            const updateChannel = async () => {
                const data = await this.ping(server.host).catch(() => null);
                if (data === null || !data.statusChannel) return;
                if (data.lastStatus == data.status) return;

                const editData = data.status === 'Online' ? data.statusChannel.onlineStatus : data.statusChannel.offlineStatus;
                data.statusChannel.channel.edit(typeof editData === 'string' ? { name: editData } : editData);
            };

            this.servers.set(server.host, {
                ...server,
                status: 'Offline',
                updateInterval: setInterval(() => updateChannel(), server.updateIntervalMs ?? this.config.updateIntervalMs),
                statusChannel: server.statusChannel ? {
                    ...server.statusChannel,
                    channel: await utility.resolveFromCachedManager(server.statusChannel.channelId, client.channels) as GuildChannel,
                } : undefined
            });

            await updateChannel().catch(() => null);
        });
    }

    public async createServerStatusMessage(message: Message, edit: boolean = false): Promise<Message> {
        const pinging: [string, number][] = [];

        let index: number = 0;
        const embeds = this.servers.map((s, key) => {
            if (s.lastStatus === undefined) pinging.push([key, index]);

            index++;
            return utility.createSmallEmbed(`${s.lastStatus || 'Pinging'} ┃ ${this.makeIP(s)}`)
                .setColor(s.lastStatus == undefined
                    ? s.embedColor?.pending || this.config.embedColor.pending
                    : s.lastStatus === 'Online'
                        ? s.embedColor?.online || this.config.embedColor.online
                        : s.embedColor?.offline || this.config.embedColor.offline)
                .setFooter({ text: 'Last pinged' })
                .setTimestamp(s.lastPing?.pingAt);
        });
        const reply = await ( edit ? message.edit({ content: ' ', embeds, components: [] }) : message.reply({ content: ' ', embeds, components: [] }));

        for (const [key, index] of pinging) {
            const server = this.servers.get(key);
            if (!server) continue;

            const status = await this.ping(server.host);
            const embed = utility.createSmallEmbed(`${status.status === 'Online' ? 'Online' : 'Offline'} ┃ ${this.makeIP(server)}`).setDescription(server.description || null);

            if (server.name) embed.setTitle(server.name);

            if (status.status === 'Online') {
                embed.setColor(server.embedColor?.online || this.config.embedColor.online);
            } else {
                embed.setColor(server.embedColor?.offline || this.config.embedColor.offline);
            }

            embeds[index] = embed;
            await reply.edit({ embeds });
        }

        await reply.edit({
            components: [
                new ActionRowBuilder<MessageActionRowComponentBuilder>()
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
                await interaction.reply({ embeds: [utility.createSmallEmbed('This is not your command', { positive: false })], ephemeral: true });
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
                    await this.createServerStatusMessage(message, true);
                    break;
            }

            collector.resetTimer();
        });

        collector.on('end', () => {
            if (!deleted) message.edit({ components: [] });
        });
    }

    public async ping(srv: string): Promise<Server> {
        const server = this.servers.get(srv);
        if (!server) throw new Error('Cannot find server');

        const pingData = await ping({
            host: server.host,
            port: server.port ?? 25565,
            closeTimeout: server.pingTimeout || this.config.pingTimeout
        }).catch(err => {
            utility.logger?.debug(`Ping failed (${this.makeIP(server)}): ${String(err)}`);
            return null;
        });

        server.lastStatus = server.status;

        if (pingData === null) {
            server.status = 'Offline';
        } else {
            if (!this.isNewPingData(pingData)) {
                server.status = pingData.maxPlayers > 0 ? 'Online' : 'Offline',
                server.lastPing = {
                    pingAt: new Date(),
                    players: {
                        max: pingData.maxPlayers,
                        online: pingData.playerCount,
                    },
                    latency: 0,
                    motd: pingData.motd,
                    version: typeof pingData.version === 'string' ? pingData.version : (pingData.version as any).name
                };
            } else {
                server.status = pingData.players.max > 0 ? 'Online' : 'Offline',
                server.lastPing = {
                    pingAt: new Date(),
                    players: pingData.players,
                    latency: pingData.latency,
                    motd: typeof pingData.description === 'string' ? pingData.description : (pingData.description.text || ''),
                    version: pingData.version.name
                };
            }
        }

        this.servers.set(srv, server);
        return this.servers.get(srv)!;
    }

    public makeIP(data: { host: string; port?: number; }): string {
        return data.host + (data.port && data.port !== 25565 ? ':' + data.port : '');
    }

    public isNewPingData(pingData: any): pingData is NewPingResult {
        return typeof pingData?.latency === 'number' || typeof pingData?.enforcesSecureChat === 'boolean' || typeof pingData?.favicon === 'string';
    }
}

export default new SrvStatusModule();