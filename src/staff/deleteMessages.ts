import { ApplicationCommandType, ContextMenuCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { RecipleClient } from 'reciple';
import BaseModule from '../BaseModule';

export class DeleteMessagesModule extends BaseModule {
    public async onStart(client: RecipleClient<boolean>): Promise<boolean> {
        client.additionalApplicationCommands.push(
            new ContextMenuCommandBuilder()
                .setName('Remove messages under')
                .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
                .setType(ApplicationCommandType.Message)
        );

        return true;
    }
}

export default new DeleteMessagesModule();