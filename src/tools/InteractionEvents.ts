import { Awaitable, Interaction } from 'discord.js';
import { Logger } from 'fallout-utility';
import BaseModule from '../BaseModule';
import { RecipleClient} from 'reciple';

export enum InteractionEventType {
    ContextMenu,
    SelectMenu,
    Button,
    AutoComplete,
    ModalSubmit
}

export interface ComponentInteractionEvent {
    customId: string|((id: string) => Awaitable<boolean>);
    type: InteractionEventType.Button|InteractionEventType.ModalSubmit|InteractionEventType.SelectMenu;
    handle: (interaction: Interaction) => Awaitable<void>;
}

export interface CommandInteractionEvent {
    commandName: string|((name: string) => Awaitable<boolean>);
    type: InteractionEventType.AutoComplete|InteractionEventType.ContextMenu;
    handle: (interaction: Interaction) => Awaitable<void>;
}

export class InteractionEventsModule extends BaseModule {
    public logger!: Logger;

    public onStart(client: RecipleClient): boolean {
        this.logger = client.logger.cloneLogger({ loggerName: 'InteractionEvents' });

        return true;
    }

    public onLoad(client: RecipleClient) {
        client.on('interactionCreate', async interaction => {
            const handlers: (ComponentInteractionEvent|CommandInteractionEvent)[] = [];

            client.modules.forEach(m => handlers.push(...(m.script as BaseModule).interactionEventHandlers));

            for (const handler of handlers) {
                if (handler.type !== InteractionEventsModule.getInteractionEventType(interaction)) continue;

                if (handler.type == InteractionEventType.AutoComplete || handler.type == InteractionEventType.ContextMenu) {
                    await this.handleCommandInteraction(interaction, handler);
                } else if (handler.type == InteractionEventType.SelectMenu || handler.type == InteractionEventType.Button || handler.type == InteractionEventType.ModalSubmit) {
                    await this.handleComponentInteraction(interaction, handler);
                }
            }
        });
    }

    public async handleComponentInteraction(interaction: Interaction, handler: ComponentInteractionEvent): Promise<void> {
        if (interaction.isAutocomplete() || interaction.isChatInputCommand() || interaction.isContextMenuCommand()) return;
        if (
            typeof handler.customId === 'function'
                ? !handler.customId(interaction.customId)
                : handler.customId !== interaction.customId
        ) return;

        return handler.handle(interaction);
    }

    public async handleCommandInteraction(interaction: Interaction, handler: CommandInteractionEvent): Promise<void> {
        if (!interaction.isAutocomplete() && !interaction.isChatInputCommand() && !interaction.isContextMenuCommand()) return;
        if (
            typeof handler.commandName === 'function'
                ? !handler.commandName(interaction.commandName)
                : handler.commandName !== interaction.commandName
        ) return;

        return handler.handle(interaction);
    }

    public static getInteractionEventType(interaction: Interaction): InteractionEventType|null {
        if (interaction.isAutocomplete()) {
            return InteractionEventType.AutoComplete;
        } else if (interaction.isButton()) {
            return InteractionEventType.Button;
        } else if (interaction.isContextMenuCommand()) {
            return InteractionEventType.ContextMenu;
        } else if (interaction.isModalSubmit()) {
            return InteractionEventType.ModalSubmit;
        } else if (interaction.isSelectMenu()) {
            return InteractionEventType.SelectMenu;
        }

        return null;
    }
}

export default new InteractionEventsModule();