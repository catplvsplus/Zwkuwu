import { RecipleClient, SlashCommandBuilder } from 'reciple';
import { BaseModule } from '../BaseModule.js';
import utility, { Logger } from './utility.js';
import { Request, Response } from 'express';
import { path, replaceAll } from 'fallout-utility';
import { PlayerSkinData } from '@prisma/client';
import axios from 'axios';
import { createCanvas, loadImage } from 'canvas';
import { AttachmentBuilder, GuildTextBasedChannel, Message, MessageCollector } from 'discord.js';

export interface MinecraftSkinsConfig {
    fallbackSkins: string;
    gameChatsChannelIds: string[];
    gameConsoleChannelIds: string[];
    messageUserApplicationIds: string[];
    routes: {
        cloudHost?: string;
        skin: string;
        head: string;
    }
}

export class MinecraftSkinsModule extends BaseModule {
    public logger!: Logger;
    public gameTextChannels: GuildTextBasedChannel[] = [];
    public gameConsoleChannels: GuildTextBasedChannel[] = [];

    get server() { return utility.express; }
    get config() { return utility.config.minecraftSkins; }

    public async onStart(client: RecipleClient<boolean>): Promise<boolean> {
        this.logger = client.logger.cloneLogger({ loggerName: 'MinecraftSkins' });

        this.server.get(path.join('/', this.config.routes.head, ':player/:scale?') as `${string}:player/:scale?`, async (req, res) => {
            const player: PlayerSkinData|null = await this.getPlayerSkinData(req.params.player);
            const scale = !isNaN(Number(req.params.scale)) ? Number(req.params.scale) : 1;
            if (scale > 300) return res.status(403).send({ error: 'Maximum scale exceeded' });

            const skinData = player?.skinData ? Buffer.from(player.skinData, 'base64') : undefined;
            return this.sendSkin(req, res, { type: 'head', buffer: skinData, filename: `${req.params.player}.png`, scale });
        });

        this.server.get(path.join('/', this.config.routes.skin, ':player') as `${string}:player`, async (req, res) => {
            const player: PlayerSkinData|null = await this.getPlayerSkinData(req.params.player);
            const skinData = player?.skinData ? Buffer.from(player.skinData, 'base64') : undefined;
            return this.sendSkin(req, res, { type: 'skin', buffer: skinData, filename: `${req.params.player}.png` });
        });

        return true;
    }

