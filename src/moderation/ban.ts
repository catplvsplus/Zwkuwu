import { RecipleClient, RecipleScript } from 'reciple';
import BaseModule from '../BaseModule';

export class BanModule extends BaseModule implements RecipleScript {
    public onStart(client: RecipleClient<boolean>): boolean {


        return true;
    }
}

export default new BanModule();