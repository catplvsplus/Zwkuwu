import { ActionRowBuilder, ButtonBuilder, ButtonStyle, Collection, Message, PermissionResolvable, TextBasedChannel } from 'discord.js';
import { cwd, RecipleClient, SlashCommandBuilder } from 'reciple';
import BaseModule from '../BaseModule';
import { RawSelfPromotion, SelfPromotion } from './SelfPromotions/SelfPromotion';
import util from './util';
import yml from 'yaml';
import path from 'path';
import { setTimeout } from 'timers/promises';
import { InteractionEventType } from './InteractionEvents';

export interface SelfPromotionsConfig {
    promotionsChannel: string;
    pendingApprovalChannel: string;
    ignoreBots: boolean;
    requiredApproverPermisions: PermissionResolvable[];
}

export class SelfPromotionManagerModule extends BaseModule {
    public cache: Collection<string, SelfPromotion> = new Collection();
    public config: SelfPromotionsConfig = SelfPromotionManagerModule.getConfig();
    public pendingApprovalChannel?: TextBasedChannel;
    public promotionsChannel?: TextBasedChannel;

    public async onStart(client: RecipleClient<boolean>): Promise<boolean> {
        this.commands = [
            new SlashCommandBuilder()
                .setName('self-promotion')
                .setDescription('Manage self promotions')
                .setRequiredMemberPermissions(this.config.requiredApproverPermisions)
                .addSubcommand(approve => approve
                    .setName('approve')
                    .setDescription('Approve pending self promotion')
                    .addStringOption(selfpromotion => selfpromotion
                        .setName('selfpromotion')
                        .setDescription('Self promotion to approve')
                        .setAutocomplete(true)
                        .setRequired(true)
                    )
                )
                .addSubcommand(deny => deny
                    .setName('deny')
                    .setDescription('Deny pending self promotion')
                    .addStringOption(selfpromotion => selfpromotion
                        .setName('selfpromotion')
                        .setDescription('Self promotion to deny')
                        .setAutocomplete(true)
                        .setRequired(true)
                    )
                )
                .addSubcommand(preview => preview
                    .setName('preview')
                    .setDescription('Preview pending self promotion')
                    .addStringOption(selfpromotion => selfpromotion
                        .setName('selfpromotion')
                        .setDescription('Self promotion to preview')
                        .setAutocomplete(true)
                        .setRequired(true)
                    )
                )
                .setExecute(async data => {
                    const interaction = data.interaction;
                    const command = interaction.options.getSubcommand() as 'approve'|'deny'|'preview';
                    const selfPromotionId = interaction.options.getString('selfpromotion', true);

                    await interaction.deferReply({ ephemeral: true });

                    const promotion = await this.resolveSelfPromotion(selfPromotionId);

                    if (!promotion) {
                        await interaction.editReply({ embeds: [util.errorEmbed('No self promotion data found')] });
                        return;
                    }

                    switch (command) {
                        case 'preview':
                            interaction.editReply(promotion.toString());
                            return;
                        case 'approve':
                            if (!this.promotionsChannel) {
                                await interaction.editReply({ embeds: [util.errorEmbed('No promotions channel specified')] });
                                return;
                            }

                            if (promotion.approvedAt) {
                                await interaction.editReply({ embeds: [util.errorEmbed(`Already approved by **${promotion.approvedBy || 'Unknown User'}**`, true)] });
                                return;
                            }

                            await promotion.approve(this.promotionsChannel, interaction.user);
                            await interaction.editReply({ embeds: [util.smallEmbed('Self promotion approved')] });
                            return;
                        case 'deny':
                            await promotion.delete();
                            await interaction.editReply({ embeds: [util.smallEmbed('Self promotion denied')] });
                            return;
                    }
                })
        ];

        this.interactionEventHandlers = [
            {
                type: InteractionEventType.Button,
                customId: id => id.startsWith(`approve-selfpromotion`),
                handle: async interaction => {
                    if (!interaction.isButton()) return;

                    await interaction.deferReply({ ephemeral: true });
                    const promotionId = interaction.customId.split('-')[2];
                    const promotion = await this.resolveSelfPromotion(promotionId);

                    if (!promotion) {
                        await interaction.editReply({ embeds: [util.errorEmbed('No self promotion data found')] });
                        return;
                    }

                    if (!this.promotionsChannel) {
                        await interaction.editReply({ embeds: [util.errorEmbed('No promotions channel specified')] });
                        return;
                    }

                    if (this.config.requiredApproverPermisions && !interaction.memberPermissions?.has(this.config.requiredApproverPermisions)) {
                        await interaction.editReply({ embeds: [util.errorEmbed('No permissions')] });
                        return;
                    }

                    await interaction.message.delete();

                    if (promotion.approvedAt) {
                        await interaction.editReply({ embeds: [util.errorEmbed(`Already approved by **${promotion.approvedBy || 'Unknown User'}**`, true)] });
                        return;
                    }

                    await promotion.approve(this.promotionsChannel, interaction.user);
                    await interaction.editReply({ embeds: [util.smallEmbed(`Self promotion approved`)] });
                }
            },
            {
                type: InteractionEventType.Button,
                customId: id => id.startsWith(`deny-selfpromotion`),
                handle: async interaction => {
                    if (!interaction.isButton()) return;

                    await interaction.deferReply({ ephemeral: true });
                    const promotionId = interaction.customId.split('-')[2];
                    const promotion = await this.resolveSelfPromotion(promotionId);

                    if (!promotion) {
                        interaction.editReply({ embeds: [util.errorEmbed('No self promotion data found')] });
                        return;
                    }

                    if (this.config.requiredApproverPermisions && !interaction.memberPermissions?.has(this.config.requiredApproverPermisions)) {
                        await interaction.editReply({ embeds: [util.errorEmbed('No permissions')] });
                        return;
                    }

                    await interaction.message.delete();
                    await promotion.delete();
                    await interaction.editReply({ embeds: [util.smallEmbed(`Self promotion denied`)] });
                }
            },
            {
                type: InteractionEventType.AutoComplete,
                commandName: 'self-promotion',
                handle: async interaction => {
                    if (!interaction.isAutocomplete()) return;

                    const query = interaction.options.getFocused();
                    const data = await util.prisma.selfPromotions.findMany({
                        where: query
                            ? {
                                approvedAt: null,
                                id: {
                                    contains: query
                                },
                                OR: {
                                    content: {
                                        contains: query
                                    }
                                }
                            }
                            : {
                                approvedAt: null
                            },
                        orderBy: {
                            createdAt: 'desc'
                        },
                        take: 15
                    });

                    await interaction.respond(data.map(s => ({
                        name: s.id,
                        value: s.id
                    })));
                }
            }
        ];

        return true;
    }

