import { RecipleClient, RecipleScript } from 'reciple';
import { Awaitable, Interaction } from 'discord.js';
import { Logger } from 'fallout-utility';
import BaseModule from '../BaseModule';

export enum InteractionEventType {
    ContextMenu,
    SelectMenu,
    Button,
    AutoComplete,
    ModalSubmit
}

export interface InteractionEvent {
    customId: string;
    type: Omit<InteractionEventType, 'AutoComplete'>;
    cached?: boolean;
    handle: (interaction: Interaction<this['cached'] extends true ? 'cached' : this['cached'] extends false ? 'raw' : 'cached'|'raw'>) => Awaitable<void>;
}

export interface AutocompleteInteractionEvent extends Omit<InteractionEvent, 'customId'> {
    commandName: string;
    type: InteractionEventType.AutoComplete;
}

export class InteractionEventsModule extends BaseModule {
    public logger!: Logger;

    public onStart(client: RecipleClient): boolean {
        this.logger = client.logger.cloneLogger({ loggerName: 'InteractionEvents' });

        return true;
    }

    public onLoad(client: RecipleClient) {
        client.on('interactionCreate', interaction => {
            const handlers = [...client.modules
                .map(m => m.script)
                .filter((m: RecipleScript) => (m as BaseModule).interactionEventHandlers
                    ?.some(i =>
                        i.type == InteractionEventsModule.getInteractionEventType(interaction)
                        &&
                        (
                            i.cached && interaction.inCachedGuild()
                            ||
                            i.cached === false && interaction.inRawGuild()
                            ||
                            i.cached === undefined
                        )
                    )
                )
                .map((m: RecipleScript) => (m as BaseModule).interactionEventHandlers)
            ];

            for (const handler of handlers) {
                if (!handler) continue;

                handler.forEach(h => {
                    try {
                        Promise.resolve(h.handle(interaction as Interaction<'cached'|'raw'>))
                            .catch(err => this.logger.err(err));
                    } catch (err) {
                        this.logger.err(err);
                    }
                });
            }
        });
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