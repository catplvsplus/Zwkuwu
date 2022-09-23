import { MinecraftIPCache } from '@prisma/client';
import axios from 'axios';
import { Collection, GuildTextBasedChannel, Message } from 'discord.js';
import { Logger, replaceAll } from 'fallout-utility';
import { cwd, RecipleClient } from 'reciple';
import BaseModule from '../BaseModule';
import util from '../tools/util';
import yml from 'yaml';
import createConfig from '../_createConfig';
import path from 'path';

export type FetchIPStatus = 'ok'|'error'|'warning'|'denied';

export interface PartialRawIP {
    proxy: 'yes'|'no';
    type: 'Residential'|'Wireless'|'Business'|'Hosting'|'TOR'|'SOCKS'|'SOCKS4'|'SOCKS4A'|'SOCKS5'|'SOCKS5H'|'Shadowsocks'|'HTTP'|'HTTPS'|'Compromised Server'|'Inference Engine'|'OpenVPN'|'VPN'|`whitelisted by ${string}`|`blacklisted by ${string}`;
}

export interface CachedIP extends MinecraftIPCache {}

export interface Player {
    ip: string;
    port: number;
    name: string;
}

export interface AntiProxyModuleConfig {
    token?: string;
    consoleBotIds: string[];
    consoleChannelIds: string[];
    banIpCommand: `ban-ip $1 $2`;
    banCommand: `ban $1 $2`;
    banReason: string;
    afterBanMessages: string[];
}

export class AntiProxyModule extends BaseModule {
    public logger!: Logger;
    public checkedIPs: Collection<string, Player & { message: Message; proxy: boolean; }> = new Collection();
    public config: AntiProxyModuleConfig = AntiProxyModule.getConfig();

    public async onStart(client: RecipleClient<boolean>): Promise<boolean> {
        this.logger = client.logger.cloneLogger({ loggerName: 'AntiProxyModule' });

        if (!this.config.token && !process.env.PROXY_TOKEN) {
            this.logger.error('No token provided. Please set the PROXY_TOKEN environment variable.');
            return false;
        }

        return true;
    }

    public onLoad(client: RecipleClient<boolean>): void {
        client.on('messageCreate', async message => {
            if (!this.config.consoleBotIds.includes(message.author?.id!) || !this.config.consoleChannelIds.includes(message.channel.id)) return;
            if (!message.inGuild()) return;

            const players = this.parseMessage(message.content);
            const proxyBitches = await this.filterSuspiciousPlayers(players, message);

            await this.banPlayers(proxyBitches, message);
        });
        client.on('messageUpdate', async message => {
            if (!this.config.consoleBotIds.includes(message.author?.id!) || !this.config.consoleChannelIds.includes(message.channel.id)) return;
            if (!message.inGuild()) return;

            const players = this.parseMessage(message.content);
            const proxyBitches = await this.filterSuspiciousPlayers(players, message);

            await this.banPlayers(proxyBitches, message);
        });
    }

    public async banPlayers(players: Player[], message: Message) {
        for (const player of players) {
            this.logger?.warn(`Banned ${player.name} (${player.ip})`);
            await message.channel.send(this.config.banIpCommand.replace('$1', player.ip).replace('$2', this.config.banReason)).catch(err => this.logger.err(err));

            if (player.name) await message.channel.send(this.config.banCommand.replace('$1', player.name).replace('$2', this.config.banReason)).catch(err => this.logger.err(err));

            this.checkedIPs.set(player.ip, {
                ...player,
                message,
                proxy: true
            });

            for (const msg of this.config.afterBanMessages) {
                await message.channel.send(AntiProxyModule.messagePlaceholder(msg, player)).catch(err => this.logger.err(err));
            }
        }
    }

    public async filterSuspiciousPlayers(players: Player[], message: Message): Promise<Player[]> {
        const filteredPlayers: Player[] = [];

        for (const player of players) {
            if (this.checkedIPs.some((c, k) => c.message.id === message.id && k === player.ip)) continue;

            const isProxy = await this.isProxy(player.ip, player.port);

            if (isProxy) filteredPlayers.push(player);

            this.logger.warn(`${player.name}[${player.ip}] is marked as suspicious connection`);
        }

        return filteredPlayers;
    }

    public async isProxy(ip: string, port?: number): Promise<boolean> {
        const cached = await this.findCache({ host: ip, port });
        if (cached) return cached.proxy;

        const raw = await this.fetchIP(ip, port);
        if (raw) return raw.proxy === 'yes';

        return false;
    }

    public async findCache(query: Partial<CachedIP>): Promise<CachedIP|null> {
        const find = await util.prisma.minecraftIPCache.findFirst({
            where: query
        });

        return find;
    }

    public async fetchIP(ip: string, port?: number): Promise<PartialRawIP|null> {
        const fetch = await axios({
            url: `https://proxycheck.io/v2/${ip}?key=${this.config.token || process.env.PROXY_TOKEN}&vpn=1`,
            method: 'GET',
            responseType: 'json'
        }).then(res => res.data.status === 'ok' ? res.data[ip] as PartialRawIP : null).catch(() => null);
        if (!fetch) return null;

        await util.prisma.minecraftIPCache.create({
            data: {
                host: ip,
                port,
                proxy: fetch.proxy === 'yes',
            }
        });

        return fetch;
    }

    public parseMessage(message: string): Player[] {
        const lines = message.split('\n');
        const players = [];

        for (const line of lines) {
            const words = line.split(' ');

            const ip = words.find(word => /\[(.*?)\]/g.test(word));
            const cleanedIP = ip ? ip.replace(/\[(.*?)\]/g, '$1').split('/')[1] ?? undefined : undefined;
            if (!cleanedIP || !ip || !AntiProxyModule.isValidIP(cleanedIP.split(':')[0])) continue;

            const playername = words.find(name => name.endsWith(ip))?.replace(/\[(.*?)\]/g, '');
            if (!playername) continue;

            const player: Player = {
                ip: cleanedIP.split(':')[0],
                port: parseInt(cleanedIP.split(':')[1], 10),
                name: playername
            };

            this.logger.debug(`Player ${player.name}[${player.ip}] joined the game`);
            players.push(player);
        }

        this.logger.debug(`Found ${players.length} players`);

        return players;
    }

    public static messagePlaceholder(message: string, player: Player) {
        return replaceAll(message, ['{name}', '{ip}', '{port}'], [player.name ?? 'Unknown', player.ip, `${player.port}`]);
    }

    public static getConfig(): AntiProxyModuleConfig {
        return yml.parse(createConfig(path.join(cwd, 'config/antiproxy/config.yml'), <AntiProxyModuleConfig>({
            token: '',
            consoleBotIds: [],
            consoleChannelIds: [],
            banIpCommand: 'ban-ip $1 $2',
            banCommand: 'ban $1 $2',
            banReason: 'Your IP address was found using a proxy. This is not allowed for security reasons.',
            afterBanMessages: ['say {name} was detected using a proxy/vpn and has been banned.']
        })));
    }

    public static isValidIP(ip: string) {
        return /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(ip);
    }
}

export default new AntiProxyModule();