    public async onLoad(client: RecipleClient<boolean>): Promise<void> {
        for (const channelId of this.config.gameChatsChannelIds) {
            const channel = await utility.resolveFromCachedManager(channelId, client.channels).catch(() => null);
            if (!channel?.isTextBased() || channel.isDMBased()) continue;

            this.gameTextChannels.push(channel);
        }

        for (const channelId of this.config.gameConsoleChannelIds) {
            const channel = await utility.resolveFromCachedManager(channelId, client.channels).catch(() => null);
            if (!channel?.isTextBased() || channel.isDMBased()) continue;

            this.gameConsoleChannels.push(channel);
        }

        this.commands = [
            new SlashCommandBuilder()
                .setName('skin')
                .setDescription('Manage your Minecraft skin')
                .addSubcommand(remove => remove
                    .setName('remove')
                    .setDescription('Remove player skkin')
                    .addStringOption(player => player
                        .setName('player')
                        .setDescription('Player name')
                        .setRequired(true)
                    )
                )
                .addSubcommand(set => set
                    .setName('set')
                    .setDescription('Set player skin')
                    .addStringOption(player => player
                        .setName('player')
                        .setDescription('Player name')
                        .setRequired(true)
                    )
                    .addAttachmentOption(skin => skin
                        .setName('skin')
                        .setDescription('Skin file')
                        .setRequired(true)    
                    )
                )
                .addSubcommandGroup(view => view
                    .setName('view')
                    .setDescription('View skin')
                    .addSubcommand(avatar => avatar
                        .setName('avatar')
                        .setDescription('View skin avatar')
                        .addStringOption(player => player
                            .setName('player')
                            .setDescription('Player name')
                            .setRequired(true)
                        )
                    )
                    .addSubcommand(skin => skin
                        .setName('skin')
                        .setDescription('View skin image')
                        .addStringOption(player => player
                            .setName('player')
                            .setDescription('Player name')
                            .setRequired(true)
                        )
                    )
                )
                .setExecute(async ({ interaction }) => {
                    if (!interaction.inCachedGuild()) return;

                    const command = interaction.options.getSubcommand(true);
                    const playerName = interaction.options.getString('player', true);
                    const isAdmin = !!interaction.memberPermissions?.has('Administrator');

                    await interaction.deferReply();
                    let skinData = await this.getPlayerSkinData(playerName);
                    let skinBuffer = skinData?.skinData ? Buffer.from(skinData.skinData, 'base64') : await this.getFallbackSkin(playerName);

                    switch (command) {
                        case 'avatar':
                            if (!skinBuffer) {
                                await interaction.editReply({ embeds: [utility.createSmallEmbed('Cannot fetch skin data', { positive: false })] });
                                return;
                            }

                            const avatar = new AttachmentBuilder(await this.getHead(skinBuffer, 5), { name: `${playerName}-avatar.png` });
                            await interaction.editReply({
                                embeds: [
                                    utility.createSmallEmbed(`${playerName} ┃ Skin Avatar`)
                                    .setImage(`attachment://${playerName}-avatar.png`)
                                ],
                                files: [avatar]
                            });

                            return;
                        case 'skin':
                            if (!skinBuffer) {
                                await interaction.editReply({ embeds: [utility.createSmallEmbed('Cannot fetch skin data', { positive: false })] });
                                return;
                            }

                            const skin = new AttachmentBuilder(skinBuffer, { name: `${playerName}.png` });
                            await interaction.editReply({
                                embeds: [
                                    utility.createSmallEmbed(`${playerName} ┃ Skin`)
                                    .setImage(`attachment://${playerName}.png`)
                                ],
                                files: [skin]
                            });

                            return;
                    }

                    if (command !== 'set' && !skinData) {
                        await interaction.editReply({ embeds: [utility.createSmallEmbed('No player data found', { positive: false })] });
                        return;
                    }

                    if (!isAdmin && skinData?.authorizedUserId !== interaction.user.id) {
                        const key = crypto.randomUUID().split('-').shift()!;

                        await interaction.editReply({
                            embeds: [utility.createSmallEmbed(`Join the server and send \`${key}\` in chat to continue`)]
                        });

                        let allowed: boolean = false;
                        const collectors = this.gameTextChannels.map(c => new MessageCollector(c, {
                            maxProcessed: 1,
                            time: 20000,
                            filter: msg => {
                                const match = this.config.messageUserApplicationIds.includes(msg.author.id) && msg.author.username.toLowerCase() === playerName.toLowerCase() && msg.content.toLowerCase() === key.toLowerCase();
                                if (match) {
                                    collectors.forEach(c => c.ended ? c.stop() : null);
                                    allowed = true;
                                }

                                return match;
                            }
                        }));

                        while (!collectors.every(c => c.ended)) { /** */ }

                        if (!allowed) {
                            await interaction.editReply({
                                embeds: [utility.createSmallEmbed(`Key is not sent in time`, { positive: false })]
                            });
                            return;
                        }
                    }

                    const updateData = { username: playerName, authorizedUserId: interaction.user.id };

                    switch (command) {
                        case 'remove':
                            await utility.prisma.playerSkinData.upsert({ create: updateData, update: { ...updateData, skinData: null }, where: { username: playerName } });
                            await interaction.editReply({ embeds: [utility.createSmallEmbed(`Deleted ${skinData!.username} skin data`, { positive: false })] });
                            await this.sendCommandToConsole(`skin clear ${playerName}`).catch(() => null);
                            return;
                        case 'set':
                            const attachment = interaction.options.getAttachment('skin', true);

                            if ((attachment.height !== 64 && attachment.height !== 32) || attachment.width !== 64) {
                                await interaction.editReply({ embeds: [utility.createSmallEmbed('Invalid Minecraft skin size', { positive: false })] });
                                break;
                            }

                            skinBuffer = await utility.downloadBuffer(attachment.url, 'GET');

                            await utility.prisma.playerSkinData.upsert({
                                where: { username: playerName },
                                create: { ...updateData, skinData: skinBuffer ? skinBuffer.toString('base64') : null },
                                update: { ...updateData, skinData: skinBuffer ? skinBuffer.toString('base64') : null }
                            });

                            await interaction.editReply({ embeds: [utility.createSmallEmbed(`Updated ${playerName} skin data`)] });
                            await this.sendCommandToConsole(`skin set ${playerName} http://${this.config.routes.cloudHost || '127.0.0.1'}${this.config.routes.skin}/${playerName}`).catch(() => null);
                    }
                })
        ];
    }

    public async sendSkin(req: Request, res: Response, options: { type: 'head'; scale: number; buffer?: Buffer; filename: string; }|{ type: 'skin'; buffer?: Buffer; filename: string; }): Promise<void> {
        const skinBuffer = options.buffer ?? (req.params.player ? await this.getFallbackSkin(req.params.player).catch(() => null) : null);

        if (!skinBuffer) {
            res.status(404).send({ error: 'No skin data found' });
            return;
        }

        if (options.type === 'head') {
            this.skinImageHeaders(res, options.filename).send(await this.getHead(skinBuffer, options.scale));
        } else {
            this.skinImageHeaders(res, options.filename).send(skinBuffer);
        }
    }

    public async getPlayerSkinData(playername: string): Promise<PlayerSkinData|null> {
        return utility.prisma.playerSkinData.findFirst({ where: { username: playername } });
    }

    public async getFallbackSkin(player: string): Promise<Buffer|null> {
        const fileHttp = await axios({ url: replaceAll(this.config.fallbackSkins, '{playername}', player), method: 'GET', responseType: 'arraybuffer' }).catch(() => null);
        if (!fileHttp) return null;

        return Buffer.from(fileHttp.data);
    }

    public async getHead(data: Buffer|string, scale: number = 1): Promise<Buffer> {
        const image = createCanvas(64, 64);

        image.width = scale * image.width;
        image.height = scale * image.height;

        const ctx = image.getContext('2d');
        const skin = await loadImage(data);

        ctx.patternQuality = "fast";
        ctx.drawImage(skin, 8, 8, 8, 8, 0, 0, image.width, image.height);
        ctx.drawImage(skin, 40, 8, 8, 8, 0, 0, image.width, image.height);

        return image.toBuffer();
    }

    public async sendCommandToConsole(command: string): Promise<Message[]> {
        return Promise.all(this.gameConsoleChannels.map(async c => c.send(command)))
    }

    public skinImageHeaders(res: Response, filename: string): Response {
        res.contentType('image/png');
        res.set('Content-Disposition', `inline; filename="${filename}"`);
        res.set('Cache-Control', 'no-cache, no-store, must-revalidate');

        return res;
    }
}

export default new MinecraftSkinsModule();