import { AnyCommandBuilder, AnyCommandData, RecipleClient, RecipleScript } from 'reciple';
import { AnyModuleInteractionHandler } from './utils/interactions.js';

export abstract class BaseModule implements RecipleScript {
    public versions: string[] = ['^6'];
    public commands: (AnyCommandBuilder | AnyCommandData)[] = [];
    public interactions: AnyModuleInteractionHandler[] = [];

    public abstract onStart(client: RecipleClient): boolean | Promise<boolean>;

    public onLoad(client: RecipleClient<boolean>): void | Promise<void> {
        return void 0;
    }

    public onUnload(reason: unknown, client: RecipleClient<true>): void | Promise<void> {
        return void 0;
    }
}