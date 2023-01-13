import { AnySelectMenuInteraction, AutocompleteInteraction, Awaitable, ButtonInteraction, ChatInputCommandInteraction, ContextMenuCommandInteraction, ModalSubmitInteraction } from 'discord.js';
import { BaseModule } from '../BaseModule.js';
import { RecipleClient } from 'reciple';
import Utility from './utility.js';

export interface BaseInteractionEvent<T> {
    type: 'Autocomplete'|'ContextMenu'|'ChatInput'|'Button'|'ModalSubmit'|'SelectMenu';
    handle: (interaction: T) => Awaitable<void>;
}

export interface BaseCommandInteractionEvent<T extends AutocompleteInteraction|ChatInputCommandInteraction|ContextMenuCommandInteraction> extends BaseInteractionEvent<T> {
    type: 'Autocomplete'|'ChatInput'|'ContextMenu';
    commandName: string|((commandName: string) => Awaitable<boolean>);
}

export interface BaseComponentInteractionEvent<T extends ButtonInteraction|ModalSubmitInteraction|AnySelectMenuInteraction> extends BaseInteractionEvent<T> {
    type: 'Button'|'ModalSubmit'|'SelectMenu';
    customId: string|((customId: string) => Awaitable<boolean>);
}

export interface AutocompleteInteractionEvent extends BaseCommandInteractionEvent<AutocompleteInteraction> { type: 'Autocomplete'; }
export interface ChatInputCommandInteractionEvent extends BaseCommandInteractionEvent<ChatInputCommandInteraction> { type: 'ChatInput'; }
export interface ContextMenuCommandInteractionEvent extends BaseCommandInteractionEvent<ContextMenuCommandInteraction> { type: 'ContextMenu'; }
export interface ButtonInteractionEvent extends BaseComponentInteractionEvent<ButtonInteraction> { type: 'Button'; }
export interface ModalSubmitInteractionEvent extends BaseComponentInteractionEvent<ModalSubmitInteraction> { type: 'ModalSubmit'; }
export interface SelectMenuInteractionEvent extends BaseComponentInteractionEvent<AnySelectMenuInteraction> { type: 'SelectMenu'; }

export type AnyCommandInteractionHandler = AutocompleteInteractionEvent|ChatInputCommandInteractionEvent|ContextMenuCommandInteractionEvent;
export type AnyComponentInteractionHandler = ButtonInteractionEvent|ModalSubmitInteractionEvent|SelectMenuInteractionEvent;
export type AnyModuleInteractionHandler = AnyCommandInteractionHandler|AnyComponentInteractionHandler;

export class InteractionHandlerModule extends BaseModule {
    public async onStart(client: RecipleClient<boolean>): Promise<boolean> {
        return true;
    }

    public async onLoad(client: RecipleClient<boolean>): Promise<void> {
        client.on('interactionCreate', async interaction => {
            let handlers: AnyModuleInteractionHandler[] = [];

            client.modules.modules.map(m => handlers.push(...(m.script as BaseModule).interactions));

            await Promise.all(handlers.map(async handler => {
                if (this.isCommandInteractionHandler(handler)) {
                    if (!interaction.isAutocomplete() && !interaction.isChatInputCommand() && !interaction.isContextMenuCommand()) return;
                    if (typeof handler.commandName === 'string' ? handler.commandName !== interaction.commandName : !handler.commandName(interaction.commandName)) return;
                } else if (this.isComponentInteractionHandler(handler)) {
                    if (!interaction.isButton() && !interaction.isModalSubmit() && !interaction.isAnySelectMenu()) return;
                    if (typeof handler.customId === 'string' ? handler.customId !== interaction.customId : !handler.customId(interaction.customId)) return;
                } else {
                    return;
                }

                switch (handler.type) {
                    case 'Autocomplete':
                        if (interaction.isAutocomplete()) return Promise.resolve(handler.handle(interaction)).catch(e => this.handleEventError(e));
                        break;
                    case 'ChatInput':
                        if (interaction.isChatInputCommand()) return Promise.resolve(handler.handle(interaction)).catch(e => this.handleEventError(e));
                        break;
                    case 'ContextMenu':
                        if (interaction.isContextMenuCommand()) return Promise.resolve(handler.handle(interaction)).catch(e => this.handleEventError(e));
                        break;
                    case 'Button':
                        if (interaction.isButton()) return Promise.resolve(handler.handle(interaction)).catch(e => this.handleEventError(e));
                        break;
                    case 'ModalSubmit':
                        if (interaction.isModalSubmit()) return Promise.resolve(handler.handle(interaction)).catch(e => this.handleEventError(e));
                        break;
                    case 'SelectMenu':
                        if (interaction.isAnySelectMenu()) return Promise.resolve(handler.handle(interaction)).catch(e => this.handleEventError(e));
                        break;
                }
            }));
        });
    }

    public handleEventError(error: Error): void {
        Utility.logger.error(error);
    }

    public isComponentInteractionHandler(maybeComponentInteractionHandler: any): maybeComponentInteractionHandler is AnyComponentInteractionHandler {
        return ['Button', 'ModalSubmit', 'SelectMenu'].includes(maybeComponentInteractionHandler.type) && maybeComponentInteractionHandler.customId !== undefined && maybeComponentInteractionHandler.handle !== undefined;
    }

    public isCommandInteractionHandler(maybeCommandInteractionHandler: any): maybeCommandInteractionHandler is AnyCommandInteractionHandler {
        return ['Autocomplete', 'ChatInput', 'ContextMenu'].includes(maybeCommandInteractionHandler.type) && maybeCommandInteractionHandler.commandName !== undefined && maybeCommandInteractionHandler.handle !== undefined;
    }
}

export default new InteractionHandlerModule();