import { RecipleClient, SlashCommandBuilder } from 'reciple';
import { BaseModule } from '../BaseModule.js';
import { UserSettings } from '@prisma/client';
import utility from './utility.js';
import { ButtonPaginationBuilder, PageData, PageResolvable } from '@falloutstudios/djs-pagination';
import { APIButtonComponentWithCustomId, ActionRowBuilder, BaseMessageOptions, ButtonBuilder, ButtonStyle, ColorResolvable, EmbedBuilder, MessageActionRowComponentBuilder, SelectMenuComponentOptionData, StringSelectMenuBuilder, resolveColor } from 'discord.js';

export interface CreateSettingsPageOptions {
    name: string;
    description?: string;
    color?: ColorResolvable;
    customId: keyof UserSettings;
    placeholder?: string;
    enabled?: boolean;
    enableOption: Omit<SelectMenuComponentOptionData, 'value' | 'default'>|string;
    disableOption: Omit<SelectMenuComponentOptionData, 'value' | 'default'>|string;
}

export class UserSettingsModule extends BaseModule {

    public async onStart(client: RecipleClient<boolean>): Promise<boolean> {
        this.commands = [
            new SlashCommandBuilder()
                .setName('settings')
                .setDescription('Modify your bot settings')
                .setExecute(async ({ interaction }) => {
                    await interaction.deferReply({ ephemeral: true });

                    const pagination = await this.createSettingsPagination(interaction.user.id);
                    await pagination.paginate(interaction, 'EditMessage');
                })
        ];

        return true;
    }

    public async createSettingsPagination(userId: string): Promise<ButtonPaginationBuilder> {
        const pagination = new ButtonPaginationBuilder({
            authorId: userId,
            onDisable: 'DisableComponents',
            pages: [
                () => this.getPage(userId, 'allowSniping'),
                () => this.getPage(userId, 'cleanDataOnLeave'),
                () => this.getPage(userId, 'allowSeasonalNicknames'),
            ],
            buttons: [
                {
                    builder: new ButtonBuilder()
                        .setCustomId('prev')
                        .setLabel('Previous')
                        .setStyle(ButtonStyle.Secondary),
                    type: 'PreviousPage'
                },
                {
                    builder: new ButtonBuilder()
                        .setCustomId('next')
                        .setLabel('Next')
                        .setStyle(ButtonStyle.Secondary),
                    type: 'NextPage'
                },
                {
                    builder: new ButtonBuilder()
                        .setCustomId('stop')
                        .setLabel('Stop Interaction')
                        .setStyle(ButtonStyle.Danger),
                    type: 'Stop'
                }
            ],
        });

        pagination.setCollectorOptions({
            filter: component => component.customId.startsWith('usersettings-') || pagination.buttons.some(b => (b.builder.data as APIButtonComponentWithCustomId).custom_id === component.customId)
        });

        pagination.on('collect', async component => {
            if (!component.isStringSelectMenu() || component.user.id !== userId || !component.customId.startsWith('usersettings-')) return;
            if (!component.inCachedGuild()) return;

            const [id, key] = component.customId.split('-');
            const enabled = component.values[0] === 'enable';

            await component.deferReply({ ephemeral: true });

            await this.updateUserSettings(userId, {
                [key]: enabled
            });

            await component.editReply({ embeds: [utility.createSmallEmbed(`${enabled ? 'Enabled' : 'Disabled'} ${key}`)] });
        });

        return pagination;
    }

    public async fetchUserSettings(userId: string): Promise<UserSettings> {
        const data = await utility.prisma.userSettings.findFirst({ where: { id: userId } });
        return data === null ? this.updateUserSettings(userId) : data;
    }

    public async updateUserSettings(id: string, newData?: Partial<UserSettings>): Promise<UserSettings> {
        return utility.prisma.userSettings.upsert({
            create: { id },
            update: { ...newData, id },
            where: { id }
        });
    }

    public createSettingsPage(options: CreateSettingsPageOptions): PageData {
        return {
            embeds: [
                new EmbedBuilder({
                    color: resolveColor(options.color || utility.config.embedColor),
                    title: options.name,
                    description: options.description,
                })
            ],
            components: [
                new ActionRowBuilder<MessageActionRowComponentBuilder>()
                .setComponents(
                    new StringSelectMenuBuilder({ placeholder: options.placeholder })
                        .setCustomId(`usersettings-${options.customId}`)
                        .setMaxValues(1)
                        .setMinValues(1)
                        .setOptions(
                            {
                                ...(typeof options.enableOption === 'string' ? { label: options.enableOption } : options.enableOption),
                                value: 'enable',
                                default: options.enabled === true
                            },
                            {
                                ...(typeof options.disableOption === 'string' ? { label: options.disableOption } : options.disableOption),
                                value: 'disable',
                                default: options.enabled === false
                            }
                        )
                )
            ]
        };
    }

    public async getPage(userId: string, key: keyof UserSettings): Promise<PageData> {
        const settings = await this.fetchUserSettings(userId);
        const pages: { name: keyof UserSettings; options: CreateSettingsPageOptions; }[] = [
            {
                name: 'allowSniping',
                options: {
                    name: 'Allow Snipes',
                    description: 'Enable or disable sniping of your messages. *You\'re not allowed to use snipe command when message sniping is disabled*',
                    customId: 'allowSniping',
                    enabled: settings.allowSniping,
                    disableOption: {
                        label: 'Disable Snipes',
                        description: 'Disable message sniping and snipe command'
                    },
                    enableOption: {
                        label: 'Enable Snipes',
                        description: 'Enable message sniping and snipe command'
                    },
                }
            },
            {
                name: 'cleanDataOnLeave',
                options: {
                    name: 'Clean Data On Leave',
                    description: 'Enable or disable member data backup after leaving the server',
                    customId: 'cleanDataOnLeave',
                    enabled: settings.cleanDataOnLeave,
                    disableOption: {
                        label: 'Save member data on leave',
                        description: 'Saves your nickname & roles in case you comeback'
                    },
                    enableOption: {
                        label: 'Don\'t save data',
                        description: 'Don\'t save anything on leave'
                    },
                }
            },
            {
                name: 'allowSeasonalNicknames',
                options: {
                    name: 'Use seasonal nicknames',
                    description: 'Toggle seasonal nicknames. This will disable nickname changes by the bot',
                    customId: 'allowSeasonalNicknames',
                    enabled: settings.allowSeasonalNicknames,
                    disableOption: 'Don\'t change my nickname',
                    enableOption: 'Allow nickname changes',
                }
            },
        ];

        return this.createSettingsPage(pages.find(p => p.name === key)!.options);
    }
}

export default new UserSettingsModule();