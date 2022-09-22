import { AnyCommandBuilder, AnyCommandData, RecipleClient, RecipleScript } from 'reciple';
import { AutocompleteInteractionEvent, InteractionEvent } from './tools/InteractionEvents';

export default abstract class BaseModule implements RecipleScript {
    public versions: string|string[] = ['^5.1.1'];
    public commands: (AnyCommandBuilder|AnyCommandData)[] = [];
    public interactionEventHandlers: (InteractionEvent|AutocompleteInteractionEvent)[] = [];

    public abstract onStart(client: RecipleClient<boolean>): boolean | Promise<boolean>;
}