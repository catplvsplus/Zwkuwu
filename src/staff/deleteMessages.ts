import { ApplicationCommandType, ContextMenuCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { RecipleClient } from 'reciple';
import BaseModule from '../BaseModule';
import { InteractionEventType } from '../tools/InteractionEvents';
import util from '../tools/util';

export class DeleteMessagesModule extends BaseModule {
    public async onStart(client: RecipleClient<boolean>): Promise<boolean> {
        this.interactionEventHandlers = [
            {
                type: InteractionEventType.ContextMenu,
                commandName: 'Prune msgs below',
                handle: async interaction => {
                    if (!interaction.inCachedGuild() || !interaction.isMessageContextMenuCommand()) return;

                    await interaction.deferReply({ ephemeral: true });

                    const target = interaction.targetMessage;
                    const channel = target.channel;
                    const messages = await channel.messages.fetch({ after: target.id });

                    if (!messages.size) {
                        await interaction.editReply({ embeds: [util.errorEmbed('No messages to delete')] });
                        return;
                    }

                    let failedToDelete = 0;

                    for (const message of messages.toJSON()) {
                        await message.delete().catch(() => { failedToDelete++; });
                    }

                    await interaction.editReply({
                        embeds: [
                            failedToDelete
                                ? util.errorEmbed(`Failed to delete \`${failedToDelete}\` & Successfuly deleted \`${messages.size - failedToDelete}\` messages`, true)
                                : util.smallEmbed(`Deleted \`${messages.size}\` messages`, true)
                        ]
                    });
                }
            }
        ];

        client.commands.additionalApplicationCommands.push(
            new ContextMenuCommandBuilder()
                .setName('Prune msgs below')
                .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
                .setType(ApplicationCommandType.Message)
        );

        return true;
    }
}

export default new DeleteMessagesModule();