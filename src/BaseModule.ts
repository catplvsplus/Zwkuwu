import { AnyCommandBuilder, AnyCommandData, RecipleClient, RecipleModule, RecipleModuleScript, RecipleModuleScriptUnloadData } from 'reciple';
import { AnyModuleInteractionHandler } from './utils/interactions.js';

export abstract class BaseModule implements RecipleModuleScript {
    public versions: string[] = ['^7'];
    public commands: (AnyCommandBuilder | AnyCommandData)[] = [];
    public interactions: AnyModuleInteractionHandler[] = [];

    public abstract onStart(client: RecipleClient, recipleModule: RecipleModule): boolean | Promise<boolean>;

    public onLoad(client: RecipleClient<boolean>, recipleModule: RecipleModule): void | Promise<void> {
        return void 0;
    }

    public onUnload(data: RecipleModuleScriptUnloadData): void | Promise<void> {
        return void 0;
    }
}