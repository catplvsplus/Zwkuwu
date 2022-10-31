import { ButtonPaginationBuilder, ButtonPaginationData, PaginationControllerType } from '@falloutstudios/djs-pagination';
import { ButtonBuilder, ButtonStyle, escapeCodeBlock, escapeInlineCode, PermissionResolvable, PermissionsBitField } from 'discord.js';
import { AnyCommandBuilder, CommandType, MessageCommandBuilder, RecipleClient } from 'reciple';
import BaseModule from '../BaseModule';
import util from './util';

export interface RawCommandUsage {
    type: CommandType;
    name: string;
    description: string;
    options: RawCommandOptionUsage[];
}

export interface RawCommandOptionUsage {
    name: string;
    description: string;
    required: boolean;
}

export class CommandUsage implements RawCommandUsage {
    public type: CommandType;
    public name: string;
    public description: string;
    public options: CommandOptionUsage[];

    constructor(usage: RawCommandUsage) {
        this.type = usage.type;
        this.name = usage.name;
        this.description = usage.description;
        this.options = usage.options.map(option => new CommandOptionUsage(option));
    }

    public toString(): string {
        return `${this.name} ${this.options.map(option => option.toString()).join(' ')}`;
    }
}

export class CommandOptionUsage implements RawCommandOptionUsage {
    public name: string;
    public description: string;
    public required: boolean;

    constructor(usage: RawCommandOptionUsage) {
        this.name = usage.name;
        this.description = usage.description;
        this.required = usage.required;
    }

    public toString(): string {
        return this.required ? `<${this.name}>` : `[${this.name}]`;
    }
}

export class CommandHelpModule extends BaseModule {
    public async onStart(client: RecipleClient<boolean>): Promise<boolean> {
        this.commands = [
            new MessageCommandBuilder()
                .setName('help')
                .setDescription('Get message commands help')
                .addOptions(filter => filter
                    .setName('filter')
                    .setDescription('Filter commands')
                    .setRequired(false)
                )
                .setExecute(async data => {
                    const message = data.message;
                    const filter = data.command.args.join(' ') || '';

                    let commands = this.parseCommandUsages(data.client.commands.messageCommands.toJSON(), message.member?.permissions.toArray());
                    const exactCommand = commands.find(command => filter && command.name === filter);

                    if (exactCommand) {
                        await message.reply({
                            embeds: [
                                util.smallEmbed(`${exactCommand.name}`)
                                    .setDescription(`Command: \`${escapeInlineCode(exactCommand.name)}\`\nUsage: \`${escapeInlineCode((data.client.config.commands.messageCommand.prefix || '') + exactCommand)}\``)
                                    .addFields(
                                        exactCommand.options.map(option => ({
                                            name: `${option.name} \`${option.required ? 'Required' : 'Optional'}\``,
                                            value: `\`${option.toString()}\` — ${option.description}`,
                                            inline: true
                                        }))
                                    )
                            ]
                        });

                        return;
                    }

                    await (this.createPagination(
                        commands.filter(command => !filter || (command.name.toLowerCase().includes(filter.toLowerCase()) || command.options.some(option => option.name.toLowerCase().includes(filter.toLowerCase())))),
                        { authorId: message.author }
                    )).paginate(message, 'ReplyMessage');
                })
        ];

        return true;
    }

    public parseCommandUsages(commands: AnyCommandBuilder[], requiredMemberPermissions?: PermissionResolvable[]): CommandUsage[] {
        return commands
            .filter(command => !command.requiredMemberPermissions.length || (requiredMemberPermissions?.length && new PermissionsBitField(requiredMemberPermissions).has(command.requiredMemberPermissions)))
            .map(command => {
                const options: CommandOptionUsage[] = command.options.map(option => {
                    const opt = option.toJSON();
                    return new CommandOptionUsage({
                        name: opt.name,
                        description: opt.description,
                        required: !!opt.required
                    });
                });

                return new CommandUsage({
                    type: command.type,
                    name: command.name,
                    description: command.description,
                    options
                });
            });
    }

    public createPagination(commands: CommandUsage[], options?: Partial<ButtonPaginationData>): ButtonPaginationBuilder {
        const pagination = new ButtonPaginationBuilder({
            buttons: [
                {
                    builder: new ButtonBuilder().setCustomId('prev').setLabel('Previous').setStyle(ButtonStyle.Secondary),
                    type: PaginationControllerType.PreviousPage
                },
                {
                    builder: new ButtonBuilder().setCustomId('next').setLabel('Next').setStyle(ButtonStyle.Secondary),
                    type: PaginationControllerType.NextPage
                },
            ],
            ...options
        });

        if (!commands.length) {
            pagination.addPages(
                util.errorEmbed('No commands found')
            );

            return pagination;
        }

        for (const chunk of util.sliceIntoChunks(commands, 5)) {
            pagination.addPages(
                util.smallEmbed('Help')
                .addFields(
                    ...chunk.map(command => ({
                        name: command.name,
                        value: `\`\`\`${escapeCodeBlock((command.type == CommandType.MessageCommand ? (util.client.config.commands.messageCommand.prefix || '!') : '/') + command.toString())}\`\`\``
                    }))
                )
            );
        }

        return pagination;
    }
}

export default new CommandHelpModule();