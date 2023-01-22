import { randomUUID } from 'crypto';
import { If } from 'fallout-utility';
import minecraftProtocol from 'minecraft-protocol';
import { Bot, BotOptions, createBot } from 'mineflayer';
import { setTimeout } from 'timers/promises';
import srvStatus from '../../dev/srvStatus.js';

const { ping } = minecraftProtocol;

export interface HiddenPlayerOptions {
    host: string;
    port?: number;
    version?: string;
    authentication: {
        type: 'Mojang'|'Microsoft';
        password: string;
        email: string;
    }|{
        type: 'Offline';
        username: string;
    };
    firstMessages?: {
        messages: string[];
        messageTimeout?: number;
    };
    reconnect?: {
        enabled?: boolean;
        reconnectTimeout?: number;
    };
    leaveIfNotEmpty?: {
        enabled: boolean;
        pingInterval: number;
    }
}

export type LoginOptions = Omit<BotOptions, 'host'|'port'|'auth'|'username'|'password'>;

export class HiddenPlayer<Ready extends boolean = boolean> {
    private _bot: Bot|null = null;
    private _loginOptions?: LoginOptions;

    readonly id: string = randomUUID();
    readonly options: HiddenPlayerOptions;

    get bot() { return this._bot as If<Ready, Bot>; }

    constructor(options: HiddenPlayerOptions) {
        this.options = options;
    }

    public async login(options?: LoginOptions): Promise<HiddenPlayer<true>> {
        if (this.isReady()) throw new Error('Cannot create bot: Bot is already created');

        this._loginOptions = options;
        this._bot = createBot({
            ...(options ?? {}),
            host: this.options.host,
            port: this.options.port,
            version: this.options.version,
            ...(this.options.authentication.type === 'Offline'
                ? { username: this.options.authentication.username }
                : { auth: this.options.authentication.type.toLowerCase() as ('mojang'|'microsoft'), username: this.options.authentication.email, password: this.options.authentication.password }
            )
        });

        this._handleBotEvents();

        return this as HiddenPlayer<true>;
    }

    public async destroy(reason?: string): Promise<HiddenPlayer<boolean>> {
        if (!this.isReady()) return this;

        this.bot.end(reason ?? 'destroy');
        this._bot = null;

        return this;
    }

    public async reconnect(): Promise<HiddenPlayer<true>> {
        this.destroy('reconnect');

        if (this.options.reconnect?.reconnectTimeout) await setTimeout(this.options.reconnect.reconnectTimeout);
        this.login(this._loginOptions);

        return this as HiddenPlayer<true>;
    }

    public isReady(): this is HiddenPlayer<true> {
        return !!this._bot;
    }

    private _handleBotEvents(): void {
        if (!this.isReady()) throw new Error('Cannot listen to bot events: Bot not ready');

        this.bot.once('spawn', async () => {
            console.log(`Spawned!`);

            const isEmpty = await this._isServerEmpty();
            if (!isEmpty) return;

            for (const message of (this.options.firstMessages?.messages ?? [])) {
                if (!this.isReady()) break;
                this.bot?.chat(message);
                console.log(`Sent to chat: ${message}`)

                if (this.options.firstMessages?.messageTimeout) await setTimeout(this.options.firstMessages.messageTimeout);
            }
        });

        this.bot.on('end', async reason => {
            console.log(`Bot ended: ${reason}`);

            if (!this.options.reconnect?.enabled) return;
            if (['destroy', 'reconnect'].includes(reason)) return;

            if (reason === 'notEmpty') {
                await setTimeout(this.options.leaveIfNotEmpty?.pingInterval);
                await this._joinIfEmpty();
                return;
            }

            await this.reconnect();
        });
    }

    private async _isServerEmpty(): Promise<boolean> {
        const pingData = await ping(this.options).catch(() => null);

        let onlinePlayers = (srvStatus.isNewPingData(pingData) ? pingData.players.online : pingData?.playerCount) ?? 0;
            onlinePlayers = onlinePlayers - 1 >= 0 ? onlinePlayers - 1 : onlinePlayers;

        console.log(`isServerEmpty(): ${onlinePlayers}`);

        if (onlinePlayers > 0) {
            this.destroy('notEmpty');
            return true;
        }

        await this._isServerEmpty();
        return false;
    }

    private async _joinIfEmpty(): Promise<void> {
        if (!this.options.leaveIfNotEmpty?.enabled) return;

        const pingData = await ping(this.options).catch(() => null);
        const onlinePlayers = (srvStatus.isNewPingData(pingData) ? pingData.players.online : pingData?.playerCount);

        console.log(`joinIfEmpty(): ${onlinePlayers}`);

        if (onlinePlayers !== 0) {
            await setTimeout(this.options.leaveIfNotEmpty.pingInterval);
            return this._joinIfEmpty();
        }

        await this.login(this._loginOptions);
    }
}