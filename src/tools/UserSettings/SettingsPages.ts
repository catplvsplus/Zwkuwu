import { ButtonPaginationBuilder, PaginationControllerType, PageResolvable } from '@falloutstudios/djs-pagination';
import { ActionRowBuilder, APIButtonComponentWithCustomId, ButtonBuilder, ButtonStyle, inlineCode, MessageActionRowComponentBuilder, normalizeArray, RestOrArray, SelectMenuComponentOptionData, StringSelectMenuBuilder } from 'discord.js';
import quismos from '../../fun/quismos';
import util from '../util';
import { UserSettings } from './UserSettings';

export class SettingsPages {
    readonly userSettings: UserSettings;

    constructor(userSettings: UserSettings) {
        this.userSettings = userSettings;
    }

    public allowSnipesSettings(): PageResolvable {
        const snipeCommand = this.userSettings.client.applicationCommands.get('snipe', normalizeArray((util.client.config.commands.slashCommand.guilds ?? []) as RestOrArray<string>).shift());

        return {
            embeds: [
                util.smallEmbed('Allow Snipes')
                    .setDescription(`Allows you to use ${snipeCommand?.id ? '</snipe:' + snipeCommand.id + '>' : inlineCode('/snipe')} and allows the bot to snipe your deleted messages.`)
            ],
            components: [
                this.toggleComponentBuilder({
                    customId: 'usersettings-allowsniping',
                    placeholder: `Enable/Disable message sniping`,
                    enabled: this.userSettings.allowSniping,
                    enableOption: `Enable message sniping & snipe command`,
                    disableOption: `Disable message sniping & snipe command`
                })
            ]
        };
    }

    public cleanDataOnLeave(): PageResolvable {
        return {
            embeds: [
                util.smallEmbed('Clean Data on Leave')
                    .setDescription(`Clears your snipes and will not save your user data when you leave the server. **Confessions and already sniped messages will not be remove**`)
            ],
            components: [
                this.toggleComponentBuilder({
                    customId: 'usersettings-cleandataonleave',
                    placeholder: `Enable/Disable saving member data on leave`,
                    enabled: this.userSettings.cleanDataOnLeave,
                    enableOption: `Don't save data on leave`,
                    disableOption: `Keep data in server on leave`
                })
            ]
        };
    }

    public allowSeasonalNicknames(): PageResolvable {
        return {
            embeds: [
                util.smallEmbed('Allow Seasonal Nicknames')
                    .setDescription(`Allow bot to edit your nickname. Example when christmas your nickname will have "🎄" prefix`)
            ],
            components: [
                this.toggleComponentBuilder({
                    customId: 'usersettings-allowseasonalnicknames',
                    placeholder: `Enable/Disable seasonal nicknames`,
                    enabled: this.userSettings.allowSeasonalNicknames,
                    enableOption: `Allow seasonal nicknames`,
                    disableOption: `Don't edit my nickname`
                })
            ]
        };
    }

    public toggleComponentBuilder(options: {
        customId: string;
        placeholder?: string;
        enabled?: boolean;
        enableOption: Omit<SelectMenuComponentOptionData, 'value' | 'default'>|string;
        disableOption: Omit<SelectMenuComponentOptionData, 'value' | 'default'>|string;
    }): ActionRowBuilder<MessageActionRowComponentBuilder> {
        return new ActionRowBuilder<MessageActionRowComponentBuilder>()
            .setComponents(
                new StringSelectMenuBuilder({ placeholder: options.placeholder })
                    .setCustomId(options.customId)
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
            );
    }

    public createPagination(): ButtonPaginationBuilder {
        const pagination = new ButtonPaginationBuilder({
            authorId: this.userSettings.id,
            onDisable: 'DisableComponents',
            pages: [
                () => this.allowSnipesSettings(),
                () => this.cleanDataOnLeave(),
                () => this.allowSeasonalNicknames()
            ],
            buttons: [
                {
                    builder: new ButtonBuilder()
                        .setCustomId('prev')
                        .setLabel('Previous')
                        .setStyle(ButtonStyle.Secondary),
                    type: PaginationControllerType.PreviousPage
                },
                {
                    builder: new ButtonBuilder()
                        .setCustomId('next')
                        .setLabel('Next')
                        .setStyle(ButtonStyle.Secondary),
                    type: PaginationControllerType.NextPage
                },
                {
                    builder: new ButtonBuilder()
                        .setCustomId('stop')
                        .setLabel('Stop Interaction')
                        .setStyle(ButtonStyle.Danger),
                    type: PaginationControllerType.Stop
                }
            ],
        });

        pagination.setCollectorOptions({
            filter: component => component.customId.startsWith('usersettings-') || pagination.buttons.some(b => (b.builder.data as APIButtonComponentWithCustomId).custom_id === component.customId)
        });

        pagination.on('collect', async component => {
            if (!component.isStringSelectMenu() || component.user.id !== this.userSettings.id || !component.customId.startsWith('usersettings-')) return;
            if (!component.inCachedGuild()) return;

            const type = component.customId.split('-')[1];
            const enabled = component.values.shift() === 'enable';

            await component.deferReply({ ephemeral: true });

            switch (type) {
                case 'allowsniping':
                    await this.userSettings.update({
                        allowSniping: enabled
                    });

                    await component.editReply({ embeds: [util.smallEmbed(`${enabled ? 'Enabled' : 'Disabled'} message sniping & snipe command`)] });
                    break;
                case 'cleandataonleave':
                    await this.userSettings.update({
                        cleanDataOnLeave: enabled
                    });

                    await component.editReply({ embeds: [util.smallEmbed(`${enabled ? 'Clearing' : 'Saving'} member data on server leave`)] });
                    break;
                case 'allowseasonalnicknames':
                    await this.userSettings.update({
                        allowSeasonalNicknames: enabled
                    });

                    await (quismos.isQuismosSeason() && enabled ? quismos.setMemberNickname(component.member) : quismos.removeNickname(component.member))
                        .catch(() => {});

                    await component.editReply({ embeds: [util.smallEmbed(`${enabled ? 'Enabled' : 'Disabled'} seasonal nicknames`)] });
                    break;
            }

            pagination.collector?.resetTimer();
        });

        return pagination;
    }
}