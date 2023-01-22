import { randomUUID } from 'crypto';
import { Awaitable, If } from 'fallout-utility';
import minecraftProtocol from 'minecraft-protocol';
import { Bot, BotOptions, createBot } from 'mineflayer';
import { setTimeout } from 'timers/promises';
import srvStatus from '../../dev/srvStatus.js';
import { TypedEmitter } from 'tiny-typed-emitter';
import movement from 'mineflayer-movement';
import armorManager from 'mineflayer-armor-manager';
import pathfinder from 'mineflayer-pathfinder';
import pvp from 'mineflayer-pvp';

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
export type Entity = Bot["entity"];

export interface HiddenPlayerEvents {
    'reconnect': () => Awaitable<void>;
    'disconnect': (reason: string) => Awaitable<void>;
    'ready': () => Awaitable<void>;
    'message': (message: string) => Awaitable<void>;
}

export class HiddenPlayer<Ready extends boolean = boolean> extends TypedEmitter<HiddenPlayerEvents> {
    private _bot: Bot|null = null;
    private _loginOptions?: LoginOptions;

    readonly id: string = randomUUID();
    readonly options: HiddenPlayerOptions;

    get bot() { return this._bot as If<Ready, Bot>; }

    constructor(options: HiddenPlayerOptions) {
        super();

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

        // @ts-expect-error
        const movementPlugin = movement.getPlugin(new movement.heuristics.ProximityHeuristic(0.7), new movement.heuristics.ConformityHeuristic(0.4), new movement.heuristics.DistanceHeuristic(1, 6, 5), new movement.heuristics.DangerHeuristic(2, 2, 5, 0.2));

        this._bot.loadPlugin(movementPlugin);
        this._bot.loadPlugin(pvp.plugin);
        this._bot.loadPlugin(armorManager);
        this._bot.loadPlugin(pathfinder.pathfinder);

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

        this.emit('reconnect');
        return this as HiddenPlayer<true>;
    }

    public isReady(): this is HiddenPlayer<true> {
        return !!this._bot;
    }

    private _handleBotEvents(): void {
        if (!this.isReady()) throw new Error('Cannot listen to bot events: Bot not ready');

        let nearestMob: Entity|null = null;

        this.bot.once('spawn', async () => {
            this.emit('ready');

            for (const message of (this.options.firstMessages?.messages ?? [])) {
                if (!this.isReady()) break;
                this.bot?.chat(message);

                if (this.options.firstMessages?.messageTimeout) await setTimeout(this.options.firstMessages.messageTimeout);
            }

            await this._isServerEmpty();
        });

        this.bot.on('end', async reason => {
            this.emit('disconnect', reason);

            if (!this.options.reconnect?.enabled) return;
            if (['destroy', 'reconnect'].includes(reason)) return;

            if (reason === 'notEmpty') {
                await setTimeout(this.options.leaveIfNotEmpty?.pingInterval);
                await this._joinIfEmpty();
                return;
            }

            await this.reconnect();
        });

        this.bot.on('playerCollect', collector => {
            if (collector.username !== this.bot?.player.username) return;

            // @ts-expect-error
            this.bot?.armorManager.equipAll();
        });

        this.bot.on('time', async () => {
            nearestMob = this.bot?.nearestEntity(entity => entity.kind == "Hostile mobs") ?? null;

            if (!nearestMob) {
                await this.bot?.pvp.stop();
                return;
            }

            if (!this.bot?.pvp.target) {
                await this.bot?.pvp.attack(nearestMob);
                return;
            }

            if (nearestMob.uuid !== this.bot.pvp.target.uuid) {
                await this.bot.pvp.stop();
                await this.bot?.pvp.attack(nearestMob);
            }
        });

        this.bot.on('message', (message) => { this.emit('message', message.toString()); });
    }

    private async _isServerEmpty(): Promise<void> {
        if (!this.options.leaveIfNotEmpty?.enabled) return;

        const pingData = await ping(this.options).catch(() => null);

        let onlinePlayers = (srvStatus.isNewPingData(pingData) ? pingData.players.online : pingData?.playerCount) ?? 0;
            onlinePlayers = onlinePlayers - 1 >= 0 ? onlinePlayers - 1 : onlinePlayers;

        if (onlinePlayers > 0) {
            this.destroy('notEmpty');
            return;
        }

        return this._isServerEmpty();
    }

    private async _joinIfEmpty(): Promise<void> {
        if (!this.options.leaveIfNotEmpty?.enabled) return;

        const pingData = await ping(this.options).catch(() => null);
        const onlinePlayers = (srvStatus.isNewPingData(pingData) ? pingData.players.online : pingData?.playerCount);

        if (onlinePlayers !== 0) {
            await setTimeout(this.options.leaveIfNotEmpty.pingInterval);
            return this._joinIfEmpty();
        }

        await this.login(this._loginOptions);
    }
}