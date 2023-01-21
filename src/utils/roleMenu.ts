import { RecipleClient } from 'reciple';
import { BaseModule } from '../BaseModule.js';
import { ActionRowBuilder, BaseMessageOptions, Collection, GuildTextBasedChannel, Message, MessageActionRowComponentBuilder, Role, StringSelectMenuBuilder, inlineCode } from 'discord.js';
import utility, { DoNothing } from './utility.js';

export interface RoleMenuConfig {
    roleMenus: {
        label?: string;
        messageId: string;
        channelId: string;
        messageData: BaseMessageOptions|string;
        menu: {
            placeholder?: string;
            multiple?: boolean;
        };
        roles: {
            roleId: string;
            label?: string;
            emoji?: string;
            default?: boolean;
            description?: string;
        }[];
    }[];
}

export interface RoleMenu extends DoNothing<RoleMenuConfig['roleMenus'][0]> {
    message: Message;
    channel: GuildTextBasedChannel;
    messageData: BaseMessageOptions;
    roles: ({ role: Role; } & RoleMenuConfig['roleMenus'][0]['roles'][0])[];
}

export class RoleMenuModule extends BaseModule {
    public roleMenus: Collection<string, RoleMenu> = new Collection();

    get config() { return utility.config.roleMenu; }

    public async onStart(client: RecipleClient<boolean>): Promise<boolean> {
        this.interactions = [
            {
                type: 'SelectMenu',
                customId: 'rolemenu',
                handle: async interaction => {
                    if (!interaction.isStringSelectMenu() || !interaction.inCachedGuild()) return;

                    const member = interaction.member;
                    const message = interaction.message;
                    const roleMenu = this.roleMenus.get(message.id);
                    if (!roleMenu) return;

                    await interaction.deferReply({ ephemeral: true });

                    const removed: RoleMenu['roles'] = [];
                    const added: RoleMenu['roles'] = [];
                    const error: (RoleMenu['roles'][0] & { action: 'add'|'remove', reason: Error; })[] = [];

                    const roles: RoleMenu['roles'] = roleMenu.roles.filter(r => interaction.values.includes(r.roleId));
                    const notSelected: RoleMenu['roles'] = roleMenu.roles.filter(r => !interaction.values.includes(r.roleId));

                    for (const roleData of roles) {
                        if (!roleMenu.menu.multiple) await member.roles.remove(notSelected.map(r => r.role));

                        if (member.roles.cache.has(roleData.roleId)) {
                            await member.roles.remove(roleData.role)
                                .then(() => removed.push(roleData))
                                .catch(err => error.push({ ...roleData, action: 'remove', reason: err }));
                        } else {
                            await member.roles.add(roleData.role)
                                .then(() => added.push(roleData))
                                .catch(err => error.push({ ...roleData, action: 'add', reason: err }));
                        }
                    }

                    const addedMessage = added.length ? `Added ${added.map(r => r.role.toString()).join(' ')}\n` : '';
                    const removedMessage = removed.length ? `Removed ${removed.map(r => r.role.toString()).join(' ')}\n` : '';
                    const errorMessage = error.length ? `Error ${error.map(r => 'Can\'t ' + r.action + ' ' + r.role.toString()).join(' ')}\n` : '';

                    await interaction.editReply({
                        embeds: [
                            utility.createSmallEmbed(addedMessage + removedMessage + errorMessage, {
                                positive: !error.length,
                                useDescription: true
                            })
                        ]
                    });
                }
            }
        ];

        return true;
    }

    public async onLoad(client: RecipleClient<boolean>): Promise<void> {
        for (const roleMenuData of this.config.roleMenus) {
            const channel = await utility.resolveFromCachedManager(roleMenuData.channelId, client.channels);
            if (!channel?.isTextBased() || channel.isDMBased()) {
                utility.logger.err(`Invalid guild text based channel (${roleMenuData.channelId})`);
                continue;
            }

            const message = await utility.resolveFromCachedManager(roleMenuData.messageId, channel.messages);
            if (!message?.editable) {
                utility.logger.err(`Invalid bot message (${roleMenuData.messageId})`);
                continue;
            }

            const messageData = typeof roleMenuData.messageData == 'string' ? { content: roleMenuData.messageData } : roleMenuData.messageData;
            const selectMenu = new StringSelectMenuBuilder().setCustomId(`rolemenu`).setMinValues(1);

            if (roleMenuData.menu.multiple === false) selectMenu.setMaxValues(1);
            if (roleMenuData.menu.placeholder) selectMenu.setPlaceholder(roleMenuData.menu.placeholder);

            const roles: RoleMenu['roles'] = await Promise.all(roleMenuData.roles.map(async roleData => {
                const role = await utility.resolveFromCachedManager(roleData.roleId, channel.guild.roles);

                selectMenu.addOptions({
                    ...roleData,
                    label: roleData.label ?? role.name,
                    value: role.id
                });

                return {
                    ...roleData,
                    role
                };
            }));

            await message.edit({
                ...messageData,
                components: [
                    new ActionRowBuilder<MessageActionRowComponentBuilder>()
                        .setComponents(selectMenu)
                ]
            });

            this.roleMenus.set(message.id, {
                ...roleMenuData,
                messageData,
                channel,
                message,
                roles
            });
        }
    }
}

export default new RoleMenuModule();