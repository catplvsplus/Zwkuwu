import { RecipleClient } from 'reciple';
import { BaseModule } from '../BaseModule.js';
import utility, { Logger } from '../utils/utility.js';
import { Collection, Message, PartialMessage } from 'discord.js';
import axios from 'axios';
import { MinecraftIPCache } from '@prisma/client';
import { replaceAll } from 'fallout-utility';

export type FetchIPStatus = 'ok'|'error'|'warning'|'denied';

export interface PartialRawIP {
    proxy: 'yes'|'no';
    vpn: 'yes'|'no';
    type: 'Residential'|'Wireless'|'Business'|'Hosting'|'TOR'|'SOCKS'|'SOCKS4'|'SOCKS4A'|'SOCKS5'|'SOCKS5H'|'Shadowsocks'|'HTTP'|'HTTPS'|'Compromised Server'|'Inference Engine'|'OpenVPN'|'VPN'|`whitelisted by ${string}`|`blacklisted by ${string}`;
}

export interface PlayerInfo {
    ip: string;
    port: number;
    username: string;
}

export interface AntiProxyConfig {
    token: string|null;
    consoleBotIds: string[];
    consoleChannelIds: string[];
    punishmentCommands: string[];
}

export class AntiProxyModule extends BaseModule {
    public logger?: Logger;
    public cache: Collection<string, Collection<string, PlayerInfo>> = new Collection();

    get config() { return utility.config.antiProxy; }
    get token() { return this.config.token || process.env.PROXYCHECK_TOKEN }

    public async onStart(client: RecipleClient<boolean>): Promise<boolean> {
        this.logger = client.logger?.clone({ name: 'AntiProxy' });

        return true;
    }

    public async onLoad(client: RecipleClient<boolean>): Promise<void> {
        client.on('messageCreate', async message => {
            if (!this.config.consoleBotIds.includes(message.author?.id!) || !this.config.consoleChannelIds.includes(message.channel.id)) return;
            if (!message.inGuild()) return;

            const players = this.parseMessage(message);
            const proxyBitches = await this.filterSuspiciousPlayers(message, players);

            await this.punishPlayers(message, proxyBitches);
        });

        client.on('messageUpdate', async (oldMessage, message) => {
            if (!this.config.consoleBotIds.includes(message.author?.id!) || !this.config.consoleChannelIds.includes(message.channel.id)) return;
            if (!message.inGuild()) return;

            const players = this.parseMessage(message);
            const proxyBitches = await this.filterSuspiciousPlayers(message, players);

            await this.punishPlayers(message, proxyBitches);
        });
    }

    public async isProxy(host: string): Promise<boolean> {
        const cached = await this.findCache({ host });
        if (cached) return cached.proxy;

        const raw = await this.fetchIP(host);
        if (raw) return raw.proxy === 'yes';

        return false;
    }

    public async findCache(query: Partial<MinecraftIPCache>): Promise<MinecraftIPCache|null> {
        const find = await utility.prisma.minecraftIPCache.findFirst({
            where: query
        });

        return find;
    }

    public async fetchIP(host: string): Promise<PartialRawIP> {
        const fetch: PartialRawIP = await axios<{ [ip: string]: PartialRawIP }>({
            url: `https://proxycheck.io/v2/${host}?key=${this.config.token || process.env.PROXY_TOKEN}&vpn=1`,
            method: 'GET',
            responseType: 'json'
        }).then(res => res.data[host]).catch(() => ({ proxy: 'no', vpn: 'no', type: 'HTTP' }));

        await utility.prisma.minecraftIPCache.upsert({
            update: {
                host,
                proxy: fetch?.proxy === 'yes' || fetch?.vpn === 'yes',
            },
            create: {
                host,
                proxy: fetch?.proxy === 'yes' || fetch?.vpn === 'yes',
            },
            where: { host }
        });

        return fetch;
    }

    public async punishPlayers(message: Message, players: PlayerInfo[]): Promise<void> {
        for (const player of players) {
            const commands = this.config.punishmentCommands.map(cmd => replaceAll(cmd, ['{player_name}', '{player_host}', '{player_port}'], [player.username, player.ip, String(player.port)]));

            for (const command of commands) {
                await message.channel.send(command).catch(err => this.logger?.err(`Cannot send message to channel ${message.channel.id}`, err));
            }

            this.addToCache(message.id, player);
            this.logger?.warn(`Punished ${player.username} [${player.ip}:${player.port}] for using VPN/Proxy`)
        }
    }

    public async filterSuspiciousPlayers(message: Message, players: PlayerInfo[]): Promise<PlayerInfo[]> {
        const suspiciousPlayers: PlayerInfo[] = [];

        for (const player of players) {
            if (this.cache.some((checkedPlayers, messageId) => messageId === message.id && checkedPlayers.some(checkedPlayer => checkedPlayer.ip === player.ip))) continue;

            const isProxy = await this.isProxy(player.ip);

            if (isProxy) {
                suspiciousPlayers.push(player);
                this.logger?.warn(`${player.username}[${player.ip}] is marked as suspicious connection`);
                continue;
            }

            this.addToCache(message.id, player);
        }

        return suspiciousPlayers;
    }

    public parseMessage(message: Message): PlayerInfo[] {
        const lines = message.content.split('\n');
        const players: PlayerInfo[] = [];

        for (const line of lines) {
            const words = line.split(' ');

            const ip = words.find(word => /\[(.*?)\]/g.test(word));
            const cleanedIP = ip ? ip.replace(/\[(.*?)\]/g, '$1').split('/')[1] ?? undefined : undefined;
            if (!cleanedIP || !ip || !utility.isValidIP(cleanedIP.split(':')[0])) continue;

            const username = words.find(name => name.endsWith(ip))?.replace(/\[(.*?)\]/g, '');
            if (!username) continue;

            const player: PlayerInfo = {
                ip: cleanedIP.split(':')[0],
                port: parseInt(cleanedIP.split(':')[1], 10),
                username
            };

            this.logger?.debug(`Player ${player.username}[${player.ip}] joined the game`);
            players.push(player);
        }

        return players;
    }

    public addToCache(messageId: string, player: PlayerInfo): this {
        if (!this.cache.get(messageId)) {
            this.cache.set(messageId, new Collection([[player.username, player]]));
        } else {
            this.cache.get(messageId)?.set(player.username, player);
        }

        return this;
    }
}

export default new AntiProxyModule();