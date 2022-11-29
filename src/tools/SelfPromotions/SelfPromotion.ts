import { PrismaClient, SelfPromotions as PrismaSelfPromotions } from '@prisma/client';
import { If, Message, MessageCreateOptions, TextBasedChannel, User } from 'discord.js';
import { RecipleClient } from 'reciple';
import { SelfPromotionManagerModule } from '../selfPromotionManager';
import util from '../util';

export interface RawSelfPromotion extends PrismaSelfPromotions {}

export class SelfPromotion<Fetched extends boolean = boolean> implements RawSelfPromotion {
    private _id: string;
    private _authorId: string;
    private _author: User|null = null;
    private _content: string;
    private _createdAt: Date;
    private _approvedAt: Date|null;
    private _approvedById: string|null;
    private _approvedBy: User|null = null;
    private _approvedMessageId: string|null;
    private _approvedMessage: Message|null = null;
    private _approvedChannelId: string|null;
    private _approvedChannel: TextBasedChannel|null = null;
    private _deleted: boolean = false;

    readonly selfPromotionManagerModule: SelfPromotionManagerModule;
    readonly prisma: PrismaClient;
    readonly client: RecipleClient<true>;

    get deleted() { return this._deleted; }
    get id() { return this._id; }
    get authorId() { return this._authorId; }
    get author(): If<Fetched, User> { return this._author as If<Fetched, User>; }
    get content() { return this._content; }
    get createdAt() { return this._createdAt; }
    get approvedAt() { return this._approvedAt; }
    get approvedById() { return this._approvedById; }
    get approvedBy() { return this._approvedBy; }
    get approvedMessageId() { return this._approvedMessageId; }
    get approvedMessage() { return this._approvedMessage; }
    get approvedChannelId() { return this._approvedChannelId; }
    get approvedChannel() { return this._approvedChannel; }

    constructor(selfPromotionManagerModule: SelfPromotionManagerModule, rawSelfPromotion: RawSelfPromotion) {
        this.selfPromotionManagerModule = selfPromotionManagerModule;
        this.prisma = util.prisma;
        this.client = util.client;

        this._id = rawSelfPromotion.id;
        this._authorId = rawSelfPromotion.authorId;
        this._content = rawSelfPromotion.content;
        this._createdAt = rawSelfPromotion.createdAt;
        this._approvedAt = rawSelfPromotion.approvedAt;
        this._approvedById = rawSelfPromotion.approvedById;
        this._approvedMessageId = rawSelfPromotion.approvedMessageId;
        this._approvedChannelId = rawSelfPromotion.approvedChannelId;
    }

    public async fetch(): Promise<SelfPromotion<true>> {
        const data = await this.prisma.selfPromotions.findFirst({
            where: { id: this.id }
        });

        if (!data) {
            await this.delete()
            throw new Error(`No self promotion data from database`);
        }

        this._id = data.id;
        this._authorId = data.authorId;
        this._content = data.content;
        this._createdAt = data.createdAt;
        this._approvedAt = data.approvedAt;
        this._approvedById = data.approvedById;
        this._approvedMessageId = data.approvedMessageId;
        this._approvedChannelId = data.approvedChannelId;

        this._author = await this.client.users.fetch(this.authorId);
        this._approvedBy = this.approvedById ? await this.client.users.fetch(this.approvedById) : null;
        const approvedChannel = this.approvedChannelId ? await this.client.channels.fetch(this.approvedChannelId).catch(() => undefined) : null;

        if (approvedChannel === undefined || approvedChannel && !approvedChannel.isTextBased()) throw new Error('Cannot fetch self promotion approvedChannel');

        this._approvedChannel = approvedChannel;
        this._approvedMessage = this.approvedMessageId ? await approvedChannel?.messages.fetch(this.approvedMessageId) ?? null : null;

        return this as SelfPromotion<true>;
    }

    public async delete(): Promise<void> {
        await this.prisma.selfPromotions.delete({
            where: { id: this.id }
        });

        this._deleted = true;

        this.selfPromotionManagerModule.cache.sweep(s => s.deleted);
        await this.approvedMessage?.delete().catch(() => {});
    }

    public isFetched(): this is SelfPromotion<true> {
        return this.author !== null && (!this.approvedAt || this.approvedBy !== null && this._approvedMessage !== null && this._approvedChannel !== null);
    }

    public async approve(sendTo: TextBasedChannel, approvedBy: User, messageOptions?: Partial<MessageCreateOptions>): Promise<void> {
        if (!this.isFetched()) throw new Error('Self promotion is not fetched');

        const message = await sendTo.send({
            allowedMentions: {
                parse: ['users']
            },
            ...messageOptions,
            content: `${this}`
        });

        this._approvedAt = message.createdAt;
        this._approvedBy = approvedBy;
        this._approvedById = approvedBy.id;
        this._approvedChannel = sendTo;
        this._approvedChannelId = sendTo.id;
        this._approvedMessage = message;
        this._approvedMessageId = message.id;

        await this.prisma.selfPromotions.update({
            where: { id: this.id },
            data: {
                approvedAt: this.approvedAt,
                approvedById: this.approvedById,
                approvedChannelId: this.approvedChannelId,
                approvedMessageId: this.approvedMessageId
            }
        }).catch(async err => {
            await message.delete().catch(() => {});
            throw err;
        });
    }

    public toString(): string {
        return `**Author:** ${this.author}\n\n${this.content}`;
    }
}