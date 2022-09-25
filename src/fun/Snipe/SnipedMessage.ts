import { EmbedBuilder, If, TextBasedChannel, User } from 'discord.js';
import { PrismaClient, Snipes } from '@prisma/client';
import { SnipeModule } from '../snipe';
import { RecipleClient } from 'reciple';
import util from '../../tools/util';

export interface RawSnipedMessage extends Snipes {}

export class SnipedMessage<Fetched extends boolean = boolean> implements RawSnipedMessage {
    private _author: User|null = null;
    private _channel: TextBasedChannel|null = null;
    private _repliedToUser: User|null = null;
    private _deleted: boolean = false;
    private _id: string;
    private _authorId: string;
    private _channelId: string;
    private _content: string;
    private _edited: boolean;
    private _attachments: number;
    private _repliedToUserId: string | null;
    private _createdAt: Date;

    readonly sniper: SnipeModule;
    readonly client: RecipleClient<true>;
    readonly prisma: PrismaClient;

    get author(): If<Fetched, User> { return this._author as If<Fetched, User>; }
    get channel(): If<Fetched, TextBasedChannel> { return this._channel as If<Fetched, TextBasedChannel>; }
    get repliedToUser(): If<Fetched, User|null> { return this._repliedToUser as If<Fetched, User|null>; }
    get deleted(): boolean { return this._deleted; }
    get id() { return this._id; }
    get authorId() { return this._authorId; }
    get channelId() { return this._channelId; }
    get content() { return this._content; }
    get edited() { return this._edited; }
    get attachments() { return this._attachments; }
    get repliedToUserId() { return this._repliedToUserId; }
    get createdAt() { return this._createdAt; }

    constructor(sniper: SnipeModule, rawSnipedMessage: RawSnipedMessage) {
        this.sniper = sniper;
        this.client = util.client;
        this.prisma = util.prisma;

        this._id = rawSnipedMessage.id;
        this._authorId = rawSnipedMessage.authorId;
        this._channelId = rawSnipedMessage.channelId;
        this._content = rawSnipedMessage.channelId;
        this._edited = rawSnipedMessage.edited;
        this._attachments = rawSnipedMessage.attachments;
        this._repliedToUserId = rawSnipedMessage.repliedToUserId;
        this._createdAt = rawSnipedMessage.createdAt;
    }

    public async fetch(): Promise<SnipedMessage<true>> {
        const data = await this.prisma.snipes.findFirst({
            where: {
                id: this.id
            }
        });

        if (!data) {
            await this.delete()
            throw new Error(`No snipe data from database`);
        }

        this._authorId = data.authorId;
        this._channelId = data.channelId;
        this._content = data.content;
        this._edited = data.edited;
        this._attachments = data.attachments;
        this._repliedToUserId = data.repliedToUserId;
        this._createdAt = data.createdAt;

        const author = await this.client.users.fetch(this.authorId).catch(() => undefined);
        const channel = await this.client.channels.fetch(this.channelId).then(c => c && c.isTextBased() && !c.isDMBased() ? c : undefined ).catch(() => undefined);
        const repliedToUser = this.repliedToUserId ? await this.client.users.fetch(this.repliedToUserId).catch(() => undefined) : null;

        if (author === undefined) throw new Error(`Cannot fetch sniped message author`);
        if (channel === undefined) throw new Error(`Cannot fetch sniped message channel`);
        if (repliedToUser === undefined) throw new Error(`Cannot fetch sniped message replied to user`);

        this._author = author;
        this._channel = channel;
        this._repliedToUser = repliedToUser;

        if (!this.isFetched()) throw new Error(`Cannot fetch sniped message`);
        return this;
    }

    public isFetched(): this is SnipedMessage<true> {
        return !!this._author && !!this._channel;
    }

    public async edit(data: Partial<Omit<RawSnipedMessage, 'id'>>): Promise<this> {
        await this.prisma.snipes.upsert({
            create: {
                authorId: this.authorId,
                channelId: this.channelId,
                content: this.content,
                attachments: this.attachments,
                repliedToUserId: this.repliedToUserId,
                edited: this.edited,
                ...data,
                id: this.id
            },
            update: { ...data, id: this.id },
            where: { id: this.id }
        });

        await this.fetch();
        return this;
    }

    public toEmbed(): EmbedBuilder {
        if (!this.isFetched()) throw new Error('Sniped message is not fetched');

        return new EmbedBuilder()
            .setAuthor({ name: this.author.tag, iconURL: this.author.displayAvatarURL() })
            .setDescription(`${this.content + (this.edited ? ' (edited)' : '')}` || null)
            .setColor(util.embedColor)
            .setFields(
                this.attachments
                ? [{ name: `Attachments`, value: `Includes **${this.attachments}**`, inline: true }]
                : []
            )
            .setTimestamp();
    }

    public async delete(): Promise<void> {
        await this.prisma.snipes.delete({
            where: {
                id: this.id
            }
        });

        this._deleted = true;
        this.sniper.cache.sweep(s => s.deleted);
    }
}