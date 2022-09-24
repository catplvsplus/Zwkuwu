import { PlayerSkinData, PrismaClient } from '@prisma/client';
import { PlayerSkinModule } from '../playerSkin';
import { cwd, RecipleClient } from 'reciple';
import util from '../util';
import { createWriteStream, existsSync, rmSync } from 'fs';
import path from 'path';
import { Attachment, If } from 'discord.js';
import axios from 'axios';
import { pipeline } from 'stream/promises';
import { createCanvas, loadImage } from 'canvas';

export interface RawSkinData extends PlayerSkinData {}

export class SkinData<HasSkin extends boolean = boolean> implements RawSkinData {
    private _player: string;
    private _file: string|null;
    private _lastUpdatedAt: Date;
    private _createdAt: Date;
    private _deleted: boolean = false;

    readonly playerSkinModule: PlayerSkinModule;
    readonly prisma: PrismaClient;
    readonly client: RecipleClient<true>;

    get player() { return this._player; }
    get file(): If<HasSkin, string> { return this._file as If<HasSkin, string>; }
    get lastUpdatedAt() { return this._lastUpdatedAt; }
    get createdAt() { return this._createdAt; }
    get deleted() { return this._deleted; }
    get filePath(): If<HasSkin, string> { return (this.file ? path.join(cwd, 'config/playerSkinData/skins/', this.file) : null) as If<HasSkin, string>; }

    constructor(playerSkinModule: PlayerSkinModule, rawPlayerData: RawSkinData) {
        this.playerSkinModule = playerSkinModule;
        this.prisma = util.prisma;
        this.client = util.client;

        this._player = rawPlayerData.player;
        this._file = rawPlayerData.file;
        this._lastUpdatedAt = rawPlayerData.lastUpdatedAt;
        this._createdAt = rawPlayerData.createdAt;
    }

    public async fetch(): Promise<this> {
        const data = await this.prisma.playerSkinData.findFirst({
            where: {
                player: this.player
            }
        });

        if (!data) {
            await this.delete();
            throw new Error('Skin data is deleted');
        }

        this._player = data.player;
        this._file = data.file;
        this._lastUpdatedAt = data.lastUpdatedAt;
        this._createdAt = data.createdAt;

        return this;
    }

    public hasSkin(): this is SkinData<true> {
        return this.file !== null;
    }

    public async setSkin(fileData: Attachment): Promise<void> {
        if (this.hasSkin() && existsSync(this.filePath)) rmSync(this.filePath);
        if (fileData.contentType?.toLowerCase() !== 'image/png') throw new Error(`Invalid file type`);

        this._file = fileData.id + '.png';
        if (!this.hasSkin()) throw new Error('No skin data');

        const writeStream = createWriteStream(this.filePath, { encoding: 'binary' });
        const fileHttp = await axios({ url: fileData.url, method: 'GET', responseType: 'stream' });

        await pipeline(fileHttp.data, writeStream);
        await this.update();
    }

    public async removeSkin(): Promise<void> {
        if (this.hasSkin() && existsSync(this.filePath)) rmSync(this.filePath);
        this._file = null;

        await this.update();
    }

    public async update(): Promise<void> {
        await this.prisma.playerSkinData.update({
            data: {
                player: this.player,
                file: this.file,
                lastUpdatedAt: new Date()
            },
            where: {
                player: this.player
            }
        });

        await this.fetch();
    }

    public async delete(): Promise<void> {
        await this.prisma.playerSkinData.delete({
            where: {
                player: this.player
            }
        });

        if (this.hasSkin() && existsSync(this.filePath)) rmSync(this.filePath);

        this._deleted = true;
    }

    public async getHead(scale: number = 1): Promise<Buffer> {
        if (!this.hasSkin()) throw new Error('No skin file specified');

        const image = createCanvas(64, 64);

        image.width = scale * image.width;
        image.height = scale * image.height;

        const ctx = image.getContext('2d');
        const skin = await loadImage(this.filePath);

        ctx.patternQuality = "fast";
        ctx.drawImage(skin, 8, 8, 8, 8, 0, 0, image.width, image.height);
        ctx.drawImage(skin, 40, 8, 8, 8, 0, 0, image.width, image.height);

        return image.toBuffer();
    }
}