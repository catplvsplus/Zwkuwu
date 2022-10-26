import { ButtonPagination, PageResolvable, PaginationControllerType } from '@ghextercortes/djs-pagination';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, inlineCode, MessageActionRowComponentBuilder, SelectMenuBuilder } from 'discord.js';
import util from '../util';
import { UserSettings } from './UserSettings';

export class SettingsPages {
    readonly userSettings: UserSettings;

    constructor(userSettings: UserSettings) {
        this.userSettings = userSettings;
    }

    public allowSnipesSettings(): PageResolvable {
        const snipeCommand = this.userSettings.client.applicationCommands.get('snipe');

        return {
            embeds: [
                util.smallEmbed('Allow Snipes')
                    .setDescription(`Allows you to use ${snipeCommand?.id ? '</snipe:' + snipeCommand.id + '>' : inlineCode('/snipe')} and allows the bot to snipe your deleted messages.`)
            ],
            components: [
                new ActionRowBuilder<MessageActionRowComponentBuilder>()
                    .setComponents(
                        new SelectMenuBuilder()
                            .setCustomId(`usersettings-allowsniping`)
                            .setMaxValues(1)
                            .setMinValues(1)
                            .setPlaceholder('Allow/Disable')
                            .setOptions(
                                {
                                    label: `Allow`,
                                    value: `enabled`,
                                    default: this.userSettings.allowSniping
                                },
                                {
                                    label: `Disabled`,
                                    value: `disabled`,
                                    default: !this.userSettings.allowSniping
                                }
                            )
                    )
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
                new ActionRowBuilder<MessageActionRowComponentBuilder>()
                    .setComponents(
                        new SelectMenuBuilder()
                            .setCustomId(`usersettings-cleandataonleave`)
                            .setMaxValues(1)
                            .setMinValues(1)
                            .setPlaceholder('Allow/Disable')
                            .setOptions(
                                {
                                    label: `Enable`,
                                    value: `enabled`,
                                    default: this.userSettings.cleanDataOnLeave
                                },
                                {
                                    label: `Disable`,
                                    value: `disabled`,
                                    default: !this.userSettings.cleanDataOnLeave
                                }
                            )
                    )
            ]
        };
    }

    public createPagination(): ButtonPagination {
        const pagination = new ButtonPagination({
            authorId: this.userSettings.id,
            onDisableAction: 'DeleteComponents',
            pages: [
                this.allowSnipesSettings(),
                this.cleanDataOnLeave()
            ],
            buttons: {
                buttons: [
                    {
                        button: new ButtonBuilder()
                            .setCustomId('prev')
                            .setLabel('Previous')
                            .setStyle(ButtonStyle.Secondary),
                        customId: 'prev',
                        type: PaginationControllerType.PreviousPage
                    },
                    {
                        button: new ButtonBuilder()
                            .setCustomId('next')
                            .setLabel('Next')
                            .setStyle(ButtonStyle.Secondary),
                        customId: 'next',
                        type: PaginationControllerType.NextPage
                    }
                ],
            }
        });

        pagination.collectorOptions = {
            filter: component => component.customId.startsWith('usersettings-') || pagination.buttons!.buttons.some(b => b.customId === component.customId)
        };

        pagination.on('collectorCollect', async component => {
            if (!component.isSelectMenu() || component.user.id !== this.userSettings.id || !component.customId.startsWith('usersettings-')) return;

            const type = component.customId.split('-')[1];
            const enabled = component.values.shift() === 'enabled';

            await component.deferReply({ ephemeral: true });

            switch (type) {
                case 'allowsniping':
                    await this.userSettings.update({
                        allowSniping: enabled
                    });

                    await component.editReply({ embeds: [util.smallEmbed(`${enabled ? 'Allowing' : 'Disabled'} message sniping and snipe command`)] });

                    break;
                case 'cleandataonleave':
                    await this.userSettings.update({
                        cleanDataOnLeave: enabled
                    });

                    await component.editReply({ embeds: [util.smallEmbed(`${enabled ? 'Allowing' : 'Disabled'} clean member data on server leave`)] });

                    break;
            }
        });

        return pagination;
    }
}