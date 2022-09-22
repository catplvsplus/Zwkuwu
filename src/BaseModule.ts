import { AnyCommandBuilder, AnyCommandData, RecipleClient, RecipleScript } from 'reciple';
import { CommandInteractionEvent, ComponentInteractionEvent } from './tools/InteractionEvents';

export default abstract class BaseModule implements RecipleScript {
    public versions: string|string[] = ['^5.1.1'];
    public commands: (AnyCommandBuilder|AnyCommandData)[] = [];
    public interactionEventHandlers: (ComponentInteractionEvent|CommandInteractionEvent)[] = [];

    public abstract onStart(client: RecipleClient<boolean>): boolean | Promise<boolean>;
    public onLoad(client: RecipleClient<boolean>): void | Promise<void> {}
}