    public async onLoad(client: RecipleClient<boolean>): Promise<void> {
        this.pendingApprovalChannel = await client.channels.fetch(this.config.pendingApprovalChannel).then(c => c?.isTextBased() ? c : undefined).catch(() => undefined);
        this.promotionsChannel = await client.channels.fetch(this.config.promotionsChannel).then(c => c?.isTextBased() ? c : undefined).catch(() => undefined);

        client.on('messageCreate', async message => {
            if (this.config.promotionsChannel !== message.channel.id) return;
            if (this.config.ignoreBots && message.author.bot) return;
            if (message.author.id === client.user?.id) return;

            await message.delete();

            if (!message.content) return;

            await this.addPendingPromotion(message);
            await message.channel.send({ embeds: [util.smallEmbed(`Your self promotion is pending for approval`)] }).then(async msg => {
                await setTimeout(5000);
                await msg.delete();
            });
        });

        client.on('messageDelete', async message => {
            if (this.config.promotionsChannel !== message.channel.id) return;

            const selfPromotion = await this.resolveSelfPromotion(message.id);

            await selfPromotion?.delete();
        });
    }

    public async addPendingPromotion(message: Message): Promise<SelfPromotion<true>> {
        const selfPromotion = await this.createSelfPromotion(message);
        if (!this.pendingApprovalChannel) return selfPromotion;

        await this.pendingApprovalChannel.send({
            embeds: [
                util.smallEmbed('Pending Self Promotion Approval')
                    .setDescription(selfPromotion.toString())
            ],
            components: [
                new ActionRowBuilder<ButtonBuilder>()
                    .setComponents(
                        new ButtonBuilder() 
                            .setCustomId(`approve-selfpromotion-${selfPromotion.id}`)
                            .setLabel(`Approve`)
                            .setStyle(ButtonStyle.Primary),
                        new ButtonBuilder()
                            .setCustomId(`deny-selfpromotion-${selfPromotion.id}`)
                            .setLabel(`Deny`)
                            .setStyle(ButtonStyle.Secondary)
                    )
            ]
        });

        return selfPromotion;
    }

    public async resolveSelfPromotion(id: string): Promise<SelfPromotion<true>|undefined> {
        return this.cache.get(id) ?? this.fetchSelfPromotion(id).catch(() => undefined);
    }

    public async fetchSelfPromotion(filter: string|Partial<RawSelfPromotion>, cache: boolean = true): Promise<SelfPromotion<true>> {
        const data = await util.prisma.selfPromotions.findFirstOrThrow({
            where: typeof filter === 'string'
                ? { id: filter }
                : filter
        });

        const selfPromotion = await (new SelfPromotion(this, data)).fetch();
        if (cache) this.cache.set(selfPromotion.id, selfPromotion);

        return selfPromotion;
    }

    public async createSelfPromotion(message: Message): Promise<SelfPromotion<true>> {
        const raw = {
            id: message.id,
            content: message.content,
            authorId: message.author.id,
            createdAt: message.createdAt
        };
        const data = await util.prisma.selfPromotions.upsert({
            update: raw,
            create: raw,
            where: { id: raw.id }
        });

        const selfPromotion = await (new SelfPromotion(this, data)).fetch();
        this.cache.set(selfPromotion.id, selfPromotion);

        return selfPromotion;
    }

    public static getConfig(): SelfPromotionsConfig {
        return yml.parse(util.createConfig(path.join(cwd, 'config/selfpromotions/config.yml'), <SelfPromotionsConfig>({
            pendingApprovalChannel: '000000000000000000',
            promotionsChannel: '000000000000000000',
            requiredApproverPermisions: ['ManageMessages'],
            ignoreBots: true
        })));
    }
}

export default new SelfPromotionManagerModule();