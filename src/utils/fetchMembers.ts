import { RecipleClient } from 'reciple';
import { BaseModule } from '../BaseModule.js';
import { Logger } from './utility.js';

export class FetchMembersModule extends BaseModule {
    public logger?: Logger;

    public onStart(client: RecipleClient): boolean {
        this.logger = client.logger?.clone({ name: 'FetchMembers' });

        return true;
    }

    public async onLoad(client: RecipleClient) {
        this.logger?.warn(`Fetching guilds...`);
        await client.guilds.fetch()
            .then(guilds => this.logger?.warn(`Fetched ${guilds.size} guilds!`))
            .catch(err => this.logger?.err(`Error fetching guilds`, err));

        let fetchedMembers = 0;
        this.logger?.warn(`Fetching guild members...`);
        for (const guild of client.guilds.cache.toJSON()) {
            this.logger?.debug(`Fetching members of ${guild.name}`);

            await guild.members.fetch()
                .then(members => {
                    this.logger?.debug(`Fetched ${members.size} members from ${guild.name}`);

                    fetchedMembers = fetchedMembers + members.size;
                })
                .catch(err => this.logger?.err(`Error fetching members of ${guild.name}`, err));
        }

        this.logger?.log(`Fetched ${fetchedMembers} members from ${client.guilds.cache.size} guilds`);
    }
}

export default new FetchMembersModule();
