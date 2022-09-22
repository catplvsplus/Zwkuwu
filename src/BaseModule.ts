import { AnyCommandBuilder, AnyCommandData, RecipleScript } from 'reciple';

export default class BaseModule implements Partial<RecipleScript> {
    public versions: string|string[] = ['^5.1.1'];
    public commands: (AnyCommandBuilder|AnyCommandData)[] = [];
}